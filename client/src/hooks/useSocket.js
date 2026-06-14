import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

let socket = null

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: false })
  }
  return socket
}

export function useSocket(handlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const s = getSocket()
    if (!s.connected) s.connect()

    const entries = Object.entries(handlersRef.current)
    for (const [event, fn] of entries) {
      s.on(event, (...args) => handlersRef.current[event]?.(...args))
    }

    return () => {
      for (const [event] of entries) {
        s.off(event)
      }
    }
  }, [])
}
