import { describe, it, expect, beforeEach } from 'vitest'
import {
  isValidMove, isValidAttack, isInCheck, isValidReposition, isValidSwap,
  isValidBuffTarget, isValidDebuffTarget,
} from './rules.js'
import { emptyBoard, piece, buffed, debuffed } from './testHelpers.js'

let board
beforeEach(() => { board = emptyBoard() })

// Put a piece on the board and return it, for calls like isValidMove(board, p, ...)
function put(row, lane, p) {
  board[row][lane] = p
  return p
}

describe('isValidMove', () => {
  it('moves a Pawn forward one space', () => {
    expect(isValidMove(board, put(0, 1, piece('Pawn', 0)), 0, 1, 1, 1)).toBe(true)
    expect(isValidMove(board, put(3, 1, piece('Pawn', 1)), 3, 1, 2, 1)).toBe(true)
  })

  it('does not move a Pawn backward', () => {
    expect(isValidMove(board, put(1, 1, piece('Pawn', 0)), 1, 1, 0, 1)).toBe(false)
  })

  it('keeps pieces on their own side of the board', () => {
    expect(isValidMove(board, put(1, 1, piece('Pawn', 0)), 1, 1, 2, 1)).toBe(false)
    expect(isValidMove(board, put(1, 0, piece('Rook', 0)), 1, 0, 2, 0)).toBe(false)
  })

  it('slides a Rook along a clear row', () => {
    expect(isValidMove(board, put(0, 0, piece('Rook', 0)), 0, 0, 0, 4)).toBe(true)
  })

  it('stops a Rook at a blocking piece', () => {
    const rook = put(0, 0, piece('Rook', 0))
    put(0, 2, piece('Pawn', 0))
    expect(isValidMove(board, rook, 0, 0, 0, 4)).toBe(false)
  })

  it('moves a Bishop diagonally only', () => {
    const bishop = put(0, 0, piece('Bishop', 0))
    expect(isValidMove(board, bishop, 0, 0, 1, 1)).toBe(true)
    expect(isValidMove(board, bishop, 0, 0, 1, 0)).toBe(false)
  })

  it('moves a Knight in an L-shape, jumping over pieces', () => {
    const knight = put(0, 0, piece('Knight', 0))
    put(0, 1, piece('Pawn', 0))
    put(1, 1, piece('Pawn', 0))
    expect(isValidMove(board, knight, 0, 0, 1, 2)).toBe(true)
    expect(isValidMove(board, knight, 0, 0, 1, 1)).toBe(false)
  })

  it('moves a Queen straight or diagonally', () => {
    const queen = put(0, 0, piece('Queen', 0))
    expect(isValidMove(board, queen, 0, 0, 0, 3)).toBe(true)
    expect(isValidMove(board, queen, 0, 0, 1, 1)).toBe(true)
    expect(isValidMove(board, queen, 0, 0, 1, 2)).toBe(false)
  })

  it('does not move onto an occupied space', () => {
    const rook = put(0, 0, piece('Rook', 0))
    put(0, 1, piece('Pawn', 0))
    expect(isValidMove(board, rook, 0, 0, 0, 1)).toBe(false)
  })

  it('does not move a Pinned piece', () => {
    expect(isValidMove(board, put(0, 0, debuffed('Rook', 0, 'Pin')), 0, 0, 0, 3)).toBe(false)
  })

  it('does not move a King into check', () => {
    const king = put(0, 2, piece('King', 0))
    put(3, 1, piece('Rook', 1))  // attacks all of lane 1
    expect(isValidMove(board, king, 0, 2, 0, 1)).toBe(false)
    expect(isValidMove(board, king, 0, 2, 1, 2)).toBe(true)
  })
})

describe('isValidAttack', () => {
  it('lets a Rook attack across the board along a clear lane', () => {
    const rook = put(1, 0, piece('Rook', 0))
    put(3, 0, piece('Pawn', 1))
    expect(isValidAttack(board, rook, 1, 0, 3, 0)).toBe(true)
  })

  it('is blocked by any piece in the way', () => {
    const rook = put(1, 0, piece('Rook', 0))
    put(2, 0, piece('Pawn', 1))
    put(3, 0, piece('Pawn', 1))
    expect(isValidAttack(board, rook, 1, 0, 3, 0)).toBe(false)
  })

  it('lets a Bishop attack diagonally unless blocked', () => {
    const bishop = put(0, 0, piece('Bishop', 0))
    put(3, 3, piece('Pawn', 1))
    expect(isValidAttack(board, bishop, 0, 0, 3, 3)).toBe(true)
    put(2, 2, piece('Pawn', 1))
    expect(isValidAttack(board, bishop, 0, 0, 3, 3)).toBe(false)
  })

  it('lets a Knight attack over blocking pieces', () => {
    const knight = put(1, 0, piece('Knight', 0))
    put(2, 0, piece('Pawn', 1))
    put(2, 1, piece('Pawn', 1))
    put(3, 1, piece('Pawn', 1))
    expect(isValidAttack(board, knight, 1, 0, 3, 1)).toBe(true)
  })

  it('lets a Pawn attack diagonally forward but not straight ahead', () => {
    const pawn = put(1, 2, piece('Pawn', 0))
    put(2, 3, piece('Pawn', 1))
    put(2, 2, piece('Pawn', 1))
    expect(isValidAttack(board, pawn, 1, 2, 2, 3)).toBe(true)
    expect(isValidAttack(board, pawn, 1, 2, 2, 2)).toBe(false)
  })

  it('does not attack friendly pieces', () => {
    const rook = put(1, 0, piece('Rook', 0))
    put(1, 3, piece('Pawn', 0))
    expect(isValidAttack(board, rook, 1, 0, 1, 3)).toBe(false)
  })

  it('does not let a Fatigued piece attack', () => {
    const rook = put(1, 0, debuffed('Rook', 0, 'Fatigue'))
    put(3, 0, piece('Pawn', 1))
    expect(isValidAttack(board, rook, 1, 0, 3, 0)).toBe(false)
  })

  it('does not attack a King with no Bodyguard next to it', () => {
    const rook = put(1, 2, piece('Rook', 0))
    put(3, 2, piece('King', 1))
    expect(isValidAttack(board, rook, 1, 2, 3, 2)).toBe(false)
  })

  it('attacks a King in reach when a Bodyguard is next to it', () => {
    const rook = put(1, 2, piece('Rook', 0))
    put(3, 2, piece('King', 1))
    put(3, 1, buffed('Pawn', 1, 'Bodyguard'))
    expect(isValidAttack(board, rook, 1, 2, 3, 2)).toBe(true)
  })

  // Known bug: for King targets, isValidAttack only checks for a Bodyguard
  // and skips the attacker's reach, so any piece can force a Bodyguard sacrifice.
  it.fails('does not attack a King that is out of reach, even with a Bodyguard', () => {
    const pawn = put(0, 0, piece('Pawn', 0))
    put(3, 2, piece('King', 1))
    put(3, 1, buffed('Pawn', 1, 'Bodyguard'))
    expect(isValidAttack(board, pawn, 0, 0, 3, 2)).toBe(false)
  })
})

describe('isInCheck', () => {
  it('detects a King attacked along a clear lane', () => {
    put(0, 2, piece('King', 0))
    put(3, 2, piece('Rook', 1))
    expect(isInCheck(board, 0, 2, 0)).toBe(true)
  })

  it('is removed by a piece blocking the line of attack', () => {
    put(0, 2, piece('King', 0))
    put(1, 2, piece('Pawn', 0))
    put(3, 2, piece('Rook', 1))
    expect(isInCheck(board, 0, 2, 0)).toBe(false)
  })

  it('detects a Knight check through blocking pieces', () => {
    put(0, 2, piece('King', 0))
    put(1, 1, piece('Pawn', 0))
    put(1, 2, piece('Pawn', 0))
    put(2, 1, piece('Knight', 1))
    expect(isInCheck(board, 0, 2, 0)).toBe(true)
  })

  it('ignores a Fatigued attacker', () => {
    put(0, 2, piece('King', 0))
    put(3, 2, debuffed('Rook', 1, 'Fatigue'))
    expect(isInCheck(board, 0, 2, 0)).toBe(false)
  })

  it('ignores the King owner\'s own pieces', () => {
    put(0, 2, piece('King', 0))
    put(0, 0, piece('Rook', 0))
    expect(isInCheck(board, 0, 2, 0)).toBe(false)
  })

  it('is prevented by a Bodyguard orthogonally next to the King', () => {
    put(0, 2, piece('King', 0))
    put(0, 1, buffed('Pawn', 0, 'Bodyguard'))
    put(3, 2, piece('Rook', 1))
    expect(isInCheck(board, 0, 2, 0)).toBe(false)
  })

  it('is not prevented by a Bodyguard diagonal to the King', () => {
    put(0, 2, piece('King', 0))
    put(1, 1, buffed('Pawn', 0, 'Bodyguard'))
    put(3, 2, piece('Rook', 1))
    expect(isInCheck(board, 0, 2, 0)).toBe(true)
  })
})

describe('isValidReposition', () => {
  it('moves a piece to any empty space on its own side', () => {
    expect(isValidReposition(board, put(0, 0, piece('Rook', 0)), 0, 0, 1, 4)).toBe(true)
  })

  it('does not move a piece to the opponent\'s side', () => {
    expect(isValidReposition(board, put(0, 0, piece('Rook', 0)), 0, 0, 2, 0)).toBe(false)
  })

  it('does not move a Pinned piece', () => {
    expect(isValidReposition(board, put(0, 0, debuffed('Rook', 0, 'Pin')), 0, 0, 1, 4)).toBe(false)
  })
})

describe('isValidSwap', () => {
  it('swaps two of the player\'s own pieces', () => {
    put(0, 0, piece('Rook', 0))
    put(1, 4, piece('Pawn', 0))
    expect(isValidSwap(board, 0, 0, 0, 1, 4)).toBe(true)
  })

  it('does not swap with an opponent\'s piece', () => {
    put(1, 0, piece('Rook', 0))
    put(2, 0, piece('Pawn', 1))
    expect(isValidSwap(board, 0, 1, 0, 2, 0)).toBe(false)
  })

  it('does not swap a Pinned piece', () => {
    put(0, 0, debuffed('Rook', 0, 'Pin'))
    put(1, 4, piece('Pawn', 0))
    expect(isValidSwap(board, 0, 0, 0, 1, 4)).toBe(false)
  })
})

describe('buff and debuff targets', () => {
  it('allows a Buff on a plain piece', () => {
    expect(isValidBuffTarget(piece('Pawn', 0))).toBe(true)
  })

  it('does not allow a Buff on a King, a buffed piece, or a Silenced piece', () => {
    expect(isValidBuffTarget(piece('King', 0))).toBe(false)
    expect(isValidBuffTarget(buffed('Pawn', 0, 'Shield'))).toBe(false)
    expect(isValidBuffTarget(debuffed('Pawn', 0, 'Silence'))).toBe(false)
  })

  it('allows a Debuff on a plain piece', () => {
    expect(isValidDebuffTarget(piece('Pawn', 1))).toBe(true)
  })

  it('does not allow a Debuff on a King, a debuffed piece, or a piece with Protection', () => {
    expect(isValidDebuffTarget(piece('King', 1))).toBe(false)
    expect(isValidDebuffTarget(debuffed('Pawn', 1, 'Pin'))).toBe(false)
    expect(isValidDebuffTarget(buffed('Pawn', 1, 'Protection'))).toBe(false)
  })

  it('rejects an empty space', () => {
    expect(isValidBuffTarget(null)).toBe(false)
    expect(isValidDebuffTarget(null)).toBe(false)
  })
})
