#!/usr/bin/env bash
# Run the seed script using DEPLOYED_DATABASE_URL from backend/.env.deployed.
# Create backend/.env.deployed with one line (no export needed):
#   DEPLOYED_DATABASE_URL=postgresql://user:pass@host/dbname
# Then: ./scripts/run_seed_to_deployed.sh   or from repo root: backend/scripts/run_seed_to_deployed.sh
set -e
cd "$(dirname "$0")/.."
if [[ -f .env.deployed ]]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env.deployed
  set +a
fi
if [[ -z "${DEPLOYED_DATABASE_URL:-}" ]]; then
  echo "Error: DEPLOYED_DATABASE_URL is not set. Create backend/.env.deployed with:" >&2
  echo "  DEPLOYED_DATABASE_URL=postgresql://..." >&2
  exit 1
fi
python scripts/seed_deployed_from_local.py "$@"
