// Helpers for building game positions in tests.
// The board is board[row][lane]: rows 0-3, lanes 0-4.
// Player 0 owns rows 0-1, player 1 owns rows 2-3.

export function emptyBoard() {
  return Array.from({ length: 4 }, () => Array(5).fill(null))
}

export function piece(type, owner, extra = {}) {
  return { type, owner, buff: null, debuff: null, firstStatus: null, canActThisTurn: true, ...extra }
}

export function buffed(type, owner, buffType) {
  return piece(type, owner, { buff: { type: buffType, id: 100 } })
}

export function debuffed(type, owner, debuffType) {
  return piece(type, owner, { debuff: { type: debuffType, id: 200 } })
}

let nextCardId = 1000

// Hand or deck cards with unique ids, e.g. cards('Pawn', 'Rook')
export function cards(...types) {
  return types.map(type => ({ type, id: nextCardId++ }))
}

// A room mid-game on player 0's turn, with the fields the game functions read
export function makeRoom({ board = emptyBoard(), deck = cards('Pawn', 'Pawn', 'Pawn', 'Pawn') } = {}) {
  return {
    phase: 'playing',
    turnPhase: 'actions',
    currentTurn: 0,
    actionsRemaining: 2,
    actionsMax: 2,
    commandUsedThisTurn: false,
    disruptUsedThisTurn: false,
    disruptNextTurn: false,
    interceptedCardIds: [],
    board,
    deck,
    discardPile: [],
    winner: null,
    endReason: null,
    players: [{ side: 0, hand: [] }, { side: 1, hand: [] }],
  }
}
