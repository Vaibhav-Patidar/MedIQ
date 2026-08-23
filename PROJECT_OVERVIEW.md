# MedIQ — Project Overview & Code Map

**What this document is:** the single place that says *what is where*, *what is done*,
and *how the whole system fits together* — current as of the final build.
Companions: `README.md` (quick start) · `FRONTEND_INTEGRATION_GUIDE.md` (API contract
for the React agent) · `WHERE_TO_FIND_ENV_VALUES.md` (secrets guide) · `docs/01–12`
(binding specs).

Status legend: ✅ done & verified · 🟡 stub per spec · ⛔ out of scope (PRD §8)

---

## 1. What MedIQ is

A sepsis early-warning prototype for Smart India Hackathon 2026 (Team ByteSlay).
ICU vitals stream in → once ≥2h of history exists, a **trained XGBoost model**
produces a risk score + 6-hour trajectory → when risk crosses a **patient-specific
ontology-adjusted threshold**, an intervention window opens with a countdown →
SHAP shows which vitals are driving it → the doctor logs the intervention →
everything mirrors into an ontology graph.

The demo's core claim (PRD F4): **a diabetic patient opens a window at threshold 55
while a non-diabetic patient at nearly the same score stays silent (default 65).**

## 2. Final architecture

```
React + TS (:5173, separate repo — see FRONTEND_INTEGRATION_GUIDE.md)
        │ REST /api/*  (Bearer JWT issued by Supabase Auth)
        │ WS    /ws/*  (same token, handshake-gated)
        ▼
FastAPI :8000  (docker compose)
├── api/         routers: auth · patients · vitals · predictions · alerts ·
│                interventions · clinicians · scans · analytics · health · ws
├── ml/          ★ trained XGBoost model (risk = P(sepsis)·100) · native TreeSHAP ·
│                provided threshold/window/urgency algorithm · surrogate fallback
├── ontology/    Neo4j traversals ⇄ postgres_fk fallback (identical /graph JSON)
└── services/    prediction pipeline · clinician escalation routing
        │                          │
        ▼                          ▼
Supabase Postgres             Neo4j 5 Community (docker)
(source of truth + hosted     ontology traversal; no managed graph DB exists,
 GoTrue auth; RLS deny-all    which is why docker stays in the stack)
 enabled on all tables)
```

**Compose runs exactly two services:** `neo4j` + `backend`. There is no local
Postgres container — Supabase is the sole database — and the React frontend lives
in its own repository.

---

## 3. Repository map

```
mediq/
├── README.md                     GitHub front page (quick start, features)
├── PROJECT_OVERVIEW.md           ← you are here
├── FRONTEND_INTEGRATION_GUIDE.md handover doc for the React developer/agent
├── WHERE_TO_FIND_ENV_VALUES.md   where every .env value comes from
├── docker-compose.yml            neo4j + backend only (+ healthchecks, volumes)
├── .env.example                  required values only; optional overrides commented
├── .gitignore                    hides .env, training_sepsis/, uploads, caches…
│
├── docs/                         binding spec set (01-PRD … 12-README)
├── training/
│   └── mediq_tft_resume_training_v2.ipynb      TFT training notebook (provenance)
│
└── backend/
    ├── Dockerfile                python:3.11-slim, uvicorn, curl for healthcheck
    ├── requirements.txt          runtime deps incl. xgboost>=3.2,<4; torch/shap/
    │                             lightgbm stay commented until a TFT checkpoint lands
    ├── pytest.ini
    ├── schema.sql                DDL == docs/06-database-spec.md §1 (order fix noted);
    │                             pushed to Supabase via apply_supabase_schema.py
    ├── apply_supabase_schema.py  idempotent schema push to any Postgres target
    ├── supabase_rls.sql          deny-all RLS on every table (locks the auto Data API;
    │                             ALREADY applied to the live project)
    ├── seed_data.py              demo dataset loader; prints Journey B contrast and
    │                             PhysioNet-case outcomes; wipes & reseeds deterministically
    ├── checkpoints/
    │   ├── sepsis_xgboost.pkl    ★ TRAINED MODEL (committed): XGBClassifier over
    │   │                         trailing {HR,O2Sat,Temp,SBP,MAP,DBP,Resp}_mean/_std
    │   ├── model_config.json     ★ features, decision threshold 0.599, horizon 6, AUROC
    │   └── README.md             how loading works + how to swap in a TFT later
    ├── data/sepsis_samples/      three real PhysioNet ICU stays (committed), used by seed
    ├── scripts/
    │   ├── final_check.py        46-assertion live-API sweep across every endpoint
    │   └── websocket_probe.py    real-WS push test driven by an actual septic case
    │
    └── app/
        ├── main.py               app factory: routers, CORS, error-envelope handlers,
        │                         request-log middleware, lifespan (DB + model init)
        ├── db.py                 SQLAlchemy engine/session factory + postgres ping
        ├── core/
        │   ├── config.py         pydantic-settings; ONTOLOGY_BACKEND flag; Supabase settings
        │   ├── security.py       local JWT issue/verify (fallback flow) + bcrypt hashing
        │   ├── supabase.py       GoTrue login/refresh proxy + JWT verify (HS256 or JWKS)
        │   ├── errors.py         ApiError hierarchy + {error,message,details} envelope
        │   ├── logging_config.py / logging_middleware.py   structured stdout logs
        │   └── websocket.py      in-process ConnectionManager (loop-safe publish)
        ├── models/
        │   ├── orm.py            SQLAlchemy models == schema.sql (GUID/JSONB portable)
        │   └── schemas.py        Pydantic shapes == docs/05-api-spec.md
        ├── ml/
        │   ├── inference.py      ★ PROVIDED algorithm integrated verbatim
        │   │                     (get_threshold / detect_window / compute_urgency /
        │   │                     predict_sepsis / SepsisPredictor / FEATURE_META).
        │   │                     Modes: 'xgboost' (trained bundle — ACTIVE),
        │   │                     'tft' (checkpoint + torch stack), 'surrogate'
        │   │                     (deterministic fallback). GLUE additions marked in-file.
        │   └── sepsis_route.py   ★ PROVIDED route skeleton, TODOs implemented:
        │                         GET /api/patients/{id}/predictions/sepsis end-to-end
        ├── services/
        │   ├── prediction.py     pipeline: ML context, sequence building, snapshot
        │   │                     persistence, window lifecycle, countdown stabilization,
        │   │                     WebSocket events (window_opened/closed/escalated)
        │   └── alert_routing.py  escalation to next available clinician of matching specialty
        ├── ontology/
        │   ├── cypher.py         ALL Cypher (parameterized only)
        │   ├── neo4j_client.py   driver wrapper; lazy reconnect; no-ops in fk mode
        │   └── graph_service.py  /graph identical JSON from either backend (ADR-002)
        └── api/
            ├── deps.py           bearer auth (Supabase-or-local) + WS token check
            ├── auth.py           login/refresh proxy + local fallback, logout
            ├── patients.py       list/create/detail/update + /graph
            ├── vitals.py         POST (bounds, ≥2h trigger, bg inference) · GET/latest
            ├── predictions.py    includes sepsis_route router + alzheimers mock + history
            ├── alerts.py         GET /api/alerts/active · patient windows · acknowledge
            ├── interventions.py  create / outcome / list (Postgres row + Neo4j node)
            ├── clinicians.py     list + availability flip
            ├── scans.py          MRI upload stub (.nii/.nii.gz/.dcm + size cap)
            ├── analytics.py      three empty-array stubs [HACKATHON: optional]
            ├── health.py         GET /api/health {status, postgres, neo4j}
            └── ws.py             WS /ws/alerts · /ws/patients/{id}/vitals (token-gated)

Tests mirror this under backend/tests/unit/ (9 files) + backend/tests/integration/.
```

---

## 4. ML integration — provenance & current behaviour

### Provided files

The team-provided `inference.py` + `sepsis_route.py` are THE ML implementation.
They were integrated into `backend/app/ml/`; root copies were removed (canonical
versions only under `app/ml/`, recoverable from git history).

| Provided | Integrated | Changed |
|---|---|---|
| `inference.py` | `app/ml/inference.py` | Algorithm functions verbatim (`get_threshold`, `detect_window`, `compute_urgency`, `predict_sepsis`, `SepsisPredictor.fit_surrogate`, TFT branch of `predict_trajectory`, `FEATURE_META`). Marked GLUE only: guarded imports, deterministic surrogate fallback, trained-XGBoost support, preprocessing helpers, PSV serialization. |
| `sepsis_route.py` | `app/ml/sepsis_route.py` | Skeleton preserved (router prefix, globals, 409 via `HTTPException(detail={envelope})`). The three DB TODOs implemented against SQLAlchemy; persistence/window/WS TODOs delegated to `services/prediction.py`. |

### Trained model (ACTIVE runtime)

`checkpoints/sepsis_xgboost.pkl` + `model_config.json` (committed):
XGBClassifier over trailing `{HR,O2Sat,Temp,SBP,MAP,DBP,Resp}_mean/_std`,
AUROC ≈ 0.70, decision threshold 0.599, horizon 6.

- `risk_score = P(sepsis)·100` → ontology thresholds (55/60/65) work on one scale.
- SHAP = native TreeSHAP (`pred_contribs`), `_mean`/`_std` pairs aggregated per base vital.
- Trajectory = recent risk trend projected forward (a classifier isn't a forecaster).
- Falls back to the surrogate automatically if weights/deps are missing — startup never crashes.

### Behavioural rules (from the provided algorithm — tests lock these)

- Threshold reasons: `diabetic_lactate_sensitivity`, `elderly_reduced_reserve`, `null` for default patients.
- `risk_score_change`: signed string (`"+3.2"`); `null` on a patient's first-ever prediction.
- Window opens iff `risk >= threshold` AND forecast rising (stale plateaus stay closed);
  `hours_remaining` = number of forecast hours above threshold.
- Urgency margin-based: >25 CRITICAL · >15 HIGH · else MEDIUM · closed → LOW.
- Model consumes only the 7 base vitals (lactate/WBC/creatinine stored & returned but not scored).

---

## 5. What is done — verified ✅

### Journey A — prediction & intervention
Login → dashboard (patients + urgency-sorted alerts) → vitals POST (clinical bounds;
≥2h triggers background inference per ADR-003) → exact §4 prediction payload
(trajectory + band + SHAP top-5) → countdown stable across refreshes → intervention
logged (Postgres row AND Neo4j `RECEIVED`/`PERFORMED_BY`) → outcome update →
acknowledge removes alert while history keeps it.

### Journey B — the ontology payoff
Live after every seed (trained-model scores): **Ramesh Yadav** (diabetic) ≈75.6 rising
→ OPEN @55 (`diabetic_lactate_sensitivity`), escalated from unavailable Dr. Mehta to
Dr. Rao; **Sunita Devi** ≈77.9 receding → CLOSED @65, reason `null`. Near-identical
scores, only the ontology-adjusted patient alerts. Locked by one integration test.

### Also verified ✅
Graph parity between Neo4j traversal and Postgres-FK fallback (ADR-002) · escalation
routing to next available clinician of matching specialty · WebSocket push
(`window_opened`/`escalated`/`window_closed`, `vitals_update`) + 4401 rejection ·
RLS deny-all on all 12 Supabase tables · structured logs with per-inference lines ·
stubs per spec (Alzheimer's mock, MRI pending, analytics `[]`).

## 6. Tests & verification tooling

```bash
docker compose exec backend pytest tests -q                    # 64 unit+integration tests
docker compose exec backend python scripts/final_check.py      # 46 live-API assertions
docker compose exec backend pip install -q websockets && \
docker compose exec backend python scripts/websocket_probe.py  # live WS push check
```

Unit files: thresholds · window math · predict_sepsis orchestration · SHAP formatting ·
clinical-bound validation · PSV conversion · auth paths (local + Supabase) · xgboost
bundle. Integration: auth envelopes · trigger/no-trigger · Journey B contrast ·
escalation routing · alerts+acknowledge · interventions · CRUD+graph · WS · stubs · health.

## 7. Configuration (.env)

Full walkthrough with dashboard locations: `WHERE_TO_FIND_ENV_VALUES.md`.

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Supabase pooler URL — the only datastore |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | enables Supabase Auth proxying (login/refresh; JWKS or HS256 verification) |
| `SUPABASE_JWT_SECRET` | legacy HS256 projects; blank ⇒ JWKS |
| `NEO4J_AUTH` / `NEO4J_PASSWORD` | self-hosted Neo4j (keep in sync) |
| `JWT_SECRET` | local-flow fallback signing key |
| `ONTOLOGY_BACKEND` | `neo4j` (default) or `postgres_fk` (ADR-002) |
| `SEED_CLINICIAN_PASSWORD` | password for the dashboard-created demo login |

Optional overrides (defaults in `core/config.py`): `NEO4J_URL` · `NEO4J_USER` ·
`JWT_EXPIRES_IN` · `MIN_INFERENCE_HOURS` · `WINDOW_DURATION_HOURS` ·
`TRAJECTORY_HOURS` · `SEPSIS_CHECKPOINT_PATH` · `MRI_UPLOAD_DIR` ·
`MRI_MAX_UPLOAD_MB` · `SEED_CLINICIAN_EMAIL` · `CORS_ORIGINS` · `LOG_LEVEL`.

### Supabase notes

- **DB:** `DATABASE_URL` points at the Session pooler; schema pushed via
  `apply_supabase_schema.py`. Tables live in `public`; Supabase's own `auth`
  schema is untouched. RLS deny-all applied (see `supabase_rls.sql`).
- **Auth:** `/api/auth/login|refresh` proxy to GoTrue. Tokens verified per request
  — HS256 secret or JWKS. Users mapped to local `users` profiles by email and
  auto-provisioned on first call (role `clinician`; credentials never touch MedIQ).
  Demo identity must be created in the dashboard as `doctor@mediq.local` with
  Auto Confirm ON — public signup enforces MX validation and rejects `.local`.
- **Fallback:** clearing `SUPABASE_*` reverts to local-JWT mode for offline use
  (requires re-adding a Postgres, e.g. the old compose service from git history).
- Neo4j stays self-hosted via docker in every mode.

### PhysioNet training-data cases

`backend/data/sepsis_samples/` holds three real ICU stays from the training set
(`training_sepsis/` is git-ignored). Seeded as named patients with **no manual
vitals and no threshold overrides** — pure trained-model behaviour:

| Patient | Source | Trained-model outcome |
|---|---|---|
| Devika Menon (75) | p016276.psv, septic at hour 81 | risk ≈84 → window OPEN (HIGH) |
| Raghav Kulkarni (75) | p002399.psv, onset after shown window | ≈38 → quiet (pre-onset) |
| Meera Joshi (59) | p001583.psv, never septic | ≈1 → rock-stable control |

## 8. Known deviations & deliberate cuts (also flagged inline in code)

1. **Provided-file GLUE tweaks**: guarded heavy imports; surrogate/xgboost fallbacks so startup never crashes pre-training; `explain()` extended to surrogate+xgboost modes; surrogate forecasts capped at 100 (not 99) so saturating patients still count as "rising".
2. **`patient_assignments` extra table**: additive-only; assignment isn't representable in the specified schema yet the API/routing require it — especially in `postgres_fk` mode.
3. **schema.sql order fix**: `clinicians` moved before `interventions` (FK forward-reference bug in the spec doc; definitions unchanged).
4. **409 body superset**: envelope keys AND flat `hours_available`/`hours_required`.
5. **Supabase additions**: additive `refresh_token` response field; `/refresh` accepts a body in Supabase mode; auto-provisioned local profiles; dashboard-created users required (public signup blocks `.local` addresses).
6. **xgboost range-pinned** (`>=3.2,<4`): pickle behaves consistently across those versions (ground-truth checked against p016276 labels); newer releases unverified.
7. Analytics/MRI/Alzheimer's are stubs by design (ADR-001). React frontend lives in a separate repository; compose runs backend + Neo4j only.
8. Full `training_sepsis/` dataset git-ignored (~161MB / 20k files); only three sample PSVs committed under `backend/data/sepsis_samples/`.

## 9. Out of scope (per PRD §8 — not built, on purpose)

Model retraining loop · HL7/FHIR · Kubernetes/multi-tenant · SMS/email delivery ·
RBAC hierarchy · audit-grade access logs · encryption-at-rest · automated E2E browser tests.
