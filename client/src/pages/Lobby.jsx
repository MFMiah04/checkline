import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSocket, useSocket } from '../hooks/useSocket'

export default function Lobby() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [isHost, setIsHost] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const socket = getSocket()
    const name = localStorage.getItem('checkline_name') || 'Player'

    // Determine if we're host or guest based on whether we just created the room
    // The server will have emitted room_created or room_joined before navigating here
    // We recover state by checking if we're already connected and in a room
    const token = localStorage.getItem('checkline_token')
    if (token) {
      socket.emit('reconnect', { token, code })
    }
  }, [code])

  useSocket({
    room_created({ code: roomCode }) {
      setIsHost(true)
      setPlayers([{ name: localStorage.getItem('checkline_name') || 'Host', side: 0 }])
    },
    room_joined({ code: roomCode, hostName }) {
      setIsHost(false)
      setPlayers([
        { name: hostName, side: 0 },
        { name: localStorage.getItem('checkline_name') || 'Guest', side: 1 }
      ])
    },
    opponent_joined({ name }) {
      setIsHost(true)
      setPlayers(prev => {
        const host = prev[0] || { name: localStorage.getItem('checkline_name') || 'Host', side: 0 }
        return [host, { name, side: 1 }]
      })
    },
    opponent_disconnected() {
      setPlayers(prev => prev.slice(0, 1))
    },
    room_closed() {
      navigate('/')
    },
    game_starting() {
      navigate(`/game/${code}`)
    },
    error({ message }) {
      setError(message)
    },
    // On reconnect the server re-emits state; handle lobby state restoration
    state_update({ state }) {
      if (state.phase === 'playing' || state.phase === 'mulligan') {
        navigate(`/game/${code}`)
      }
    }
  })

  function handleStart() {
    getSocket().emit('start_game')
  }

  return (
    <div className="lobby">
      <h1>Checkline</h1>
      <div className="room-code">
        Room code: <strong>{code}</strong>
      </div>

      <div className="players">
        {players.map((p, i) => (
          <div key={i} className="player-slot">
            {p.name} {i === 0 ? '(Host)' : '(Guest)'}
          </div>
        ))}
        {players.length < 2 && (
          <div className="player-slot waiting">Waiting for opponent…</div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {isHost ? (
        <button
          onClick={handleStart}
          disabled={players.length < 2}
        >
          Start Game
        </button>
      ) : (
        <p>Waiting for host to start…</p>
      )}
    </div>
  )
}
