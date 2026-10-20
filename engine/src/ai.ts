// A computer opponent that looks one move ahead: it tries each legal choice on a copy
// of the game, scores the result, and picks the best. The same approach covers turn
// actions, reactions, Bodyguard choices and Enslave placement.
import { shuffle } from './deck.js'
import { applyPlayerAction, resolveTimeout, type PlayerAction } from './game.js'
import { legalActions } from './legal.js'
import { findKing, getThreatenedSpaces, isInCheck } from './rules.js'
import type { GameState } from './state.js'
import type { CardType, Piece, PieceType, Random, Side } from './types.js'

export const PIECE_VALUE: Record<PieceType, number> = {
  Pawn: 1, Knight: 3, Bishop: 3, Rook: 5, Queen: 9, King: 0,
}

// How much a Buff or Debuff helps (positive) or hurts (negative) the piece carrying it
const STATUS_VALUE: Record<string, number> = {
  Shield: 1.5, Bodyguard: 1, Enslave: 1, Protection: 0.5,
  Pin: -1, Fatigue: -1.5, Silence: -0.5,
}

// How much a card is worth while it is still in the hand. A piece card is worth less than
// the piece on the board, since placing it takes an action. Reactions and Command are scarce.
const IN_HAND_FRACTION = 0.6
const HAND_VALUE: Partial<Record<CardType, number>> = {
  Intercept: 2, Reversal: 1.5, Command: 1.5, Bodyguard: 1, Shield: 1,
}
const OTHER_CARD_IN_HAND = 0.5
// The opponent's cards are hidden, so each one counts as an average card
const UNKNOWN_CARD_IN_HAND = 1

function handValue(type: CardType): number {
  const piece = PIECE_VALUE[type as PieceType]
  if (piece !== undefined) return piece * IN_HAND_FRACTION
  return HAND_VALUE[type] ?? OTHER_CARD_IN_HAND
}

const WIN = 10000
const IN_CHECK = 50
const GIVES_CHECK = 2
const THREAT_BONUS = 0.25   // per point of enemy material our pieces threaten
const EXPOSED_PENALTY = 0.5 // per point of our material the enemy threatens

export type Difficulty = 'easy' | 'normal'

// Random variation added to each score. Easy mode varies a lot, so it often misses good moves.
const NOISE: Record<Difficulty, number> = { easy: 4, normal: 0.3 }

// ── Scoring ───────────────────────────────────────────────────────────────────

function pieceWorth(piece: Piece): number {
  return PIECE_VALUE[piece.type]
    + (piece.buff ? STATUS_VALUE[piece.buff.type] ?? 0 : 0)
    + (piece.debuff ? STATUS_VALUE[piece.debuff.type] ?? 0 : 0)
}

function kingInCheck(state: GameState, side: Side): boolean {
  const k = findKing(state.board, side)
  return k !== null && isInCheck(state.board, k.row, k.lane, side)
}

// Total value of the pieces on squares the attacking side threatens
function threatenedValue(state: GameState, attacker: Side): number {
  const threatened = new Set<string>()
  state.board.forEach((row, r) => row.forEach((p, l) => {
    if (p?.owner === attacker)  // Fatigued pieces threaten nothing
      for (const [tr, tl] of getThreatenedSpaces(state.board, p, r, l)) threatened.add(`${tr},${tl}`)
  }))
  let value = 0
  for (const key of threatened) {
    const [r, l] = key.split(',').map(Number) as [number, number]
    const target = state.board[r]![l]
    if (target && target.owner !== attacker && target.type !== 'King') value += PIECE_VALUE[target.type]
  }
  return value
}

// How good the position is for `side`: positive is good, negative is bad
export function evaluate(state: GameState, side: Side): number {
  const enemy = (1 - side) as Side
  if (state.phase === 'ended') return state.winner === side ? WIN : -WIN

  let score = 0
  for (const row of state.board)
    for (const p of row)
      if (p) score += p.owner === side ? pieceWorth(p) : -pieceWorth(p)

  for (const card of state.players[side].hand) score += handValue(card.type)
  score -= UNKNOWN_CARD_IN_HAND * state.players[enemy].hand.length

  if (kingInCheck(state, side)) score -= IN_CHECK
  if (kingInCheck(state, enemy)) score += GIVES_CHECK

  score += THREAT_BONUS * threatenedValue(state, side)
  score -= EXPOSED_PENALTY * threatenedValue(state, enemy)
  return score
}

// ── Looking ahead ─────────────────────────────────────────────────────────────

// After `side` acts, play out decisions that are not theirs with simple assumptions:
// the opponent passes and uses default Bodyguard choices, and our own Enslaved piece
// goes on the first free square. This keeps the lookahead to one move.
function settle(state: GameState, side: Side, random: Random): GameState {
  for (let i = 0; i < 4 && state.pending; i++) {
    const pending = state.pending
    let result
    if (pending.kind === 'reaction' && pending.actorSide === side) {
      result = applyPlayerAction(state, (1 - side) as Side, { type: 'pass_reaction' }, random)
    } else if (pending.kind === 'bodyguard' && pending.attackerSide === side) {
      result = resolveTimeout(state, random)
    } else if (pending.kind === 'enslave' && pending.side === side) {
      const space = pending.validSpaces[0]!
      result = applyPlayerAction(state, side, { type: 'place_enslaved', row: space.row, lane: space.lane }, random)
    } else {
      break  // a decision that is ours to make next; score the position as it stands
    }
    if ('error' in result) break
    state = result.state
  }
  return state
}

export interface ChooseOptions {
  random: Random
  difficulty?: Difficulty
}

// Replaces what `side` cannot see with a random guess: the deck and the opponent's hand
// are pooled, put in a fixed order, shuffled and dealt back out in the same sizes.
// The result depends only on what that player could know.
function determinize(state: GameState, side: Side, random: Random): GameState {
  const enemy = (1 - side) as Side
  const enemyHandSize = state.players[enemy].hand.length
  const unseen = [...state.deck, ...state.players[enemy].hand].sort((a, b) => a.id - b.id)
  const guess = shuffle(unseen, random)
  const players = structuredClone(state.players)
  players[enemy].hand = guess.slice(0, enemyHandSize)
  return { ...state, players, deck: guess.slice(enemyHandSize) }
}

// Picks a choice for `side`, who must be the player the game is waiting for.
// It looks ahead on a determinized copy, so it never uses hidden information.
export function chooseAction(actual: GameState, side: Side, { random, difficulty = 'normal' }: ChooseOptions): PlayerAction | null {
  const options = legalActions(actual, side)
  if (options.length === 0) return null

  const state = determinize(actual, side, random)
  let best: PlayerAction | null = null
  let bestScore = -Infinity
  for (const action of options) {
    const result = applyPlayerAction(state, side, action, random)
    if ('error' in result) continue
    const score = evaluate(settle(result.state, side, random), side) + random() * NOISE[difficulty]
    if (score > bestScore) {
      bestScore = score
      best = action
    }
  }
  return best
}

// ── Mulligan ──────────────────────────────────────────────────────────────────

const KEEP_PRIORITY: Partial<Record<CardType, number>> = {
  Queen: 9, Rook: 8, Bishop: 7, Knight: 7, Command: 6, Shield: 6, Bodyguard: 5, Pawn: 5,
  Intercept: 5, Fatigue: 4, Reposition: 4, Enslave: 4,
}

// Keeps a hand with at least two pieces to place, swapping out the weakest other cards
export function chooseMulligan(state: GameState, side: Side): number[] {
  const hand = state.players[side].hand
  const pieceCount = hand.filter(c => PIECE_VALUE[c.type as PieceType] !== undefined).length
  if (pieceCount >= 2) return []

  return hand
    .map((card, index) => ({ index, keep: KEEP_PRIORITY[card.type] ?? 2, isPiece: PIECE_VALUE[card.type as PieceType] !== undefined }))
    .filter(c => !c.isPiece)
    .sort((a, b) => a.keep - b.keep)
    .slice(0, 2 - pieceCount + 1)
    .map(c => c.index)
}
