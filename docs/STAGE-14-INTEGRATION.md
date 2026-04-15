# CommUP — Stage 14: UX de Campo Radical (PWA v2)
## Integration Guide & Deployment Checklist

---

## Arquitectura del Stage 14

```
Browser / Mobile
│
├── manifest.json          → PWA installable (A2HS, shortcuts, share target)
├── sw.ts                  → Service Worker (cache-first, background sync, push)
├── offline.html           → Fallback offline con pending count
│
├── QRNFCScanner.tsx       → 14.2 QR + NFC + Manual input → /tag_360/:id
├── VoiceInput.tsx         → 14.3 Web Speech API para campos ITR
├── SwipeCaptureFlow.tsx   → 14.4 Swipe, auto-save, geolocation photos
├── PushNotificationManager.tsx → 14.5 VAPID subscription lifecycle
└── useSyncConflictResolution.ts → 14.6 LWW + audit log + queue
         │
         ▼
Cloudflare Workers
├── push-dispatcher.ts    → Web Push endpoint + VAPID signing
└── wrangler.toml         → Deploy config + KV + Cron
         │
         ▼
Supabase
├── push_subscriptions    → tabla de subscriptions Web Push
├── conflict_log          → audit log de conflictos LWW
└── sync_queue_log        → opcional: historial de sync events
```

---

## 1. Supabase Migrations

```sql
-- push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  topics        TEXT[] DEFAULT '{itr_returned,punch_cat_a,cert_ready}'::TEXT[],
  device_info   JSONB DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id);
CREATE INDEX idx_push_subs_topics ON public.push_subscriptions USING GIN(topics);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions"
  ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Service role puede leer todas (para el Worker)
CREATE POLICY "Service role reads all"
  ON public.push_subscriptions
  FOR SELECT USING (auth.role() = 'service_role');

-- conflict_log
CREATE TABLE IF NOT EXISTS public.conflict_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  conflict_type   TEXT NOT NULL,
  local_snapshot  JSONB NOT NULL,
  remote_snapshot JSONB NOT NULL,
  winner          TEXT NOT NULL CHECK (winner IN ('local', 'remote')),
  winner_payload  JSONB NOT NULL,
  conflict_data   JSONB DEFAULT '{}'::JSONB,
  detected_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT,
  notes           TEXT,
  user_id         UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_conflict_entity ON public.conflict_log(entity_id, entity_type);
CREATE INDEX idx_conflict_detected ON public.conflict_log(detected_at DESC);
CREATE INDEX idx_conflict_unresolved ON public.conflict_log(resolved_at) WHERE resolved_at IS NULL;

ALTER TABLE public.conflict_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own conflicts"
  ON public.conflict_log
  FOR SELECT USING (auth.uid() = user_id);

-- Función para notificar push via trigger de Supabase → Cloudflare Worker
CREATE OR REPLACE FUNCTION public.notify_push_on_itr_return()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'returned' AND OLD.status != 'returned' THEN
    -- Llamar al Cloudflare Worker vía net.http_post (extensión pg_net)
    PERFORM net.http_post(
      url := current_setting('app.push_worker_url') || '/api/push/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.push_worker_secret')
      ),
      body := jsonb_build_object(
        'user_ids', ARRAY[NEW.assigned_to::TEXT],
        'topic', 'itr_returned',
        'payload', jsonb_build_object(
          'title', 'ITR Devuelto — ' || NEW.itr_number,
          'body', 'El ITR ' || NEW.itr_number || ' fue devuelto para corrección',
          'type', 'ITR_RETURNED',
          'entity_id', NEW.id::TEXT,
          'action_url', '/itrs/' || NEW.id::TEXT,
          'priority', 'high'
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER itr_return_push_notify
  AFTER UPDATE ON public.itrs
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_itr_return();

-- Trigger para Punch Cat A asignado
CREATE OR REPLACE FUNCTION public.notify_push_on_punch_assign()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
    PERFORM net.http_post(
      url := current_setting('app.push_worker_url') || '/api/push/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.push_worker_secret')
      ),
      body := jsonb_build_object(
        'user_ids', ARRAY[NEW.assigned_to::TEXT],
        'topic', CASE WHEN NEW.category = 'A' THEN 'punch_cat_a' ELSE 'punch_assigned' END,
        'payload', jsonb_build_object(
          'title', 'Punch Cat ' || NEW.category || ' Asignado',
          'body', NEW.description,
          'type', 'PUNCH_ASSIGNED',
          'entity_id', NEW.id::TEXT,
          'action_url', '/punches/' || NEW.id::TEXT,
          'priority', CASE WHEN NEW.category = 'A' THEN 'high' ELSE 'normal' END
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER punch_assign_push_notify
  AFTER UPDATE ON public.punch_items
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_punch_assign();
```

---

## 2. Vite config para SW + PWA

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',   // Usamos nuestro SW customizado
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      manifest: false,                // manifest.json manual en /public
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
```

---

## 3. VAPID Key Generation

```bash
# Instalar web-push CLI
npm install -g web-push

# Generar par de claves VAPID
web-push generate-vapid-keys --json

# Output:
# {
#   "publicKey": "BExample...",
#   "privateKey": "example..."
# }

# Configurar en Cloudflare Worker:
wrangler secret put VAPID_PRIVATE_KEY   # pegar private key
wrangler secret put VAPID_PUBLIC_KEY    # pegar public key
wrangler secret put VAPID_SUBJECT       # mailto:admin@commup.io
wrangler secret put SUPABASE_URL        # https://xxx.supabase.co
wrangler secret put SUPABASE_SERVICE_KEY # service_role key

# Configurar en .env del frontend:
VITE_VAPID_PUBLIC_KEY=BExample...
```

---

## 4. Registro del Service Worker (main.tsx)

```typescript
// src/main.tsx
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    // Mostrar banner "Nueva versión disponible"
    showUpdateBanner(() => updateSW(true));
  },
  onOfflineReady() {
    console.log('[CommUP] App lista para usar offline');
    showToast('CommUP está lista para usar sin conexión ✓');
  },
  onRegistered(r) {
    // Intentar sync al registrar
    r?.active?.postMessage({ type: 'SYNC_ALL' });
  },
});

// Escuchar mensajes del SW
navigator.serviceWorker?.addEventListener('message', (event) => {
  const { type, entity, id } = event.data;
  if (type === 'SYNC_SUCCESS') {
    invalidateQuery(['entity', entity, id]);
  }
  if (type === 'NAVIGATE') {
    router.navigate(event.data.url);
  }
});
```

---

## 5. html5-qrcode install

```bash
npm install html5-qrcode
```

```typescript
// Uso lazy para no penalizar bundle inicial
const { Html5Qrcode } = await import('html5-qrcode');
```

---

## 6. Routing (React Router)

```typescript
// Agregar a tu router:
{
  path: '/scan',
  element: <QRNFCScanner />,
},
{
  path: '/itrs/:itrId/capture',
  element: <SwipeCaptureFlow />,
},
{
  path: '/settings/notifications',
  element: <PushNotificationManager userId={user.id} />,
},
{
  path: '/sync/conflicts',
  element: <ConflictLogViewer />,  // implementar con useSyncConflictResolution
},
```

---

## 7. Deploy

```bash
# Frontend (Cloudflare Pages)
npm run build
wrangler pages deploy dist --project-name commup-app

# Push Worker
cd workers
wrangler deploy push-dispatcher.ts

# KV setup
wrangler kv:namespace create "PUSH_SUBS_KV"
# Copiar el ID generado a wrangler.toml

# Cron trigger automático ya configurado en wrangler.toml (3 AM UTC)
```

---

## 8. Checklist de Pruebas Campo

| Test | Método | Criterio de Aceptación |
|------|--------|------------------------|
| PWA Install (Android) | Chrome → "Agregar a pantalla" | App instala con icono CommUP |
| PWA Install (iOS) | Safari → Compartir → Inicio | App en homescreen, funciona standalone |
| QR Scan → tag_360 | Escanear QR de equipo real | Navega a /tag_360/:id en < 1s |
| NFC Scan | Acercar tag NFC | Navega a /tag_360/:id |
| Voice Input | Dictar observación en campo | Texto aparece correctamente en campo |
| Swipe entre items | Deslizar en capture flow | Transición suave, auto-save funciona |
| Offline capture | Modo avión + capturar ITR | Items guardados en IndexedDB |
| Background sync | Recuperar conexión | Items sincronizados automáticamente |
| Push notification | ITR devuelto en servidor | Notificación llega < 5s |
| Conflict LWW | Editar mismo item offline x2 | Winner correcto, log generado |
| Geolocation en foto | Capturar foto en campo | Coordenadas embebidas en metadata |

---

## Estado Stage 14

| Sub-item | Status | Archivos |
|----------|--------|----------|
| 14.1 SW + manifest | ✅ DONE | `pwa/sw.ts`, `pwa/manifest.json` |
| 14.2 QR/NFC Scanner | ✅ DONE | `components/QRNFCScanner.tsx` |
| 14.3 Voice Input | ✅ DONE | `components/VoiceInput.tsx` |
| 14.4 Swipe Capture | ✅ DONE | `components/SwipeCaptureFlow.tsx` |
| 14.5 Push Notifications | ✅ DONE | `components/PushNotificationManager.tsx`, `workers/push-dispatcher.ts` |
| 14.6 Conflict Resolution | ✅ DONE | `hooks/useSyncConflictResolution.ts` |
| Offline page | ✅ DONE | `pwa/offline.html` |
| SQL Migrations | ✅ DONE | Este documento |

**Stage 14 COMPLETO → Siguiente: Stage 15**

---

*CommUP Execution Digital Backbone — Plan Estratégico v14*
*Ingeniero: LuisFer Perdomo | Oil & Gas Industrial Automation*
