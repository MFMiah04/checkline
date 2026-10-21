// The public game API: start a game, apply what a player does, and handle timeouts.
// Everything here is pure: the state passed in is never changed, and randomness is an input.
import {
  applyBuff, applyCommandEffect, applyCycle, applyDebuff, applyDirectAttack, applyDirectMove,
  applyDirectSacrifice, applyDispel, applyDisruptEffect, applyPlace, applyPurge, applyReposition,
  applyReturn, applySwap, capture, discardToken, playFreeCard, type ActionResult,
} from './actions.js'
import { createDeck, drawCard } from './deck.js'
import {
  findKing, hasBodyguardAdjacentToKing, inBounds, isCheckRemovalAction, isInCheck,
  isValidBuffTarget, isValidDebuffTarget,
} from './rules.js'
import { lastAction, type GameState, type LastAction, type PendingReaction, type RevealedAction } from './state.js'
import type { Action, Board, Card, Piece, Random, Side } from './types.js'

// ── Inputs ────────────────────────────────────────────────────────────────────

export type PlayerAction =
  | { type: 'mulligan'; discardIndices: number[] }
  | Action
  | { type: 'react'; cardIndex: number; targetRow?: number; targetLane?: number }
  | { type: 'pass_reaction' }
  | { type: 'choose_bodyguard'; row: number; lane: number }
  | { type: 'decline_bodyguard' }
  | { type: 'place_enslaved'; row: number; lane: number }
  | { type: 'discard_enslaved' }
  | { type: 'forfeit' }

// ── Results ───────────────────────────────────────────────────────────────────

// One visible change. A single input can produce several, e.g. an action followed by the
// automatic end of turn, and clients animate each one in order.
export interface Step {
  state: GameState
  lastAction: LastAction | null
}

export type GameResult = { state: GameState; steps: Step[] } | { error: string }

// Collects steps while an input is being applied
class Recorder {
  readonly steps: Step[] = []
  constructor(readonly state: GameState) {}
  record(la: LastAction | null): void {
    this.steps.push({ state: structuredClone(this.state), lastAction: la })
  }
  result(): GameResult {
    return { state: this.state, steps: this.steps }
  }
}

const CARD_ACTIONS: ReadonlySet<string> = new Set([
  'place', 'play_buff', 'play_debuff', 'play_reposition', 'play_swap', 'play_dispel', 'play_return', 'play_purge',
])
const DIRECT_ACTIONS: ReadonlySet<string> = new Set(['direct_move', 'direct_attack', 'direct_sacrifice'])

// ── New game ──────────────────────────────────────────────────────────────────

export function newGame(random: Random): GameState {
  const deck = createDeck(random)
  const discardPile: Card[] = []
  const hands: [Card[], Card[]] = [[], []]
  for (const hand of hands) {
    for (let i = 0; i < 5; i++) {
      const card = drawCard(deck, discardPile, random)
      if (card) hand.push(card)
    }
  }

  const board: Board = Array.from({ length: 4 }, () => Array<Piece | null>(5).fill(null))
  board[0][2] = { type: 'King', owner: 0, buff: null, debuff: null, firstStatus: null, canActThisTurn: false }
  board[3][2] = { type: 'King', owner: 1, buff: null, debuff: null, firstStatus: null, canActThisTurn: false }

  return {
    phase: 'mulligan',
    turnPhase: 'actions',
    currentTurn: random() < 0.5 ? 0 : 1,
    actionsRemaining: 2,
    actionsMax: 2,
    commandUsedThisTurn: false,
    disruptUsedThisTurn: false,
    disruptNextTurn: false,
    interceptedCardIds: [],
    board,
    deck,
    discardPile,
    players: [{ hand: hands[0], mulliganDone: false }, { hand: hands[1], mulliganDone: false }],
    pending: null,
    winner: null,
    endReason: null,
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function applyPlayerAction(state: GameState, side: Side, input: PlayerAction, random: Random): GameResult {
  const rec = new Recorder(structuredClone(state))
  const s = rec.state

  switch (input.type) {
    case 'mulligan':          return mulligan(rec, side, input.discardIndices, random)
    case 'react':             return react(rec, side, input, random)
    case 'pass_reaction':     return passReaction(rec, side, random)
    case 'choose_bodyguard':  return chooseBodyguard(rec, side, input.row, input.lane, random)
    case 'decline_bodyguard': return declineBodyguard(rec, side, random)
    case 'place_enslaved':    return placeEnslaved(rec, side, input.row, input.lane, random)
    case 'discard_enslaved':  return discardEnslaved(rec, side, random)
    case 'forfeit': {
      if (s.phase !== 'playing') return { error: 'Game not in progress.' }
      endGame(s, (1 - side) as Side, 'forfeit')
      rec.record(null)
      return rec.result()
    }
    default:
      return submitTurnAction(rec, side, input, random)
  }
}

// What happens when a timed decision runs out: reactions pass, and a Bodyguard is
// declined unless the King was attacked, in which case the first Bodyguard is used.
export function resolveTimeout(state: GameState, random: Random): GameResult {
  const pending = state.pending
  if (!pending) return { error: 'Nothing is waiting for a response.' }
  if (pending.kind === 'reaction') return applyPlayerAction(state, (1 - pending.actorSide) as Side, { type: 'pass_reaction' }, random)
  if (pending.kind === 'bodyguard') {
    const defender = (1 - pending.attackerSide) as Side
    if (!pending.isKingAttack) return applyPlayerAction(state, defender, { type: 'decline_bodyguard' }, random)
    const rec = new Recorder(structuredClone(state))
    const first = pending.options[0]!
    sacrificeBodyguard(rec.state, first.row, first.lane)
    rec.record(lastAction('bodyguard_save', defender, { auto: true }))
    advance(rec, random)
    return rec.result()
  }
  return { error: 'Enslave placement has no time limit.' }
}

// Reorders a player's hand (cosmetic, allowed at any time)
export function reorderHand(state: GameState, side: Side, ids: unknown): GameState | null {
  const hand = state.players[side].hand
  if (!Array.isArray(ids) || ids.length !== hand.length) return null
  const byId = new Map(hand.map(c => [c.id, c]))
  if (!ids.every(id => byId.has(id)) || new Set(ids).size !== ids.length) return null
  const next = structuredClone(state)
  next.players[side].hand = ids.map(id => structuredClone(byId.get(id)!))
  return next
}

// ── Mulligan ──────────────────────────────────────────────────────────────────

function mulligan(rec: Recorder, side: Side, discardIndices: unknown, random: Random): GameResult {
  const s = rec.state
  const player = s.players[side]
  if (s.phase !== 'mulligan') return { error: 'Not in the mulligan phase.' }
  if (player.mulliganDone) return { error: 'Mulligan already done.' }

  const indices = [...new Set(
    (Array.isArray(discardIndices) ? discardIndices : [])
      .filter((i): i is number => Number.isInteger(i) && i >= 0 && i < player.hand.length),
  )].sort((a, b) => b - a)  // descending so splices don't shift later indices

  const removed = indices.map(i => player.hand.splice(i, 1)[0]!)
  s.discardPile.push(...removed)
  for (let i = 0; i < removed.length; i++) {
    const card = drawCard(s.deck, s.discardPile, random)
    if (card) player.hand.push(card)
  }
  player.mulliganDone = true
  rec.record(null)

  if (s.players.every(p => p.mulliganDone)) {
    startTurn(s, random)
    rec.record(null)
  }
  return rec.result()
}

// ── Turn actions ──────────────────────────────────────────────────────────────

function submitTurnAction(rec: Recorder, side: Side, action: Action, random: Random): GameResult {
  const s = rec.state
  if (s.phase !== 'playing') return { error: 'Game not in progress.' }
  if (side !== s.currentTurn) return { error: 'Not your turn.' }
  if (s.pending) return { error: 'Waiting for a response.' }
  if (s.turnPhase === 'discard' && action.type !== 'end_turn') return { error: 'Discard down to 5 cards first.' }

  const isFree = action.type === 'play_command' || action.type === 'play_disrupt'
  if (!isFree && action.type !== 'end_turn' && s.actionsRemaining <= 0) return { error: 'No actions remaining.' }

  // Actions that resolve immediately and cannot be reacted to
  if (action.type === 'cycle') {
    const result = applyCycle(s, side, action, random)
    if ('error' in result) return result
    rec.record(result.lastAction)
    advance(rec, random)
    return rec.result()
  }
  if (action.type === 'end_turn') {
    const result = endTurn(s, side, action.discardIndices, random)
    if ('error' in result) return result
    rec.record(result.lastAction)
    return rec.result()
  }

  // Command and Disrupt leave the hand when played; their effect waits for the reaction window
  if (action.type === 'play_command' || action.type === 'play_disrupt') {
    const error = playFreeCard(s, side, action.cardIndex, action.type === 'play_command' ? 'Command' : 'Disrupt')
    if (error) return error
    s.pending = { kind: 'reaction', action, actorSide: side, cardId: null, revealed: {} }
    rec.record(null)
    return rec.result()
  }

  // Cards locked by Intercept can't be played again this turn
  const hand = s.players[side].hand
  const card = 'cardIndex' in action ? hand[action.cardIndex] : undefined
  if (card && CARD_ACTIONS.has(action.type) && s.interceptedCardIds.includes(card.id))
    return { error: 'That card was intercepted — you cannot play it again this turn.' }

  // Check the action is legal before announcing it, by trying it on a copy
  const trial = resolveTurnAction(structuredClone(s), side, action, random)
  if ('error' in trial) return trial

  const pending: PendingReaction = {
    kind: 'reaction', action, actorSide: side,
    cardId: card && CARD_ACTIONS.has(action.type) ? card.id : null,
    revealed: describeAction(s, side, action),
  }

  // Actions that take the King out of check cannot be reacted to
  if (isCheckRemovalAction(s, action)) {
    s.pending = pending
    resolvePending(rec, null, random)
    return rec.result()
  }

  s.pending = pending
  rec.record(null)
  return rec.result()
}

function resolveTurnAction(s: GameState, side: Side, action: Action, random: Random): ActionResult {
  switch (action.type) {
    case 'place':            return applyPlace(s, side, action)
    case 'direct_move':      return applyDirectMove(s, side, action)
    case 'direct_attack':    return applyDirectAttack(s, side, action)
    case 'direct_sacrifice': return applyDirectSacrifice(s, side, action, random)
    case 'play_buff':        return applyBuff(s, side, action)
    case 'play_debuff':      return applyDebuff(s, side, action)
    case 'play_reposition':  return applyReposition(s, side, action)
    case 'play_swap':        return applySwap(s, side, action)
    case 'play_dispel':      return applyDispel(s, side, action)
    case 'play_return':      return applyReturn(s, side, action)
    case 'play_purge':       return applyPurge(s, side, action)
    case 'play_command':     return applyCommandEffect(s, side, action.cardIndex)
    case 'play_disrupt':     return applyDisruptEffect(s, side, action.cardIndex)
    default:                 return { error: 'Unknown action.' }
  }
}

// Details the opponent sees when an action is announced
function describeAction(s: GameState, side: Side, action: Action): RevealedAction {
  const at = (row: number, lane: number) => s.board[row]?.[lane] ?? null
  const card = 'cardIndex' in action ? s.players[side].hand[action.cardIndex] : undefined
  const cardId = card ? { cardId: card.id } : {}
  switch (action.type) {
    case 'place':            return { ...cardId, pieceType: card?.type as RevealedAction['pieceType'] }
    case 'direct_move':
    case 'direct_sacrifice': return { pieceType: at(action.row, action.lane)?.type }
    case 'direct_attack':    return { pieceType: at(action.row, action.lane)?.type, targetType: at(action.targetRow, action.targetLane)?.type }
    case 'play_buff':
    case 'play_debuff':      return { ...cardId, targetType: at(action.targetRow, action.targetLane)?.type, effectType: card?.type }
    case 'play_reposition':
    case 'play_return':      return { ...cardId, pieceType: at(action.pieceRow, action.pieceLane)?.type }
    case 'play_dispel':      return { ...cardId, targetType: at(action.targetRow, action.targetLane)?.type }
    default:                 return cardId
  }
}

// ── Reactions ─────────────────────────────────────────────────────────────────

// Carries out the announced action. reactionFired is set when a Reversal redirected it.
function resolvePending(rec: Recorder, reactionFired: 'reversal' | null, random: Random): void {
  const s = rec.state
  const pending = s.pending
  if (pending?.kind !== 'reaction') return
  s.pending = null

  let action = pending.action
  // The hand may have been reordered while waiting, so find the card again by id
  if (pending.cardId !== null && 'cardIndex' in action) {
    const cardIndex = s.players[pending.actorSide].hand.findIndex(c => c.id === pending.cardId)
    if (cardIndex === -1) { rec.record(null); advance(rec, random); return }
    action = { ...action, cardIndex }
  }

  const result = resolveTurnAction(s, pending.actorSide, action, random)
  if ('error' in result) { rec.record(null); advance(rec, random); return }

  rec.record(reactionFired ? { ...result.lastAction, reactionFired } : result.lastAction)
  advance(rec, random)
}

function passReaction(rec: Recorder, side: Side, random: Random): GameResult {
  const pending = rec.state.pending
  if (pending?.kind !== 'reaction') return { error: 'No reaction window open.' }
  if (side === pending.actorSide) return { error: 'You cannot react to your own action.' }
  resolvePending(rec, null, random)
  return rec.result()
}

function react(rec: Recorder, side: Side, input: { cardIndex: number; targetRow?: number; targetLane?: number }, random: Random): GameResult {
  const s = rec.state
  const pending = s.pending
  if (pending?.kind !== 'reaction') return { error: 'No reaction window open.' }
  if (side === pending.actorSide) return { error: 'You cannot react to your own action.' }

  const hand = s.players[side].hand
  const { cardIndex, targetRow, targetLane } = input
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= hand.length) return { error: 'Invalid card index.' }
  const card = hand[cardIndex]!
  if (card.type !== 'Intercept' && card.type !== 'Reversal') return { error: 'Not a reaction card.' }

  const { action, actorSide } = pending
  const redirects = card.type === 'Reversal' && (action.type === 'play_buff' || action.type === 'play_debuff')

  // Check the Reversal target before using up the card, so the window stays open on a mistake
  if (redirects) {
    const newTarget = Number.isInteger(targetRow) && Number.isInteger(targetLane) && inBounds(targetRow!, targetLane!)
      ? s.board[targetRow!][targetLane!] : null
    const sameTarget = targetRow === action.targetRow && targetLane === action.targetLane
    const valid = action.type === 'play_buff' ? isValidBuffTarget(newTarget) : isValidDebuffTarget(newTarget)
    if (!valid || sameTarget) return { error: 'Invalid Reversal target — pick a valid highlighted piece.' }
  }

  hand.splice(cardIndex, 1)
  s.discardPile.unshift({ type: card.type, id: card.id })

  if (card.type === 'Intercept') {
    s.pending = null
    if (pending.cardId !== null) {
      s.interceptedCardIds.push(pending.cardId)
    } else if (DIRECT_ACTIONS.has(action.type) && 'row' in action) {
      const piece = s.board[action.row]?.[action.lane]
      if (piece) { piece.canActThisTurn = false; piece.interceptedThisTurn = true }
    }
    rec.record({ ...lastAction(action.type, actorSide, { ...action }), reactionFired: 'intercept' })
    advance(rec, random)
    return rec.result()
  }

  // Reversal on anything other than a Buff or Debuff has no effect: the card is used and the action goes ahead
  if (!redirects) {
    resolvePending(rec, null, random)
    return rec.result()
  }
  s.pending = { ...pending, action: { ...action, targetRow: targetRow!, targetLane: targetLane! } }
  resolvePending(rec, 'reversal', random)
  return rec.result()
}

// ── Bodyguard and Enslave decisions ───────────────────────────────────────────

function sacrificeBodyguard(s: GameState, row: number, lane: number): void {
  const piece = s.board[row][lane]
  if (piece) {
    discardToken(s, piece.buff)
    discardToken(s, piece.debuff)
    if (piece.id !== undefined) s.discardPile.unshift({ type: piece.type as Card['type'], id: piece.id })
    s.board[row][lane] = null
  }
  s.pending = null
}

function chooseBodyguard(rec: Recorder, side: Side, row: number, lane: number, random: Random): GameResult {
  const pending = rec.state.pending
  if (pending?.kind !== 'bodyguard') return { error: 'No bodyguard prompt active.' }
  if (side !== 1 - pending.attackerSide) return { error: 'Not your prompt.' }
  if (!pending.options.some(o => o.row === row && o.lane === lane)) return { error: 'Invalid bodyguard choice.' }

  sacrificeBodyguard(rec.state, row, lane)
  rec.record(lastAction('bodyguard_save', side, { bodyguardRow: row, bodyguardLane: lane }))
  advance(rec, random)
  return rec.result()
}

function declineBodyguard(rec: Recorder, side: Side, random: Random): GameResult {
  const s = rec.state
  const pending = s.pending
  if (pending?.kind !== 'bodyguard') return { error: 'No bodyguard prompt active.' }
  if (side !== 1 - pending.attackerSide) return { error: 'Not your prompt.' }
  if (pending.isKingAttack) return { error: 'Must choose a Bodyguard to protect the King.' }

  s.pending = null
  const { attackerRow, attackerLane, targetRow, targetLane, attackerSide } = pending
  const la = capture(s, attackerRow, attackerLane, targetRow, targetLane,
    lastAction('direct_attack', attackerSide, { row: attackerRow, lane: attackerLane, targetRow, targetLane }))
  rec.record(la)
  advance(rec, random)
  return rec.result()
}

function placeEnslaved(rec: Recorder, side: Side, row: number, lane: number, random: Random): GameResult {
  const s = rec.state
  const pending = s.pending
  if (pending?.kind !== 'enslave') return { error: 'No enslave prompt active.' }
  if (side !== pending.side) return { error: 'Not your turn.' }
  if (!pending.validSpaces.some(sp => sp.row === row && sp.lane === lane)) return { error: 'Invalid placement space.' }
  if (s.board[row][lane] !== null) return { error: 'Space is occupied.' }

  s.board[row][lane] = pending.piece
  s.pending = null
  rec.record(null)
  advance(rec, random)
  return rec.result()
}

function discardEnslaved(rec: Recorder, side: Side, random: Random): GameResult {
  const s = rec.state
  const pending = s.pending
  if (pending?.kind !== 'enslave') return { error: 'No enslave prompt active.' }
  if (side !== pending.side) return { error: 'Not your turn.' }

  const { piece } = pending
  if (piece.id !== undefined) s.discardPile.unshift({ type: piece.type as Card['type'], id: piece.id })
  s.pending = null
  rec.record(null)
  advance(rec, random)
  return rec.result()
}

// ── Turn flow ─────────────────────────────────────────────────────────────────

function endGame(s: GameState, winner: Side, reason: 'checkmate' | 'forfeit'): void {
  s.winner = winner
  s.phase = 'ended'
  s.endReason = reason
  s.pending = null
}

function kingInCheckWithoutBodyguard(s: GameState, side: Side): boolean {
  const king = findKing(s.board, side)
  return king !== null && isInCheck(s.board, king.row, king.lane, side) && !hasBodyguardAdjacentToKing(s.board, side)
}

// Starts the current player's turn: reset per-turn limits, draw a card, and let their pieces act
export function startTurn(s: GameState, random: Random): void {
  s.phase = 'playing'
  s.actionsRemaining = s.disruptNextTurn ? 1 : 2
  s.actionsMax = s.actionsRemaining
  s.disruptNextTurn = false
  s.commandUsedThisTurn = false
  s.disruptUsedThisTurn = false
  s.interceptedCardIds = []

  const card = drawCard(s.deck, s.discardPile, random)
  if (card) s.players[s.currentTurn].hand.push(card)

  for (const row of s.board) {
    for (const piece of row) {
      if (piece?.owner === s.currentTurn) { piece.canActThisTurn = true; piece.interceptedThisTurn = false }
    }
  }
  s.turnPhase = 'actions'
}

function endTurn(s: GameState, side: Side, discardIndices: unknown, random: Random): ActionResult {
  // A player who ends their turn with their King still in check loses
  if (kingInCheckWithoutBodyguard(s, side)) {
    endGame(s, (1 - side) as Side, 'checkmate')
    return { lastAction: lastAction('end_turn', side, { discardIndices: [] }) }
  }

  const hand = s.players[side].hand
  const requested = Array.isArray(discardIndices) ? discardIndices : []
  if (hand.length > 5) {
    const indices = [...new Set(requested.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < hand.length))]
    if (hand.length - indices.length > 5) return { error: `Discard ${hand.length - 5} card(s) first.` }
    const removed = indices.sort((a, b) => b - a).map(i => hand.splice(i, 1)[0]!)
    s.discardPile.unshift(...removed.map(c => ({ type: c.type, id: c.id })))
  }

  s.currentTurn = (1 - s.currentTurn) as Side
  startTurn(s, random)
  return { lastAction: lastAction('end_turn', side, { discardIndices: requested }) }
}

// After an action resolves: with no actions left, check for checkmate, then end the turn
// automatically unless the player must first discard down to 5 cards.
function advance(rec: Recorder, random: Random): void {
  const s = rec.state
  if (s.phase !== 'playing' || s.pending || s.turnPhase !== 'actions' || s.actionsRemaining !== 0) return

  const side = s.currentTurn
  if (kingInCheckWithoutBodyguard(s, side)) {
    endGame(s, (1 - side) as Side, 'checkmate')
    rec.record(null)
    return
  }
  if (s.players[side].hand.length > 5) {
    s.turnPhase = 'discard'
    rec.record(null)
    return
  }
  const result = endTurn(s, side, [], random)
  if (!('error' in result)) rec.record(result.lastAction)
}

// ── What each player is allowed to see ───────────────────────────────────────

export interface PlayerView extends Omit<GameState, 'deck' | 'players' | 'pending'> {
  deckSize: number
  inCheck: [boolean, boolean]
  reactionWindowOpen: boolean
  players: { side: Side; mulliganDone: boolean; hand: Card[] | { count: number; ids: number[] } }[]
}

// Hides the deck order and the opponent's cards
export function playerView(state: GameState, viewer: Side): PlayerView {
  const { deck, players, pending, ...rest } = structuredClone(state)
  const inCheck = ([0, 1] as const).map(side => {
    const k = findKing(state.board, side)
    return k ? isInCheck(state.board, k.row, k.lane, side) : false
  }) as [boolean, boolean]
  return {
    ...rest,
    deckSize: deck.length,
    inCheck,
    reactionWindowOpen: pending?.kind === 'reaction',
    players: players.map((p, i) => ({
      side: i as Side,
      mulliganDone: p.mulliganDone,
      hand: i === viewer ? p.hand : { count: p.hand.length, ids: p.hand.map(c => c.id) },
    })),
  }
}
