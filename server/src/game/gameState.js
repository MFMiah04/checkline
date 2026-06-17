import { createDeck, drawCard } from './deck.js'
import { findKing, isInCheck } from './rules.js'

export function initGameState(room) {
  const deck = createDeck()
  const discardPile = []

  // Deal 5 cards to each player
  for (const player of room.players) {
    player.hand = []
    player.mulliganDone = false
    for (let i = 0; i < 5; i++) {
      const card = drawCard(deck, discardPile)
      if (card) player.hand.push(card)
    }
  }

  // Place Kings on the board (row 0 lane 2 for side 0; row 3 lane 2 for side 1)
  const board = Array.from({ length: 4 }, () => Array(5).fill(null))
  board[0][2] = { type: 'King', owner: 0, buff: null, debuff: null, canActThisTurn: false }
  board[3][2] = { type: 'King', owner: 1, buff: null, debuff: null, canActThisTurn: false }

  // Randomly determine who goes first
  const currentTurn = Math.random() < 0.5 ? 0 : 1

  Object.assign(room, {
    turnPhase: 'actions',   // will be set properly by startTurn after mulligan
    currentTurn,
    actionsRemaining: 2,
    commandUsedThisTurn: false,
    disruptUsedThisTurn: false,
    disruptNextTurn: false,
    interceptedCardIds: [],      // card IDs locked by Intercept this turn
    board,
    deck,
    discardPile,
    discardViewIndex: 0,         // shared browse cursor for discard pile
    pendingAction: null,
    reactionWindowOpen: false,
    reactionWindowExpiresAt: null,
    pendingBodyguard: null,
    bodyguardPromptOpen: false,
    bodyguardExpiresAt: null,
    enslavePromptOpen: false,
    enslaveExpiresAt: null,
    pendingEnslaved: null,       // { piece, validSpaces, attackerRow, attackerLane }
    winner: null,
    endReason: null,
    playAgainVotes: new Set()
  })
}

// Called when a turn begins (after mulligan ends, or after end_turn).
// Auto-draws for current player, resets per-turn state, transitions turnPhase to 'actions'.
export function startTurn(room) {
  room.phase = 'playing'
  room.actionsRemaining = room.disruptNextTurn ? 1 : 2
  room.actionsMax = room.disruptNextTurn ? 1 : 2
  room.disruptNextTurn = false
  room.commandUsedThisTurn = false
  room.disruptUsedThisTurn = false
  room.interceptedCardIds = []

  // Auto-draw for the current player
  const currentPlayer = room.players[room.currentTurn]
  const card = drawCard(room.deck, room.discardPile)
  if (card) currentPlayer.hand.push(card)

  // Reset canActThisTurn for all pieces owned by current player
  for (const row of room.board) {
    for (const piece of row) {
      if (piece?.owner === room.currentTurn) { piece.canActThisTurn = true; piece.interceptedThisTurn = false }
    }
  }

  room.turnPhase = 'actions'
}

// Produces the client-facing state for a given player.
// Hides the deck entirely (sends deckSize instead).
// Hides opponent's hand contents (sends count instead).
export function projectState(room, playerIndex) {
  const { deck, players, ...rest } = room
  const inCheck = room.board
    ? [0, 1].map(side => {
        const k = findKing(room.board, side)
        return k ? isInCheck(room.board, k.row, k.lane, side) : false
      })
    : [false, false]
  return {
    ...rest,
    deckSize: deck.length,
    inCheck,
    playAgainVotes: room.phase === 'ended' ? [...(room.playAgainVotes || [])] : [],
    players: players.map((p, i) => ({
      name: p.name,
      side: p.side,
      mulliganDone: p.mulliganDone,
      hand: i === playerIndex ? p.hand : { count: p.hand.length, ids: p.hand.map(c => c.id) }
    }))
  }
}
