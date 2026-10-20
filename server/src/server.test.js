// Integration test: runs the real server and connects two players over Socket.io
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { io as connect } from 'socket.io-client'
import { createGameServer } from './server.js'

let server
let url
const sockets = []

beforeAll(async () => {
  server = createGameServer()
  await new Promise(resolve => server.httpServer.listen(0, resolve))
  url = `http://localhost:${server.httpServer.address().port}`
})

afterAll(async () => {
  sockets.forEach(s => s.disconnect())
  await new Promise(resolve => server.io.close(resolve))
})

function newPlayer() {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  sockets.push(socket)
  return socket
}

// Resolves with the next payload of an event, or fails after a timeout
function next(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 2000)
    socket.once(event, payload => { clearTimeout(timer); resolve(payload) })
  })
}

// Resolves with the first state_update whose state matches the condition
function waitForState(socket, matches) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('state_update', handler); reject(new Error('Timed out waiting for state')) }, 2000)
    function handler(payload) {
      if (!matches(payload.state)) return
      clearTimeout(timer)
      socket.off('state_update', handler)
      resolve(payload)
    }
    socket.on('state_update', handler)
  })
}

// Both players keep their opening hands; resolves with the state once the first turn starts
async function finishMulligan(host, guest) {
  const playing = waitForState(host, state => state.phase === 'playing')
  host.emit('mulligan_done', { discardIndices: [] })
  guest.emit('mulligan_done', { discardIndices: [] })
  return (await playing).state
}

// Creates a room, joins it, and starts the game. Returns both players and their first states.
async function startGame() {
  const host = newPlayer()
  const guest = newPlayer()

  const created = next(host, 'room_created')
  host.emit('create_room', { name: 'Host', avatar: null })
  const { code } = await created

  const joined = next(guest, 'room_joined')
  const opponentJoined = next(host, 'opponent_joined')
  guest.emit('join_room', { name: 'Guest', code, avatar: null })
  await Promise.all([joined, opponentJoined])

  const hostStart = next(host, 'game_starting')
  const guestStart = next(guest, 'game_starting')
  host.emit('start_game')
  const [{ state: hostState }, { state: guestState }] = await Promise.all([hostStart, guestStart])
  return { host, guest, hostState, guestState }
}

describe('game server', () => {
  it('answers health checks', async () => {
    const res = await fetch(`${url}/health`)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('starts a game with each player seeing only their own hand', async () => {
    const { hostState, guestState } = await startGame()

    expect(hostState.phase).toBe('mulligan')
    expect(hostState.players.map(p => p.name)).toEqual(['Host', 'Guest'])
    expect(hostState.players[0].hand).toHaveLength(5)
    expect(hostState.players[1].hand).toEqual({ count: 5, ids: expect.any(Array) })
    expect(guestState.players[1].hand).toHaveLength(5)
    expect(hostState).not.toHaveProperty('deck')
    expect(hostState.deckSize).toBe(42)
  })

  it('plays the mulligan, the first turn, and passes the turn', async () => {
    const { host, guest, hostState } = await startGame()
    const players = [host, guest]

    const state = await finishMulligan(host, guest)
    expect(state.phase).toBe('playing')

    const first = state.currentTurn
    const second = 1 - first
    expect(hostState.currentTurn).toBe(first)

    // The other player can't act out of turn
    const error = next(players[second], 'error')
    players[second].emit('game_action', { type: 'end_turn', discardIndices: [] })
    expect((await error).message).toBe('Not your turn.')

    // The first player has drawn to 6 cards, so must discard one to end the turn
    const update = next(players[second], 'state_update')
    players[first].emit('game_action', { type: 'end_turn', discardIndices: [0] })
    const { state: after, lastAction } = await update
    expect(lastAction.type).toBe('end_turn')
    expect(after.currentTurn).toBe(second)
    expect(after.discardPile).toHaveLength(1)
  })

  it('ends the game when a player forfeits', async () => {
    const { host, guest } = await startGame()
    await finishMulligan(host, guest)

    const over = next(guest, 'game_over')
    host.emit('forfeit')
    expect(await over).toEqual({ winner: 1 })
  })
})
