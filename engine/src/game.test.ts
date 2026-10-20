import { describe, it, expect } from 'vitest'
import { applyPlayerAction, newGame, playerView, reorderHand, resolveTimeout, type PlayerAction, type Step } from './game.js'
import { seededRandom } from './random.js'
import type { GameState } from './state.js'
import { buffed, cards, makeGame, piece } from './testHelpers.js'
import type { Side } from './types.js'

const random = seededRandom(7)

// Applies an action and fails the test if the engine returns an error
function play(state: GameState, side: Side, action: PlayerAction): { state: GameState; steps: Step[] } {
  const result = applyPlayerAction(state, side, action, random)
  if ('error' in result) throw new Error(`Unexpected error: ${result.error}`)
  return result
}

function playError(state: GameState, side: Side, action: PlayerAction): string {
  const result = applyPlayerAction(state, side, action, random)
  if (!('error' in result)) throw new Error('Expected an error')
  return result.error
}

// Announces an action and lets the opponent pass, as when they choose not to react
function playAndPass(state: GameState, side: Side, action: PlayerAction): { state: GameState; steps: Step[] } {
  const announced = play(state, side, action)
  return play(announced.state, (1 - side) as Side, { type: 'pass_reaction' })
}

function discardTypes(state: GameState): string[] {
  return state.discardPile.map(c => c.type)
}

describe('newGame', () => {
  it('deals 5 cards each, places both Kings, and starts in the mulligan phase', () => {
    const game = newGame(seededRandom(1))
    expect(game.phase).toBe('mulligan')
    expect(game.players[0].hand).toHaveLength(5)
    expect(game.players[1].hand).toHaveLength(5)
    expect(game.deck).toHaveLength(42)
    expect(game.board[0][2]).toMatchObject({ type: 'King', owner: 0 })
    expect(game.board[3][2]).toMatchObject({ type: 'King', owner: 1 })
  })

  it('is the same game for the same seed', () => {
    expect(newGame(seededRandom(5))).toEqual(newGame(seededRandom(5)))
  })
})

describe('mulligan', () => {
  it('replaces the chosen cards and starts the first turn once both players are done', () => {
    let game = newGame(seededRandom(2))
    const first = game.currentTurn
    const kept = game.players[0].hand.slice(2)

    game = play(game, 0, { type: 'mulligan', discardIndices: [0, 1] }).state
    expect(game.players[0].hand).toHaveLength(5)
    expect(game.players[0].hand.slice(0, 3)).toEqual(kept)
    expect(game.phase).toBe('mulligan')

    game = play(game, 1, { type: 'mulligan', discardIndices: [] }).state
    expect(game.phase).toBe('playing')
    expect(game.players[first].hand).toHaveLength(6)  // the first player has drawn
  })
})

describe('applyPlayerAction', () => {
  it('never changes the state it is given', () => {
    const game = makeGame()
    game.players[0].hand = cards('Rook')
    const before = structuredClone(game)
    playAndPass(game, 0, { type: 'place', cardIndex: 0, row: 1, lane: 0 })
    expect(game).toEqual(before)
  })

  it('rejects actions from the player whose turn it is not', () => {
    const game = makeGame()
    game.players[1].hand = cards('Rook')
    expect(playError(game, 1, { type: 'place', cardIndex: 0, row: 2, lane: 0 })).toBe('Not your turn.')
  })

  it('rejects an illegal action before the opponent is asked to react', () => {
    const game = makeGame()
    game.players[0].hand = cards('Rook')
    expect(playError(game, 0, { type: 'place', cardIndex: 0, row: 3, lane: 0 })).toBe('Must place on your own side.')
  })
})

describe('reaction window', () => {
  it('announces an action and carries it out when the opponent passes', () => {
    const game = makeGame()
    game.players[0].hand = cards('Rook')

    const announced = play(game, 0, { type: 'place', cardIndex: 0, row: 1, lane: 0 }).state
    const rookId = game.players[0].hand[0].id
    expect(announced.pending).toMatchObject({ kind: 'reaction', actorSide: 0, revealed: { pieceType: 'Rook', cardId: rookId } })
    expect(announced.board[1][0]).toBeNull()

    const resolved = play(announced, 1, { type: 'pass_reaction' }).state
    expect(resolved.pending).toBeNull()
    // The piece keeps its card's id, which lets the screen animate the card onto the board
    expect(resolved.board[1][0]).toMatchObject({ type: 'Rook', owner: 0, id: rookId })
  })

  it('passes automatically when the reaction timer runs out', () => {
    const game = makeGame()
    game.players[0].hand = cards('Rook')
    const announced = play(game, 0, { type: 'place', cardIndex: 0, row: 1, lane: 0 }).state
    const result = resolveTimeout(announced, random)
    expect('error' in result).toBe(false)
    if (!('error' in result)) expect(result.state.board[1][0]?.type).toBe('Rook')
  })

  it('Intercept cancels a card and locks it for the rest of the turn', () => {
    const game = makeGame()
    game.players[0].hand = cards('Rook')
    game.players[1].hand = cards('Intercept')

    const announced = play(game, 0, { type: 'place', cardIndex: 0, row: 1, lane: 0 }).state
    const result = play(announced, 1, { type: 'react', cardIndex: 0 })

    expect(result.state.board[1][0]).toBeNull()
    expect(result.state.players[0].hand.map(c => c.type)).toEqual(['Rook'])
    expect(result.state.actionsRemaining).toBe(2)
    expect(discardTypes(result.state)).toEqual(['Intercept'])
    expect(result.steps.at(-1)?.lastAction?.reactionFired).toBe('intercept')
    expect(playError(result.state, 0, { type: 'place', cardIndex: 0, row: 1, lane: 0 })).toMatch(/intercepted/)
  })

  it('Intercept on a direct action stops that piece acting this turn', () => {
    const game = makeGame()
    game.board[1][0] = piece('Rook', 0)
    game.players[1].hand = cards('Intercept')

    const announced = play(game, 0, { type: 'direct_move', row: 1, lane: 0, toRow: 1, toLane: 4 }).state
    const result = play(announced, 1, { type: 'react', cardIndex: 0 }).state

    expect(result.board[1][0]).toMatchObject({ type: 'Rook', canActThisTurn: false, interceptedThisTurn: true })
  })

  it('Reversal redirects a Buff to another valid piece', () => {
    const game = makeGame()
    game.board[1][0] = piece('Rook', 0)
    game.board[2][0] = piece('Pawn', 1)
    game.players[0].hand = cards('Shield')
    game.players[1].hand = cards('Reversal')

    const announced = play(game, 0, { type: 'play_buff', cardIndex: 0, targetRow: 1, targetLane: 0 }).state
    const result = play(announced, 1, { type: 'react', cardIndex: 0, targetRow: 2, targetLane: 0 })

    expect(result.state.board[1][0]?.buff).toBeNull()
    expect(result.state.board[2][0]?.buff?.type).toBe('Shield')
    expect(result.steps.at(-1)?.lastAction?.reactionFired).toBe('reversal')
  })

  it('keeps the window open if the Reversal target is invalid', () => {
    const game = makeGame()
    game.board[1][0] = piece('Rook', 0)
    game.players[0].hand = cards('Shield')
    game.players[1].hand = cards('Reversal')

    const announced = play(game, 0, { type: 'play_buff', cardIndex: 0, targetRow: 1, targetLane: 0 }).state
    expect(playError(announced, 1, { type: 'react', cardIndex: 0, targetRow: 1, targetLane: 0 })).toMatch(/Invalid Reversal target/)
  })

  it('finds the played card by id if the hand is reordered during the window', () => {
    const game = makeGame()
    game.players[0].hand = cards('Rook', 'Knight')
    const [rook, knight] = game.players[0].hand

    const announced = play(game, 0, { type: 'place', cardIndex: 0, row: 1, lane: 0 }).state
    const reordered = reorderHand(announced, 0, [knight!.id, rook!.id])!
    const resolved = play(reordered, 1, { type: 'pass_reaction' }).state

    expect(resolved.board[1][0]?.type).toBe('Rook')
    expect(resolved.players[0].hand.map(c => c.type)).toEqual(['Knight'])
  })

  it('skips the window for an action that takes the King out of check', () => {
    const game = makeGame()
    game.board[0][2] = piece('King', 0)
    game.board[3][2] = piece('Rook', 1)
    game.players[0].hand = cards('Pawn')

    const result = play(game, 0, { type: 'place', cardIndex: 0, row: 1, lane: 2 }).state
    expect(result.pending).toBeNull()
    expect(result.board[1][2]?.type).toBe('Pawn')
  })
})

describe('cards leave the game correctly', () => {
  it.each([
    ['Command', 'play_command'],
    ['Disrupt', 'play_disrupt'],
  ] as const)('puts a played %s card on the discard pile', (cardType, actionType) => {
    const game = makeGame()
    game.players[0].hand = cards(cardType)
    const result = playAndPass(game, 0, { type: actionType, cardIndex: 0 }).state
    expect(result.players[0].hand).toHaveLength(0)
    expect(discardTypes(result)).toEqual([cardType])
  })

  it('puts played control cards on the discard pile', () => {
    const game = makeGame()
    game.board[1][0] = piece('Rook', 0)
    game.board[1][1] = piece('Knight', 0)
    game.players[0].hand = cards('Swap', 'Reposition')

    let state = playAndPass(game, 0, { type: 'play_swap', cardIndex: 0, aRow: 1, aLane: 0, bRow: 1, bLane: 1 }).state
    state = playAndPass(state, 0, { type: 'play_reposition', cardIndex: 0, pieceRow: 1, pieceLane: 0, toRow: 0, toLane: 0 }).state

    expect(discardTypes(state)).toEqual(expect.arrayContaining(['Swap', 'Reposition']))
  })

  it('keeps every card in the game: none are lost or duplicated', () => {
    const countCards = (s: GameState) =>
      s.deck.length + s.discardPile.length + s.players[0].hand.length + s.players[1].hand.length +
      s.board.flat().reduce((n, p) => n + (p?.id !== undefined ? 1 : 0) + (p?.buff ? 1 : 0) + (p?.debuff ? 1 : 0), 0)

    const game = makeGame()
    game.board[1][0] = piece('Rook', 0, { id: 900, buff: { type: 'Shield', id: 901 } })
    game.board[2][0] = piece('Pawn', 1, { id: 902, debuff: { type: 'Pin', id: 903 } })
    game.players[0].hand = cards('Command', 'Disrupt', 'Purge')
    const before = countCards(game)

    let state = playAndPass(game, 0, { type: 'play_command', cardIndex: 0 }).state
    state = playAndPass(state, 0, { type: 'play_disrupt', cardIndex: 0 }).state
    state = playAndPass(state, 0, { type: 'play_purge', cardIndex: 0 }).state
    state = play(state, 0, { type: 'direct_sacrifice', row: 1, lane: 0 }).state
    state = play(state, 1, { type: 'pass_reaction' }).state

    expect(countCards(state)).toBe(before)
  })
})

describe('Buff and Debuff targets', () => {
  it('allows a Buff on an opponent\'s piece', () => {
    const game = makeGame()
    game.board[2][0] = piece('Pawn', 1)
    game.players[0].hand = cards('Shield')
    const result = playAndPass(game, 0, { type: 'play_buff', cardIndex: 0, targetRow: 2, targetLane: 0 }).state
    expect(result.board[2][0]?.buff?.type).toBe('Shield')
  })

  it('allows a Debuff on the player\'s own piece', () => {
    const game = makeGame()
    game.board[1][0] = piece('Pawn', 0)
    game.players[0].hand = cards('Pin')
    const result = playAndPass(game, 0, { type: 'play_debuff', cardIndex: 0, targetRow: 1, targetLane: 0 }).state
    expect(result.board[1][0]?.debuff?.type).toBe('Pin')
  })
})

describe('turn flow', () => {
  it('ends the turn automatically after the last action, as a separate step', () => {
    const game = makeGame({ actionsRemaining: 1 })
    game.players[0].hand = cards('Rook')

    const { state, steps } = playAndPass(game, 0, { type: 'place', cardIndex: 0, row: 1, lane: 0 })

    expect(steps.map(s => s.lastAction?.type)).toEqual(['place', 'end_turn'])
    expect(steps[0]!.state.currentTurn).toBe(0)
    expect(state.currentTurn).toBe(1)
    expect(state.players[1].hand).toHaveLength(1)
  })

  it('waits for a discard when the hand is over 5 cards at the end of the turn', () => {
    const game = makeGame({ actionsRemaining: 1 })
    game.players[0].hand = cards('Rook', 'Pawn', 'Pawn', 'Pawn', 'Pawn', 'Pawn', 'Pawn')

    const result = playAndPass(game, 0, { type: 'place', cardIndex: 0, row: 1, lane: 0 }).state
    expect(result.turnPhase).toBe('discard')
    expect(playError(result, 0, { type: 'cycle', cardIndex: 0 })).toMatch(/Discard down to 5/)

    const ended = play(result, 0, { type: 'end_turn', discardIndices: [0] }).state
    expect(ended.currentTurn).toBe(1)
  })

  it('ends the game in checkmate when the last action leaves the King in check', () => {
    const game = makeGame({ actionsRemaining: 1 })
    game.board[0][2] = piece('King', 0)
    game.board[3][2] = piece('Rook', 1)
    game.players[0].hand = cards('Pawn')

    const result = playAndPass(game, 0, { type: 'place', cardIndex: 0, row: 1, lane: 0 }).state
    expect(result).toMatchObject({ phase: 'ended', winner: 1, endReason: 'checkmate' })
  })

  it('a free Command at 0 actions gives one more action instead of ending the turn', () => {
    const game = makeGame({ actionsRemaining: 0 })
    game.players[0].hand = cards('Command')
    const result = playAndPass(game, 0, { type: 'play_command', cardIndex: 0 }).state
    expect(result.currentTurn).toBe(0)
    expect(result.actionsRemaining).toBe(1)
    expect(result.actionsMax).toBe(3)
  })

  it('forfeit ends the game for the other player', () => {
    const result = play(makeGame(), 0, { type: 'forfeit' }).state
    expect(result).toMatchObject({ phase: 'ended', winner: 1, endReason: 'forfeit' })
  })
})

describe('Bodyguard', () => {
  function attackNextToBodyguard(targetType: 'Pawn' | 'King') {
    const game = makeGame()
    game.board[1][2] = piece('Rook', 0)
    game.board[3][2] = piece(targetType, 1)
    game.board[3][1] = buffed('Knight', 1, 'Bodyguard')
    return playAndPass(game, 0, { type: 'direct_attack', row: 1, lane: 2, targetRow: 3, targetLane: 2 }).state
  }

  it('asks the defender, who can sacrifice the Bodyguard to save the piece', () => {
    const asked = attackNextToBodyguard('Pawn')
    expect(asked.pending).toMatchObject({ kind: 'bodyguard', isKingAttack: false })

    const saved = play(asked, 1, { type: 'choose_bodyguard', row: 3, lane: 1 }).state
    expect(saved.board[3][2]?.type).toBe('Pawn')
    expect(saved.board[3][1]).toBeNull()
    expect(discardTypes(saved)).toEqual(expect.arrayContaining(['Bodyguard']))
  })

  it('captures the piece if the defender declines', () => {
    const asked = attackNextToBodyguard('Pawn')
    const captured = play(asked, 1, { type: 'decline_bodyguard' }).state
    expect(captured.board[3][2]).toBeNull()
    expect(captured.board[3][1]?.type).toBe('Knight')
  })

  it('cannot be declined when the King is attacked, and is used automatically on timeout', () => {
    const asked = attackNextToBodyguard('King')
    expect(playError(asked, 1, { type: 'decline_bodyguard' })).toMatch(/protect the King/)

    const result = resolveTimeout(asked, random)
    if ('error' in result) throw new Error(result.error)
    expect(result.state.board[3][2]?.type).toBe('King')
    expect(result.state.board[3][1]).toBeNull()
  })
})

describe('Enslave', () => {
  it('lets the attacker place the captured piece on their side', () => {
    const game = makeGame()
    game.board[1][2] = buffed('Rook', 0, 'Enslave')
    game.board[3][2] = piece('Knight', 1, { id: 500 })

    const asked = playAndPass(game, 0, { type: 'direct_attack', row: 1, lane: 2, targetRow: 3, targetLane: 2 }).state
    expect(asked.pending?.kind).toBe('enslave')

    const placed = play(asked, 0, { type: 'place_enslaved', row: 0, lane: 0 }).state
    expect(placed.board[0][0]).toMatchObject({ type: 'Knight', owner: 0, canActThisTurn: false })
    expect(placed.board[1][2]?.buff).toBeNull()
  })
})

describe('playerView', () => {
  it('hides the deck and the opponent\'s cards', () => {
    const game = newGame(seededRandom(3))
    const view = playerView(game, 0)
    expect(view).not.toHaveProperty('deck')
    expect(view.deckSize).toBe(game.deck.length)
    expect(view.players[0]!.hand).toEqual(game.players[0].hand)
    expect(view.players[1]!.hand).toEqual({ count: 5, ids: game.players[1].hand.map(c => c.id) })
  })
})
