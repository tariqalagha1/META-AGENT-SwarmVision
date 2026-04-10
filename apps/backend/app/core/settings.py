"""Runtime settings for SwarmVision backend services."""

from functools import lru_cache
import os

from pydantic import BaseModel

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - optional convenience only
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()


class Settings(BaseModel):
    """Application configuration loaded from environment variables."""

    neo4j_enabled: bool = os.getenv("NEO4J_ENABLED", "true").lower() == "true"
    neo4j_uri: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_username: str = os.getenv("NEO4J_USERNAME", "neo4j")
    neo4j_password: str = os.getenv("NEO4J_PASSWORD", "password")
    neo4j_database: str = os.getenv("NEO4J_DATABASE", "neo4j")
    neo4j_connect_timeout: float = float(os.getenv("NEO4J_CONNECT_TIMEOUT", "3"))
    replay_default_window_minutes: int = int(
        os.getenv("REPLAY_DEFAULT_WINDOW_MINUTES", "60")
    )


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings."""

    return Settings()
