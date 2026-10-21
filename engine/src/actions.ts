// Turn actions. Each function changes the state it is given, so callers pass a copy
// (applyPlayerAction in game.ts does this). They return what happened, or an error.
import { isBuff, isDebuff, isPlaceable } from './cards.js'
import { drawCard } from './deck.js'
import {
  getBodyguardOptions, inBounds, isFatigued, isPinned, isValidAttack, isValidBuffTarget,
  isValidDebuffTarget, isValidMove, isValidReposition, isValidSwap, ownRows,
} from './rules.js'
import { lastAction, type GameState, type LastAction } from './state.js'
import type { Card, Piece, Position, Random, Side, StatusToken, BuffType, DebuffType } from './types.js'

export type ActionResult = { lastAction: LastAction } | { error: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCardIndex(hand: Card[], cardIndex: unknown): cardIndex is number {
  return Number.isInteger(cardIndex) && (cardIndex as number) >= 0 && (cardIndex as number) < hand.length
}

function isSquare(row: unknown, lane: unknown): boolean {
  return Number.isInteger(row) && Number.isInteger(lane) && inBounds(row as number, lane as number)
}

function pieceAt(state: GameState, row: unknown, lane: unknown): Piece | null {
  return isSquare(row, lane) ? state.board[row as number][lane as number] : null
}

function spendAction(state: GameState): void {
  state.actionsRemaining -= 1
}

export function discardToken(state: GameState, token: StatusToken<BuffType> | StatusToken<DebuffType> | null): void {
  if (token) state.discardPile.unshift({ type: token.type, id: token.id })
}

// Removes the played card from the hand and puts it on the discard pile
function discardFromHand(state: GameState, side: Side, cardIndex: number): Card {
  const [card] = state.players[side].hand.splice(cardIndex, 1)
  state.discardPile.unshift({ type: card!.type, id: card!.id })
  return card!
}

// A piece leaving the board goes to the discard pile with any Buff and Debuff it carried
function discardPiece(state: GameState, piece: Piece): void {
  discardToken(state, piece.buff)
  discardToken(state, piece.debuff)
  if (piece.id !== undefined) state.discardPile.unshift({ type: piece.type as Card['type'], id: piece.id })
}

function emptySpacesOnSide(state: GameState, side: Side): Position[] {
  const spaces: Position[] = []
  for (const r of ownRows(side))
    for (let l = 0; l <= 4; l++)
      if (!state.board[r][l]) spaces.push({ row: r, lane: l })
  return spaces
}

// ── Place ─────────────────────────────────────────────────────────────────────

export function applyPlace(state: GameState, side: Side, { cardIndex, row, lane }: { cardIndex: number; row: number; lane: number }): ActionResult {
  const hand = state.players[side].hand
  if (!isCardIndex(hand, cardIndex)) return { error: 'Invalid card index.' }

  const card = hand[cardIndex]!
  if (!isPlaceable(card.type)) return { error: 'Not a piece card.' }
  if (!isSquare(row, lane)) return { error: 'Invalid position.' }
  if (!ownRows(side).includes(row)) return { error: 'Must place on your own side.' }
  if (state.board[row][lane] !== null) return { error: 'Space is occupied.' }

  state.board[row][lane] = {
    id: card.id, type: card.type, owner: side,
    buff: null, debuff: null, firstStatus: null, canActThisTurn: false,
  }
  hand.splice(cardIndex, 1)
  spendAction(state)

  return { lastAction: lastAction('place', side, { cardIndex, row, lane, pieceType: card.type }) }
}

// ── Direct move ───────────────────────────────────────────────────────────────

export function applyDirectMove(state: GameState, side: Side, { row, lane, toRow, toLane }: { row: number; lane: number; toRow: number; toLane: number }): ActionResult {
  const piece = pieceAt(state, row, lane)
  if (!piece) return { error: 'No piece at that position.' }
  if (piece.owner !== side) return { error: 'Not your piece.' }
  if (!piece.canActThisTurn) return { error: 'This piece cannot act this turn.' }
  if (isPinned(piece)) return { error: 'This piece is Pinned.' }
  if (!isSquare(toRow, toLane) || !isValidMove(state.board, piece, row, lane, toRow, toLane))
    return { error: 'Invalid move.' }

  state.board[toRow][toLane] = piece
  state.board[row][lane] = null
  piece.canActThisTurn = false
  spendAction(state)

  return { lastAction: lastAction('direct_move', side, { row, lane, toRow, toLane }) }
}

// ── Direct attack ─────────────────────────────────────────────────────────────

export function applyDirectAttack(state: GameState, side: Side, { row, lane, targetRow, targetLane }: { row: number; lane: number; targetRow: number; targetLane: number }): ActionResult {
  const piece = pieceAt(state, row, lane)
  if (!piece) return { error: 'No piece at that position.' }
  if (piece.owner !== side) return { error: 'Not your piece.' }
  if (!piece.canActThisTurn) return { error: 'This piece cannot act this turn.' }
  if (isFatigued(piece)) return { error: 'This piece is Fatigued.' }
  if (!isSquare(targetRow, targetLane) || !isValidAttack(state.board, piece, row, lane, targetRow, targetLane))
    return { error: 'Invalid attack.' }

  const target = state.board[targetRow][targetLane]!
  const la = lastAction('direct_attack', side, { row, lane, targetRow, targetLane })
  piece.canActThisTurn = false
  spendAction(state)

  // Shield: absorbs the attack — the target survives and the Shield is discarded
  if (target.buff?.type === 'Shield') {
    discardToken(state, target.buff)
    target.buff = null
    if (target.firstStatus === 'buff') target.firstStatus = null
    return { lastAction: { ...la, secondaryEffect: 'shield_absorbed' } }
  }

  // Bodyguard: the defender decides whether to sacrifice an adjacent Bodyguard
  const options = getBodyguardOptions(state.board, targetRow, targetLane, target.owner)
  if (options.length > 0) {
    state.pending = {
      kind: 'bodyguard',
      attackerSide: side, attackerRow: row, attackerLane: lane,
      targetRow, targetLane,
      targetType: target.type,
      isKingAttack: target.type === 'King',
      options,
    }
    return { lastAction: la }
  }

  return { lastAction: capture(state, row, lane, targetRow, targetLane, la) }
}

// Removes the target from the board: to the discard pile, or to the attacker's side with Enslave
export function capture(state: GameState, attackerRow: number, attackerLane: number, targetRow: number, targetLane: number, la: LastAction): LastAction {
  const attacker = state.board[attackerRow][attackerLane]!
  const captured = state.board[targetRow][targetLane]!
  state.board[targetRow][targetLane] = null

  if (attacker.buff?.type === 'Enslave') {
    discardToken(state, captured.buff)
    discardToken(state, captured.debuff)
    Object.assign(captured, { buff: null, debuff: null, firstStatus: null, owner: attacker.owner, canActThisTurn: false })

    discardToken(state, attacker.buff)
    attacker.buff = null
    if (attacker.firstStatus === 'buff') attacker.firstStatus = null

    const validSpaces = emptySpacesOnSide(state, attacker.owner)
    if (validSpaces.length > 0) {
      state.pending = { kind: 'enslave', side: attacker.owner, piece: captured, validSpaces }
    } else {
      discardPiece(state, captured)
    }
    return { ...la, secondaryEffect: 'enslave_placed' }
  }

  discardPiece(state, captured)
  return la
}

// ── Direct sacrifice ──────────────────────────────────────────────────────────

export function applyDirectSacrifice(state: GameState, side: Side, { row, lane }: { row: number; lane: number }, random: Random): ActionResult {
  const piece = pieceAt(state, row, lane)
  if (!piece) return { error: 'No piece at that position.' }
  if (piece.owner !== side) return { error: 'Not your piece.' }
  if (piece.type === 'King') return { error: 'Cannot sacrifice the King.' }
  if (!piece.canActThisTurn) return { error: 'This piece cannot act this turn.' }

  const drawCount = piece.type === 'Pawn' ? 1 : piece.type === 'Queen' ? 3 : 2

  discardPiece(state, piece)
  state.board[row][lane] = null
  for (let i = 0; i < drawCount; i++) {
    const card = drawCard(state.deck, state.discardPile, random)
    if (card) state.players[side].hand.push(card)
  }
  spendAction(state)

  return { lastAction: lastAction('direct_sacrifice', side, { row, lane, pieceType: piece.type, drawCount }) }
}

// ── Cycle ─────────────────────────────────────────────────────────────────────

export function applyCycle(state: GameState, side: Side, { cardIndex }: { cardIndex: number }, random: Random): ActionResult {
  if (!isCardIndex(state.players[side].hand, cardIndex)) return { error: 'Invalid card index.' }

  discardFromHand(state, side, cardIndex)
  const card = drawCard(state.deck, state.discardPile, random)
  if (card) state.players[side].hand.push(card)
  spendAction(state)

  return { lastAction: lastAction('cycle', side, { cardIndex }) }
}

// ── Command and Disrupt (free, once per turn) ─────────────────────────────────
// The card is played (and can be Intercepted) before its effect happens, so these
// are split into a "play" step and an "effect" step.

export function playFreeCard(state: GameState, side: Side, cardIndex: number, type: 'Command' | 'Disrupt'): { error: string } | null {
  const used = type === 'Command' ? state.commandUsedThisTurn : state.disruptUsedThisTurn
  if (used) return { error: `${type} already used this turn.` }
  const hand = state.players[side].hand
  if (!isCardIndex(hand, cardIndex) || hand[cardIndex]!.type !== type) return { error: `Invalid ${type} card.` }

  discardFromHand(state, side, cardIndex)
  if (type === 'Command') state.commandUsedThisTurn = true
  else state.disruptUsedThisTurn = true
  return null
}

export function applyCommandEffect(state: GameState, side: Side, cardIndex: number): ActionResult {
  state.actionsRemaining += 1
  state.actionsMax += 1
  return { lastAction: lastAction('play_command', side, { cardIndex }) }
}

export function applyDisruptEffect(state: GameState, side: Side, cardIndex: number): ActionResult {
  state.disruptNextTurn = true
  return { lastAction: lastAction('play_disrupt', side, { cardIndex }) }
}

// ── Buff and Debuff ───────────────────────────────────────────────────────────

export function applyBuff(state: GameState, side: Side, { cardIndex, targetRow, targetLane }: { cardIndex: number; targetRow: number; targetLane: number }): ActionResult {
  const hand = state.players[side].hand
  if (!isCardIndex(hand, cardIndex)) return { error: 'Invalid card index.' }
  const card = hand[cardIndex]!
  if (!isBuff(card.type)) return { error: 'Not a buff card.' }

  const target = pieceAt(state, targetRow, targetLane)
  if (!isValidBuffTarget(target)) return { error: 'Invalid buff target.' }

  target.buff = { type: card.type, id: card.id }
  if (!target.firstStatus) target.firstStatus = 'buff'

  // Protection removes any Debuff already on the piece
  if (card.type === 'Protection' && target.debuff) {
    discardToken(state, target.debuff)
    target.debuff = null
    target.firstStatus = 'buff'
  }

  hand.splice(cardIndex, 1)  // the card now sits on the piece; it is discarded when removed
  spendAction(state)

  return { lastAction: lastAction('play_buff', side, { cardIndex, targetRow, targetLane, buffType: card.type }) }
}

export function applyDebuff(state: GameState, side: Side, { cardIndex, targetRow, targetLane }: { cardIndex: number; targetRow: number; targetLane: number }): ActionResult {
  const hand = state.players[side].hand
  if (!isCardIndex(hand, cardIndex)) return { error: 'Invalid card index.' }
  const card = hand[cardIndex]!
  if (!isDebuff(card.type)) return { error: 'Not a debuff card.' }

  const target = pieceAt(state, targetRow, targetLane)
  if (!isValidDebuffTarget(target)) return { error: 'Invalid debuff target.' }

  target.debuff = { type: card.type, id: card.id }
  if (!target.firstStatus) target.firstStatus = 'debuff'

  // Silence removes any Buff already on the piece
  if (card.type === 'Silence' && target.buff) {
    discardToken(state, target.buff)
    target.buff = null
    target.firstStatus = 'debuff'
  }

  hand.splice(cardIndex, 1)
  spendAction(state)

  return { lastAction: lastAction('play_debuff', side, { cardIndex, targetRow, targetLane, debuffType: card.type }) }
}

// ── Control cards ─────────────────────────────────────────────────────────────

function checkControlCard(state: GameState, side: Side, cardIndex: number, type: Card['type']): { error: string } | null {
  const hand = state.players[side].hand
  if (!isCardIndex(hand, cardIndex)) return { error: 'Invalid card index.' }
  if (hand[cardIndex]!.type !== type) return { error: `Not a ${type} card.` }
  return null
}

export function applyReposition(state: GameState, side: Side, { cardIndex, pieceRow, pieceLane, toRow, toLane }: { cardIndex: number; pieceRow: number; pieceLane: number; toRow: number; toLane: number }): ActionResult {
  const cardError = checkControlCard(state, side, cardIndex, 'Reposition')
  if (cardError) return cardError

  const piece = pieceAt(state, pieceRow, pieceLane)
  if (!piece) return { error: 'No piece at that position.' }
  if (piece.owner !== side) return { error: 'Not your piece.' }
  if (!isSquare(toRow, toLane) || !isValidReposition(state.board, piece, pieceRow, pieceLane, toRow, toLane))
    return { error: 'Invalid reposition.' }

  state.board[toRow][toLane] = piece
  state.board[pieceRow][pieceLane] = null
  // canActThisTurn is not cleared: repositioning doesn't use up the piece's action

  discardFromHand(state, side, cardIndex)
  spendAction(state)

  return { lastAction: lastAction('play_reposition', side, { cardIndex, pieceRow, pieceLane, toRow, toLane }) }
}

export function applySwap(state: GameState, side: Side, { cardIndex, aRow, aLane, bRow, bLane }: { cardIndex: number; aRow: number; aLane: number; bRow: number; bLane: number }): ActionResult {
  const cardError = checkControlCard(state, side, cardIndex, 'Swap')
  if (cardError) return cardError
  if (!isSquare(aRow, aLane) || !isSquare(bRow, bLane) || !isValidSwap(state.board, side, aRow, aLane, bRow, bLane))
    return { error: 'Invalid swap.' }

  const tmp = state.board[aRow][aLane]
  state.board[aRow][aLane] = state.board[bRow][bLane]
  state.board[bRow][bLane] = tmp

  discardFromHand(state, side, cardIndex)
  spendAction(state)

  return { lastAction: lastAction('play_swap', side, { cardIndex, aRow, aLane, bRow, bLane }) }
}

export function applyDispel(state: GameState, side: Side, { cardIndex, targetRow, targetLane, which }: { cardIndex: number; targetRow: number; targetLane: number; which: 'buff' | 'debuff' }): ActionResult {
  const cardError = checkControlCard(state, side, cardIndex, 'Dispel')
  if (cardError) return cardError
  if (which !== 'buff' && which !== 'debuff') return { error: 'Must specify buff or debuff.' }

  const target = pieceAt(state, targetRow, targetLane)
  if (!target) return { error: 'No piece at that position.' }
  if (!target[which]) return { error: `That piece has no ${which}.` }

  discardToken(state, target[which])
  target[which] = null
  if (target.firstStatus === which) target.firstStatus = null

  discardFromHand(state, side, cardIndex)
  spendAction(state)

  return { lastAction: lastAction('play_dispel', side, { cardIndex, targetRow, targetLane, which }) }
}

export function applyReturn(state: GameState, side: Side, { cardIndex, pieceRow, pieceLane }: { cardIndex: number; pieceRow: number; pieceLane: number }): ActionResult {
  const cardError = checkControlCard(state, side, cardIndex, 'Return')
  if (cardError) return cardError

  const piece = pieceAt(state, pieceRow, pieceLane)
  if (!piece) return { error: 'No piece at that position.' }
  if (piece.owner !== side) return { error: 'Not your piece.' }
  if (piece.type === 'King' || piece.id === undefined) return { error: 'Cannot return the King.' }

  discardToken(state, piece.buff)
  discardToken(state, piece.debuff)
  state.board[pieceRow][pieceLane] = null

  // Discard the Return card before adding the piece, so cardIndex still points at it
  discardFromHand(state, side, cardIndex)
  state.players[side].hand.push({ type: piece.type as Card['type'], id: piece.id })
  spendAction(state)

  return { lastAction: lastAction('play_return', side, { cardIndex, pieceRow, pieceLane, pieceType: piece.type }) }
}

export function applyPurge(state: GameState, side: Side, { cardIndex }: { cardIndex: number }): ActionResult {
  const cardError = checkControlCard(state, side, cardIndex, 'Purge')
  if (cardError) return cardError

  for (const row of state.board) {
    for (const piece of row) {
      if (!piece) continue
      discardToken(state, piece.buff)
      discardToken(state, piece.debuff)
      piece.buff = null
      piece.debuff = null
      piece.firstStatus = null
    }
  }

  discardFromHand(state, side, cardIndex)
  spendAction(state)

  return { lastAction: lastAction('play_purge', side, { cardIndex }) }
}
