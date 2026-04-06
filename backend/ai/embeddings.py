import logging
from typing import Optional

from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger(__name__)


async def get_embeddings(texts: list[str], model: Optional[str] = None) -> list[list[float]]:
    provider = settings.AI_EMBEDDING_PROVIDER
    model = model or settings.AI_EMBEDDING_MODEL

    if provider == "openai":
        return await _openai_embeddings(texts, model)
    elif provider == "ollama":
        return await _ollama_embeddings(texts, model)
    else:
        return await _openai_embeddings(texts, model)


async def _openai_embeddings(texts: list[str], model: str) -> list[list[float]]:
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set for embeddings")

    client_kwargs = {"api_key": api_key, "timeout": 60}
    if settings.OPENAI_BASE_URL:
        client_kwargs["base_url"] = settings.OPENAI_BASE_URL

    client = AsyncOpenAI(**client_kwargs)

    batch_size = 100
    all_embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        batch = [t[:8000] for t in batch]
        response = await client.embeddings.create(model=model, input=batch)
        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)

    return all_embeddings


async def _ollama_embeddings(texts: list[str], model: str) -> list[list[float]]:
    import httpx

    base_url = settings.OLLAMA_BASE_URL
    if not base_url:
        raise ValueError("OLLAMA_BASE_URL not set")

    all_embeddings = []
    async with httpx.AsyncClient(timeout=60) as client:
        for text in texts:
            response = await client.post(
                f"{base_url}/api/embeddings",
                json={"model": model, "prompt": text[:8000]},
            )
            response.raise_for_status()
            data = response.json()
            all_embeddings.append(data["embedding"])

    return all_embeddings


async def get_single_embedding(text: str, model: Optional[str] = None) -> list[float]:
    results = await get_embeddings([text], model)
    return results[0]
