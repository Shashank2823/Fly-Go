#!/usr/bin/env bash
# Generates a local .env from .env.example with random secrets. Refuses to overwrite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env" ] && { echo ".env already exists; not overwriting." >&2; exit 1; }
rnd() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | cut -c1-"$1"; }
PG=$(rnd 32); RD=$(rnd 32); MR=$(rnd 32); MA=$(rnd 32); SS=$(rnd 64)
sed -e "s|<flygo_app-password>|$PG|g" -e "s|<redis-password>|$RD|g" \
    -e "s|<mongo-root-password>|$MR|g" -e "s|<mongo-app-password>|$MA|g" \
    -e "s|<min-32-char-random-string>|$SS|g" "$ROOT/.env.example" > "$ROOT/.env"
chmod 600 "$ROOT/.env"
echo ".env created with random local secrets."
