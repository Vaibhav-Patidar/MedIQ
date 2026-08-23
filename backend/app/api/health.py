from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from app.db import ping_postgres
from app.models.schemas import HealthResponse
from app.ontology.neo4j_client import client as neo4j

router = APIRouter(tags=["health"])


def _neo4j_up() -> bool:
    try:
        rows = neo4j.run("RETURN 1 AS one")
        return bool(rows)
    except Exception:
        return False


@router.get("/api/health", response_model=HealthResponse)
def health():
    """docs/11-observability-spec.md Section 3 — unauthenticated; used by the
    Docker Compose healthcheck and the pre-demo `curl localhost:8000/api/health`."""
    postgres_up = ping_postgres()
    neo4j_up = _neo4j_up() if neo4j.enabled else False
    return HealthResponse(
        status="ok" if (postgres_up and neo4j_up) else "degraded",
        postgres="up" if postgres_up else "down",
        neo4j="up" if neo4j_up else "down",
    )
