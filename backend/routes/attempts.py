import uuid
import random
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import (
    Exam, ExamQuestion, Question, QuestionOption,
    Attempt, Response, QuestionPool, User,
)
from auth import get_current_user, get_optional_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["attempts"])


class AttemptStartRequest(BaseModel):
    exam_id: str
    identifier_text: str | None = None
    passcode: str | None = None


class ResponseItem(BaseModel):
    exam_question_id: str
    answer_data_json: dict | None = None


class SaveResponsesRequest(BaseModel):
    responses: list[ResponseItem]


def grade_response(question: Question, answer_data: dict | None, points: float) -> tuple[bool | None, float]:
    if answer_data is None:
        return None, 0.0

    correct_answer = question.correct_answer_json
    if not correct_answer:
        return None, 0.0

    q_type = question.type.upper()

    if q_type == "MC":
        expected_index = correct_answer.get("option_index")
        if expected_index is not None:
            options = sorted(question.options, key=lambda o: o.display_order)
            if expected_index < len(options):
                expected_id = str(options[expected_index].id)
                given_id = answer_data.get("option_id", "")
                is_correct = given_id == expected_id
                return is_correct, points if is_correct else 0.0

        expected_id = correct_answer.get("option_id", "")
        given_id = answer_data.get("option_id", "")
        is_correct = given_id == expected_id
        return is_correct, points if is_correct else 0.0

    elif q_type == "TF":
        expected = correct_answer.get("value")
        given = answer_data.get("value")
        is_correct = expected == given
        return is_correct, points if is_correct else 0.0

    elif q_type == "MR":
        expected_indices = set(correct_answer.get("option_indices", []))
        if expected_indices:
            options = sorted(question.options, key=lambda o: o.display_order)
            expected_ids = set()
            for idx in expected_indices:
                if idx < len(options):
                    expected_ids.add(str(options[idx].id))
        else:
            expected_ids = set(correct_answer.get("option_ids", []))

        given_ids = set(answer_data.get("option_ids", []))

        if not expected_ids:
            return None, 0.0

        correct_selected = len(given_ids & expected_ids)
        incorrect_selected = len(given_ids - expected_ids)
        total_correct = len(expected_ids)

        score = max(0.0, (correct_selected - incorrect_selected) / total_correct) * points
        is_correct = given_ids == expected_ids
        return is_correct, round(score, 2)

    elif q_type == "FITB":
        accepted = [a.strip().lower() for a in correct_answer.get("accepted", [])]
        given = (answer_data.get("value") or "").strip().lower()
        is_correct = given in accepted
        return is_correct, points if is_correct else 0.0

    elif q_type == "MATCH":
        expected_pairs = correct_answer.get("pairs", [])
        given_pairs = answer_data.get("pairs", [])

        if not expected_pairs:
            return None, 0.0

        expected_map = {str(p.get("left", p.get("left_id", ""))): str(p.get("right", p.get("right_id", ""))) for p in expected_pairs}
        given_map = {str(p.get("left", p.get("left_id", ""))): str(p.get("right", p.get("right_id", ""))) for p in given_pairs}

        correct_count = sum(1 for k, v in expected_map.items() if given_map.get(k) == v)
        total = len(expected_map)
        score = (correct_count / total) * points if total > 0 else 0.0
        is_correct = correct_count == total
        return is_correct, round(score, 2)

    elif q_type == "ORDER":
        expected_order = correct_answer.get("order", [])
        given_order = answer_data.get("order", [])
        is_correct = expected_order == given_order
        return is_correct, points if is_correct else 0.0

    elif q_type == "NUM":
        expected_val = correct_answer.get("value")
        tolerance = correct_answer.get("tolerance", 0)
        given_val = answer_data.get("value")

        if expected_val is None or given_val is None:
            return None, 0.0

        try:
            is_correct = abs(float(given_val) - float(expected_val)) <= float(tolerance)
        except (ValueError, TypeError):
            return False, 0.0
        return is_correct, points if is_correct else 0.0

    elif q_type == "SA":
        graded = correct_answer.get("graded", False)
        if not graded:
            return True, points
        return None, 0.0

    elif q_type == "ESSAY":
        return None, 0.0

    elif q_type == "TEXT":
        return None, 0.0

    return None, 0.0


@router.get("/t/{token}")
async def exam_landing(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Exam)
        .options(selectinload(Exam.exam_questions))
        .where(Exam.token == token)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.status not in ("open", "scheduled"):
        raise HTTPException(status_code=403, detail="Exam is not currently available")

    exam_settings = exam.settings_json or {}

    return {
        "exam_id": str(exam.id),
        "title": exam.title,
        "question_count": len(exam.exam_questions) if exam.exam_questions else 0,
        "settings": {
            "time_limit_minutes": exam_settings.get("time_limit_minutes"),
            "require_identifier": exam_settings.get("require_identifier", "name"),
            "max_attempts": exam_settings.get("max_attempts"),
        },
        "access_type": exam.access_type,
    }


@router.post("/api/attempts", status_code=status.HTTP_201_CREATED)
async def start_attempt(
    body: AttemptStartRequest,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Exam)
        .options(
            selectinload(Exam.exam_questions).selectinload(ExamQuestion.question).selectinload(Question.options),
        )
        .where(Exam.id == uuid.UUID(body.exam_id))
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.status not in ("open", "scheduled"):
        raise HTTPException(status_code=403, detail="Exam is not currently available")

    if exam.access_type == "passcode" and exam.passcode:
        if body.passcode != exam.passcode:
            raise HTTPException(status_code=403, detail="Invalid passcode")

    exam_settings = exam.settings_json or {}
    max_attempts = exam_settings.get("max_attempts")
    if max_attempts and user:
        count_result = await db.execute(
            select(Attempt).where(Attempt.exam_id == exam.id, Attempt.user_id == user.id)
        )
        existing = len(count_result.scalars().all())
        if existing >= max_attempts:
            raise HTTPException(status_code=403, detail="Maximum attempts reached")

    client_ip = request.client.host if request.client else None

    attempt = Attempt(
        id=uuid.uuid4(),
        exam_id=exam.id,
        user_id=user.id if user else None,
        identifier_text=body.identifier_text,
        ip_address=client_ip,
    )
    db.add(attempt)
    await db.flush()

    exam_questions = list(exam.exam_questions)
    if exam_settings.get("shuffle_questions", False):
        pinned = [eq for eq in exam_questions if eq.is_pinned]
        unpinned = [eq for eq in exam_questions if not eq.is_pinned]
        random.shuffle(unpinned)
        exam_questions = pinned + unpinned

    questions_data = []
    for eq in sorted(exam_questions, key=lambda x: x.display_order):
        q = eq.question
        q_data = {
            "exam_question_id": str(eq.id),
            "question_id": str(q.id),
            "type": q.type,
            "body_html": q.body_html,
            "points": eq.points_override or q.points_default,
            "section_name": eq.section_name,
            "display_order": eq.display_order,
        }

        options = list(q.options)
        shuffle_opts = exam_settings.get("shuffle_options", q.shuffle_options)
        if shuffle_opts:
            pinned_opts = [o for o in options if o.pin]
            unpinned_opts = [o for o in options if not o.pin]
            random.shuffle(unpinned_opts)
            options = pinned_opts + unpinned_opts

        if q.type.upper() not in ("ESSAY", "SA", "TEXT", "FITB", "NUM"):
            q_data["options"] = [
                {
                    "id": str(o.id),
                    "body_html": o.body_html,
                    "display_order": o.display_order,
                }
                for o in options
            ]

        questions_data.append(q_data)

    return {
        "attempt_id": str(attempt.id),
        "exam_id": str(exam.id),
        "title": exam.title,
        "settings": exam_settings,
        "questions": questions_data,
    }


@router.put("/api/attempts/{attempt_id}/responses")
async def save_responses(
    attempt_id: uuid.UUID,
    body: SaveResponsesRequest,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.submitted_at:
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    for resp_item in body.responses:
        eq_id = uuid.UUID(resp_item.exam_question_id)

        result = await db.execute(
            select(Response).where(
                Response.attempt_id == attempt_id,
                Response.exam_question_id == eq_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.answer_data_json = resp_item.answer_data_json
        else:
            response = Response(
                id=uuid.uuid4(),
                attempt_id=attempt_id,
                exam_question_id=eq_id,
                answer_data_json=resp_item.answer_data_json,
            )
            db.add(response)

    await db.flush()
    return {"saved": len(body.responses)}


@router.post("/api/attempts/{attempt_id}/submit")
async def submit_attempt(
    attempt_id: uuid.UUID,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.submitted_at:
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    attempt.submitted_at = datetime.utcnow()
    if attempt.started_at:
        attempt.time_taken_sec = int((attempt.submitted_at - attempt.started_at).total_seconds())

    result = await db.execute(
        select(Response)
        .options(
            selectinload(Response.exam_question).selectinload(ExamQuestion.question).selectinload(Question.options)
        )
        .where(Response.attempt_id == attempt_id)
    )
    responses = result.scalars().unique().all()

    total_points = 0.0
    total_score = 0.0
    needs_manual_grading = False

    for resp in responses:
        eq = resp.exam_question
        question = eq.question
        points = eq.points_override or question.points_default
        total_points += points

        is_correct, score = grade_response(question, resp.answer_data_json, points)
        resp.is_correct = is_correct
        resp.score_awarded = score
        total_score += score

        if is_correct is None and question.type.upper() in ("ESSAY", "SA"):
            if question.type.upper() == "ESSAY" or (question.correct_answer_json and question.correct_answer_json.get("graded", False)):
                needs_manual_grading = True

    unresponded_result = await db.execute(
        select(ExamQuestion)
        .where(ExamQuestion.exam_id == attempt.exam_id)
    )
    all_eq = unresponded_result.scalars().all()
    responded_eq_ids = {r.exam_question_id for r in responses}
    for eq in all_eq:
        if eq.id not in responded_eq_ids:
            total_points += eq.points_override or 0

    attempt.score_raw = round(total_score, 2)
    attempt.score_pct = round((total_score / total_points * 100) if total_points > 0 else 0, 2)

    result = await db.execute(select(Exam).where(Exam.id == attempt.exam_id))
    exam = result.scalar_one()
    exam_settings = exam.settings_json or {}
    pass_threshold = exam_settings.get("pass_threshold_pct", 60)
    attempt.passed = attempt.score_pct >= pass_threshold

    await db.flush()

    return {
        "attempt_id": str(attempt.id),
        "score_raw": attempt.score_raw,
        "score_pct": attempt.score_pct,
        "passed": attempt.passed,
        "time_taken_sec": attempt.time_taken_sec,
        "needs_manual_grading": needs_manual_grading,
        "pass_message": exam_settings.get("pass_message", "") if attempt.passed else exam_settings.get("fail_message", ""),
    }


@router.get("/api/attempts/{attempt_id}/result")
async def get_attempt_result(
    attempt_id: uuid.UUID,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Attempt).where(Attempt.id == attempt_id)
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if not attempt.submitted_at:
        raise HTTPException(status_code=400, detail="Attempt not yet submitted")

    result = await db.execute(select(Exam).where(Exam.id == attempt.exam_id))
    exam = result.scalar_one()
    exam_settings = exam.settings_json or {}

    result = await db.execute(
        select(Response)
        .options(
            selectinload(Response.exam_question).selectinload(ExamQuestion.question).selectinload(Question.options)
        )
        .where(Response.attempt_id == attempt_id)
    )
    responses = result.scalars().unique().all()

    result_display = exam_settings.get("result_display", "score")
    inline_feedback = exam_settings.get("inline_feedback", "none")

    response_data = []
    for resp in responses:
        eq = resp.exam_question
        q = eq.question

        r_data = {
            "exam_question_id": str(eq.id),
            "question_type": q.type,
            "body_html": q.body_html,
            "points": eq.points_override or q.points_default,
            "score_awarded": resp.score_awarded if resp.score_override is None else resp.score_override,
            "is_correct": resp.is_correct,
            "answer_data_json": resp.answer_data_json,
            "feedback_html": resp.feedback_html,
        }

        if result_display in ("show_answer", "show_explanation") or inline_feedback in ("show_answer", "full_with_explanation"):
            r_data["correct_answer_json"] = q.correct_answer_json
            r_data["options"] = [
                {
                    "id": str(o.id),
                    "body_html": o.body_html,
                    "is_correct": o.is_correct,
                }
                for o in q.options
            ]

        if result_display == "show_explanation" or inline_feedback == "full_with_explanation":
            r_data["explanation_html"] = q.explanation_html

        response_data.append(r_data)

    return {
        "attempt_id": str(attempt.id),
        "exam_title": exam.title,
        "score_raw": attempt.score_raw,
        "score_pct": attempt.score_pct,
        "passed": attempt.passed,
        "time_taken_sec": attempt.time_taken_sec,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "pass_message": exam_settings.get("pass_message", "") if attempt.passed else exam_settings.get("fail_message", ""),
        "responses": response_data,
    }
