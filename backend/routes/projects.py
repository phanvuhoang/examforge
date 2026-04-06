import uuid
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Project, User
from auth import get_current_user, require_editor, require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    ai_provider_override: str | None = None
    ai_model_override: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    ai_provider_override: str | None = None
    ai_model_override: str | None = None


@router.get("")
async def list_projects(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Project).where(Project.org_id == user.org_id).order_by(Project.created_at.desc())
    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    result = await db.execute(query.offset(offset).limit(limit))
    projects = result.scalars().all()

    return {
        "items": [
            {
                "id": str(p.id),
                "name": p.name,
                "description": p.description,
                "ai_provider_override": p.ai_provider_override,
                "ai_model_override": p.ai_model_override,
                "created_by": str(p.created_by) if p.created_by else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in projects
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    project = Project(
        id=uuid.uuid4(),
        org_id=user.org_id,
        name=body.name,
        description=body.description,
        created_by=user.id,
        ai_provider_override=body.ai_provider_override,
        ai_model_override=body.ai_model_override,
    )
    db.add(project)
    await db.flush()

    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


@router.get("/{project_id}")
async def get_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == user.org_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "ai_provider_override": project.ai_provider_override,
        "ai_model_override": project.ai_model_override,
        "created_by": str(project.created_by) if project.created_by else None,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


@router.put("/{project_id}")
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == user.org_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    if body.ai_provider_override is not None:
        project.ai_provider_override = body.ai_provider_override
    if body.ai_model_override is not None:
        project.ai_model_override = body.ai_model_override
    project.updated_at = datetime.utcnow()

    await db.flush()

    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "updated_at": project.updated_at.isoformat(),
    }


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == user.org_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
