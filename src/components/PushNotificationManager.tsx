/**
 * CommUP — Push Notification Manager (Stage 14.5)
 *
 * Web Push API + VAPID + Cloudflare Workers dispatcher.
 * Handles: subscription lifecycle, permission UX, topic management.
 *
 * Flujo:
 * 1. Usuario permite notificaciones
 * 2. SW genera PushSubscription (endpoint + keys)
 * 3. App envía subscription a Supabase (tabla push_subscriptions)
 * 4. Cloudflare Worker lee subscriptions y envía web-push
 * 5. SW recibe push → muestra notificación
 */

import React, { useCallback, useEffect, useState } from 'react';

// ─── Tipos ─────────────────────────────────────────────────────────────────
export type NotificationTopic =
  | 'itr_returned'
  | 'punch_assigned'
  | 'punch_cat_a'
  | 'cert_ready'
  | 'system_alerts'
  | 'my_items_only';

export interface PushSubscriptionRecord {
  id?: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  topics: NotificationTopic[];
  device_info: {
    ua: string;
    platform: string;
  };
  created_at?: string;
  updated_at?: string;
}

interface PushNotificationManagerProps {
  userId: string;
  onSubscriptionChange?: (active: boolean) => void;
}

// ─── VAPID public key (generada en Cloudflare Dashboard) ──────────────────
// En producción: cargar desde env o config endpoint
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BExample-VAPID-Public-Key-Replace-In-Production';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

// ─── Hook: Push Subscription ──────────────────────────────────────────────
export function usePushNotifications(userId: string) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<NotificationTopic[]>([
    'itr_returned', 'punch_cat_a', 'cert_ready',
  ]);

  useEffect(() => {
    setPermission(Notification.permission);
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch { }
  };

  const subscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Solicitar permiso
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        setError('Permiso de notificaciones denegado');
        return false;
      }

      // 2. Registrar / obtener SW
      const reg = await navigator.serviceWorker.ready;

      // 3. Crear subscription con VAPID
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      // 4. Construir record
      void subscription.toJSON();
      const record: PushSubscriptionRecord = {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
        auth: arrayBufferToBase64(subscription.getKey('auth')!),
        topics,
        device_info: {
          ua: navigator.userAgent.substring(0, 200),
          platform: navigator.platform,
        },
      };

      // 5. Guardar en Supabase
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error || `HTTP ${response.status} registrando subscription`);
      }

      setIsSubscribed(true);
      return true;
    } catch (err: any) {
      setError(err.message || 'Error activando notificaciones');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [userId, topics]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        // Eliminar del servidor
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint, user_id: userId }),
        });
      }
      setIsSubscribed(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const updateTopics = useCallback(async (newTopics: NotificationTopic[]) => {
    setTopics(newTopics);
    if (!isSubscribed) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      await fetch('/api/push/update-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          user_id: userId,
          topics: newTopics,
        }),
      });
    } catch { }
  }, [userId, isSubscribed]);

  const [testStatus, setTestStatus] = useState<{ kind: 'idle' | 'loading' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' });

  const sendTestNotification = useCallback(async () => {
    setTestStatus({ kind: 'loading' });
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = (await res.json().catch(() => ({}))) as { sent?: number; total?: number; error?: string };
      if (!res.ok) {
        setTestStatus({ kind: 'error', msg: json.error || `HTTP ${res.status}` });
        return;
      }
      const sent = json.sent ?? 0;
      const total = json.total ?? 0;
      if (sent === 0) {
        setTestStatus({ kind: 'error', msg: `0/${total} enviadas — revisa Cloudflare logs` });
      } else {
        setTestStatus({ kind: 'ok', msg: `${sent}/${total} enviada${sent !== 1 ? 's' : ''}` });
      }
    } catch (err) {
      setTestStatus({ kind: 'error', msg: (err as Error).message });
    }
  }, [userId]);

  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    topics,
    subscribe,
    unsubscribe,
    updateTopics,
    sendTestNotification,
    testStatus,
  };
}

// ─── Topic Configuration ──────────────────────────────────────────────────
const TOPIC_CONFIG: Record<NotificationTopic, { label: string; icon: string; description: string; priority: 'high' | 'normal' | 'low' }> = {
  itr_returned: {
    label: 'ITR Devuelto',
    icon: '↩️',
    description: 'Cuando un ITR que enviaste es devuelto para corrección',
    priority: 'high',
  },
  punch_assigned: {
    label: 'Punch Asignado',
    icon: '🔧',
    description: 'Cuando te asignan un nuevo punch item',
    priority: 'normal',
  },
  punch_cat_a: {
    label: 'Punch Cat A',
    icon: '🚨',
    description: 'Punches categoría A (bloquean completions)',
    priority: 'high',
  },
  cert_ready: {
    label: 'Certificado Listo',
    icon: '📄',
    description: 'Cuando un certificado está disponible para firma',
    priority: 'normal',
  },
  system_alerts: {
    label: 'Alertas del Sistema',
    icon: '⚙️',
    description: 'Mantenimiento, cambios importantes, actualizaciones',
    priority: 'low',
  },
  my_items_only: {
    label: 'Solo mis items',
    icon: '👤',
    description: 'Filtrar notificaciones solo para items asignados a mí',
    priority: 'normal',
  },
};

// ─── Componente Principal ──────────────────────────────────────────────────
export default function PushNotificationManager({ userId, onSubscriptionChange }: PushNotificationManagerProps) {
  const {
    isSupported, permission, isSubscribed, isLoading, error,
    topics, subscribe, unsubscribe, updateTopics, sendTestNotification, testStatus,
  } = usePushNotifications(userId);

  // Surface test-send status from the hook
  // (ya viene de usePushNotifications a través de testStatus en el hook)

  useEffect(() => {
    onSubscriptionChange?.(isSubscribed);
  }, [isSubscribed, onSubscriptionChange]);

  if (!isSupported) {
    return (
      <div style={{ padding: 16, background: 'var(--gray-800)', borderRadius: 'var(--radius-lg)', color: 'var(--gray-400)', fontSize: 'var(--text-sm)' }}>
        <span style={{ marginRight: 8 }}>🔔</span>
        Notificaciones push no disponibles en este dispositivo/navegador
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Status Card */}
      <div style={{
        padding: 16,
        borderRadius: 16,
        border: `1px solid ${isSubscribed ? 'var(--primary-700)' : 'var(--gray-700)'}`,
        background: isSubscribed ? 'rgba(30, 58, 138, 0.3)' : 'var(--gray-800)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40,
              borderRadius: 'var(--radius-lg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--text-lg)',
              background: isSubscribed ? 'var(--primary-800)' : 'var(--gray-700)',
            }}>
              {isSubscribed ? '🔔' : '🔕'}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#fff' }}>
                {isSubscribed ? 'Notificaciones Activas' : 'Notificaciones Inactivas'}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-200)' }}>
                {isSubscribed
                  ? `${topics.length} categorías activas`
                  : 'Active para recibir alertas de campo'}
              </div>
            </div>
          </div>

          <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isSubscribed}
              disabled={isLoading}
              onChange={() => isSubscribed ? unsubscribe() : subscribe()}
            />
            <div className="w-12 h-6 bg-[var(--gray-700)] rounded-full peer peer-checked:bg-[var(--primary-600)] peer-disabled:opacity-50 transition-colors
              after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all
              peer-checked:after:translate-x-6" />
          </label>
        </div>

        {error && (
          <div style={{ marginTop: 12, color: 'var(--danger-500)', fontSize: 'var(--text-sm)' }}>⚠️ {error}</div>
        )}

        {permission === 'denied' && (
          <div style={{ marginTop: 12, padding: 12, background: 'rgba(127, 29, 29, 0.3)', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)', color: 'var(--danger-500)' }}>
            🚫 Notificaciones bloqueadas en el navegador.
            Ve a Configuración del sitio y habilítalas.
          </div>
        )}
      </div>

      {/* Topic Selector */}
      {isSubscribed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--gray-200)' }}>Alertas configuradas</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {testStatus.kind === 'ok' && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success-500)' }}>✓ {testStatus.msg}</span>
              )}
              {testStatus.kind === 'error' && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger-500)' }}>✗ {testStatus.msg}</span>
              )}
              <button
                onClick={sendTestNotification}
                disabled={testStatus.kind === 'loading'}
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--primary-400)',
                  background: 'transparent',
                  border: 'none',
                  cursor: testStatus.kind === 'loading' ? 'not-allowed' : 'pointer',
                  opacity: testStatus.kind === 'loading' ? 0.5 : 1,
                  fontFamily: 'inherit',
                  transition: 'color 0.15s',
                }}
              >
                {testStatus.kind === 'loading' ? 'Enviando…' : 'Enviar prueba →'}
              </button>
            </div>
          </div>

          {(Object.entries(TOPIC_CONFIG) as [NotificationTopic, typeof TOPIC_CONFIG[NotificationTopic]][]).map(
            ([topic, config]) => (
              <div
                key={topic}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, background: 'var(--gray-800)', borderRadius: 'var(--radius-lg)' }}
              >
                <span style={{ fontSize: 'var(--text-lg)', marginTop: 2 }}>{config.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: '#fff' }}>{config.label}</span>
                    {config.priority === 'high' && (
                      <span style={{ fontSize: 'var(--text-xs)', background: 'rgba(127, 29, 29, 0.5)', color: 'var(--danger-500)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>ALTA</span>
                    )}
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-200)', marginTop: 4, margin: 0 }}>{config.description}</p>
                </div>
                <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', marginTop: 2 }}>
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={topics.includes(topic)}
                    onChange={() => {
                      const next = topics.includes(topic)
                        ? topics.filter((t) => t !== topic)
                        : [...topics, topic];
                      updateTopics(next);
                    }}
                  />
                  <div className="w-9 h-5 bg-[var(--gray-700)] rounded-full peer peer-checked:bg-[var(--primary-600)] transition-colors
                    after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all
                    peer-checked:after:translate-x-4" />
                </label>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
