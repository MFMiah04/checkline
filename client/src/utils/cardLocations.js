// Where every card is, so the game screen can animate the ones that moved.
//
// Every card has an id that it keeps wherever it goes: in a hand, on the board as a piece,
// on a piece as a Buff or Debuff, in the discard pile, or on the "played" spot while an
// action waits for a reaction. Comparing where each id was with where it is now gives the
// cards to fly across the screen, whatever caused the change: your move, the opponent's,
// the computer's, or a replay.
//
// Kings aren't cards, so they use the id "king-<owner>". Deck cards are hidden, so a card
// that appears in a hand from nowhere was drawn, and one that leaves a hand for nowhere
// went back into the deck.

// The id a piece is tracked by, or null for a preview piece whose card isn't known yet
export function flyId(piece) {
  if (piece.type === 'King') return `king-${piece.owner}`
  return piece.id != null ? String(piece.id) : null
}

// Map of card id → { zone, side?, square?, type?, owner? }
// hands[side] is a list of cards ({ id, type }) or of ids for a hidden hand.
export function locateCards({ board, hands, discard = [], stage = null }) {
  const at = new Map()
  hands.forEach((cards, side) => {
    for (const c of cards) {
      const id = typeof c === 'object' ? c.id : c
      at.set(String(id), { zone: 'hand', side, type: c.type ?? null })
    }
  })
  for (const c of discard) at.set(String(c.id), { zone: 'discard', type: c.type })
  if (stage) at.set(String(stage.id), { zone: 'stage', type: stage.type })

  // The board goes last, so a card shown on the board in a preview counts as there
  board.forEach((row, r) => row.forEach((piece, lane) => {
    if (!piece) return
    const square = `${r},${lane}`
    const id = flyId(piece)
    if (id) at.set(id, { zone: 'board', square, type: piece.type, owner: piece.owner })
    for (const status of [piece.buff, piece.debuff]) {
      if (status?.id != null) at.set(String(status.id), { zone: 'status', square, type: status.type })
    }
  }))
  return at
}

function sameSpot(a, b) {
  return a.zone === b.zone && a.side === b.side && a.square === b.square
}

// The cards that changed place: [{ id, from, to }]. Moving within a hand doesn't count.
export function planFlights(before, after) {
  if (before.size === 0) return []  // the first view of a game: nothing to animate yet
  const flights = []
  for (const [id, to] of after) {
    const from = before.get(id) ?? { zone: 'deck' }
    if (!sameSpot(from, to)) flights.push({ id, from, to })
  }
  for (const [id, from] of before) {
    if (!after.has(id) && from.zone === 'hand') flights.push({ id, from, to: { zone: 'deck' } })
  }
  return flights
}
