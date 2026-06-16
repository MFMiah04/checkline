import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSocket, useSocket } from '../hooks/useSocket'
import Board from '../components/Board'
import Hand from '../components/Hand'
import GameInfo from '../components/GameInfo'
import { isValidMove, isValidAttack, getAttackRange, isPinned, isFatigued } from '../utils/clientRules'

const PLACEABLE   = new Set(['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen'])
const INSTANT     = new Set(['Command', 'Disrupt'])
const BUFF_TYPES  = new Set(['Enslave', 'Shield', 'Bodyguard', 'Protection'])
const DEBUFF_TYPES = new Set(['Pin', 'Fatigue', 'Silence'])
const CONTROL_CARD_TYPES = new Set(['Reposition', 'Swap', 'Dispel', 'Return'])

function emit(event, payload) {
  getSocket().emit(event, payload)
}

export default function Game() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [state, setState]             = useState(null)
  const [selectedCardIdx, setCard]    = useState(null)
  const [selectedPiece, setPiece]     = useState(null)
  const [cycleMode, setCycleMode]     = useState(false)
  const [discardMode, setDiscardMode] = useState(false)
  const [errorMsg, setErrorMsg]       = useState('')
  const [autoEnd, setAutoEnd]         = useState(null)
  const [targetMode, setTargetMode]   = useState(null)
  // targetMode: null | { type: 'buff'|'debuff'|'reposition'|'swap'|'dispel'|'return', cardIdx, step: 1|2, firstPiece: {row,lane}|null }
  const [enslaveMode, setEnslaveMode] = useState(null)
  // enslaveMode: null | { validSpaces: [{row, lane}], pieceType: string }
  const [bodyguardMode, setBodyguardMode] = useState(null)
  // bodyguardMode: null | { options, isKingAttack, targetType, targetRow, targetLane }
  const [reactionWindowMode, setReactionWindowMode] = useState(null)
  // null | { action, ms, startedAt: number } — set when this player can react to opponent's action
  const [reversalTargetMode, setReversalTargetMode] = useState(null)
  // null | { cardIdx: number } — picking a Reversal redirect target on the board
  const [myPendingAction, setMyPendingAction] = useState(null)
  // null | enriched action object — what this player just emitted, for preview while window is open
  const [autoPassEnabled, setAutoPassEnabled] = useState(
    () => localStorage.getItem('checkline_autopass') === 'true'
  )
  const [forfeitConfirm, setForfeitConfirm] = useState(false)

  const side = parseInt(localStorage.getItem('checkline_side') ?? '0')

  useEffect(() => {
    const token = localStorage.getItem('checkline_token')
    if (token) emit('reconnect', { token, code })
  }, [code])

  useSocket({
    game_starting:         ({ state }) => { setState(state); clearAll(); setAutoEnd(null) },
    state_update: ({ state: s, lastAction }) => {
      setState(s)
      clearAll()
      setAutoEnd(null)
      if (!s.reactionWindowOpen) { setReactionWindowMode(null); setReversalTargetMode(null); setMyPendingAction(null) }
      if (lastAction?.reactionFired === 'intercept' && lastAction?.actorSide === side) {
        const p = lastAction.payload
        let msg = 'Your action was intercepted — you cannot repeat it this turn.'
        if (p.type === 'direct_attack' || p.type === 'direct_move' || p.type === 'direct_sacrifice') {
          const pieceName = s.board[p.row]?.[p.lane]?.type ?? 'piece'
          const verb = p.type === 'direct_attack' ? 'attack' : p.type === 'direct_move' ? 'move' : 'sacrifice'
          msg = `Your ${pieceName}'s ${verb} was intercepted — it cannot act again this turn.`
        } else if (Number.isInteger(p.cardIndex)) {
          const hand = s.players[side]?.hand
          const cardName = Array.isArray(hand) ? hand[p.cardIndex]?.type : null
          msg = cardName
            ? `Your ${cardName} was intercepted — you cannot play it again this turn.`
            : 'Your card was intercepted — you cannot play it again this turn.'
        }
        setErrorMsg(msg)
      } else {
        setErrorMsg('')
      }
    },
    auto_end_turn_pending: ({ ms }) => {
      if (autoPassEnabled && state?.currentTurn === side && myHand.length <= 5) {
        emit('game_action', { type: 'end_turn', discardIndices: [] })
        return
      }
      setAutoEnd({ startedAt: Date.now(), ms })
    },
    enslave_prompt:        ({ validSpaces, pieceType }) => setEnslaveMode({ validSpaces, pieceType }),
    bodyguard_prompt:      ({ options, isKingAttack, targetType, targetRow, targetLane }) =>
                             setBodyguardMode({ options, isKingAttack, targetType, targetRow, targetLane }),
    reaction_window: ({ action, actorSide, ms }) => {
      const isBuffDebuff = action.type === 'play_buff' || action.type === 'play_debuff'
      const hasApplicable = myHand.some(c =>
        c.type === 'Intercept' || (c.type === 'Reversal' && isBuffDebuff)
      )
      if (autoPassEnabled && !hasApplicable) {
        emit('pass_reaction')
        return
      }
      setReactionWindowMode({ action, actorSide, ms, startedAt: Date.now() })
      setAutoEnd(null)
    },
    error: ({ message }) => {
      setErrorMsg(message)
      setMyPendingAction(null)
      setTimeout(() => setErrorMsg(''), 3000)
    },
  })

  function clearAll() {
    setCard(null); setPiece(null); setCycleMode(false); setDiscardMode(false); setTargetMode(null); setEnslaveMode(null); setBodyguardMode(null); setForfeitConfirm(false)
  }

  function toggleAutoPass() {
    setAutoPassEnabled(prev => {
      const next = !prev
      localStorage.setItem('checkline_autopass', String(next))
      return next
    })
  }

  function emitAction(payload, enriched = {}) {
    emit('game_action', payload)
    setMyPendingAction({ ...payload, ...enriched, actorSide: side })
  }

  // ── Highlights ─────────────────────────────────────────────────────
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

  const cardTargets = useMemo(() => {
    if (!targetMode || !state) return null
    const { type, step, firstPiece } = targetMode
    const ownRows = side === 0 ? [0, 1] : [2, 3]
    const s = new Set()

    for (let r = 0; r <= 3; r++) {
      for (let l = 0; l <= 4; l++) {
        const p = state.board[r][l]
        if (type === 'buff') {
          if (p && p.owner === side && p.type !== 'King' && !p.buff && p.debuff?.type !== 'Silence')
            s.add(`${r},${l}`)
        } else if (type === 'debuff') {
          if (p && p.owner !== side && p.type !== 'King' && !p.debuff && p.buff?.type !== 'Protection')
            s.add(`${r},${l}`)
        } else if (type === 'return') {
          if (p && p.owner === side && p.type !== 'King') s.add(`${r},${l}`)
        } else if (type === 'dispel') {
          if (p && (p.buff || p.debuff)) s.add(`${r},${l}`)
        } else if (type === 'reposition') {
          if (step === 1) {
            if (p && p.owner === side && p.debuff?.type !== 'Pin') s.add(`${r},${l}`)
          } else if (step === 2) {
            if (!p && ownRows.includes(r)) s.add(`${r},${l}`)
          }
        } else if (type === 'swap') {
          if (step === 1) {
            if (p && p.owner === side && p.debuff?.type !== 'Pin') s.add(`${r},${l}`)
          } else if (step === 2) {
            if (p && p.owner === side && p.debuff?.type !== 'Pin' &&
                !(r === firstPiece?.row && l === firstPiece?.lane))
              s.add(`${r},${l}`)
          }
        }
      }
    }
    return s
  }, [targetMode, state, side])

  const enslaveTargets = useMemo(() => {
    if (!enslaveMode) return null
    const s = new Set()
    enslaveMode.validSpaces.forEach(({ row, lane }) => s.add(`${row},${lane}`))
    return s
  }, [enslaveMode])

  const bodyguardTargets = useMemo(() => {
    if (!bodyguardMode) return null
    const s = new Set()
    bodyguardMode.options.forEach(({ row, lane }) => s.add(`${row},${lane}`))
    return s
  }, [bodyguardMode])

  const reversalTargets = useMemo(() => {
    if (!reversalTargetMode || !state || !reactionWindowMode) return null
    const { action } = reactionWindowMode
    const s = new Set()
    for (let r = 0; r <= 3; r++) {
      for (let l = 0; l <= 4; l++) {
        const p = state.board[r][l]
        if (action.type === 'play_buff') {
          if (p && p.type !== 'King' && !p.buff && p.debuff?.type !== 'Silence') s.add(`${r},${l}`)
        } else if (action.type === 'play_debuff') {
          if (p && p.type !== 'King' && !p.debuff && p.buff?.type !== 'Protection') s.add(`${r},${l}`)
        }
      }
    }
    return s
  }, [reversalTargetMode, state, reactionWindowMode])

  const previewBoard = useMemo(() => {
    if (!state) return null
    // Active player: show their own pending action immediately after emitting (before server confirms)
    const isMine = myPendingAction && state.currentTurn === side
    const action = isMine ? myPendingAction : (reactionWindowMode?.action ?? null)
    if (!action) return null
    const actorS = isMine ? side : (reactionWindowMode?.actorSide ?? (1 - side))
    return computePreviewBoard(state.board, action, actorS)
  }, [reactionWindowMode, myPendingAction, state, side])

  if (!state) return <div className="game-loading">Connecting…</div>

  if (state.phase === 'mulligan') return <Mulligan state={state} side={side} />

  const me       = state.players[side]
  const opponent = state.players[1 - side]
  const myHand   = Array.isArray(me.hand) ? me.hand : []
  const oppCount = opponent.hand?.count ?? 0
  const isMyTurn = state.currentTurn === side
  const inActions = state.turnPhase === 'actions'
  const inDiscard = state.turnPhase === 'discard'
  const isGameOver = state.winner !== null
  const iWon = isGameOver && state.winner === side
  const playAgainVotes = state.playAgainVotes ?? []
  const iVoted = playAgainVotes.includes(side)

  const selectedPieceType = selectedPiece
    ? state.board[selectedPiece.row]?.[selectedPiece.lane]?.type
    : null

  const amInCheck = state.inCheck?.[side] ?? false
  const autoPassWarning = autoPassEnabled && myHand.some(c => c.type === 'Intercept' || c.type === 'Reversal')

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
      emitAction({ type: typeMap[card.type], cardIndex: i })
      clearAll()
      return
    }

    if (card.type === 'Purge') {
      emitAction({ type: 'play_purge', cardIndex: i })
      clearAll()
      return
    }

    if (PLACEABLE.has(card.type)) {
      setCard(selectedCardIdx === i ? null : i)
      setPiece(null); setCycleMode(false); setTargetMode(null)
      return
    }

    if (BUFF_TYPES.has(card.type) || DEBUFF_TYPES.has(card.type) || CONTROL_CARD_TYPES.has(card.type)) {
      const type = BUFF_TYPES.has(card.type) ? 'buff'
                 : DEBUFF_TYPES.has(card.type) ? 'debuff'
                 : card.type.toLowerCase()   // 'reposition', 'swap', 'dispel', 'return'
      // Toggle off if clicking the same card again
      if (targetMode?.cardIdx === i && targetMode?.type === type) {
        setTargetMode(null)
      } else {
        setTargetMode({ type, cardIdx: i, step: 1, firstPiece: null })
        setCard(null); setPiece(null); setCycleMode(false)
      }
      return
    }
    // Intercept / Reversal: reaction cards only — ignore click
  }

  function handleSpaceClick(row, lane) {
    if (reversalTargetMode) {
      const { cardIdx } = reversalTargetMode
      emit('play_reaction', { cardIndex: cardIdx, targetRow: row, targetLane: lane })
      setReversalTargetMode(null)
      setReactionWindowMode(null)
      return
    }

    // Bodyguard selection: defender picks which Bodyguard to sacrifice
    if (bodyguardMode) {
      if (bodyguardMode.options.some(o => o.row === row && o.lane === lane)) {
        emit('bodyguard_response', { bodyguardRow: row, bodyguardLane: lane })
        setBodyguardMode(null)
      }
      return
    }

    // Enslave placement takes priority over everything else
    if (enslaveMode) {
      if (enslaveMode.validSpaces.some(s => s.row === row && s.lane === lane)) {
        emit('enslave_response', { row, lane })
        setEnslaveMode(null)
      }
      return
    }

    if (!isMyTurn || !inActions) return

    if (cycleMode) { setCycleMode(false); return }

    // ── Target-mode handling (buff/debuff/control cards) ──
    if (targetMode) {
      const { type, cardIdx, step, firstPiece } = targetMode
      const piece = state.board[row][lane]

      const card = myHand[cardIdx]

      if (type === 'buff') {
        if (piece?.owner === side && piece.type !== 'King' && !piece.buff && piece.debuff?.type !== 'Silence')
          emitAction({ type: 'play_buff', cardIndex: cardIdx, targetRow: row, targetLane: lane },
            { effectType: card?.type, targetType: piece?.type })
        clearAll()
        return
      }

      if (type === 'debuff') {
        if (piece && piece.owner !== side && piece.type !== 'King' && !piece.debuff && piece.buff?.type !== 'Protection')
          emitAction({ type: 'play_debuff', cardIndex: cardIdx, targetRow: row, targetLane: lane },
            { effectType: card?.type, targetType: piece?.type })
        clearAll()
        return
      }

      if (type === 'return') {
        if (piece?.owner === side && piece.type !== 'King')
          emitAction({ type: 'play_return', cardIndex: cardIdx, pieceRow: row, pieceLane: lane },
            { pieceType: piece?.type })
        clearAll()
        return
      }

      if (type === 'dispel') {
        if (piece && (piece.buff || piece.debuff)) {
          const which = (piece.buff && piece.debuff) ? 'buff' : (piece.buff ? 'buff' : 'debuff')
          emitAction({ type: 'play_dispel', cardIndex: cardIdx, targetRow: row, targetLane: lane, which },
            { targetType: piece?.type })
        }
        clearAll()
        return
      }

      if (type === 'reposition') {
        if (step === 1) {
          if (piece?.owner === side && piece.debuff?.type !== 'Pin')
            setTargetMode({ ...targetMode, step: 2, firstPiece: { row, lane } })
          else clearAll()
        } else {
          const ownRows = side === 0 ? [0, 1] : [2, 3]
          if (!piece && ownRows.includes(row)) {
            const fp = state.board[firstPiece.row]?.[firstPiece.lane]
            emitAction({ type: 'play_reposition', cardIndex: cardIdx, pieceRow: firstPiece.row, pieceLane: firstPiece.lane, toRow: row, toLane: lane },
              { pieceType: fp?.type })
          }
          clearAll()
        }
        return
      }

      if (type === 'swap') {
        if (step === 1) {
          if (piece?.owner === side && piece.debuff?.type !== 'Pin')
            setTargetMode({ ...targetMode, step: 2, firstPiece: { row, lane } })
          else clearAll()
        } else {
          if (piece?.owner === side && piece.debuff?.type !== 'Pin' &&
              !(row === firstPiece.row && lane === firstPiece.lane))
            emitAction({ type: 'play_swap', cardIndex: cardIdx, aRow: firstPiece.row, aLane: firstPiece.lane, bRow: row, bLane: lane })
          clearAll()
        }
        return
      }
    }

    // ── Normal piece / placement handling ──
    const piece = state.board[row][lane]

    if (selectedCardIdx !== null) {
      if (!piece) {
        const ownRows = side === 0 ? [0, 1] : [2, 3]
        if (!ownRows.includes(row)) {
          setErrorMsg('Can only place pieces on your own side.')
          setTimeout(() => setErrorMsg(''), 3000)
        } else {
          const card = myHand[selectedCardIdx]
          emitAction({ type: 'place', cardIndex: selectedCardIdx, row, lane }, { pieceType: card?.type })
        }
      }
      clearAll()
      return
    }

    if (selectedPiece) {
      const { row: fr, lane: fl } = selectedPiece
      const movingPiece = state.board[fr]?.[fl]
      if (!piece) {
        if (!validMoves?.has(`${row},${lane}`)) {
          const ownRows = side === 0 ? [0, 1] : [2, 3]
          if (movingPiece && isPinned(movingPiece) && ownRows.includes(row)) setErrorMsg('Pinned pieces cannot move.')
          else setErrorMsg('Invalid move.')
          setTimeout(() => setErrorMsg(''), 3000)
          clearAll()
        } else {
          emitAction({ type: 'direct_move', row: fr, lane: fl, toRow: row, toLane: lane },
            { pieceType: movingPiece?.type })
          clearAll()
        }
      } else if (piece.owner === side) {
        setPiece({ row, lane })
        emit('select_piece', { row, lane })
      } else {
        if (!validAttacks?.has(`${row},${lane}`)) {
          if (movingPiece && isFatigued(movingPiece)) setErrorMsg('Fatigued pieces cannot attack.')
          else setErrorMsg('Invalid attack.')
          setTimeout(() => setErrorMsg(''), 3000)
          clearAll()
        } else {
          emitAction({ type: 'direct_attack', row: fr, lane: fl, targetRow: row, targetLane: lane },
            { pieceType: movingPiece?.type, targetType: piece?.type })
          clearAll()
        }
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
    const piece = state.board[selectedPiece.row]?.[selectedPiece.lane]
    emitAction(
      { type: 'direct_sacrifice', row: selectedPiece.row, lane: selectedPiece.lane },
      { pieceType: piece?.type }
    )
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

  if (!isGameOver && isMyTurn && (discardMode || inDiscard)) {
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
      {forfeitConfirm && (
        <div className="modal-overlay" onClick={() => setForfeitConfirm(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Forfeit game?</div>
            <div className="modal-body">You will lose the match.</div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setForfeitConfirm(false)}>Cancel</button>
              <button className="btn-danger" onClick={() => { emit('forfeit'); setForfeitConfirm(false) }}>Confirm Forfeit</button>
            </div>
          </div>
        </div>
      )}
      <GameInfo state={state} side={side} />
      {isGameOver && (
        <div className="game-over-banner">
          <span className={iWon ? 'game-over-win' : 'game-over-lose'}>
            {iWon ? 'You win!' : 'You lose.'}
          </span>
          <span className="game-over-sub">
            {state.endReason === 'forfeit'
              ? `${state.players[1 - state.winner].name} forfeited.`
              : `${state.players[state.winner].name} wins by checkmate.`}
          </span>
        </div>
      )}
      {!isGameOver && errorMsg && <div className="error-msg">{errorMsg}</div>}
      {!isGameOver && amInCheck && <div className="check-warning">Your King is in check!</div>}

      <div className="opponent-area">
        <div className="player-label">{opponent.name} — {oppCount} card{oppCount !== 1 ? 's' : ''}</div>
        <Hand cards={oppCount} faceDown />
      </div>

      {enslaveMode && (
        <div className="enslave-prompt">
          Enslave: Place the captured {enslaveMode.pieceType} on your side, or discard it.
        </div>
      )}
      {bodyguardMode && (
        <div className="bodyguard-prompt">
          Bodyguard: {bodyguardMode.isKingAttack
            ? `Your King is under attack! Choose a Bodyguard to sacrifice.`
            : `Your ${bodyguardMode.targetType} is under attack. Choose a Bodyguard to sacrifice, or decline.`}
        </div>
      )}
      {reactionWindowMode && (
        <div className="reaction-window-banner">
          Opponent is {richActionLabel(reactionWindowMode.action)}. React?
        </div>
      )}
      {!isGameOver && myPendingAction && isMyTurn && (
        <div className="reaction-window-banner" style={{ background: 'rgba(124,131,253,0.08)', borderColor: 'rgba(124,131,253,0.35)', color: '#a0b0ff' }}>
          You are {richActionLabel(myPendingAction)}…
        </div>
      )}

      <Board
        board={previewBoard ?? state.board}
        side={side}
        selectedPiece={selectedPiece}
        placingCard={selectedCardIdx !== null}
        validMoves={validMoves}
        validAttacks={validAttacks}
        attackRange={attackRange}
        cardTargets={enslaveTargets ?? bodyguardTargets ?? reversalTargets ?? cardTargets}
        underAttack={bodyguardMode ? `${bodyguardMode.targetRow},${bodyguardMode.targetLane}` : null}
        onSpaceClick={!isGameOver && (enslaveMode || bodyguardMode || reversalTargetMode || (isMyTurn && inActions)) ? handleSpaceClick : undefined}
      />

      <div className="my-area">
        <Hand
          cards={myHand}
          selectedIdx={selectedCardIdx}
          cycleMode={cycleMode}
          selectedSet={targetMode ? new Set([targetMode.cardIdx]) : undefined}
          interceptedIds={state.interceptedCardIds}
          onCardClick={isMyTurn && inActions ? handleCardClick : undefined}
        />
        <div className="game-controls">
          {isGameOver ? (
            <>
              <button className="btn-secondary" onClick={() => navigate('/')}>Leave</button>
              <button
                className={iVoted ? 'btn-active' : ''}
                onClick={() => emit('play_again_vote', { vote: !iVoted })}
              >
                {iVoted ? 'Cancel' : 'Play Again'}
              </button>
              {playAgainVotes.length > 0 && (
                <span className="play-again-count">{playAgainVotes.length}/2 waiting to play again</span>
              )}
            </>
          ) : (
            <>
              {/* Far left: auto-pass */}
              <button
                className={`btn-secondary auto-pass-toggle${autoPassWarning ? ' btn-warning' : ''}`}
                onClick={toggleAutoPass}
                title={autoPassEnabled
                  ? autoPassWarning
                    ? 'Auto-pass ON — you have reaction cards that will be skipped!'
                    : 'Auto-pass ON — click to disable'
                  : 'Auto-pass OFF — click to enable'}
              >
                Auto-pass {autoPassEnabled ? 'ON' : 'OFF'}
              </button>

              {/* Context controls */}
              {reactionWindowMode ? (
                (() => {
                  const interceptIdx = myHand.findIndex(c => c.type === 'Intercept')
                  const reversalIdx = myHand.findIndex(c => c.type === 'Reversal')
                  const canReversal = reversalIdx !== -1 &&
                    (reactionWindowMode.action.type === 'play_buff' || reactionWindowMode.action.type === 'play_debuff')
                  return (
                    <>
                      {interceptIdx !== -1 && (
                        <button onClick={() => { emit('play_reaction', { cardIndex: interceptIdx }); setReactionWindowMode(null) }}>Intercept</button>
                      )}
                      {canReversal && !reversalTargetMode && (
                        <button className="btn-secondary" onClick={() => setReversalTargetMode({ cardIdx: reversalIdx })}>Reversal</button>
                      )}
                      {reversalTargetMode && <span className="waiting-turn">Click a target on the board…</span>}
                      <button className="btn-secondary" onClick={() => emit('extend_reaction')}>Add 10s</button>
                      <button className="btn-secondary" onClick={() => { emit('pass_reaction'); setReactionWindowMode(null) }}>Pass</button>
                      <div className="auto-end-wrap" style={{ width: 'auto', minWidth: '80px' }}>
                        <span className="auto-end-label">
                          {Math.max(0, Math.ceil((reactionWindowMode.ms - (Date.now() - reactionWindowMode.startedAt)) / 1000))}s
                        </span>
                        <div className="auto-end-track">
                          <div className="auto-end-bar" style={{ animationDuration: `${reactionWindowMode.ms}ms` }} />
                        </div>
                      </div>
                    </>
                  )
                })()
              ) : state?.reactionWindowOpen && isMyTurn ? (
                <span className="waiting-turn">Opponent is considering a reaction…</span>
              ) : (
                <>
                  {!enslaveMode && !bodyguardMode && isMyTurn && inActions && (
                    <button
                      className={`btn-secondary${cycleMode ? ' btn-active' : ''}`}
                      disabled={state.actionsRemaining <= 0}
                      onClick={() => { setCycleMode(c => !c); setCard(null); setPiece(null); setTargetMode(null) }}
                    >
                      Cycle Card
                    </button>
                  )}
                  {!enslaveMode && !bodyguardMode && selectedPiece && selectedPieceType !== 'King' && isMyTurn && inActions && (
                    <button className="btn-secondary" onClick={handleSacrifice}>Sacrifice</button>
                  )}
                  {enslaveMode && (
                    <button className="btn-secondary" onClick={() => { emit('enslave_response', { discard: true }); setEnslaveMode(null) }}>
                      Discard {enslaveMode.pieceType}
                    </button>
                  )}
                  {bodyguardMode && !bodyguardMode.isKingAttack && (
                    <button className="btn-secondary" onClick={() => { emit('bodyguard_response', { decline: true }); setBodyguardMode(null) }}>
                      Decline Bodyguard
                    </button>
                  )}
                  {!isMyTurn && (
                    <span className="waiting-turn">
                      {inDiscard ? `Waiting for ${opponent.name} to discard…` : `Waiting for ${opponent.name}…`}
                    </span>
                  )}
                </>
              )}

              {/* Spacer pushes end turn + forfeit to the right */}
              <div style={{ flex: 1 }} />

              {!reactionWindowMode && !enslaveMode && !bodyguardMode && isMyTurn && inActions && (
                <button onClick={handleEndTurn}>End Turn</button>
              )}
            </>
          )}
        </div>
        {!isGameOver && (
          <button className="btn-secondary forfeit-btn" onClick={() => setForfeitConfirm(true)}>Forfeit</button>
        )}
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

function richActionLabel(action) {
  if (!action) return 'acting'
  const { type, pieceType, targetType, effectType } = action
  switch (type) {
    case 'place':            return `placing a ${pieceType ?? 'piece'}`
    case 'direct_move':      return `moving their ${pieceType ?? 'piece'}`
    case 'direct_attack':    return `attacking${targetType ? ` your ${targetType}` : ''}${pieceType ? ` with their ${pieceType}` : ''}`
    case 'direct_sacrifice': return `sacrificing their ${pieceType ?? 'piece'}`
    case 'play_buff':        return effectType && targetType ? `applying ${effectType} to their ${targetType}` : 'playing a buff'
    case 'play_debuff':      return effectType && targetType ? `applying ${effectType} to your ${targetType}` : 'playing a debuff'
    case 'play_reposition':  return `repositioning their ${pieceType ?? 'piece'}`
    case 'play_swap':        return 'swapping two pieces'
    case 'play_dispel':      return `dispelling from a ${targetType ?? 'piece'}`
    case 'play_return':      return `returning their ${pieceType ?? 'piece'} to hand`
    case 'play_purge':       return 'playing Purge'
    case 'play_command':     return 'playing Command'
    case 'play_disrupt':     return 'playing Disrupt'
    default:                 return type
  }
}

function computePreviewBoard(board, action, actorSide) {
  if (!action || !board) return null
  const b = board.map(r => [...r])
  switch (action.type) {
    case 'place':
      if (action.pieceType != null && action.row != null && b[action.row]?.[action.lane] === null)
        b[action.row][action.lane] = { type: action.pieceType, owner: actorSide, buff: null, debuff: null, canActThisTurn: false }
      break
    case 'direct_move': {
      const p = b[action.row]?.[action.lane]
      if (p && b[action.toRow]?.[action.toLane] === null) {
        b[action.toRow][action.toLane] = p
        b[action.row][action.lane] = null
      }
      break
    }
    case 'direct_attack':
      if (action.targetRow != null) b[action.targetRow][action.targetLane] = null
      break
    case 'direct_sacrifice':
      if (action.row != null) b[action.row][action.lane] = null
      break
    case 'play_buff': {
      const p = b[action.targetRow]?.[action.targetLane]
      if (p && action.effectType) b[action.targetRow][action.targetLane] = { ...p, buff: { type: action.effectType } }
      break
    }
    case 'play_debuff': {
      const p = b[action.targetRow]?.[action.targetLane]
      if (p && action.effectType) b[action.targetRow][action.targetLane] = { ...p, debuff: { type: action.effectType } }
      break
    }
    case 'play_reposition': {
      const p = b[action.pieceRow]?.[action.pieceLane]
      if (p && b[action.toRow]?.[action.toLane] === null) {
        b[action.toRow][action.toLane] = p
        b[action.pieceRow][action.pieceLane] = null
      }
      break
    }
    case 'play_swap': {
      const a = b[action.aRow]?.[action.aLane]
      const bPiece = b[action.bRow]?.[action.bLane]
      if (a && bPiece) { b[action.aRow][action.aLane] = bPiece; b[action.bRow][action.bLane] = a }
      break
    }
    case 'play_dispel': {
      const p = b[action.targetRow]?.[action.targetLane]
      if (p) b[action.targetRow][action.targetLane] = { ...p, [action.which]: null }
      break
    }
    case 'play_return':
      if (action.pieceRow != null) b[action.pieceRow][action.pieceLane] = null
      break
    case 'play_purge':
      for (let r = 0; r <= 3; r++)
        for (let l = 0; l <= 4; l++)
          if (b[r][l]) b[r][l] = { ...b[r][l], buff: null, debuff: null }
      break
    default: return null
  }
  return b
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
  const [selected, setSelected] = useState([])

  function toggle(i) {
    setSelected(prev => {
      const idx = prev.indexOf(i)
      if (idx !== -1) {
        return prev.filter(x => x !== i)
      }
      if (prev.length >= excess) {
        return [...prev.slice(1), i]
      }
      return [...prev, i]
    })
  }

  const canConfirm = selected.length === excess

  return (
    <div className="discard-overlay">
      <h2>Discard</h2>
      <p className="mulligan-hint">
        Select {excess} card{excess > 1 ? 's' : ''} to discard (hand must end at 5).
      </p>
      <Hand cards={hand} selectedSet={new Set(selected)} onCardClick={toggle} />
      <div className="discard-controls">
        {onCancel && <button className="btn-secondary" onClick={onCancel}>Cancel</button>}
        <button disabled={!canConfirm} onClick={() => canConfirm && onConfirm([...selected])}>
          Discard {selected.length} / {excess}
        </button>
      </div>
    </div>
  )
}
