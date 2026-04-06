import uuid
import io
import csv
import logging
from datetime import datetime
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import (
    Exam, ExamQuestion, Question, Attempt, Response, User,
)
from auth import get_current_user, require_editor

logger = logging.getLogger(__name__)
router = APIRouter(tags=["results"])


class ManualGradeRequest(BaseModel):
    score_override: float
    feedback_html: str | None = None


@router.get("/api/exams/{exam_id}/results")
async def list_exam_results(
    exam_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    query = select(Attempt).where(Attempt.exam_id == exam_id).order_by(Attempt.started_at.desc())
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    result = await db.execute(query.offset(offset).limit(limit))
    attempts = result.scalars().all()

    return {
        "items": [
            {
                "id": str(a.id),
                "user_id": str(a.user_id) if a.user_id else None,
                "identifier_text": a.identifier_text,
                "started_at": a.started_at.isoformat() if a.started_at else None,
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
                "score_raw": a.score_raw,
                "score_pct": a.score_pct,
                "passed": a.passed,
                "time_taken_sec": a.time_taken_sec,
                "ip_address": a.ip_address,
            }
            for a in attempts
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/api/exams/{exam_id}/analytics")
async def exam_analytics(
    exam_id: uuid.UUID,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    result = await db.execute(
        select(Attempt).where(Attempt.exam_id == exam_id, Attempt.submitted_at.isnot(None))
    )
    attempts = result.scalars().all()

    if not attempts:
        return {
            "total_attempts": 0,
            "avg_score": 0,
            "median_score": 0,
            "pass_rate": 0,
            "score_distribution": [],
            "per_question_stats": [],
        }

    scores = [a.score_pct for a in attempts if a.score_pct is not None]
    scores.sort()

    total = len(scores)
    avg_score = round(sum(scores) / total, 2) if total > 0 else 0
    median_score = scores[total // 2] if total > 0 else 0
    pass_count = sum(1 for a in attempts if a.passed)
    pass_rate = round(pass_count / total * 100, 2) if total > 0 else 0

    buckets = defaultdict(int)
    for s in scores:
        bucket = min(int(s // 10) * 10, 90)
        buckets[bucket] += 1

    score_distribution = [
        {"range": f"{b}-{b + 9}%", "count": buckets.get(b, 0)}
        for b in range(0, 100, 10)
    ]

    result = await db.execute(
        select(ExamQuestion)
        .options(selectinload(ExamQuestion.question))
        .where(ExamQuestion.exam_id == exam_id)
        .order_by(ExamQuestion.display_order)
    )
    exam_questions = result.scalars().all()

    per_question_stats = []
    for eq in exam_questions:
        result = await db.execute(
            select(Response).where(Response.exam_question_id == eq.id)
        )
        responses = result.scalars().all()

        total_responses = len(responses)
        correct_count = sum(1 for r in responses if r.is_correct)
        avg_q_score = 0
        if total_responses > 0:
            scores_list = [r.score_awarded for r in responses if r.score_awarded is not None]
            avg_q_score = round(sum(scores_list) / len(scores_list), 2) if scores_list else 0

        per_question_stats.append({
            "exam_question_id": str(eq.id),
            "question_type": eq.question.type if eq.question else None,
            "body_html": eq.question.body_html[:200] if eq.question else "",
            "total_responses": total_responses,
            "correct_count": correct_count,
            "correct_pct": round(correct_count / total_responses * 100, 2) if total_responses > 0 else 0,
            "avg_score": avg_q_score,
        })

    return {
        "total_attempts": total,
        "avg_score": avg_score,
        "median_score": median_score,
        "pass_rate": pass_rate,
        "score_distribution": score_distribution,
        "per_question_stats": per_question_stats,
    }


@router.get("/api/exams/{exam_id}/results/export")
async def export_results(
    exam_id: uuid.UUID,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    result = await db.execute(
        select(ExamQuestion)
        .options(selectinload(ExamQuestion.question))
        .where(ExamQuestion.exam_id == exam_id)
        .order_by(ExamQuestion.display_order)
    )
    exam_questions = result.scalars().all()

    result = await db.execute(
        select(Attempt)
        .options(selectinload(Attempt.responses))
        .where(Attempt.exam_id == exam_id, Attempt.submitted_at.isnot(None))
        .order_by(Attempt.submitted_at)
    )
    attempts = result.scalars().unique().all()

    output = io.StringIO()
    writer = csv.writer(output)

    headers = ["Identifier", "User ID", "Score Raw", "Score %", "Passed", "Time (sec)", "Submitted At"]
    for eq in exam_questions:
        q_label = f"Q{eq.display_order + 1} ({eq.question.type})"
        headers.append(q_label)
    writer.writerow(headers)

    for attempt in attempts:
        resp_map = {str(r.exam_question_id): r for r in attempt.responses}
        row = [
            attempt.identifier_text or "",
            str(attempt.user_id) if attempt.user_id else "",
            attempt.score_raw,
            attempt.score_pct,
            "Yes" if attempt.passed else "No",
            attempt.time_taken_sec,
            attempt.submitted_at.isoformat() if attempt.submitted_at else "",
        ]
        for eq in exam_questions:
            resp = resp_map.get(str(eq.id))
            if resp:
                row.append(resp.score_awarded if resp.score_awarded is not None else "")
            else:
                row.append("")
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=exam_{exam_id}_results.csv"},
    )


@router.get("/api/results/grading-queue")
async def grading_queue(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Response)
        .options(
            selectinload(Response.exam_question).selectinload(ExamQuestion.question),
            selectinload(Response.attempt),
        )
        .join(Response.exam_question)
        .join(ExamQuestion.question)
        .where(
            Response.is_correct.is_(None),
            Response.score_override.is_(None),
            Question.type.in_(["ESSAY", "SA"]),
        )
        .order_by(Response.attempt_id)
    )

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    result = await db.execute(query.offset(offset).limit(limit))
    responses = result.scalars().unique().all()

    return {
        "items": [
            {
                "response_id": str(r.id),
                "attempt_id": str(r.attempt_id),
                "exam_question_id": str(r.exam_question_id),
                "question_type": r.exam_question.question.type if r.exam_question and r.exam_question.question else None,
                "question_body": r.exam_question.question.body_html[:200] if r.exam_question and r.exam_question.question else "",
                "answer_data_json": r.answer_data_json,
                "identifier_text": r.attempt.identifier_text if r.attempt else None,
                "points": r.exam_question.points_override if r.exam_question else None,
            }
            for r in responses
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.put("/api/responses/{response_id}/grade")
async def grade_response_manual(
    response_id: uuid.UUID,
    body: ManualGradeRequest,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Response).where(Response.id == response_id))
    response = result.scalar_one_or_none()
    if not response:
        raise HTTPException(status_code=404, detail="Response not found")

    response.score_override = body.score_override
    response.feedback_html = body.feedback_html
    response.graded_by = user.id
    response.graded_at = datetime.utcnow()
    await db.flush()

    attempt_result = await db.execute(
        select(Response).where(Response.attempt_id == response.attempt_id)
    )
    all_responses = attempt_result.scalars().all()

    total_score = sum(
        (r.score_override if r.score_override is not None else (r.score_awarded or 0))
        for r in all_responses
    )

    attempt_result = await db.execute(select(Attempt).where(Attempt.id == response.attempt_id))
    attempt = attempt_result.scalar_one()

    eq_result = await db.execute(
        select(ExamQuestion).where(ExamQuestion.exam_id == attempt.exam_id)
    )
    all_eq = eq_result.scalars().all()
    total_points = sum(eq.points_override or 1.0 for eq in all_eq)

    attempt.score_raw = round(total_score, 2)
    attempt.score_pct = round((total_score / total_points * 100) if total_points > 0 else 0, 2)

    exam_result = await db.execute(select(Exam).where(Exam.id == attempt.exam_id))
    exam = exam_result.scalar_one()
    exam_settings = exam.settings_json or {}
    pass_threshold = exam_settings.get("pass_threshold_pct", 60)
    attempt.passed = attempt.score_pct >= pass_threshold

    await db.flush()

    return {
        "response_id": str(response.id),
        "score_override": response.score_override,
        "feedback_html": response.feedback_html,
        "attempt_score_raw": attempt.score_raw,
        "attempt_score_pct": attempt.score_pct,
        "attempt_passed": attempt.passed,
    }
