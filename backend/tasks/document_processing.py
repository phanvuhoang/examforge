import io
import logging
import asyncio
import uuid
from pathlib import Path

from minio import Minio
from langchain.text_splitter import RecursiveCharacterTextSplitter
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from config import settings
from tasks import celery_app

logger = logging.getLogger(__name__)


def get_minio_client() -> Minio:
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_USE_SSL,
    )


def extract_text_pdf(data: bytes) -> str:
    import fitz
    doc = fitz.open(stream=data, filetype="pdf")
    text_parts = []
    for page in doc:
        text_parts.append(page.get_text())
    doc.close()
    return "\n".join(text_parts)


def extract_text_docx(data: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(data))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def extract_text_image(data: bytes) -> str:
    import pytesseract
    from PIL import Image
    image = Image.open(io.BytesIO(data))
    text = pytesseract.image_to_string(image, lang="vie+eng")
    return text


def extract_text_txt(data: bytes) -> str:
    return data.decode("utf-8", errors="replace")


def extract_text(data: bytes, file_type: str) -> str:
    extractors = {
        "pdf": extract_text_pdf,
        "docx": extract_text_docx,
        "doc": extract_text_docx,
        "txt": extract_text_txt,
        "image": extract_text_image,
        "png": extract_text_image,
        "jpg": extract_text_image,
        "jpeg": extract_text_image,
    }
    extractor = extractors.get(file_type, extract_text_txt)
    return extractor(data)


def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return splitter.split_text(text)


async def _process_document(document_id: str):
    from models import Document, DocumentChunk
    from ai.embeddings import get_embeddings

    engine = create_async_engine(settings.DATABASE_URL, pool_size=5, max_overflow=2)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        result = await db.execute(select(Document).where(Document.id == uuid.UUID(document_id)))
        doc = result.scalar_one_or_none()
        if not doc:
            logger.error(f"Document {document_id} not found")
            return

        try:
            minio_client = get_minio_client()
            response = minio_client.get_object(settings.MINIO_BUCKET, doc.storage_key)
            file_data = response.read()
            response.close()
            response.release_conn()

            text = extract_text(file_data, doc.file_type or "txt")
            if not text.strip():
                await db.execute(
                    update(Document).where(Document.id == doc.id).values(status="error", chunk_count=0)
                )
                await db.commit()
                logger.warning(f"No text extracted from document {document_id}")
                return

            chunks = chunk_text(text)

            try:
                embeddings = await get_embeddings(chunks)
            except Exception as e:
                logger.warning(f"Embedding failed, storing chunks without embeddings: {e}")
                embeddings = [None] * len(chunks)

            for i, chunk_text_content in enumerate(chunks):
                chunk = DocumentChunk(
                    id=uuid.uuid4(),
                    document_id=doc.id,
                    content_text=chunk_text_content,
                    chunk_index=i,
                    embedding=embeddings[i] if embeddings[i] else None,
                    metadata_json={"char_count": len(chunk_text_content)},
                )
                db.add(chunk)

            await db.execute(
                update(Document).where(Document.id == doc.id).values(status="ready", chunk_count=len(chunks))
            )
            await db.commit()
            logger.info(f"Document {document_id} processed: {len(chunks)} chunks")

        except Exception as e:
            logger.exception(f"Error processing document {document_id}: {e}")
            await db.execute(
                update(Document).where(Document.id == doc.id).values(status="error")
            )
            await db.commit()

    await engine.dispose()


@celery_app.task(name="tasks.process_document", bind=True, max_retries=3)
def process_document(self, document_id: str):
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_process_document(document_id))
        loop.close()
    except Exception as e:
        logger.exception(f"Task failed for document {document_id}: {e}")
        raise self.retry(exc=e, countdown=60)
