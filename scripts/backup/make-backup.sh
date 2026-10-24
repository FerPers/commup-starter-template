#!/usr/bin/env bash
# A14: respaldo completo (BD + Storage) en un directorio y, con BACKUP_PASSPHRASE, un archivo cifrado a su lado.
#   scripts/backup/make-backup.sh <directorio>
# Variables: DB_URL (cadena de conexión del origen; sin ella usa el proyecto enlazado con `supabase link`),
# STORAGE_URL y STORAGE_SERVICE_KEY (origen), BACKUP_PASSPHRASE (opcional: cifra con AES-256 + PBKDF2).
set -euo pipefail
out="${1:?uso: make-backup.sh <directorio>}"
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$out"
# Sin espacios ni CR (un .env con CRLF deja la URL inválida para curl).
STORAGE_URL="$(printf %s "${STORAGE_URL:?falta STORAGE_URL}" | tr -d '[:space:]')"; STORAGE_URL="${STORAGE_URL%/}"; export STORAGE_URL
src=(--linked); [ -n "${DB_URL:-}" ] && src=(--db-url "$DB_URL")
t0=$(date +%s)
supabase db dump "${src[@]}" --role-only -f "$out/roles.sql"
supabase db dump "${src[@]}" -f "$out/schema.sql"
supabase db dump "${src[@]}" --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes -f "$out/data.sql"
# Historial de migraciones: el volcado normal lo omite y sin él el proyecto restaurado no recibe más migraciones.
supabase db dump "${src[@]}" -s supabase_migrations -f "$out/migrations-schema.sql"
supabase db dump "${src[@]}" -s supabase_migrations --data-only --use-copy -f "$out/migrations-data.sql"
if [ -n "${DB_URL:-}" ]; then
  psql "$DB_URL" -At -v ON_ERROR_STOP=1 -f "$here/db-counts.sql" > "$out/counts.json"
else
  supabase db query --linked -o json -f "$here/db-counts.sql" > "$out/counts.json"
fi
node "$here/storage-export.mjs" "$out/storage"
# Versiones de Auth y Storage del origen: el proyecto donde se restaura debe tener esas o más nuevas (sus esquemas).
{ printf '{"auth":'; curl -fsS "$STORAGE_URL/auth/v1/health" -H "apikey: $STORAGE_SERVICE_KEY" | jq -c .version
  printf ',"storage":'; curl -fsS "$STORAGE_URL/storage/v1/version" -H "apikey: $STORAGE_SERVICE_KEY" | jq -R -c .; printf '}\n'; } > "$out/versions.json"
echo "respaldo en $out ($(du -sh "$out" | cut -f1), $(( $(date +%s) - t0 )) s)"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  tar -C "$out" -czf - . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$out.tar.gz.enc"
  echo "cifrado: $out.tar.gz.enc ($(du -h "$out.tar.gz.enc" | cut -f1))"
fi
