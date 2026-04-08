import logging
import time
import uuid

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("examforge")

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="ExamForge AI",
    description="AI-Powered Exam & Question Bank Platform",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()

    logger.info(f"[{request_id}] {request.method} {request.url.path}")

    try:
        response = await call_next(request)
    except Exception as e:
        logger.error(f"[{request_id}] Unhandled error: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    duration = round((time.time() - start_time) * 1000, 2)
    logger.info(f"[{request_id}] {response.status_code} ({duration}ms)")

    return response


class AppError(HTTPException):
    def __init__(self, status_code: int, detail: str, error_code: str = "UNKNOWN"):
        super().__init__(status_code=status_code, detail=detail)
        self.error_code = error_code


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "error_code": exc.error_code,
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "examforge-backend",
        "version": "1.0.0",
    }


from routes.auth import router as auth_router
from routes.projects import router as projects_router
from routes.documents import router as documents_router
from routes.questions import router as questions_router
from routes.exam_templates import router as exam_templates_router
from routes.exams import router as exams_router
from routes.attempts import router as attempts_router
from routes.results import router as results_router
from routes.admin import router as admin_router
from routes.jobs import router as jobs_router

# Apply rate limiting to auth routes
from slowapi import Limiter
auth_router_limited = auth_router


app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(documents_router)
app.include_router(questions_router)
app.include_router(exam_templates_router)
app.include_router(exams_router)
app.include_router(attempts_router)
app.include_router(results_router)
app.include_router(admin_router)
app.include_router(jobs_router)


@app.on_event("startup")
async def startup_event():
    logger.info("ExamForge AI backend starting up...")
    provider, model = settings.ai_provider_and_model
    logger.info(f"AI config: provider={provider}, model={model}")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("ExamForge AI backend shutting down...")
    from database import engine
    await engine.dispose()
