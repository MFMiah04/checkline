import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { getSocket, useSocket } from '../hooks/useSocket'
import Board from '../components/Board'
import Hand from '../components/Hand'
import GameInfo from '../components/GameInfo'
import { isValidMove, isValidAttack, getAttackRange } from '../utils/clientRules'

const PLACEABLE = new Set(['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen'])
const INSTANT   = new Set(['Command', 'Disrupt'])

function emit(event, payload) {
  getSocket().emit(event, payload)
}

export default function Game() {
  const { code } = useParams()
  const [state, setState]             = useState(null)
  const [selectedCardIdx, setCard]    = useState(null)
  const [selectedPiece, setPiece]     = useState(null)
  const [cycleMode, setCycleMode]     = useState(false)
  const [discardMode, setDiscardMode] = useState(false)
  const [errorMsg, setErrorMsg]       = useState('')
  const [autoEnd, setAutoEnd]         = useState(null)   // { startedAt, ms } or null

  const side = parseInt(localStorage.getItem('checkline_side') ?? '0')

  // Send reconnect on mount to restore state after navigation or refresh
  useEffect(() => {
    const token = localStorage.getItem('checkline_token')
    if (token) emit('reconnect', { token, code })
  }, [code])

  useSocket({
    game_starting:         ({ state }) => { setState(state); clearAll(); setAutoEnd(null) },
    state_update:          ({ state: s }) => { setState(s); clearAll(); setErrorMsg(''); setAutoEnd(null) },
    auto_end_turn_pending: ({ ms }) => { setAutoEnd({ startedAt: Date.now(), ms }) },
    error: ({ message }) => {
      setErrorMsg(message)
      setTimeout(() => setErrorMsg(''), 3000)
    },
  })

  function clearAll() {
    setCard(null); setPiece(null); setCycleMode(false); setDiscardMode(false)
  }

  // ── Valid move / attack highlights ─────────────────────────────────
  const validMoves = useMemo(() => {
    if (!selectedPiece || !state) return null
    const { row, lane } = selectedPiece
    const piece = state.board[row]?.[lane]
    if (!piece || !piece.canActThisTurn) return null
    const s = new Set()
    for (let r = 0; r <= 3; r++)
      for (let l = 0; l <= 4; l++)
        if (isValidMove(state.board, piece, row, lane, r, l)) s.add(`${r},${l}`)
    return s
  }, [selectedPiece, state])

  const validAttacks = useMemo(() => {
    if (!selectedPiece || !state) return null
    const { row, lane } = selectedPiece
    const piece = state.board[row]?.[lane]
    if (!piece || !piece.canActThisTurn) return null
    const s = new Set()
    for (let r = 0; r <= 3; r++)
      for (let l = 0; l <= 4; l++)
        if (isValidAttack(state.board, piece, row, lane, r, l)) s.add(`${r},${l}`)
    return s
  }, [selectedPiece, state])

  const attackRange = useMemo(() => {
    if (!selectedPiece || !state) return null
    const { row, lane } = selectedPiece
    const piece = state.board[row]?.[lane]
    if (!piece || !piece.canActThisTurn || piece.type === 'King') return null
    return getAttackRange(state.board, piece, row, lane)
  }, [selectedPiece, state])

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

  if (state.phase === 'mulligan') return <Mulligan state={state} side={side} />

  const me       = state.players[side]
  const opponent = state.players[1 - side]
  const myHand   = Array.isArray(me.hand) ? me.hand : []
  const oppCount = opponent.hand?.count ?? 0
  const isMyTurn = state.currentTurn === side
  const inActions = state.turnPhase === 'actions'
  const inDiscard = state.turnPhase === 'discard'

  const selectedPieceType = selectedPiece
    ? state.board[selectedPiece.row]?.[selectedPiece.lane]?.type
    : null

  // ── Action handlers ────────────────────────────────────────────────

  function handleCardClick(i) {
    if (!isMyTurn || !inActions) return

    if (cycleMode) {
      emit('game_action', { type: 'cycle', cardIndex: i })
      clearAll()
      return
    }

    const card = myHand[i]

    if (INSTANT.has(card.type)) {
      const typeMap = { Command: 'play_command', Disrupt: 'play_disrupt' }
      emit('game_action', { type: typeMap[card.type], cardIndex: i })
      clearAll()
      return
    }

    if (PLACEABLE.has(card.type)) {
      setCard(selectedCardIdx === i ? null : i)
      setPiece(null)
      setCycleMode(false)
      return
    }
    // Buff / debuff / control — Phase 4+
  }

  function handleSpaceClick(row, lane) {
    if (!isMyTurn || !inActions) return

    if (cycleMode) { setCycleMode(false); return }

    const piece = state.board[row][lane]

    if (selectedCardIdx !== null) {
      if (!piece) emit('game_action', { type: 'place', cardIndex: selectedCardIdx, row, lane })
      clearAll()
      return
    }

    if (selectedPiece) {
      const { row: fr, lane: fl } = selectedPiece
      if (!piece) {
        emit('game_action', { type: 'direct_move', row: fr, lane: fl, toRow: row, toLane: lane })
        clearAll()
      } else if (piece.owner === side) {
        setPiece({ row, lane })
        emit('select_piece', { row, lane })
      } else {
        emit('game_action', { type: 'direct_attack', row: fr, lane: fl, targetRow: row, targetLane: lane })
        clearAll()
      }
      return
    }

    if (piece?.owner === side && piece.canActThisTurn) {
      setPiece({ row, lane })
      setCard(null)
      emit('select_piece', { row, lane })
    }
  }

  function handleSacrifice() {
    if (!selectedPiece) return
    emit('game_action', { type: 'direct_sacrifice', row: selectedPiece.row, lane: selectedPiece.lane })
    clearAll()
  }

  function handleEndTurn() {
    if (myHand.length > 5) setDiscardMode(true)
    else emit('game_action', { type: 'end_turn', discardIndices: [] })
  }

  function handleDiscardConfirm(indices) {
    emit('game_action', { type: 'end_turn', discardIndices: indices })
    setDiscardMode(false)
  }

  if (discardMode || inDiscard) {
    return (
      <div className="game">
        <DiscardOverlay
          hand={myHand}
          excess={myHand.length - 5}
          onConfirm={handleDiscardConfirm}
          onCancel={inDiscard ? null : () => setDiscardMode(false)}
        />
      </div>
    )
  }

  return (
    <div className="game">
      <GameInfo state={state} side={side} />
      {errorMsg && <div className="error-msg">{errorMsg}</div>}

      <div className="opponent-area">
        <div className="player-label">{opponent.name} — {oppCount} card{oppCount !== 1 ? 's' : ''}</div>
        <Hand cards={oppCount} faceDown />
      </div>

      <Board
        board={state.board}
        side={side}
        selectedPiece={selectedPiece}
        placingCard={selectedCardIdx !== null}
        validMoves={validMoves}
        validAttacks={validAttacks}
        attackRange={attackRange}
        onSpaceClick={isMyTurn && inActions ? handleSpaceClick : undefined}
      />

      <div className="my-area">
        <Hand
          cards={myHand}
          selectedIdx={selectedCardIdx}
          cycleMode={cycleMode}
          onCardClick={isMyTurn && inActions ? handleCardClick : undefined}
        />
        <div className="game-controls">
          {isMyTurn && inActions && (
            <button
              className={`btn-secondary${cycleMode ? ' btn-active' : ''}`}
              onClick={() => { setCycleMode(c => !c); setCard(null); setPiece(null) }}
            >
              Cycle Card
            </button>
          )}
          {selectedPiece && selectedPieceType !== 'King' && isMyTurn && inActions && (
            <button className="btn-secondary" onClick={handleSacrifice}>Sacrifice</button>
          )}
          {isMyTurn && inActions && (
            <button onClick={handleEndTurn}>End Turn</button>
          )}
          {!isMyTurn && (
            <span className="waiting-turn">Waiting for {opponent.name}…</span>
          )}
        </div>
        {autoEnd && (
          <div className="auto-end-wrap">
            <span className="auto-end-label">Turn ending…</span>
            <div className="auto-end-track">
              <div
                className="auto-end-bar"
                style={{ animationDuration: `${autoEnd.ms}ms` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Mulligan ───────────────────────────────────────────────────────────────────

function Mulligan({ state, side }) {
  const [selected, setSelected] = useState(new Set())
  const me       = state.players[side]
  const opponent = state.players[1 - side]
  const myHand   = Array.isArray(me.hand) ? me.hand : []

  function toggle(i) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
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
      <Hand cards={myHand} selectedSet={selected} onCardClick={toggle} />
      <button className="mulligan-confirm" onClick={() => emit('mulligan_done', { discardIndices: [...selected] })}>
        {selected.size === 0 ? 'Keep Hand' : `Replace ${selected.size} card${selected.size > 1 ? 's' : ''}`}
      </button>
    </div>
  )
}

// ── Discard overlay ────────────────────────────────────────────────────────────

function DiscardOverlay({ hand, excess, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(new Set())

  function toggle(i) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) {
        next.delete(i)
      } else if (next.size < excess) {
        // Only allow selecting up to exactly the required amount
        next.add(i)
      }
      return next
    })
  }

  const canConfirm = selected.size === excess

  return (
    <div className="discard-overlay">
      <h2>Discard</h2>
      <p className="mulligan-hint">
        Select {excess} card{excess > 1 ? 's' : ''} to discard (hand must end at 5).
      </p>
      <Hand cards={hand} selectedSet={selected} onCardClick={toggle} />
      <div className="discard-controls">
        {onCancel && <button className="btn-secondary" onClick={onCancel}>Cancel</button>}
        <button disabled={!canConfirm} onClick={() => canConfirm && onConfirm([...selected])}>
          Discard {selected.size} / {excess}
        </button>
      </div>
    </div>
  )
}
