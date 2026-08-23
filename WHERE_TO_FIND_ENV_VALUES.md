# Where to find every env value — MedIQ setup guide

Companion to `.env.example`. Copy `.env.example` → `.env`, fill in the values
below, then `docker compose up --build`.

Legend: 🔴 **required** to boot · 🟡 optional (defaults are fine) · ⚪ leave blank unless using that feature

---

## Quick checklist

| # | Variable | Required? | Where it comes from |
|---|----------|-----------|---------------------|
| 1 | `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | 🔴 | You choose them (local) — or Supabase DB credentials |
| 2 | `DATABASE_URL` | 🔴 | Assembled from row 1 — or copied from Supabase |
| 3 | `NEO4J_AUTH` + `NEO4J_PASSWORD` | 🔴 | You choose them (keep the two in sync) |
| 4 | `JWT_SECRET` | 🔴 | Generate it yourself (command below) |
| 5 | `ONTOLOGY_BACKEND` | 🟡 | Your choice: `neo4j` or `postgres_fk` |
| 6 | `SUPABASE_URL` / `SUPABASE_ANON_KEY` | ⚪ | Supabase dashboard → Project Settings → API |
| 7 | `SUPABASE_JWT_SECRET` | ⚪ | Supabase dashboard → Project Settings → API → JWT Settings (legacy projects only) |
| 8 | `SEED_CLINICIAN_PASSWORD` | 🟡 | You choose — becomes the demo login password |

---

## 1–2. PostgreSQL

**Local docker mode (default):** pick any db/user/password and keep them
consistent across the four lines. `DATABASE_URL` is assembled as:

```
postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>
```

The host is literally `postgres` — that's the compose service name, not localhost.

**Supabase mode:** create a project at [supabase.com](https://supabase.com), then
→ **Project Settings → Database → Connection string → URI** (Session mode, port 5432).
It looks like:

```
postgresql://postgres.<project-ref>:<your-db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Paste that into `DATABASE_URL` (and set `POSTGRES_PASSWORD` to your Supabase DB
password for reference). Then push the schema:

```bash
docker compose up -d neo4j backend      # postgres service not needed in this mode
docker compose exec backend python apply_supabase_schema.py
```

## 3. Neo4j

Entirely self-hosted via docker — you invent these credentials.

- `NEO4J_AUTH` = `<user>/<password>` (used by the Neo4j container itself)
- `NEO4J_PASSWORD` = just the password (used by the compose healthcheck)

⚠️ The two must contain the same password. Log into http://localhost:7474 with
the same user/password to browse the ontology graph.

Optional overrides (compose defaults are already baked into the backend config,
so these lines only matter for exotic setups — e.g. Neo4j on another host):
`NEO4J_URL` · `NEO4J_USER`

## 4. JWT_SECRET

Signs the backend's own tokens (local auth flow). **Never commit a real one.**
Generate:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Rotating it invalidates all existing sessions — fine in dev.

## 5. ONTOLOGY_BACKEND

No secret — an architecture switch (ADR-002):
- `neo4j` (default) — graph served from real Cypher traversals.
- `postgres_fk` — identical graph JSON derived from Postgres foreign keys;
  useful if Neo4j misbehaves right before a demo. No code changes needed.

## 6–7. Supabase (optional — skip entirely for the offline demo)

Create a project at [supabase.com](https://supabase.com), then:

| Value | Exact location in the Supabase dashboard |
|---|---|
| `SUPABASE_URL` | **Project Settings → API → Project URL** (`https://<ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | **Project Settings → API → Project API keys → `anon` `public`** |
| `SUPABASE_JWT_SECRET` | **Project Settings → API → JWT Settings → JWT Secret** — only for legacy HS256 projects; newer projects use asymmetric keys, leave blank and MedIQ verifies via JWKS automatically |

While you're there:
1. **Database → Connection string** → paste into `DATABASE_URL` (see §1–2).
2. **Authentication → Users → Add user** → create `doctor@mediq.local`
   (any password) so the seeded demo clinician can log in through Supabase.
3. Run the schema push command from §1–2.

When `SUPABASE_URL` is filled: login/refresh go through Supabase, tokens are
verified per-request, and invited teammates are auto-provisioned locally on
first API call. When it's blank: built-in local auth runs instead.

## 8. SEED_CLINICIAN_PASSWORD

You choose it. `python seed_data.py` creates the demo login
(`doctor@mediq.local` / this password). Re-running the seed resets everything,
including this login.

---

### Not in the lean .env (optional overrides)

Everything below has working defaults in `backend/app/core/config.py`; uncomment
in `.env` only if you need to change behaviour:

`NEO4J_URL` · `NEO4J_USER` · `JWT_EXPIRES_IN` · `MIN_INFERENCE_HOURS` ·
`WINDOW_DURATION_HOURS` · `TRAJECTORY_HOURS` · `SEPSIS_CHECKPOINT_PATH` ·
`MRI_UPLOAD_DIR` · `MRI_MAX_UPLOAD_MB` · `SEED_CLINICIAN_EMAIL` ·
`CORS_ORIGINS` · `LOG_LEVEL`

(The old `VITE_*` frontend vars were removed — the placeholder frontend doesn't
read them; they'll return with the React app.)
