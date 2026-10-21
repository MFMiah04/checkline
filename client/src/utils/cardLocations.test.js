import { describe, it, expect } from 'vitest'
import { locateCards, planFlights } from './cardLocations'

const emptyBoard = () => Array.from({ length: 4 }, () => Array(5).fill(null))
const piece = (type, owner, id, extra = {}) => ({ type, owner, id, buff: null, debuff: null, canActThisTurn: false, ...extra })

// A small game: kings in place, side 0 holds a Rook (1) and a Shield (2), side 1 holds hidden cards 3 and 4
function game() {
  const board = emptyBoard()
  board[0][2] = piece('King', 0)
  board[3][2] = piece('King', 1)
  return {
    board,
    hands: [[{ id: 1, type: 'Rook' }, { id: 2, type: 'Shield' }], [3, 4]],
    discard: [],
  }
}

function flightsBetween(before, after) {
  return planFlights(locateCards(before), locateCards(after))
}

describe('planFlights', () => {
  it('flies a card from the hand to the square where it is placed', () => {
    const before = game()
    const after = game()
    after.hands[0] = [{ id: 2, type: 'Shield' }]
    after.board[0][0] = piece('Rook', 0, 1)

    expect(flightsBetween(before, after)).toEqual([
      { id: '1', from: { zone: 'hand', side: 0, type: 'Rook' }, to: { zone: 'board', square: '0,0', type: 'Rook', owner: 0 } },
    ])
  })

  it("flies an opponent's hidden card to the board", () => {
    const before = game()
    const after = game()
    after.hands[1] = [4]
    after.board[3][0] = piece('Knight', 1, 3)

    const [flight] = flightsBetween(before, after)
    expect(flight.from).toEqual({ zone: 'hand', side: 1, type: null })
    expect(flight.to).toMatchObject({ zone: 'board', square: '3,0', type: 'Knight' })
  })

  it('flies a moved piece between squares, including a King', () => {
    const before = game()
    const after = game()
    after.board[0][2] = null
    after.board[1][2] = piece('King', 0)

    expect(flightsBetween(before, after)).toEqual([
      { id: 'king-0', from: { zone: 'board', square: '0,2', type: 'King', owner: 0 }, to: { zone: 'board', square: '1,2', type: 'King', owner: 0 } },
    ])
  })

  it('flies a captured piece to the discard pile', () => {
    const before = game()
    before.board[2][0] = piece('Pawn', 1, 9)
    const after = game()
    after.discard = [{ id: 9, type: 'Pawn' }]

    expect(flightsBetween(before, after).map(f => [f.id, f.from.zone, f.to.zone])).toEqual([['9', 'board', 'discard']])
  })

  it('flies a Buff card onto the piece it is played on', () => {
    const before = game()
    before.board[1][1] = piece('Pawn', 0, 9)
    const after = game()
    after.hands[0] = [{ id: 1, type: 'Rook' }]
    after.board[1][1] = piece('Pawn', 0, 9, { buff: { type: 'Shield', id: 2 } })

    expect(flightsBetween(before, after).map(f => [f.id, f.from.zone, f.to.zone, f.to.square])).toEqual([['2', 'hand', 'status', '1,1']])
  })

  it('flies drawn cards from the deck, and cards shuffled in back to it', () => {
    const before = game()
    const after = game()
    after.hands[0] = [{ id: 1, type: 'Rook' }, { id: 2, type: 'Shield' }, { id: 7, type: 'Pin' }]
    after.hands[1] = [3]

    expect(flightsBetween(before, after).map(f => [f.id, f.from.zone, f.to.zone])).toEqual([
      ['7', 'deck', 'hand'],
      ['4', 'hand', 'deck'],
    ])
  })

  it('counts a card on the played spot as having left the hand', () => {
    const before = game()
    const after = game()
    after.stage = { id: 3, type: 'Swap' }

    expect(flightsBetween(before, after).map(f => [f.id, f.from.zone, f.to.zone])).toEqual([['3', 'hand', 'stage']])
  })

  it('ignores cards rearranged within a hand, and the first view of a game', () => {
    const before = game()
    const after = game()
    after.hands[0] = [...after.hands[0]].reverse()

    expect(flightsBetween(before, after)).toEqual([])
    expect(planFlights(new Map(), locateCards(game()))).toEqual([])
  })
})
