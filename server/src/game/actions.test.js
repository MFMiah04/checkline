import { describe, it, expect } from 'vitest'
import { applyPlace, applyDirectSacrifice, applyCycle, applyEndTurn } from './actions.js'
import { makeRoom, cards, piece, buffed } from './testHelpers.js'

describe('applyPlace', () => {
  it('places a piece on the player\'s side and spends an action', () => {
    const room = makeRoom()
    const player = room.players[0]
    player.hand = cards('Rook', 'Shield')

    const result = applyPlace(room, player, { cardIndex: 0, row: 1, lane: 3 })

    expect(result.error).toBeUndefined()
    expect(room.board[1][3]).toMatchObject({ type: 'Rook', owner: 0 })
    expect(player.hand.map(c => c.type)).toEqual(['Shield'])
    expect(room.actionsRemaining).toBe(1)
  })

  it('does not let a piece act on the turn it is placed', () => {
    const room = makeRoom()
    room.players[0].hand = cards('Rook')
    applyPlace(room, room.players[0], { cardIndex: 0, row: 1, lane: 3 })
    expect(room.board[1][3].canActThisTurn).toBe(false)
  })

  it('rejects placing on the opponent\'s side', () => {
    const room = makeRoom()
    room.players[0].hand = cards('Rook')
    const result = applyPlace(room, room.players[0], { cardIndex: 0, row: 2, lane: 3 })
    expect(result.error).toBeDefined()
    expect(room.board[2][3]).toBeNull()
    expect(room.actionsRemaining).toBe(2)
  })

  it('rejects placing on an occupied space', () => {
    const room = makeRoom()
    room.board[1][3] = piece('Pawn', 0)
    room.players[0].hand = cards('Rook')
    expect(applyPlace(room, room.players[0], { cardIndex: 0, row: 1, lane: 3 }).error).toBeDefined()
  })

  it('rejects a card that is not a piece', () => {
    const room = makeRoom()
    room.players[0].hand = cards('Shield')
    expect(applyPlace(room, room.players[0], { cardIndex: 0, row: 1, lane: 3 }).error).toBeDefined()
  })
})

describe('applyDirectSacrifice', () => {
  it('removes a Pawn, discards it with its Buff, and draws 1 card', () => {
    const room = makeRoom()
    room.board[1][0] = buffed('Pawn', 0, 'Shield')
    const player = room.players[0]

    applyDirectSacrifice(room, player, { row: 1, lane: 0 })

    expect(room.board[1][0]).toBeNull()
    expect(room.discardPile.map(c => c.type)).toEqual(expect.arrayContaining(['Pawn', 'Shield']))
    expect(player.hand).toHaveLength(1)
    expect(room.actionsRemaining).toBe(1)
  })

  it('draws 2 cards for a Rook', () => {
    const room = makeRoom()
    room.board[1][0] = piece('Rook', 0)
    applyDirectSacrifice(room, room.players[0], { row: 1, lane: 0 })
    expect(room.players[0].hand).toHaveLength(2)
  })

  it('draws 3 cards for a Queen', () => {
    const room = makeRoom()
    room.board[1][0] = piece('Queen', 0)
    applyDirectSacrifice(room, room.players[0], { row: 1, lane: 0 })
    expect(room.players[0].hand).toHaveLength(3)
  })

  it('rejects a piece that cannot act this turn', () => {
    const room = makeRoom()
    room.board[1][0] = piece('Rook', 0, { canActThisTurn: false })
    expect(applyDirectSacrifice(room, room.players[0], { row: 1, lane: 0 }).error).toBeDefined()
    expect(room.board[1][0]).not.toBeNull()
  })
})

describe('applyCycle', () => {
  it('discards the chosen card, draws one, and spends an action', () => {
    const room = makeRoom({ deck: cards('Queen') })
    const player = room.players[0]
    player.hand = cards('Pawn', 'Pin')

    applyCycle(room, player, { cardIndex: 1 })

    expect(player.hand.map(c => c.type)).toEqual(['Pawn', 'Queen'])
    expect(room.discardPile.map(c => c.type)).toEqual(['Pin'])
    expect(room.actionsRemaining).toBe(1)
  })
})

describe('applyEndTurn', () => {
  it('passes the turn and the next player draws a card', () => {
    const room = makeRoom()
    room.actionsRemaining = 0

    applyEndTurn(room, room.players[0], { discardIndices: [] })

    expect(room.currentTurn).toBe(1)
    expect(room.players[1].hand).toHaveLength(1)
    expect(room.actionsRemaining).toBe(2)
  })

  it('lets the next player\'s pieces act again', () => {
    const room = makeRoom()
    room.board[2][0] = piece('Rook', 1, { canActThisTurn: false })
    applyEndTurn(room, room.players[0], { discardIndices: [] })
    expect(room.board[2][0].canActThisTurn).toBe(true)
  })

  it('gives the next player 1 action after a Disrupt', () => {
    const room = makeRoom()
    room.disruptNextTurn = true
    applyEndTurn(room, room.players[0], { discardIndices: [] })
    expect(room.actionsRemaining).toBe(1)
  })

  it('requires discarding down to 5 cards', () => {
    const room = makeRoom()
    const player = room.players[0]
    player.hand = cards('Pawn', 'Pawn', 'Rook', 'Rook', 'Pin', 'Pin', 'Swap')

    expect(applyEndTurn(room, player, { discardIndices: [0] }).error).toBeDefined()
    expect(room.currentTurn).toBe(0)

    applyEndTurn(room, player, { discardIndices: [0, 1] })
    expect(player.hand).toHaveLength(5)
    expect(room.discardPile.map(c => c.type)).toEqual(['Pawn', 'Pawn'])
    expect(room.currentTurn).toBe(1)
  })

  it('ends the game in checkmate if the player\'s King is still in check', () => {
    const room = makeRoom()
    room.board[0][2] = piece('King', 0)
    room.board[3][2] = piece('Rook', 1)

    const result = applyEndTurn(room, room.players[0], { discardIndices: [] })

    expect(result.gameOver).toBe(true)
    expect(room.winner).toBe(1)
    expect(room.endReason).toBe('checkmate')
  })
})
