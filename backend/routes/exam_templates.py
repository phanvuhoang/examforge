import uuid
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import ExamTemplate, TemplateSection, Project, User
from auth import get_current_user, require_editor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/exam-templates", tags=["exam-templates"])


class SectionCreate(BaseModel):
    name: str | None = None
    intro_html: str | None = None
    question_type_filter: list[str] | None = None
    tag_filter: list[str] | None = None
    difficulty_filter: list[str] | None = None
    question_count: int = 10
    points_per_question: float = 1.0
    randomize: bool = True
    fixed_question_ids: list[str] | None = None
    display_order: int = 0


class TemplateCreate(BaseModel):
    project_id: str
    name: str
    settings_json: dict | None = None
    total_points: float = 10.0
    sections: list[SectionCreate] = []


class TemplateUpdate(BaseModel):
    name: str | None = None
    settings_json: dict | None = None
    total_points: float | None = None
    sections: list[SectionCreate] | None = None


def serialize_template(t: ExamTemplate) -> dict:
    return {
        "id": str(t.id),
        "project_id": str(t.project_id),
        "name": t.name,
        "settings_json": t.settings_json,
        "total_points": t.total_points,
        "created_by": str(t.created_by) if t.created_by else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "sections": [
            {
                "id": str(s.id),
                "name": s.name,
                "intro_html": s.intro_html,
                "question_type_filter": s.question_type_filter,
                "tag_filter": s.tag_filter,
                "difficulty_filter": s.difficulty_filter,
                "question_count": s.question_count,
                "points_per_question": s.points_per_question,
                "randomize": s.randomize,
                "fixed_question_ids": [str(fid) for fid in (s.fixed_question_ids or [])],
                "display_order": s.display_order,
            }
            for s in sorted(t.sections or [], key=lambda s: s.display_order)
        ],
    }


@router.get("")
async def list_templates(
    project_id: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ExamTemplate)
        .options(selectinload(ExamTemplate.sections))
        .join(Project)
        .where(Project.org_id == user.org_id, ExamTemplate.project_id == uuid.UUID(project_id))
        .order_by(ExamTemplate.created_at.desc())
    )

    count_q = select(func.count()).select_from(
        select(ExamTemplate)
        .join(Project)
        .where(Project.org_id == user.org_id, ExamTemplate.project_id == uuid.UUID(project_id))
        .subquery()
    )
    total_result = await db.execute(count_q)
    total = total_result.scalar()

    result = await db.execute(query.offset(offset).limit(limit))
    templates = result.scalars().unique().all()

    return {
        "items": [serialize_template(t) for t in templates],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == uuid.UUID(body.project_id), Project.org_id == user.org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    template = ExamTemplate(
        id=uuid.uuid4(),
        project_id=uuid.UUID(body.project_id),
        name=body.name,
        settings_json=body.settings_json or {},
        total_points=body.total_points,
        created_by=user.id,
    )
    db.add(template)
    await db.flush()

    for sec in body.sections:
        section = TemplateSection(
            id=uuid.uuid4(),
            template_id=template.id,
            name=sec.name,
            intro_html=sec.intro_html,
            question_type_filter=sec.question_type_filter,
            tag_filter=sec.tag_filter,
            difficulty_filter=sec.difficulty_filter,
            question_count=sec.question_count,
            points_per_question=sec.points_per_question,
            randomize=sec.randomize,
            fixed_question_ids=[uuid.UUID(fid) for fid in (sec.fixed_question_ids or [])],
            display_order=sec.display_order,
        )
        db.add(section)

    await db.flush()

    result = await db.execute(
        select(ExamTemplate)
        .options(selectinload(ExamTemplate.sections))
        .where(ExamTemplate.id == template.id)
    )
    template = result.scalar_one()
    return serialize_template(template)


@router.put("/{template_id}")
async def update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ExamTemplate)
        .options(selectinload(ExamTemplate.sections))
        .where(ExamTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if body.name is not None:
        template.name = body.name
    if body.settings_json is not None:
        template.settings_json = body.settings_json
    if body.total_points is not None:
        template.total_points = body.total_points

    if body.sections is not None:
        for sec in template.sections:
            await db.delete(sec)
        await db.flush()

        for sec in body.sections:
            section = TemplateSection(
                id=uuid.uuid4(),
                template_id=template.id,
                name=sec.name,
                intro_html=sec.intro_html,
                question_type_filter=sec.question_type_filter,
                tag_filter=sec.tag_filter,
                difficulty_filter=sec.difficulty_filter,
                question_count=sec.question_count,
                points_per_question=sec.points_per_question,
                randomize=sec.randomize,
                fixed_question_ids=[uuid.UUID(fid) for fid in (sec.fixed_question_ids or [])],
                display_order=sec.display_order,
            )
            db.add(section)

    await db.flush()

    result = await db.execute(
        select(ExamTemplate)
        .options(selectinload(ExamTemplate.sections))
        .where(ExamTemplate.id == template.id)
    )
    template = result.scalar_one()
    return serialize_template(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ExamTemplate).where(ExamTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)
