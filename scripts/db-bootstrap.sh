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

# MongoDB: make sure the app user can also use the isolated test database
# (new volumes get this from infra/docker/mongo/init-app-user.js; this covers older volumes).
if docker exec flygo-mongo-1 true >/dev/null 2>&1; then
  docker exec -e U="$MONGO_APP_USER" -e RU="$MONGO_ROOT_USER" -e RP="$MONGO_ROOT_PASSWORD" -e DB="${MONGODB_DB:-flygo}" flygo-mongo-1 \
    sh -c 'mongosh --quiet -u "$RU" -p "$RP" --authenticationDatabase admin --eval "db.getSiblingDB(process.env.DB).grantRolesToUser(process.env.U, [{ role: \"readWrite\", db: process.env.DB + \"_test\" }])"' \
    && echo "MongoDB test database access ready."
else
  echo "MongoDB container not running — skipped Mongo bootstrap (run npm run infra:up first)."
fi
