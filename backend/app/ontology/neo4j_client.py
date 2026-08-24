import logging
from typing import Any

from app.core.config import get_settings
from app.ontology import cypher

logger = logging.getLogger("mediq.neo4j")


class Neo4jClient:
    """Thin wrapper over the neo4j driver. Every method is a no-op (returns
    None / empty) when ONTOLOGY_BACKEND != 'neo4j' so the whole codebase can
    call it unconditionally and ADR-002's fallback needs zero branching at
    call sites."""

    def __init__(self) -> None:
        self._driver = None

    @property
    def enabled(self) -> bool:
        return get_settings().use_neo4j

    def connect(self) -> None:
        if not self.enabled or self._driver is not None:
            return
        try:
            from neo4j import GraphDatabase

            settings = get_settings()
            self._driver = GraphDatabase.driver(
                settings.effective_neo4j_url,
                auth=(settings.effective_neo4j_user, settings.neo4j_password),
            )
            self._driver.verify_connectivity()
            session_kwargs = {"database": settings.neo4j_database} if settings.neo4j_database else {}
            with self._driver.session(**session_kwargs) as session:
                session.run(cypher.CREATE_PATIENT_CONSTRAINT)
                session.run(cypher.CREATE_CLINICIAN_CONSTRAINT)
            logger.info("neo4j connected at %s", settings.effective_neo4j_url)
        except Exception as exc:
            logger.warning("neo4j unavailable (%s) — graph writes/reads disabled", exc)
            self._driver = None

    def close(self) -> None:
        if self._driver is not None:
            try:
                self._driver.close()
            finally:
                self._driver = None

    def _session(self):
        if not self.enabled:
            return None
        # --- GLUE --- lazy reconnect: a failed startup attempt (e.g. Neo4j
        # still booting after a recreate) must not disable the graph layer for
        # the process lifetime.
        if self._driver is None:
            self.connect()
        if self._driver is None:
            return None
        settings = get_settings()
        session_kwargs = {"database": settings.neo4j_database} if settings.neo4j_database else {}
        return self._driver.session(**session_kwargs)

    def run(self, query: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        session = self._session()
        if session is None:
            return []
        try:
            return [record.data() for record in session.run(query, params or {})]
        except Exception as exc:
            logger.warning("cypher query failed: %s", exc)
            return []

    def run_raw(self, query: str, params: dict[str, Any] | None = None) -> list[Any]:
        """Like run(), but keeps native neo4j Node/Relationship objects so
        callers can read .labels / element ids (needed for graph rendering)."""
        session = self._session()
        if session is None:
            return []
        try:
            return list(session.run(query, params or {}))
        except Exception as exc:
            logger.warning("cypher query failed: %s", exc)
            return []

    # --- convenience wrappers ------------------------------------------------

    def get_patient_context(self, patient_id: str) -> dict | None:
        rows = self.run(cypher.PATIENT_CONTEXT, {"id": str(patient_id)})
        return rows[0] if rows else None

    def find_available_clinician(self, patient_id: str) -> dict | None:
        rows = self.run(cypher.FIND_AVAILABLE_CLINICIAN, {"id": str(patient_id)})
        return rows[0]["c"] if rows else None

    def get_patient_graph(self, patient_id: str) -> list[Any]:
        return self.run_raw(cypher.PATIENT_GRAPH, {"id": str(patient_id)})


client = Neo4jClient()
