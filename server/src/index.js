import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import {
  createRoom, joinRoom, getRoom, getRoomByToken,
  getRoomBySocket, removeRoom, updateSocketId
} from './rooms.js'

const app = express()
app.use(cors())
app.get('/health', (_req, res) => res.json({ ok: true }))

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

const PORT = process.env.PORT || 3001

const disconnectTimers = new Map()

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
    // so joinRoom can evict them cleanly
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
    // Cancel any pending disconnect timer for this session
    if (disconnectTimers.has(clientToken)) {
      clearTimeout(disconnectTimers.get(clientToken))
      disconnectTimers.delete(clientToken)
    }

    const result = updateSocketId(clientToken, socket.id)  // also sets connected = true
    if (!result) return socket.emit('error', { message: 'Session expired. Please return to the home screen.' })

    const { room, player } = result
    socket.join(room.code)

    // Re-emit lobby state for lobby reconnects
    if (room.phase === 'lobby') {
      if (player.side === 0) {
        socket.emit('room_created', { code: room.code, token: clientToken })
        // Only show opponent if they're actually connected (not in grace period)
        if (room.players.length > 1 && room.players[1].connected) {
          socket.emit('opponent_joined', { name: room.players[1].name })
        }
      } else {
        socket.emit('room_joined', { code: room.code, hostName: room.players[0].name, token: clientToken })
        // Notify host that their opponent is back
        const host = room.players[0]
        if (host?.connected) {
          io.to(host.socketId).emit('opponent_joined', { name: player.name })
        }
      }
    }
    // Game reconnect handled in Phase 6
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
    io.to(room.code).emit('game_starting')
    // Full game state init in Phase 2
  })

  // ── Disconnect ─────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result

    player.connected = false  // mark as disconnected before starting grace period

    if (room.phase === 'lobby') {
      if (player.side === 0) {
        // Host left — 15s grace period for refresh/reconnect
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
        // Guest left — 15s grace period; notify host immediately
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
    // Full reset in Phase 6 — placeholder
    room.phase = 'mulligan'
    io.to(room.code).emit('game_starting')
  })
})

httpServer.listen(PORT, () => {
  console.log(`Checkline server running on port ${PORT}`)
})
