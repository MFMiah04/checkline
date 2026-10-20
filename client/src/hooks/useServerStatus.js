import { useCallback, useEffect, useState } from 'react'
import { SERVER_URL } from './useSocket'

// The server runs on a free host that sleeps when idle and takes up to a minute
// to wake. Calling /health as soon as the page opens starts the wake-up early.
const SHOW_WAKING_AFTER_MS = 1500  // a warm server answers well before this
const GIVE_UP_AFTER_MS     = 90000
const REQUEST_TIMEOUT_MS   = 30000
const RETRY_DELAY_MS       = 2000

async function isHealthy(signal) {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal, cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

// Returns { status, retry } where status is 'checking' | 'waking' | 'ready' | 'offline'
export function useServerStatus() {
  const [status, setStatus] = useState('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const started = Date.now()
    const wakingTimer = setTimeout(() => { if (!cancelled) setStatus('waking') }, SHOW_WAKING_AFTER_MS)

    async function poll() {
      while (!cancelled && Date.now() - started < GIVE_UP_AFTER_MS) {
        const healthy = await isHealthy(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
        if (cancelled) return
        if (healthy) {
          clearTimeout(wakingTimer)
          setStatus('ready')
          return
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      }
      if (!cancelled) {
        clearTimeout(wakingTimer)
        setStatus('offline')
      }
    }
    poll()

    return () => {
      cancelled = true
      clearTimeout(wakingTimer)
    }
  }, [attempt])

  const retry = useCallback(() => {
    setStatus('waking')
    setAttempt(a => a + 1)
  }, [])

  return { status, retry }
}
