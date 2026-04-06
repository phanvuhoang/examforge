import uuid
import io
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Question, QuestionOption, QuestionVersion, QuestionTag, Tag, Project, User
from auth import get_current_user, require_editor, require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/questions", tags=["questions"])


class OptionCreate(BaseModel):
    body_html: str
    is_correct: bool = False
    display_order: int = 0
    partial_credit_pct: float = 0
    pin: bool = False


class QuestionCreate(BaseModel):
    project_id: str
    type: str
    body_html: str
    body_plain: str | None = None
    correct_answer_json: dict | None = None
    explanation_html: str | None = None
    points_default: float = 1.0
    difficulty: str = "medium"
    shuffle_options: bool = True
    shuffle_right_col: bool = True
    language: str = "vi"
    options: list[OptionCreate] = []
    tag_ids: list[str] = []


class QuestionUpdate(BaseModel):
    type: str | None = None
    body_html: str | None = None
    body_plain: str | None = None
    correct_answer_json: dict | None = None
    explanation_html: str | None = None
    points_default: float | None = None
    difficulty: str | None = None
    shuffle_options: bool | None = None
    shuffle_right_col: bool | None = None
    language: str | None = None
    options: list[OptionCreate] | None = None
    tag_ids: list[str] | None = None


class BulkActionRequest(BaseModel):
    action: str  # tag, delete, approve
    question_ids: list[str]
    tag_ids: list[str] | None = None


def serialize_question(q: Question) -> dict:
    return {
        "id": str(q.id),
        "project_id": str(q.project_id),
        "type": q.type,
        "body_html": q.body_html,
        "body_plain": q.body_plain,
        "correct_answer_json": q.correct_answer_json,
        "explanation_html": q.explanation_html,
        "points_default": q.points_default,
        "difficulty": q.difficulty,
        "ai_generated": q.ai_generated,
        "approved": q.approved,
        "quality_score": q.quality_score,
        "is_pinned": q.is_pinned,
        "shuffle_options": q.shuffle_options,
        "shuffle_right_col": q.shuffle_right_col,
        "version": q.version,
        "language": q.language,
        "created_at": q.created_at.isoformat() if q.created_at else None,
        "updated_at": q.updated_at.isoformat() if q.updated_at else None,
        "options": [
            {
                "id": str(o.id),
                "body_html": o.body_html,
                "is_correct": o.is_correct,
                "display_order": o.display_order,
                "partial_credit_pct": o.partial_credit_pct,
                "pin": o.pin,
            }
            for o in (q.options or [])
        ],
        "tags": [
            {"id": str(t.id), "name": t.name, "color": t.color}
            for t in (q.tags or [])
        ],
    }


@router.get("")
async def list_questions(
    project_id: str | None = None,
    type: str | None = None,
    difficulty: str | None = None,
    tag: str | None = None,
    ai_generated: bool | None = None,
    approved: bool | None = None,
    search: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Question)
        .options(selectinload(Question.options), selectinload(Question.tags))
        .join(Project)
        .where(Project.org_id == user.org_id)
    )

    if project_id:
        query = query.where(Question.project_id == uuid.UUID(project_id))
    if type:
        query = query.where(Question.type == type.upper())
    if difficulty:
        query = query.where(Question.difficulty == difficulty)
    if ai_generated is not None:
        query = query.where(Question.ai_generated == ai_generated)
    if approved is not None:
        query = query.where(Question.approved == approved)
    if search:
        query = query.where(
            or_(
                Question.body_plain.ilike(f"%{search}%"),
                Question.body_html.ilike(f"%{search}%"),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    result = await db.execute(
        query.order_by(Question.created_at.desc()).offset(offset).limit(limit)
    )
    questions = result.scalars().unique().all()

    return {
        "items": [serialize_question(q) for q in questions],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_question(
    body: QuestionCreate,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == uuid.UUID(body.project_id), Project.org_id == user.org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    question = Question(
        id=uuid.uuid4(),
        project_id=uuid.UUID(body.project_id),
        type=body.type.upper(),
        body_html=body.body_html,
        body_plain=body.body_plain,
        correct_answer_json=body.correct_answer_json,
        explanation_html=body.explanation_html,
        points_default=body.points_default,
        difficulty=body.difficulty,
        shuffle_options=body.shuffle_options,
        shuffle_right_col=body.shuffle_right_col,
        language=body.language,
        created_by=user.id,
        ai_generated=False,
        approved=True,
    )
    db.add(question)
    await db.flush()

    for opt in body.options:
        option = QuestionOption(
            id=uuid.uuid4(),
            question_id=question.id,
            body_html=opt.body_html,
            is_correct=opt.is_correct,
            display_order=opt.display_order,
            partial_credit_pct=opt.partial_credit_pct,
            pin=opt.pin,
        )
        db.add(option)

    for tag_id in body.tag_ids:
        qt = QuestionTag(question_id=question.id, tag_id=uuid.UUID(tag_id))
        db.add(qt)

    version = QuestionVersion(
        id=uuid.uuid4(),
        question_id=question.id,
        version_num=1,
        body_html=question.body_html,
        correct_answer_json=question.correct_answer_json,
        changed_by=user.id,
    )
    db.add(version)
    await db.flush()

    result = await db.execute(
        select(Question)
        .options(selectinload(Question.options), selectinload(Question.tags))
        .where(Question.id == question.id)
    )
    question = result.scalar_one()

    return serialize_question(question)


@router.get("/{question_id}")
async def get_question(
    question_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Question)
        .options(
            selectinload(Question.options),
            selectinload(Question.tags),
            selectinload(Question.versions),
        )
        .where(Question.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    data = serialize_question(question)
    data["versions"] = [
        {
            "id": str(v.id),
            "version_num": v.version_num,
            "body_html": v.body_html,
            "changed_by": str(v.changed_by) if v.changed_by else None,
            "changed_at": v.changed_at.isoformat() if v.changed_at else None,
        }
        for v in (question.versions or [])
    ]
    return data


@router.put("/{question_id}")
async def update_question(
    question_id: uuid.UUID,
    body: QuestionUpdate,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Question)
        .options(selectinload(Question.options), selectinload(Question.tags))
        .where(Question.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if body.type is not None:
        question.type = body.type.upper()
    if body.body_html is not None:
        question.body_html = body.body_html
    if body.body_plain is not None:
        question.body_plain = body.body_plain
    if body.correct_answer_json is not None:
        question.correct_answer_json = body.correct_answer_json
    if body.explanation_html is not None:
        question.explanation_html = body.explanation_html
    if body.points_default is not None:
        question.points_default = body.points_default
    if body.difficulty is not None:
        question.difficulty = body.difficulty
    if body.shuffle_options is not None:
        question.shuffle_options = body.shuffle_options
    if body.shuffle_right_col is not None:
        question.shuffle_right_col = body.shuffle_right_col
    if body.language is not None:
        question.language = body.language

    question.version += 1
    question.updated_at = datetime.utcnow()

    if body.options is not None:
        for opt in question.options:
            await db.delete(opt)
        await db.flush()
        for opt in body.options:
            option = QuestionOption(
                id=uuid.uuid4(),
                question_id=question.id,
                body_html=opt.body_html,
                is_correct=opt.is_correct,
                display_order=opt.display_order,
                partial_credit_pct=opt.partial_credit_pct,
                pin=opt.pin,
            )
            db.add(option)

    if body.tag_ids is not None:
        await db.execute(
            select(QuestionTag).where(QuestionTag.question_id == question.id)
        )
        from sqlalchemy import delete
        await db.execute(delete(QuestionTag).where(QuestionTag.question_id == question.id))
        for tag_id in body.tag_ids:
            qt = QuestionTag(question_id=question.id, tag_id=uuid.UUID(tag_id))
            db.add(qt)

    version = QuestionVersion(
        id=uuid.uuid4(),
        question_id=question.id,
        version_num=question.version,
        body_html=question.body_html,
        correct_answer_json=question.correct_answer_json,
        changed_by=user.id,
    )
    db.add(version)
    await db.flush()

    result = await db.execute(
        select(Question)
        .options(selectinload(Question.options), selectinload(Question.tags))
        .where(Question.id == question.id)
    )
    question = result.scalar_one()
    return serialize_question(question)


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    question_id: uuid.UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Question).where(Question.id == question_id))
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    await db.delete(question)


@router.post("/{question_id}/approve")
async def approve_question(
    question_id: uuid.UUID,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Question).where(Question.id == question_id))
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    question.approved = True
    question.updated_at = datetime.utcnow()
    await db.flush()

    return {"id": str(question.id), "approved": True}


@router.post("/{question_id}/duplicate")
async def duplicate_question(
    question_id: uuid.UUID,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Question)
        .options(selectinload(Question.options), selectinload(Question.tags))
        .where(Question.id == question_id)
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Question not found")

    new_question = Question(
        id=uuid.uuid4(),
        project_id=original.project_id,
        type=original.type,
        body_html=original.body_html,
        body_plain=original.body_plain,
        correct_answer_json=original.correct_answer_json,
        explanation_html=original.explanation_html,
        points_default=original.points_default,
        difficulty=original.difficulty,
        ai_generated=original.ai_generated,
        approved=False,
        quality_score=original.quality_score,
        shuffle_options=original.shuffle_options,
        shuffle_right_col=original.shuffle_right_col,
        language=original.language,
        created_by=user.id,
        version=1,
    )
    db.add(new_question)
    await db.flush()

    for opt in original.options:
        new_opt = QuestionOption(
            id=uuid.uuid4(),
            question_id=new_question.id,
            body_html=opt.body_html,
            is_correct=opt.is_correct,
            display_order=opt.display_order,
            partial_credit_pct=opt.partial_credit_pct,
            pin=opt.pin,
        )
        db.add(new_opt)

    for tag in original.tags:
        qt = QuestionTag(question_id=new_question.id, tag_id=tag.id)
        db.add(qt)

    await db.flush()

    result = await db.execute(
        select(Question)
        .options(selectinload(Question.options), selectinload(Question.tags))
        .where(Question.id == new_question.id)
    )
    new_question = result.scalar_one()
    return serialize_question(new_question)


@router.get("/{question_id}/versions")
async def get_question_versions(
    question_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(QuestionVersion)
        .where(QuestionVersion.question_id == question_id)
        .order_by(QuestionVersion.version_num.desc())
    )
    versions = result.scalars().all()

    return [
        {
            "id": str(v.id),
            "version_num": v.version_num,
            "body_html": v.body_html,
            "correct_answer_json": v.correct_answer_json,
            "changed_by": str(v.changed_by) if v.changed_by else None,
            "changed_at": v.changed_at.isoformat() if v.changed_at else None,
        }
        for v in versions
    ]


@router.post("/import", status_code=status.HTTP_201_CREATED)
async def import_questions(
    project_id: str = Query(...),
    file: UploadFile = File(...),
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == uuid.UUID(project_id), Project.org_id == user.org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    content = await file.read()
    from utils.excel_import import parse_excel
    parsed_questions = parse_excel(io.BytesIO(content))

    saved = []
    for q_data in parsed_questions:
        question = Question(
            id=uuid.uuid4(),
            project_id=uuid.UUID(project_id),
            type=q_data["type"],
            body_html=q_data.get("body_html", ""),
            body_plain=q_data.get("body_plain", ""),
            correct_answer_json=q_data.get("correct_answer_json"),
            explanation_html=q_data.get("explanation_html", ""),
            points_default=q_data.get("points_default", 1.0),
            difficulty=q_data.get("difficulty", "medium"),
            shuffle_options=q_data.get("shuffle_options", True),
            shuffle_right_col=q_data.get("shuffle_right_col", True),
            language=q_data.get("language", "vi"),
            created_by=user.id,
            ai_generated=False,
            approved=True,
        )
        db.add(question)
        await db.flush()

        for i, opt in enumerate(q_data.get("options", [])):
            option = QuestionOption(
                id=uuid.uuid4(),
                question_id=question.id,
                body_html=opt.get("body_html", ""),
                is_correct=opt.get("is_correct", False),
                display_order=opt.get("display_order", i),
                partial_credit_pct=opt.get("partial_credit_pct", 0),
            )
            db.add(option)

        saved.append({"id": str(question.id), "type": question.type, "body_plain": question.body_plain})

    await db.flush()
    return {"imported": len(saved), "questions": saved}


@router.get("/export")
async def export_questions(
    format: str = Query("excel", regex="^(excel|json|qti)$"),
    project_id: str = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Question)
        .options(selectinload(Question.options), selectinload(Question.tags))
        .where(Question.project_id == uuid.UUID(project_id))
        .order_by(Question.created_at)
    )
    questions = result.scalars().unique().all()

    if format == "json":
        data = [serialize_question(q) for q in questions]
        return data

    elif format == "excel":
        from utils.excel_export import export_to_excel
        buffer = export_to_excel(questions)
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=questions_export.xlsx"},
        )

    elif format == "qti":
        from utils.qti_export import export_to_qti
        xml_content = export_to_qti(questions)
        return StreamingResponse(
            io.BytesIO(xml_content.encode("utf-8")),
            media_type="application/xml",
            headers={"Content-Disposition": "attachment; filename=questions_export.xml"},
        )


@router.post("/bulk-action")
async def bulk_action(
    body: BulkActionRequest,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    question_ids = [uuid.UUID(qid) for qid in body.question_ids]

    if body.action == "approve":
        for qid in question_ids:
            result = await db.execute(select(Question).where(Question.id == qid))
            q = result.scalar_one_or_none()
            if q:
                q.approved = True
                q.updated_at = datetime.utcnow()
        await db.flush()
        return {"action": "approve", "count": len(question_ids)}

    elif body.action == "delete":
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        for qid in question_ids:
            result = await db.execute(select(Question).where(Question.id == qid))
            q = result.scalar_one_or_none()
            if q:
                await db.delete(q)
        await db.flush()
        return {"action": "delete", "count": len(question_ids)}

    elif body.action == "tag":
        if not body.tag_ids:
            raise HTTPException(status_code=400, detail="tag_ids required for tag action")
        count = 0
        for qid in question_ids:
            for tag_id in body.tag_ids:
                existing = await db.execute(
                    select(QuestionTag).where(
                        QuestionTag.question_id == qid,
                        QuestionTag.tag_id == uuid.UUID(tag_id),
                    )
                )
                if not existing.scalar_one_or_none():
                    db.add(QuestionTag(question_id=qid, tag_id=uuid.UUID(tag_id)))
                    count += 1
        await db.flush()
        return {"action": "tag", "count": count}

    raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")
