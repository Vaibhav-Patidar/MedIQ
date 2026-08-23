# MedIQ

**Ontology-driven early-warning system for Sepsis — Smart India Hackathon 2026, Team ByteSlay.**

MedIQ turns raw ICU vitals into a forward-looking risk trajectory, detects the intervention window while action still helps, explains *why* via SHAP, and adjusts its judgment using patient context (comorbidities, age) pulled from a connected patient ontology — not a flat form.

> **We are not replacing doctors. We are lowering their workload and reaction time.**

---

## The demo in one sentence

A diabetic ICU patient crosses risk **55** and an intervention window opens with a countdown and a SHAP explanation — while a non-diabetic patient at the *same* score stays silent, because the ontology knows the default threshold is **65**. That contrast (PRD F4) is the entire thesis: **the ontology changes the prediction, not just the display.**

## Quick start

**Prereqs:** Docker + Docker Compose

```bash
git clone git@github.com:Vaibhav-Patidar/MedIQ.git
cd MedIQ
cp .env.example .env        # fill in local secrets (JWT_SECRET etc.)

docker compose up --build   # postgres + neo4j + backend + frontend
docker compose exec backend python seed_data.py   # synthetic ontology + vitals + live predictions
```

| URL | What |
|---|---|
| http://localhost:8000/docs | FastAPI Swagger UI (all endpoints) |
| http://localhost:8000/api/health | Health check `{status, postgres, neo4j}` |
| http://localhost:7474 | Neo4j browser (ontology graph) |
| http://localhost:5173 | Frontend placeholder (React app mounts here) |

**Seeded login:** `doctor@mediq.local` (password in `.env` → `SEED_CLINICIAN_PASSWORD`, default `mediq-demo`).

The seed script prints the Journey B contrast (diabetic vs non-diabetic patient at ~the same risk score) so you can verify the payoff before every rehearsal.

## Features (PRD F1–F8)

| # | Feature | Status |
|---|---|---|
| F1 | Patient ontology object (vitals + conditions + meds + clinician in one graph record) | ✅ |
| F2 | Vitals ingestion → risk score + 6h trajectory once ≥2h of data exists | ✅ |
| F3 | Intervention window detection + live countdown + WebSocket alerts | ✅ |
| F4 | Comorbidity-adjusted thresholds (Diabetic→55, Elderly>65y→60, lowest wins, default 65) | ✅ |
| F5 | SHAP explainability panel (top 5 drivers, clinical thresholds, direction) | ✅ |
| F6 | Intervention logging + manual outcome feedback loop | ✅ |
| F7 | Ontology graph view (`GET /api/patients/{id}/graph`, React Flow-ready) | ✅ API |
| F8 | MRI / Alzheimer's progression (upload stub + mock prediction) | 🟡 stub |

## Architecture

```
React (5173) ──REST/WS──► FastAPI (8000)
                            ├── PostgreSQL ── source of truth (patients, vitals, snapshots, windows…)
                            ├── Neo4j ────── ontology traversal (graph view, similar patients,
                            │                 clinician routing) [postgres_fk fallback: ADR-002]
                            └── ML layer ─── TFT checkpoint OR deterministic surrogate
                                             + LightGBM/SHAP explainability
```

- **Synchronous inference** (ADR-003): vitals POST that completes ≥2h of history triggers prediction as a FastAPI background task — no Celery/Redis.
- **Stateless JWT auth** (ADR-004): bearer tokens, WS handshake via `?token=` or subprotocol.
- **Ontology fallback** (ADR-002): flip `ONTOLOGY_BACKEND=postgres_fk` in `.env` and `/graph` serves identical JSON from Postgres FK joins.
- Full spec set lives in [`docs/`](docs/) — start with `docs/01-PRD.md` and `docs/04-tech-spec.md`.

## Tests

```bash
cd backend
pip install -r requirements.txt
pytest tests -q          # 56 tests: threshold logic, window math, SHAP formatting,
                         # validation, PSV conversion + API integration flows
```

Priority target (docs/09-testing-strategy.md §1): the comorbidity threshold contrast — see
`tests/unit/test_threshold_logic.py` and `test_journey_b_diabetic_window_vs_nondiabetic_none`.

## Loading your trained model

Drop the TFT export into `backend/checkpoints/` (see the [README there](backend/checkpoints/README.md)),
set `SEPSIS_CHECKPOINT_PATH`, uncomment `torch` / `pytorch-forecasting` / `shap` /
`lightgbm` in `backend/requirements.txt`, rebuild. Without a checkpoint the API runs a
deterministic clinical surrogate so the entire demo works pre-training — startup never crashes on missing weights.

## Security posture (prototype scope)

Synthetic data only; bcrypt-hashed passwords (never logged); JWT bearer auth on all `/api/*`
except `/api/health`; parameterized SQL/Cypher only; Pydantic validation incl. clinical-range
bounds; upload extension+size limits. Object-level auth simplified to “any authenticated
clinician” for the demo — flagged gap, see `docs/08-security-spec.md` §4.

## Team ByteSlay

Bhumika Jain (Frontend) · Vaibhav Patidar (ML) · Anirudh Tandon (Backend) · Aryan Sharma (ML/MRI) · Parth Agarwal (Database) · Kamal Kumar Kasaudhan (DevOps)

📄 **Full project map & build walkthrough:** [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
