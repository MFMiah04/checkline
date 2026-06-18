import {
  isValidMove, isValidAttack, isValidReposition, isValidSwap,
  isValidBuffTarget, isValidDebuffTarget,
  isPinned, isFatigued, findKing, isInCheck, hasLegalCheckRemoval,
  hasBodyguardAdjacentToKing,
  getBodyguardOptions
} from './rules.js'
import { drawCard } from './deck.js'
import { startTurn } from './gameState.js'
import { PIECE_TYPES } from './cards.js'

const BUFF_TYPES   = new Set(['Enslave', 'Shield', 'Bodyguard', 'Protection'])
const DEBUFF_TYPES = new Set(['Pin', 'Fatigue', 'Silence'])

function spendAction(room, player) {
  room.actionsRemaining -= 1
  // Discard phase is now entered by the auto-end timer, not immediately
}

function lastAction(type, actorSide, payload) {
  return { type, actorSide, payload, reactionFired: null, secondaryEffect: null }
}

export function discardToken(room, token) {
  if (token) room.discardPile.unshift({ type: token.type, id: token.id })
}

// ── Place ─────────────────────────────────────────────────────────────────────

export function applyPlace(room, player, { cardIndex, row, lane }) {
  const hand = player.hand
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= hand.length)
    return { error: 'Invalid card index.' }

  const card = hand[cardIndex]
  if (!PIECE_TYPES.has(card.type)) return { error: 'Not a piece card.' }
  if (card.type === 'King') return { error: 'Cannot place the King.' }

  if (row < 0 || row > 3 || lane < 0 || lane > 4) return { error: 'Invalid position.' }

  const ownRows = player.side === 0 ? [0, 1] : [2, 3]
  if (!ownRows.includes(row)) return { error: 'Must place on your own side.' }
  if (room.board[row][lane] !== null) return { error: 'Space is occupied.' }

  room.board[row][lane] = {
    id: card.id, type: card.type, owner: player.side,
    buff: null, debuff: null, canActThisTurn: false
  }
  hand.splice(cardIndex, 1)
  spendAction(room, player)

  return { lastAction: lastAction('place', player.side, { cardIndex, row, lane, pieceType: card.type }) }
}

// ── Direct move ───────────────────────────────────────────────────────────────

export function applyDirectMove(room, player, { row, lane, toRow, toLane }) {
  const piece = room.board[row]?.[lane]
  if (!piece) return { error: 'No piece at that position.' }
  if (piece.owner !== player.side) return { error: 'Not your piece.' }
  if (!piece.canActThisTurn) return { error: 'This piece cannot act this turn.' }
  if (isPinned(piece)) return { error: 'This piece is Pinned.' }

  if (!isValidMove(room.board, piece, row, lane, toRow, toLane))
    return { error: 'Invalid move.' }

  room.board[toRow][toLane] = piece
  room.board[row][lane] = null
  piece.canActThisTurn = false
  spendAction(room, player)

  return { lastAction: lastAction('direct_move', player.side, { row, lane, toRow, toLane }) }
}

// ── Direct attack ─────────────────────────────────────────────────────────────

export function applyDirectAttack(room, player, { row, lane, targetRow, targetLane }) {
  const piece = room.board[row]?.[lane]
  if (!piece) return { error: 'No piece at that position.' }
  if (piece.owner !== player.side) return { error: 'Not your piece.' }
  if (!piece.canActThisTurn) return { error: 'This piece cannot act this turn.' }
  if (isFatigued(piece)) return { error: 'This piece is Fatigued.' }

  if (!isValidAttack(room.board, piece, row, lane, targetRow, targetLane))
    return { error: 'Invalid attack.' }

  const captured = room.board[targetRow][targetLane]
  const la = lastAction('direct_attack', player.side, { row, lane, targetRow, targetLane })

  // Shield: absorbs the attack — piece survives, Shield is discarded
  if (captured.buff?.type === 'Shield') {
    discardToken(room, captured.buff)
    captured.buff = null
    piece.canActThisTurn = false
    spendAction(room, player)
    return { lastAction: { ...la, secondaryEffect: 'shield_absorbed' } }
  }

  // Bodyguard protection
  const bgOptions = getBodyguardOptions(room.board, targetRow, targetLane, captured.owner)
  if (bgOptions.length > 0) {
    piece.canActThisTurn = false
    spendAction(room, player)
    room.pendingBodyguard = {
      attackerRow: row, attackerLane: lane,
      attackerSide: player.side,
      targetRow, targetLane,
      targetType: captured.type,
      isKingAttack: captured.type === 'King',
      options: bgOptions
    }
    room.bodyguardPromptOpen = true
    room.bodyguardExpiresAt = Date.now() + 15000
    return { lastAction: la, bodyguardPrompt: true, options: bgOptions,
             isKingAttack: captured.type === 'King', targetType: captured.type }
  }

  // Enslave: capture the piece and give it to the attacker
  if (piece.buff?.type === 'Enslave') {
    // Strip captured piece's tokens and change ownership
    discardToken(room, captured.buff)
    discardToken(room, captured.debuff)
    captured.buff = null
    captured.debuff = null
    captured.owner = player.side
    captured.canActThisTurn = false
    // Remove from board pending placement decision
    room.board[targetRow][targetLane] = null
    // Compute valid empty spaces on attacker's side
    const ownRows = player.side === 0 ? [0, 1] : [2, 3]
    const validSpaces = []
    for (const r of ownRows)
      for (let l = 0; l <= 4; l++)
        if (!room.board[r][l]) validSpaces.push({ row: r, lane: l })
    // Discard Enslave buff from attacker
    discardToken(room, piece.buff)
    piece.buff = null
    piece.canActThisTurn = false
    spendAction(room, player)

    if (validSpaces.length > 0) {
      room.pendingEnslaved = { piece: captured, validSpaces, attackerRow: row, attackerLane: lane }
      room.enslavePromptOpen = true
      return { lastAction: { ...la, secondaryEffect: 'enslave_placed' }, enslavePrompt: true, validSpaces, pieceType: captured.type }
    } else {
      room.discardPile.unshift({ type: captured.type, id: captured.id })
      return { lastAction: { ...la, secondaryEffect: 'enslave_placed' } }
    }
  }

  // Default capture
  discardToken(room, captured.buff)
  discardToken(room, captured.debuff)
  room.discardPile.unshift({ type: captured.type, id: captured.id })
  room.board[targetRow][targetLane] = null
  piece.canActThisTurn = false
  spendAction(room, player)

  return { lastAction: la }
}

// ── Direct sacrifice ──────────────────────────────────────────────────────────

export function applyDirectSacrifice(room, player, { row, lane }) {
  const piece = room.board[row]?.[lane]
  if (!piece) return { error: 'No piece at that position.' }
  if (piece.owner !== player.side) return { error: 'Not your piece.' }
  if (piece.type === 'King') return { error: 'Cannot sacrifice the King.' }
  if (!piece.canActThisTurn) return { error: 'This piece cannot act this turn.' }

  const drawCount = piece.type === 'Pawn' ? 1 : piece.type === 'Queen' ? 3 : 2

  discardToken(room, piece.buff)
  discardToken(room, piece.debuff)
  room.discardPile.unshift({ type: piece.type, id: piece.id })
  room.board[row][lane] = null

  for (let i = 0; i < drawCount; i++) {
    const card = drawCard(room.deck, room.discardPile)
    if (card) player.hand.push(card)
  }

  spendAction(room, player)

  return { lastAction: lastAction('direct_sacrifice', player.side, { row, lane, pieceType: piece.type, drawCount }) }
}

// ── Cycle ─────────────────────────────────────────────────────────────────────

export function applyCycle(room, player, { cardIndex }) {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
    return { error: 'Invalid card index.' }

  const [discarded] = player.hand.splice(cardIndex, 1)
  room.discardPile.unshift(discarded)

  const card = drawCard(room.deck, room.discardPile)
  if (card) player.hand.push(card)

  spendAction(room, player)

  return { lastAction: lastAction('cycle', player.side, { cardIndex }) }
}

// ── Command (free) ────────────────────────────────────────────────────────────

export function applyCommand(room, player, { cardIndex }) {
  if (room.commandUsedThisTurn) return { error: 'Command already used this turn.' }
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
    return { error: 'Invalid card index.' }
  if (player.hand[cardIndex].type !== 'Command') return { error: 'Not a Command card.' }

  player.hand.splice(cardIndex, 1)
  room.commandUsedThisTurn = true
  room.actionsRemaining += 1

  return { lastAction: lastAction('play_command', player.side, { cardIndex }) }
}

// ── Disrupt (free) ────────────────────────────────────────────────────────────

export function applyDisrupt(room, player, { cardIndex }) {
  if (room.disruptUsedThisTurn) return { error: 'Disrupt already used this turn.' }
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
    return { error: 'Invalid card index.' }
  if (player.hand[cardIndex].type !== 'Disrupt') return { error: 'Not a Disrupt card.' }

  player.hand.splice(cardIndex, 1)
  room.disruptUsedThisTurn = true
  room.disruptNextTurn = true

  return { lastAction: lastAction('play_disrupt', player.side, { cardIndex }) }
}

// ── Buff ──────────────────────────────────────────────────────────────────────

export function applyBuff(room, player, { cardIndex, targetRow, targetLane }) {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
    return { error: 'Invalid card index.' }

  const card = player.hand[cardIndex]
  if (!BUFF_TYPES.has(card.type)) return { error: 'Not a buff card.' }

  const target = room.board[targetRow]?.[targetLane]
  if (!isValidBuffTarget(target)) return { error: 'Invalid buff target.' }

  target.buff = { type: card.type, id: card.id }

  // Protection special case: strip any existing debuff immediately
  if (card.type === 'Protection' && target.debuff) {
    discardToken(room, target.debuff)
    target.debuff = null
  }

  player.hand.splice(cardIndex, 1)
  spendAction(room, player)

  return { lastAction: lastAction('play_buff', player.side, { cardIndex, targetRow, targetLane, buffType: card.type }) }
}

// ── Debuff ────────────────────────────────────────────────────────────────────

export function applyDebuff(room, player, { cardIndex, targetRow, targetLane }) {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
    return { error: 'Invalid card index.' }

  const card = player.hand[cardIndex]
  if (!DEBUFF_TYPES.has(card.type)) return { error: 'Not a debuff card.' }

  const target = room.board[targetRow]?.[targetLane]
  if (!isValidDebuffTarget(target)) return { error: 'Invalid debuff target.' }

  target.debuff = { type: card.type, id: card.id }

  // Silence special case: strip any existing buff immediately
  if (card.type === 'Silence' && target.buff) {
    discardToken(room, target.buff)
    target.buff = null
  }

  player.hand.splice(cardIndex, 1)
  spendAction(room, player)

  return { lastAction: lastAction('play_debuff', player.side, { cardIndex, targetRow, targetLane, debuffType: card.type }) }
}

// ── Reposition ────────────────────────────────────────────────────────────────

export function applyReposition(room, player, { cardIndex, pieceRow, pieceLane, toRow, toLane }) {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
    return { error: 'Invalid card index.' }
  if (player.hand[cardIndex].type !== 'Reposition') return { error: 'Not a Reposition card.' }

  const piece = room.board[pieceRow]?.[pieceLane]
  if (!piece) return { error: 'No piece at that position.' }
  if (piece.owner !== player.side) return { error: 'Not your piece.' }

  if (!isValidReposition(room.board, piece, pieceRow, pieceLane, toRow, toLane))
    return { error: 'Invalid reposition.' }

  room.board[toRow][toLane] = piece
  room.board[pieceRow][pieceLane] = null
  // canActThisTurn intentionally NOT cleared — repositioning doesn't consume a piece's action

  player.hand.splice(cardIndex, 1)
  spendAction(room, player)

  return { lastAction: lastAction('play_reposition', player.side, { cardIndex, pieceRow, pieceLane, toRow, toLane }) }
}

// ── Swap ──────────────────────────────────────────────────────────────────────

export function applySwap(room, player, { cardIndex, aRow, aLane, bRow, bLane }) {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
    return { error: 'Invalid card index.' }
  if (player.hand[cardIndex].type !== 'Swap') return { error: 'Not a Swap card.' }

  if (!isValidSwap(room.board, player.side, aRow, aLane, bRow, bLane))
    return { error: 'Invalid swap.' }

  const tmp = room.board[aRow][aLane]
  room.board[aRow][aLane] = room.board[bRow][bLane]
  room.board[bRow][bLane] = tmp

  player.hand.splice(cardIndex, 1)
  spendAction(room, player)

  return { lastAction: lastAction('play_swap', player.side, { cardIndex, aRow, aLane, bRow, bLane }) }
}

// ── Dispel ────────────────────────────────────────────────────────────────────

export function applyDispel(room, player, { cardIndex, targetRow, targetLane, which }) {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
    return { error: 'Invalid card index.' }
  if (player.hand[cardIndex].type !== 'Dispel') return { error: 'Not a Dispel card.' }
  if (which !== 'buff' && which !== 'debuff') return { error: 'Must specify buff or debuff.' }

  const target = room.board[targetRow]?.[targetLane]
  if (!target) return { error: 'No piece at that position.' }
  if (!target[which]) return { error: `That piece has no ${which}.` }

  discardToken(room, target[which])
  target[which] = null

  player.hand.splice(cardIndex, 1)
  spendAction(room, player)

  return { lastAction: lastAction('play_dispel', player.side, { cardIndex, targetRow, targetLane, which }) }
}

// ── Return ────────────────────────────────────────────────────────────────────

export function applyReturn(room, player, { cardIndex, pieceRow, pieceLane }) {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
    return { error: 'Invalid card index.' }
  if (player.hand[cardIndex].type !== 'Return') return { error: 'Not a Return card.' }

  const piece = room.board[pieceRow]?.[pieceLane]
  if (!piece) return { error: 'No piece at that position.' }
  if (piece.owner !== player.side) return { error: 'Not your piece.' }
  if (piece.type === 'King') return { error: 'Cannot return the King.' }

  discardToken(room, piece.buff)
  discardToken(room, piece.debuff)

  room.board[pieceRow][pieceLane] = null
  player.hand.push({ type: piece.type, id: piece.id })

  // Splice Return card out after pushing the returned piece card (to avoid index shift affecting push)
  player.hand.splice(cardIndex, 1)
  spendAction(room, player)

  return { lastAction: lastAction('play_return', player.side, { cardIndex, pieceRow, pieceLane, pieceType: piece.type }) }
}

// ── Purge ─────────────────────────────────────────────────────────────────────

export function applyPurge(room, player, { cardIndex }) {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length)
    return { error: 'Invalid card index.' }
  if (player.hand[cardIndex].type !== 'Purge') return { error: 'Not a Purge card.' }

  for (const row of room.board) {
    for (const piece of row) {
      if (!piece) continue
      discardToken(room, piece.buff)
      discardToken(room, piece.debuff)
      piece.buff = null
      piece.debuff = null
    }
  }

  player.hand.splice(cardIndex, 1)
  spendAction(room, player)

  return { lastAction: lastAction('play_purge', player.side, { cardIndex }) }
}

// ── End turn ──────────────────────────────────────────────────────────────────

export function applyEndTurn(room, player, { discardIndices }) {
  // Check gate: if active player's King is in check, verify escape is possible
  const king = findKing(room.board, player.side)
  if (king && isInCheck(room.board, king.row, king.lane, player.side)) {
    if (!hasBodyguardAdjacentToKing(room.board, player.side)) {
      room.winner = 1 - player.side
      room.phase = 'ended'
      room.endReason = 'checkmate'
      return { lastAction: lastAction('end_turn', player.side, { discardIndices: [] }), gameOver: true }
    }
  }

  if (player.hand.length > 5) {
    const indices = [...new Set(
      (discardIndices || []).filter(i => Number.isInteger(i) && i >= 0 && i < player.hand.length)
    )]
    if (player.hand.length - indices.length > 5)
      return { error: `Discard ${player.hand.length - 5} card(s) first.` }

    const sorted = [...indices].sort((a, b) => b - a)
    const removed = sorted.map(i => player.hand.splice(i, 1)[0])
    room.discardPile.unshift(...removed.map(c => ({ type: c.type, id: c.id })))
  }

  room.currentTurn = 1 - room.currentTurn
  startTurn(room)

  return { lastAction: lastAction('end_turn', player.side, { discardIndices: discardIndices || [] }) }
}

// ── Resolve capture (used after Bodyguard prompt is declined) ─────────────────

export function resolveCapture(room, attackerRow, attackerLane, targetRow, targetLane) {
  const piece = room.board[attackerRow][attackerLane]
  const captured = room.board[targetRow][targetLane]
  const la = lastAction('direct_attack', piece?.owner ?? 0, { row: attackerRow, lane: attackerLane, targetRow, targetLane })

  // Enslave: capture the piece and give it to the attacker
  if (piece?.buff?.type === 'Enslave') {
    discardToken(room, captured.buff)
    discardToken(room, captured.debuff)
    captured.buff = null
    captured.debuff = null
    captured.owner = piece.owner
    captured.canActThisTurn = false
    room.board[targetRow][targetLane] = null
    const ownRows = piece.owner === 0 ? [0, 1] : [2, 3]
    const validSpaces = []
    for (const r of ownRows)
      for (let l = 0; l <= 4; l++)
        if (!room.board[r][l]) validSpaces.push({ row: r, lane: l })
    discardToken(room, piece.buff)
    piece.buff = null

    if (validSpaces.length > 0) {
      room.pendingEnslaved = { piece: captured, validSpaces, attackerRow, attackerLane }
      room.enslavePromptOpen = true
      return { lastAction: { ...la, secondaryEffect: 'enslave_placed' }, enslavePrompt: true, validSpaces, pieceType: captured.type }
    } else {
      room.discardPile.unshift({ type: captured.type, id: captured.id })
      return { lastAction: { ...la, secondaryEffect: 'enslave_placed' } }
    }
  }

  // Default capture
  discardToken(room, captured.buff)
  discardToken(room, captured.debuff)
  room.discardPile.unshift({ type: captured.type, id: captured.id })
  room.board[targetRow][targetLane] = null

  return { lastAction: la }
}
