import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSocket, useSocket } from '../hooks/useSocket'
import { useEventQueue } from '../hooks/useEventQueue'
import Board from '../components/Board'
import Hand from '../components/Hand'
import GameInfo from '../components/GameInfo'
import DeckPile from '../components/DeckPile'
import DiscardPile from '../components/DiscardPile'
import ReturnSlide from '../components/ReturnSlide'
import FlightLayer, { FLIGHT_MS } from '../components/FlightLayer'
import CardFace from '../components/CardFace'
import CardDetails from '../components/CardDetails'
import Modal from '../components/Modal'
import RulesModal from '../components/RulesModal'
import { isValidMove, isValidAttack, isPinned, isFatigued } from '@checkline/engine'
import { getAttackRange } from '../utils/attackRange'
import { locateCards, planFlights } from '../utils/cardLocations'
import { describeAction } from '../utils/describeAction'
import { squareName } from '../utils/describe'
import '../styles/game.css'

const PLACEABLE   = new Set(['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen'])
const INSTANT     = new Set(['Command', 'Disrupt'])
const BUFF_TYPES  = new Set(['Enslave', 'Shield', 'Bodyguard', 'Protection'])
const DEBUFF_TYPES = new Set(['Pin', 'Fatigue', 'Silence'])
const CONTROL_CARD_TYPES = new Set(['Reposition', 'Swap', 'Dispel', 'Return'])

// Control cards wait on the "played" spot while the other player decides whether to react
const STAGED_CARD = {
  play_reposition: 'Reposition', play_swap: 'Swap', play_dispel: 'Dispel', play_return: 'Return', play_purge: 'Purge',
}

// Game events that wait their turn, so each change animates before the next one shows
const QUEUED_EVENTS = ['game_starting', 'state_update', 'reaction_window', 'reversal_cancelled', 'bodyguard_prompt', 'enslave_prompt']
// Pause between queued changes, so two in a row read as two
const STEP_GAP_MS = 150

function emit(event, payload) {
  getSocket().emit(event, payload)
}

// solo: playing the computer in the browser (see SoloGame); the player is always side 0
export default function Game({ solo = false }) {
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
  const [flights, setFlights]                    = useState([])
  const [drawBadges, setDrawBadges]              = useState([])
  // [{ key, n, left, top }] — "+2" shown over a hand that drew several cards at once
  // [{ key, id, from, to, look }] — cards flying from where they were to where they are now
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
  const [handInsertIndex, setHandInsertIndex]   = useState(null)
  // null | number — where to insert the lifted card when hovering back over hand

  const [reactionPct, setReactionPct] = useState(100)
  const [inspected, setInspected] = useState(null)
  // null | { type } for a hand card | { piece } for a board piece, shown in the details panel
  const [lastMove, setLastMove] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [gameOverSeen, setGameOverSeen] = useState(false)
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
  const gameRef           = useRef(null)
  const stageRef          = useRef(null)
  // What was on screen after the last render: card locations, card rects and zone rects
  const seenRef           = useRef({ cards: new Map(), rects: new Map(), zones: {} })
  const busyUntilRef      = useRef(0)      // when the current flights land
  const skipFlightsRef    = useRef(false)  // jump straight to the latest state, without flights
  const flightKeyRef      = useRef(0)

  const side = solo ? 0 : parseInt(localStorage.getItem('checkline_side') ?? '0')

  useEffect(() => {
    const token = localStorage.getItem('checkline_token')
    if (token) emit('reconnect', { token, code })
  }, [code])

  // ── Reaction timer visual countdown ───────────────────────────────
  useEffect(() => {
    if (!reactionWindowMode) return
    reactionTimerRef.current = {
      remainingMs: reactionWindowMode.ms,
      lastTime: Date.now(),
      totalMs: reactionWindowMode.ms,
    }
    const id = setInterval(() => {
      const ref = reactionTimerRef.current
      if (!ref) return
      const now = Date.now()
      const elapsed = now - ref.lastTime
      ref.remainingMs = Math.max(0, ref.remainingMs - elapsed)
      ref.lastTime = now
      setReactionPct(ref.remainingMs / ref.totalMs * 100)
    }, 50)
    // Runs when the window closes: stop the countdown and reset the bar for the next window
    return () => {
      clearInterval(id)
      reactionTimerRef.current = null
      setReactionPct(100)
    }
  }, [reactionWindowMode])

  const events = useEventQueue({
    game_starting:         ({ state }) => { setState(state); clearAll(); setLastMove(''); setGameOverSeen(false) },
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
      setState(s)
      if (lastAction) setLastMove(describeAction(lastAction, { before: state?.board, after: s.board, mySide: side, names: s.players.map(p => p.name) }))

      // Flash turn indicator when turn changes
      if (prevTurnRef.current !== null && prevTurnRef.current !== s.currentTurn) {
        setTurnFlash(true)
        setTimeout(() => setTurnFlash(false), 1400)
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
  }, QUEUED_EVENTS, busyUntilRef)
  useSocket(events.handlers)

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
          if (p && p.type !== 'King' && !p.buff && p.debuff?.type !== 'Silence')
            s.add(`${r},${l}`)
        } else if (type === 'debuff') {
          if (p && p.type !== 'King' && !p.debuff && p.buff?.type !== 'Protection')
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

  // The action waiting for a reaction, as this player knows it: { action, actorSide, cardId }
  const announced = useMemo(() => {
    if (!state) return null
    // Active player: show their own pending action immediately after emitting (before server confirms)
    if (myPendingAction && state.currentTurn === side) {
      const hand = state.players[side].hand
      const card = Number.isInteger(myPendingAction.cardIndex) && Array.isArray(hand) ? hand[myPendingAction.cardIndex] : null
      return { action: myPendingAction, actorSide: side, cardId: card?.id ?? null }
    }
    if (reactionWindowMode) {
      return { action: reactionWindowMode.action, actorSide: reactionWindowMode.actorSide ?? (1 - side), cardId: reactionWindowMode.action.cardId ?? null }
    }
    return null
  }, [reactionWindowMode, myPendingAction, state, side])

  const previewBoard = useMemo(() => {
    if (!state || !announced) return null
    return computePreviewBoard(state.board, announced.action, announced.actorSide, announced.cardId)
  }, [announced, state])

  // While the other player may react, a played card is shown off the hand: placed pieces,
  // Buffs and Debuffs on the preview board, and control cards on the "played" spot
  const announcedCardId = useMemo(() => {
    if (!state?.reactionWindowOpen || announced?.cardId == null) return null
    const hand = state.players[announced.actorSide].hand
    const ids = Array.isArray(hand) ? hand.map(c => c.id) : (hand.ids ?? [])
    return ids.includes(announced.cardId) ? announced.cardId : null
  }, [state, announced])
  const stagedCard = announcedCardId != null && STAGED_CARD[announced.action.type]
    ? { id: announcedCardId, type: STAGED_CARD[announced.action.type], actorSide: announced.actorSide }
    : null

  // Where every card is on screen, for the flight animations
  const shownCards = useMemo(() => {
    if (!state || state.phase === 'mulligan') return null
    const hands = state.players.map(p => {
      const cards = Array.isArray(p.hand) ? p.hand : (p.hand.ids ?? [])
      return cards.filter(c => (c.id ?? c) !== announcedCardId)
    })
    return locateCards({ board: previewBoard ?? state.board, hands, discard: state.discardPile ?? [], stage: stagedCard })
  }, [state, previewBoard, announcedCardId, stagedCard?.id, stagedCard?.type]) // eslint-disable-line react-hooks/exhaustive-deps

  // Animate every card that changed place since the last render (the FLIP technique: the
  // screen is already showing the new state; each moved card gets a ghost that flies from
  // its old position to the new one while the real card waits hidden). Then record where
  // everything is, ready for the next change. It runs after every render on purpose, so the
  // measurements are always fresh; it only sets state when the cards have actually moved.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const seen = seenRef.current
    const root = gameRef.current
    if (!root || !shownCards) {
      seen.cards = new Map()
      return
    }

    if (shownCards !== seen.cards) {
      const zonesNow = measureZones(zoneEls())
      const myTurn = state.currentTurn === side
      const made = skipFlightsRef.current ? [] : planFlights(seen.cards, shownCards)
        // The player already saw their own plays and moves happen under their cursor
        .filter(f => !(f.from.zone === 'hand' && f.from.side === side && f.to.zone !== 'hand'))
        .filter(f => !(f.from.zone === 'board' && f.to.zone === 'board' && myTurn))
        .map(f => {
          const from = seen.rects.get(f.id) ?? seen.zones[zoneKey(f.from)]
          const to = rectOf(root, f.id) ?? zonesNow[zoneKey(f.to)]
          if (!from || !to) return null
          const type = f.to.type ?? f.from.type
          const look = f.from.zone === 'board'
            ? { kind: 'piece', piece: { type: f.from.type, owner: f.from.owner } }
            : { kind: 'card', type, faceUp: !!type && f.to.zone !== 'deck' && !(f.to.zone === 'hand' && f.to.side !== side) }
          const drawnBy = f.from.zone === 'deck' && f.to.zone === 'hand' ? f.to.side : null
          return { key: ++flightKeyRef.current, id: f.id, from, to, look, drawnBy }
        })
        .filter(Boolean)
      skipFlightsRef.current = false
      seen.cards = shownCards
      if (made.length > 0) {
        busyUntilRef.current = Date.now() + FLIGHT_MS + STEP_GAP_MS
        setFlights(prev => [...prev, ...made])
      }

      // Several cards drawn at once (a sacrificed Knight or Queen) get a count over the hand
      for (const handSide of [0, 1]) {
        const n = made.filter(f => f.drawnBy === handSide).length
        const hand = zonesNow[`hand-${handSide}`]
        if (n > 1 && hand) {
          const badge = { key: ++flightKeyRef.current, n, left: hand.left + hand.width / 2, top: hand.top + hand.height / 2 }
          setDrawBadges(prev => [...prev, badge])
          setTimeout(() => setDrawBadges(prev => prev.filter(b => b.key !== badge.key)), 1600)
        }
      }
    }

    seen.rects = new Map([...root.querySelectorAll('[data-fly]')].map(el => [el.dataset.fly, rectFrom(el)]))
    seen.zones = measureZones(zoneEls())

    function zoneEls() {
      return {
        [`hand-${side}`]: ownHandAreaRef.current,
        [`hand-${1 - side}`]: oppHandAreaRef.current,
        deck: deckPileRef.current?.querySelector('.pile-stack') ?? deckPileRef.current,
        discard: discardPileRef.current?.querySelector('.pile-stack') ?? discardPileRef.current,
        stage: stageRef.current,
        ...Object.fromEntries(Object.entries(boardSpaceRefs.current).map(([sq, el]) => [`sq-${sq}`, el])),
      }
    }
  })

  // Tapping or clicking while changes are still queued or flying jumps to the latest state,
  // so the player is never made to wait and never acts on an out-of-date board
  function skipAhead() {
    const handled = events.flush()
    if (handled > 0) skipFlightsRef.current = true
    if (handled > 0 || flights.length > 0) {
      setFlights([])
      busyUntilRef.current = 0
    }
  }

  if (!state) return <div className="game-loading">Connecting…</div>

  if (state.phase === 'mulligan') return <Mulligan state={state} side={side} />

  const me          = state.players[side]
  const opponent    = state.players[1 - side]
  const myHand      = Array.isArray(me.hand) ? me.hand : []
  const filteredHand = (localHandOrder ?? myHand).filter(c => (!liftedCard || c.id !== liftedCard.card.id) && c.id !== announcedCardId)
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
    count: oppCount - (oppSelectedCardType ? 1 : 0) - (announcedCardId != null && announced?.actorSide !== side ? 1 : 0),
    ids: activeOppIds
      ? activeOppIds.filter(id => id !== oppLiftedCardId && id !== announcedCardId)
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

  const canCycleViaDiscard  = isMyTurn && inActions && liftedCard !== null && !reactionWindowMode && !enslaveMode && !bodyguardMode && state.actionsRemaining > 0
  const canShuffleIntoDeck  = isMyTurn && inActions && liftedCard !== null && !reactionWindowMode && !enslaveMode && !bodyguardMode
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

    const serverIdx = myHand.findIndex(c => c.id === card.id)

    if (liftedCard) {
      // Switching cards: commit the old card back into the hand, show new card selected in-hand
      if (handInsertIndex !== null) {
        const newOrder = [...displayHand]
        setLocalHandOrder(newOrder)
        emit('hand_reorder', { ids: newOrder.map(c => c.id) })
      }
      setLiftedCard({ card, serverIdx })
      setHandInsertIndex(null)
      insertRevealedRef.current = false
      emit('select_card_type', { cardType: card.type, cardId: card.id })
    } else {
      // Normal initial selection: card floats (no insert mode yet)
      setLiftedCard({ card, serverIdx })
      emit('select_card_type', { cardType: card.type, cardId: card.id })
    }
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

      function shake(msg) {
        setErrorMsg(msg); setIsShaking(true)
        setTimeout(() => setErrorMsg(''), 3000)
        setTimeout(() => setIsShaking(false), 420)
      }

      if (type === 'buff') {
        if (piece && piece.type !== 'King' && !piece.buff && piece.debuff?.type !== 'Silence') {
          emitAction({ type: 'play_buff', cardIndex: serverIdx, targetRow: row, targetLane: lane },
            { effectType: card?.type, targetType: piece?.type })
          clearAll()
        } else {
          shake('Invalid buff target.')
        }
        return
      }

      if (type === 'debuff') {
        if (piece && piece.type !== 'King' && !piece.debuff && piece.buff?.type !== 'Protection') {
          emitAction({ type: 'play_debuff', cardIndex: serverIdx, targetRow: row, targetLane: lane },
            { effectType: card?.type, targetType: piece?.type })
          clearAll()
        } else {
          shake('Invalid debuff target.')
        }
        return
      }

      if (type === 'return') {
        if (piece?.owner === side && piece.type !== 'King') {
          emitAction({ type: 'play_return', cardIndex: serverIdx, pieceRow: row, pieceLane: lane },
            { pieceType: piece?.type })
          clearAll()
        } else {
          shake('Invalid target.')
        }
        return
      }

      if (type === 'dispel') {
        if (piece && (piece.buff || piece.debuff)) {
          const which = (piece.buff && piece.debuff) ? 'buff' : (piece.buff ? 'buff' : 'debuff')
          emitAction({ type: 'play_dispel', cardIndex: serverIdx, targetRow: row, targetLane: lane, which },
            { targetType: piece?.type })
          clearAll()
        } else {
          shake('No buff or debuff to dispel there.')
        }
        return
      }

      if (type === 'reposition') {
        if (step === 1) {
          if (piece?.owner === side && piece.debuff?.type !== 'Pin')
            setTargetMode({ ...targetMode, step: 2, firstPiece: { row, lane } })
          else shake('Select one of your non-pinned pieces.')
        } else {
          const ownRows = side === 0 ? [0, 1] : [2, 3]
          if (!piece && ownRows.includes(row)) {
            const fp = state.board[firstPiece.row]?.[firstPiece.lane]
            emitAction({ type: 'play_reposition', cardIndex: serverIdx, pieceRow: firstPiece.row, pieceLane: firstPiece.lane, toRow: row, toLane: lane },
              { pieceType: fp?.type })
            clearAll()
          } else {
            shake('Choose an empty space on your side.')
          }
        }
        return
      }

      if (type === 'swap') {
        if (step === 1) {
          if (piece?.owner === side && piece.debuff?.type !== 'Pin')
            setTargetMode({ ...targetMode, step: 2, firstPiece: { row, lane } })
          else shake('Select one of your non-pinned pieces.')
        } else {
          if (piece?.owner === side && piece.debuff?.type !== 'Pin' &&
              !(row === firstPiece.row && lane === firstPiece.lane)) {
            emitAction({ type: 'play_swap', cardIndex: serverIdx, aRow: firstPiece.row, aLane: firstPiece.lane, bRow: row, bLane: lane })
            clearAll()
          } else {
            shake('Choose a different non-pinned piece to swap.')
          }
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
        const ownRows = side === 0 ? [0, 1] : [2, 3]
        if (piece) {
          setErrorMsg('That space is occupied.')
          setIsShaking(true)
          setTimeout(() => setErrorMsg(''), 3000)
          setTimeout(() => setIsShaking(false), 420)
          return
        } else if (!ownRows.includes(row)) {
          setErrorMsg('Can only place on your own side.')
          setIsShaking(true)
          setTimeout(() => setErrorMsg(''), 3000)
          setTimeout(() => setIsShaking(false), 420)
          return
        } else {
          emitAction({ type: 'place', cardIndex: liftedCard.serverIdx, row, lane }, { pieceType: card.type })
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

  const opponentName = opponent.name
  // Only highlight the status bar when there's a real choice to make
  const promptActive = !!((reactionWindowMode && reactionIndices.size > 0) || bodyguardMode || enslaveMode)
  const detailsPiece = inspected?.piece ?? (!inspected && selectedPiece ? state.board[selectedPiece.row]?.[selectedPiece.lane] : null)
  const detailsType = inspected?.type ?? (!inspected?.piece && liftedCard ? liftedCard.card.type : null)

  const gameOverReason = !isGameOver ? '' : state.endReason === 'forfeit'
    ? `${state.players[1 - state.winner].name} forfeited.`
    : iWon ? `${opponentName}'s King was still in check at the end of their turn.` : 'Your King was still in check at the end of your turn.'

  // What the status bar under the board says and offers, depending on the situation
  function renderStatus() {
    if (isGameOver) {
      return (
        <>
          <span className="status-text"><strong>{iWon ? 'You win.' : 'You lose.'}</strong> {gameOverReason}</span>
          <button className="status-btn" onClick={() => emit('play_again_vote', { vote: !iVoted })}>{iVoted ? 'Cancel rematch' : 'Play again'}</button>
          <button className="status-btn btn-secondary" onClick={() => navigate('/')}>Home</button>
        </>
      )
    }
    if (reversalTargetMode) {
      return (
        <>
          <span className="status-text"><strong>Reversal:</strong> choose a new target for the {reactionWindowMode?.action?.effectType ?? 'card'}.</span>
          <button className="status-btn btn-secondary" onClick={() => { setReversalTargetMode(null); emit('reversal_cancel') }}>Cancel</button>
        </>
      )
    }
    if (reactionWindowMode) {
      // Say plainly when there's nothing in your hand that can answer this action
      const canReact = reactionIndices.size > 0
      return (
        <>
          <span className="status-text">
            <strong>{opponentName} is {richActionLabel(reactionWindowMode.action, state.board, side)}.</strong>{' '}
            {canReact
              ? 'React with a glowing card, or let it happen.'
              : 'You have no card that can react to this.'}
          </span>
          <span className="status-timer" role="img" aria-label="Time left to react"><span style={{ width: `${reactionPct}%` }} /></span>
          <button className="status-btn btn-secondary" onClick={() => { emit('pass_reaction'); setReactionWindowMode(null) }}>
            {canReact ? 'Let it happen' : 'Continue'}
          </button>
        </>
      )
    }
    if (bodyguardMode) {
      return (
        <>
          <span className="status-text">
            <strong>Your {bodyguardMode.targetType} is under attack.</strong>{' '}
            {bodyguardMode.isKingAttack ? 'Choose a Bodyguard to sacrifice.' : 'Choose a Bodyguard to sacrifice, or let it be taken.'}
          </span>
          {!bodyguardMode.isKingAttack && (
            <button className="status-btn btn-secondary" onClick={() => { emit('bodyguard_response', { decline: true }); setBodyguardMode(null) }}>Let it be taken</button>
          )}
        </>
      )
    }
    if (enslaveMode) {
      return (
        <>
          <span className="status-text"><strong>Enslave:</strong> choose a square on your side for the captured {enslaveMode.pieceType}.</span>
          <button className="status-btn btn-secondary" onClick={() => {
            emit('enslave_response', { discard: true })
            setEnslaveMode(null)
            setFloatingPiece(null)
            emit('select_card_type', { cardType: null, cardId: null })
          }}>Discard it</button>
        </>
      )
    }
    if (state.reactionWindowOpen && isMyTurn) {
      return <span className="status-text">Waiting to see if {opponentName} reacts…</span>
    }
    if (!isMyTurn) {
      return <span className="status-text">{inDiscard ? `${opponentName} is discarding…` : `${opponentName} is taking their turn…`}</span>
    }
    if (liftedCard) {
      const type = liftedCard.card.type
      const needsNoTarget = INSTANT.has(type) || type === 'Purge'
      return (
        <>
          <span className="status-text">
            <strong>{type}:</strong> {needsNoTarget ? 'click the board to play it.' : PLACEABLE.has(type) ? 'choose a square on your side.' : 'choose a highlighted target.'}
          </span>
          {canCycleViaDiscard && <button className="status-btn btn-secondary" onClick={handleCycle}>Cycle it</button>}
          <button className="status-btn btn-secondary" onClick={clearAll}>Cancel</button>
        </>
      )
    }
    if (selectedPiece) {
      return (
        <>
          <span className="status-text"><strong>{selectedPieceType}:</strong> move to a gold square or attack a red one.</span>
          {canSacrifice && <button className="status-btn btn-secondary" onClick={handleSacrifice}>Sacrifice</button>}
          <button className="status-btn btn-secondary" onClick={() => { clearAll(); setPiece(null) }}>Cancel</button>
        </>
      )
    }
    if (state.inCheck?.[side]) {
      return <span className="status-text"><strong>Check:</strong> move your King, block, or take the attacker before your turn ends.</span>
    }
    return <span className="status-text">Your turn: choose a card or one of your pieces.</span>
  }

  return (
    <div className={`game${turnFlash && isMyTurn ? ' my-turn-start' : ''}`} ref={gameRef} onPointerDownCapture={skipAhead}>
      {forfeitConfirm && (
        <Modal title="Forfeit the game?" onClose={() => setForfeitConfirm(false)}>
          <p className="modal-body">{opponentName} will win this game.</p>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setForfeitConfirm(false)}>Keep playing</button>
            <button className="btn-danger" onClick={() => { emit('forfeit'); setForfeitConfirm(false) }}>Forfeit</button>
          </div>
        </Modal>
      )}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {isGameOver && !gameOverSeen && (
        <Modal title={iWon ? 'You win!' : 'You lose'} onClose={() => setGameOverSeen(true)} className="game-over-dialog">
          <p className="modal-body">{gameOverReason}</p>
          {playAgainVotes.length > 0 && !iVoted && <p className="modal-body">{opponentName} wants a rematch.</p>}
          <div className="modal-actions modal-actions-stack">
            <button onClick={() => emit('play_again_vote', { vote: !iVoted })}>{iVoted ? `Waiting for ${opponentName}… (cancel)` : 'Play again'}</button>
            <button className="btn-secondary" onClick={() => navigate('/')}>Back to home</button>
            <button className="btn-link" onClick={() => setGameOverSeen(true)}>See the board</button>
          </div>
        </Modal>
      )}

      <GameInfo
        state={state}
        side={side}
        turnFlash={turnFlash}
        myWillBeDisrupted={myWillBeDisrupted}
        oppWillBeDisrupted={oppWillBeDisrupted}
        opponentHand={(
          <div className="opponent-area" ref={oppHandAreaRef}>
            <Hand cards={displayOppHand} faceDown />
          </div>
        )}
      />

      {returnSlide && (
        <ReturnSlide
          piece={returnSlide.piece}
          fromPos={returnSlide.fromPos}
          toPos={returnSlide.toPos}
          isOwn={returnSlide.isOwn}
          onDone={() => { setReturnSlide(null); setFloatingPiece(null) }}
        />
      )}

      <div className="game-main">
        <div className="game-piles">
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
          {stagedCard && (
            <div className="pile-area played-spot" ref={stageRef}>
              <span className="pile-label">{stagedCard.actorSide === side ? 'You play' : `${opponentName} plays`}</span>
              <div className="card pile-card played-card" data-fly={stagedCard.id}>
                <CardFace type={stagedCard.type} compact />
              </div>
            </div>
          )}
        </div>

        <div className="game-board-col">
          <div className="table-frame">
            <div className="table-felt">
              <Board
                board={previewBoard ?? state.board}
                side={side}
                isMyTurn={isMyTurn}
                selectedPiece={selectedPiece}
                placingCard={liftedCard !== null && PLACEABLE.has(liftedCard.card.type)}
                validMoves={validMoves}
                validAttacks={validAttacks}
                attackRange={attackRange}
                cardTargets={enslaveTargets ?? bodyguardTargets ?? reversalTargets ?? cardTargets}
                underAttack={bodyguardMode ? `${bodyguardMode.targetRow},${bodyguardMode.targetLane}` : null}
                inCheck={state.inCheck}
                onSpaceClick={!isGameOver && (enslaveMode || bodyguardMode || reversalTargetMode || (isMyTurn && inActions)) ? handleSpaceClick : undefined}
                onInspect={piece => setInspected({ piece })}
                spaceRefCallback={(r, l, el) => { boardSpaceRefs.current[`${r},${l}`] = el }}
                onSpaceMouseEnter={handleSpaceMouseEnter}
                onBoardMouseLeave={handleBoardMouseLeave}
                floatingPiece={floatingPiece}
                boardHoveredCell={boardHoveredCell}
                handFloatingCard={handFloatingCard}
                oppSelectedPiece={oppSelectedPiece}
                oppHoveredCell={(oppDiscardHovered || oppDeckHovered) ? null : oppHoveredCell}
                oppSelectedCardType={oppSelectedCardType}
                oppLiftedCardId={oppLiftedCardId}
                confirmTarget={confirmTarget}
                isShaking={isShaking}
                errorTip={errorMsg}
              />
            </div>
          </div>
          <div className={`status-bar${promptActive ? ' status-bar-prompt' : ''}`} role="status" aria-live="polite">
            {renderStatus()}
          </div>
          {errorMsg && <p className="visually-hidden" role="alert">{errorMsg}</p>}
        </div>

        <aside className="game-side" aria-label="Card details">
          <CardDetails type={detailsType} piece={detailsPiece} />
          <div className="game-side-footer">
            {lastMove && <p className="last-move"><strong>Last move:</strong> {lastMove}</p>}
            {!isGameOver && isMyTurn && inActions && !promptActive && (
              <button className="end-turn-btn" onClick={handleEndTurn}>End turn</button>
            )}
            <div className="game-side-links">
              <button className="btn-link" onClick={() => setRulesOpen(true)}>Rules</button>
              {!isGameOver && <button className="btn-link" onClick={() => setForfeitConfirm(true)}>Forfeit</button>}
            </div>
          </div>
        </aside>
      </div>

      <div
        className="game-hand"
        ref={ownHandAreaRef}
        onMouseEnter={(e) => {
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
          onCardClick={reactionWindowMode ? handleReactionCardClick : (isMyTurn && inActions ? handleCardClick : undefined)}
          onInspect={type => setInspected({ type })}
          onReorder={handInsertIndex === null ? (newCards => {
            setLocalHandOrder(newCards)
            emit('hand_drag', { ids: newCards.map(c => c.id) })
          }) : undefined}
          onDragEnd={handInsertIndex === null ? (finalCards => {
            emit('hand_reorder', { ids: finalCards.map(c => c.id) })
          }) : undefined}
        />
      </div>

      <FlightLayer flights={flights} mySide={side} onLanded={key => setFlights(prev => prev.filter(f => f.key !== key))} />
      {drawBadges.map(b => (
        <span key={b.key} className="draw-badge" style={{ left: b.left, top: b.top }} aria-hidden="true">+{b.n}</span>
      ))}
    </div>
  )
}

// What the opponent is doing while you may react, e.g. "attacking your Knight on b2 with their Rook on b4"
function richActionLabel(action, board, mySide) {
  if (!action) return 'acting'
  const { type, pieceType, effectType } = action
  const at = (row, lane) => (row != null ? board?.[row]?.[lane] : null)
  const on = (row, lane) => (row != null ? ` on ${squareName(row, lane)}` : '')
  const named = (piece, fallback = 'piece') => `${piece ? (piece.owner === mySide ? 'your' : 'their') : 'a'} ${piece?.type ?? fallback}`
  switch (type) {
    case 'place':            return `placing a ${pieceType ?? 'piece'}${on(action.row, action.lane)}`
    case 'direct_move':      return `moving their ${pieceType ?? 'piece'} ${squareName(action.row, action.lane)} → ${squareName(action.toRow, action.toLane)}`
    case 'direct_attack':    return `attacking ${named(at(action.targetRow, action.targetLane))}${on(action.targetRow, action.targetLane)} with their ${pieceType ?? 'piece'}${on(action.row, action.lane)}`
    case 'direct_sacrifice': return `sacrificing their ${pieceType ?? 'piece'}${on(action.row, action.lane)}`
    case 'play_buff':
    case 'play_debuff':      return `putting ${effectType ?? (type === 'play_buff' ? 'a Buff' : 'a Debuff')} on ${named(at(action.targetRow, action.targetLane))}${on(action.targetRow, action.targetLane)}`
    case 'play_reposition':  return `repositioning their ${pieceType ?? 'piece'} ${squareName(action.pieceRow, action.pieceLane)} → ${squareName(action.toRow, action.toLane)}`
    case 'play_swap':        return `swapping ${named(at(action.aRow, action.aLane))}${on(action.aRow, action.aLane)} with ${named(at(action.bRow, action.bLane))}${on(action.bRow, action.bLane)}`
    case 'play_dispel':      return `dispelling ${named(at(action.targetRow, action.targetLane))}${on(action.targetRow, action.targetLane)}`
    case 'play_return':      return `returning their ${pieceType ?? 'piece'}${on(action.pieceRow, action.pieceLane)} to hand`
    case 'play_purge':       return 'playing Purge, clearing every Buff and Debuff'
    case 'play_command':     return 'playing Command for an extra action'
    case 'play_disrupt':     return 'playing Disrupt, so you lose an action next turn'
    default:                 return type
  }
}

// ── Flight helpers ─────────────────────────────────────────────────────────────

function rectFrom(el) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
}

function measureZones(els) {
  return Object.fromEntries(Object.entries(els).map(([key, el]) => [key, rectFrom(el)]))
}

function rectOf(root, id) {
  return rectFrom(root.querySelector(`[data-fly="${id}"]`))
}

// The fallback spot for a card with no element of its own there (the deck, a hidden hand card)
function zoneKey(loc) {
  if (loc.zone === 'hand') return `hand-${loc.side}`
  if (loc.zone === 'board' || loc.zone === 'status') return `sq-${loc.square}`
  return loc.zone
}

// cardId: the played card, so a placed piece or a Buff keeps the id it will have for real
function computePreviewBoard(board, action, actorSide, cardId = null) {
  if (!action || !board) return null
  const b = board.map(r => [...r])
  switch (action.type) {
    case 'place':
      if (action.pieceType != null && action.row != null && b[action.row]?.[action.lane] === null)
        b[action.row][action.lane] = { id: cardId ?? undefined, type: action.pieceType, owner: actorSide, buff: null, debuff: null, canActThisTurn: false }
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
      if (p && action.effectType) b[action.targetRow][action.targetLane] = { ...p, buff: { type: action.effectType, id: cardId ?? undefined } }
      break
    }
    case 'play_debuff': {
      const p = b[action.targetRow]?.[action.targetLane]
      if (p && action.effectType) b[action.targetRow][action.targetLane] = { ...p, debuff: { type: action.effectType, id: cardId ?? undefined } }
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
