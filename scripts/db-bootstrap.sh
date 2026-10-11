#!/usr/bin/env bash
# Creates the flygo role/databases on the existing PostgreSQL container (idempotent).
# Usage: npm run db:bootstrap   (reads FLYGO_DB_PASSWORD and PG_CONTAINER from .env)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "$ROOT/.env"; set +a

PG_CONTAINER="${PG_CONTAINER:-empire_db}"
: "${FLYGO_DB_PASSWORD:?FLYGO_DB_PASSWORD must be set in .env}"

if ! docker exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
  echo "PostgreSQL container '$PG_CONTAINER' is not ready. Start it first." >&2
  exit 1
fi

docker exec -i "$PG_CONTAINER" psql -U postgres -d postgres -q -v app_password="$FLYGO_DB_PASSWORD" \
  < "$ROOT/infra/docker/postgres/001-create-flygo-db.sql"
echo "flygo databases ready on container '$PG_CONTAINER'."
