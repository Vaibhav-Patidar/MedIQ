# MedIQ — Observability / Operations Specification

Scaled to what actually helps a 6-person team debug a live, judged demo — not a production SRE setup. Full Prometheus/Grafana/SLO tooling from `mediq_architecture.md` Section 7 is **not built** for the hackathon; this doc replaces it with what is.

---

## 1. Logging

- **Backend (FastAPI/Uvicorn):** structured request logs (method, path, status, latency) to stdout — visible via `docker compose logs -f backend` during the demo (see `10-deployment-spec.md` Section 1.5).
- **ML inference calls:** log input shape, inference latency, and the resulting `risk_score`/`window_open` for every prediction — this is the fastest way to spot "the model silently returned garbage" during rehearsal.
- **Errors:** any unhandled exception logs a full traceback server-side; the API response to the client stays in the clean error shape from `05-api-spec.md` Section 11 (never leak a traceback to the frontend).
- **No log aggregation service** (e.g. ELK/Datadog) — stdout + `docker compose logs` is sufficient for a local demo lifetime measured in hours.

## 2. Metrics **[HACKATHON: minimal, manual]**

Rather than Prometheus/Grafana, track by hand during rehearsal:
- Inference latency for the seeded demo patients (should be sub-2s, per `09-testing-strategy.md` Section 7).
- WebSocket delivery latency from "window opens server-side" to "UI shows countdown" (should feel instant, <1s).

If the team has spare time after the core build (unlikely in 3 days), a lightweight `/health` endpoint returning basic counters (requests served, last inference latency) is a reasonable middle ground — not required.

## 3. Health Checks

- `GET /api/health` — returns `200 { "status": "ok", "postgres": "up", "neo4j": "up" }`. Used by:
  - Docker Compose `healthcheck` for `backend` (so `depends_on` ordering behaves correctly on `docker compose up`).
  - A quick manual pre-demo check (`curl localhost:8000/api/health`) before walking into the judging room.

## 4. Error Tracking

- **[HACKATHON]** No Sentry/Bugsnag integration — the team is present and watching logs live during the only session that matters. If time permits post-hackathon, Sentry is the natural next addition (matches the FastAPI + React stack with minimal setup).

## 5. Alerts

- Not applicable at hackathon scale — there is no on-call, no unattended production system. "Alerts" in the MedIQ product sense (intervention windows) are a product feature, documented in `05-api-spec.md` and `02-UX-flow-spec.md`; they are unrelated to operational alerting.

## 6. SLOs / SLIs

- **Not defined for the prototype** — SLOs presume a running production service with real users. The only "reliability target" that matters for the hackathon is: **the demo path in `09-testing-strategy.md` Section 4 completes without a visible error, every time it's rehearsed.** Treat rehearsal itself as the SLO enforcement mechanism.

## 7. What to Actually Do With This Doc

Before demo day:
1. Confirm `GET /api/health` returns `ok` on a fresh `docker compose up`.
2. Rehearse the full demo path at least twice with `docker compose logs -f backend` open, watching for any warning-level log lines.
3. If anything is flaky (WebSocket reconnect, inference latency spikes), it should be visible in the logs before it's visible to a judge.
