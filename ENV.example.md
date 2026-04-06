# ENV.example.md — Environment Variables Template

Copy file này, đặt tên `.env`, điền giá trị thật vào.  
**Credentials thật lưu riêng — hỏi admin khi cần.**

## Infrastructure

```
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:5432/examforge
REDIS_URL=redis://<host>:6379/2
MINIO_ENDPOINT=<host>:9000
MINIO_ACCESS_KEY=<access-key>
MINIO_SECRET_KEY=<secret-key>
MINIO_BUCKET=examforge
MINIO_USE_SSL=false
```

## App

```
SECRET_KEY=<generate: openssl rand -hex 32>
ALLOWED_ORIGINS=https://examforge.gpt4vn.com
FRONTEND_URL=https://examforge.gpt4vn.com
APP_PORT=8000
```

## AI Providers (điền provider nào có)

```
OPENAI_API_KEY=
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=
DEEPSEEK_API_KEY=
GOOGLE_API_KEY=
```

## AI Config

```
AI_DEFAULT_PROVIDER=openrouter
AI_DEFAULT_MODEL=qwen/qwen3-235b-a22b-2507
AI_EMBEDDING_PROVIDER=openai
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_FALLBACK_CHAIN=anthropic,openai,openrouter
AI_MAX_TOKENS=8000
AI_TEMPERATURE=0.7
AI_TIMEOUT_SECONDS=30
```

## Email (optional)

```
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=noreply@gpt4vn.com
```

## Infrastructure Notes

| Service | Internal IP | Notes |
|---|---|---|
| PostgreSQL 16 + pgvector | 10.0.1.11:5432 | DB `examforge`, pgvector enabled |
| Redis 7 | 10.0.1.2:6379 | DB index 2 |
| MinIO | 10.0.1.13:9000 | Bucket `examforge` |

> App container phải join Docker network `coolify` để reach internal IPs.
