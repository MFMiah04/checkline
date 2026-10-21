import { useLayoutEffect, useRef } from 'react'

// Holds game events back so they are handled one at a time, each only after the animations
// started by the one before have finished (busyUntilRef says when that is). Events not in
// `queued` pass straight through. flush() handles everything still waiting at once, for when
// the player wants to act now rather than watch.
export function useEventQueue(handlers, queued, busyUntilRef) {
  const handlersRef = useRef(handlers)
  const queueRef = useRef([])
  const timerRef = useRef(null)
  const pumpRef = useRef(null)

  useLayoutEffect(() => {
    handlersRef.current = handlers
  })

  useLayoutEffect(() => {
    // Handle the next event, give React a moment to render it and start its animations,
    // then wait for those animations before handling the one after
    pumpRef.current = function pump() {
      if (timerRef.current) return
      const item = queueRef.current.shift()
      if (!item) return
      handlersRef.current[item.event]?.(item.payload)
      const waitForAnimations = () => {
        const wait = busyUntilRef.current - Date.now()
        if (wait > 0) {
          timerRef.current = setTimeout(waitForAnimations, wait)
          return
        }
        timerRef.current = null
        pump()
      }
      timerRef.current = setTimeout(waitForAnimations, 30)
    }
    return () => clearTimeout(timerRef.current)
  }, [busyUntilRef])

  const wrapped = {}
  for (const event of Object.keys(handlers)) {
    wrapped[event] = queued.includes(event)
      ? payload => { queueRef.current.push({ event, payload }); pumpRef.current?.() }
      : payload => handlersRef.current[event]?.(payload)
  }

  function flush() {
    clearTimeout(timerRef.current)
    timerRef.current = null
    const items = queueRef.current.splice(0)
    for (const { event, payload } of items) handlersRef.current[event]?.(payload)
    return items.length
  }

  return { handlers: wrapped, flush }
}
