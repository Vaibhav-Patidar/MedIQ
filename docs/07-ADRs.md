# MedIQ — Architecture Decision Records (ADRs)

Format: Context → Decision → Consequences. Each ADR is immutable once accepted; if a later ADR reverses one, it says so explicitly rather than editing history.

---

## ADR-001: Sepsis-first scope, Alzheimer's as stretch goal

**Context:** The full architecture covers two disease modules (Sepsis, Alzheimer's). The team has 3 days, not 3 weeks. MRI/ADNI/OASIS-3 data and approvals are already in hand, so the module isn't blocked by data — it's blocked by time.

**Decision:** Build the Sepsis + Ontology flow completely first (PRD F1–F6). Only attempt the Alzheimer's/MRI view (F7–F8) after the Sepsis flow and the comorbidity-adjustment demo are fully working and rehearsed.

**Consequences:** If Alzheimer's doesn't make it into the demo, the pitch still stands on its own — "ontology changes a critical-care prediction in real time" is a complete, judgeable story. If Sepsis is left half-working in favor of a half-working Alzheimer's view, the team has two broken demos instead of one solid one. This ordering is the actual protection against that failure mode.

---

## ADR-002: PostgreSQL-only fallback if Neo4j setup risks the timeline

**Context:** Neo4j is the architecturally "correct" ontology store, but standing up a graph DB, learning Cypher under time pressure, and wiring it to FastAPI is real setup risk in a 3-day window. The demo's actual requirement is that comorbidities visibly change a prediction — not that the storage engine is a graph database.

**Decision:** Default to Neo4j (Docker, minimal setup time). If Day 1 ends without Neo4j reads/writes working end-to-end, fall back to modeling the same relationships as foreign keys in PostgreSQL (`patient_comorbidities`, `patient_diseases`, etc. — see `06-database-spec.md`), and expose an identical `/patients/{id}/graph` JSON shape from the API regardless of backing store.

**Consequences:** The frontend and the demo narrative are unaffected either way, because they only ever talk to the API contract in `05-api-spec.md`, not to Neo4j or Postgres directly. The graph *visualization* (React Flow) still works from FK-derived JSON. What is lost in the fallback: genuine Cypher traversal for `SIMILAR_TO` clustering — acceptable, since PRD F8 already allows hardcoding one similar-patient example for the demo.

---

## ADR-003: Synchronous inference instead of Celery + Redis task queue

**Context:** The production architecture uses Celery + Redis for async ML jobs so the API isn't blocked during inference. For a hackathon demo with a handful of seeded patients and no concurrent user load, this is infrastructure the team would spend a day configuring and testing, for a benefit (non-blocking API under load) that doesn't materialize in a single-judge demo session.

**Decision:** Run inference as a synchronous call inside the FastAPI request/background-task, without a separate broker.

**Consequences:** Slightly higher latency on the vitals-POST-that-triggers-inference request (still sub-second for a TFT model on this input size). If the team later scales past the hackathon, reintroducing Celery is additive, not a rewrite — the ML service boundary already exists per `04-tech-spec.md` Section 3.

---

## ADR-004: JWT-based auth instead of session cookies

**Context:** The frontend is a decoupled React SPA talking to a FastAPI backend, potentially over WebSocket too. Session cookies add CSRF surface and cookie-domain complexity for a demo that may be shown from a laptop over a projector network.

**Decision:** Stateless JWT bearer tokens (see `08-security-spec.md`), issued at login, sent in `Authorization` header and as a query/subprotocol param for the WebSocket handshake.

**Consequences:** No server-side session store needed — simpler for a 3-day build. Token revocation before natural expiry isn't supported in the prototype; acceptable since there's no production user base yet.

---

## ADR-005: FastAPI over a Node/Express backend

**Context:** The backend needs to serve both conventional REST endpoints and directly host/orchestrate PyTorch model inference (TFT, SHAP).

**Decision:** FastAPI (Python), so the API layer and the ML layer share one language and one process boundary during the hackathon, instead of a REST-to-microservice hop between a Node API and a Python ML service.

**Consequences:** Faster to build in 3 days (no cross-language serialization/service boilerplate). Async support and automatic OpenAPI docs (`/docs`) also directly satisfy the "API Specification" deliverable's request for a Swagger surface. Trade-off: if the team later needs to scale the ML workload independently of the API (as the full architecture's separate "ML Service" implies), that split happens post-hackathon.

---

## ADR-006: Recharts over D3 for the primary risk trajectory chart

**Context:** The architecture doc lists "Recharts + D3." Under time pressure, hand-rolled D3 is powerful but slow to build correctly (axis handling, confidence bands, dotted-forecast-vs-solid-history split).

**Decision:** Use Recharts for the Risk Trajectory Card and SHAP bar chart (both are standard chart shapes Recharts supports natively). Reserve D3 only for the Ontology Graph View if React Flow's built-in rendering isn't sufficient — likely unnecessary since React Flow handles its own rendering.

**Consequences:** Faster implementation of `03-design-spec.md`'s data visualization rules (Section 7) with less custom code, at the cost of slightly less visual customization than raw D3 would allow. Acceptable given the design spec's flat/structured aesthetic doesn't require D3-level customization anyway.

---

## ADR-007: No migration tool (Alembic) for the hackathon build

**Context:** Alembic is the correct production tool for PostgreSQL schema evolution but adds setup and workflow overhead not justified by a 3-day, single-environment build where the schema is authored once up front (`06-database-spec.md`).

**Decision:** Apply `schema.sql` directly via a Docker Compose init script. Revisit Alembic only if the project continues past the hackathon.

**Consequences:** Any schema change requires a manual re-apply/reset of the dev database rather than a versioned migration — acceptable at this scale and timeline.
