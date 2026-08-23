# MedIQ — Technical Specification

This spec adapts `mediq_architecture.md` (the full production architecture) into a build plan achievable in **3 days**. Where the full architecture is simplified for the hackathon, it's marked **[HACKATHON]**.

---

## 1. System Architecture

```
+------------------------------------------------------------------+
|                        FRONTEND (React + TS)                     |
|   Doctor Dashboard | Patient Detail | Alert Center | (Graph view) |
+------------------------------------------------------------------+
                              |
                     REST API / WebSocket
                              |
+------------------------------------------------------------------+
|                     BACKEND (FastAPI)                            |
|   Auth  |  Patient API  |  Prediction API  |  Alert Engine        |
+------------------------------------------------------------------+
                              |
         +--------------------+--------------------+
         |                    |                    |
+----------------+  +------------------+  +------------------+
| ONTOLOGY LAYER |  |   ML LAYER       |  |  ACTION LAYER    |
| (Neo4j Graph)  |  | Sepsis TFT Model |  | Alert Router     |
+----------------+  | SHAP Explainer   |  | Intervention Log |
                     | Window Detector  |  +------------------+
                     +------------------+
         |
+------------------------------------------------------------------+
|          DATA LAYER: PostgreSQL | Neo4j | (MinIO — stretch only)  |
+------------------------------------------------------------------+
```

## 2. Stack

### Backend
| Component | Technology | Notes |
|---|---|---|
| API framework | FastAPI (Python) | async, auto OpenAPI docs |
| ML runtime | PyTorch + PyTorch Forecasting | TFT model |
| Graph DB | Neo4j (Community, Docker) | ontology |
| Relational DB | PostgreSQL | structured records, audit |
| Object storage | MinIO **[HACKATHON: only if MRI module is built; else local disk]** | MRI scans |
| Task queue | **[HACKATHON: run inference synchronously / simple asyncio background task instead of Celery+Redis]** | full architecture uses Celery + Redis |
| Containerization | Docker Compose | single `docker-compose.yml` for the whole stack |

### ML / Data Science
| Component | Technology |
|---|---|
| Sepsis model | Temporal Fusion Transformer (`pytorch-forecasting`), trained on PhysioNet/CinC 2019 |
| Alzheimer's model (stretch) | 3D ResNet-18 (MONAI) |
| Explainability | `shap` (DeepExplainer) |
| Preprocessing (MRI, stretch) | nibabel + a lightweight skull-strip; full FSL/ANTs pipeline **[HACKATHON: skip, use pre-cleaned ADNI/OASIS-3 volumes if time-boxed]** |
| Validation | Pydantic schemas shared between API and ML service |

### Frontend
| Component | Technology |
|---|---|
| Framework | React + TypeScript |
| State | Zustand |
| Charts | Recharts |
| Graph view (stretch) | React Flow |
| Styling | Tailwind CSS + Radix UI, per `03-design-spec.md` tokens |
| Real-time | native WebSocket client |

### Infra **[HACKATHON simplified]**
| Component | Technology |
|---|---|
| Reverse proxy | Nginx (only if deploying publicly; skip for local demo) |
| Orchestration | Docker Compose only — no K8s |
| Monitoring | Skip Prometheus/Grafana; console/log-based checks only (see `11-observability-spec.md`) |
| CI/CD | Optional GitHub Actions for lint/test on push |

## 3. Data Flow — Sepsis (build this first, end to end)

```
[Doctor UI] --POST /api/patients/{id}/vitals--> [FastAPI]
   -> validate + store VitalReading in Postgres
   -> upsert VitalReading node in Neo4j, linked to Patient
   -> if >= 2h of readings: trigger inference (sync call for hackathon)
        [ML Service]
          -> query Neo4j for last 12h VitalReadings + static Patient context
          -> assemble TFT input, convert internally to PSV format
          -> run TFT inference -> risk_score, trajectory, window_open, hours_remaining
          -> run SHAP explainer -> top features
        [Ontology write-back]
          -> create ProgressionState node; create InterventionWindow if open
        [Action layer]
          -> query assigned Clinician; if unavailable, pick next available of same specialty
          -> push WebSocket event to /ws/alerts
[Doctor receives alert] -> logs intervention -> POST /api/patients/{id}/interventions
   -> Intervention node created in Neo4j + row in Postgres
```

MRI/Alzheimer's flow mirrors this (see `mediq_architecture.md` Section 6) — build only after the above is solid.

## 4. Frontend Architecture

```
App
├── Auth
│   └── Login Screen
├── Dashboard
│   ├── Active Alerts Panel (WebSocket)
│   ├── Patient List
│   └── Quick Stats
├── Patient Detail View
│   ├── Patient Header
│   ├── Vitals Timeline (Sepsis)
│   │   ├── Real-time vitals graph
│   │   ├── Risk score trajectory
│   │   ├── Intervention window countdown
│   │   └── SHAP explanation card
│   ├── MRI Progression View (stretch)
│   ├── Ontology Graph View (stretch)
│   └── Intervention History
└── Alert Center
```

Component contracts (exact JSON shapes each component consumes) are defined in `05-api-spec.md` — build against those, not against the architecture doc's prose description.

## 5. Ontology Layer — Why Neo4j, and What It Actually Buys the Demo

The **entire value proposition of the hackathon pitch** is: "the ontology changes the prediction, not just the display." Concretely, in the 3-day build this means:

1. Patient node has a `comorbidities` list.
2. Before calling the TFT model, the backend checks `comorbidities` and adjusts the `risk_score` threshold used for `window_open` (diabetic → 55, elderly >65 → 60, default → 65). This logic can live in a simple Python function reading from Postgres/Neo4j — it does not need to be "smart," it needs to be **visibly true** in the demo (see PRD F4, UX Journey B).
3. If Neo4j setup risk threatens the 3-day timeline, **[HACKATHON fallback]**: model the graph relationships as foreign keys in PostgreSQL and expose the same "ontology context" JSON shape from the API. The frontend and judges cannot tell the difference; only the storage engine changes. Document this explicitly as a fallback, not a silent scope cut (see ADR-002).

## 6. Environments

- **Local dev only** for the 3-day build. `docker-compose up` brings up Postgres, Neo4j, FastAPI, and the React dev server.
- No staging/prod split needed for a hackathon demo; see `10-deployment-spec.md` for the (optional) public demo deployment path.
