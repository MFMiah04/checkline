import { DECK_COUNTS } from './cards.js'
import type { Card, CardType, Random } from './types.js'

export function createDeck(random: Random): Card[] {
  let id = 0
  const cards: Card[] = []
  for (const [type, count] of Object.entries(DECK_COUNTS) as [CardType, number][]) {
    for (let i = 0; i < count; i++) {
      cards.push({ type, id: id++ })
    }
  }
  return shuffle(cards, random)
}

// Fisher-Yates shuffle; returns a new array
export function shuffle<T>(arr: readonly T[], random: Random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

// Draws one card from the top of the deck (mutates deck and discardPile in place).
// Reshuffles discard into deck if deck is empty.
// Returns null only if both deck and discard are empty.
export function drawCard(deck: Card[], discardPile: Card[], random: Random): Card | null {
  if (deck.length === 0) {
    if (discardPile.length === 0) return null
    const reshuffled = shuffle(discardPile, random)
    deck.push(...reshuffled)
    discardPile.length = 0
  }
  return deck.pop() ?? null
}
