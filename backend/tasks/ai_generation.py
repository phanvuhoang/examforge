import asyncio
import logging
import uuid
import json
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from config import settings
from ai.pipeline import run_pipeline, publish_sse
from tasks import celery_app

logger = logging.getLogger(__name__)


async def _run_generation(job_id: str, project_id: str, config: dict):
    from models import AIGenerationJob, Question, QuestionOption

    engine = create_async_engine(settings.DATABASE_URL, pool_size=5, max_overflow=2)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        await db.execute(
            update(AIGenerationJob)
            .where(AIGenerationJob.id == uuid.UUID(job_id))
            .values(status="running")
        )
        await db.commit()

        try:
            questions = await run_pipeline(
                db=db,
                project_id=project_id,
                question_types=config.get("question_types", ["MC"]),
                count_per_type=config.get("count_per_type", {"MC": 5}),
                difficulty_distribution=config.get("difficulty_distribution"),
                topic_filter=config.get("topic_filter"),
                chapter_filter=config.get("chapter_filter"),
                language=config.get("language", "vi"),
                include_explanation=config.get("include_explanation", True),
                provider=config.get("ai_provider"),
                model=config.get("ai_model"),
                job_id=job_id,
            )

            saved_count = 0
            for q_data in questions:
                question = Question(
                    id=uuid.UUID(q_data["id"]) if isinstance(q_data.get("id"), str) else uuid.uuid4(),
                    project_id=uuid.UUID(project_id),
                    type=q_data["type"],
                    body_html=q_data.get("body_html", ""),
                    body_plain=q_data.get("body_plain", ""),
                    correct_answer_json=q_data.get("correct_answer_json"),
                    explanation_html=q_data.get("explanation_html", ""),
                    points_default=q_data.get("points_default", 1.0),
                    difficulty=q_data.get("difficulty", "medium"),
                    ai_generated=True,
                    approved=False,
                    quality_score=q_data.get("quality_score", "good"),
                    shuffle_options=q_data.get("shuffle_options", True),
                    language=q_data.get("language", "vi"),
                )
                db.add(question)

                for i, opt_data in enumerate(q_data.get("options", [])):
                    option = QuestionOption(
                        id=uuid.uuid4(),
                        question_id=question.id,
                        body_html=opt_data.get("body_html", ""),
                        is_correct=opt_data.get("is_correct", False),
                        display_order=opt_data.get("display_order", i),
                        partial_credit_pct=opt_data.get("partial_credit_pct", 0),
                    )
                    db.add(option)

                saved_count += 1

            await db.execute(
                update(AIGenerationJob)
                .where(AIGenerationJob.id == uuid.UUID(job_id))
                .values(
                    status="done",
                    questions_generated=saved_count,
                    completed_at=datetime.utcnow(),
                )
            )
            await db.commit()
            logger.info(f"Generation job {job_id} complete: {saved_count} questions")

        except Exception as e:
            logger.exception(f"Generation job {job_id} failed: {e}")
            publish_sse(job_id, {"type": "error", "message": str(e)})
            await db.execute(
                update(AIGenerationJob)
                .where(AIGenerationJob.id == uuid.UUID(job_id))
                .values(status="error", error_msg=str(e), completed_at=datetime.utcnow())
            )
            await db.commit()

    await engine.dispose()


@celery_app.task(name="tasks.run_ai_generation", bind=True, max_retries=1)
def run_ai_generation(self, job_id: str, project_id: str, config: dict):
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run_generation(job_id, project_id, config))
        loop.close()
    except Exception as e:
        logger.exception(f"AI generation task failed: {e}")
        raise self.retry(exc=e, countdown=30)
