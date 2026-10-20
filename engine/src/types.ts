// ── Cards ─────────────────────────────────────────────────────────────────────

export type Side = 0 | 1

export type PieceType = 'King' | 'Queen' | 'Rook' | 'Bishop' | 'Knight' | 'Pawn'
export type PlaceablePieceType = Exclude<PieceType, 'King'>
export type ControlType = 'Reposition' | 'Swap' | 'Command' | 'Disrupt' | 'Dispel' | 'Purge' | 'Return'
export type BuffType = 'Enslave' | 'Shield' | 'Bodyguard' | 'Protection'
export type DebuffType = 'Pin' | 'Fatigue' | 'Silence'
export type ReactionType = 'Intercept' | 'Reversal'

export type CardType = PlaceablePieceType | ControlType | BuffType | DebuffType | ReactionType
export type CardCategory = 'piece' | 'control' | 'buff' | 'debuff' | 'reaction'

export interface Card {
  type: CardType
  id: number
}

// ── Board ─────────────────────────────────────────────────────────────────────

// A Buff or Debuff card attached to a piece
export interface StatusToken<T extends BuffType | DebuffType> {
  type: T
  id: number
}

export interface Piece {
  id?: number  // the card id; Kings are not cards and have none
  type: PieceType
  owner: Side
  buff: StatusToken<BuffType> | null
  debuff: StatusToken<DebuffType> | null
  firstStatus: 'buff' | 'debuff' | null  // which status was attached first, for display order
  canActThisTurn: boolean
  interceptedThisTurn?: boolean
}

// board[row][lane]: rows 0-3, lanes 0-4. Side 0 owns rows 0-1, side 1 owns rows 2-3.
export type Board = (Piece | null)[][]

export interface Position {
  row: number
  lane: number
}

// Returns a number in [0, 1), like Math.random. Passed in so games can be replayed in tests.
export type Random = () => number

// ── Actions ───────────────────────────────────────────────────────────────────

// Actions arrive from the network, so every field is still checked at runtime.
export type Action =
  | { type: 'place'; cardIndex: number; row: number; lane: number }
  | { type: 'direct_move'; row: number; lane: number; toRow: number; toLane: number }
  | { type: 'direct_attack'; row: number; lane: number; targetRow: number; targetLane: number }
  | { type: 'direct_sacrifice'; row: number; lane: number }
  | { type: 'cycle'; cardIndex: number }
  | { type: 'shuffle_into_deck'; cardIndex: number }
  | { type: 'end_turn'; discardIndices: number[] }
  | { type: 'play_command'; cardIndex: number }
  | { type: 'play_disrupt'; cardIndex: number }
  | { type: 'play_buff'; cardIndex: number; targetRow: number; targetLane: number }
  | { type: 'play_debuff'; cardIndex: number; targetRow: number; targetLane: number }
  | { type: 'play_reposition'; cardIndex: number; pieceRow: number; pieceLane: number; toRow: number; toLane: number }
  | { type: 'play_swap'; cardIndex: number; aRow: number; aLane: number; bRow: number; bLane: number }
  | { type: 'play_dispel'; cardIndex: number; targetRow: number; targetLane: number; which: 'buff' | 'debuff' }
  | { type: 'play_return'; cardIndex: number; pieceRow: number; pieceLane: number }
  | { type: 'play_purge'; cardIndex: number }

export type ActionType = Action['type']
