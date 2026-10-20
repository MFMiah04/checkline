import { describe, it, expect } from 'vitest'
import { createDeck, drawCard, shuffle } from './deck.js'

// Deck contents table from ruleset.md
const RULESET_COUNTS = {
  Pawn: 8, Knight: 4, Bishop: 4, Rook: 4, Queen: 2,
  Reposition: 2, Swap: 2, Command: 2, Disrupt: 2, Dispel: 1, Purge: 1, Return: 2,
  Enslave: 2, Shield: 3, Bodyguard: 2, Protection: 1,
  Pin: 2, Fatigue: 2, Silence: 2,
  Intercept: 2, Reversal: 2,
}

function countByType(cards) {
  const counts = {}
  for (const card of cards) counts[card.type] = (counts[card.type] ?? 0) + 1
  return counts
}

describe('createDeck', () => {
  it('has 52 cards', () => {
    expect(createDeck()).toHaveLength(52)
  })

  it('matches the card counts in the ruleset', () => {
    expect(countByType(createDeck())).toEqual(RULESET_COUNTS)
  })

  it('does not include Kings', () => {
    expect(createDeck().some(card => card.type === 'King')).toBe(false)
  })

  it('gives every card a unique id', () => {
    const ids = createDeck().map(card => card.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('shuffle', () => {
  it('returns the same cards without changing the original array', () => {
    const original = [1, 2, 3, 4, 5]
    const result = shuffle(original)
    expect(original).toEqual([1, 2, 3, 4, 5])
    expect([...result].sort()).toEqual(original)
  })
})

describe('drawCard', () => {
  it('takes the top card from the deck', () => {
    const deck = [{ type: 'Pawn', id: 1 }, { type: 'Rook', id: 2 }]
    const card = drawCard(deck, [])
    expect(card).toEqual({ type: 'Rook', id: 2 })
    expect(deck).toHaveLength(1)
  })

  it('shuffles the discard pile into the deck when the deck is empty', () => {
    const deck = []
    const discardPile = [{ type: 'Pawn', id: 1 }, { type: 'Rook', id: 2 }]
    const card = drawCard(deck, discardPile)
    expect(['Pawn', 'Rook']).toContain(card.type)
    expect(deck).toHaveLength(1)
    expect(discardPile).toHaveLength(0)
  })

  it('returns null when the deck and discard pile are both empty', () => {
    expect(drawCard([], [])).toBeNull()
  })
})
