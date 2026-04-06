import json
import uuid
import logging
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from config import settings
from database import get_db
from models import AIGenerationJob, Project, User
from auth import get_current_user, require_editor
from tasks.ai_generation import run_ai_generation

logger = logging.getLogger(__name__)
router = APIRouter(tags=["jobs"])


class GenerateQuestionsRequest:
    pass


@router.post("/api/projects/{project_id}/generate-questions")
async def trigger_generation(
    project_id: uuid.UUID,
    body: dict,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == user.org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    job = AIGenerationJob(
        id=uuid.uuid4(),
        project_id=project_id,
        status="pending",
        provider=body.get("ai_provider", settings.AI_DEFAULT_PROVIDER),
        model=body.get("ai_model", settings.AI_DEFAULT_MODEL),
        config_json=body,
    )
    db.add(job)
    await db.flush()

    run_ai_generation.delay(str(job.id), str(project_id), body)

    return {"job_id": str(job.id), "status": "pending"}


@router.get("/api/jobs/{job_id}/stream")
async def stream_job(job_id: str):
    async def event_generator():
        r = aioredis.from_url(settings.REDIS_URL)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"job:{job_id}")

        try:
            timeout_seconds = 300
            elapsed = 0
            check_interval = 0.5

            while elapsed < timeout_seconds:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=check_interval)
                if message and message["type"] == "message":
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    yield {"data": data}

                    try:
                        parsed = json.loads(data)
                        if parsed.get("type") in ("done", "error"):
                            break
                    except json.JSONDecodeError:
                        pass

                elapsed += check_interval

            yield {"data": json.dumps({"type": "timeout", "message": "Stream timed out"})}
        finally:
            await pubsub.unsubscribe(f"job:{job_id}")
            await pubsub.close()
            await r.close()

    return EventSourceResponse(event_generator())


@router.get("/api/jobs/{job_id}")
async def get_job_status(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AIGenerationJob).where(AIGenerationJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "id": str(job.id),
        "project_id": str(job.project_id),
        "status": job.status,
        "provider": job.provider,
        "model": job.model,
        "questions_generated": job.questions_generated,
        "tokens_used": job.tokens_used,
        "cost_usd": job.cost_usd,
        "error_msg": job.error_msg,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }
