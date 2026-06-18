import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSocket, useSocket } from '../hooks/useSocket'
import Board from '../components/Board'
import Hand from '../components/Hand'
import GameInfo from '../components/GameInfo'
import DeckPile from '../components/DeckPile'
import DiscardPile from '../components/DiscardPile'
import CaptureSlide from '../components/CaptureSlide'
import ReturnSlide from '../components/ReturnSlide'
import DeckSlide from '../components/DeckSlide'
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
  const [liftedCard, setLiftedCard]   = useState(null)
  // null | { card: {id, type, ...}, serverIdx: number } — card lifted from hand
  const [selectedPiece, setPiece]     = useState(null)
  const [discardMode, setDiscardMode] = useState(false)
  const [localHandOrder, setLocalHandOrder] = useState(null)
  const [oppHandIds, setOppHandIds]   = useState(null)
  const [discardViewIndex, setDiscardViewIndex] = useState(0)
  const [discardBrowserId, setDiscardBrowserId] = useState(null)
  const [errorMsg, setErrorMsg]       = useState('')
  const [targetMode, setTargetMode]   = useState(null)
  // targetMode: null | { type: 'buff'|'debuff'|'reposition'|'swap'|'dispel'|'return', cardId, step: 1|2, firstPiece: {row,lane}|null }
  const [enslaveMode, setEnslaveMode] = useState(null)
  // enslaveMode: null | { validSpaces: [{row, lane}], pieceType: string }
  const [bodyguardMode, setBodyguardMode] = useState(null)
  // bodyguardMode: null | { options, isKingAttack, targetType, targetRow, targetLane }
  const [reactionWindowMode, setReactionWindowMode] = useState(null)
  // null | { action, ms } — set when this player can react to opponent's action
  const [reversalTargetMode, setReversalTargetMode] = useState(null)
  // null | { cardIdx: number } — picking a Reversal redirect target on the board
  const [myPendingAction, setMyPendingAction] = useState(null)
  // null | enriched action object — what this player just emitted, for preview while window is open
  const [forfeitConfirm, setForfeitConfirm] = useState(false)
  // ── Animation state ────────────────────────────────────────────────
  const [floatingPiece, setFloatingPiece]       = useState(null)
  // null | { piece, fromRow, fromLane } — own board piece currently floating
  const [boardHoveredCell, setBoardHoveredCell] = useState(null)
  // null | { row, lane } — board cell mouse is over
  const [confirmTarget, setConfirmTarget]       = useState(null)
  // null | { row, lane } — brief gold pulse when action confirmed
  const [captureSlides, setCaptureSlides]        = useState([])
  // [{ piece, fromPos, toPos, isOwn }] — pieces/cards sliding to discard pile
  const [handHovered, setHandHovered]           = useState(false)
  const [isShaking, setIsShaking]               = useState(false)
  const [discardHovered, setDiscardHovered]      = useState(false)
  const [attackPending, setAttackPending]        = useState(null)
  // null | { fromRow, fromLane, toRow, toLane, piece }
  const [returnSlide, setReturnSlide]            = useState(null)
  // null | { piece, fromPos, toPos, isOwn }

  // ── Opponent visual state ──────────────────────────────────────────
  const [oppSelectedPiece, setOppSelectedPiece] = useState(null)
  // null | { row, lane }
  const [oppHoveredCell, setOppHoveredCell]     = useState(null)
  // null | { row, lane }
  const [oppSelectedCardType, setOppSelectedCardType] = useState(null)
  // null | string — card type the opponent currently has selected from their hand
  const [oppLiftedCardId, setOppLiftedCardId] = useState(null)
  const [oppDiscardHovered, setOppDiscardHovered] = useState(false)
  const [deckHovered, setDeckHovered]         = useState(false)
  const [oppDeckHovered, setOppDeckHovered]   = useState(false)
  const [deckSlide, setDeckSlide]               = useState(null)
  const [handInsertIndex, setHandInsertIndex]   = useState(null)
  // null | number — where to insert the lifted card when hovering back over hand

  const [reactionPct, setReactionPct] = useState(100)
  const [turnFlash, setTurnFlash] = useState(false)

  // ── Refs ───────────────────────────────────────────────────────────
  const boardSpaceRefs    = useRef({})  // 'row,lane' → DOM el
  const discardPileRef    = useRef(null)
  const deckPileRef       = useRef(null)
  const ownHandAreaRef    = useRef(null)
  const oppHandAreaRef    = useRef(null)
  const hoverThrottleRef  = useRef(0)
  const hoverTrailingRef  = useRef(null)
  const reactionTimerRef  = useRef(null)
  // Tracks whether we cleared select_card_type for insert mode (so we can restore on leave)
  const insertRevealedRef = useRef(false)
  const prevTurnRef       = useRef(null)

  const side = parseInt(localStorage.getItem('checkline_side') ?? '0')

  useEffect(() => {
    const token = localStorage.getItem('checkline_token')
    if (token) emit('reconnect', { token, code })
  }, [code])

  // ── Reaction timer visual countdown ───────────────────────────────
  useEffect(() => {
    if (!reactionWindowMode) { setReactionPct(100); reactionTimerRef.current = null; return }
    reactionTimerRef.current = {
      remainingMs: reactionWindowMode.ms,
      lastTime: Date.now(),
      drainMult: handHovered ? 1 : 4,
      totalMs: reactionWindowMode.ms,
    }
    const id = setInterval(() => {
      const ref = reactionTimerRef.current
      if (!ref) return
      const now = Date.now()
      const elapsed = (now - ref.lastTime) * ref.drainMult
      ref.remainingMs = Math.max(0, ref.remainingMs - elapsed)
      ref.lastTime = now
      setReactionPct(ref.remainingMs / ref.totalMs * 100)
    }, 50)
    return () => clearInterval(id)
  }, [reactionWindowMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (reactionTimerRef.current) {
      reactionTimerRef.current.drainMult = handHovered ? 1 : 4
    }
  }, [handHovered])

  useSocket({
    game_starting:         ({ state }) => { setState(state); clearAll() },
    opponent_hand_order:   ({ ids }) => setOppHandIds(ids),
    discard_view:          ({ index, browserId }) => { setDiscardViewIndex(index); setDiscardBrowserId(browserId) },
    opponent_select_piece: payload => {
      setOppSelectedPiece(payload?.row != null ? { row: payload.row, lane: payload.lane } : null)
    },
    opponent_hover_space: payload => {
      setOppHoveredCell(payload?.row != null ? { row: payload.row, lane: payload.lane } : null)
    },
    opponent_select_card_type: ({ cardType, cardId }) => {
      setOppSelectedCardType(cardType ?? null)
      setOppLiftedCardId(cardId ?? null)
    },
    opponent_hover_discard: ({ hovering }) => setOppDiscardHovered(hovering),
    opponent_hover_deck:    ({ hovering }) => setOppDeckHovered(hovering),
    state_update: ({ state: s, lastAction }) => {
      // ── Trigger capture slide BEFORE applying new state ──────────────
      // (so we can read the piece from the old board while refs still match)
      // ── Deck → hand slide on cycle ────────────────────────────────────
      if (lastAction?.type === 'cycle') {
        const deckEl = deckPileRef.current
        const isOwn  = lastAction.actorSide === side
        const toEl   = isOwn ? ownHandAreaRef.current : oppHandAreaRef.current
        if (deckEl && toEl) {
          const fr = deckEl.getBoundingClientRect()
          const tr = toEl.getBoundingClientRect()
          setDeckSlide({
            fromPos: { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 },
            toPos:   { x: tr.right - 20, y: isOwn ? tr.top + tr.height / 2 : tr.bottom },
          })
        }
      }

      if (lastAction && !s.reactionWindowOpen) {
        const la = lastAction
        const p  = la.payload
        const toEl = discardPileRef.current

        // Purge: all buff/debuff tokens slide to discard
        if (la.type === 'play_purge' && toEl) {
          const currentBoard = state?.board
          const slides = []
          const tr = toEl.getBoundingClientRect()
          for (let r = 0; r <= 3; r++) {
            for (let l = 0; l <= 4; l++) {
              const pc = currentBoard?.[r]?.[l]
              if (!pc) continue
              const fromEl = boardSpaceRefs.current[`${r},${l}`]
              if (!fromEl) continue
              const fr = fromEl.getBoundingClientRect()
              if (pc.buff)   slides.push({ piece: { type: pc.buff.type,   owner: pc.owner }, fromPos: { x: fr.left, y: fr.top }, toPos: { x: tr.left, y: tr.top }, isOwn: pc.owner === side })
              if (pc.debuff) slides.push({ piece: { type: pc.debuff.type, owner: pc.owner }, fromPos: { x: fr.left, y: fr.top }, toPos: { x: tr.left, y: tr.top }, isOwn: pc.owner === side })
            }
          }
          if (slides.length > 0) setCaptureSlides(slides)
        }

        // Capture / sacrifice / bodyguard: piece slides to discard
        let slideRow, slideLane, isShieldSlide = false
        if (la.type === 'direct_attack' && la.secondaryEffect !== 'shield_absorbed' && la.secondaryEffect !== 'enslave_placed') {
          slideRow = p.targetRow; slideLane = p.targetLane
        } else if (la.type === 'direct_attack' && la.secondaryEffect === 'shield_absorbed') {
          slideRow = p.targetRow; slideLane = p.targetLane; isShieldSlide = true
        } else if (la.type === 'direct_sacrifice') {
          slideRow = p.row; slideLane = p.lane
        } else if (la.type === 'bodyguard_save') {
          slideRow = p.bodyguardRow; slideLane = p.bodyguardLane
        }

        if (slideRow != null && slideLane != null) {
          const currentBoard = state?.board
          const pieceToSlide = isShieldSlide
            ? currentBoard?.[slideRow]?.[slideLane]?.buff
            : currentBoard?.[slideRow]?.[slideLane]

          if (pieceToSlide && toEl) {
            const fromEl = boardSpaceRefs.current[`${slideRow},${slideLane}`]
            if (fromEl) {
              const fr = fromEl.getBoundingClientRect()
              const tr = toEl.getBoundingClientRect()
              setCaptureSlides([{
                piece:   pieceToSlide,
                fromPos: { x: fr.left, y: fr.top },
                toPos:   { x: tr.left, y: tr.top },
                isOwn:   pieceToSlide.owner === side,
              }])
            }
          }
        }
      }

      setState(s)

      // Flash turn indicator when turn changes
      if (prevTurnRef.current !== null && prevTurnRef.current !== s.currentTurn) {
        setTurnFlash(true)
        setTimeout(() => setTurnFlash(false), 1200)
      }
      prevTurnRef.current = s.currentTurn

      if (attackPending && !s.reactionWindowOpen) {
        // Attack resolved — trigger ReturnSlide (piece moves from target back to origin)
        const toEl  = boardSpaceRefs.current[`${attackPending.toRow},${attackPending.toLane}`]
        const fromEl = boardSpaceRefs.current[`${attackPending.fromRow},${attackPending.fromLane}`]
        if (toEl && fromEl) {
          const tr = toEl.getBoundingClientRect()
          const fr = fromEl.getBoundingClientRect()
          setReturnSlide({
            piece:   attackPending.piece,
            fromPos: { x: tr.left, y: tr.top },
            toPos:   { x: fr.left, y: fr.top },
            isOwn:   true,
          })
          setBoardHoveredCell(null)
          // floatingPiece stays set — hides origin piece until ReturnSlide.onDone
          setLiftedCard(null); setPiece(null); setDiscardMode(false); setTargetMode(null)
          setEnslaveMode(null); setBodyguardMode(null); setForfeitConfirm(false)
          setDiscardHovered(false); setConfirmTarget(null)
        } else {
          clearAll()
        }
        setAttackPending(null)
      } else if (!attackPending) {
        if (!returnSlide) {
          clearAll()
        } else {
          // ReturnSlide is playing — don't cancel it; do everything else
          setLiftedCard(null); setPiece(null); setDiscardMode(false); setTargetMode(null)
          setEnslaveMode(null); setBodyguardMode(null); setForfeitConfirm(false)
          setDeckHovered(false); setBoardHoveredCell(null); setConfirmTarget(null); setDiscardHovered(false)
          setHandInsertIndex(null); insertRevealedRef.current = false
          clearTimeout(hoverTrailingRef.current)
          emit('select_card_type', { cardType: null, cardId: null })
          emit('hover_discard', { hovering: false })
          emit('hover_deck', { hovering: false })
          // floatingPiece + returnSlide left intact — ReturnSlide.onDone clears them
        }
      } else {
        // attackPending && s.reactionWindowOpen — keep piece locked at target during window
        setLiftedCard(null); setPiece(null); setDiscardMode(false); setTargetMode(null)
        setEnslaveMode(null); setBodyguardMode(null); setForfeitConfirm(false)
        setDiscardHovered(false)
      }

      setLocalHandOrder(null)
      setOppHandIds(null)
      setDiscardViewIndex(s.discardViewIndex ?? 0)
      setDiscardBrowserId(null)
      setOppSelectedPiece(null)
      setOppHoveredCell(null)
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
    enslave_prompt: ({ validSpaces, pieceType }) => {
      setEnslaveMode({ validSpaces, pieceType })
      setFloatingPiece({ piece: { type: pieceType, owner: side, buff: null, debuff: null, canActThisTurn: false }, fromRow: -1, fromLane: -1 })
      emit('select_card_type', { cardType: pieceType, cardId: null })
    },
    bodyguard_prompt:      ({ options, isKingAttack, targetType, targetRow, targetLane }) =>
                             setBodyguardMode({ options, isKingAttack, targetType, targetRow, targetLane }),
    reaction_window: ({ action, actorSide, ms }) => {
      setReactionWindowMode({ action, actorSide, ms })
    },
    reversal_cancelled: ({ ms }) => {
      // Timer restarted after cancelling reversal target selection — update countdown
      setReactionWindowMode(prev => prev ? { ...prev, ms } : prev)
    },
    error: ({ message }) => {
      setErrorMsg(message)
      setMyPendingAction(null)
      setTimeout(() => setErrorMsg(''), 3000)
    },
  })

  function clearAll() {
    setLiftedCard(null); setPiece(null); setDiscardMode(false); setTargetMode(null); setEnslaveMode(null); setBodyguardMode(null); setForfeitConfirm(false)
    setFloatingPiece(null); setBoardHoveredCell(null); setConfirmTarget(null); setDiscardHovered(false)
    setAttackPending(null); setReturnSlide(null); setDeckHovered(false); setHandInsertIndex(null)
    insertRevealedRef.current = false
    clearTimeout(hoverTrailingRef.current)
    emit('select_card_type', { cardType: null, cardId: null })
    emit('hover_discard', { hovering: false })
    emit('hover_deck', { hovering: false })
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
    const origKey = action.targetRow != null ? `${action.targetRow},${action.targetLane}` : null
    const s = new Set()
    for (let r = 0; r <= 3; r++) {
      for (let l = 0; l <= 4; l++) {
        if (`${r},${l}` === origKey) continue
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

  const me          = state.players[side]
  const opponent    = state.players[1 - side]
  const myHand      = Array.isArray(me.hand) ? me.hand : []
  const filteredHand = (localHandOrder ?? myHand).filter(c => !liftedCard || c.id !== liftedCard.card.id)
  const displayHand  = (handInsertIndex !== null && liftedCard !== null)
    ? [
        ...filteredHand.slice(0, handInsertIndex),
        liftedCard.card,
        ...filteredHand.slice(handInsertIndex),
      ]
    : filteredHand
  const oppHand     = opponent.hand  // { count, ids }
  const oppCount    = oppHand?.count ?? 0
  // Use real IDs as keys from the start (server always provides them) to prevent
  // the visual jump that occurs when generic 'opp-N' keys get replaced by real IDs
  const baseOppIds  = Array.isArray(oppHand?.ids) ? oppHand.ids : null
  const activeOppIds = oppHandIds ?? baseOppIds
  const displayOppHand = {
    count: oppCount - (oppSelectedCardType ? 1 : 0),
    ids: activeOppIds
      ? (oppLiftedCardId ? activeOppIds.filter(id => id !== oppLiftedCardId) : activeOppIds)
      : null,
  }
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
  const canCycleViaDiscard  = isMyTurn && inActions && liftedCard !== null && !reactionWindowMode && !enslaveMode && !bodyguardMode && state.actionsRemaining > 0
  const canShuffleIntoDeck  = isMyTurn && inActions && liftedCard !== null && !reactionWindowMode && !enslaveMode && !bodyguardMode
  const actionsMax          = state.actionsMax ?? 2
  const nextPlayer          = 1 - state.currentTurn
  const myWillBeDisrupted   = state.disruptNextTurn && nextPlayer === side
  const oppWillBeDisrupted  = state.disruptNextTurn && nextPlayer !== side
  const canSacrifice = !!selectedPiece && isMyTurn && inActions && !reactionWindowMode && !enslaveMode && !bodyguardMode && selectedPieceType !== 'King'
  const handFloatingCard = !floatingPiece && liftedCard !== null && handInsertIndex === null
    ? { ...liftedCard.card, owner: side }
    : null

  // Which hand cards glow as usable reactions during the reaction window
  const reactionIndices = reactionWindowMode ? (() => {
    const isBuffDebuff = reactionWindowMode.action.type === 'play_buff' || reactionWindowMode.action.type === 'play_debuff'
    const s = new Set()
    myHand.forEach((c, i) => {
      if (c.type === 'Intercept' || (c.type === 'Reversal' && isBuffDebuff)) s.add(i)
    })
    return s
  })() : null

  // ── Action handlers ────────────────────────────────────────────────

  function handleReactionCardClick(i) {
    if (!reactionWindowMode) return
    const card = myHand[i]
    if (!card) return
    const isBuffDebuff = reactionWindowMode.action.type === 'play_buff' || reactionWindowMode.action.type === 'play_debuff'
    if (card.type === 'Intercept') {
      emit('play_reaction', { cardIndex: i })
      setReactionWindowMode(null)
    } else if (card.type === 'Reversal' && isBuffDebuff && !reversalTargetMode) {
      setReversalTargetMode({ cardIdx: i })
      emit('reversal_placing') // freeze timer while picking a target
    }
  }

  function handleCycle() {
    if (!liftedCard) return
    emit('game_action', { type: 'cycle', cardIndex: liftedCard.serverIdx })
    setDiscardHovered(false)
    emit('hover_discard', { hovering: false })
    // Do NOT clearAll() — liftedCard stays set, keeping the cycled card absent from displayHand
    // until state_update arrives (which calls clearAll via the !attackPending branch)
  }

  function handleShuffleIntoDeck() {
    if (!liftedCard || !isMyTurn || !inActions) return
    emit('game_action', { type: 'shuffle_into_deck', cardIndex: liftedCard.serverIdx })
    setDeckHovered(false)
    emit('hover_deck', { hovering: false })
    // Don't clearAll() — state_update will handle it
  }

  function handleCardClick(i) {
    if (!isMyTurn || !inActions || attackPending) return
    if (floatingPiece) { setFloatingPiece(null); emit('select_piece', null) }

    const card = displayHand[i]
    if (!card) return

    // Lifted card hovered back into hand — clicking it confirms placement at handInsertIndex
    if (liftedCard && card.id === liftedCard.card.id) {
      const newOrder = [...displayHand]
      setLocalHandOrder(newOrder)
      emit('hand_reorder', { ids: newOrder.map(c => c.id) })
      setLiftedCard(null)
      // select_card_type was already cleared on enter — don't restore (card stays in hand for opponent)
      insertRevealedRef.current = false
      setHandInsertIndex(null)
      setTargetMode(null)
      return
    }

    // Don't lift a new card while in insert mode
    if (handInsertIndex !== null) return

    const serverIdx = myHand.findIndex(c => c.id === card.id)
    setLiftedCard({ card, serverIdx })
    emit('select_card_type', { cardType: card.type, cardId: card.id })
    setPiece(null)

    if (BUFF_TYPES.has(card.type) || DEBUFF_TYPES.has(card.type) || CONTROL_CARD_TYPES.has(card.type)) {
      const type = BUFF_TYPES.has(card.type) ? 'buff'
                 : DEBUFF_TYPES.has(card.type) ? 'debuff'
                 : card.type.toLowerCase()
      setTargetMode({ type, cardId: card.id, step: 1, firstPiece: null })
    } else {
      setTargetMode(null)
    }
  }

  function handleSpaceClick(row, lane) {
    if (reversalTargetMode) {
      const { cardIdx } = reversalTargetMode
      if (!reversalTargets?.has(`${row},${lane}`)) {
        setErrorMsg('Invalid Reversal target — pick a highlighted piece.')
        setTimeout(() => setErrorMsg(''), 2500)
        return
      }
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
        setFloatingPiece(null)
        emit('select_card_type', { cardType: null, cardId: null })
      }
      return
    }

    if (!isMyTurn || !inActions) return

    // ── Target-mode handling (buff/debuff/control cards) ──
    if (targetMode) {
      const { type, cardId, step, firstPiece } = targetMode
      const piece = state.board[row][lane]
      const card = myHand.find(c => c.id === cardId)
      const serverIdx = myHand.findIndex(c => c.id === cardId)

      if (type === 'buff') {
        if (piece?.owner === side && piece.type !== 'King' && !piece.buff && piece.debuff?.type !== 'Silence')
          emitAction({ type: 'play_buff', cardIndex: serverIdx, targetRow: row, targetLane: lane },
            { effectType: card?.type, targetType: piece?.type })
        clearAll()
        return
      }

      if (type === 'debuff') {
        if (piece && piece.owner !== side && piece.type !== 'King' && !piece.debuff && piece.buff?.type !== 'Protection')
          emitAction({ type: 'play_debuff', cardIndex: serverIdx, targetRow: row, targetLane: lane },
            { effectType: card?.type, targetType: piece?.type })
        clearAll()
        return
      }

      if (type === 'return') {
        if (piece?.owner === side && piece.type !== 'King')
          emitAction({ type: 'play_return', cardIndex: serverIdx, pieceRow: row, pieceLane: lane },
            { pieceType: piece?.type })
        clearAll()
        return
      }

      if (type === 'dispel') {
        if (piece && (piece.buff || piece.debuff)) {
          const which = (piece.buff && piece.debuff) ? 'buff' : (piece.buff ? 'buff' : 'debuff')
          emitAction({ type: 'play_dispel', cardIndex: serverIdx, targetRow: row, targetLane: lane, which },
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
            emitAction({ type: 'play_reposition', cardIndex: serverIdx, pieceRow: firstPiece.row, pieceLane: firstPiece.lane, toRow: row, toLane: lane },
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
            emitAction({ type: 'play_swap', cardIndex: serverIdx, aRow: firstPiece.row, aLane: firstPiece.lane, bRow: row, bLane: lane })
          clearAll()
        }
        return
      }
    }

    // ── Normal piece / placement handling ──
    const piece = state.board[row][lane]

    if (liftedCard !== null) {
      const card = liftedCard.card
      if (INSTANT.has(card.type)) {
        const typeMap = { Command: 'play_command', Disrupt: 'play_disrupt' }
        emitAction({ type: typeMap[card.type], cardIndex: liftedCard.serverIdx })
      } else if (card.type === 'Purge') {
        emitAction({ type: 'play_purge', cardIndex: liftedCard.serverIdx })
      } else if (PLACEABLE.has(card.type)) {
        if (!piece) {
          const ownRows = side === 0 ? [0, 1] : [2, 3]
          if (!ownRows.includes(row)) {
            setErrorMsg('Can only place pieces on your own side.')
            setTimeout(() => setErrorMsg(''), 3000)
          } else {
            emitAction({ type: 'place', cardIndex: liftedCard.serverIdx, row, lane }, { pieceType: card.type })
          }
        }
      }
      clearAll()
      return
    }

    if (selectedPiece) {
      const { row: fr, lane: fl } = selectedPiece
      // Click origin → put piece back
      if (row === fr && lane === fl) {
        clearAll()
        emit('select_piece', null)
        return
      }
      const movingPiece = state.board[fr]?.[fl]
      if (!piece) {
        if (!validMoves?.has(`${row},${lane}`)) {
          const ownRows = side === 0 ? [0, 1] : [2, 3]
          if (movingPiece && isPinned(movingPiece) && ownRows.includes(row)) setErrorMsg('Pinned pieces cannot move.')
          else setErrorMsg('Invalid move.')
          setIsShaking(true)
          setTimeout(() => setIsShaking(false), 420)
        } else {
          emitAction({ type: 'direct_move', row: fr, lane: fl, toRow: row, toLane: lane },
            { pieceType: movingPiece?.type })
          clearAll()
          setConfirmTarget({ row, lane })
          setTimeout(() => setConfirmTarget(null), 300)
        }
      } else if (piece.owner === side) {
        setPiece({ row, lane })
        setLiftedCard(null)
        emit('select_card_type', { cardType: null, cardId: null })
        setFloatingPiece({ piece, fromRow: row, fromLane: lane })
        emit('select_piece', { row, lane })
      } else {
        if (!validAttacks?.has(`${row},${lane}`)) {
          if (movingPiece && isFatigued(movingPiece)) setErrorMsg('Fatigued pieces cannot attack.')
          else setErrorMsg('Invalid attack.')
          setIsShaking(true)
          setTimeout(() => setIsShaking(false), 420)
        } else {
          emitAction({ type: 'direct_attack', row: fr, lane: fl, targetRow: row, targetLane: lane },
            { pieceType: movingPiece?.type, targetType: piece?.type })
          // Lock piece at target — don't clearAll; keep floatingPiece + boardHoveredCell
          setAttackPending({ fromRow: fr, fromLane: fl, toRow: row, toLane: lane, piece: movingPiece })
          setBoardHoveredCell({ row, lane })
          setLiftedCard(null); setPiece(null); setDiscardMode(false); setTargetMode(null)
          setDiscardHovered(false)
          setConfirmTarget({ row, lane })
          setTimeout(() => setConfirmTarget(null), 300)
        }
      }
      return
    }

    if (piece?.owner === side && piece.canActThisTurn) {
      setPiece({ row, lane })
      setLiftedCard(null)
      emit('select_card_type', { cardType: null, cardId: null })
      setFloatingPiece({ piece, fromRow: row, fromLane: lane })
      emit('select_piece', { row, lane })
    }
  }

  // ── Board hover handlers ───────────────────────────────────────────
  function handleSpaceMouseEnter(row, lane) {
    if (!attackPending) setBoardHoveredCell({ row, lane })
    if (errorMsg) setErrorMsg('')
    if (isShaking) setIsShaking(false)
    // Throttled hover_space emit (50ms) with trailing emit to capture final position
    if (floatingPiece || liftedCard !== null) {
      const now = Date.now()
      if (now - hoverThrottleRef.current > 50) {
        clearTimeout(hoverTrailingRef.current)
        hoverThrottleRef.current = now
        emit('hover_space', { row, lane })
      } else {
        clearTimeout(hoverTrailingRef.current)
        hoverTrailingRef.current = setTimeout(() => {
          hoverThrottleRef.current = Date.now()
          emit('hover_space', { row, lane })
        }, 60)
      }
    }
  }

  function handleBoardMouseLeave() {
    if (!attackPending) setBoardHoveredCell(null)
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
      <GameInfo state={state} side={side} turnFlash={turnFlash} />
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
      {!isGameOver && amInCheck && <div className="check-warning">Your King is in check!</div>}

      <div className="opponent-area" ref={oppHandAreaRef}>
        <div className="player-label">
          <span>{opponent.name} — {displayOppHand.count} card{displayOppHand.count !== 1 ? 's' : ''}</span>
          <ActionDots
            remaining={!isMyTurn ? (state.actionsRemaining ?? 0) : (oppWillBeDisrupted ? 1 : 2)}
            total={!isMyTurn ? actionsMax : 2}
            disrupted={isMyTurn && oppWillBeDisrupted}
          />
        </div>
        <Hand cards={displayOppHand} faceDown isOpponent />
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

      {captureSlides.map((slide, idx) => (
        <CaptureSlide
          key={idx}
          piece={slide.piece}
          fromPos={slide.fromPos}
          toPos={slide.toPos}
          isOwn={slide.isOwn}
          onDone={() => setCaptureSlides(prev => prev.filter((_, i) => i !== idx))}
        />
      ))}
      {returnSlide && (
        <ReturnSlide
          piece={returnSlide.piece}
          fromPos={returnSlide.fromPos}
          toPos={returnSlide.toPos}
          isOwn={returnSlide.isOwn}
          onDone={() => { setReturnSlide(null); setFloatingPiece(null) }}
        />
      )}

      <div className="board-area">
        <DiscardPile
          discardPile={state.discardPile ?? []}
          viewIndex={discardViewIndex}
          browserId={discardBrowserId}
          mySide={side}
          canCycle={canCycleViaDiscard}
          onBrowse={delta => emit('browse_discard', { delta })}
          onCycle={handleCycle}
          pileRef={discardPileRef}
          canSacrifice={canSacrifice}
          discardHovered={discardHovered}
          floatingPiece={floatingPiece}
          onSacrificeHover={() => setDiscardHovered(true)}
          onSacrificeLeave={() => setDiscardHovered(false)}
          onSacrifice={handleSacrifice}
          liftedCard={liftedCard}
          cycleHovered={discardHovered && canCycleViaDiscard}
          onCycleHover={() => { setDiscardHovered(true); emit('hover_discard', { hovering: true }) }}
          onCycleLeave={() => { setDiscardHovered(false); emit('hover_discard', { hovering: false }) }}
          oppDiscardHovered={oppDiscardHovered}
          oppLiftedCardType={oppSelectedCardType}
        />
        <Board
          board={previewBoard ?? state.board}
          side={side}
          selectedPiece={selectedPiece}
          placingCard={liftedCard !== null && PLACEABLE.has(liftedCard.card.type)}
          validMoves={validMoves}
          validAttacks={validAttacks}
          attackRange={attackRange}
          cardTargets={enslaveTargets ?? bodyguardTargets ?? reversalTargets ?? cardTargets}
          underAttack={bodyguardMode ? `${bodyguardMode.targetRow},${bodyguardMode.targetLane}` : null}
          onSpaceClick={!isGameOver && (enslaveMode || bodyguardMode || reversalTargetMode || (isMyTurn && inActions)) ? handleSpaceClick : undefined}
          spaceRefCallback={(r, l, el) => { boardSpaceRefs.current[`${r},${l}`] = el }}
          onSpaceMouseEnter={handleSpaceMouseEnter}
          onBoardMouseLeave={handleBoardMouseLeave}
          floatingPiece={floatingPiece}
          boardHoveredCell={boardHoveredCell}
          handFloatingCard={handFloatingCard}
          oppSelectedPiece={oppSelectedPiece}
          oppHoveredCell={(oppDiscardHovered || oppDeckHovered) ? null : oppHoveredCell}
          oppSelectedCardType={oppSelectedCardType}
          confirmTarget={confirmTarget}
          isShaking={isShaking}
          errorTip={errorMsg}
        />
        <DeckPile
          deckSize={state.deckSize ?? 0}
          pileRef={deckPileRef}
          deckHovered={deckHovered && canShuffleIntoDeck}
          liftedCard={liftedCard}
          onDeckHover={canShuffleIntoDeck ? () => { setDeckHovered(true); emit('hover_deck', { hovering: true }) } : undefined}
          onDeckLeave={canShuffleIntoDeck ? () => { setDeckHovered(false); emit('hover_deck', { hovering: false }) } : undefined}
          onDeckClick={canShuffleIntoDeck ? handleShuffleIntoDeck : undefined}
          oppDeckHovered={oppDeckHovered}
        />
      </div>

      <div className="my-area">
        <div
          ref={ownHandAreaRef}
          onMouseEnter={(e) => {
            setHandHovered(true)
            emit('hand_hover_start')
            if (liftedCard && isMyTurn && inActions) {
              emit('hover_space', { row: null, lane: null })
              setBoardHoveredCell(null)
              const rect = ownHandAreaRef.current?.getBoundingClientRect()
              if (rect) {
                const relX = (e.clientX - rect.left) / rect.width
                const newIdx = Math.min(filteredHand.length, Math.max(0, Math.round(relX * filteredHand.length)))
                setHandInsertIndex(newIdx)
                // Emit full order (liftedCard included) THEN clear select_card_type —
                // opponent sees the card appear at the right slot without snapping
                const newOrder = [...filteredHand.slice(0, newIdx), liftedCard.card, ...filteredHand.slice(newIdx)]
                emit('hand_drag', { ids: newOrder.map(c => c.id) })
                emit('select_card_type', { cardType: null, cardId: null })
                insertRevealedRef.current = true
              }
            }
          }}
          onMouseLeave={() => {
            setHandHovered(false)
            emit('hand_hover_end')
            if (insertRevealedRef.current) {
              insertRevealedRef.current = false
              if (liftedCard) {
                // Card goes back to floating on board — restore original order and lifted state
                emit('hand_drag', { ids: (localHandOrder ?? myHand).map(c => c.id) })
                emit('select_card_type', { cardType: liftedCard.card.type, cardId: liftedCard.card.id })
              }
            }
            setHandInsertIndex(null)
          }}
          onMouseMove={liftedCard && isMyTurn && inActions ? (e) => {
            const rect = ownHandAreaRef.current?.getBoundingClientRect()
            if (rect) {
              const relX = (e.clientX - rect.left) / rect.width
              const newIdx = Math.min(filteredHand.length, Math.max(0, Math.round(relX * filteredHand.length)))
              if (newIdx !== handInsertIndex) {
                setHandInsertIndex(newIdx)
                // Emit full order with liftedCard at new position — opponent sees real-time movement
                const newOrder = [...filteredHand.slice(0, newIdx), liftedCard.card, ...filteredHand.slice(newIdx)]
                emit('hand_drag', { ids: newOrder.map(c => c.id) })
              }
            }
          } : undefined}
        >
          <Hand
            cards={displayHand}
            interceptedIds={state.interceptedCardIds}
            reactionIndices={reactionIndices}
            selectedIdx={handInsertIndex !== null ? handInsertIndex : undefined}
            onCardClick={reactionWindowMode ? handleReactionCardClick : (isMyTurn && inActions && (!localHandOrder || handInsertIndex !== null) ? handleCardClick : undefined)}
            onReorder={handInsertIndex === null ? (newCards => {
              setLocalHandOrder(newCards)
              emit('hand_drag', { ids: newCards.map(c => c.id) })
            }) : undefined}
            onDragEnd={handInsertIndex === null ? (finalCards => {
              emit('hand_reorder', { ids: finalCards.map(c => c.id) })
            }) : undefined}
          />
        </div>
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
              {/* Context controls */}
              {reactionWindowMode ? (
                <>
                  {reversalTargetMode
                    ? <span className="waiting-turn">Click a target on the board for Reversal…</span>
                    : <span className="waiting-turn">Click a highlighted card to react, or pass.</span>
                  }
                  {reversalTargetMode
                    ? <button className="btn-secondary" onClick={() => {
                        setReversalTargetMode(null)
                        emit('reversal_cancel')
                      }}>Cancel Reversal</button>
                    : <button className="btn-secondary" onClick={() => { emit('pass_reaction'); setReactionWindowMode(null) }}>Pass</button>
                  }
                  {!reversalTargetMode && <div className="auto-end-wrap" style={{ width: 'auto', minWidth: '80px' }}>
                    <div className="auto-end-track">
                      <div
                        className="auto-end-bar"
                        style={{
                          width: `${reactionPct}%`,
                          animation: 'none',
                          transition: 'none',
                        }}
                      />
                    </div>
                  </div>}
                </>
              ) : state?.reactionWindowOpen && isMyTurn ? (
                <span className="waiting-turn">Opponent is considering a reaction…</span>
              ) : (
                <>
                  {isMyTurn && inActions && liftedCard !== null && (INSTANT.has(liftedCard.card.type) || liftedCard.card.type === 'Purge') && (
                    <span className="waiting-turn">Click anywhere on the board to play {liftedCard.card.type}</span>
                  )}
                  {enslaveMode && (
                    <button className="btn-secondary" onClick={() => {
                      emit('enslave_response', { discard: true })
                      setEnslaveMode(null)
                      setFloatingPiece(null)
                      emit('select_card_type', { cardType: null, cardId: null })
                    }}>
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

              {/* Action circles */}
              {!reactionWindowMode && !enslaveMode && !bodyguardMode && !isGameOver && (
                <ActionDots
                  remaining={isMyTurn ? (state.actionsRemaining ?? 0) : (myWillBeDisrupted ? 1 : 2)}
                  total={isMyTurn ? actionsMax : 2}
                  disrupted={!isMyTurn && myWillBeDisrupted}
                />
              )}

              {!reactionWindowMode && !enslaveMode && !bodyguardMode && isMyTurn && inActions && (
                <button onClick={handleEndTurn}>End Turn</button>
              )}
            </>
          )}
        </div>
        {!isGameOver && (
          <button className="btn-secondary forfeit-btn" onClick={() => setForfeitConfirm(true)}>Forfeit</button>
        )}
      </div>

      {deckSlide && (
        <DeckSlide
          fromPos={deckSlide.fromPos}
          toPos={deckSlide.toPos}
          onDone={() => setDeckSlide(null)}
        />
      )}
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

// ── Action dots ────────────────────────────────────────────────────────────────

function ActionDots({ remaining, total, disrupted = false }) {
  return (
    <div className="action-dots">
      {Array.from({ length: total }).map((_, i) => {
        const cls = (disrupted && i === total - 1)
          ? 'dot-disrupted'
          : i < remaining ? 'dot-filled' : 'dot-empty'
        return <span key={i} className={`action-dot ${cls}`} title={disrupted && i === total - 1 ? 'Disrupted next turn' : undefined} />
      })}
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
