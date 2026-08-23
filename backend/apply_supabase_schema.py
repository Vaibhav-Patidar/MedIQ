"""Apply backend/schema.sql to any PostgreSQL target — intended for Supabase
(ADR: managed Postgres as source of truth), works for the dockerized one too.

Usage:
    python apply_supabase_schema.py                       # uses DATABASE_URL
    python apply_supabase_schema.py "postgresql://..."    # explicit URL

Supabase connection string (Project Settings → Database):
    postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
(Use port 6543 + ?sslmode=require if you go through the transaction pooler.)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.config import get_settings  # noqa: E402
from app.db import get_engine, reset_engine  # noqa: E402


def main() -> None:
    if len(sys.argv) > 1:
        os.environ["DATABASE_URL"] = sys.argv[1]
        reset_engine()

    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
    with open(schema_path) as fh:
        ddl = fh.read()
    # strip our in-file comment block referencing init scripts? not needed —
    # comments are valid SQL.

    import os as _os

    url = _os.environ["DATABASE_URL"]
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        # strip SQLAlchemy dialect marker again for the raw driver
        url = _os.environ["DATABASE_URL"]

    import psycopg

    # autocommit so one "already exists" doesn't abort the whole batch
    with psycopg.connect(url, autocommit=True) as conn:
        cur = conn.cursor()
        created, skipped = [], []
        # drop full-line comments FIRST (they can contain ';'), then split
        ddl = "\n".join(line for line in ddl.splitlines()
                        if not line.strip().startswith("--"))
        # tolerate re-runs (tables/indexes already present)
        for stmt in ddl.split(";"):
            stmt = stmt.strip()
            if not stmt:
                continue
            try:
                cur.execute(stmt)
            except Exception as exc:
                msg = str(exc)
                if "already exists" in msg:
                    skipped.append(msg.split('"')[1] if '"' in msg else stmt[:40])
                else:
                    snippet = " ".join(stmt.split())[:160]
                    raise RuntimeError(f"statement failed: {snippet}\n-> {msg}") from exc
        print(f"schema applied OK ({len(created)} created, {len(skipped)} already existed)")
        cur.execute(
            "select table_name from information_schema.tables "
            "where table_schema='public' order by table_name"
        )
        names = [r[0] for r in cur.fetchall()]
        print("public tables:", ", ".join(names))


if __name__ == "__main__":
    main()
