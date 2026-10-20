import { describe, it, expect } from 'vitest'
import { chooseAction, chooseMulligan, evaluate } from './ai.js'
import { applyPlayerAction, newGame, type PlayerAction } from './game.js'
import { legalActions, playerToAct } from './legal.js'
import { seededRandom } from './random.js'
import type { GameState } from './state.js'
import { buffed, cards, makeGame, piece } from './testHelpers.js'
import type { Side } from './types.js'

const random = seededRandom(3)

function play(state: GameState, side: Side, action: PlayerAction): GameState {
  const result = applyPlayerAction(state, side, action, random)
  if ('error' in result) throw new Error(result.error)
  return result.state
}

describe('evaluate', () => {
  it('prefers having more material', () => {
    const game = makeGame()
    game.board[1][0] = piece('Queen', 0)
    expect(evaluate(game, 0)).toBeGreaterThan(evaluate(game, 1))
  })

  it('scores a won game above everything else', () => {
    expect(evaluate(makeGame({ phase: 'ended', winner: 0 }), 0)).toBe(10000)
    expect(evaluate(makeGame({ phase: 'ended', winner: 0 }), 1)).toBe(-10000)
  })
})

describe('chooseAction', () => {
  it('captures an undefended Queen', () => {
    const game = makeGame()
    game.board[1][0] = piece('Rook', 0)
    game.board[3][0] = piece('Queen', 1)
    game.players[0].hand = cards('Pawn')
    expect(chooseAction(game, 0, { random })).toEqual({ type: 'direct_attack', row: 1, lane: 0, targetRow: 3, targetLane: 0 })
  })

  it('gets the King out of check', () => {
    const game = makeGame({ actionsRemaining: 1 })
    game.board[0][2] = piece('King', 0)
    game.board[3][2] = piece('Rook', 1)
    game.players[0].hand = cards('Pawn')

    const after = play(game, 0, chooseAction(game, 0, { random })!)
    const settled = after.pending ? play(after, 1, { type: 'pass_reaction' }) : after
    expect(settled.phase).toBe('playing')
    expect(settled.winner).toBeNull()
  })

  it('Intercepts an attack on its Queen', () => {
    const game = makeGame()
    game.board[1][0] = piece('Rook', 0)
    game.board[3][0] = piece('Queen', 1)
    game.players[1].hand = cards('Intercept')
    const announced = play(game, 0, { type: 'direct_attack', row: 1, lane: 0, targetRow: 3, targetLane: 0 })
    expect(chooseAction(announced, 1, { random })).toEqual({ type: 'react', cardIndex: 0 })
  })

  it('passes when a reaction is not worth a card', () => {
    const game = makeGame()
    game.players[0].hand = cards('Pawn')
    game.players[1].hand = cards('Intercept')
    const placing = play(game, 0, { type: 'place', cardIndex: 0, row: 0, lane: 0 })
    expect(chooseAction(placing, 1, { random })).toEqual({ type: 'pass_reaction' })
  })

  it('sacrifices a Pawn Bodyguard to save a Queen', () => {
    const game = makeGame()
    game.board[1][0] = piece('Rook', 0)
    game.board[3][0] = piece('Queen', 1)
    game.board[3][1] = buffed('Pawn', 1, 'Bodyguard')
    let state = play(game, 0, { type: 'direct_attack', row: 1, lane: 0, targetRow: 3, targetLane: 0 })
    state = play(state, 1, { type: 'pass_reaction' })
    expect(chooseAction(state, 1, { random })).toEqual({ type: 'choose_bodyguard', row: 3, lane: 1 })
  })

  it('does not use hidden information: moving cards between the deck and the opponent\'s hand changes nothing', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = newGame(seededRandom(seed))
      game.phase = 'playing'
      game.currentTurn = 0

      // Swap the opponent's hand with the top of the deck: the same cards stay hidden, in different places
      const other = structuredClone(game)
      const hand = other.players[1].hand
      other.players[1].hand = other.deck.splice(-hand.length, hand.length, ...hand)

      expect(chooseAction(other, 0, { random: seededRandom(4) }), `seed ${seed}`)
        .toEqual(chooseAction(game, 0, { random: seededRandom(4) }))
    }
  })

  it('returns null when it is not this player\'s decision', () => {
    expect(chooseAction(makeGame(), 1, { random })).toBeNull()
  })
})

describe('chooseMulligan', () => {
  it('keeps a hand with at least two pieces', () => {
    const game = makeGame()
    game.players[0].hand = cards('Pawn', 'Rook', 'Pin', 'Purge', 'Dispel')
    expect(chooseMulligan(game, 0)).toEqual([])
  })

  it('swaps out the weakest cards when short of pieces', () => {
    const game = makeGame()
    game.players[0].hand = cards('Queen', 'Command', 'Purge', 'Dispel', 'Shield')
    const discards = chooseMulligan(game, 0).map(i => game.players[0].hand[i]!.type).sort()
    expect(discards).toEqual(['Dispel', 'Purge'])
  })
})

// Plays a full game between two kinds of player and returns the winner (or null if unfinished)
function playGame(seed: number, players: ['ai' | 'random', 'ai' | 'random']): Side | null {
  const rng = seededRandom(seed)
  let state = newGame(rng)
  for (const side of [0, 1] as const) {
    const discardIndices = players[side] === 'ai' ? chooseMulligan(state, side) : []
    state = play(state, side, { type: 'mulligan', discardIndices })
  }
  for (let step = 0; step < 1500 && state.phase === 'playing'; step++) {
    const side = playerToAct(state)!
    let action: PlayerAction | null
    if (players[side] === 'ai') {
      action = chooseAction(state, side, { random: rng })
    } else {
      const options = legalActions(state, side)
      action = options[Math.floor(rng() * options.length)]!
    }
    expect(action).not.toBeNull()
    state = play(state, side, action!)
  }
  return state.phase === 'ended' ? state.winner : null
}

describe('full games', () => {
  it('beats a random player', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const aiSide = (seed % 2) as Side
      const players: ['ai' | 'random', 'ai' | 'random'] = aiSide === 0 ? ['ai', 'random'] : ['random', 'ai']
      expect(playGame(seed, players), `seed ${seed}`).toBe(aiSide)
    }
  }, 60000)

  it('finishes games against itself', () => {
    for (let seed = 100; seed <= 103; seed++) {
      expect(playGame(seed, ['ai', 'ai']), `seed ${seed}`).not.toBeNull()
    }
  }, 60000)
})
