#!/usr/bin/env bash
# A14: levanta una Supabase local EN BLANCO (sin migraciones del repo) para ensayar una restauración, con las
# versiones de Auth y Storage del respaldo (versions.json). Puertos 563xx: convive con el stack local de pruebas.
#   scripts/backup/drill-target.sh <directorio-de-trabajo> <versions.json>
# Deja en <directorio>/target.env TARGET_DB_URL, STORAGE_URL y STORAGE_SERVICE_KEY para restore-into.sh.
set -euo pipefail
work="${1:?uso: drill-target.sh <directorio> <versions.json>}"; versions="${2:?falta versions.json}"
mkdir -p "$work" && cd "$work"
supabase init --force > /dev/null
python3 - <<'PY'
import re
p = 'supabase/config.toml'; s = open(p).read()
s = re.sub(r'project_id = ".*"', 'project_id = "commup-restore-drill"', s, count=1)
for old in ('54320', '54321', '54322', '54323', '54324', '54325', '54326', '54327', '54329'):
    s = s.replace(f'= {old}', f'= 563{old[3:]}')
for section in ('studio', 'inbucket', 'analytics', 'edge_runtime'):
    s = re.sub(rf'(\[{section}\]\nenabled = )true', r'\1false', s)
open(p, 'w').write(s)
PY
mkdir -p supabase/.temp
jq -r .auth "$versions" | tr -d '\n' > supabase/.temp/gotrue-version
printf 'v%s' "$(jq -r .storage "$versions")" > supabase/.temp/storage-version
supabase start > /dev/null
eval "$(supabase status -o env 2>/dev/null | grep -E '^(DB_URL|API_URL|SERVICE_ROLE_KEY)=')"
printf 'TARGET_DB_URL=%s\nSTORAGE_URL=%s\nSTORAGE_SERVICE_KEY=%s\n' "$DB_URL" "$API_URL" "$SERVICE_ROLE_KEY" > target.env
echo "destino en blanco: $API_URL (Auth $(cat supabase/.temp/gotrue-version), Storage $(cat supabase/.temp/storage-version))"
