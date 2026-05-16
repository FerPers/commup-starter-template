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
  iconSrc: string
  title: string
  bullets: string[]
}

interface Props {
  sectionTitle: string
  sectionSubtitle?: string
  tabs: Tab[]
}

export default function ModulesTabs({ sectionTitle, sectionSubtitle, tabs }: Props) {
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
      background: '#FFFFFF',
      padding: '100px 24px',
      borderTop: '1px solid #E9EDF1',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Section label */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,181,168,0.10)', color: '#00B5A8',
            border: '1px solid rgba(0,181,168,0.25)',
            borderRadius: 20, padding: '5px 14px',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            MÓDULOS
          </div>
        </div>

        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#0B1D3A',
          textAlign: 'center', margin: '0 0 12px', letterSpacing: '-0.02em',
        }}>
          {sectionTitle}
        </h2>
        {sectionSubtitle && (
          <p style={{
            fontSize: 15, color: '#64707C', textAlign: 'center',
            margin: '0 0 48px', lineHeight: 1.6,
          }}>
            {sectionSubtitle}
          </p>
        )}

        {/* Tab bar — text only, no icons */}
        <div style={{
          display: 'flex', gap: 4, background: '#F1F5F9',
          border: '1px solid #E9EDF1', borderRadius: 12,
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
                background: active === tab.key ? 'rgba(0,181,168,0.12)' : 'transparent',
                color: active === tab.key ? '#00B5A8' : '#64707C',
                boxShadow: active === tab.key ? '0 0 0 1px rgba(0,181,168,0.4)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content: mockup + description */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32, alignItems: 'start',
        }} className="modules-grid">
          {/* Mockup panel — dark navy for app preview contrast */}
          <div style={{
            background: '#0B1D3A',
            border: '1px solid rgba(0,181,168,0.25)',
            borderRadius: 14, padding: 20, overflow: 'hidden',
          }}>
            {/* Fake topbar with small icon at 20px */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
              paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                background: 'rgba(0,181,168,0.15)', color: '#00B5A8',
                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activeTab.iconSrc} width={20} height={20} alt="" style={{ display: 'block' }} />
                {activeTab.label}
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

          {/* Description panel with large module icon header */}
          <div>
            {/* Module header: big icon + title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 80, height: 80, borderRadius: 18,
                background: 'rgba(0,181,168,0.08)',
                border: '1px solid rgba(0,181,168,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activeTab.iconSrc} width={52} height={52} alt="" style={{ display: 'block' }} />
              </div>
              <h3 style={{
                fontSize: 20, fontWeight: 700, color: '#0B1D3A',
                margin: 0, lineHeight: 1.3,
              }}>
                {activeTab.title}
              </h3>
            </div>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {activeTab.bullets.map((b, i) => (
                <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(0,181,168,0.12)', color: '#00B5A8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
                  }}>
                    ✓
                  </span>
                  <span style={{ fontSize: 14, color: '#64707C', lineHeight: 1.6 }}>{b}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div style={{ marginTop: 28 }}>
              <a
                href="mailto:contacto@commup.app?subject=Demo CommUp"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(0,181,168,0.1)',
                  border: '1px solid rgba(0,181,168,0.3)',
                  color: '#00B5A8', borderRadius: 8, padding: '9px 18px',
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
