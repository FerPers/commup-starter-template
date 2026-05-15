'use client'

import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'commup.pwa.installPromptDismissedAt'
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000

function readDismissedAt(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(DISMISS_KEY)
  if (!raw) return null
  const ts = Number(raw)
  return Number.isFinite(ts) ? ts : null
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function readInitialDismissed(): boolean {
  if (typeof window === 'undefined') return false
  const dismissedAt = readDismissedAt()
  return dismissedAt !== null && Date.now() - dismissedAt < DISMISS_TTL_MS
}

function detectIosSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  // iPadOS 13+ reports as Macintosh; disambiguate with touch points.
  const isIpad = /Macintosh/.test(ua) && (window.navigator.maxTouchPoints ?? 0) > 1
  const isIosDevice = /iPad|iPhone|iPod/.test(ua) || isIpad
  if (!isIosDevice) return false
  // Other iOS browsers wrap WebKit but advertise their own token.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua)
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isStandaloneDisplay())
  const [isDismissed, setIsDismissed] = useState<boolean>(() => readInitialDismissed())
  const [isIosSafari] = useState<boolean>(() => detectIosSafari())

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setIsInstalled(true)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const prompt = useCallback(async () => {
    if (!deferred) return null
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    return choice.outcome
  }, [deferred])

  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setIsDismissed(true)
  }, [])

  const reset = useCallback(() => {
    window.localStorage.removeItem(DISMISS_KEY)
    setIsDismissed(false)
  }, [])

  const canPrompt = deferred !== null && !isInstalled && !isDismissed
  const showIosInstructions = isIosSafari && !isInstalled && !isDismissed && !canPrompt

  return {
    canPrompt,
    showIosInstructions,
    isInstalled,
    isIosSafari,
    isDismissed,
    hasDeferredPrompt: deferred !== null,
    prompt,
    dismiss,
    reset,
  }
}
