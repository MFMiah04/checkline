import { useEffect, useLayoutEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Game from './Game'
import { setLocalHost } from '../hooks/useSocket'
import { LocalGameHost } from '../solo/LocalGameHost'
import { DEFAULT_AVATAR } from '../components/avatarOptions'

function savedAvatar() {
  try { return JSON.parse(localStorage.getItem('checkline_avatar')) || DEFAULT_AVATAR }
  catch { return DEFAULT_AVATAR }
}

// A game against the computer. Runs entirely in the browser: no server needed.
export default function SoloGame() {
  const [params] = useSearchParams()
  const difficulty = params.get('difficulty') === 'easy' ? 'easy' : 'normal'
  const [host] = useState(() => new LocalGameHost({
    playerName: localStorage.getItem('checkline_name') || 'You',
    playerAvatar: savedAvatar(),
    difficulty,
  }))

  // Layout effects run before the game screen subscribes to events, so it talks to this host
  useLayoutEffect(() => {
    setLocalHost(host)
    return () => setLocalHost(null)
  }, [host])

  useEffect(() => {
    host.start()
    return () => host.stop()
  }, [host])

  return <Game solo />
}
