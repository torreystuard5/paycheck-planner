from pydantic import model_validator
from pydantic_settings import BaseSettings


APP_VERSION = "0.1.0"


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SUPPORT_EMAIL: str = "spsoftwaresolutionsllc@gmail.com"
    FRONTEND_URL: str = "http://localhost:5173"
    INITIAL_ADMIN_EMAIL: str | None = None
    NOTES_ENCRYPTION_KEY: str | None = None
    CURRENT_TOS_VERSION: str = "1.0"

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
