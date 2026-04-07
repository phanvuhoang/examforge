import asyncio
import json
import logging
from typing import AsyncGenerator

import httpx
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic

from config import settings

logger = logging.getLogger(__name__)

PROVIDER_CONFIGS = {
    "openai": {
        "env_key": "OPENAI_API_KEY",
        "base_url_env": "OPENAI_BASE_URL",
        "default_model": "gpt-4o-mini",
    },
    "anthropic": {
        "env_key": "ANTHROPIC_API_KEY",
        "base_url_env": "ANTHROPIC_BASE_URL",
        "default_model": "claude-sonnet-4-20250514",
    },
    "openrouter": {
        "env_key": "OPENROUTER_API_KEY",
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "qwen/qwen3-235b-a22b-2507",
    },
    "deepseek": {
        "env_key": "DEEPSEEK_API_KEY",
        "base_url_env": "DEEPSEEK_BASE_URL",
        "default_model": "deepseek-chat",
    },
    "google": {
        "env_key": "GOOGLE_API_KEY",
        "default_model": "gemini-pro",
    },
    "ollama": {
        "base_url_env": "OLLAMA_BASE_URL",
        "default_model": "llama3",
    },
}


def _get_provider_key(provider: str) -> str | None:
    cfg = PROVIDER_CONFIGS.get(provider, {})
    env_key = cfg.get("env_key")
    if env_key:
        return getattr(settings, env_key, None)
    if provider == "ollama":
        return "ollama"
    return None


def _get_base_url(provider: str) -> str | None:
    cfg = PROVIDER_CONFIGS.get(provider, {})
    if "base_url" in cfg:
        return cfg["base_url"]
    env_attr = cfg.get("base_url_env")
    if env_attr:
        return getattr(settings, env_attr, None)
    return None


async def _call_openai_compatible(
    messages: list[dict],
    system: str = "",
    provider: str = "openai",
    model: str | None = None,
    max_tokens: int = 8000,
    temperature: float = 0.7,
    stream: bool = False,
    api_key: str | None = None,
    base_url: str | None = None,
) -> dict | AsyncGenerator:
    if not api_key:
        api_key = _get_provider_key(provider)
    if not base_url:
        base_url = _get_base_url(provider)
    if not model:
        model = PROVIDER_CONFIGS.get(provider, {}).get("default_model", "gpt-4o-mini")

    client_kwargs = {"api_key": api_key, "timeout": settings.AI_TIMEOUT_SECONDS}
    if base_url:
        client_kwargs["base_url"] = base_url

    client = AsyncOpenAI(**client_kwargs)

    all_messages = []
    if system:
        all_messages.append({"role": "system", "content": system})
    all_messages.extend(messages)

    extra_headers = {}
    if provider == "openrouter":
        extra_headers = {"HTTP-Referer": settings.FRONTEND_URL, "X-Title": "ExamForge AI"}

    kwargs = {
        "model": model,
        "messages": all_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": stream,
    }
    if extra_headers:
        kwargs["extra_headers"] = extra_headers

    if stream:
        async def stream_gen():
            resp = await client.chat.completions.create(**kwargs)
            full_content = ""
            async for chunk in resp:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    full_content += delta.content
                    yield {"type": "chunk", "content": delta.content}
            yield {
                "type": "done",
                "content": full_content,
                "usage": {"total_tokens": 0},
            }
        return stream_gen()

    response = await client.chat.completions.create(**kwargs)
    choice = response.choices[0]
    return {
        "content": choice.message.content,
        "usage": {
            "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
            "completion_tokens": response.usage.completion_tokens if response.usage else 0,
            "total_tokens": response.usage.total_tokens if response.usage else 0,
        },
        "model": response.model,
        "provider": provider,
    }


async def _call_anthropic(
    messages: list[dict],
    system: str = "",
    model: str | None = None,
    max_tokens: int = 8000,
    temperature: float = 0.7,
    stream: bool = False,
) -> dict | AsyncGenerator:
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")

    kwargs = {}
    if settings.ANTHROPIC_BASE_URL:
        kwargs["base_url"] = settings.ANTHROPIC_BASE_URL

    client = AsyncAnthropic(api_key=api_key, timeout=settings.AI_TIMEOUT_SECONDS, **kwargs)

    if not model:
        model = PROVIDER_CONFIGS["anthropic"]["default_model"]

    anthropic_messages = []
    for msg in messages:
        if msg["role"] in ("user", "assistant"):
            anthropic_messages.append(msg)

    if stream:
        async def stream_gen():
            full_content = ""
            async with client.messages.stream(
                model=model,
                messages=anthropic_messages,
                system=system,
                max_tokens=max_tokens,
                temperature=temperature,
            ) as resp:
                async for text in resp.text_stream:
                    full_content += text
                    yield {"type": "chunk", "content": text}
            final = await resp.get_final_message()
            yield {
                "type": "done",
                "content": full_content,
                "usage": {
                    "prompt_tokens": final.usage.input_tokens,
                    "completion_tokens": final.usage.output_tokens,
                    "total_tokens": final.usage.input_tokens + final.usage.output_tokens,
                },
            }
        return stream_gen()

    response = await client.messages.create(
        model=model,
        messages=anthropic_messages,
        system=system,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    return {
        "content": response.content[0].text,
        "usage": {
            "prompt_tokens": response.usage.input_tokens,
            "completion_tokens": response.usage.output_tokens,
            "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
        },
        "model": response.model,
        "provider": "anthropic",
    }


async def _call_google(
    messages: list[dict],
    system: str = "",
    model: str | None = None,
    max_tokens: int = 8000,
    temperature: float = 0.7,
    stream: bool = False,
) -> dict | AsyncGenerator:
    import google.generativeai as genai

    api_key = settings.GOOGLE_API_KEY
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not set")
    genai.configure(api_key=api_key)

    if not model:
        model = "gemini-pro"

    gen_model = genai.GenerativeModel(model, system_instruction=system if system else None)

    history = []
    last_content = ""
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        if msg == messages[-1] and role == "user":
            last_content = msg["content"]
        else:
            history.append({"role": role, "parts": [msg["content"]]})

    chat = gen_model.start_chat(history=history)
    response = chat.send_message(
        last_content,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        ),
    )
    return {
        "content": response.text,
        "usage": {"total_tokens": 0},
        "model": model,
        "provider": "google",
    }


async def call_ai(
    messages: list[dict],
    system: str = "",
    provider: str | None = None,
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    stream: bool = False,
) -> dict | AsyncGenerator:
    if max_tokens is None:
        max_tokens = settings.AI_MAX_TOKENS
    if temperature is None:
        temperature = settings.AI_TEMPERATURE

    provider = provider or settings.AI_DEFAULT_PROVIDER
    model = model or settings.AI_DEFAULT_MODEL

    chain = [provider] + [p for p in settings.fallback_chain_list if p != provider]

    last_error = None
    for attempt_provider in chain:
        api_key = _get_provider_key(attempt_provider)
        if not api_key and attempt_provider != "ollama":
            logger.debug(f"Skipping provider {attempt_provider}: no API key")
            continue

        attempt_model = model if attempt_provider == provider else PROVIDER_CONFIGS.get(attempt_provider, {}).get("default_model")

        for retry in range(2):
            try:
                if attempt_provider == "anthropic":
                    return await _call_anthropic(
                        messages=messages,
                        system=system,
                        model=attempt_model,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        stream=stream,
                    )
                elif attempt_provider == "google":
                    return await _call_google(
                        messages=messages,
                        system=system,
                        model=attempt_model,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        stream=stream,
                    )
                else:
                    return await _call_openai_compatible(
                        messages=messages,
                        system=system,
                        provider=attempt_provider,
                        model=attempt_model,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        stream=stream,
                    )
            except Exception as e:
                last_error = e
                error_str = str(e)
                logger.warning(f"Provider {attempt_provider} attempt {retry + 1} failed: {error_str}")

                if "401" in error_str or "403" in error_str:
                    break

                if "429" in error_str:
                    wait = 2 ** (retry + 1)
                    await asyncio.sleep(wait)
                    continue

                if retry == 0:
                    await asyncio.sleep(1)
                    continue
                break

    raise RuntimeError(f"All AI providers failed. Last error: {last_error}")
