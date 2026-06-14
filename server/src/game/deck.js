import { DECK_COUNTS } from './cards.js'

export function createDeck() {
  let id = 0
  const cards = []
  for (const [type, count] of Object.entries(DECK_COUNTS)) {
    for (let i = 0; i < count; i++) {
      cards.push({ type, id: id++ })
    }
  }
  return shuffle(cards)
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Draws one card from the top of the deck (mutates deck and discardPile in place).
// Reshuffles discard into deck if deck is empty.
// Returns null only if both deck and discard are empty.
export function drawCard(deck, discardPile) {
  if (deck.length === 0) {
    if (discardPile.length === 0) return null
    const reshuffled = shuffle(discardPile)
    deck.push(...reshuffled)
    discardPile.length = 0
  }
  return deck.pop()
}
