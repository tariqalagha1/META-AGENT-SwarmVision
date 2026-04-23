from __future__ import annotations

from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    SERVICE_NAME: str = 'meta-agent'
    SERVICE_VERSION: str = '1.0.0'
    SCHEMA_VERSION: str = '1.0'

    META_MODE: Literal['passive'] = 'passive'
    META_DEBUG: bool = False
    META_SHARED_SECRET: str | None = None
    META_REQUIRE_AUTH_IN_PROD: bool = False

    ANALYZE_TIMEOUT_MS: int = Field(default=800, ge=50, le=5_000)
    HEURISTIC_TIMEOUT_MS: int = Field(default=500, ge=50, le=5_000)

    RATE_LIMIT_PER_IP: str = '10/second'
    MAX_ANALYZE_BODY_BYTES: int = 512 * 1024

    NEO4J_URI: str = 'bolt://neo4j:7687'
    NEO4J_USER: str = 'neo4j'
    NEO4J_PASSWORD: SecretStr = SecretStr('password')
    NEO4J_DATABASE: str = 'neo4j'

    @model_validator(mode='after')
    def validate_security(self) -> 'Settings':
        if self.META_REQUIRE_AUTH_IN_PROD and not self.META_SHARED_SECRET:
            raise ValueError('META_SHARED_SECRET is required when META_REQUIRE_AUTH_IN_PROD=true')
        return self


settings = Settings()
