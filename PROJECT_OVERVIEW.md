# MedIQ — Project Overview & Code Map

**What this document is:** the single place that says *what is where*, *what is done*,
and *how the whole system fits together*. Companion to `README.md` (quick start) and
the binding spec set in `docs/` (01–12).

Status legend: ✅ done & verified · 🟡 stub per spec · ⛔ out of scope (PRD §8)

---

## 1. What MedIQ is

A sepsis early-warning prototype for Smart India Hackathon 2026 (Team ByteSlay).
ICU vitals stream in → once ≥2h of history exists, a risk score + 6-hour trajectory
is produced → when risk crosses a **patient-specific threshold**, an intervention
window opens with a countdown → SHAP shows which vitals are driving it → the doctor
logs the intervention → everything is mirrored into an ontology graph.

The demo's core claim (PRD F4): **a diabetic patient opens a window at risk >55
while a non-diabetic patient at ~57 stays silent (default threshold 65).**

---

## 2. Repository map

```
mediq/
├── README.md                  GitHub front page: quick start, features, architecture
├── PROJECT_OVERVIEW.md        ← you are here
├── docker-compose.yml         postgres + neo4j + backend + frontend (+ volumes, healthchecks)
├── .env.example               every env var documented; copy to .env (git-ignored)
├── .gitignore                 hides .env, uploads, caches… (model bundle IS committed)
├── training/
│   └── mediq_tft_resume_training_v2.ipynb    TFT training notebook (model provenance)
│
├── backend/
│   ├── Dockerfile             python:3.11-slim, uvicorn, curl for healthcheck
│   ├── requirements.txt       runtime deps (+ commented heavy torch/shap/lgbm stack)
│   ├── pytest.ini             pytest config (testpaths=tests)
│   ├── schema.sql             EXACT DDL from docs/06-database-spec.md §1, applied by the
│   │                          postgres container init script (ADR-007: no Alembic)
│   ├── seed_data.py           synthetic ontology + vitals loader; prints Journey B contrast
│   ├── checkpoints/
│   │   ├── sepsis_xgboost.pkl         ★ TRAINED MODEL (committed): XGBClassifier on
│   │   │                              windowed mean/std stats of 7 vitals, AUROC ≈ 0.70
│   │   ├── model_config.json          ★ feature list, decision threshold (0.599), horizon
│   │   └── README.md                  how loading works + how to swap in a TFT later
│   │
│   ├── app/
│   │   ├── main.py                    app factory: routers, CORS, error envelope handlers,
│   │   │                              request-log middleware, lifespan (DB + model init)
│   │   ├── db.py                      SQLAlchemy engine/session factory + postgres ping
│   │   │
│   │   ├── core/
│   │   │   ├── config.py              pydantic-settings (env/.env loading), ONTOLOGY_BACKEND flag
│   │   │   ├── security.py            JWT issue/verify (PyJWT) + bcrypt hashing
│   │   │   ├── errors.py              ApiError hierarchy + {error,message,details} envelope
│   │   │   ├── logging_config.py      stdout logging setup
│   │   │   ├── logging_middleware.py  per-request JSON logs (method/path/status/latency)
│   │   │   └── websocket.py           in-process ConnectionManager (loop-safe publish)
│   │   │
│   │   ├── models/
│   │   │   ├── orm.py                 SQLAlchemy models == schema.sql (GUID/JSONB portability)
│   │   │   └── schemas.py             Pydantic request/response shapes == docs/05-api-spec.md
│   │   │
│   │   ├── ml/
│   │   │   ├── inference.py           ★ PROVIDED algorithm integrated (canonical copy —
│   │   │   │                          the original root files were merged into this and
│   │   │   │                          removed): get_threshold / detect_window /
│   │   │   │                          compute_urgency / SepsisPredictor / predict_sepsis.
│   │   │   │                          Modes: 'xgboost' (trained bundle, committed),
│   │   │   │                          'tft' (checkpoint + torch stack), 'surrogate'
│   │   │   │                          (deterministic fallback). GLUE additions marked
│   │   │   │                          in-file: guarded imports, XGB window-stats +
│   │   │   │                          native TreeSHAP explain, preprocessing, PSV
│   │   │   └── sepsis_route.py        ★ PROVIDED route skeleton, TODOs implemented:
│   │   │                              GET /api/patients/{id}/predictions/sepsis with real
│   │   │                              DB lookups + persistence + WS push + 409 contract
│   │   │
│   │   ├── services/
│   │   │   ├── prediction.py          pipeline glue: ML context from Postgres (age/is_diabetic/
│   │   │   │                          previous risk), sequence building, snapshot persistence,
│   │   │   │                          window create/refresh/close, countdown stabilization,
│   │   │   │                          WebSocket events (window_opened/closed/escalated)
│   │   │   └── alert_routing.py       assigned-clinician check → escalate to next available of
│   │   │                              matching specialty (Neo4j Cypher or SQL), reassignment
│   │   │
│   │   ├── ontology/
│   │   │   ├── cypher.py              ALL Cypher (parameterized only) incl. the three spec patterns
│   │   │   ├── neo4j_client.py        driver wrapper; no-ops when backend != neo4j
│   │   │   └── graph_service.py       /graph via Neo4j traversal OR Postgres-FK joins (ADR-002),
│   │   │                              identical JSON either way; disease→specialty routing map
│   │   │
│   │   └── api/
│   │       ├── deps.py                bearer-token auth dependency + WS token check
│   │       ├── auth.py                POST login/refresh/logout
│   │       ├── patients.py            list/create/detail/update + /graph
│   │       ├── vitals.py              POST (clinical bounds, ≥2h trigger, WS push, bg inference),
│   │       │                          GET list/latest (12h ascending)
│   │       ├── predictions.py         includes sepsis_route router + alzheimers stub + history
│   │       ├── alerts.py              GET /api/alerts/active (sorted), patient windows, acknowledge
│   │       ├── interventions.py       create / outcome update / list (Postgres row + Neo4j node)
│   │       ├── clinicians.py          list + availability flip (drives live escalation demos)
│   │       ├── scans.py               MRI upload stub (.nii/.nii.gz/.dcm + size cap, 'pending')
│   │       ├── analytics.py           three empty-array stubs [HACKATHON: optional]
│   │       ├── health.py              GET /api/health {status, postgres, neo4j}
│   │       └── ws.py                   WS /ws/alerts and /ws/patients/{id}/vitals (token-gated)
│   │
│   └── tests/
│       ├── conftest.py                env isolation (sqlite + postgres_fk), seeded fixtures
│       ├── unit/                      thresholds · window math · predict_sepsis orchestration ·
│       │                              SHAP formatting · Pydantic clinical bounds · PSV conversion
│       └── integration/               auth envelopes · trigger/no-trigger · Journey B contrast ·
│                                      escalation routing · alerts+acknowledge · interventions ·
│                                      patients CRUD+graph · WS push/rejection · stubs · health
│
├── training/                  TFT training notebook (model provenance)
│
├── (frontend)                 separate repository — integrates via FRONTEND_INTEGRATION_GUIDE.md
└── docs/                      the binding spec set (01-PRD … 12-README) — build to these
```

---

## 3. How the provided files were integrated (important provenance note)

The team-provided `inference.py` and `sepsis_route.py` are **the** ML implementation.
They were integrated into `backend/app/ml/` (the root copies were merged in and
removed — the canonical versions live only under `app/ml/`; both remain recoverable
from git history):

| Provided file | Integrated copy | What changed |
|---|---|---|
| `inference.py` | `backend/app/ml/inference.py` | Algorithm functions (`get_threshold`, `detect_window`, `compute_urgency`, `predict_sepsis`, `SepsisPredictor.fit_surrogate`, TFT branch of `predict_trajectory`, `FEATURE_META`, constants) are **verbatim**. Clearly-marked `# --- GLUE ---` additions only: guarded imports, a deterministic surrogate implementing the same predictor interface, trained-**XGBoost bundle support** (see below), preprocessing helpers, PSV serialization. |
| `sepsis_route.py` | `backend/app/ml/sepsis_route.py` | The skeleton is preserved (router prefix, globals, 409 `HTTPException(detail={envelope})`). The three `TODO` lookups are now real SQLAlchemy queries and the two post-prediction TODOs (progression_states write, intervention_windows row + WS push) are delegated to `services/prediction.py`. |

### Trained model integration (current runtime)

`backend/checkpoints/sepsis_xgboost.pkl` + `model_config.json` (committed to git so
clones work out of the box):
- `XGBClassifier` over trailing `{HR,O2Sat,Temp,SBP,MAP,DBP,Resp}_mean/_std` window
  statistics; AUROC ≈ 0.70; decision threshold 0.599; horizon 6.
- `SepsisPredictor` runs in **mode='xgboost'**: `risk_score = P(sepsis)·100` so the
  ontology thresholds (55/60/65) apply on the same 0–100 scale; the 6-hour trajectory
  projects the recent risk trend forward; SHAP explanations come from **native
  TreeSHAP** (`booster.predict(pred_contribs=True)`), with the `_mean`/`_std` pair
  contributions aggregated per base vital to align with FEATURE_META display names.
- Falls back to the surrogate automatically if the bundle is missing — startup never
  crashes on a missing model.

Consequences worth knowing:
- Threshold reasons follow the provided codes: `diabetic_lactate_sensitivity`, `elderly_reduced_reserve`, and **`null`** for default patients.
- `risk_score_change` is `null` on a patient's first prediction (provided behaviour).
- Window detection requires risk ≥ threshold **and a rising forecast** (stale plateaus don't open windows); `hours_remaining` = number of forecast hours above threshold.
- Urgency is margin-based on the provided mapping (>25 CRITICAL, >15 HIGH, else MEDIUM; closed → LOW). Spec example 72.5@55 → HIGH ✓.
- The trained model consumes only the 7 base vitals (no lactate/WBC/creatinine), so those columns don't influence its score — they remain stored and returned everywhere.

---

## 4. What is done (verified end-to-end on the live compose stack)

### Journey A — Sepsis prediction & intervention ✅
1. Login `POST /api/auth/login` → JWT (`invalid_credentials` envelope on failure).
2. Dashboard data: `GET /api/patients` (risk scores, window flags, assigned doctors) + `GET /api/alerts/active` (urgency-sorted).
3. Vitals ingestion: `POST /api/patients/{id}/vitals` → 201 + `prediction_triggered` when ≥2h exists; Pydantic clinical-range bounds reject garbage with 422.
4. Prediction: `GET /api/patients/{id}/predictions/sepsis` returns the exact §4 shape — risk score, signed change, 6h trajectory + confidence band, window fields, urgency, threshold used + reason, top-5 SHAP entries, generated_at. `<2h` ⇒ exact 409 `insufficient_data`.
5. Countdown consistency: refreshing never extends a running window (server-side closes_at wins).
6. Intervention logging: `POST .../interventions` → Postgres row **and** Neo4j `RECEIVED`/`PERFORMED_BY` edges; outcome update via `PUT /api/interventions/{id}/outcome`; history newest-first.
7. Acknowledgement: `POST /api/windows/{id}/acknowledge` removes it from active alerts (history keeps it).

### Journey B — Comorbidity-adjusted threshold (the payoff) ✅
Seeded pair verified live after every seed run (scores from the **trained model**):
- **Ramesh Yadav** (diabetic): risk ≈75.6, forecast rising → window OPEN at
  **threshold 55** (`diabetic_lactate_sensitivity`), alert escalated from unavailable
  Dr. Mehta to available Dr. Rao (Critical Care match).
- **Sunita Devi** (non-diabetic): risk ≈77.9 — nearly the same score — but her default
  threshold is 65 AND her forecast is receding; the provided `detect_window` (rising
  required) keeps her **closed**, reason `null`. Two patients, near-identical scores,
  only the ontology-adjusted one alerts.
Both assertions also live in one integration test so regression = one obvious red test.

### Also working ✅
- Ontology graph endpoint identical from **Neo4j traversal** and **Postgres-FK fallback** (`ONTOLOGY_BACKEND` flag; parity checked against both backends on the same patient).
- Alert routing escalation to next available clinician of matching specialty (integration-tested).
- WebSocket `/ws/alerts` pushes `window_opened` / `escalated` / `window_closed`; `/ws/patients/{id}/vitals` pushes `vitals_update`; invalid/expired tokens rejected at handshake.
- Health check drives the compose healthcheck; structured logs on stdout (`docker compose logs -f backend`) include per-inference shape/latency/risk/window lines.
- Stubs exactly per spec: Alzheimer's prediction (fixed mock), MRI scans (validated upload → `pending` forever), analytics endpoints (empty arrays).

## 5. Test suite (64 passing)

```
backend/tests/unit/test_threshold_logic.py     provided get_threshold: diabetic 55 / elderly 60 /
                                               lowest-wins / boundary / default None-reason
backend/tests/unit/test_window_math.py         provided detect_window semantics (rising vs stale
                                               plateau), margin-based urgency, null closes_at via
                                               provided predict_sepsis
backend/tests/unit/test_predict_sepsis.py      insufficient-data raise, exact §4 key set,
                                               risk_score_change None→"+x.x", threshold contrast,
                                               CRITICAL margin
backend/tests/unit/test_shap_formatting.py     top-5 sorted |impact| desc, direction matches sign,
                                               impact string format, FEATURE_META names/thresholds
backend/tests/unit/test_validation.py          clinical-range bounds (HR 0–300, SpO2 0–100…)
backend/tests/unit/test_psv_conversion.py      column order / pipe delimiter / missing = empty
backend/tests/unit/test_auth_paths.py          local fallback + Supabase claims/auto-provision
backend/tests/unit/test_xgboost_model.py       trained bundle: mode, separation, TreeSHAP labels
backend/tests/integration/test_api.py          full HTTP flows listed in §4 above
```

Run: `docker compose exec backend pytest tests -q`

## 6. Configuration reference (.env)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres DSN — **Supabase pooler URL (current deployment)**; dockerized postgres removed from compose |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | auth proxies to Supabase (login/refresh; tokens verified via JWKS or HS256) — active |
| `SUPABASE_JWT_SECRET` | legacy HS256 projects only; leave blank for newer asymmetric-key projects |
| `NEO4J_URL` / `NEO4J_USER` / `NEO4J_PASSWORD` / `NEO4J_AUTH` | graph store (keep AUTH and PASSWORD in sync) |
| `ONTOLOGY_BACKEND` | `neo4j` (default) or `postgres_fk` — ADR-002 one-flag fallback |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | local-flow signing key + TTL seconds |
| `MIN_INFERENCE_HOURS` | gate for triggering prediction (2) |
| `WINDOW_DURATION_HOURS` | surrogate-mode fallback window length (forecast hours drive it otherwise) |
| `TRAJECTORY_HOURS` | forecast horizon points (6) |
| `SEPSIS_CHECKPOINT_PATH` | trained bundle (`/app/checkpoints/sepsis_xgboost.pkl`) |
| `MRI_UPLOAD_DIR` / `MRI_MAX_UPLOAD_MB` | scan-stub storage + size cap |
| `SEED_CLINICIAN_EMAIL` / `SEED_CLINICIAN_PASSWORD` | demo login created by seed script |
| `CORS_ORIGINS`, `LOG_LEVEL` | misc (CORS already allows the frontend dev origin :5173) |

### Supabase mode

- **DB:** point `DATABASE_URL` at the Supabase pooler, then push the schema with
  `docker compose exec backend python apply_supabase_schema.py` (tables land in
  `public`; Supabase's own `auth` schema is untouched). SQLAlchemy/psycopg3 need
  no other changes.
- **Auth:** `/api/auth/login` and `/api/auth/refresh` proxy to Supabase Auth
  (GoTrue). Every request verifies the presented JWT — HS256 shared secret when
  `SUPABASE_JWT_SECRET` is set, otherwise the project's JWKS endpoint. Users are
  mapped to the local `users` profile by email and auto-provisioned on first
  call (role `clinician`, empty password hash — credentials never touch MedIQ).
  `POST /api/auth/refresh` additionally takes `refresh_token` in the body; the
  login/refresh response carries an additive `refresh_token` field.
- **Fallback:** leave `SUPABASE_URL` empty and everything reverts to local JWT +
  dockerized postgres (offline demo / tests).
- Neo4j stays self-hosted via docker in both modes.

### PhysioNet training-data cases

`backend/data/sepsis_samples/` holds three real ICU stays from
`training_sepsis/` (the dataset the model was trained on; the full dataset is
git-ignored). The seed loads them as named demo patients — **no manual vitals,
no threshold overrides** — so they showcase the trained model on real data:

| Patient | Source | Trained-model outcome |
|---|---|---|
| Devika Menon (75) | p016276.psv, septic at hour 81 | risk ≈84 → window OPEN (HIGH) |
| Raghav Kulkarni (75) | p002399.psv, onset after shown window | ≈38 → quiet (pre-onset) |
| Meera Joshi (59) | p001583.psv, never septic | ≈1 → rock-stable control |

## 7. Known deviations & deliberate cuts (also flagged inline in code)

1. **Provided-file integration tweaks** (§3 above): guarded heavy imports; surrogate fallback so startup never crashes pre-training; `explain()` works in surrogate AND xgboost modes (the original condition would have emitted `[]`); surrogate forecasts capped at 100 (not 99) so saturating patients still count as "rising".
2. **`patient_assignments` extra table**: additive-only, needed because assignment isn't representable in the specified schema yet the API/routing require it — especially in `postgres_fk` mode.
3. **schema.sql order fix**: `clinicians` moved before `interventions` (FK forward-reference bug in the spec doc; table definitions unchanged).
4. **409 body superset**: envelope keys AND flat `hours_available`/`hours_required`.
5. **Supabase auth additions** (opt-in): additive `refresh_token` response field; `/api/auth/refresh` accepts a body in Supabase mode; auto-provisioned local profiles for Supabase-authenticated users. Local flow unchanged when unset.
6. Analytics/MRI/Alzheimer's are stubs by design (ADR-001). The React frontend lives in a separate repository; compose runs backend + Neo4j only.
7. The full `training_sepsis/` dataset is git-ignored (161MB / 20k files); only three small sample PSVs are committed under `backend/data/sepsis_samples/`.

## 8. Out of scope (per PRD §8 — not built, on purpose)

Model retraining loop · HL7/FHIR · Kubernetes/multi-tenant · SMS/email delivery · RBAC hierarchy · audit-grade access logs · encryption-at-rest · automated E2E browser tests.
