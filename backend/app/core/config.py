from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # PostgreSQL
    database_url: str = "postgresql://mediq:mediq@localhost:5432/mediq"

    # Neo4j
    neo4j_url: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "mediq"

    # ADR-002: 'neo4j' (default) or 'postgres_fk' fallback. Single flag flips
    # the ontology layer with no code changes.
    ontology_backend: str = "neo4j"

    # Auth (ADR-004)
    jwt_secret: str = "insecure-dev-secret-change-me"
    jwt_expires_in: int = 3600
    jwt_algorithm: str = "HS256"

    # Sepsis prediction
    min_inference_hours: float = 2.0
    window_duration_hours: float = 4.0
    trajectory_hours: int = 6
    sepsis_checkpoint_path: str | None = None

    # MRI upload stub
    mri_upload_dir: str = "./uploads"
    mri_max_upload_mb: int = 200

    # Seed login
    seed_clinician_email: str = "doctor@mediq.local"
    seed_clinician_password: str = "mediq-demo"

    # Misc
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def use_neo4j(self) -> bool:
        return self.ontology_backend.lower() == "neo4j"


@lru_cache
def get_settings() -> Settings:
    return Settings()
