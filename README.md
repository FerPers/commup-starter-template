# CommUp

Sistema de gestión de completions y comisionamiento (SaaS multi-tenant) para proyectos industriales: Oil & Gas, renovables y plantas de proceso. En producción en [commup.app](https://commup.app).

Cubre el ciclo completo por sistema: tags e ITR digitales (también sin red, desde el teléfono), punch Cat A/B/C, preservación, certificados MC/RFC/RFSU con firmas por capacidad, liberaciones de sistemas con multifirma, PSSR, gestión diaria, arranque (procedimientos, line-up, bitácora), pruebas de desempeño con IIoT, control documental, P&ID vivo y paquete de handover firmado y verificable. Incluye API pública v1, webhooks y asistencia con IA (Claude).

## Stack

- **Next.js 16** (App Router, React 19, Server Actions) sobre **Cloudflare Workers** con `@opennextjs/cloudflare` (fijado en `1.18.1`).
- **Supabase**: Postgres con RLS en todas las tablas, Auth, Storage y Realtime.
- **TypeScript** estricto, **next-intl** (español e inglés), **pdf-lib** para PDF, **SheetJS** para Excel.
- PWA instalable con service worker propio (`public/sw.js`) y web push.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar los valores
npm run dev                  # http://localhost:3000
```

| Comando | Qué hace |
|---|---|
| `npm run check` | Lint + typecheck + build |
| `npm test` | Vitest (unitarios; los de `tests/db` corren si hay variables `TEST_*`) |
| `npm run help:build` | Regenera la ayuda desde `docs/MANUAL-COMMUP-POR-ROL.md` |
| `npm run preview` | Build de Cloudflare y vista previa local con Wrangler |

El deploy a producción lo hace la CI de GitHub Actions (`.github/workflows/lint.yml`) después de TypeScript, ESLint y Vitest en verde. Los crons viven en `.github/workflows/cron.yml`.

## Documentación

- [`CLAUDE.md`](CLAUDE.md): arquitectura, convenciones y reglas de seguridad (léelo antes de cambiar código).
- [`docs/PLAN-REFERENTE-2026-10-22.md`](docs/PLAN-REFERENTE-2026-10-22.md): plan de trabajo vigente.
- [`docs/MANUAL-COMMUP-POR-ROL.md`](docs/MANUAL-COMMUP-POR-ROL.md): manual de usuario por rol (fuente de `/ayuda` y `/guia`).
- [`supabase/README.md`](supabase/README.md): migraciones y funciones SQL canónicas.
- `docs/archive/`: documentos de etapas cerradas.
