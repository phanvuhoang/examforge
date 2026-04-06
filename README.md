# ExamForge AI — testmaker

AI-Powered Exam & Question Bank Platform

## For the AI Developer Agent

Read `BRIEF.md` for the full product specification and build instructions.

## Reference Files

- `docs/testmoz-import-template.xlsx` — TestMoz Excel import template (reference for question import/export format)

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + shadcn/ui + Tailwind
- **Backend:** FastAPI (Python 3.12) + Celery + LangChain
- **DB:** PostgreSQL 16 + pgvector + Redis + MinIO
- **Deploy:** Docker Compose → Coolify VPS
