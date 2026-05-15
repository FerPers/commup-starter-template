'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Download, CheckCircle2, X, Share, PlusSquare } from 'lucide-react'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { Modal } from '@/components/ui/Modal'

interface InstallPwaCardProps {
  variant?: 'full' | 'banner'
}

const cardStyle: CSSProperties = {
  padding: '14px 16px',
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
}

const iconBoxStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 'var(--radius-md)',
  background: 'var(--brand-50, rgba(124,58,237,0.12))',
  color: 'var(--brand-600, #7c3aed)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const primaryButtonStyle: CSSProperties = {
  padding: '8px 14px',
  background: 'var(--brand-600, #7c3aed)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
}

const dismissButtonStyle: CSSProperties = {
  padding: '6px',
  background: 'transparent',
  color: 'var(--text-muted)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}

export default function InstallPwaCard({ variant = 'full' }: InstallPwaCardProps) {
  const t = useTranslations('Pwa.install')
  const {
    canPrompt,
    showIosInstructions,
    isInstalled,
    prompt,
    dismiss,
  } = useInstallPrompt()
  const [iosModalOpen, setIosModalOpen] = useState(false)

  if (isInstalled) {
    if (variant === 'banner') return null
    return (
      <div
        style={{
          padding: '12px 14px',
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <CheckCircle2 size={18} aria-hidden="true" style={{ color: 'var(--success-500)' }} />
        {t('installed')}
      </div>
    )
  }

  if (canPrompt) {
    const handleInstall = async () => {
      await prompt()
    }
    return (
      <CardShell
        icon={<Download size={18} aria-hidden="true" />}
        title={t('chromeTitle')}
        subtitle={t('chromeSubtitle')}
        dismissLabel={t('dismiss')}
        cta={
          <button type="button" onClick={handleInstall} style={primaryButtonStyle}>
            {t('chromeCta')}
          </button>
        }
        onDismiss={dismiss}
      />
    )
  }

  if (showIosInstructions) {
    return (
      <>
        <CardShell
          icon={<Share size={18} aria-hidden="true" />}
          title={t('iosTitle')}
          subtitle={t('iosSubtitle')}
          dismissLabel={t('dismiss')}
          cta={
            <button
              type="button"
              onClick={() => setIosModalOpen(true)}
              style={primaryButtonStyle}
            >
              {t('iosCta')}
            </button>
          }
          onDismiss={dismiss}
        />
        <Modal
          open={iosModalOpen}
          onClose={() => setIosModalOpen(false)}
          title={t('iosModalTitle')}
          description={t('iosModalDescription')}
          size="sm"
        >
          <ol
            style={{
              margin: 0,
              paddingLeft: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <IosStep
              number={1}
              icon={<Share size={18} aria-hidden="true" />}
              text={t('iosStep1')}
            />
            <IosStep
              number={2}
              icon={<PlusSquare size={18} aria-hidden="true" />}
              text={t('iosStep2')}
            />
            <IosStep
              number={3}
              text={t('iosStep3')}
            />
          </ol>
          <p
            style={{
              marginTop: 16,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            {t('iosNote')}
          </p>
        </Modal>
      </>
    )
  }

  return null
}

interface CardShellProps {
  icon: ReactNode
  title: string
  subtitle: string
  dismissLabel: string
  cta: ReactNode
  onDismiss: () => void
}

function CardShell({ icon, title, subtitle, dismissLabel, cta, onDismiss }: CardShellProps) {
  return (
    <div style={cardStyle}>
      <div style={iconBoxStyle}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>
          {title}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
          {subtitle}
        </div>
      </div>
      {cta}
      <button type="button" onClick={onDismiss} aria-label={dismissLabel} style={dismissButtonStyle}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

interface IosStepProps {
  number: number
  icon?: ReactNode
  text: string
}

function IosStep({ number, icon, text }: IosStepProps) {
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--brand-50, rgba(124,58,237,0.12))',
          color: 'var(--brand-600, #7c3aed)',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {number}
      </span>
      <div style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-strong)', lineHeight: 1.5 }}>
        {icon && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 8px',
              marginRight: 6,
              background: 'var(--surface-2, rgba(0,0,0,0.04))',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              verticalAlign: 'middle',
            }}
          >
            {icon}
          </span>
        )}
        {text}
      </div>
    </li>
  )
}
