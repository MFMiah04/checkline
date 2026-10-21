import { describe, it, expect } from 'vitest'
import { describeAction } from './describeAction'

const emptyBoard = () => Array.from({ length: 4 }, () => Array(5).fill(null))
const piece = (type, owner, extra = {}) => ({ type, owner, buff: null, debuff: null, ...extra })
const la = (type, actorSide, payload, extra = {}) => ({ type, actorSide, payload, reactionFired: null, secondaryEffect: null, ...extra })

// Seen by player 0; player 1 is the computer
function say(action, before = emptyBoard(), after = before) {
  return describeAction(action, { before, after, mySide: 0, names: ['Sam', 'Computer'] })
}

describe('describeAction', () => {
  it('names the piece and both squares of a move', () => {
    const before = emptyBoard()
    before[1][1] = piece('Rook', 1)
    const after = emptyBoard()
    after[2][1] = piece('Rook', 1)
    expect(say(la('direct_move', 1, { row: 1, lane: 1, toRow: 2, toLane: 1 }), before, after))
      .toBe('Computer moved their Rook b2 → b3.')
  })

  it('says what took what in a capture, from your point of view', () => {
    const before = emptyBoard()
    before[2][0] = piece('Bishop', 1)
    before[1][1] = piece('Knight', 0)
    expect(say(la('direct_attack', 1, { row: 2, lane: 0, targetRow: 1, targetLane: 1 }), before))
      .toBe('Computer took your Knight on b2 with their Bishop on a3.')
  })

  it('mentions a Shield that blocked an attack', () => {
    const before = emptyBoard()
    before[0][0] = piece('Queen', 0)
    before[3][0] = piece('Pawn', 1, { buff: { type: 'Shield', id: 5 } })
    expect(say(la('direct_attack', 0, { row: 0, lane: 0, targetRow: 3, targetLane: 0 }, { secondaryEffect: 'shield_absorbed' }), before))
      .toBe('You attacked their Pawn on a4 with your Queen on a1, but a Shield blocked it.')
  })

  it('describes card plays with their targets', () => {
    const before = emptyBoard()
    before[1][3] = piece('Pawn', 0)
    expect(say(la('play_debuff', 1, { targetRow: 1, targetLane: 3, debuffType: 'Pin' }), before))
      .toBe('Computer put Pin on your Pawn on d2.')
    expect(say(la('place', 0, { row: 0, lane: 4, pieceType: 'Knight' }))).toBe('You placed a Knight on e1.')
    expect(say(la('direct_sacrifice', 1, { row: 3, lane: 1, pieceType: 'Queen', drawCount: 3 })))
      .toBe('Computer sacrificed a Queen on b4 and drew 3.')
  })

  it('counts the cards discarded at the end of a turn', () => {
    expect(say(la('end_turn', 1, { discardIndices: [0, 2] }))).toBe('Computer ended the turn, discarding 2 cards.')
    expect(say(la('end_turn', 0, { discardIndices: [] }))).toBe('You ended the turn.')
  })

  it('says when an action was Intercepted or redirected', () => {
    const before = emptyBoard()
    before[0][2] = piece('King', 0)
    expect(say(la('direct_move', 0, { type: 'direct_move', row: 0, lane: 2, toRow: 1, toLane: 2 }, { reactionFired: 'intercept' }), before))
      .toBe('You tried to move a King, but it was Intercepted.')
    expect(say(la('play_swap', 1, { type: 'play_swap' }, { reactionFired: 'intercept' })))
      .toBe('Computer tried to play Swap, but it was Intercepted.')

    const target = emptyBoard()
    target[2][2] = piece('Rook', 1)
    expect(say(la('play_buff', 0, { targetRow: 2, targetLane: 2, buffType: 'Shield' }, { reactionFired: 'reversal' }), target))
      .toBe('You put Shield on their Rook on c3, redirected by Reversal.')
  })
})
