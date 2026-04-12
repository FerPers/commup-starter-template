'use client'

import { useTranslations } from 'next-intl'
import type { ProjectAlert, AlertSeverity } from '@/app/actions/alerts'

// ── Severity config ─────────────────────────────────────────────────────────

const SEVERITY_CFG: Record<AlertSeverity, {
  border: string; bg: string; icon: string; iconColor: string; textColor: string
}> = {
  critical: {
    border: '#fca5a5', bg: '#fef2f2',
    icon: '⛔', iconColor: '#dc2626', textColor: '#7f1d1d',
  },
  warning: {
    border: '#fcd34d', bg: '#fffbeb',
    icon: '⚠️', iconColor: '#d97706', textColor: '#78350f',
  },
  info: {
    border: '#93c5fd', bg: '#eff6ff',
    icon: 'ℹ', iconColor: '#2563eb', textColor: '#1e3a8a',
  },
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  alerts: ProjectAlert[]
}

export default function AlertsPanel({ alerts }: Props) {
  const t = useTranslations('Alerts')

  if (alerts.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
      {alerts.map((alert, i) => {
        const cfg = SEVERITY_CFG[alert.severity]
        return (
          <div
            key={`${alert.type}-${i}`}
            role="alert"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              padding: '12px 16px', borderRadius: '10px',
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
            }}
          >
            {/* Icon */}
            <span style={{ fontSize: '16px', lineHeight: 1.5, flexShrink: 0 }}>
              {cfg.icon}
            </span>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: cfg.textColor }}>
                {t(`${alert.type}.title`)}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: cfg.textColor, opacity: 0.8 }}>
                {t(`${alert.type}.desc`, { value: alert.value })}
              </p>
            </div>

            {/* Severity badge */}
            <span style={{
              padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
              background: `${cfg.border}60`, color: cfg.textColor,
              flexShrink: 0, alignSelf: 'center', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {t(`severity.${alert.severity}`)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
