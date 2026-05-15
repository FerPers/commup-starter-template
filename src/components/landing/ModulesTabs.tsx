'use client'

import { useState } from 'react'
import ItrMockup from './mockups/ItrMockup'
import PunchMockup from './mockups/PunchMockup'
import KpiMockup from './mockups/KpiMockup'
import CertMockup from './mockups/CertMockup'
import PreservationMockup from './mockups/PreservationMockup'

type TabKey = 'itrs' | 'punches' | 'certs' | 'kpis' | 'preservation'

interface Tab {
  key: TabKey
  label: string
  icon: string
  title: string
  bullets: string[]
}

interface Props {
  sectionTitle: string
  tabs: Tab[]
}

export default function ModulesTabs({ sectionTitle, tabs }: Props) {
  const [active, setActive] = useState<TabKey>('itrs')

  const activeTab = tabs.find(t => t.key === active)!

  const mockups: Record<TabKey, React.ReactNode> = {
    itrs: <ItrMockup />,
    punches: <PunchMockup />,
    certs: <CertMockup />,
    kpis: <KpiMockup />,
    preservation: <PreservationMockup />,
  }

  return (
    <section id="modules" style={{
      background: '#080810',
      padding: '100px 24px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#f1f5f9',
          textAlign: 'center', margin: '0 0 48px', letterSpacing: '-0.02em',
        }}>
          {sectionTitle}
        </h2>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12,
          padding: 6, marginBottom: 32, overflowX: 'auto',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              style={{
                flex: '1 1 auto', minWidth: 100,
                padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, transition: 'all 0.18s',
                background: active === tab.key ? 'rgba(124,58,237,0.25)' : 'transparent',
                color: active === tab.key ? '#a78bfa' : '#64748b',
                boxShadow: active === tab.key ? '0 0 0 1px rgba(124,58,237,0.4)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content: mockup + description */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32, alignItems: 'start',
        }} className="modules-grid">
          {/* Mockup panel */}
          <div style={{
            background: '#0d0d1a',
            border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: 14, padding: 20, overflow: 'hidden',
          }}>
            {/* Fake topbar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
              paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                background: 'rgba(124,58,237,0.2)', color: '#a78bfa',
                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              }}>
                {activeTab.icon} {activeTab.label}
              </div>
              <div style={{ flex: 1 }} />
              <div style={{
                width: 24, height: 24, borderRadius: 4,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#334155',
              }}>⊞</div>
              <div style={{
                width: 24, height: 24, borderRadius: 4,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#334155',
              }}>↓</div>
            </div>

            {mockups[active]}
          </div>

          {/* Description panel */}
          <div>
            <h3 style={{
              fontSize: 22, fontWeight: 700, color: '#e2e8f0',
              margin: '0 0 16px', lineHeight: 1.3,
            }}>
              {activeTab.title}
            </h3>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {activeTab.bullets.map((b, i) => (
                <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(124,58,237,0.2)', color: '#a78bfa',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
                  }}>
                    ✓
                  </span>
                  <span style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>{b}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div style={{ marginTop: 28 }}>
              <a
                href="mailto:contacto@commup.app?subject=Demo CommUp"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(124,58,237,0.15)',
                  border: '1px solid rgba(124,58,237,0.3)',
                  color: '#a78bfa', borderRadius: 8, padding: '9px 18px',
                  fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
              >
                Request demo →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
