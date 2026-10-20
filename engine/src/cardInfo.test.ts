import { describe, it, expect } from 'vitest'
import { ALL_CARD_TYPES, cardInfo } from './cardInfo.js'
import { DECK_COUNTS } from './cards.js'

describe('cardInfo', () => {
  it('describes every card in the deck, and the King', () => {
    expect(ALL_CARD_TYPES.sort()).toEqual([...Object.keys(DECK_COUNTS), 'King'].sort())
  })

  it('keeps the short line small enough for a card face', () => {
    for (const type of ALL_CARD_TYPES) {
      expect(cardInfo(type).short.length, type).toBeLessThanOrEqual(28)
    }
  })

  it('marks Command and Disrupt as free and reactions as reactions', () => {
    expect(cardInfo('Command').cost).toBe('free')
    expect(cardInfo('Disrupt').cost).toBe('free')
    expect(cardInfo('Intercept').cost).toBe('reaction')
    expect(cardInfo('Shield').category).toBe('buff')
  })
})
