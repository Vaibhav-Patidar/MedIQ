# MedIQ

**Ontology-driven early-warning system for Sepsis, built for Smart India Hackathon 2026 — Team ByteSlay.**

MedIQ turns raw ICU vitals into a forward-looking risk trajectory, detects the window where intervention is still likely to help, explains *why* via SHAP, and adjusts its judgment using patient context (comorbidities, age) pulled from a connected patient ontology — not a flat form. We are not replacing doctors; we're lowering their workload and reaction time.

---

## Doc Set

This repo's `/docs` (or wherever these files live) contains the full spec set this build follows:

| Doc | Purpose |
|---|---|
| `01-PRD.md` | What we're building, for whom, and why — features, acceptance criteria, explicit out-of-scope |
| `02-UX-flow-spec.md` | Screens, navigation, user journeys, UI states |
| `03-design-spec.md` | Visual system — colors, type, components, responsive, accessibility |
| `04-tech-spec.md` | Architecture, stack, data flow, hackathon simplifications |
| `05-api-spec.md` | Every endpoint, exact request/response JSON shapes, error codes |
| `06-database-spec.md` | PostgreSQL schema + Neo4j ontology schema, Cypher patterns |
| `07-ADRs.md` | Why we chose what we chose (and the fallbacks if something risks the timeline) |
| `08-security-spec.md` | Auth, secrets, input validation, threat model (scaled to a synthetic-data prototype) |
| `09-testing-strategy.md` | What's unit/integration/E2E tested, and the pre-demo manual checklist |
| `10-deployment-spec.md` | Docker Compose bring-up, env vars, demo-day contingency plan |
| `11-observability-spec.md` | Logging, health checks, what to watch during rehearsal |

Read `01-PRD.md` and `04-tech-spec.md` first if you're new to the project.

---

## Quick Start (local dev)

**Prereqs:** Docker + Docker Compose, Python 3.11+, Node 20+.

```bash
git clone <repo-url>
cd mediq
cp .env.example .env              # fill in local secrets — see 10-deployment-spec.md §1.3

docker compose up --build         # postgres, neo4j, backend (FastAPI), frontend (React)
docker compose exec backend python seed_data.py   # loads synthetic ontology data + PSV-converted sepsis vitals
```

- Frontend: http://localhost:5173
- API + Swagger docs: http://localhost:8000/docs
- Neo4j browser: http://localhost:7474
- Health check: `curl http://localhost:8000/api/health`

## Project Structure (target)

```
mediq/
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI routers (patients, vitals, predictions, alerts, interventions)
│   │   ├── ml/              # TFT model, SHAP explainer, window-detection + threshold logic
│   │   ├── ontology/        # Neo4j client + Cypher queries
│   │   ├── models/          # SQLAlchemy models + Pydantic schemas
│   │   └── main.py
│   ├── seed_data.py
│   ├── schema.sql
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── screens/         # Dashboard, PatientDetail, AlertCenter, Login
│   │   ├── components/      # RiskTrajectoryChart, InterventionTimer, SHAPExplanationBar, ...
│   │   ├── store/           # Zustand stores
│   │   └── api/             # typed API client matching 05-api-spec.md
│   └── package.json
├── data/
│   ├── physionet_sepsis/    # raw + PSV-converted
│   └── ontology_seed/       # synthetic patient/clinician/comorbidity JSON
├── docs/                    # this doc set
├── docker-compose.yml
├── .env.example
└── README.md
```

## Data Sources

- **Sepsis vitals:** PhysioNet / CinC Challenge 2019 — converted to PSV internally before feeding the TFT model (doctors and the frontend never see PSV directly; see `04-tech-spec.md` Section 3).
- **MRI (stretch, Alzheimer's module):** ADNI + OASIS-3.
- **Patient demographics, comorbidities, clinicians, medications:** synthetic — hand-authored to match the schema in `06-database-spec.md`, loaded via `seed_data.py`.

## Team

| Member | Primary | Secondary |
|---|---|---|
| Bhumika Jain | Frontend (React, Dashboard, Charts) | UI/UX design |
| Vaibhav Patidar | ML (TFT Sepsis model) | Data pipeline |
| Anirudh Tandon | Backend (FastAPI, API design) | Auth, WebSockets |
| Aryan Sharma | ML (Alzheimer's CNN, MONAI) | SHAP explainability |
| Parth Agarwal | Database (PostgreSQL + Neo4j) | Ontology design |
| Kamal Kumar Kasaudhan | DevOps (Docker, deployment) | Alert system, integration |

## Build Order (3 Days)

Follow `01-PRD.md` feature order and `07-ADRs.md` ADR-001: Sepsis + Ontology payoff (F1–F6) must be fully working and rehearsed before touching the Alzheimer's/MRI stretch module (F7–F8). See `09-testing-strategy.md` Section 6 for the pre-demo checklist to run before every rehearsal.

## Contributing (hackathon-scale)

- Branch per feature, PR into `main`, at least one teammate review before merge given the short timeline.
- Keep `05-api-spec.md` as the source of truth for request/response shapes — if backend and frontend disagree, the spec wins; update the spec deliberately, don't let it drift silently.
- Run the manual QA checklist (`09-testing-strategy.md` §6) before any demo rehearsal, not just before the final judging session.
