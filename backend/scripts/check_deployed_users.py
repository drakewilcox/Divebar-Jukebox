#!/usr/bin/env python3
"""Print users in the deployed database. Uses DEPLOYED_DATABASE_URL from backend/.env.deployed or env."""
import os
import sys
from pathlib import Path

if __name__ == "__main__":
    backend_dir = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(backend_dir))
    os.chdir(backend_dir)

    # Load .env.deployed if present
    env_file = backend_dir / ".env.deployed"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    url = os.environ.get("DEPLOYED_DATABASE_URL")
    if not url:
        print("Set DEPLOYED_DATABASE_URL (e.g. in backend/.env.deployed) or pass it.", file=sys.stderr)
        sys.exit(1)
    if url.startswith("postgres://"):
        url = "postgresql://" + url.split("://", 1)[1]

    from sqlalchemy import create_engine, text
    engine = create_engine(url)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, slug, email, created_at FROM users ORDER BY created_at")).fetchall()
    if not rows:
        print("No users in the database.")
        sys.exit(0)
    print(f"Users ({len(rows)}):")
    for r in rows:
        print(f"  id={r[0]!r}  slug={r[1]!r}  email={r[2]!r}  created_at={r[3]!r}")
