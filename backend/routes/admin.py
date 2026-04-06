import uuid
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Organization, Project, Question, Exam, Attempt, AIGenerationJob
from auth import require_admin, hash_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str | None = None
    role: str = "editor"


class UserUpdateRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None


@router.get("/dashboard")
async def admin_dashboard(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    users_count = (await db.execute(select(func.count()).select_from(User))).scalar()
    projects_count = (await db.execute(
        select(func.count()).select_from(Project).where(Project.org_id == user.org_id)
    )).scalar()
    questions_count = (await db.execute(
        select(func.count()).select_from(Question)
        .join(Project)
        .where(Project.org_id == user.org_id)
    )).scalar()
    exams_count = (await db.execute(
        select(func.count()).select_from(Exam)
        .join(Project)
        .where(Project.org_id == user.org_id)
    )).scalar()
    attempts_count = (await db.execute(
        select(func.count()).select_from(Attempt)
        .join(Exam)
        .join(Project)
        .where(Project.org_id == user.org_id)
    )).scalar()
    ai_jobs_count = (await db.execute(
        select(func.count()).select_from(AIGenerationJob)
        .join(Project)
        .where(Project.org_id == user.org_id)
    )).scalar()

    return {
        "users": users_count,
        "projects": projects_count,
        "questions": questions_count,
        "exams": exams_count,
        "attempts": attempts_count,
        "ai_generation_jobs": ai_jobs_count,
    }


@router.get("/users")
async def list_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(User.org_id == user.org_id).order_by(User.created_at.desc())
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    result = await db.execute(query.offset(offset).limit(limit))
    users = result.scalars().all()

    return {
        "items": [
            {
                "id": str(u.id),
                "email": u.email,
                "role": u.role,
                "is_active": u.is_active,
                "oauth_provider": u.oauth_provider,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def invite_user(
    body: UserCreateRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    new_user = User(
        id=uuid.uuid4(),
        org_id=user.org_id,
        email=body.email,
        password_hash=hash_password(body.password) if body.password else None,
        role=body.role,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()

    return {
        "id": str(new_user.id),
        "email": new_user.email,
        "role": new_user.role,
    }


@router.put("/users/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.org_id == admin.org_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.id == admin.id and body.role and body.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself")

    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active

    await db.flush()
    return {
        "id": str(target.id),
        "email": target.email,
        "role": target.role,
        "is_active": target.is_active,
    }


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.org_id == admin.org_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.delete(target)


@router.get("/ai-usage")
async def ai_usage(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AIGenerationJob)
        .join(Project)
        .where(Project.org_id == user.org_id)
        .order_by(AIGenerationJob.created_at.desc())
    )
    jobs = result.scalars().all()

    total_tokens = sum(j.tokens_used or 0 for j in jobs)
    total_cost = sum(j.cost_usd or 0 for j in jobs)
    total_questions = sum(j.questions_generated or 0 for j in jobs)

    by_provider = {}
    for j in jobs:
        p = j.provider or "unknown"
        if p not in by_provider:
            by_provider[p] = {"tokens": 0, "cost": 0, "questions": 0, "jobs": 0}
        by_provider[p]["tokens"] += j.tokens_used or 0
        by_provider[p]["cost"] += j.cost_usd or 0
        by_provider[p]["questions"] += j.questions_generated or 0
        by_provider[p]["jobs"] += 1

    by_project = {}
    for j in jobs:
        pid = str(j.project_id)
        if pid not in by_project:
            by_project[pid] = {"tokens": 0, "cost": 0, "questions": 0, "jobs": 0}
        by_project[pid]["tokens"] += j.tokens_used or 0
        by_project[pid]["cost"] += j.cost_usd or 0
        by_project[pid]["questions"] += j.questions_generated or 0
        by_project[pid]["jobs"] += 1

    return {
        "total_tokens": total_tokens,
        "total_cost_usd": round(total_cost, 4),
        "total_questions_generated": total_questions,
        "total_jobs": len(jobs),
        "by_provider": by_provider,
        "by_project": by_project,
        "recent_jobs": [
            {
                "id": str(j.id),
                "project_id": str(j.project_id),
                "status": j.status,
                "provider": j.provider,
                "model": j.model,
                "questions_generated": j.questions_generated,
                "tokens_used": j.tokens_used,
                "cost_usd": j.cost_usd,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in jobs[:20]
        ],
    }
