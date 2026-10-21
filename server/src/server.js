import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import {
  createRoom, joinRoom, getRoom, getRoomBySocket, removeRoom, updateSocketId
} from './rooms.js'
import {
  newGame, applyPlayerAction, resolveTimeout, reorderHand, playerView,
  REACTION_WINDOW_MS, REACTION_EXTRA_MS, BODYGUARD_MS, REVERSAL_CANCEL_MS,
} from '@checkline/engine'

// Builds the HTTP and Socket.io server. index.js starts it; tests start their own copies,
// passing a seeded random so the cards are the same every run.
export function createGameServer({ random = Math.random } = {}) {
  const app = express()
  app.use(cors())
  app.get('/health', (_req, res) => res.json({ ok: true }))

  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  })

  const disconnectTimers = new Map()
  const bodyguardTimers  = new Map()
  const reactionTimers   = new Map()

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

  // ── Sending state ────────────────────────────────────────────────────────────

  // The game as one player may see it, plus room details (names, avatars, rematch votes)
  function projectState(room, side, game = room.game) {
    const view = playerView(game, side)
    return {
      ...view,
      playAgainVotes: game.phase === 'ended' ? [...room.playAgainVotes] : [],
      players: view.players.map((p, i) => ({
        ...p,
        name: room.players[i]?.name,
        avatar: room.players[i]?.avatar ?? null,
      })),
    }
  }

  function emitState(room, game = room.game, lastAction = null) {
    room.players.forEach((p, i) => {
      io.to(p.socketId).emit('state_update', { state: projectState(room, i, game), lastAction })
    })
  }

  // The announced action as the opponent sees it in the reaction window
  function revealedAction(pending) {
    return { ...pending.action, ...pending.revealed }
  }

  // ── Applying engine results ──────────────────────────────────────────────────

  function clearTimer(timers, code) {
    if (timers.has(code)) {
      clearTimeout(timers.get(code))
      timers.delete(code)
    }
  }

  function startReactionTimer(room, ms) {
    clearTimer(reactionTimers, room.code)
    room.reactionExpiresAt = Date.now() + ms
    reactionTimers.set(room.code, setTimeout(() => {
      reactionTimers.delete(room.code)
      const current = getRoom(room.code)
      if (current?.game?.pending?.kind === 'reaction') commit(current, resolveTimeout(current.game, random))
    }, ms))
  }

  // Stores a successful engine result, sends each step to both players, and then
  // handles whatever the game is now waiting for (prompts and their timers).
  function commit(room, result) {
    if (result.error) return
    const before = room.game
    room.game = result.state
    for (const step of result.steps) emitState(room, step.state, step.lastAction)

    const game = room.game
    const pending = game.pending
    const isNew = pending && before?.pending?.kind !== pending.kind

    if (pending?.kind !== 'reaction') {
      clearTimer(reactionTimers, room.code)
      room.reactionFrozen = false
    }
    if (pending?.kind !== 'bodyguard') clearTimer(bodyguardTimers, room.code)

    if (game.phase === 'ended' && before?.phase !== 'ended') {
      io.to(room.code).emit('game_over', { winner: game.winner })
      return
    }

    if (isNew && pending.kind === 'bodyguard') {
      const defender = room.players[1 - pending.attackerSide]
      room.bodyguardExpiresAt = Date.now() + BODYGUARD_MS
      if (defender) {
        io.to(defender.socketId).emit('bodyguard_prompt', {
          options: pending.options,
          isKingAttack: pending.isKingAttack,
          targetType: pending.targetType,
          targetRow: pending.targetRow,
          targetLane: pending.targetLane,
          ms: BODYGUARD_MS
        })
      }
      bodyguardTimers.set(room.code, setTimeout(() => {
        bodyguardTimers.delete(room.code)
        const current = getRoom(room.code)
        if (current?.game?.pending?.kind === 'bodyguard') commit(current, resolveTimeout(current.game, random))
      }, BODYGUARD_MS))
    }

    if (isNew && pending.kind === 'enslave') {
      const attacker = room.players[pending.side]
      if (attacker) io.to(attacker.socketId).emit('enslave_prompt', { validSpaces: pending.validSpaces, pieceType: pending.piece.type })
    }
  }

  // Applies a player's input, reporting engine errors back to that player
  function act(socket, room, side, input) {
    const result = applyPlayerAction(room.game, side, input, random)
    if (result.error) {
      socket.emit('error', { message: result.error })
      return false
    }
    commit(room, result)
    return true
  }

  io.on('connection', socket => {
    // ── Session token ──────────────────────────────────────────────────
    const token = crypto.randomUUID()
    socket.emit('session_token', { token })

    // ── Create room ────────────────────────────────────────────────────
    socket.on('create_room', ({ name, avatar }) => {
      if (!name?.trim()) return socket.emit('error', { message: 'Name required.' })
      leaveCurrentRoom(socket)
      const room = createRoom(socket, name.trim(), token, avatar ?? null)
      socket.join(room.code)
      socket.emit('room_created', { code: room.code, token })
    })

    // ── Join room ──────────────────────────────────────────────────────
    socket.on('join_room', ({ name, code, avatar }) => {
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

      const result = joinRoom(code.trim().toUpperCase(), socket, name.trim(), token, avatar ?? null)
      if (result.error) return socket.emit('error', { message: result.error })

      const room = result.room
      socket.join(room.code)
      const host = room.players[0]

      socket.emit('room_joined', { code: room.code, hostName: host.name, hostAvatar: host.avatar ?? null, token })
      io.to(host.socketId).emit('opponent_joined', { name: name.trim(), avatar: room.players[1].avatar })
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
            socket.emit('opponent_joined', { name: room.players[1].name, avatar: room.players[1].avatar ?? null })
          }
        } else {
          socket.emit('room_joined', { code: room.code, hostName: room.players[0].name, hostAvatar: room.players[0].avatar ?? null, token: clientToken })
          const host = room.players[0]
          if (host?.connected) {
            io.to(host.socketId).emit('opponent_joined', { name: player.name, avatar: player.avatar ?? null })
          }
        }
        return
      }

      // In a game — send the current state and re-open any prompt this player was answering
      socket.emit('state_update', { state: projectState(room, player.side), lastAction: null })
      const pending = room.game.pending
      if (pending?.kind === 'enslave' && player.side === pending.side) {
        socket.emit('enslave_prompt', { validSpaces: pending.validSpaces, pieceType: pending.piece.type })
      }
      if (pending?.kind === 'bodyguard' && player.side === 1 - pending.attackerSide) {
        const ms = room.bodyguardExpiresAt ? Math.max(0, room.bodyguardExpiresAt - Date.now()) : 0
        socket.emit('bodyguard_prompt', {
          options: pending.options,
          isKingAttack: pending.isKingAttack,
          targetType: pending.targetType,
          targetRow: pending.targetRow,
          targetLane: pending.targetLane,
          ms
        })
      }
      if (pending?.kind === 'reaction' && player.side !== pending.actorSide) {
        const ms = room.reactionExpiresAt ? Math.max(0, room.reactionExpiresAt - Date.now()) : 0
        socket.emit('reaction_window', { action: revealedAction(pending), actorSide: pending.actorSide, ms })
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

      startNewGame(room)
    })

    function startNewGame(room) {
      room.phase = 'game'
      room.game = newGame(random)
      room.playAgainVotes = new Set()
      room.discardViewIndex = 0
      room.players.forEach((p, i) => {
        io.to(p.socketId).emit('game_starting', { state: projectState(room, i) })
      })
    }

    // ── Mulligan done ──────────────────────────────────────────────────
    socket.on('mulligan_done', ({ discardIndices }) => {
      const result = getRoomBySocket(socket.id)
      if (!result?.room.game) return
      const { room, player } = result
      commit(room, applyPlayerAction(room.game, player.side, { type: 'mulligan', discardIndices }, random))
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
        // In-game disconnect — notify opponent; the player can reconnect with their session token
        const opponent = room.players.find(p => p.socketId !== socket.id)
        if (opponent) io.to(opponent.socketId).emit('opponent_disconnected')
      }
    })

    // ── Visual state events (relayed to the opponent only) ─────────────
    function relayToOpponent(event, payload) {
      const result = getRoomBySocket(socket.id)
      if (!result) return
      const { room, player } = result
      const opponent = room.players.find(p => p.side !== player.side)
      if (opponent?.socketId) io.to(opponent.socketId).emit(event, payload)
    }

    socket.on('hover_card', ({ index }) => relayToOpponent('opponent_hover_card', { index }))
    socket.on('select_card_type', ({ cardType, cardId }) =>
      relayToOpponent('opponent_select_card_type', { cardType: cardType ?? null, cardId: cardId ?? null }))
    socket.on('hover_discard', ({ hovering }) => relayToOpponent('opponent_hover_discard', { hovering }))
    socket.on('hover_deck', ({ hovering }) => relayToOpponent('opponent_hover_deck', { hovering }))
    socket.on('hover_space', payload => relayToOpponent('opponent_hover_space', payload))
    socket.on('select_piece', payload => relayToOpponent('opponent_select_piece', payload))

    // ── Game action ────────────────────────────────────────────────────
    socket.on('game_action', payload => {
      const result = getRoomBySocket(socket.id)
      if (!result) return socket.emit('error', { message: 'Not in a room.' })
      const { room, player } = result
      if (!room.game) return socket.emit('error', { message: 'Game not in progress.' })

      const announced = applyPlayerAction(room.game, player.side, payload, random)
      if (announced.error) return socket.emit('error', { message: announced.error })

      const pending = announced.state.pending
      if (pending?.kind !== 'reaction') return commit(room, announced)

      // Every action gets the same short window, so it reveals nothing about the defender's hand
      const defender = room.players[1 - pending.actorSide]
      room.reactionFrozen = false
      room.moreTimeUsed = false
      io.to(defender.socketId).emit('reaction_window', { action: revealedAction(pending), actorSide: pending.actorSide, ms: REACTION_WINDOW_MS })
      commit(room, announced)
      startReactionTimer(room, REACTION_WINDOW_MS)
    })

    // ── Reactions ──────────────────────────────────────────────────────
    socket.on('play_reaction', ({ cardIndex, targetRow, targetLane }) => {
      const result = getRoomBySocket(socket.id)
      if (!result?.room.game) return
      const { room, player } = result
      act(socket, room, player.side, { type: 'react', cardIndex, targetRow, targetLane })
    })

    socket.on('pass_reaction', () => {
      const result = getRoomBySocket(socket.id)
      if (!result?.room.game) return
      const { room, player } = result
      const res = applyPlayerAction(room.game, player.side, { type: 'pass_reaction' }, random)
      if (!res.error) commit(room, res)
    })

    // Defender chose Reversal and is picking a target — pause the window
    socket.on('reversal_placing', () => {
      const result = getRoomBySocket(socket.id)
      if (!result) return
      const { room, player } = result
      const pending = room.game?.pending
      if (pending?.kind !== 'reaction' || player.side === pending.actorSide) return
      clearTimer(reactionTimers, room.code)
      room.reactionFrozen = true
    })

    // The defender asked for more time: once per reaction window
    socket.on('more_time', () => {
      const result = getRoomBySocket(socket.id)
      if (!result) return
      const { room, player } = result
      const pending = room.game?.pending
      if (pending?.kind !== 'reaction' || player.side === pending.actorSide || room.reactionFrozen || room.moreTimeUsed) return
      room.moreTimeUsed = true
      const ms = Math.max(0, room.reactionExpiresAt - Date.now()) + REACTION_EXTRA_MS
      startReactionTimer(room, ms)
      socket.emit('reaction_extended', { ms })
    })

    socket.on('reversal_cancel', () => {
      const result = getRoomBySocket(socket.id)
      if (!result) return
      const { room, player } = result
      const pending = room.game?.pending
      if (pending?.kind !== 'reaction' || player.side === pending.actorSide || !room.reactionFrozen) return
      room.reactionFrozen = false
      // Give them a little longer to pass or Intercept
      startReactionTimer(room, REVERSAL_CANCEL_MS)
      io.to(player.socketId).emit('reversal_cancelled', { ms: REVERSAL_CANCEL_MS })
    })

    // ── Enslave and Bodyguard responses ────────────────────────────────
    socket.on('enslave_response', ({ row, lane, discard }) => {
      const result = getRoomBySocket(socket.id)
      if (!result?.room.game) return
      const { room, player } = result
      act(socket, room, player.side, discard ? { type: 'discard_enslaved' } : { type: 'place_enslaved', row, lane })
    })

    socket.on('bodyguard_response', ({ bodyguardRow, bodyguardLane, decline }) => {
      const result = getRoomBySocket(socket.id)
      if (!result?.room.game) return
      const { room, player } = result
      act(socket, room, player.side, decline
        ? { type: 'decline_bodyguard' }
        : { type: 'choose_bodyguard', row: bodyguardRow, lane: bodyguardLane })
    })

    // ── Hand order ─────────────────────────────────────────────────────
    // Intermediate snaps while dragging go to the opponent only; the final drop updates everyone
    socket.on('hand_drag', ({ ids }) => {
      const result = getRoomBySocket(socket.id)
      if (!result?.room.game) return
      const { room, player } = result
      const next = reorderHand(room.game, player.side, ids)
      if (!next) return
      room.game = next
      const opponent = room.players.find(p => p.side !== player.side)
      if (opponent?.socketId) io.to(opponent.socketId).emit('opponent_hand_order', { ids })
    })

    socket.on('hand_reorder', ({ ids }) => {
      const result = getRoomBySocket(socket.id)
      if (!result?.room.game) return
      const { room, player } = result
      const next = reorderHand(room.game, player.side, ids)
      if (!next) return
      room.game = next
      emitState(room)
    })

    // ── Discard pile browse ────────────────────────────────────────────
    socket.on('browse_discard', ({ delta }) => {
      const result = getRoomBySocket(socket.id)
      if (!result?.room.game) return
      const { room, player } = result
      if (!Number.isInteger(delta) || Math.abs(delta) > 1) return
      const max = Math.max(0, room.game.discardPile.length - 1)
      room.discardViewIndex = Math.max(0, Math.min(max, room.discardViewIndex + delta))
      io.to(room.code).emit('discard_view', { index: room.discardViewIndex, browserId: player.side })
    })

    // ── Forfeit ────────────────────────────────────────────────────────
    socket.on('forfeit', () => {
      const result = getRoomBySocket(socket.id)
      if (!result?.room.game) return
      const { room, player } = result
      act(socket, room, player.side, { type: 'forfeit' })
    })

    // ── Play Again (voting) ────────────────────────────────────────────
    socket.on('play_again_vote', ({ vote }) => {
      const result = getRoomBySocket(socket.id)
      if (!result?.room.game) return
      const { room, player } = result
      if (room.game.phase !== 'ended') return

      if (vote) room.playAgainVotes.add(player.side)
      else room.playAgainVotes.delete(player.side)
      emitState(room)

      if (room.playAgainVotes.size === 2) startNewGame(room)
    })
  })

  return { httpServer, io }
}
