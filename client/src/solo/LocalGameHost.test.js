import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chooseAction, chooseMulligan, playerToAct, seededRandom } from '@checkline/engine'
import { LocalGameHost, HUMAN } from './LocalGameHost'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// Records every event the host sends, as the game screen would receive them
function listen(host) {
  const events = []
  for (const event of ['game_starting', 'state_update', 'reaction_window', 'bodyguard_prompt', 'enslave_prompt', 'game_over', 'error']) {
    host.on(event, payload => events.push({ event, payload }))
  }
  return events
}

// Sends a player choice as the message the game screen would send for it
function sendAsPlayer(host, action) {
  switch (action.type) {
    case 'react':             return host.emit('play_reaction', action)
    case 'pass_reaction':     return host.emit('pass_reaction')
    case 'choose_bodyguard':  return host.emit('bodyguard_response', { bodyguardRow: action.row, bodyguardLane: action.lane })
    case 'decline_bodyguard': return host.emit('bodyguard_response', { decline: true })
    case 'place_enslaved':    return host.emit('enslave_response', { row: action.row, lane: action.lane })
    case 'discard_enslaved':  return host.emit('enslave_response', { discard: true })
    default:                  return host.emit('game_action', action)
  }
}

describe('LocalGameHost', () => {
  it('starts a game showing the player their own hand only', async () => {
    const host = new LocalGameHost({ playerName: 'Tester', random: seededRandom(1) })
    const events = listen(host)
    host.start()
    await vi.advanceTimersByTimeAsync(0)

    const { state } = events.find(e => e.event === 'game_starting').payload
    expect(state.phase).toBe('mulligan')
    expect(state.players.map(p => p.name)).toEqual(['Tester', 'Computer'])
    expect(state.players[0].hand).toHaveLength(5)
    expect(state.players[1].hand).toEqual({ count: 5, ids: expect.any(Array) })
    host.stop()
  })

  it('the computer does its mulligan and takes its turns on its own', async () => {
    const host = new LocalGameHost({ random: seededRandom(2) })
    const events = listen(host)
    host.start()
    host.emit('mulligan_done', { discardIndices: [] })
    await vi.advanceTimersByTimeAsync(5000)

    expect(host.game.phase).toBe('playing')
    // Whoever went first, the game is now waiting for the human
    expect(playerToAct(host.game)).toBe(HUMAN)
    expect(events.some(e => e.event === 'error')).toBe(false)
    host.stop()
  })

  it.each([3, 4, 5])('plays a complete game without errors (seed %i)', async seed => {
    const host = new LocalGameHost({ random: seededRandom(seed) })
    const events = listen(host)
    const humanRandom = seededRandom(seed + 100)
    host.start()
    await vi.advanceTimersByTimeAsync(0)
    host.emit('mulligan_done', { discardIndices: chooseMulligan(host.game, HUMAN) })

    for (let step = 0; step < 3000 && host.game.phase !== 'ended'; step++) {
      await vi.advanceTimersByTimeAsync(1000)
      if (host.game.phase === 'playing' && playerToAct(host.game) === HUMAN) {
        sendAsPlayer(host, chooseAction(host.game, HUMAN, { random: humanRandom }))
      }
    }

    expect(host.game.phase).toBe('ended')
    expect(events.filter(e => e.event === 'error')).toEqual([])
    expect(events.some(e => e.event === 'game_over')).toBe(true)
    host.stop()
  }, 60000)

  it('sends nothing more after stop()', async () => {
    const host = new LocalGameHost({ random: seededRandom(6) })
    const events = listen(host)
    host.start()
    host.stop()
    await vi.advanceTimersByTimeAsync(10000)
    expect(events).toEqual([])
  })
})
