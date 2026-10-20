// Lists every legal choice for a player. Candidates are generated broadly, then each
// is checked with applyPlayerAction, so this can never disagree with the rules.
import { CARD_CATEGORY } from './cards.js'
import { applyPlayerAction, type PlayerAction } from './game.js'
import { ownRows } from './rules.js'
import type { GameState } from './state.js'
import type { Side } from './types.js'

const NO_RANDOM = () => 0.5  // legality never depends on randomness

function isLegal(state: GameState, side: Side, action: PlayerAction): boolean {
  return !('error' in applyPlayerAction(state, side, action, NO_RANDOM))
}

function squares(): [number, number][] {
  const all: [number, number][] = []
  for (let r = 0; r <= 3; r++) for (let l = 0; l <= 4; l++) all.push([r, l])
  return all
}

// All ways to choose k items from 0..n-1
function combinations(n: number, k: number): number[][] {
  if (k === 0) return [[]]
  const result: number[][] = []
  for (let first = 0; first <= n - k; first++)
    for (const rest of combinations(n - first - 1, k - 1))
      result.push([first, ...rest.map(i => i + first + 1)])
  return result
}

export interface LegalActionOptions {
  // Shuffling a card back into the deck is free and unlimited, so a computer player
  // considering it could loop forever. Off by default.
  includeShuffleIntoDeck?: boolean
}

export function legalActions(state: GameState, side: Side, options: LegalActionOptions = {}): PlayerAction[] {
  const candidates = candidateActions(state, side, options)

  // Duplicate cards (e.g. two Pawns) give identical choices; keep one of each
  const hand = state.players[side].hand
  const seen = new Set<string>()
  const legal: PlayerAction[] = []
  for (const action of candidates) {
    const key = 'cardIndex' in action && hand[action.cardIndex]
      ? JSON.stringify({ ...action, cardIndex: hand[action.cardIndex]!.type })
      : JSON.stringify(action)
    if (seen.has(key)) continue
    if (!isLegal(state, side, action)) continue
    seen.add(key)
    legal.push(action)
  }
  return legal
}

function candidateActions(state: GameState, side: Side, options: LegalActionOptions): PlayerAction[] {
  const { pending, board } = state
  const hand = state.players[side].hand
  const actions: PlayerAction[] = []

  if (state.phase !== 'playing') return actions

  // ── Responses to a decision the game is waiting for ─────────────────────
  if (pending?.kind === 'reaction') {
    if (side === pending.actorSide) return actions
    actions.push({ type: 'pass_reaction' })
    const redirectable = pending.action.type === 'play_buff' || pending.action.type === 'play_debuff'
    hand.forEach((card, cardIndex) => {
      if (card.type === 'Intercept') actions.push({ type: 'react', cardIndex })
      // Reversal redirects a Buff or Debuff to a new target; on anything else it just gets used up
      if (card.type === 'Reversal' && !redirectable) actions.push({ type: 'react', cardIndex })
      if (card.type === 'Reversal' && redirectable)
        for (const [targetRow, targetLane] of squares()) actions.push({ type: 'react', cardIndex, targetRow, targetLane })
    })
    return actions
  }
  if (pending?.kind === 'bodyguard') {
    for (const o of pending.options) actions.push({ type: 'choose_bodyguard', row: o.row, lane: o.lane })
    actions.push({ type: 'decline_bodyguard' })
    return actions
  }
  if (pending?.kind === 'enslave') {
    for (const s of pending.validSpaces) actions.push({ type: 'place_enslaved', row: s.row, lane: s.lane })
    actions.push({ type: 'discard_enslaved' })
    return actions
  }

  if (side !== state.currentTurn) return actions

  // ── End of turn, discarding down to 5 cards if needed ───────────────────
  const excess = Math.max(0, hand.length - 5)
  for (const discardIndices of combinations(hand.length, excess)) actions.push({ type: 'end_turn', discardIndices })
  if (state.turnPhase === 'discard') return actions

  // ── Turn actions ────────────────────────────────────────────────────────
  const own = squares().filter(([r, l]) => board[r]![l]?.owner === side)
  const occupied = squares().filter(([r, l]) => board[r]![l] !== null)
  const ownEmpty = squares().filter(([r, l]) => ownRows(side).includes(r) && board[r]![l] === null)

  for (const [row, lane] of own) {
    for (const [toRow, toLane] of squares()) {
      actions.push({ type: 'direct_move', row, lane, toRow, toLane })
      actions.push({ type: 'direct_attack', row, lane, targetRow: toRow, targetLane: toLane })
    }
    actions.push({ type: 'direct_sacrifice', row, lane })
  }

  hand.forEach((card, cardIndex) => {
    actions.push({ type: 'cycle', cardIndex })
    if (options.includeShuffleIntoDeck) actions.push({ type: 'shuffle_into_deck', cardIndex })

    switch (CARD_CATEGORY[card.type]) {
      case 'piece':
        for (const [row, lane] of ownEmpty) actions.push({ type: 'place', cardIndex, row, lane })
        break
      case 'buff':
        for (const [targetRow, targetLane] of occupied) actions.push({ type: 'play_buff', cardIndex, targetRow, targetLane })
        break
      case 'debuff':
        for (const [targetRow, targetLane] of occupied) actions.push({ type: 'play_debuff', cardIndex, targetRow, targetLane })
        break
      case 'control':
        switch (card.type) {
          case 'Command': actions.push({ type: 'play_command', cardIndex }); break
          case 'Disrupt': actions.push({ type: 'play_disrupt', cardIndex }); break
          case 'Purge':   actions.push({ type: 'play_purge', cardIndex }); break
          case 'Reposition':
            for (const [pieceRow, pieceLane] of own)
              for (const [toRow, toLane] of ownEmpty)
                actions.push({ type: 'play_reposition', cardIndex, pieceRow, pieceLane, toRow, toLane })
            break
          case 'Swap':
            for (let i = 0; i < own.length; i++)
              for (let j = i + 1; j < own.length; j++)
                actions.push({ type: 'play_swap', cardIndex, aRow: own[i]![0], aLane: own[i]![1], bRow: own[j]![0], bLane: own[j]![1] })
            break
          case 'Dispel':
            for (const [targetRow, targetLane] of occupied) {
              actions.push({ type: 'play_dispel', cardIndex, targetRow, targetLane, which: 'buff' })
              actions.push({ type: 'play_dispel', cardIndex, targetRow, targetLane, which: 'debuff' })
            }
            break
          case 'Return':
            for (const [pieceRow, pieceLane] of own) actions.push({ type: 'play_return', cardIndex, pieceRow, pieceLane })
            break
        }
        break
    }
  })

  return actions
}

// Who the game is waiting for: the responder to a pending decision, otherwise the current
// player. Null before both mulligans are done and after the game ends.
export function playerToAct(state: GameState): Side | null {
  if (state.phase !== 'playing') return null
  const { pending } = state
  if (pending?.kind === 'reaction') return (1 - pending.actorSide) as Side
  if (pending?.kind === 'bodyguard') return (1 - pending.attackerSide) as Side
  if (pending?.kind === 'enslave') return pending.side
  return state.currentTurn
}
