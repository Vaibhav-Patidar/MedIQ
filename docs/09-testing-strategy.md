# MedIQ — Testing Strategy

Scaled for a 3-day hackathon build: enough testing to guarantee the judged demo doesn't break, not a full production test pyramid. Priority order below matches build priority in `01-PRD.md`.

---

## 1. Priority Principle

**Test the thing you're demoing, first and most.** The comorbidity-adjusted threshold (PRD F4) is the single highest-value thing to have a test for, because it's the entire thesis of the pitch — if it silently regresses the night before the demo, the team needs to know immediately, not find out live in front of judges.

## 2. Unit Tests

| Target | What to test |
|---|---|
| Threshold adjustment logic | Diabetic patient → threshold 55; elderly (>65) → threshold 60; both → most conservative (lowest) threshold wins; default patient → 65. |
| Countdown/window math | `window_open` transitions correctly when `risk_score` crosses threshold; `hours_remaining` computed correctly from `window_closes_at` minus current time; null `window_closes_at` handled without throwing. |
| SHAP formatting | Top-N (max 5) features returned, sorted by absolute impact descending; direction (`increase`/`normal`) matches sign of impact. |
| Pydantic schema validation | Vitals payload rejects out-of-clinical-range values (e.g. negative HR); accepts valid payloads. |
| PSV conversion | VitalReading rows convert to the exact PSV shape the TFT model expects (column order, delimiter, missing-value handling). |

## 3. Integration Tests

| Flow | What to test |
|---|---|
| Vitals → prediction trigger | POSTing a vitals reading that completes ≥2h of history triggers inference and returns `prediction_triggered: true`. |
| Insufficient data | POSTing vitals with <2h history does **not** trigger inference; `GET /predictions/sepsis` returns `409 insufficient_data`. |
| Window open → alert routing | When a window opens for a patient whose assigned doctor is `is_available: false`, the alert routes to the next available clinician of matching specialization (per Cypher pattern in `06-database-spec.md`). |
| Intervention logging | `POST /interventions` creates a row in Postgres **and** (if Neo4j is in use) an `Intervention` node linked via `RECEIVED`/`PERFORMED_BY` edges. |
| WebSocket push | Opening a window server-side results in a `window_opened` event delivered to a connected `/ws/alerts` client. |

## 4. End-to-End (E2E) Tests

Cover the exact judged demo path (Journey A and Journey B in `02-UX-flow-spec.md`):

1. Log in → land on Dashboard.
2. Open a patient with ≥2h vitals → risk card + trajectory render.
3. Confirm SHAP panel renders with correct top features for a known seeded patient.
4. Confirm window countdown appears and ticks (mock/advance time in test).
5. Log an intervention → toast appears → history list updates.
6. **Comorbidity contrast (critical for demo credibility):** open the diabetic seeded patient at risk 58 → window open, threshold label shows "55". Open the non-diabetic seeded patient at risk 58 → window **not** open. Same test run, both assertions in one spec, so any regression in the ontology payoff is caught as a single obvious failure.

Recommended tooling: Playwright or Cypress for the frontend E2E; run against the Docker Compose stack with seeded data.

## 5. API Contract Testing

- Validate live API responses against the shapes documented in `05-api-spec.md` (e.g. via `schemathesis` against the FastAPI-generated OpenAPI schema, or simple response-shape assertions in integration tests). This catches drift between the spec doc and the actual implementation before a teammate builds a frontend component against a stale shape.

## 6. Manual QA Checklist (run before every demo rehearsal)

- [ ] No screen shows a raw stack trace or `undefined`.
- [ ] Insufficient-data state renders correctly for a freshly-seeded patient with <2h vitals.
- [ ] Countdown timer visibly ticks down (not frozen).
- [ ] `window_closes_at = null` correctly hides the countdown (no "Invalid Date").
- [ ] WebSocket reconnect indicator appears if the backend is restarted mid-session.
- [ ] Comorbidity threshold label visibly differs for diabetic vs. default patient.
- [ ] Toast for "Intervention logged" appears and auto-dismisses.
- [ ] Mobile/laptop viewport (if demoing on a different screen than dev) doesn't clip the risk card or countdown.

## 7. Performance Testing

**[HACKATHON: minimal]** — Confirm the TFT inference call for a single patient completes in well under the time it takes a doctor to read the vitals table (sub-2s target). No load testing beyond that; a hackathon demo is single-session, single-judge, not concurrent-user load.

## 8. Explicitly Out of Scope

- Automated accessibility testing (axe-core, etc.) — accessibility rules in `03-design-spec.md` Section 9 are followed by design discipline and manual spot-check, not CI-gated for the hackathon.
- Chaos/failure-injection testing.
- Cross-browser matrix testing beyond the browser the demo will actually run in.
