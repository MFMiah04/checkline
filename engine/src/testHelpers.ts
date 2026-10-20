// Helpers for building game positions in tests.
// The board is board[row][lane]: rows 0-3, lanes 0-4.
// Player 0 owns rows 0-1, player 1 owns rows 2-3.
import type { Board, BuffType, Card, CardType, DebuffType, Piece, PieceType, Side } from './types.js'

export function emptyBoard(): Board {
  return Array.from({ length: 4 }, () => Array<Piece | null>(5).fill(null))
}

export function piece(type: PieceType, owner: Side, extra: Partial<Piece> = {}): Piece {
  return { type, owner, buff: null, debuff: null, firstStatus: null, canActThisTurn: true, ...extra }
}

export function buffed(type: PieceType, owner: Side, buffType: BuffType): Piece {
  return piece(type, owner, { buff: { type: buffType, id: 100 } })
}

export function debuffed(type: PieceType, owner: Side, debuffType: DebuffType): Piece {
  return piece(type, owner, { debuff: { type: debuffType, id: 200 } })
}

let nextCardId = 1000

// Hand or deck cards with unique ids, e.g. cards('Pawn', 'Rook')
export function cards(...types: CardType[]): Card[] {
  return types.map(type => ({ type, id: nextCardId++ }))
}
