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
  applyCycle, applyCommand, applyDisrupt, applyEndTurn,
  applyBuff, applyDebuff, applyReposition, applySwap,
  applyDispel, applyReturn, applyPurge,
  resolveCapture, discardToken
} from './game/actions.js'
import { findKing, isInCheck, isValidBuffTarget, isValidDebuffTarget, isCheckRemovalAction, hasBodyguardAdjacentToKing, isPinned, isFatigued, isValidMove, isValidAttack } from './game/rules.js'

const app = express()
app.use(cors())
app.get('/health', (_req, res) => res.json({ ok: true }))

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

const PORT = process.env.PORT || 3001

const disconnectTimers  = new Map()
const enslaveTimers     = new Map()
const bodyguardTimers   = new Map()
const reactionTimers     = new Map()

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

// Emit the current projected state to both players in a room.
function emitStateUpdate(room, lastAction = null) {
  room.players.forEach((p, i) => {
    io.to(p.socketId).emit('state_update', { state: projectState(room, i), lastAction })
  })
}

// Check if immediate checkmate applies after an action resolves; auto-end turn if 0 actions remain.
function checkAndScheduleAutoEnd(room) {
  if (room.actionsRemaining === 0 && room.turnPhase === 'actions') {
    const king = findKing(room.board, room.currentTurn)
    if (king && isInCheck(room.board, king.row, king.lane, room.currentTurn)) {
      if (!hasBodyguardAdjacentToKing(room.board, room.currentTurn)) {
        room.winner = 1 - room.currentTurn
        room.phase = 'ended'
        room.endReason = 'checkmate'
        emitStateUpdate(room)
        io.to(room.code).emit('game_over', { winner: room.winner })
        return
      }
    }
    // Auto-end turn instantly
    const currentPlayer = room.players[room.currentTurn]
    if (currentPlayer.hand.length > 5) {
      // Client must discard first — transition to discard phase
      room.turnPhase = 'discard'
      emitStateUpdate(room)
    } else {
      const endResult = applyEndTurn(room, currentPlayer, { discardIndices: [] })
      if (!endResult.error) {
        emitStateUpdate(room, endResult.lastAction)
        if (endResult.gameOver) {
          io.to(room.code).emit('game_over', { winner: room.winner })
        }
      }
    }
  }
}

function clearReactionTimer(code) {
  if (reactionTimers.has(code)) {
    clearTimeout(reactionTimers.get(code))
    reactionTimers.delete(code)
  }
}

function mkLastAction(type, actorSide, payload, reactionFired = null) {
  return { type, actorSide, payload, reactionFired, secondaryEffect: null }
}

function executePendingAction(room, reactionFired = null) {
  if (!room.pendingAction) return
  const { action, actorSide } = room.pendingAction
  room.pendingAction = null
  room.reactionWindowOpen = false
  room.reactionWindowExpiresAt = null
  room.reactionPaused = false
  room.reactionRemainingMs = null
  room.reactionFrozen = false

  const player = room.players[actorSide]
  let actionResult

  switch (action.type) {
    case 'place':            actionResult = applyPlace(room, player, action);           break
    case 'direct_move':      actionResult = applyDirectMove(room, player, action);      break
    case 'direct_attack':    actionResult = applyDirectAttack(room, player, action);    break
    case 'direct_sacrifice': actionResult = applyDirectSacrifice(room, player, action); break
    case 'play_buff':        actionResult = applyBuff(room, player, action);            break
    case 'play_debuff':      actionResult = applyDebuff(room, player, action);          break
    case 'play_reposition':  actionResult = applyReposition(room, player, action);      break
    case 'play_swap':        actionResult = applySwap(room, player, action);            break
    case 'play_dispel':      actionResult = applyDispel(room, player, action);          break
    case 'play_return':      actionResult = applyReturn(room, player, action);          break
    case 'play_purge':       actionResult = applyPurge(room, player, action);           break
    case 'play_command':
      room.actionsRemaining += 1
      room.actionsMax = (room.actionsMax ?? 2) + 1
      actionResult = { lastAction: mkLastAction('play_command', actorSide, action) }
      break
    case 'play_disrupt':
      room.disruptNextTurn = true
      actionResult = { lastAction: mkLastAction('play_disrupt', actorSide, action) }
      break
    default: return
  }

  if (actionResult?.error) {
    emitStateUpdate(room)
    checkAndScheduleAutoEnd(room)
    return
  }

  if (reactionFired && actionResult.lastAction) {
    actionResult.lastAction = { ...actionResult.lastAction, reactionFired }
  }

  emitStateUpdate(room, actionResult.lastAction)

  if (actionResult.gameOver) {
    io.to(room.code).emit('game_over', { winner: room.winner })
    return
  }

  if (actionResult.bodyguardPrompt) {
    const defenderSide = 1 - actorSide
    const defenderSocket = room.players[defenderSide]?.socketId
    if (defenderSocket) {
      io.to(defenderSocket).emit('bodyguard_prompt', {
        options: actionResult.options,
        isKingAttack: actionResult.isKingAttack,
        targetType: actionResult.targetType,
        targetRow: room.pendingBodyguard.targetRow,
        targetLane: room.pendingBodyguard.targetLane,
        ms: 15000
      })
    }
    const bgTimer = setTimeout(() => {
      bodyguardTimers.delete(room.code)
      const currentRoom = getRoom(room.code)
      if (!currentRoom || !currentRoom.bodyguardPromptOpen) return
      const { pendingBodyguard } = currentRoom
      if (pendingBodyguard.isKingAttack) {
        const bg = pendingBodyguard.options[0]
        const bgPiece = currentRoom.board[bg.row][bg.lane]
        if (bgPiece) {
          discardToken(currentRoom, bgPiece.buff)
          bgPiece.buff = null
          currentRoom.discardPile.unshift({ type: bgPiece.type, id: bgPiece.id })
          currentRoom.board[bg.row][bg.lane] = null
        }
        currentRoom.pendingBodyguard = null
        currentRoom.bodyguardPromptOpen = false
        currentRoom.bodyguardExpiresAt = null
        emitStateUpdate(currentRoom, mkLastAction('bodyguard_save', defenderSide, { auto: true }))
        checkAndScheduleAutoEnd(currentRoom)
      } else {
        const { attackerRow, attackerLane, targetRow: tRow, targetLane: tLane, attackerSide } = pendingBodyguard
        currentRoom.pendingBodyguard = null
        currentRoom.bodyguardPromptOpen = false
        currentRoom.bodyguardExpiresAt = null
        const captureResult = resolveCapture(currentRoom, attackerRow, attackerLane, tRow, tLane)
        emitStateUpdate(currentRoom, captureResult.lastAction)
        if (captureResult.enslavePrompt) {
          const attackerSocket = currentRoom.players[attackerSide]?.socketId
          if (attackerSocket) {
            io.to(attackerSocket).emit('enslave_prompt', { validSpaces: captureResult.validSpaces, pieceType: captureResult.pieceType })
          }
        } else {
          checkAndScheduleAutoEnd(currentRoom)
        }
      }
    }, 15000)
    bodyguardTimers.set(room.code, bgTimer)
    return
  }

  if (actionResult.enslavePrompt) {
    io.to(player.socketId).emit('enslave_prompt', { validSpaces: actionResult.validSpaces, pieceType: actionResult.pieceType })
    return
  }

  checkAndScheduleAutoEnd(room)
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
    } else {
      // Mulligan, playing, or ended — send current game state
      socket.emit('state_update', { state: projectState(room, player.side), lastAction: null })
      // Re-emit open enslave prompt if applicable
      if (room.enslavePromptOpen && player.side === room.currentTurn) {
        socket.emit('enslave_prompt', { validSpaces: room.pendingEnslaved.validSpaces, pieceType: room.pendingEnslaved.piece.type })
      }
      // Re-emit open bodyguard prompt to defending player
      if (room.bodyguardPromptOpen && room.pendingBodyguard &&
          player.side === 1 - room.pendingBodyguard.attackerSide) {
        const ms = room.bodyguardExpiresAt ? Math.max(0, room.bodyguardExpiresAt - Date.now()) : 0
        socket.emit('bodyguard_prompt', {
          options: room.pendingBodyguard.options,
          isKingAttack: room.pendingBodyguard.isKingAttack,
          targetType: room.pendingBodyguard.targetType,
          targetRow: room.pendingBodyguard.targetRow,
          targetLane: room.pendingBodyguard.targetLane,
          ms
        })
      }
      // Re-emit open reaction window to the opponent player
      if (room.reactionWindowOpen && room.pendingAction &&
          player.side !== room.pendingAction.actorSide) {
        const ms = room.reactionWindowExpiresAt
          ? Math.max(0, room.reactionWindowExpiresAt - Date.now())
          : 0
        socket.emit('reaction_window', { action: room.pendingAction.enrichedAction ?? room.pendingAction.action, actorSide: room.pendingAction.actorSide, ms })
      }
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

  socket.on('select_card_type', ({ cardType, cardId }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    const opponent = room.players.find(p => p.side !== player.side)
    if (opponent?.socketId) io.to(opponent.socketId).emit('opponent_select_card_type', { cardType: cardType ?? null, cardId: cardId ?? null })
  })

  socket.on('hover_discard', ({ hovering }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    const opponent = room.players.find(p => p.side !== player.side)
    if (opponent?.socketId) io.to(opponent.socketId).emit('opponent_hover_discard', { hovering })
  })

  socket.on('hover_deck', ({ hovering }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    const opponent = room.players.find(p => p.side !== player.side)
    if (opponent?.socketId) io.to(opponent.socketId).emit('opponent_hover_deck', { hovering })
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

    // Prompt gates
    if (room.reactionWindowOpen || room.bodyguardPromptOpen || room.enslavePromptOpen)
      return socket.emit('error', { message: 'Waiting for a response.' })

    // During discard phase only end_turn is valid
    if (room.turnPhase === 'discard' && payload.type !== 'end_turn')
      return socket.emit('error', { message: 'Discard down to 5 cards first.' })

    // Free actions (Command/Disrupt) are playable even at 0 actions remaining
    const isFreeAction = payload.type === 'play_command' || payload.type === 'play_disrupt'
    if (!isFreeAction && payload.type !== 'end_turn' && room.actionsRemaining <= 0)
      return socket.emit('error', { message: 'No actions remaining.' })

    // ── Shuffle into deck: free action, not interceptable ──
    if (payload.type === 'shuffle_into_deck') {
      const { cardIndex } = payload
      if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
        return socket.emit('error', { message: 'Invalid card index.' })
      const [card] = player.hand.splice(cardIndex, 1)
      const pos = Math.floor(Math.random() * (room.deck.length + 1))
      room.deck.splice(pos, 0, card)
      emitStateUpdate(room, { type: 'shuffle_into_deck', actorSide: player.side, payload: {} })
      return
    }

    // ── Cycle: not interceptable — execute immediately ──
    if (payload.type === 'cycle') {
      const actionResult = applyCycle(room, player, payload)
      if (actionResult.error) return socket.emit('error', { message: actionResult.error })
      emitStateUpdate(room, actionResult.lastAction)
      checkAndScheduleAutoEnd(room)
      return
    }

    // ── End turn: not interceptable — execute immediately ──
    if (payload.type === 'end_turn') {
      const actionResult = applyEndTurn(room, player, payload)
      if (actionResult.error) return socket.emit('error', { message: actionResult.error })
      emitStateUpdate(room, actionResult.lastAction)
      if (actionResult.gameOver) {
        io.to(room.code).emit('game_over', { winner: room.winner })
      }
      return
    }

    // ── Command/Disrupt: pre-apply card removal before reaction window ──
    if (payload.type === 'play_command') {
      if (room.commandUsedThisTurn) return socket.emit('error', { message: 'Command already used this turn.' })
      const idx = payload.cardIndex
      if (!Number.isInteger(idx) || idx < 0 || idx >= player.hand.length || player.hand[idx].type !== 'Command')
        return socket.emit('error', { message: 'Invalid Command card.' })
      player.hand.splice(idx, 1)
      room.commandUsedThisTurn = true
      // Effect (actionsRemaining += 1) fires after window in executePendingAction
    }
    if (payload.type === 'play_disrupt') {
      if (room.disruptUsedThisTurn) return socket.emit('error', { message: 'Disrupt already used this turn.' })
      const idx = payload.cardIndex
      if (!Number.isInteger(idx) || idx < 0 || idx >= player.hand.length || player.hand[idx].type !== 'Disrupt')
        return socket.emit('error', { message: 'Invalid Disrupt card.' })
      player.hand.splice(idx, 1)
      room.disruptUsedThisTurn = true
      // Effect (disruptNextTurn = true) fires after window in executePendingAction
    }

    // ── Pre-window validation (specific errors before opening reaction window) ──
    const PLACEABLE_TYPES = new Set(['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen'])
    if (payload.type === 'place') {
      const card = player.hand[payload.cardIndex]
      if (!card || !PLACEABLE_TYPES.has(card.type))
        return socket.emit('error', { message: 'Invalid card for placement.' })
      const ownRows = player.side === 0 ? [0, 1] : [2, 3]
      if (!Number.isInteger(payload.row) || !ownRows.includes(payload.row) || room.board[payload.row]?.[payload.lane] !== null)
        return socket.emit('error', { message: 'Can only place pieces on your own side of the board.' })
    }
    if (payload.type === 'direct_move') {
      const piece = room.board[payload.row]?.[payload.lane]
      if (!piece || piece.owner !== player.side)
        return socket.emit('error', { message: 'No friendly piece at that position.' })
      if (!piece.canActThisTurn)
        return socket.emit('error', { message: 'This piece cannot act this turn.' })
      if (isPinned(piece))
        return socket.emit('error', { message: 'Pinned pieces cannot move.' })
      if (!isValidMove(room.board, piece, payload.row, payload.lane, payload.toRow, payload.toLane))
        return socket.emit('error', { message: 'Invalid move.' })
    }
    if (payload.type === 'direct_attack') {
      const piece = room.board[payload.row]?.[payload.lane]
      if (!piece || piece.owner !== player.side)
        return socket.emit('error', { message: 'No friendly piece at that position.' })
      if (!piece.canActThisTurn)
        return socket.emit('error', { message: 'This piece cannot act this turn.' })
      if (isFatigued(piece))
        return socket.emit('error', { message: 'Fatigued pieces cannot attack.' })
      if (!isValidAttack(room.board, piece, payload.row, payload.lane, payload.targetRow, payload.targetLane))
        return socket.emit('error', { message: 'Invalid attack.' })
    }
    if (payload.type === 'play_buff') {
      const card = player.hand[payload.cardIndex]
      if (!card) return socket.emit('error', { message: 'Invalid card.' })
      const target = room.board[payload.targetRow]?.[payload.targetLane]
      if (!target || target.owner !== player.side || !isValidBuffTarget(target))
        return socket.emit('error', { message: 'Invalid buff target.' })
    }
    if (payload.type === 'play_debuff') {
      const card = player.hand[payload.cardIndex]
      if (!card) return socket.emit('error', { message: 'Invalid card.' })
      const target = room.board[payload.targetRow]?.[payload.targetLane]
      if (!target || target.owner === player.side || !isValidDebuffTarget(target))
        return socket.emit('error', { message: 'Invalid debuff target.' })
    }

    // ── Reject cards that were locked by Intercept earlier this turn ──
    const CARD_ACTION_TYPES = new Set(['place', 'play_buff', 'play_debuff', 'play_reposition', 'play_swap', 'play_dispel', 'play_return', 'play_purge'])
    if (CARD_ACTION_TYPES.has(payload.type) && Number.isInteger(payload.cardIndex)) {
      const card = player.hand[payload.cardIndex]
      if (card && room.interceptedCardIds.includes(card.id))
        return socket.emit('error', { message: 'That card was intercepted — you cannot play it again this turn.' })
    }

    // ── Build enriched action with visible info for the opponent ──
    const enrichedAction = { ...payload }
    if (payload.type === 'place') {
      const card = player.hand[payload.cardIndex]
      if (card) enrichedAction.pieceType = card.type
    } else if (payload.type === 'direct_move') {
      const p = room.board[payload.row]?.[payload.lane]
      if (p) { enrichedAction.pieceType = p.type; enrichedAction.toRow = payload.toRow; enrichedAction.toLane = payload.toLane }
    } else if (payload.type === 'direct_attack') {
      const p = room.board[payload.row]?.[payload.lane]
      const t = room.board[payload.targetRow]?.[payload.targetLane]
      if (p) enrichedAction.pieceType = p.type
      if (t) enrichedAction.targetType = t.type
    } else if (payload.type === 'direct_sacrifice') {
      const p = room.board[payload.row]?.[payload.lane]
      if (p) enrichedAction.pieceType = p.type
    } else if (payload.type === 'play_buff' || payload.type === 'play_debuff') {
      const card = player.hand[payload.cardIndex]
      const t = room.board[payload.targetRow]?.[payload.targetLane]
      if (t) enrichedAction.targetType = t.type
      if (card) enrichedAction.effectType = card.type
    } else if (payload.type === 'play_reposition') {
      const p = room.board[payload.pieceRow]?.[payload.pieceLane]
      if (p) enrichedAction.pieceType = p.type
    } else if (payload.type === 'play_return') {
      const p = room.board[payload.pieceRow]?.[payload.pieceLane]
      if (p) enrichedAction.pieceType = p.type
    } else if (payload.type === 'play_dispel') {
      const p = room.board[payload.targetRow]?.[payload.targetLane]
      if (p) enrichedAction.targetType = p.type
    }

    // ── Store pending action ──
    room.pendingAction = { action: payload, actorSide: player.side, enrichedAction }

    // ── Check removal actions bypass the reaction window ──
    const checkRemoval = isCheckRemovalAction(room, payload)
    if (checkRemoval) {
      executePendingAction(room)
      return
    }

    // ── Only open reaction window if defender has cursor on hand ──
    const defenderSide = 1 - player.side
    const defender = room.players[defenderSide]

    if (!defender || !defender.handHovered) {
      // Defender not hovering hand — resolve immediately
      executePendingAction(room)
      return
    }

    // ── Open reaction window (defender's cursor is on hand) ──
    const WINDOW_MS = 15000
    room.reactionWindowOpen = true
    room.reactionWindowExpiresAt = Date.now() + WINDOW_MS
    room.reactionFrozen = false

    const opponentSocket = defender.socketId
    if (opponentSocket) {
      io.to(opponentSocket).emit('reaction_window', { action: enrichedAction, actorSide: player.side, ms: WINDOW_MS })
    }

    // Emit state to both (shows pre-applied Command/Disrupt card removal if applicable)
    emitStateUpdate(room)

    const timer = setTimeout(() => {
      reactionTimers.delete(room.code)
      const currentRoom = getRoom(room.code)
      if (!currentRoom || !currentRoom.reactionWindowOpen) return
      executePendingAction(currentRoom)
    }, WINDOW_MS)
    reactionTimers.set(room.code, timer)
  })

  // ── Play reaction ──────────────────────────────────────────────────
  socket.on('play_reaction', ({ cardIndex, targetRow, targetLane }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result

    if (!room.reactionWindowOpen) return socket.emit('error', { message: 'No reaction window open.' })
    if (!room.pendingAction) return socket.emit('error', { message: 'No pending action.' })
    if (player.side === room.pendingAction.actorSide)
      return socket.emit('error', { message: 'You cannot react to your own action.' })

    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
      return socket.emit('error', { message: 'Invalid card index.' })

    const card = player.hand[cardIndex]
    if (card.type !== 'Intercept' && card.type !== 'Reversal')
      return socket.emit('error', { message: 'Not a reaction card.' })

    // Validate Reversal target BEFORE consuming card or closing window
    if (card.type === 'Reversal') {
      const { action } = room.pendingAction
      if (action.type === 'play_buff' || action.type === 'play_debuff') {
        const newTarget = room.board[targetRow]?.[targetLane]
        const redirectValid = action.type === 'play_buff'
          ? isValidBuffTarget(newTarget) && !(targetRow === action.targetRow && targetLane === action.targetLane)
          : isValidDebuffTarget(newTarget) && !(targetRow === action.targetRow && targetLane === action.targetLane)
        if (!redirectValid) {
          return socket.emit('error', { message: 'Invalid Reversal target — pick a valid highlighted piece.' })
          // Window stays open, card not consumed
        }
      }
    }

    clearReactionTimer(room.code)
    room.reactionWindowOpen = false
    room.reactionWindowExpiresAt = null
    room.reactionFrozen = false

    const { action, actorSide } = room.pendingAction
    room.pendingAction = null

    // Consume the reaction card
    player.hand.splice(cardIndex, 1)
    room.discardPile.unshift({ type: card.type, id: card.id })

    if (card.type === 'Intercept') {
      // Lock the specific card for the rest of the actor's turn,
      // or lock the directed piece if it was a direct action
      const actor = room.players[actorSide]
      const CARD_ACTION_TYPES = new Set(['place', 'play_buff', 'play_debuff', 'play_reposition', 'play_swap', 'play_dispel', 'play_return', 'play_purge'])
      if (CARD_ACTION_TYPES.has(action.type) && Number.isInteger(action.cardIndex)) {
        const interceptedCard = actor.hand[action.cardIndex]
        if (interceptedCard) room.interceptedCardIds.push(interceptedCard.id)
      } else if (['direct_move', 'direct_attack', 'direct_sacrifice'].includes(action.type)) {
        const piece = room.board[action.row]?.[action.lane]
        if (piece) { piece.canActThisTurn = false; piece.interceptedThisTurn = true }
      }
      const la = mkLastAction(action.type, actorSide, action, 'intercept')
      emitStateUpdate(room, la)
      checkAndScheduleAutoEnd(room)
      return
    }

    if (card.type === 'Reversal') {
      if (action.type !== 'play_buff' && action.type !== 'play_debuff') {
        // Not applicable — treat as pass (card consumed)
        room.pendingAction = { action, actorSide }
        executePendingAction(room)
        return
      }
      // Target already validated above — redirect
      const redirectedAction = { ...action, targetRow, targetLane }
      room.pendingAction = { action: redirectedAction, actorSide }
      executePendingAction(room, 'reversal')
    }
  })

  // ── Pass reaction ──────────────────────────────────────────────────
  socket.on('pass_reaction', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result

    if (!room.reactionWindowOpen) return
    if (!room.pendingAction) return
    if (player.side === room.pendingAction.actorSide) return

    clearReactionTimer(room.code)
    executePendingAction(room)
  })

  // ── Hand hover start (defender moves cursor onto hand) ────────────
  socket.on('hand_hover_start', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    player.handHovered = true
    if (!room.reactionWindowOpen || !room.pendingAction) return
    if (player.side === room.pendingAction.actorSide) return  // only defender
    if (room.reactionFrozen) return

    // Switch from 4× drain back to 1× drain: multiply remaining by 4
    const remaining = Math.max(0, room.reactionWindowExpiresAt - Date.now())
    clearReactionTimer(room.code)
    const newRemaining = Math.min(15000, remaining * 4)
    room.reactionWindowExpiresAt = Date.now() + newRemaining
    const timer = setTimeout(() => {
      reactionTimers.delete(room.code)
      const r = getRoom(room.code)
      if (!r || !r.reactionWindowOpen) return
      executePendingAction(r)
    }, newRemaining)
    reactionTimers.set(room.code, timer)
  })

  // ── Hand hover end (defender moves cursor off hand) ────────────────
  socket.on('hand_hover_end', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    player.handHovered = false
    if (!room.reactionWindowOpen || !room.pendingAction) return
    if (player.side === room.pendingAction.actorSide) return
    if (room.reactionFrozen) return

    // Switch from 1× to 4× drain: divide remaining by 4
    const remaining = Math.max(0, room.reactionWindowExpiresAt - Date.now())
    clearReactionTimer(room.code)
    const newRemaining = Math.max(500, Math.ceil(remaining / 4))
    room.reactionWindowExpiresAt = Date.now() + newRemaining
    const timer = setTimeout(() => {
      reactionTimers.delete(room.code)
      const r = getRoom(room.code)
      if (!r || !r.reactionWindowOpen) return
      executePendingAction(r)
    }, newRemaining)
    reactionTimers.set(room.code, timer)
  })

  // ── Reversal placing (defender selected Reversal, picking target — freeze timer) ──
  socket.on('reversal_placing', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    if (!room.reactionWindowOpen || !room.pendingAction) return
    if (player.side === room.pendingAction.actorSide) return
    clearReactionTimer(room.code)
    room.reactionFrozen = true
  })

  socket.on('reversal_cancel', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    if (!room.reactionWindowOpen || !room.pendingAction) return
    if (player.side === room.pendingAction.actorSide) return
    if (!room.reactionFrozen) return
    room.reactionFrozen = false
    // Restart timer with 10 seconds so they can still pass or intercept
    const CANCEL_MS = 10000
    const timer = setTimeout(() => {
      reactionTimers.delete(room.code)
      const currentRoom = getRoom(room.code)
      if (!currentRoom || !currentRoom.reactionWindowOpen) return
      executePendingAction(currentRoom)
    }, CANCEL_MS)
    reactionTimers.set(room.code, timer)
    io.to(player.socketId).emit('reversal_cancelled', { ms: CANCEL_MS })
  })

  // ── Enslave response ───────────────────────────────────────────────
  socket.on('enslave_response', ({ row, lane, discard }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result

    if (!room.enslavePromptOpen) return socket.emit('error', { message: 'No enslave prompt active.' })
    if (player.side !== room.currentTurn) return socket.emit('error', { message: 'Not your turn.' })

    const { piece, validSpaces } = room.pendingEnslaved

    if (!discard) {
      if (row === undefined || lane === undefined)
        return socket.emit('error', { message: 'Must choose a space or discard.' })
      if (!validSpaces.some(s => s.row === row && s.lane === lane))
        return socket.emit('error', { message: 'Invalid placement space.' })
      if (room.board[row][lane] !== null)
        return socket.emit('error', { message: 'Space is occupied.' })
      room.board[row][lane] = piece
    } else {
      room.discardPile.unshift({ type: piece.type, id: piece.id })
    }

    room.pendingEnslaved = null
    room.enslavePromptOpen = false

    emitStateUpdate(room)
    checkAndScheduleAutoEnd(room)
  })

  // ── Bodyguard response ────────────────────────────────────────────
  socket.on('bodyguard_response', ({ bodyguardRow, bodyguardLane, decline }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result

    if (!room.bodyguardPromptOpen) return socket.emit('error', { message: 'No bodyguard prompt active.' })
    if (player.side !== 1 - room.pendingBodyguard.attackerSide)
      return socket.emit('error', { message: 'Not your prompt.' })

    // Clear timer
    if (bodyguardTimers.has(room.code)) {
      clearTimeout(bodyguardTimers.get(room.code))
      bodyguardTimers.delete(room.code)
    }

    const { pendingBodyguard } = room

    if (!decline) {
      // Validate chosen bodyguard
      const validOption = pendingBodyguard.options.some(
        o => o.row === bodyguardRow && o.lane === bodyguardLane
      )
      if (!validOption) return socket.emit('error', { message: 'Invalid bodyguard choice.' })

      const bgPiece = room.board[bodyguardRow][bodyguardLane]
      if (bgPiece) {
        discardToken(room, bgPiece.buff)
        bgPiece.buff = null
        room.discardPile.unshift({ type: bgPiece.type, id: bgPiece.id })
        room.board[bodyguardRow][bodyguardLane] = null
      }
      room.pendingBodyguard = null
      room.bodyguardPromptOpen = false
      room.bodyguardExpiresAt = null
      emitStateUpdate(room, { type: 'bodyguard_save', actorSide: player.side, payload: { bodyguardRow, bodyguardLane }, reactionFired: null, secondaryEffect: null })
      checkAndScheduleAutoEnd(room)
    } else {
      // Decline — only allowed for non-King attacks
      if (pendingBodyguard.isKingAttack)
        return socket.emit('error', { message: 'Must choose a Bodyguard to protect the King.' })

      const { attackerRow, attackerLane, targetRow, targetLane, attackerSide } = pendingBodyguard
      room.pendingBodyguard = null
      room.bodyguardPromptOpen = false
      room.bodyguardExpiresAt = null
      const captureResult = resolveCapture(room, attackerRow, attackerLane, targetRow, targetLane)
      emitStateUpdate(room, captureResult.lastAction)
      if (captureResult.enslavePrompt) {
        const attackerSocket = room.players[attackerSide]?.socketId
        if (attackerSocket) {
          io.to(attackerSocket).emit('enslave_prompt', {
            validSpaces: captureResult.validSpaces,
            pieceType: captureResult.pieceType
          })
        }
      } else {
        checkAndScheduleAutoEnd(room)
      }
    }
  })

  // ── Forfeit ───────────────────────────────────────────────────────
  // ── Hand drag (intermediate snap — lightweight, opponent only) ────────
  socket.on('hand_drag', ({ ids }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    if (!Array.isArray(ids) || ids.length !== player.hand.length) return
    const handMap = new Map(player.hand.map(c => [c.id, c]))
    if (!ids.every(id => handMap.has(id))) return
    player.hand = ids.map(id => handMap.get(id))
    const opponent = room.players.find(p => p.side !== player.side)
    if (opponent?.socketId) {
      io.to(opponent.socketId).emit('opponent_hand_order', { ids })
    }
  })

  // ── Hand reorder (final drop — full state_update) ──────────────────
  socket.on('hand_reorder', ({ ids }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    if (!Array.isArray(ids) || ids.length !== player.hand.length) return
    const handMap = new Map(player.hand.map(c => [c.id, c]))
    if (!ids.every(id => handMap.has(id))) return
    player.hand = ids.map(id => handMap.get(id))
    emitStateUpdate(room)
  })

  // ── Discard pile browse ────────────────────────────────────────────
  socket.on('browse_discard', ({ delta }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    if (!Number.isInteger(delta) || Math.abs(delta) > 1) return
    const max = Math.max(0, room.discardPile.length - 1)
    room.discardViewIndex = Math.max(0, Math.min(max, (room.discardViewIndex ?? 0) + delta))
    io.to(room.code).emit('discard_view', { index: room.discardViewIndex, browserId: player.side })
  })

  socket.on('forfeit', () => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result
    if (room.phase !== 'playing') return
    room.winner = 1 - player.side
    room.phase = 'ended'
    room.endReason = 'forfeit'
    emitStateUpdate(room)
    io.to(room.code).emit('game_over', { winner: room.winner })
  })

  // ── Play Again (voting) ────────────────────────────────────────────
  socket.on('play_again_vote', ({ vote }) => {
    const result = getRoomBySocket(socket.id)
    if (!result) return
    const { room, player } = result

    if (room.phase !== 'ended') return
    if (!room.playAgainVotes) room.playAgainVotes = new Set()

    if (vote) {
      room.playAgainVotes.add(player.side)
    } else {
      room.playAgainVotes.delete(player.side)
    }

    emitStateUpdate(room)

    if (room.playAgainVotes.size === 2) {
      room.phase = 'mulligan'
      initGameState(room)
      room.players.forEach((p, i) => {
        io.to(p.socketId).emit('game_starting', { state: projectState(room, i) })
      })
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`Checkline server running on port ${PORT}`)
})
