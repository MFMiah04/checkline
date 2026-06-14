import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import {
  createRoom, joinRoom, getRoom, getRoomByToken,
  getRoomBySocket, removeRoom, updateSocketId
} from './rooms.js'
import { initGameState, startTurn, projectState } from './game/gameState.js'
import { drawCard } from './game/deck.js'
import {
  applyPlace, applyDirectMove, applyDirectAttack, applyDirectSacrifice,
  applyCycle, applyCommand, applyDisrupt, applyEndTurn
} from './game/actions.js'

const app = express()
app.use(cors())
app.get('/health', (_req, res) => res.json({ ok: true }))

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

const PORT = process.env.PORT || 3001

const disconnectTimers = new Map()
const autoEndTimers   = new Map()
const AUTO_END_MS     = 5000

// Cleanly remove a socket from whatever room it's currently in.
// Used before create/join to prevent ghost slots when navigating between rooms.
function leaveCurrentRoom(socket) {
  const existing = getRoomBySocket(socket.id)
  if (!existing) return
  const { room, player } = existing
  if (player.side === 0) {
    const guest = room.players[1]
    if (guest) io.to(guest.socketId).emit('room_closed')
    removeRoom(room.code)
  } else {
    room.players.splice(1, 1)
    const host = room.players[0]
    if (host) io.to(host.socketId).emit('opponent_disconnected')
  }
  socket.leave(room.code)
}

function clearAutoEndTurn(code) {
  if (autoEndTimers.has(code)) {
    clearTimeout(autoEndTimers.get(code))
    autoEndTimers.delete(code)
  }
}

function scheduleAutoEndTurn(room) {
  const { code } = room
  clearAutoEndTurn(code)
  io.to(code).emit('auto_end_turn_pending', { ms: AUTO_END_MS })
  const timer = setTimeout(() => {
    autoEndTimers.delete(code)
    const currentRoom = getRoom(code)
    if (!currentRoom || currentRoom.phase !== 'playing') return
    if (currentRoom.turnPhase !== 'actions' || currentRoom.actionsRemaining > 0) return
    const player = currentRoom.players[currentRoom.currentTurn]
    const result = applyEndTurn(currentRoom, player, { discardIndices: [] })
    if (!result.error) emitStateUpdate(currentRoom, result.lastAction)
  }, AUTO_END_MS)
  autoEndTimers.set(code, timer)
}

// Emit the current projected state to both players in a room.
function emitStateUpdate(room, lastAction = null) {
  room.players.forEach((p, i) => {
    io.to(p.socketId).emit('state_update', { state: projectState(room, i), lastAction })
  })
}

io.on('connection', socket => {
  // ── Session token ──────────────────────────────────────────────────
  const token = crypto.randomUUID()
  socket.emit('session_token', { token })

  // ── Create room ────────────────────────────────────────────────────
  socket.on('create_room', ({ name }) => {
    if (!name?.trim()) return socket.emit('error', { message: 'Name required.' })
    leaveCurrentRoom(socket)
    const room = createRoom(socket, name.trim(), token)
    socket.join(room.code)
    socket.emit('room_created', { code: room.code, token })
  })

  // ── Join room ──────────────────────────────────────────────────────
  socket.on('join_room', ({ name, code }) => {
    if (!name?.trim()) return socket.emit('error', { message: 'Name required.' })
    if (!code?.trim()) return socket.emit('error', { message: 'Room code required.' })

    leaveCurrentRoom(socket)

    // If target room has a disconnected ghost in slot 1, cancel their grace period
    const targetRoom = getRoom(code.trim().toUpperCase())
    if (targetRoom?.players[1] && !targetRoom.players[1].connected) {
      const ghostToken = targetRoom.players[1].sessionToken
      if (disconnectTimers.has(ghostToken)) {
        clearTimeout(disconnectTimers.get(ghostToken))
        disconnectTimers.delete(ghostToken)
      }
    }

    const result = joinRoom(code.trim().toUpperCase(), socket, name.trim(), token)
    if (result.error) return socket.emit('error', { message: result.error })

    const room = result.room
    socket.join(room.code)
    const host = room.players[0]

    socket.emit('room_joined', { code: room.code, hostName: host.name, token })
    io.to(host.socketId).emit('opponent_joined', { name: name.trim() })
  })

  // ── Reconnect ──────────────────────────────────────────────────────
  socket.on('reconnect', ({ token: clientToken, code }) => {
    if (disconnectTimers.has(clientToken)) {
      clearTimeout(disconnectTimers.get(clientToken))
      disconnectTimers.delete(clientToken)
    }

    const result = updateSocketId(clientToken, socket.id)
    if (!result) return socket.emit('error', { message: 'Session expired. Please return to the home screen.' })

    const { room, player } = result
    socket.join(room.code)

    if (room.phase === 'lobby') {
      if (player.side === 0) {
        socket.emit('room_created', { code: room.code, token: clientToken })
        if (room.players.length > 1 && room.players[1].connected) {
          socket.emit('opponent_joined', { name: room.players[1].name })
        }
      } else {
        socket.emit('room_joined', { code: room.code, hostName: room.players[0].name, token: clientToken })
        const host = room.players[0]
        if (host?.connected) {
          io.to(host.socketId).emit('opponent_joined', { name: player.name })
        }
      }
    } else {
      // Mulligan, playing, or ended — send current game state
      socket.emit('state_update', { state: projectState(room, player.side), lastAction: null })
    }
  })

  // ── Start game ─────────────────────────────────────────────────────
  socket.on('start_game', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return socket.emit('error', { message: 'Not in a room.' })
    const { room, player } = result

    if (player.side !== 0) return socket.emit('error', { message: 'Only the host can start.' })
    if (room.players.length < 2) return socket.emit('error', { message: 'Need 2 players.' })
    if (!room.players[1].connected) return socket.emit('error', { message: 'Opponent is disconnected.' })
    if (room.phase !== 'lobby') return socket.emit('error', { message: 'Game already started.' })

    room.phase = 'mulligan'
    initGameState(room)

    room.players.forEach((p, i) => {
      io.to(p.socketId).emit('game_starting', { state: projectState(room, i) })
    })
  })

  // ── Mulligan done ──────────────────────────────────────────────────
  socket.on('mulligan_done', ({ discardIndices }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result

    if (room.phase !== 'mulligan') return
    if (player.mulliganDone) return

    // Validate and deduplicate indices
    const indices = [...new Set(
      (discardIndices || []).filter(i => Number.isInteger(i) && i >= 0 && i < player.hand.length)
    )].sort((a, b) => b - a)  // descending so splices don't shift later indices

    // Remove selected cards → discard pile
    const removed = indices.map(i => player.hand.splice(i, 1)[0])
    room.discardPile.push(...removed)

    // Draw replacements
    for (let i = 0; i < removed.length; i++) {
      const card = drawCard(room.deck, room.discardPile)
      if (card) player.hand.push(card)
    }

    player.mulliganDone = true
    emitStateUpdate(room)

    // Start game when both players have finished mulligan
    if (room.players.every(p => p.mulliganDone)) {
      startTurn(room)
      emitStateUpdate(room)
    }
  })

  // ── Disconnect ─────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result

    player.connected = false

    if (room.phase === 'lobby') {
      if (player.side === 0) {
        const playerToken = player.sessionToken
        const timer = setTimeout(() => {
          disconnectTimers.delete(playerToken)
          const currentRoom = getRoom(room.code)
          if (!currentRoom) return
          if (currentRoom.players[0]?.socketId === socket.id) {
            const guest = currentRoom.players[1]
            if (guest) io.to(guest.socketId).emit('room_closed')
            removeRoom(room.code)
          }
        }, 15000)
        disconnectTimers.set(playerToken, timer)
      } else {
        const playerToken = player.sessionToken
        const host = room.players[0]
        if (host?.connected) io.to(host.socketId).emit('opponent_disconnected')

        const timer = setTimeout(() => {
          disconnectTimers.delete(playerToken)
          const currentRoom = getRoom(room.code)
          if (!currentRoom) return
          const guest = currentRoom.players[1]
          if (guest?.socketId === socket.id) {
            currentRoom.players.splice(1, 1)
          }
        }, 15000)
        disconnectTimers.set(playerToken, timer)
      }
    } else {
      // In-game disconnect — notify opponent (Phase 6 handles reconnect)
      const opponent = room.players.find(p => p.socketId !== socket.id)
      if (opponent) io.to(opponent.socketId).emit('opponent_disconnected')
    }
  })

  // ── Visual state events ────────────────────────────────────────────
  socket.on('hover_card', ({ index }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    const opponent = room.players.find(p => p.side !== player.side)
    if (opponent) io.to(opponent.socketId).emit('opponent_hover_card', { index })
  })

  socket.on('hover_space', payload => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    const opponent = room.players.find(p => p.side !== player.side)
    if (opponent) io.to(opponent.socketId).emit('opponent_hover_space', payload)
  })

  socket.on('select_piece', payload => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    const opponent = room.players.find(p => p.side !== player.side)
    if (opponent) io.to(opponent.socketId).emit('opponent_select_piece', payload)
  })

  // ── Game action ────────────────────────────────────────────────────
  socket.on('game_action', payload => {
    const result = getRoomBySocket(socket.id)
    if (!result) return socket.emit('error', { message: 'Not in a room.' })
    const { room, player } = result

    if (room.phase !== 'playing') return socket.emit('error', { message: 'Game not in progress.' })
    if (player.side !== room.currentTurn) return socket.emit('error', { message: 'Not your turn.' })

    // Prompt gates (Phase 5)
    if (room.reactionWindowOpen || room.bodyguardPromptOpen || room.enslavePromptOpen)
      return socket.emit('error', { message: 'Waiting for a response.' })

    // During discard phase only end_turn is valid
    if (room.turnPhase === 'discard' && payload.type !== 'end_turn')
      return socket.emit('error', { message: 'Discard down to 5 cards first.' })

    // Any incoming action cancels the auto-end countdown
    clearAutoEndTurn(room.code)

    // Command / Disrupt require actions > 0 to play
    if ((payload.type === 'play_command' || payload.type === 'play_disrupt') && room.actionsRemaining === 0)
      return socket.emit('error', { message: 'No actions remaining.' })

    // Non-end_turn actions are blocked once actions are exhausted
    if (payload.type !== 'end_turn' && room.actionsRemaining <= 0)
      return socket.emit('error', { message: 'No actions remaining.' })

    let actionResult
    switch (payload.type) {
      case 'place':            actionResult = applyPlace(room, player, payload);           break
      case 'direct_move':      actionResult = applyDirectMove(room, player, payload);      break
      case 'direct_attack':    actionResult = applyDirectAttack(room, player, payload);    break
      case 'direct_sacrifice': actionResult = applyDirectSacrifice(room, player, payload); break
      case 'cycle':            actionResult = applyCycle(room, player, payload);           break
      case 'play_command':     actionResult = applyCommand(room, player, payload);         break
      case 'play_disrupt':     actionResult = applyDisrupt(room, player, payload);         break
      case 'end_turn':         actionResult = applyEndTurn(room, player, payload);         break
      default: return socket.emit('error', { message: 'Unknown action.' })
    }

    if (actionResult.error) return socket.emit('error', { message: actionResult.error })
    emitStateUpdate(room, actionResult.lastAction)

    // When actions hit 0 and hand is fine, start the auto-end countdown
    if (room.actionsRemaining === 0 && room.turnPhase === 'actions') {
      scheduleAutoEndTurn(room)
    }
  })

  // ── Play Again ─────────────────────────────────────────────────────
  socket.on('play_again_request', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    const opponent = room.players.find(p => p.side !== player.side)
    if (opponent) io.to(opponent.socketId).emit('play_again_requested')
  })

  socket.on('play_again_accept', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room } = result
    // Full reset in Phase 6
    room.phase = 'mulligan'
    initGameState(room)
    room.players.forEach((p, i) => {
      io.to(p.socketId).emit('game_starting', { state: projectState(room, i) })
    })
  })
})

httpServer.listen(PORT, () => {
  console.log(`Checkline server running on port ${PORT}`)
})
