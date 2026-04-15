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
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BExample-VAPID-Public-Key-Replace-In-Production';

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
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // 4. Construir record
      const subJSON = subscription.toJSON();
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

      if (!response.ok) throw new Error('Error registrando subscription en servidor');

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

  const sendTestNotification = useCallback(async () => {
    await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
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
    topics, subscribe, unsubscribe, updateTopics, sendTestNotification,
  } = usePushNotifications(userId);

  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    onSubscriptionChange?.(isSubscribed);
  }, [isSubscribed, onSubscriptionChange]);

  if (!isSupported) {
    return (
      <div className="p-4 bg-slate-800 rounded-xl text-slate-400 text-sm">
        <span className="mr-2">🔔</span>
        Notificaciones push no disponibles en este dispositivo/navegador
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status Card */}
      <div className={`p-4 rounded-2xl border ${
        isSubscribed
          ? 'bg-sky-900/30 border-sky-700'
          : 'bg-slate-800 border-slate-700'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${
              isSubscribed ? 'bg-sky-800' : 'bg-slate-700'
            }`}>
              {isSubscribed ? '🔔' : '🔕'}
            </div>
            <div>
              <div className="font-semibold">
                {isSubscribed ? 'Notificaciones Activas' : 'Notificaciones Inactivas'}
              </div>
              <div className="text-sm text-slate-400">
                {isSubscribed
                  ? `${topics.length} categorías activas`
                  : 'Active para recibir alertas de campo'}
              </div>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isSubscribed}
              disabled={isLoading}
              onChange={() => isSubscribed ? unsubscribe() : subscribe()}
            />
            <div className="w-12 h-6 bg-slate-700 rounded-full peer peer-checked:bg-sky-600 peer-disabled:opacity-50 transition-colors
              after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all
              peer-checked:after:translate-x-6" />
          </label>
        </div>

        {error && (
          <div className="mt-3 text-red-400 text-sm">⚠️ {error}</div>
        )}

        {permission === 'denied' && (
          <div className="mt-3 p-3 bg-red-900/30 rounded-xl text-sm text-red-300">
            🚫 Notificaciones bloqueadas en el navegador.
            Ve a Configuración del sitio y habilítalas.
          </div>
        )}
      </div>

      {/* Topic Selector */}
      {isSubscribed && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-300">Alertas configuradas</span>
            <button
              onClick={sendTestNotification}
              className="text-xs text-sky-400 hover:text-sky-300 transition"
            >
              Enviar prueba →
            </button>
          </div>

          {(Object.entries(TOPIC_CONFIG) as [NotificationTopic, typeof TOPIC_CONFIG[NotificationTopic]][]).map(
            ([topic, config]) => (
              <div
                key={topic}
                className="flex items-start gap-3 p-3 bg-slate-800 rounded-xl"
              >
                <span className="text-xl mt-0.5">{config.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{config.label}</span>
                    {config.priority === 'high' && (
                      <span className="text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">ALTA</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{config.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer mt-0.5">
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
                  <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:bg-sky-600 transition-colors
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
