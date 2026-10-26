#!/usr/bin/env bash
# A14: restaura un respaldo de make-backup.sh en un proyecto Supabase NUEVO y lo verifica.
#   scripts/backup/restore-into.sh <directorio | archivo .tar.gz.enc>
# Variables: TARGET_DB_URL (BD destino, recién creada), STORAGE_URL y STORAGE_SERVICE_KEY (destino),
# BACKUP_PASSPHRASE si el respaldo está cifrado. Nunca contra producción.
set -euo pipefail
in="${1:?uso: restore-into.sh <directorio|archivo.enc>}"
here="$(cd "$(dirname "$0")" && pwd)"
: "${TARGET_DB_URL:?falta TARGET_DB_URL}"
case "$TARGET_DB_URL$STORAGE_URL" in *mdyljpgzvigzjpqluket*) echo "restore-into: el destino es producción" >&2; exit 2;; esac
export PGOPTIONS="-c client_min_messages=error"  # los avisos de privilegios de extensiones no son errores
t0=$(date +%s)
if [ -f "$in" ]; then
  dir="$(mktemp -d)"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$in" | tar -C "$dir" -xzf -
else dir="$in"; fi
t1=$(date +%s)
# Datos con los triggers apagados (session_replication_role = replica): la BD queda como estaba, sin reprocesar.
psql "$TARGET_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -q \
  -f "$dir/roles.sql" -f "$dir/schema.sql" -f "$dir/migrations-schema.sql" \
  -c 'SET session_replication_role = replica' -f "$dir/data.sql" -f "$dir/migrations-data.sql" > /dev/null \
  2> >(grep -v 'WARNING:  no privileges were granted' >&2)
# pg_cron no viaja en el volcado: se vuelven a programar los jobs del origen.
jq -r '(if type == "array" then .[0].counts elif has("rows") then .rows[0].counts elif has("counts") then .counts else . end).cron_jobs[] | [.jobname, .schedule, .command] | @json' "$dir/counts.json" |
  while read -r job; do
    psql "$TARGET_DB_URL" -q -v ON_ERROR_STOP=1 -v job="$job" > /dev/null <<< "SELECT cron.schedule(j->>0, j->>1, j->>2) FROM (SELECT :'job'::jsonb AS j) x;"
  done
t2=$(date +%s)
node "$here/storage-import.mjs" "$dir/storage"
t3=$(date +%s)
psql "$TARGET_DB_URL" -At -v ON_ERROR_STOP=1 -f "$here/db-counts.sql" > "$dir/restored-counts.json"
node "$here/compare-counts.mjs" "$dir/counts.json" "$dir/restored-counts.json"
# El Vault no viaja (sus secretos son del proyecto): outbox_dispatch los necesita para webhooks y automatizaciones.
missing=$(psql "$TARGET_DB_URL" -At -c "SELECT string_agg(n, ', ') FROM unnest(ARRAY['service_role_key','edge_function_url','webhook_dispatcher_url']) n WHERE NOT EXISTS (SELECT 1 FROM vault.secrets s WHERE s.name = n)")
[ -n "$missing" ] && echo "pendiente (runbook §3): crear en el Vault del proyecto nuevo: $missing"
echo "tiempos: descifrar $(( t1 - t0 )) s · BD $(( t2 - t1 )) s · Storage $(( t3 - t2 )) s · total $(( $(date +%s) - t0 )) s"
