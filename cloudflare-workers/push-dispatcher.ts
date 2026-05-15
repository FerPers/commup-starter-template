/**
 * CommUP — Cloudflare Worker: Push Notification Dispatcher
 * Stage 14.5
 *
 * Endpoints:
 *   POST /api/push/subscribe      → Registrar/actualizar subscription
 *   POST /api/push/unsubscribe    → Eliminar subscription
 *   POST /api/push/update-topics  → Actualizar tópicos
 *   POST /api/push/test           → Enviar notificación de prueba
 *   POST /api/push/send           → Enviar notificación a user(s) [interno]
 *
 * Variables de entorno (KV + Secrets):
 *   VAPID_PRIVATE_KEY
 *   VAPID_PUBLIC_KEY
 *   VAPID_SUBJECT  (mailto:admin@commup.io)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   PUSH_SUBS_KV  (KV Namespace para caché de subscriptions)
 */

export interface Env {
  VAPID_PRIVATE_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_SUBJECT: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  PUSH_SUBS_KV: KVNamespace;
}

// ─── Web Push con VAPID manual (sin librería externa) ─────────────────────
async function signVAPID(
  audience: string,
  subject: string,
  privateKeyB64: string,
  expiresIn = 12 * 3600
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Importar clave privada VAPID (PKCS8 DER)
  const keyData = Uint8Array.from(atob(privateKeyB64), (c) => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${signingInput}.${sigB64}`;
}

async function sendWebPush(
  env: Env,
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object
): Promise<{ success: boolean; status?: number; error?: string }> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const jwt = await signVAPID(audience, env.VAPID_SUBJECT, env.VAPID_PRIVATE_KEY);
  const authHeader = `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`;

  // NOTA: payload se envía sin encriptación RFC 8291 (algunos servicios lo aceptan).
  // Para producción: implementar Web Push Encryption (RFC 8291) con p256dh + auth.

  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'TTL': '86400',
        'Urgency': 'normal',
        'Topic': 'commup-notification',
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 410 || response.status === 404) {
      // Subscription expired — marcar para eliminar
      return { success: false, status: response.status, error: 'subscription_expired' };
    }

    return { success: response.ok, status: response.status };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Supabase helpers ──────────────────────────────────────────────────────
type SubscriptionRow = {
  id?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  topics?: string[] | null;
  user_id?: string;
};

async function supabaseQuery<T = unknown>(
  env: Env,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Supabase error ${response.status}: ${err}`);
  }
  return response.json();
}

// Production origins allowed to call this worker. Keep in sync with the
// allowlist in ai-assistant-worker.ts; new stagings must be added explicitly.
const ALLOWED_ORIGINS = new Set<string>([
  'https://commup.app',
  'https://www.commup.app',
]);

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://commup.app';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// ─── Router ───────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = corsHeadersFor(request.headers.get('Origin'));

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    try {
      // ── POST /api/push/subscribe ────────────────────────────────────────
      if (path === '/api/push/subscribe' && request.method === 'POST') {
        const body = await request.json() as {
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          topics: string[];
          device_info: object;
        };

        // Upsert en Supabase
        const result = await supabaseQuery<Array<{ id: string }>>(env, 'push_subscriptions', {
          method: 'POST',
          body: JSON.stringify({
            user_id: body.user_id,
            endpoint: body.endpoint,
            p256dh: body.p256dh,
            auth: body.auth,
            topics: body.topics,
            device_info: body.device_info,
            updated_at: new Date().toISOString(),
          }),
          headers: {
            'Prefer': 'resolution=merge-duplicates',
            'on_conflict': 'endpoint',
          },
        });

        // Caché en KV para envíos rápidos
        await env.PUSH_SUBS_KV.put(
          `sub:${body.endpoint}`,
          JSON.stringify({ p256dh: body.p256dh, auth: body.auth, topics: body.topics }),
          { expirationTtl: 7 * 24 * 3600 }
        );

        return json({ success: true, id: result[0]?.id });
      }

      // ── POST /api/push/unsubscribe ──────────────────────────────────────
      if (path === '/api/push/unsubscribe' && request.method === 'POST') {
        const { endpoint, user_id } = await request.json() as { endpoint: string; user_id: string };

        await supabaseQuery(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${user_id}`, {
          method: 'DELETE',
        });

        await env.PUSH_SUBS_KV.delete(`sub:${endpoint}`);
        return json({ success: true });
      }

      // ── POST /api/push/update-topics ────────────────────────────────────
      if (path === '/api/push/update-topics' && request.method === 'POST') {
        const { endpoint, user_id, topics } = await request.json() as {
          endpoint: string;
          user_id: string;
          topics: string[];
        };

        await supabaseQuery(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${user_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ topics, updated_at: new Date().toISOString() }),
        });

        // Actualizar KV
        const existing = await env.PUSH_SUBS_KV.get(`sub:${endpoint}`, 'json') as { p256dh: string; auth: string; topics: string[] } | null;
        if (existing) {
          await env.PUSH_SUBS_KV.put(`sub:${endpoint}`, JSON.stringify({ ...existing, topics }), {
            expirationTtl: 7 * 24 * 3600,
          });
        }

        return json({ success: true });
      }

      // ── POST /api/push/test ─────────────────────────────────────────────
      if (path === '/api/push/test' && request.method === 'POST') {
        const { user_id } = await request.json() as { user_id: string };

        const subs = await supabaseQuery<SubscriptionRow[]>(env, `push_subscriptions?user_id=eq.${user_id}&select=endpoint,p256dh,auth`);

        const testPayload = {
          title: '🔔 CommUP — Prueba de notificación',
          body: '¡Las notificaciones de campo están funcionando correctamente!',
          type: 'SYSTEM',
          entity_id: 'test',
          action_url: '/settings/notifications',
          priority: 'normal',
        };

        const results = await Promise.all(
          subs.map((sub) => sendWebPush(env, sub, testPayload))
        );

        return json({ success: true, sent: results.length, results });
      }

      // ── POST /api/push/send ─────────────────────────────────────────────
      // Endpoint interno — llamado desde Supabase Functions/Triggers
      if (path === '/api/push/send' && request.method === 'POST') {
        const body = await request.json() as {
          user_ids?: string[];          // enviar a usuarios específicos
          topic?: string;               // filtrar por tópico
          payload: CommUPPushPayload;
        };

        let query = 'push_subscriptions?select=id,endpoint,p256dh,auth,topics,user_id';

        if (body.user_ids && body.user_ids.length > 0) {
          query += `&user_id=in.(${body.user_ids.join(',')})`;
        }

        const subs = await supabaseQuery<SubscriptionRow[]>(env, query);

        // Filtrar por tópico si se especifica
        const filtered = body.topic
          ? subs.filter((s) => s.topics?.includes(body.topic!))
          : subs;

        if (filtered.length === 0) {
          return json({ success: true, sent: 0, message: 'No subscriptions found' });
        }

        // Enviar en lotes de 50 para no saturar
        const BATCH_SIZE = 50;
        let sent = 0;
        let failed = 0;
        const expired: string[] = [];

        for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
          const batch = filtered.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map((sub) => sendWebPush(env, sub, body.payload))
          );

          for (let j = 0; j < results.length; j++) {
            const r = results[j];
            if (r.status === 'fulfilled') {
              if (r.value.success) {
                sent++;
              } else if (r.value.error === 'subscription_expired') {
                expired.push(batch[j].endpoint);
                failed++;
              } else {
                failed++;
              }
            } else {
              failed++;
            }
          }
        }

        // Limpiar subscriptions expiradas
        if (expired.length > 0) {
          for (const endpoint of expired) {
            await supabaseQuery(
              env,
              `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
              { method: 'DELETE' }
            ).catch(() => { });
            await env.PUSH_SUBS_KV.delete(`sub:${endpoint}`).catch(() => { });
          }
        }

        return json({ success: true, sent, failed, expired: expired.length });
      }

      return json({ error: 'Not found' }, 404);

    } catch (err: unknown) {
      console.error('[PushDispatcher] Error:', err);
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  },

  // ── Scheduled: Limpiar subscriptions expiradas ─────────────────────────
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    // Correr diariamente para limpiar subs viejas (> 30 días sin update)
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    try {
      await supabaseQuery(env, `push_subscriptions?updated_at=lt.${cutoff}`, { method: 'DELETE' });
      console.log('[PushDispatcher] Cleaned up old subscriptions');
    } catch (err) {
      console.error('[PushDispatcher] Cleanup error:', err);
    }
  },
} satisfies ExportedHandler<Env>;

interface CommUPPushPayload {
  title: string;
  body: string;
  type: string;
  entity_id: string;
  action_url: string;
  priority?: string;
  tag?: string;
}

interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}
