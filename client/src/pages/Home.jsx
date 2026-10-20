import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSocket } from '../hooks/useSocket'
import { useServerStatus } from '../hooks/useServerStatus'
import Avatar from '../components/Avatar'
import AvatarEditor from '../components/AvatarEditor'
import RulesModal from '../components/RulesModal'
import { DEFAULT_AVATAR } from '../components/avatarOptions'
import logoUrl from '../assets/art/logo.svg'

const HOW_TO_PLAY = [
  ['Draw a card, take two actions', 'Each turn you draw one card, then take two actions. Command and Disrupt are free.'],
  ['Place and move pieces on your side', 'Piece cards go onto your two rows. Pieces move like chess pieces, but only on your side.'],
  ['Attack across the whole board', 'Attacks reach anywhere. Use Buffs, Debuffs and reactions to protect your pieces and hinder theirs.'],
  ['Checkmate to win', "If a player's King is still in check when their turn ends, they lose."],
]

export default function Home() {
  const [name, setName] = useState(() => localStorage.getItem('checkline_name') || '')
  const [avatar, setAvatar] = useState(() => {
    try { return JSON.parse(localStorage.getItem('checkline_avatar')) || DEFAULT_AVATAR }
    catch { return DEFAULT_AVATAR }
  })
  const [difficulty, setDifficulty] = useState('normal')
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [error, setError] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const navigate = useNavigate()
  const { status: serverStatus, retry: retryServer } = useServerStatus()
  const serverReady = serverStatus === 'ready'

  useEffect(() => {
    localStorage.setItem('checkline_avatar', JSON.stringify(avatar))
  }, [avatar])

  function handleSolo() {
    if (name.trim()) localStorage.setItem('checkline_name', name.trim())
    navigate(`/solo?difficulty=${difficulty}`)
  }

  function handleHost() {
    if (!name.trim()) return setError('Enter your name to play online.')
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

  function handleJoin(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Enter your name to play online.')
    if (!joinCode.trim()) return setError('Enter the 4-letter room code.')
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
    <main className="home">
      <section className="home-intro">
        <div className="home-brand">
          <img src={logoUrl} alt="" className="home-logo" />
          <h1>Checkline</h1>
        </div>
        <p className="home-tagline">
          A chess-inspired card game for two. Draw pieces, play them onto the board, and checkmate your opponent's King.
        </p>

        <div className="home-panel">
          <div className="home-player">
            <button
              type="button"
              className="home-avatar-btn"
              onClick={() => setEditingAvatar(v => !v)}
              aria-expanded={editingAvatar}
              aria-label="Edit your avatar"
            >
              <Avatar avatar={avatar} size={48} />
            </button>
            <div className="home-name">
              <label htmlFor="player-name">Your name</label>
              <input
                id="player-name"
                type="text"
                maxLength={20}
                value={name}
                autoComplete="nickname"
                onChange={e => { setName(e.target.value); setError('') }}
              />
            </div>
          </div>
          {editingAvatar && <AvatarEditor avatar={avatar} setAvatar={setAvatar} />}

          <button className="home-play" onClick={handleSolo}>Play vs Computer</button>
          <div className="segmented" role="radiogroup" aria-label="Computer difficulty">
            {['normal', 'easy'].map(level => (
              <label key={level} className={difficulty === level ? 'is-checked' : ''}>
                <input
                  type="radio"
                  name="difficulty"
                  value={level}
                  checked={difficulty === level}
                  onChange={() => setDifficulty(level)}
                />
                {level === 'normal' ? 'Normal' : 'Easy'}
              </label>
            ))}
          </div>

          <div className="home-divider"><span>or play a friend online</span></div>

          <div className="home-online">
            <button className="btn-secondary" onClick={handleHost} disabled={!serverReady}>Host a game</button>
            <button className="btn-secondary" onClick={() => setJoinOpen(v => !v)} aria-expanded={joinOpen}>Join with code</button>
          </div>
          {joinOpen && (
            <form className="home-join" onSubmit={handleJoin}>
              <label htmlFor="room-code" className="visually-hidden">Room code</label>
              <input
                id="room-code"
                type="text"
                placeholder="Room code, e.g. KRTQ"
                maxLength={4}
                value={joinCode}
                autoComplete="off"
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError('') }}
              />
              <button type="submit" disabled={!serverReady}>Join</button>
            </form>
          )}

          {error && <p className="error" role="alert">{error}</p>}
          <div className="server-status" role="status" aria-live="polite">
            {serverStatus === 'waking' && (
              <p>
                <span className="server-status-spinner" aria-hidden="true" />
                Waking the online server. This can take up to a minute because it runs on a free host.
              </p>
            )}
            {serverStatus === 'offline' && (
              <p>
                Can't reach the online server.{' '}
                <button className="btn-link" onClick={retryServer}>Try again</button>
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="home-how" aria-labelledby="how-title">
        <div className="table-frame">
          <div className="table-felt home-how-felt">
            <h2 id="how-title">How to play</h2>
            <ol className="home-steps">
              {HOW_TO_PLAY.map(([title, text], i) => (
                <li key={title}>
                  <span className="home-step-num" aria-hidden="true">{i + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <button className="btn-link home-rules-link" onClick={() => setRulesOpen(true)}>Read the full rules</button>
          </div>
        </div>
      </section>

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </main>
  )
}
