import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getSocket, useSocket } from '../hooks/useSocket'
import Board from '../components/Board'
import Hand from '../components/Hand'
import GameInfo from '../components/GameInfo'

export default function Game() {
  const { code } = useParams()
  const [state, setState] = useState(null)
  const side = parseInt(localStorage.getItem('checkline_side') ?? '0')

  useEffect(() => {
    const token = localStorage.getItem('checkline_token')
    if (token) getSocket().emit('reconnect', { token, code })
  }, [code])

  useSocket({
    game_starting: ({ state }) => setState(state),
    state_update: ({ state }) => setState(state),
  })

  if (!state) return <div className="game-loading">Connecting…</div>

  if (state.winner !== null) {
    const iWon = state.winner === side
    return (
      <div className="game-over">
        <h1>{iWon ? 'You win!' : 'You lose.'}</h1>
        <p>{state.players[state.winner].name} wins by checkmate.</p>
      </div>
    )
  }

  if (state.phase === 'mulligan') {
    return <Mulligan state={state} side={side} />
  }

  const me = state.players[side]
  const opponent = state.players[1 - side]
  const myHand = Array.isArray(me.hand) ? me.hand : []
  const opponentHandCount = opponent.hand?.count ?? 0

  return (
    <div className="game">
      <GameInfo state={state} side={side} />

      <div className="opponent-label">
        {opponent.name} — {opponentHandCount} card{opponentHandCount !== 1 ? 's' : ''}
      </div>
      <Hand cards={opponentHandCount} faceDown />

      <Board board={state.board} side={side} />

      <Hand cards={myHand} />
    </div>
  )
}

function Mulligan({ state, side }) {
  const [selected, setSelected] = useState(new Set())
  const me = state.players[side]
  const opponent = state.players[1 - side]
  const myHand = Array.isArray(me.hand) ? me.hand : []

  function toggleCard(i) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  function confirm() {
    getSocket().emit('mulligan_done', { discardIndices: [...selected] })
  }

  if (me.mulliganDone) {
    return (
      <div className="mulligan">
        <h1>Checkline</h1>
        <p className="mulligan-waiting">Waiting for {opponent.name}…</p>
      </div>
    )
  }

  return (
    <div className="mulligan">
      <h1>Checkline</h1>
      <h2>Mulligan</h2>
      <p className="mulligan-hint">Click cards to select them for replacement, then confirm.</p>
      <Hand cards={myHand} selected={selected} onCardClick={toggleCard} />
      <button className="mulligan-confirm" onClick={confirm}>
        {selected.size === 0
          ? 'Keep Hand'
          : `Replace ${selected.size} card${selected.size > 1 ? 's' : ''}`}
      </button>
    </div>
  )
}
