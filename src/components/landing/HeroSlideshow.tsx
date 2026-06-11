'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

// Solo imágenes landscape reales (las retrato 784×1168 se estiraban y pesaban 1.3MB en JPEG)
const IMAGES = [
  '/images/hero-1.webp',
  '/images/hero-5.webp',
]

const INTERVAL_MS = 8000
const FADE_MS = 1200

export default function HeroSlideshow() {
  const t = useTranslations('Landing.hero')
  const [current, setCurrent] = useState(0)
  // WCAG 2.3.3: sin auto-rotación si el usuario prefiere menos movimiento,
  // salvo que pulse play explícitamente (userPaused null = sin elección)
  const prefersReduced = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  )
  const [userPaused, setUserPaused] = useState<boolean | null>(null)
  const paused = userPaused ?? prefersReduced

  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => setCurrent(c => (c + 1) % IMAGES.length), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [paused])

  return (
    <>
      {IMAGES.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          fetchPriority={i === 0 ? 'high' : 'low'}
          decoding="async"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: i === current ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease-in-out`,
          }}
        />
      ))}

      {/* Controles: dots + pausa (WCAG 2.2.2) */}
      <div style={{
        position: 'absolute',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 10,
      }}>
        {IMAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            style={{
              width: i === current ? 24 : 8,
              height: 8,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              background: i === current ? '#00B5A8' : 'rgba(255,255,255,0.25)',
              transition: 'all 0.3s ease',
            }}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
        <button
          onClick={() => setUserPaused(!paused)}
          aria-label={paused ? t('play') : t('pause')}
          style={{
            width: 22,
            height: 22,
            marginLeft: 4,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(0,0,0,0.25)',
            color: '#e2e8f0',
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {paused ? (
            <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1l7 4-7 4z" /></svg>
          ) : (
            <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1h2.4v8H2zM5.6 1H8v8H5.6z" /></svg>
          )}
        </button>
      </div>
    </>
  )
}
