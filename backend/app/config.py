from pydantic import model_validator
from pydantic_settings import BaseSettings


APP_VERSION = "0.9.0"


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SUPPORT_EMAIL: str = "spsoftwaresolutionsllc@gmail.com"
    # Comma-separated origins for CORS. See main.py for merge with paydrift.net.
    FRONTEND_URL: str = "http://localhost:5173"
    # Optional extra dev origin (also read in main.py via os.environ for CORS).
    FRONTEND_ORIGIN: str | None = None
    INITIAL_ADMIN_EMAIL: str | None = None
    NOTES_ENCRYPTION_KEY: str | None = None
    CURRENT_TOS_VERSION: str = "1.0"

    # Cloudflare R2 storage (all optional — app boots fine without them)
    R2_ACCOUNT_ID: str | None = None
    R2_ACCESS_KEY_ID: str | None = None
    R2_SECRET_ACCESS_KEY: str | None = None
    R2_BUCKET_NAME: str | None = None
    R2_ENDPOINT_URL: str | None = None
    R2_PUBLIC_BASE_URL: str | None = None
    R2_PRESIGNED_URL_TTL: int = 900
    R2_MAX_UPLOAD_BYTES: int = 10_485_760  # 10MB for receipt/bill uploads

    # Stripe (optional — checkout disabled when unset)
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_PUBLISHABLE_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @model_validator(mode="after")
    def normalize_database_url(self) -> "Settings":
        """Ensure DATABASE_URL uses the postgresql+asyncpg:// scheme."""
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            self.DATABASE_URL = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and "+asyncpg" not in url:
            self.DATABASE_URL = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self


settings = Settings()
