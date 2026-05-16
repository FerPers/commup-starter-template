'use client'

import { useEffect, useState } from 'react'

const IMAGES = [
  '/images/hero-1.jpg',
  '/images/hero-2.jpg',
  '/images/hero-3.jpg',
  '/images/hero-4.jpg',
  '/images/hero-5.jpg',
]

const INTERVAL_MS = 7000
const FADE_MS = 1200

export default function HeroSlideshow() {
  const [current, setCurrent] = useState(0)
  const [prev, setPrev] = useState<number | null>(null)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true)
      setPrev(current)
      const next = (current + 1) % IMAGES.length
      setTimeout(() => {
        setCurrent(next)
        setFading(false)
        setPrev(null)
      }, FADE_MS)
    }, INTERVAL_MS)

    return () => clearInterval(timer)
  }, [current])

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    transition: `opacity ${FADE_MS}ms ease-in-out`,
  }

  return (
    <>
      {/* Previous image — fades out */}
      {prev !== null && (
        <div style={{
          ...baseStyle,
          backgroundImage: `url(${IMAGES[prev]})`,
          opacity: fading ? 0 : 1,
        }} />
      )}

      {/* Current image — fades in */}
      <div style={{
        ...baseStyle,
        backgroundImage: `url(${IMAGES[current]})`,
        opacity: fading ? 0 : 1,
      }} />

      {/* Dot indicators */}
      <div style={{
        position: 'absolute',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
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
              background: i === current ? '#a78bfa' : 'rgba(255,255,255,0.25)',
              transition: 'all 0.3s ease',
            }}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </>
  )
}
