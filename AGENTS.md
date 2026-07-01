# AGENTS.md

## Cursor Cloud specific instructions

Mikofai — НСИ/price-list panel. Monorepo with four services (see `README.md` for
the full architecture table and account list):

| Service | Path | Dev run | Port |
|---|---|---|---|
| PostgreSQL 16 | (system) | `pg_ctlcluster 16 main start` | 5432 |
| backend (FastAPI) | `backend/` | `uvicorn app.main:app --reload --port 8000` | 8000 |
| frontend (Vite/React) | `frontend/` | `npm run dev` | 5173 |
| mailer (FastAPI) | `mailer/` | optional; degrades gracefully if down | 8001 |

The repo is designed to run via `docker compose up`, but Docker is **not**
available in this VM. Everything runs **natively** instead. Non-obvious caveats:

- **Postgres runs as a native cluster, not Docker.** Start it with
  `sudo pg_ctlcluster 16 main start` (it does not auto-start on boot). Role
  `mikof`/`changeme` and database `mikofai` already exist in the snapshot.
- **`.env` lives at the repo root and uses `localhost`, not the `db` compose
  hostname.** `DATABASE_URL=postgresql+asyncpg://mikof:changeme@localhost:5432/mikofai`.
  It is gitignored; recreate from `.env.example` if missing, changing host
  `db`→`localhost`. `ADMIN_PASSWORD` and `SEED_PASSWORD` are required or the
  backend refuses to start.
- **Backend uses a venv at `backend/.venv`.** `pydantic-settings` reads the
  `.env` from the current working directory, so load env before running from
  `backend/`: `set -a && . /workspace/.env && set +a` then run uvicorn/seed with
  `.venv/bin/...`.
- **Seeding is idempotent** and runs on demand via `python -m scripts.seed`
  (from `backend/`). It reads `backend/scripts/seed_data/source.xlsx`; on a fresh
  DB it loads ~509 services and prints `DB already seeded, skipping.` on reruns.
- **Frontend dev server proxies `/api` to `BACKEND_URL`** (default `http://backend:8000`).
  Run natively with `BACKEND_URL=http://localhost:8000 npm run dev`.
- **Auth uses cookies + CSRF.** Mutating `/api` calls need the `XSRF-TOKEN`
  cookie echoed in the `X-XSRF-TOKEN` header (the SPA does this automatically).
- **Tests:** API — `backend/.venv/bin/python -m pytest tests/api -v` with
  `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`SEED_PASSWORD` env and the backend running
  (`API_BASE=http://localhost:8000`). E2E — `tests/e2e` (Playwright, needs
  `npx playwright install chromium`). There is no separate lint command; `npm run
  build` runs `tsc -b` for type checking.
