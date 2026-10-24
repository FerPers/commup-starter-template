# Runbook — respaldo y restauración (A14)

**Objetivo (decisión 5 del plan de salida, 24-oct):** pérdida máxima **≤ 24 h**, recuperación **≤ 8 h**, BD **y** Storage.

**Hallazgo del 24-oct:** la organización de Supabase está en el **plan gratuito**, que no guarda copias
(`supabase backups list` vacío), y el Storage nunca entra en las copias de Supabase en ningún plan. Luis decidió
respaldar por cuenta propia en GitHub, cifrado.

## 1 Qué se respalda

| Qué | Cómo | Dónde | Retención |
|---|---|---|---|
| BD: roles, esquema, datos (public, auth, storage) e historial de migraciones | `supabase db dump` (4 archivos) | artefacto de GitHub Actions | 7 días |
| Storage: todos los archivos de los 11 buckets | `scripts/backup/storage-export.mjs` (manifiesto con sha256) | mismo artefacto | 7 días |
| Huella para verificar | `scripts/backup/db-counts.sql`: filas por tabla, jobs de pg_cron, funciones, última migración | mismo artefacto | 7 días |

- Workflow `Respaldo` (`.github/workflows/backup.yml`): todos los días a las 04:30 UTC (23:30 en Colombia), también a mano.
- Cifrado AES-256 con PBKDF2 (`openssl enc`) con la frase `BACKUP_PASSPHRASE`. **Sin esa frase la copia no se abre**: guárdala fuera de GitHub.
- Tamaño al 24-oct: 37 MB sin comprimir, **7,6 MB cifrado**.

## 2 Configuración (una vez)

1. Frase de cifrado: genera una larga, guárdala en tu gestor de contraseñas y cárgala:

```bash
gh secret set BACKUP_PASSPHRASE
```

2. Conexión a la BD de prod. Supabase → *Connect* → **Session pooler** (URI con la contraseña de la BD, caracteres especiales en formato URL):

```bash
gh secret set SUPABASE_DB_URL
```

3. Primera corrida y primer ensayo:

```bash
gh workflow run backup.yml
```

```bash
gh workflow run restore-drill.yml
```

`NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya existen como secretos (los usa el deploy).

## 3 Restaurar tras un incidente (proyecto nuevo)

Nunca se restaura encima de prod: se crea un proyecto nuevo y la app se apunta a él. Tiempos estimados con el volumen actual.

| # | Paso | Tiempo |
|---|---|---|
| 1 | Crear el proyecto en Supabase (misma región `us-east-1`, Postgres 17). Anotar ref, contraseña de BD, URL y llaves. | 10 min |
| 2 | Bajar la copia: `gh run list --workflow backup.yml --status success` y `gh run download <id>`. | 5 min |
| 3 | Restaurar y verificar (`restore-into.sh`, ver abajo). Debe terminar en «idéntica» y «N/N objetos restaurados y verificados». | 5 min |
| 4 | **Vault** (no viaja): crear `service_role_key` (llave service role del proyecto nuevo), `edge_function_url` y `webhook_dispatcher_url` (URLs de las funciones del proyecto nuevo). El script lista los que faltan. | 10 min |
| 5 | Edge Functions: desplegar `evaluate-workflow` y `webhook-dispatcher` con `verify_jwt=false`. | 10 min |
| 6 | Auth: URL del sitio y de redirección (`https://commup.app`), SMTP de invitaciones, plantillas de correo. | 20 min |
| 7 | Worker: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` del proyecto nuevo, en los secretos de GitHub y de Wrangler; push a main (el job `deploy` despliega). | 30 min |
| 8 | Repo: `supabase link --project-ref <nuevo>`, `project_id` en las herramientas que lo nombran, secretos `SUPABASE_DB_URL` y `TEST_*`. | 20 min |
| 9 | Prueba de humo: login, una ficha de ITR con foto, un PDF, `/admin/health` en verde, CI con la deriva de funciones en verde. | 30 min |

**Total estimado: 2 h 20 min**, dentro del objetivo de 8 h. Las sesiones abiertas se pierden (los usuarios vuelven a entrar); las contraseñas se conservan.

Restauración (paso 3), con las variables del proyecto **nuevo**:

```bash
TARGET_DB_URL='postgresql://postgres:<clave>@db.<nuevo>.supabase.co:5432/postgres' STORAGE_URL='https://<nuevo>.supabase.co' STORAGE_SERVICE_KEY='<service role nuevo>' BACKUP_PASSPHRASE='<frase>' scripts/backup/restore-into.sh commup-backup-AAAAMMDD-HHMM.tar.gz.enc
```

El script se niega a restaurar sobre prod (`mdyljpgzvigzjpqluket`). Los triggers quedan apagados durante la carga de datos (`session_replication_role = replica`): la BD queda como estaba, sin reprocesar eventos ni avisos. Los jobs de pg_cron se vuelven a programar desde la huella.

## 4 Ensayo

- **Automático:** workflow `Ensayo de restauración` (`.github/workflows/restore-drill.yml`), el día 1 de cada mes y a mano. Levanta una Supabase en blanco con las versiones de Auth y Storage de la copia, restaura, verifica y deja en el resumen la fecha de la copia y los tiempos. Si algo no cuadra, el job falla.
- **Local** (mismo procedimiento):

```bash
scripts/backup/drill-target.sh /tmp/drill/target /tmp/drill/commup-backup/versions.json
```

Después: `set -a; . /tmp/drill/target/target.env; set +a` y `scripts/backup/restore-into.sh <copia>`. El destino usa puertos 563xx y convive con el stack local de pruebas. Si la imagen no baja de ECR: `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`.

### Primer ensayo (24-oct, local, contra la copia real de prod)

| Medida | Resultado |
|---|---|
| Respaldo (BD + Storage + cifrado) | 2 min 41 s · 37 MB → 7,6 MB cifrado |
| Supabase en blanco | 57 s |
| Restauración BD + Storage | 3 s |
| Verificación | 200 tablas idénticas · 55.705 filas en public · 8 jobs de pg_cron · funciones y última migración iguales · 15/15 archivos por sha256 |

Lo que el ensayo enseñó y ya quedó en los scripts:
- El destino necesita Auth y Storage de la **misma versión o más nueva** que prod (con una más vieja falla la carga de `auth`); la copia guarda esas versiones en `versions.json`.
- El volcado de la CLI no trae el historial de migraciones (`supabase_migrations`): sin él el proyecto restaurado no recibe más migraciones. Va aparte en la copia.
- El Vault no viaja (paso 4).

## 5 Límites y cuándo revisarlo

- 7 días de retención y la cuota de artefactos de GitHub (500 MB en el plan gratuito; hoy ~55 MB por semana). Si la copia cifrada pasa de ~60 MB, o con datos de clientes que exijan más retención, mover a Cloudflare R2 (30 días) o pasar a Supabase Pro (copias físicas diarias) además de esta copia.
- La pérdida máxima es de 24 h. Menos que eso exige PITR (Supabase Pro + complemento).
- Si la copia o el ensayo fallan, GitHub avisa por correo a quien programó el workflow.
