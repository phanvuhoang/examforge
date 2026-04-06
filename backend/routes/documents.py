import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from minio import Minio

from config import settings
from database import get_db
from models import Document, Project, User
from auth import get_current_user, require_editor
from tasks.document_processing import process_document

logger = logging.getLogger(__name__)
router = APIRouter(tags=["documents"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def get_minio_client() -> Minio:
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_USE_SSL,
    )


def detect_file_type(filename: str) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    type_map = {
        "pdf": "pdf",
        "docx": "docx",
        "doc": "doc",
        "txt": "txt",
        "png": "image",
        "jpg": "image",
        "jpeg": "image",
        "gif": "image",
        "bmp": "image",
        "tiff": "image",
    }
    return type_map.get(ext, "txt")


@router.post("/api/projects/{project_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == user.org_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum 50MB.")

    file_type = detect_file_type(file.filename or "file.txt")
    storage_key = f"projects/{project_id}/documents/{uuid.uuid4().hex}/{file.filename}"

    minio_client = get_minio_client()
    import io
    minio_client.put_object(
        settings.MINIO_BUCKET,
        storage_key,
        io.BytesIO(content),
        len(content),
        content_type=file.content_type or "application/octet-stream",
    )

    doc = Document(
        id=uuid.uuid4(),
        project_id=project_id,
        filename=file.filename or "file",
        storage_key=storage_key,
        file_type=file_type,
        status="processing",
        uploaded_by=user.id,
    )
    db.add(doc)
    await db.flush()

    process_document.delay(str(doc.id))

    return {
        "id": str(doc.id),
        "filename": doc.filename,
        "file_type": doc.file_type,
        "status": doc.status,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


@router.get("/api/projects/{project_id}/documents")
async def list_documents(
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == user.org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    query = select(Document).where(Document.project_id == project_id).order_by(Document.created_at.desc())
    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    result = await db.execute(query.offset(offset).limit(limit))
    docs = result.scalars().all()

    return {
        "items": [
            {
                "id": str(d.id),
                "filename": d.filename,
                "file_type": d.file_type,
                "status": d.status,
                "chunk_count": d.chunk_count,
                "uploaded_by": str(d.uploaded_by) if d.uploaded_by else None,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.delete("/api/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    result = await db.execute(
        select(Project).where(Project.id == doc.project_id, Project.org_id == user.org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        minio_client = get_minio_client()
        minio_client.remove_object(settings.MINIO_BUCKET, doc.storage_key)
    except Exception as e:
        logger.warning(f"Failed to delete from MinIO: {e}")

    await db.delete(doc)
