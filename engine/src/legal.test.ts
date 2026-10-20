import { describe, it, expect } from 'vitest'
import { applyPlayerAction, newGame, type PlayerAction } from './game.js'
import { legalActions, playerToAct } from './legal.js'
import { seededRandom } from './random.js'
import type { GameState } from './state.js'
import { buffed, cards, makeGame, piece } from './testHelpers.js'
import type { Random, Side } from './types.js'

function play(state: GameState, side: Side, action: PlayerAction, random: Random = seededRandom(1)): GameState {
  const result = applyPlayerAction(state, side, action, random)
  if ('error' in result) throw new Error(`${result.error} (${JSON.stringify(action)})`)
  return result.state
}

// Every card in the game: deck, discard pile, hands, and cards on the board (pieces, Buffs, Debuffs)
function countCards(s: GameState): number {
  let n = s.deck.length + s.discardPile.length + s.players[0].hand.length + s.players[1].hand.length
  for (const p of s.board.flat()) if (p) n += (p.id !== undefined ? 1 : 0) + (p.buff ? 1 : 0) + (p.debuff ? 1 : 0)
  if (s.pending?.kind === 'enslave') n += 1
  return n
}

describe('legalActions', () => {
  it('offers each piece card on every empty square of the player\'s side', () => {
    const game = makeGame()
    game.board[0][2] = piece('King', 0)
    game.players[0].hand = cards('Rook')
    const places = legalActions(game, 0).filter(a => a.type === 'place')
    expect(places).toHaveLength(9)  // 10 squares on side 0, minus the King's
  })

  it('lists duplicate cards only once', () => {
    const game = makeGame()
    game.players[0].hand = cards('Pawn', 'Pawn')
    const places = legalActions(game, 0).filter(a => a.type === 'place')
    expect(places).toHaveLength(10)
  })

  it('does not let the King move into check', () => {
    const game = makeGame()
    game.board[0][2] = piece('King', 0)
    game.board[3][1] = piece('Rook', 1)
    const kingMoves = legalActions(game, 0).filter(a => a.type === 'direct_move')
    expect(kingMoves).not.toContainEqual(expect.objectContaining({ toLane: 1 }))
    expect(kingMoves).toContainEqual(expect.objectContaining({ toRow: 1, toLane: 2 }))
  })

  it('offers nothing to the player whose turn it is not', () => {
    const game = makeGame()
    game.players[1].hand = cards('Rook')
    expect(legalActions(game, 1)).toEqual([])
  })

  it('offers pass and Intercept to the opponent during a reaction window', () => {
    const game = makeGame()
    game.players[0].hand = cards('Rook')
    game.players[1].hand = cards('Intercept', 'Pawn')
    const announced = play(game, 0, { type: 'place', cardIndex: 0, row: 1, lane: 0 })

    expect(legalActions(announced, 0)).toEqual([])
    expect(legalActions(announced, 1)).toEqual([{ type: 'pass_reaction' }, { type: 'react', cardIndex: 0 }])
  })

  it('does not offer to decline a Bodyguard when the King is attacked', () => {
    const game = makeGame()
    game.board[1][2] = piece('Rook', 0)
    game.board[3][2] = piece('King', 1)
    game.board[3][1] = buffed('Knight', 1, 'Bodyguard')
    let state = play(game, 0, { type: 'direct_attack', row: 1, lane: 2, targetRow: 3, targetLane: 2 })
    state = play(state, 1, { type: 'pass_reaction' })

    expect(playerToAct(state)).toBe(1)
    expect(legalActions(state, 1)).toEqual([{ type: 'choose_bodyguard', row: 3, lane: 1 }])
  })

  it('requires discarding down to 5 cards to end the turn', () => {
    const game = makeGame({ turnPhase: 'discard' })
    game.players[0].hand = cards('Pawn', 'Rook', 'Knight', 'Bishop', 'Queen', 'Pin', 'Swap')
    const actions = legalActions(game, 0)
    expect(actions.every(a => a.type === 'end_turn' && a.discardIndices.length === 2)).toBe(true)
    expect(actions).toHaveLength(21)  // ways to choose 2 of 7
  })
})

describe('random self-play', () => {
  it('never gets stuck, never makes an illegal move, and never loses a card', () => {
    let finished = 0
    for (let seed = 1; seed <= 25; seed++) {
      const random = seededRandom(seed)
      let state = newGame(random)
      state = play(state, 0, { type: 'mulligan', discardIndices: [] }, random)
      state = play(state, 1, { type: 'mulligan', discardIndices: [0, 1] }, random)

      for (let step = 0; step < 400 && state.phase === 'playing'; step++) {
        const side = playerToAct(state)!
        const options = legalActions(state, side)
        expect(options.length, `no legal action for side ${side} at step ${step} of seed ${seed}`).toBeGreaterThan(0)

        const choice = options[Math.floor(random() * options.length)]!
        state = play(state, side, choice, random)
        expect(countCards(state), `card count after ${JSON.stringify(choice)}`).toBe(52)
      }
      if (state.phase === 'ended') finished++
    }
    // Random players rarely checkmate on purpose, but some games should still finish
    expect(finished).toBeGreaterThan(0)
  }, 60000)
})
