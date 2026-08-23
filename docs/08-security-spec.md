# MedIQ — Security Specification / Threat Model

**Scope note:** This is synthetic/demo patient data (no real PHI), but MedIQ's pitch is a clinical tool, so the prototype should still demonstrate baseline-correct security hygiene rather than none at all. Full HIPAA/DPDP-grade controls (audit-grade access logging, encryption-at-rest key management, BAAs) are explicitly **out of scope** for the 3-day prototype and called out below.

---

## 1. Authentication & Authorization

- **Auth mechanism:** JWT bearer tokens (see ADR-004). Login issues an access token (short TTL, e.g. 1h) — no refresh-token rotation complexity needed for a demo.
- **Password storage:** bcrypt/argon2 hashed, never plaintext, never logged.
- **Roles:** Single role (`clinician`) in the prototype. The schema (`users.role`) already supports adding `admin`/`nurse` roles later without a rewrite — not implemented now (see PRD Section 8, Out of Scope: RBAC hierarchy).
- **WebSocket auth:** token passed as a subprotocol/query param at handshake; connection is rejected if invalid/expired.

## 2. Secrets Management

- No secrets committed to the repo. `.env` file (git-ignored) holds DB credentials, JWT signing secret.
- `.env.example` committed with placeholder keys so teammates can bootstrap locally.
- JWT signing secret is a random 256-bit value generated once per environment, not hardcoded.

## 3. Input Validation

- All request bodies validated via Pydantic models — reject on schema mismatch (`422 validation_error`, per `05-api-spec.md` Section 11).
- Vitals values get basic clinical-range sanity bounds (e.g. HR 0–300, SpO2 0–100) so obviously malformed data doesn't silently reach the model.
- File uploads (MRI scans, stretch feature): restrict to `.nii`, `.nii.gz`, `.dcm` extensions and a max file size; reject anything else before it touches the preprocessing pipeline.

## 4. Common Web Vulnerabilities

| Threat | Mitigation |
|---|---|
| SQL injection | Parameterized queries via SQLAlchemy/ORM — never string-built SQL. |
| Cypher injection (Neo4j) | Parameterized Cypher queries only (`$id` style params, as shown in `06-database-spec.md`) — never string-interpolate patient input into Cypher. |
| XSS | React auto-escapes by default; never use `dangerouslySetInnerHTML` with server/user data. Doctor notes (free text) are rendered as text, not HTML. |
| CSRF | Not applicable in the same way as cookie-based auth — bearer-token auth in `Authorization` header isn't automatically sent by the browser, which removes the classic CSRF vector. |
| Broken object-level auth | Every `/api/patients/{id}/...` handler checks the requesting clinician has a legitimate reason to view the patient — **[HACKATHON]** simplified to "any authenticated clinician can view any patient" since the prototype has one role and a small seeded dataset; flagged as a gap for anything beyond demo use. |

## 5. Rate Limiting

- Not enforced in the hackathon build (see `05-api-spec.md` Section 12) — acceptable for a single-judge demo session, explicitly not acceptable for any real deployment.

## 6. Data Privacy

- All patient data is **synthetic** (hand-authored ontology data, PhysioNet's already-de-identified sepsis dataset, ADNI/OASIS-3 research datasets used under their respective data use agreements). No real-world identifiable patient data is entered into MedIQ during the hackathon.
- MRI scans (stretch feature), if used, stay within the ADNI/OASIS-3 usage terms the team already obtained approval for — do not redistribute raw scans outside the project.

## 7. Threat Model Summary (Demo Context)

| Asset | Threat | Likelihood in demo context | Mitigation |
|---|---|---|---|
| JWT signing secret | Leaked via repo | Low (git-ignored `.env`) | `.gitignore` + `.env.example` |
| Patient data | Unauthorized access | Low (synthetic data, closed demo network) | Auth required on all `/api/patients/*` |
| Model endpoint | Abuse / DoS during judging | Low | Not hardened — acceptable risk for a live judged demo on a controlled network |
| WebSocket channel | Unauthenticated eavesdropping | Low-medium | Token-gated handshake |

## 8. Explicitly Out of Scope for the Prototype

- Encryption at rest (Postgres/Neo4j volumes unencrypted in local Docker dev).
- Full audit logging of every read/write (only mutating clinical actions — interventions, acknowledgements — are logged with `performed_at`/`acknowledged_by`, which is a business record, not a security audit trail).
- Multi-factor authentication.
- Formal penetration testing / SOC2-style controls.

These are the correct next steps if MedIQ moves beyond a hackathon prototype toward handling real patient data.
