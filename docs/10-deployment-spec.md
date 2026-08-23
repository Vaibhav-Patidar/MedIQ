# MedIQ — Deployment / Infrastructure Specification

Two tracks: **(A) Local demo** — what you actually need for judging day — and **(B) Optional public deployment** — only if the team wants a shareable link ahead of/beyond the judging session.

---

## 1. Track A — Local Demo Environment (required)

This is the only environment that must work reliably.

### 1.1 Environments
- **dev = demo.** One `docker-compose.yml` brings up the entire stack. No separate staging/prod split for the hackathon.

### 1.2 `docker-compose.yml` services (target shape)
```yaml
services:
  postgres:
    image: postgres:16
    environment: [POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD]
    volumes: [pgdata:/var/lib/postgresql/data]
    ports: ["5432:5432"]

  neo4j:
    image: neo4j:5-community
    environment: [NEO4J_AUTH]
    volumes: [neo4jdata:/data]
    ports: ["7474:7474", "7687:7687"]

  backend:
    build: ./backend
    env_file: .env
    depends_on: [postgres, neo4j]
    ports: ["8000:8000"]
    volumes: ["./backend:/app"]   # hot reload during dev

  frontend:
    build: ./frontend
    env_file: .env
    depends_on: [backend]
    ports: ["5173:5173"]
    volumes: ["./frontend:/app"]

volumes:
  pgdata:
  neo4jdata:
```

`minio` service only added if the Alzheimer's/MRI stretch feature is being built (see `04-tech-spec.md`).

### 1.3 Environment Variables (`.env`, git-ignored; `.env.example` committed)
```
POSTGRES_DB=mediq
POSTGRES_USER=mediq
POSTGRES_PASSWORD=<local-only>
DATABASE_URL=postgresql://mediq:<pw>@postgres:5432/mediq

NEO4J_AUTH=neo4j/<local-only>
NEO4J_URL=bolt://neo4j:7687

JWT_SECRET=<random-256-bit>
JWT_EXPIRES_IN=3600

VITE_API_BASE_URL=http://localhost:8000/api
VITE_WS_BASE_URL=ws://localhost:8000/ws
```

### 1.4 Bring-up sequence
```bash
cp .env.example .env          # fill in local secrets
docker compose up --build     # postgres + neo4j + backend + frontend
docker compose exec backend python seed_data.py   # load synthetic ontology data + PSV-converted PhysioNet vitals
```
Verify: `http://localhost:5173` (frontend), `http://localhost:8000/docs` (API/Swagger), `http://localhost:7474` (Neo4j browser).

### 1.5 Demo-day contingency
- **Run it locally on the presenting laptop**, not a remote deployment — removes conference wifi as a point of failure.
- Have a second terminal ready with `docker compose logs -f backend` open during the live demo so a failure is diagnosable in real time instead of being a silent freeze.
- Take a short screen recording of a full successful run the night before, as a fallback if live infra fails during judging.

---

## 2. Track B — Optional Public Deployment (only if time/interest remains)

**[HACKATHON: optional, do not let this compete with Track A for time]**

- **Hosting:** any free-tier container host (e.g., Railway, Render, Fly.io) for `backend` + `postgres` + `neo4j`; static hosting (Vercel/Netlify) for `frontend`.
- **CI/CD:** a single GitHub Actions workflow — lint + test on push to `main`; manual deploy trigger, not full continuous deployment (avoid deploying a broken build minutes before judging).
- **Monitoring/backups:** not needed for a short-lived public demo instance; do not invest hackathon time here — see `11-observability-spec.md` for what actually matters.

## 3. Rollback

- **Track A:** rollback = `git checkout <last known-good commit>` + `docker compose up --build` again. No blue/green needed for a local single-instance demo.
- **Track B (if used):** redeploy the previous container image/build; keep the last known-good build artifact tagged.

## 4. Explicitly Out of Scope

- Kubernetes / multi-node orchestration (per PRD Section 8).
- Automated backups / disaster recovery.
- Blue-green or canary deployment strategies.
- Multi-hospital / multi-tenant deployment topology.
