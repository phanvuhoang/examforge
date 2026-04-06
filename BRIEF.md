# BRIEF: ExamForge AI — Full App Build v1.0

**App name:** ExamForge AI  
**Tagline:** AI-Powered Exam & Question Bank Platform  
**Deploy target:** Coolify VPS (Docker, Traefik reverse proxy)  
**Date:** 2026-04-07

---

## OVERVIEW

Build a full-stack web app that lets educators (Admin/Editor) upload documents, auto-generate question banks via AI, create exam blueprints, publish exams, and track results. Test-takers can take exams via public link (no login required) or with an account.

**Inspiration / references:** TestMoz (UX), QuestGen-AI-Agent (AI pipeline), examsgen repo (FastAPI patterns).

---

## TECH STACK — MUST USE EXACTLY

### Frontend
- **Framework:** Next.js 14 (App Router) — NOT Pages Router
- **UI:** shadcn/ui + Tailwind CSS
- **Rich text editor:** TipTap (ProseMirror-based)
- **Math:** KaTeX
- **Drag & drop:** dnd-kit (for Matching/Ordering question types)
- **State:** Zustand
- **Forms:** React Hook Form + Zod
- **Streaming:** native `EventSource` API (SSE)
- **Charts:** Recharts
- **File upload:** react-dropzone
- **i18n:** next-intl (vi + en)

### Backend
- **Framework:** FastAPI (Python 3.12) — async throughout
- **Task queue:** Celery + Redis
- **AI orchestration:** LangChain + LangGraph (multi-agent pipeline)
- **Document parsing:** PyMuPDF, python-docx, pytesseract
- **Text splitting:** LangChain RecursiveCharacterTextSplitter
- **Auth:** FastAPI-Users (JWT + refresh tokens + OAuth)
- **Excel:** openpyxl
- **PDF export:** WeasyPrint
- **Email:** SMTP via env vars

### Database & Storage
- **DB:** PostgreSQL 16 with pgvector extension
- **Cache/Queue broker:** Redis 7
- **File storage:** MinIO (S3-compatible, self-hosted)
- **ORM:** SQLAlchemy 2.0 async + Alembic migrations

### Infrastructure
- Docker Compose (6 services)
- Coolify-compatible (env vars as secrets)
- GitHub Actions → Coolify webhook CI/CD

---

## DOCKER SERVICES (docker-compose.yml)

```yaml
services:
  frontend:    # Next.js, port 3000
  backend:     # FastAPI, port 8000
  celery:      # Same image as backend, runs Celery worker
  postgres:    # postgres:16-alpine, port 5432, volume 20GB
  redis:       # redis:7-alpine, port 6379
  minio:       # minio/minio, ports 9000+9001, volume 50GB
```

All services on internal Docker network `examforge_net`. Only frontend (3000) and backend (8000) exposed via Traefik labels.

---

## USER ROLES & PERMISSIONS

| Role | Description | Key Access |
|---|---|---|
| 🔴 Admin | System admin | Everything: users, orgs, billing, settings |
| 🟠 Editor | Content creator (teacher, expert) | Projects, Question Bank, Exam Templates, Results |
| 🟢 Login User | Registered test-taker | Take exams, view own history |
| ⚪ Free Tester | Anonymous, link-only | Take one exam via token link, no history |

Permission enforcement via FastAPI dependency injection (`get_current_user`, role checks on each endpoint).

---

## DATA MODEL (PostgreSQL)

### Create all tables via Alembic migration. Schema:

```sql
-- organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  plan VARCHAR(50) DEFAULT 'free',
  settings_json JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash VARCHAR(500),
  role VARCHAR(20) NOT NULL DEFAULT 'user', -- admin/editor/user
  oauth_provider VARCHAR(50),
  oauth_id VARCHAR(200),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  ai_provider_override VARCHAR(50),
  ai_model_override VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) NOT NULL,
  filename VARCHAR(500) NOT NULL,
  storage_key VARCHAR(500) NOT NULL, -- MinIO key
  file_type VARCHAR(20), -- pdf/docx/txt/image
  status VARCHAR(20) DEFAULT 'processing', -- processing/ready/error
  chunk_count INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- document_chunks (with pgvector)
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) NOT NULL,
  content_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536), -- pgvector
  metadata_json JSONB DEFAULT '{}'
);
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- tags (hierarchical)
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) NOT NULL,
  name VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES tags(id),
  color VARCHAR(20)
);

-- questions
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) NOT NULL,
  type VARCHAR(20) NOT NULL, -- MC/MR/TF/FITB/MATCH/ORDER/NUM/SA/ESSAY/TEXT
  body_html TEXT NOT NULL,
  body_plain TEXT,
  correct_answer_json JSONB,
  explanation_html TEXT,
  points_default FLOAT DEFAULT 1.0,
  difficulty VARCHAR(10) DEFAULT 'medium', -- easy/medium/hard
  ai_generated BOOLEAN DEFAULT FALSE,
  approved BOOLEAN DEFAULT FALSE,
  quality_score VARCHAR(20), -- excellent/good/needs_review
  is_pinned BOOLEAN DEFAULT FALSE,
  shuffle_options BOOLEAN DEFAULT TRUE,
  shuffle_right_col BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  source_doc_id UUID REFERENCES documents(id),
  created_by UUID REFERENCES users(id),
  language VARCHAR(10) DEFAULT 'vi',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- question_options
CREATE TABLE question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  body_html TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  partial_credit_pct FLOAT DEFAULT 0,
  pin BOOLEAN DEFAULT FALSE
);

-- question_tags (many-to-many)
CREATE TABLE question_tags (
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, tag_id)
);

-- question_versions (audit trail)
CREATE TABLE question_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  version_num INTEGER NOT NULL,
  body_html TEXT,
  correct_answer_json JSONB,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW()
);

-- exam_templates
CREATE TABLE exam_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) NOT NULL,
  name VARCHAR(200) NOT NULL,
  settings_json JSONB DEFAULT '{}',
  total_points FLOAT DEFAULT 10.0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- template_sections
CREATE TABLE template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES exam_templates(id) ON DELETE CASCADE,
  name VARCHAR(200),
  intro_html TEXT,
  question_type_filter TEXT[], -- array of type codes
  tag_filter TEXT[],
  difficulty_filter TEXT[],
  question_count INTEGER NOT NULL DEFAULT 10,
  points_per_question FLOAT DEFAULT 1.0,
  randomize BOOLEAN DEFAULT TRUE,
  fixed_question_ids UUID[],
  display_order INTEGER DEFAULT 0
);

-- exams
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) NOT NULL,
  template_id UUID REFERENCES exam_templates(id),
  title VARCHAR(300) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft', -- draft/open/scheduled/closed
  access_type VARCHAR(20) DEFAULT 'public', -- public/passcode/email_list/token
  passcode VARCHAR(100),
  allowed_identifiers TEXT[],
  open_at TIMESTAMP,
  close_at TIMESTAMP,
  settings_json JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  token VARCHAR(100) UNIQUE, -- for free tester URL
  created_at TIMESTAMP DEFAULT NOW()
);

-- exam_questions
CREATE TABLE exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id),
  section_name VARCHAR(200),
  display_order INTEGER DEFAULT 0,
  pool_id UUID,
  points_override FLOAT,
  is_pinned BOOLEAN DEFAULT FALSE
);

-- question_pools
CREATE TABLE question_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  name VARCHAR(200),
  show_count INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER DEFAULT 0
);

-- attempts
CREATE TABLE attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) NOT NULL,
  user_id UUID REFERENCES users(id), -- NULL for free tester
  identifier_text VARCHAR(200), -- name/email for free tester
  started_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP,
  score_raw FLOAT,
  score_pct FLOAT,
  passed BOOLEAN,
  time_taken_sec INTEGER,
  ip_address VARCHAR(50)
);

-- responses
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE,
  exam_question_id UUID REFERENCES exam_questions(id),
  answer_data_json JSONB, -- format varies by question type
  is_correct BOOLEAN,
  score_awarded FLOAT,
  score_override FLOAT, -- manual grade override
  feedback_html TEXT,
  graded_by UUID REFERENCES users(id),
  graded_at TIMESTAMP
);

-- ai_generation_jobs
CREATE TABLE ai_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  status VARCHAR(20) DEFAULT 'pending', -- pending/running/done/error
  provider VARCHAR(50),
  model VARCHAR(100),
  config_json JSONB DEFAULT '{}',
  questions_generated INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  cost_usd FLOAT DEFAULT 0,
  error_msg TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type VARCHAR(50),
  message TEXT,
  read_at TIMESTAMP,
  payload_json JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## BACKEND API STRUCTURE

### File structure:
```
backend/
  main.py                  # FastAPI app, include all routers
  config.py                # All env vars
  models.py                # SQLAlchemy models
  database.py              # Async engine, session
  auth.py                  # JWT + FastAPI-Users setup
  ai/
    provider.py            # Multi-provider AI abstraction
    pipeline.py            # LangChain/LangGraph generation pipeline
    embeddings.py          # Embedding functions
  routes/
    auth.py                # /api/auth/*
    projects.py            # /api/projects/*
    documents.py           # /api/projects/{id}/documents
    questions.py           # /api/questions/*
    exam_templates.py      # /api/exam-templates/*
    exams.py               # /api/exams/*
    attempts.py            # /api/attempts/* + /t/{token}
    results.py             # /api/exams/{id}/results/*
    admin.py               # /api/admin/*
    jobs.py                # /api/jobs/{id}/stream (SSE)
  tasks/
    document_processing.py # Celery: extract text, chunk, embed
    ai_generation.py       # Celery: AI question generation
  utils/
    excel_import.py        # Excel → Question parser
    excel_export.py        # Questions → Excel
    pdf_export.py          # WeasyPrint PDF generation
    qti_export.py          # QTI 1.2 export
```

### All API endpoints:

**Auth:**
- `POST /api/auth/register`
- `POST /api/auth/login` → returns `{ access_token, refresh_token }`
- `POST /api/auth/refresh`
- `GET /api/auth/oauth/{provider}` (google, github)
- `POST /api/auth/logout`

**Projects:**
- `GET /api/projects` — list org's projects
- `POST /api/projects` — create project
- `GET /api/projects/{id}` — get project detail
- `PUT /api/projects/{id}` — update
- `DELETE /api/projects/{id}` — delete (admin only)

**Documents:**
- `POST /api/projects/{id}/documents` — upload (multipart, max 50MB)
- `GET /api/projects/{id}/documents` — list
- `DELETE /api/documents/{id}`

**AI Generation:**
- `POST /api/projects/{id}/generate-questions` — trigger Celery job, returns `{ job_id }`
  - Body: `{ question_types[], count_per_type{}, difficulty_distribution{}, topic_filter[], chapter_filter[], language, include_explanation, ai_provider?, ai_model? }`
- `GET /api/jobs/{job_id}/stream` — SSE endpoint, streams:
  - `data: {"type": "progress", "step": 1, "total": 5, "label": "Retrieving context..."}`
  - `data: {"type": "question", "question": {...}}` — one per question as generated
  - `data: {"type": "done", "total_generated": 20}`
  - `data: {"type": "error", "message": "..."}`

**Questions:**
- `GET /api/questions` — list with filters: `project_id`, `type`, `difficulty`, `tag`, `ai_generated`, `approved`, `search`, `limit`, `offset`
- `POST /api/questions` — create manually
- `GET /api/questions/{id}` — get with versions
- `PUT /api/questions/{id}` — update (creates new version)
- `DELETE /api/questions/{id}` — admin only
- `POST /api/questions/{id}/approve` — approve AI-generated question
- `POST /api/questions/{id}/duplicate` — clone question
- `GET /api/questions/{id}/versions` — version history
- `POST /api/questions/import` — Excel import (multipart)
- `GET /api/questions/export` — export, params: `format` (excel/json/qti), `project_id`
- `POST /api/questions/bulk-action` — bulk tag/delete/approve

**Exam Templates:**
- `GET /api/exam-templates?project_id=`
- `POST /api/exam-templates`
- `PUT /api/exam-templates/{id}`
- `DELETE /api/exam-templates/{id}`

**Exams:**
- `POST /api/exams/generate` — generate exam from template
  - Body: `{ template_id, title, settings_json }`
- `GET /api/exams/{id}` — get exam detail with questions
- `PUT /api/exams/{id}` — update (swap questions, settings)
- `PUT /api/exams/{id}/publish` — set status=open, generate token
- `PUT /api/exams/{id}/close`
- `GET /api/exams?project_id=` — list exams

**Test-taking (public + authenticated):**
- `GET /t/{token}` — exam landing (returns exam metadata for free tester)
- `POST /api/attempts` — start attempt
  - Body: `{ exam_id, identifier_text?, passcode? }`
  - Returns: `{ attempt_id, questions[] }` (questions ordered per settings)
- `PUT /api/attempts/{id}/responses` — auto-save responses (upsert)
  - Body: `{ responses: [{ exam_question_id, answer_data_json }] }`
- `POST /api/attempts/{id}/submit` — submit, trigger auto-grading
- `GET /api/attempts/{id}/result` — get result (respects settings)

**Results & Analytics:**
- `GET /api/exams/{id}/results` — list all attempts (editor+)
- `GET /api/exams/{id}/analytics` — summary stats: avg score, distribution, per-question stats
- `GET /api/exams/{id}/results/export` — CSV export (point grid + response grid)
- `GET /api/results/grading-queue` — essay/manual grading queue
- `PUT /api/responses/{id}/grade` — manual grade + feedback

**Admin:**
- `GET /api/admin/dashboard` — widgets data
- `GET /api/admin/users` — list users
- `POST /api/admin/users` — invite user
- `PUT /api/admin/users/{id}` — update role
- `DELETE /api/admin/users/{id}`
- `GET /api/admin/ai-usage` — token/cost stats per project/provider

---

## AI PROVIDER SYSTEM (`backend/ai/provider.py`)

### Env vars (all optional, system uses what's available):
```
OPENAI_API_KEY
OPENAI_BASE_URL          # optional override (e.g. Claudible proxy)
ANTHROPIC_API_KEY
ANTHROPIC_BASE_URL       # optional override
OPENROUTER_API_KEY
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL        # default: https://api.deepseek.com
GOOGLE_API_KEY
OLLAMA_BASE_URL          # optional, local
AI_DEFAULT_PROVIDER      # openai/anthropic/openrouter/deepseek
AI_DEFAULT_MODEL         # e.g. gpt-4o-mini
AI_EMBEDDING_PROVIDER    # openai (recommended)
AI_EMBEDDING_MODEL       # text-embedding-3-small
AI_FALLBACK_CHAIN        # comma-separated: anthropic,openai,openrouter
AI_MAX_TOKENS            # default: 8000
AI_TEMPERATURE           # default: 0.7
AI_TIMEOUT_SECONDS       # default: 30
```

### Fallback chain behavior:
- Provider timeout → retry once → fallback to next in chain
- Rate limit (429) → exponential backoff → fallback
- Auth error (401) → skip provider, next in chain
- All fail → raise clear error to user

### call_ai() signature:
```python
async def call_ai(messages, system="", provider=None, model=None, max_tokens=8000, stream=False) -> dict | AsyncGenerator
```

---

## AI GENERATION PIPELINE (`backend/ai/pipeline.py`)

5-step multi-agent pipeline using LangChain/LangGraph:

```
1. Context Retriever
   - Input: topic query + tag/chapter filters
   - Action: pgvector similarity search on document_chunks
   - Output: relevant text chunks

2. Question Creator
   - Input: chunks + generation config (types, count, difficulty, language)
   - Action: LLM prompt → generate draft questions as JSON array
   - Output: list of draft Question objects

3. Quality Analyzer
   - Input: draft questions
   - Action: LLM self-evaluate each question (clarity, accuracy, difficulty alignment)
   - Output: scored questions with quality_score field

4. Decider / Filter
   - Input: scored questions
   - Action: filter out low quality (<threshold), deduplicate similar questions
   - Output: approved question list

5. Formatter
   - Input: approved questions
   - Action: normalize to Question schema, assign points/tags, validate JSON
   - Output: final Question objects → save to DB
```

**SSE Streaming:** Each step emits progress event. Each generated question emits immediately (don't wait for full batch).

**Celery task** wraps the pipeline, runs in background. SSE endpoint polls Redis pub/sub for updates.

---

## QUESTION TYPES — All 10 Must Work

| Code | Type | Auto-grade | Answer format in DB |
|---|---|---|---|
| MC | Multiple Choice (1 correct) | ✅ | `correct_answer_json: { option_id: "uuid" }` |
| MR | Multiple Response (multiple correct) | ✅ partial | `{ option_ids: ["uuid1", "uuid2"] }` |
| TF | True/False | ✅ | `{ value: true }` |
| FITB | Fill in the Blank | ✅ fuzzy | `{ accepted: ["answer1", "answer2"] }` |
| MATCH | Matching (drag-drop) | ✅ partial | `{ pairs: [{ left_id, right_id }] }` |
| ORDER | Ordering | ✅ | `{ order: ["id1","id2","id3"] }` |
| NUM | Numeric | ✅ | `{ value: 42.5, tolerance: 0.5 }` |
| SA | Short Answer | optional | `{ accepted: ["answer"], graded: false }` |
| ESSAY | Long Answer | ❌ manual | `{ rubric: "..." }` |
| TEXT | Text Block (no answer) | N/A | null |

Auto-grading logic in `POST /api/attempts/{id}/submit`:
- MC/TF: exact match option_id
- MR: partial credit = (correct_selected / total_correct) * points
- FITB: case-insensitive match against accepted[] list
- MATCH: partial credit per correct pair
- ORDER: full credit only if all correct
- NUM: abs(answer - value) <= tolerance
- SA: if graded=false → mark as correct automatically; if graded=true → add to manual queue
- ESSAY → always manual queue

---

## EXCEL IMPORT (`backend/utils/excel_import.py`)

Parse Excel files with this column structure:
- Col A: Question text OR `*` prefix (= correct answer) OR `POOL N` OR `END`
- Col B: Points (number) OR answer text OR `~N` (partial credit for matching)
- Col C: Options — `shuffle`, `norightshuffle`, `short`, `long`
- Col D: Explanation text
- Col E: Internal comment

**Detection rules:**
- Has `*` rows below → MC (one `*`) or MR (multiple `*`)
- Col B = number + Col C = `long` → Essay (graded)
- Col C = `short` → Short Answer
- Col C = `long` → Long Answer
- Col B has `~` prefix → Matching
- `POOL N` marker → Question Pool (random N from following questions)
- `END` → end pool
- No Col B/C → Text Block

Return list of Question objects (not yet saved — return for review first).

---

## EXCEL EXPORT (`backend/utils/excel_export.py`)

Generate Excel in same format as import. Must be round-trip compatible (export → import works).

---

## EXAM SETTINGS (`settings_json` on Exam table)

```json
{
  "pagination": "all_on_one",      // or "one_per_page"
  "navigation": "free_jump",       // or "forward_only"
  "inline_feedback": "none",       // none/correct_indicator/show_answer/full_with_explanation
  "shuffle_questions": true,
  "shuffle_options": true,
  "time_limit_minutes": null,      // null = unlimited
  "time_per_question_seconds": null,
  "max_attempts": null,            // null = unlimited
  "cooldown_minutes": 0,
  "browser_security": {
    "disable_copy_paste": false,
    "disable_right_click": false,
    "disable_print": false
  },
  "pass_threshold_pct": 60,
  "pass_message": "Chúc mừng bạn đã vượt qua!",
  "fail_message": "Bạn chưa đạt, hãy thử lại.",
  "result_display": "score",       // score/outline/correct_indicator/show_answer/show_explanation
  "review_window": "immediate",    // immediate/after_close/never
  "require_identifier": "name",    // name/email/student_id/none (for free tester)
  "certificate_enabled": false,
  "watermark_text": "",
  "language": "vi"
}
```

---

## EXAM PLAYER (Frontend — `/t/[token]` and `/exams/[id]/take`)

**Components needed:**
1. `ExamLanding` — identifier input, passcode input, start button
2. `ExamPlayer` — main exam UI
   - `ProgressBar` — % answered
   - `Timer` — countdown, red when <10%
   - `QuestionNavigator` — grid of question numbers (gray=unanswered, green=answered, blue=current, yellow=flagged)
   - `QuestionRenderer` — renders by type:
     - MC/MR: radio/checkbox list
     - TF: True/False buttons
     - FITB: text input (blank in sentence)
     - MATCH: dnd-kit drag-drop two columns
     - ORDER: dnd-kit sortable list
     - NUM: number input
     - SA/ESSAY: textarea
     - TEXT: read-only HTML block
   - `FlagButton` — mark for review
   - Auto-save every 30 seconds via `PUT /api/attempts/{id}/responses`
   - Submit confirmation dialog (shows count of unanswered)
3. `ResultPage`
   - Score summary (% + raw score + time taken)
   - Pass/Fail banner with custom message
   - Per-question review (per settings)
   - Retry button (if attempts remaining)
   - Print button
   - Download certificate button (if pass + enabled)

---

## ADMIN/EDITOR FRONTEND PAGES

```
/                          → Dashboard (stats widgets)
/projects                  → Project list
/projects/[id]             → Project detail (tabs: Documents | Questions | Exams | Results)
/projects/[id]/documents   → Upload + processing status
/projects/[id]/generate    → AI generation config + SSE streaming UI
/questions                 → Question bank (filter, search, bulk actions)
/questions/[id]/edit       → Question editor (TipTap rich text)
/exam-templates            → Template list
/exam-templates/[id]       → Blueprint editor (sections + criteria)
/exams                     → Exam list
/exams/[id]                → Exam editor (question list, swap, settings)
/exams/[id]/results        → Analytics + grading queue
/import                    → Excel/Word/PDF import wizard
/settings                  → AI provider config, org settings
/admin/users               → User management (admin only)
/admin/ai-usage            → Token/cost dashboard (admin only)
```

---

## FRONTEND — AI GENERATION UI (`/projects/[id]/generate`)

```jsx
// Config form
<GenerationConfig>
  <QuestionTypeSelector />          // checkboxes for 10 types, count per type
  <DifficultySlider />              // easy/medium/hard %
  <TopicFilter />                   // tag-based filter
  <ChapterFilter />                 // chapter filter
  <LanguageSelector />              // vi/en
  <IncludeExplanationToggle />
  <AIProviderOverride />            // optional override
  <GenerateButton />
</GenerationConfig>

// SSE streaming progress
<GenerationProgress>
  <StepIndicator steps={5} current={step} />
  <QuestionStream>
    // Questions appear one by one as AI generates them
    {streamedQuestions.map(q => <QuestionCard key={q.id} question={q} />)}
  </QuestionStream>
  <SummaryOnComplete />
</GenerationProgress>
```

---

## IMPORT/EXPORT

### Import flow:
1. Upload Excel/Word/PDF file
2. Backend parses → returns preview of detected questions
3. User reviews in table (can deselect rows)
4. Confirm → save to question bank

### Export endpoints return:
- **Excel:** openpyxl, same format as import template
- **Word (.docx):** python-docx, formatted exam with/without answer key
- **PDF:** WeasyPrint, print-ready
- **CSV (questions):** tabular, all fields
- **CSV (results):** TestMoz-compatible Point Grid + Response Grid
- **JSON:** full question data
- **QTI 1.2:** IMS standard XML

---

## ANALYTICS (`/exams/[id]/results`)

Display using Recharts:
- Score distribution histogram (bar chart, 10% buckets)
- Average score, median, pass rate
- Per-question table: question text, % correct, avg score, discrimination index
- Time heatmap: avg seconds per question (bar chart, sorted by time)
- Attempt timeline: submissions over time (line chart)

---

## ENVIRONMENT VARIABLES (`.env` / Coolify secrets)

```bash
# Infrastructure
DATABASE_URL=postgresql+asyncpg://user:pass@postgres:5432/examforge
REDIS_URL=redis://redis:6379/0
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=examforge
SECRET_KEY=<64-char-random-hex>
ALLOWED_ORIGINS=https://yourdomain.com
APP_PORT=8000
FRONTEND_URL=https://yourdomain.com

# AI Providers (set whichever you have)
OPENAI_API_KEY=
OPENAI_BASE_URL=
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=
OPENROUTER_API_KEY=
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
GOOGLE_API_KEY=
OLLAMA_BASE_URL=

# AI Config
AI_DEFAULT_PROVIDER=openrouter
AI_DEFAULT_MODEL=qwen/qwen3-235b-a22b-2507
AI_EMBEDDING_PROVIDER=openai
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_FALLBACK_CHAIN=anthropic,openai,openrouter
AI_MAX_TOKENS=8000
AI_TEMPERATURE=0.7
AI_TIMEOUT_SECONDS=30

# Email
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=noreply@yourdomain.com
```

---

## IMPLEMENTATION ORDER (for one-shot build)

Build in this order — each step depends on the previous:

1. **Infrastructure** — docker-compose.yml, all 6 services, health checks
2. **DB migrations** — Alembic, all tables above
3. **Auth** — register/login/JWT/OAuth endpoints
4. **AI Provider** — `backend/ai/provider.py` multi-provider abstraction
5. **Document pipeline** — upload to MinIO → Celery extract → chunk → embed → pgvector
6. **AI generation pipeline** — LangChain/LangGraph 5-step, SSE streaming
7. **Question CRUD** — all 10 types, import/export
8. **Exam Templates + Exam Engine** — blueprint → exam generation
9. **Exam Player** — test-taking UI, auto-save, submit, auto-grading
10. **Results & Analytics** — Recharts dashboards, export
11. **Admin UI** — users, AI usage, settings
12. **Frontend pages** — all editor/admin pages

---

## QUALITY REQUIREMENTS

- All API endpoints return proper HTTP status codes and error messages
- Auto-grading for all auto-gradeable types (MC, MR, TF, FITB, MATCH, ORDER, NUM)
- SSE streaming works for AI generation (test with 20 questions)
- Excel import round-trip: export → import produces identical questions
- Free tester flow works without login (token URL → take exam → see results)
- Responsive UI (mobile-friendly for test-taking pages)
- Vietnamese UI by default (`language=vi`), English available

---

## AFTER BUILD

1. Commit all files
2. Push to GitHub repo `phanvuhoang/examforge`
3. Reply "done" with summary of what was built and any limitations/TODOs

---

*Spec version: 1.0 | Based on ExamForge AI Product Specification v1.0*
