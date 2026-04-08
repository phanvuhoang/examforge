from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://legaldb_user:PbSV8bfxQdta4ljBsDVtZEe74yjMG6l7uW3dSczT8Iaajm9MKX07wHqyf0xBTTMF@10.0.1.11:5432/examforge"

    # Redis
    REDIS_URL: str = "redis://10.0.1.2:6379/2"

    # MinIO
    MINIO_ENDPOINT: str = "10.0.1.13:9000"
    MINIO_ACCESS_KEY: str = "examforge"
    MINIO_SECRET_KEY: str = "8317cded2ef722e6be3461272419e894a6790535"
    MINIO_BUCKET: str = "examforge"
    MINIO_USE_SSL: bool = False

    # App
    SECRET_KEY: str = "change-me-to-64-char-random-hex"
    ALLOWED_ORIGINS: str = "https://examforge.gpt4vn.com"
    FRONTEND_URL: str = "https://examforge.gpt4vn.com"
    APP_PORT: int = 8000

    # JWT
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # AI Providers
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_BASE_URL: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_BASE_URL: Optional[str] = "https://claudible.io"
    OPENROUTER_API_KEY: Optional[str] = None
    DEEPSEEK_API_KEY: Optional[str] = None
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    GOOGLE_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: Optional[str] = None

    # AI Config
    AI_DEFAULT_PROVIDER: str = "openrouter"
    AI_DEFAULT_MODEL: str = "qwen/qwen3-235b-a22b-2507"
    AI_EMBEDDING_PROVIDER: str = "openai"
    AI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    AI_FALLBACK_CHAIN: str = "anthropic,openai,openrouter"
    AI_MAX_TOKENS: int = 8000
    AI_TEMPERATURE: float = 0.7
    AI_TIMEOUT_SECONDS: int = 30

    # Email
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 465
    SMTP_USER: Optional[str] = None
    SMTP_PASS: Optional[str] = None
    FROM_EMAIL: str = "noreply@gpt4vn.com"

    @property
    def ai_provider_and_model(self) -> tuple[str, str]:
        """Parse AI_DEFAULT_MODEL if it contains provider prefix like 'anthropic/model-name'"""
        model = self.AI_DEFAULT_MODEL
        provider = self.AI_DEFAULT_PROVIDER
        if '/' in model and not model.startswith('gpt') and not model.startswith('claude'):
            known_providers = {'openai', 'anthropic', 'openrouter', 'deepseek', 'google', 'ollama'}
            parts = model.split('/', 1)
            if parts[0] in known_providers:
                provider = parts[0]
                model = parts[1]
        return provider, model

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @property
    def fallback_chain_list(self) -> list[str]:
        return [p.strip() for p in self.AI_FALLBACK_CHAIN.split(",")]

    @property
    def sync_database_url(self) -> str:
        return self.DATABASE_URL.replace("+asyncpg", "")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
