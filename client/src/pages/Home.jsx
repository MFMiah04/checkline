import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSocket } from '../hooks/useSocket'
import { useServerStatus } from '../hooks/useServerStatus'
import AvatarEditor from '../components/AvatarEditor'
import RulesModal from '../components/RulesModal'
import { DEFAULT_AVATAR } from '../components/avatarOptions'

export default function Home() {
  const [name, setName] = useState(() => localStorage.getItem('checkline_name') || '')
  const [avatar, setAvatar] = useState(() => {
    try { return JSON.parse(localStorage.getItem('checkline_avatar')) || DEFAULT_AVATAR }
    catch { return DEFAULT_AVATAR }
  })
  const [joinCode, setJoinCode] = useState('')
  const [mode, setMode] = useState(null) // 'host' | 'join'
  const [error, setError] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const navigate = useNavigate()
  const { status: serverStatus, retry: retryServer } = useServerStatus()
  const serverReady = serverStatus === 'ready'

  useEffect(() => {
    localStorage.setItem('checkline_avatar', JSON.stringify(avatar))
  }, [avatar])

  function handleHost() {
    if (!name.trim()) return setError('Enter a name first.')
    const socket = getSocket()
    if (!socket.connected) socket.connect()

    socket.once('room_created', ({ code, token }) => {
      localStorage.setItem('checkline_token', token)
      localStorage.setItem('checkline_name', name.trim())
      navigate(`/lobby/${code}`)
    })

    socket.once('error', ({ message }) => setError(message))
    socket.emit('create_room', { name: name.trim(), avatar })
  }

  function handleJoin() {
    if (!name.trim()) return setError('Enter a name first.')
    if (!joinCode.trim()) return setError('Enter a room code.')
    const socket = getSocket()
    if (!socket.connected) socket.connect()

    socket.once('room_joined', ({ code, token }) => {
      localStorage.setItem('checkline_token', token)
      localStorage.setItem('checkline_name', name.trim())
      navigate(`/lobby/${code}`)
    })

    socket.once('error', ({ message }) => setError(message))
    socket.emit('join_room', { name: name.trim(), code: joinCode.trim().toUpperCase(), avatar })
  }

  return (
    <div className="home">
      <h1>Checkline</h1>

      <AvatarEditor avatar={avatar} setAvatar={setAvatar} />

      <input
        type="text"
        placeholder="Your name"
        maxLength={20}
        value={name}
        onChange={e => { setName(e.target.value); setError('') }}
        onKeyDown={e => e.key === 'Enter' && mode === 'join' && serverReady && handleJoin()}
      />

      {error && <p className="error">{error}</p>}

      <div className="server-status" role="status" aria-live="polite">
        {serverStatus === 'waking' && (
          <p>
            <span className="server-status-spinner" aria-hidden="true" />
            Waking up the game server. This can take up to a minute because it runs on a free host.
          </p>
        )}
        {serverStatus === 'offline' && (
          <p className="error">
            Can't reach the game server.{' '}
            <button className="btn-rules-link" onClick={retryServer}>Try again</button>
          </p>
        )}
      </div>

      {mode === null && (
        <div className="home-buttons">
          <button onClick={() => setMode('host')}>Host Game</button>
          <button onClick={() => setMode('join')}>Join Game</button>
        </div>
      )}

      {mode === 'host' && (
        <div className="home-buttons">
          <button onClick={handleHost} disabled={!serverReady}>Create Room</button>
          <button onClick={() => setMode(null)}>Back</button>
        </div>
      )}

      {mode === 'join' && (
        <div className="home-buttons">
          <input
            type="text"
            placeholder="Room code (e.g. KRTQ)"
            maxLength={4}
            value={joinCode}
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError('') }}
            onKeyDown={e => e.key === 'Enter' && serverReady && handleJoin()}
          />
          <button onClick={handleJoin} disabled={!serverReady}>Join</button>
          <button onClick={() => setMode(null)}>Back</button>
        </div>
      )}

      <button className="btn-rules-link" onClick={() => setRulesOpen(true)}>Rules</button>

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
