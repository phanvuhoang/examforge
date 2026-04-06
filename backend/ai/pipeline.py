import json
import logging
import uuid
from datetime import datetime
from typing import Any

import redis
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from ai.provider import call_ai
from ai.embeddings import get_single_embedding

logger = logging.getLogger(__name__)


def get_redis():
    return redis.Redis.from_url(settings.REDIS_URL)


def publish_sse(job_id: str, event: dict):
    r = get_redis()
    r.publish(f"job:{job_id}", json.dumps(event))


SYSTEM_PROMPT_QUESTION_GEN = """You are an expert exam question generator. Generate high-quality exam questions based on the provided context.

Output ONLY a JSON array of question objects. Each question object must have:
- "type": one of MC, MR, TF, FITB, MATCH, ORDER, NUM, SA, ESSAY
- "body_html": the question text in HTML
- "body_plain": plain text version
- "difficulty": "easy", "medium", or "hard"
- "explanation_html": explanation of the correct answer
- "points_default": point value (float)
- "options": array of option objects (for MC/MR/TF/MATCH/ORDER) with:
  - "body_html": option text
  - "is_correct": boolean
  - "display_order": integer
  - "partial_credit_pct": float (for MR)
- "correct_answer_json": the correct answer in the format specified for the type
- "language": the language code

For MC: exactly one option with is_correct=true, correct_answer_json={"option_index": 0}
For MR: multiple options with is_correct=true, correct_answer_json={"option_indices": [0,1]}
For TF: two options (True/False), correct_answer_json={"value": true/false}
For FITB: correct_answer_json={"accepted": ["answer1", "answer2"]}
For MATCH: options represent left items, correct_answer_json={"pairs": [{"left": "A", "right": "1"}]}
For ORDER: correct_answer_json={"order": ["first", "second", "third"]}
For NUM: correct_answer_json={"value": 42.5, "tolerance": 0.5}
For SA: correct_answer_json={"accepted": ["answer"], "graded": false}
For ESSAY: correct_answer_json={"rubric": "rubric text"}

Important: Generate exactly the requested number of questions per type. Ensure questions are accurate, clear, and well-formed."""

SYSTEM_PROMPT_QUALITY = """You are a quality analyst for exam questions. Evaluate each question on:
1. Clarity (is the question clear and unambiguous?)
2. Accuracy (is the correct answer actually correct?)
3. Difficulty alignment (does difficulty match the labeled level?)
4. Distractor quality (for MC/MR: are wrong options plausible but clearly wrong?)

Rate each question as "excellent", "good", or "needs_review".
Output a JSON array with objects: {"index": N, "quality_score": "...", "feedback": "..."}"""


async def step1_retrieve_context(
    db: AsyncSession,
    project_id: str,
    topic_filter: list[str] | None = None,
    chapter_filter: list[str] | None = None,
    job_id: str | None = None,
) -> list[str]:
    if job_id:
        publish_sse(job_id, {"type": "progress", "step": 1, "total": 5, "label": "Retrieving context..."})

    chunks = []

    if topic_filter:
        query_text = " ".join(topic_filter)
        try:
            embedding = await get_single_embedding(query_text)
            embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
            result = await db.execute(
                text("""
                    SELECT dc.content_text
                    FROM document_chunks dc
                    JOIN documents d ON dc.document_id = d.id
                    WHERE d.project_id = :project_id AND d.status = 'ready'
                    AND dc.embedding IS NOT NULL
                    ORDER BY dc.embedding <=> :embedding::vector
                    LIMIT 20
                """),
                {"project_id": project_id, "embedding": embedding_str},
            )
            rows = result.fetchall()
            chunks = [row[0] for row in rows]
        except Exception as e:
            logger.warning(f"Vector search failed, falling back to text search: {e}")

    if not chunks:
        result = await db.execute(
            text("""
                SELECT dc.content_text
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                WHERE d.project_id = :project_id AND d.status = 'ready'
                ORDER BY dc.chunk_index
                LIMIT 20
            """),
            {"project_id": project_id},
        )
        rows = result.fetchall()
        chunks = [row[0] for row in rows]

    return chunks


async def step2_create_questions(
    context_chunks: list[str],
    question_types: list[str],
    count_per_type: dict[str, int],
    difficulty_distribution: dict[str, float],
    language: str = "vi",
    include_explanation: bool = True,
    provider: str | None = None,
    model: str | None = None,
    job_id: str | None = None,
) -> list[dict]:
    if job_id:
        publish_sse(job_id, {"type": "progress", "step": 2, "total": 5, "label": "Generating questions..."})

    context_text = "\n\n---\n\n".join(context_chunks[:10])
    if len(context_text) > 15000:
        context_text = context_text[:15000]

    type_specs = []
    for qt in question_types:
        count = count_per_type.get(qt, 5)
        type_specs.append(f"- {qt}: {count} questions")

    diff_specs = []
    for diff, pct in difficulty_distribution.items():
        diff_specs.append(f"- {diff}: {pct * 100:.0f}%")

    user_prompt = f"""Based on the following context, generate exam questions.

Context:
{context_text}

Requirements:
- Language: {language}
- Include explanations: {include_explanation}
- Question types and counts:
{chr(10).join(type_specs)}
- Difficulty distribution:
{chr(10).join(diff_specs)}

Generate the questions now. Output ONLY a valid JSON array."""

    result = await call_ai(
        messages=[{"role": "user", "content": user_prompt}],
        system=SYSTEM_PROMPT_QUESTION_GEN,
        provider=provider,
        model=model,
    )

    content = result["content"]
    start = content.find("[")
    end = content.rfind("]") + 1
    if start >= 0 and end > start:
        content = content[start:end]

    try:
        questions = json.loads(content)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse AI response as JSON: {content[:500]}")
        questions = []

    for i, q in enumerate(questions):
        if job_id:
            publish_sse(job_id, {"type": "question_preview", "index": i, "question": q})

    return questions


async def step3_analyze_quality(
    questions: list[dict],
    provider: str | None = None,
    model: str | None = None,
    job_id: str | None = None,
) -> list[dict]:
    if job_id:
        publish_sse(job_id, {"type": "progress", "step": 3, "total": 5, "label": "Analyzing quality..."})

    if not questions:
        return []

    questions_json = json.dumps(questions, ensure_ascii=False, indent=2)
    if len(questions_json) > 15000:
        questions_json = questions_json[:15000]

    result = await call_ai(
        messages=[{"role": "user", "content": f"Evaluate these questions:\n{questions_json}"}],
        system=SYSTEM_PROMPT_QUALITY,
        provider=provider,
        model=model,
    )

    content = result["content"]
    start = content.find("[")
    end = content.rfind("]") + 1
    if start >= 0 and end > start:
        content = content[start:end]

    try:
        evaluations = json.loads(content)
    except json.JSONDecodeError:
        evaluations = [{"index": i, "quality_score": "good", "feedback": ""} for i in range(len(questions))]

    eval_map = {e.get("index", i): e for i, e in enumerate(evaluations)}

    for i, q in enumerate(questions):
        ev = eval_map.get(i, {"quality_score": "good"})
        q["quality_score"] = ev.get("quality_score", "good")

    return questions


def step4_filter_questions(
    questions: list[dict],
    quality_threshold: str = "needs_review",
    job_id: str | None = None,
) -> list[dict]:
    if job_id:
        publish_sse(job_id, {"type": "progress", "step": 4, "total": 5, "label": "Filtering questions..."})

    quality_ranks = {"excellent": 3, "good": 2, "needs_review": 1}
    min_rank = quality_ranks.get(quality_threshold, 1)

    filtered = []
    seen_bodies = set()
    for q in questions:
        rank = quality_ranks.get(q.get("quality_score", "good"), 2)
        if rank < min_rank:
            continue
        body = q.get("body_plain", q.get("body_html", "")).strip().lower()
        if body in seen_bodies:
            continue
        seen_bodies.add(body)
        filtered.append(q)

    return filtered


def step5_format_questions(
    questions: list[dict],
    project_id: str,
    job_id: str | None = None,
) -> list[dict]:
    if job_id:
        publish_sse(job_id, {"type": "progress", "step": 5, "total": 5, "label": "Formatting questions..."})

    formatted = []
    for q in questions:
        qtype = q.get("type", "MC").upper()
        valid_types = {"MC", "MR", "TF", "FITB", "MATCH", "ORDER", "NUM", "SA", "ESSAY", "TEXT"}
        if qtype not in valid_types:
            qtype = "MC"

        question_data = {
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "type": qtype,
            "body_html": q.get("body_html", ""),
            "body_plain": q.get("body_plain", ""),
            "correct_answer_json": q.get("correct_answer_json"),
            "explanation_html": q.get("explanation_html", ""),
            "points_default": q.get("points_default", 1.0),
            "difficulty": q.get("difficulty", "medium"),
            "ai_generated": True,
            "approved": False,
            "quality_score": q.get("quality_score", "good"),
            "shuffle_options": True,
            "language": q.get("language", "vi"),
            "options": q.get("options", []),
        }
        formatted.append(question_data)

        if job_id:
            publish_sse(job_id, {"type": "question", "question": question_data})

    return formatted


async def run_pipeline(
    db: AsyncSession,
    project_id: str,
    question_types: list[str],
    count_per_type: dict[str, int],
    difficulty_distribution: dict[str, float] | None = None,
    topic_filter: list[str] | None = None,
    chapter_filter: list[str] | None = None,
    language: str = "vi",
    include_explanation: bool = True,
    provider: str | None = None,
    model: str | None = None,
    job_id: str | None = None,
) -> list[dict]:
    if difficulty_distribution is None:
        difficulty_distribution = {"easy": 0.3, "medium": 0.5, "hard": 0.2}

    context_chunks = await step1_retrieve_context(db, project_id, topic_filter, chapter_filter, job_id)

    draft_questions = await step2_create_questions(
        context_chunks, question_types, count_per_type,
        difficulty_distribution, language, include_explanation,
        provider, model, job_id,
    )

    scored_questions = await step3_analyze_quality(draft_questions, provider, model, job_id)
    filtered_questions = step4_filter_questions(scored_questions, job_id=job_id)
    final_questions = step5_format_questions(filtered_questions, project_id, job_id)

    if job_id:
        publish_sse(job_id, {"type": "done", "total_generated": len(final_questions)})

    return final_questions
