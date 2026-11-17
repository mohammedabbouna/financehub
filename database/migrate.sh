#!/usr/bin/env bash
# Apply database/init/*.sql to a RUNNING database (idempotent).
#
# MySQL's entrypoint only executes /docker-entrypoint-initdb.d on a brand-new
# data volume — after that, new init files (added in later releases) must be
# applied manually. Every script in database/init uses CREATE TABLE IF NOT
# EXISTS / INSERT IGNORE, so re-running this is always safe.
#
# Usage:  ./database/migrate.sh          # from the repo root
set -euo pipefail
cd "$(dirname "$0")/.."

DB_PASS_VALUE="${DB_PASS:?DB_PASS is not set — source .env first}"
DB_NAME_VALUE="${DB_NAME:-financehub}"
DB_USER_VALUE="${DB_USER:-root}"

echo "Applying database/init/*.sql to '${DB_NAME_VALUE}'..."
for file in database/init/*.sql; do
  printf '  %s ... ' "$file"
  docker compose exec -T db mysql -u"$DB_USER_VALUE" -p"$DB_PASS_VALUE" \
    --default-character-set=utf8mb4 "$DB_NAME_VALUE" < "$file" 2>/dev/null
  echo "ok"
done
echo "Done. Schema is up to date."
