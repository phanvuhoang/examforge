import uuid
import secrets
import random
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import (
    Exam, ExamQuestion, ExamTemplate, TemplateSection,
    Question, QuestionPool, Project, User,
)
from auth import get_current_user, require_editor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/exams", tags=["exams"])


class ExamGenerateRequest(BaseModel):
    template_id: str
    title: str
    settings_json: dict | None = None


class ExamUpdate(BaseModel):
    title: str | None = None
    settings_json: dict | None = None
    access_type: str | None = None
    passcode: str | None = None
    allowed_identifiers: list[str] | None = None
    open_at: str | None = None
    close_at: str | None = None


def serialize_exam(e: Exam) -> dict:
    return {
        "id": str(e.id),
        "project_id": str(e.project_id),
        "template_id": str(e.template_id) if e.template_id else None,
        "title": e.title,
        "status": e.status,
        "access_type": e.access_type,
        "passcode": e.passcode,
        "token": e.token,
        "open_at": e.open_at.isoformat() if e.open_at else None,
        "close_at": e.close_at.isoformat() if e.close_at else None,
        "settings_json": e.settings_json,
        "created_by": str(e.created_by) if e.created_by else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "question_count": len(e.exam_questions) if e.exam_questions else 0,
        "questions": [
            {
                "id": str(eq.id),
                "question_id": str(eq.question_id),
                "section_name": eq.section_name,
                "display_order": eq.display_order,
                "points_override": eq.points_override,
                "is_pinned": eq.is_pinned,
                "pool_id": str(eq.pool_id) if eq.pool_id else None,
            }
            for eq in sorted(e.exam_questions or [], key=lambda x: x.display_order)
        ],
    }


@router.get("")
async def list_exams(
    project_id: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Exam)
        .options(selectinload(Exam.exam_questions))
        .join(Project)
        .where(Project.org_id == user.org_id, Exam.project_id == uuid.UUID(project_id))
        .order_by(Exam.created_at.desc())
    )

    count_q = select(func.count()).select_from(
        select(Exam).join(Project)
        .where(Project.org_id == user.org_id, Exam.project_id == uuid.UUID(project_id))
        .subquery()
    )
    total_result = await db.execute(count_q)
    total = total_result.scalar()

    result = await db.execute(query.offset(offset).limit(limit))
    exams = result.scalars().unique().all()

    return {
        "items": [serialize_exam(e) for e in exams],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate_exam(
    body: ExamGenerateRequest,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ExamTemplate)
        .options(selectinload(ExamTemplate.sections))
        .where(ExamTemplate.id == uuid.UUID(body.template_id))
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    exam = Exam(
        id=uuid.uuid4(),
        project_id=template.project_id,
        template_id=template.id,
        title=body.title,
        status="draft",
        settings_json=body.settings_json or template.settings_json or {},
        created_by=user.id,
    )
    db.add(exam)
    await db.flush()

    order_counter = 0
    for section in sorted(template.sections, key=lambda s: s.display_order):
        question_query = select(Question).where(
            Question.project_id == template.project_id,
            Question.approved == True,
        )

        if section.question_type_filter:
            question_query = question_query.where(Question.type.in_(section.question_type_filter))
        if section.difficulty_filter:
            question_query = question_query.where(Question.difficulty.in_(section.difficulty_filter))

        result = await db.execute(question_query)
        available_questions = list(result.scalars().all())

        if section.fixed_question_ids:
            fixed_ids = set(section.fixed_question_ids)
            selected = [q for q in available_questions if q.id in fixed_ids]
            remaining = [q for q in available_questions if q.id not in fixed_ids]
            needed = section.question_count - len(selected)
            if needed > 0 and remaining:
                if section.randomize:
                    random.shuffle(remaining)
                selected.extend(remaining[:needed])
        else:
            if section.randomize:
                random.shuffle(available_questions)
            selected = available_questions[:section.question_count]

        for q in selected:
            eq = ExamQuestion(
                id=uuid.uuid4(),
                exam_id=exam.id,
                question_id=q.id,
                section_name=section.name,
                display_order=order_counter,
                points_override=section.points_per_question,
            )
            db.add(eq)
            order_counter += 1

    await db.flush()

    result = await db.execute(
        select(Exam)
        .options(selectinload(Exam.exam_questions))
        .where(Exam.id == exam.id)
    )
    exam = result.scalar_one()
    return serialize_exam(exam)


@router.get("/{exam_id}")
async def get_exam(
    exam_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Exam)
        .options(selectinload(Exam.exam_questions))
        .where(Exam.id == exam_id)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return serialize_exam(exam)


@router.put("/{exam_id}")
async def update_exam(
    exam_id: uuid.UUID,
    body: ExamUpdate,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Exam).options(selectinload(Exam.exam_questions)).where(Exam.id == exam_id)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if body.title is not None:
        exam.title = body.title
    if body.settings_json is not None:
        exam.settings_json = body.settings_json
    if body.access_type is not None:
        exam.access_type = body.access_type
    if body.passcode is not None:
        exam.passcode = body.passcode
    if body.allowed_identifiers is not None:
        exam.allowed_identifiers = body.allowed_identifiers
    if body.open_at is not None:
        exam.open_at = datetime.fromisoformat(body.open_at)
    if body.close_at is not None:
        exam.close_at = datetime.fromisoformat(body.close_at)

    await db.flush()
    return serialize_exam(exam)


@router.put("/{exam_id}/publish")
async def publish_exam(
    exam_id: uuid.UUID,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Exam).options(selectinload(Exam.exam_questions)).where(Exam.id == exam_id)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if not exam.exam_questions:
        raise HTTPException(status_code=400, detail="Exam has no questions")

    exam.status = "open"
    exam.token = secrets.token_urlsafe(16)
    await db.flush()

    return serialize_exam(exam)


@router.put("/{exam_id}/close")
async def close_exam(
    exam_id: uuid.UUID,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Exam).options(selectinload(Exam.exam_questions)).where(Exam.id == exam_id)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    exam.status = "closed"
    await db.flush()

    return serialize_exam(exam)
