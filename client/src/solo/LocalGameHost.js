// Runs a game against the computer entirely in the browser.
// It has the same on/off/emit methods as a Socket.io client socket and sends the same
// events as the server, so the game screen works with it unchanged.
import {
  newGame, applyPlayerAction, resolveTimeout, reorderHand, playerView, playerToAct,
  chooseAction, chooseMulligan,
} from '@checkline/engine'

export const HUMAN = 0
export const COMPUTER = 1

const COMPUTER_ACTION_MS = 900  // pause before each computer move, so the player can follow it
const COMPUTER_REACT_MS  = 600  // pause before the computer answers a reaction window or prompt
const REACTION_WINDOW_MS = 15000
const BODYGUARD_MS       = 15000
const REVERSAL_CANCEL_MS = 10000

const COMPUTER_PLAYER = {
  name: 'Computer',
  avatar: { faceColor: '#a0c4e8', eyeStyle: 'cool', mouthStyle: 'smirk', hat: 'tophat', customImage: null },
}

function hasReactionCard(game, side) {
  return game.players[side].hand.some(c => c.type === 'Intercept' || c.type === 'Reversal')
}

export class LocalGameHost {
  constructor({ playerName = 'You', playerAvatar = null, difficulty = 'normal', random = Math.random } = {}) {
    this.players = [{ name: playerName, avatar: playerAvatar }, COMPUTER_PLAYER]
    this.difficulty = difficulty
    this.random = random
    this.listeners = new Map()
    this.timers = new Set()
    this.game = null
    this.discardViewIndex = 0
    this.handHovered = false
    this.reactionExpiresAt = null
    this.reactionTimer = null
    this.reactionFrozen = false
    this.bodyguardTimer = null
    this.computerTimer = null
    this.connected = true
  }

  // ── Socket-like interface used by the game screen ──────────────────────────

  connect() {}
  disconnect() {}

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event).add(fn)
    return this
  }

  off(event, fn) {
    if (fn) this.listeners.get(event)?.delete(fn)
    else this.listeners.delete(event)
    return this
  }

  // A message from the player. Handled asynchronously, as a real server would be.
  emit(event, payload = {}) {
    const handler = this.handlers[event]
    if (handler) this.later(0, () => handler.call(this, payload ?? {}))
    return this
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  // Starts a game, or re-sends the current one (React may mount the page twice in development)
  start() {
    if (!this.game) this.newGame()
    else this.send('game_starting', { state: this.view() })
    this.scheduleComputer()
  }

  // Cancels all pending timers, e.g. when the player leaves the page
  stop() {
    for (const id of this.timers) clearTimeout(id)
    this.timers.clear()
    this.reactionTimer = null
    this.bodyguardTimer = null
    this.computerTimer = null
  }

  newGame() {
    this.game = newGame(this.random)
    this.discardViewIndex = 0
    this.send('game_starting', { state: this.view() })
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  later(ms, fn) {
    const id = setTimeout(() => { this.timers.delete(id); fn() }, ms)
    this.timers.add(id)
    return id
  }

  cancel(id) {
    if (id === null) return
    clearTimeout(id)
    this.timers.delete(id)
  }

  // Delivered in order on the next tick, like a network message
  send(event, payload) {
    this.later(0, () => {
      for (const fn of [...(this.listeners.get(event) ?? [])]) fn(payload)
    })
  }

  view(game = this.game) {
    const v = playerView(game, HUMAN)
    return {
      ...v,
      playAgainVotes: [],
      players: v.players.map((p, i) => ({ ...p, ...this.players[i] })),
    }
  }

  // ── Applying engine results (mirrors the server) ───────────────────────────

  apply(side, input) {
    const result = applyPlayerAction(this.game, side, input, this.random)
    if (result.error) {
      if (side === HUMAN) this.send('error', { message: result.error })
      return false
    }
    this.commit(result)
    return true
  }

  commit(result) {
    if (result.error) return
    const before = this.game
    this.game = result.state
    for (const step of result.steps) this.send('state_update', { state: this.view(step.state), lastAction: step.lastAction })

    const pending = this.game.pending
    if (pending?.kind !== 'reaction') { this.cancel(this.reactionTimer); this.reactionTimer = null; this.reactionFrozen = false }
    if (pending?.kind !== 'bodyguard') { this.cancel(this.bodyguardTimer); this.bodyguardTimer = null }

    if (this.game.phase === 'ended' && before?.phase !== 'ended') {
      this.send('game_over', { winner: this.game.winner })
      return
    }

    const isNew = pending && before?.pending?.kind !== pending.kind
    if (isNew && pending.kind === 'bodyguard' && pending.attackerSide === COMPUTER) {
      this.send('bodyguard_prompt', {
        options: pending.options, isKingAttack: pending.isKingAttack, targetType: pending.targetType,
        targetRow: pending.targetRow, targetLane: pending.targetLane, ms: BODYGUARD_MS,
      })
      this.bodyguardTimer = this.later(BODYGUARD_MS, () => this.timeout())
    }
    if (isNew && pending.kind === 'enslave' && pending.side === HUMAN) {
      this.send('enslave_prompt', { validSpaces: pending.validSpaces, pieceType: pending.piece.type })
    }

    this.scheduleComputer()
  }

  timeout() {
    if (!this.game?.pending) return
    const result = resolveTimeout(this.game, this.random)
    if (!result.error) this.commit(result)
  }

  // A turn action announces itself first; the other side may then react
  submitTurnAction(side, action) {
    const announced = applyPlayerAction(this.game, side, action, this.random)
    if (announced.error) {
      if (side === HUMAN) this.send('error', { message: announced.error })
      return
    }
    const pending = announced.state.pending
    if (pending?.kind !== 'reaction') return this.commit(announced)

    const defender = 1 - side
    // Skip the window if the defender has nothing to react with
    if (!hasReactionCard(announced.state, defender)) {
      this.game = announced.state
      return this.commit(applyPlayerAction(announced.state, defender, { type: 'pass_reaction' }, this.random))
    }

    if (defender === HUMAN) {
      this.send('reaction_window', { action: { ...pending.action, ...pending.revealed }, actorSide: side, ms: REACTION_WINDOW_MS })
      this.commit(announced)
      this.startReactionTimer(this.handHovered ? REACTION_WINDOW_MS : REACTION_WINDOW_MS / 4)
    } else {
      this.commit(announced)  // the computer decides in scheduleComputer
    }
  }

  startReactionTimer(ms) {
    this.cancel(this.reactionTimer)
    this.reactionExpiresAt = Date.now() + ms
    this.reactionTimer = this.later(ms, () => { this.reactionTimer = null; this.timeout() })
  }

  // ── The computer player ────────────────────────────────────────────────────

  scheduleComputer() {
    if (this.computerTimer) return
    const game = this.game
    let delay = null
    if (game.phase === 'mulligan' && !game.players[COMPUTER].mulliganDone) delay = COMPUTER_REACT_MS
    else if (playerToAct(game) === COMPUTER) delay = game.pending ? COMPUTER_REACT_MS : COMPUTER_ACTION_MS
    if (delay === null) return

    this.computerTimer = this.later(delay, () => {
      this.computerTimer = null
      this.computerMove()
    })
  }

  computerMove() {
    const game = this.game
    if (game.phase === 'mulligan') {
      this.apply(COMPUTER, { type: 'mulligan', discardIndices: chooseMulligan(game, COMPUTER) })
      return
    }
    if (playerToAct(game) !== COMPUTER) return

    const action = chooseAction(game, COMPUTER, { random: this.random, difficulty: this.difficulty })
      ?? { type: 'end_turn', discardIndices: [] }

    // Show which piece the computer is using, as a human opponent's selection would be shown
    if ('row' in action && action.type.startsWith('direct_')) {
      this.send('opponent_select_piece', { row: action.row, lane: action.lane })
      this.later(COMPUTER_ACTION_MS / 2, () => this.send('opponent_select_piece', null))
    }

    if (game.pending) this.apply(COMPUTER, action)
    else this.submitTurnAction(COMPUTER, action)
  }

  // ── Messages from the player ───────────────────────────────────────────────

  handlers = {
    reconnect() {
      if (!this.game) return
      this.send('state_update', { state: this.view(), lastAction: null })
      const pending = this.game.pending
      if (pending?.kind === 'reaction' && pending.actorSide === COMPUTER) {
        const ms = Math.max(0, (this.reactionExpiresAt ?? 0) - Date.now())
        this.send('reaction_window', { action: { ...pending.action, ...pending.revealed }, actorSide: COMPUTER, ms })
      }
    },
    mulligan_done({ discardIndices }) { this.apply(HUMAN, { type: 'mulligan', discardIndices }) },
    game_action(action) { this.submitTurnAction(HUMAN, action) },
    play_reaction({ cardIndex, targetRow, targetLane }) { this.apply(HUMAN, { type: 'react', cardIndex, targetRow, targetLane }) },
    pass_reaction() { this.apply(HUMAN, { type: 'pass_reaction' }) },
    bodyguard_response({ bodyguardRow, bodyguardLane, decline }) {
      this.apply(HUMAN, decline ? { type: 'decline_bodyguard' } : { type: 'choose_bodyguard', row: bodyguardRow, lane: bodyguardLane })
    },
    enslave_response({ row, lane, discard }) {
      this.apply(HUMAN, discard ? { type: 'discard_enslaved' } : { type: 'place_enslaved', row, lane })
    },
    forfeit() { this.apply(HUMAN, { type: 'forfeit' }) },
    play_again_vote({ vote }) {
      if (vote && this.game.phase === 'ended') { this.stop(); this.newGame(); this.scheduleComputer() }
    },

    // The reaction window drains four times faster while the cursor is off the hand, as online
    hand_hover_start() {
      this.handHovered = true
      if (this.game?.pending?.kind !== 'reaction' || this.reactionFrozen || !this.reactionTimer) return
      const remaining = Math.max(0, this.reactionExpiresAt - Date.now())
      this.startReactionTimer(Math.min(REACTION_WINDOW_MS, remaining * 4))
    },
    hand_hover_end() {
      this.handHovered = false
      if (this.game?.pending?.kind !== 'reaction' || this.reactionFrozen || !this.reactionTimer) return
      const remaining = Math.max(0, this.reactionExpiresAt - Date.now())
      this.startReactionTimer(Math.max(500, Math.ceil(remaining / 4)))
    },
    reversal_placing() {
      if (this.game?.pending?.kind !== 'reaction') return
      this.cancel(this.reactionTimer)
      this.reactionTimer = null
      this.reactionFrozen = true
    },
    reversal_cancel() {
      if (this.game?.pending?.kind !== 'reaction' || !this.reactionFrozen) return
      this.reactionFrozen = false
      this.startReactionTimer(REVERSAL_CANCEL_MS)
      this.send('reversal_cancelled', { ms: REVERSAL_CANCEL_MS })
    },

    hand_reorder({ ids }) {
      const next = reorderHand(this.game, HUMAN, ids)
      if (next) { this.game = next; this.send('state_update', { state: this.view(), lastAction: null }) }
    },
    hand_drag({ ids }) {
      const next = reorderHand(this.game, HUMAN, ids)
      if (next) this.game = next
    },
    browse_discard({ delta }) {
      if (!Number.isInteger(delta) || Math.abs(delta) > 1) return
      const max = Math.max(0, this.game.discardPile.length - 1)
      this.discardViewIndex = Math.max(0, Math.min(max, this.discardViewIndex + delta))
      this.send('discard_view', { index: this.discardViewIndex, browserId: HUMAN })
    },
  }
}
