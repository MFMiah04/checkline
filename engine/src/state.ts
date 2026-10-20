import type { BodyguardOption } from './rules.js'
import type { Action, Board, Card, Piece, PieceType, Position, Side } from './types.js'

export type Phase = 'mulligan' | 'playing' | 'ended'
export type TurnPhase = 'actions' | 'discard'
export type EndReason = 'checkmate' | 'forfeit'

export interface PlayerState {
  hand: Card[]
  mulliganDone: boolean
}

// Extra details shown to the opponent when an action is announced in a reaction window
export interface RevealedAction {
  pieceType?: PieceType
  targetType?: PieceType
  effectType?: string
}

// ── Decisions the game is waiting for ────────────────────────────────────────

// An action has been announced; the opponent may react with Intercept or Reversal
export interface PendingReaction {
  kind: 'reaction'
  action: Action
  actorSide: Side
  cardId: number | null  // the card being played, tracked by id in case the hand is reordered
  revealed: RevealedAction
}

// A piece next to a Bodyguard was attacked; the defender chooses whether to sacrifice the Bodyguard
export interface PendingBodyguard {
  kind: 'bodyguard'
  attackerSide: Side
  attackerRow: number
  attackerLane: number
  targetRow: number
  targetLane: number
  targetType: PieceType
  isKingAttack: boolean
  options: BodyguardOption[]
}

// An Enslave capture; the attacker chooses where to place the captured piece
export interface PendingEnslave {
  kind: 'enslave'
  side: Side
  piece: Piece
  validSpaces: Position[]
}

export type Pending = PendingReaction | PendingBodyguard | PendingEnslave

// ── Game state ────────────────────────────────────────────────────────────────

export interface GameState {
  phase: Phase
  turnPhase: TurnPhase
  currentTurn: Side
  actionsRemaining: number
  actionsMax: number
  commandUsedThisTurn: boolean
  disruptUsedThisTurn: boolean
  disruptNextTurn: boolean
  interceptedCardIds: number[]
  board: Board
  deck: Card[]
  discardPile: Card[]
  players: [PlayerState, PlayerState]
  pending: Pending | null
  winner: Side | null
  endReason: EndReason | null
}

// What just happened, sent to clients so they can animate it
export interface LastAction {
  type: string
  actorSide: Side
  payload: Record<string, unknown>
  reactionFired: 'intercept' | 'reversal' | null
  secondaryEffect: string | null
}

export function lastAction(type: string, actorSide: Side, payload: Record<string, unknown>): LastAction {
  return { type, actorSide, payload, reactionFired: null, secondaryEffect: null }
}
