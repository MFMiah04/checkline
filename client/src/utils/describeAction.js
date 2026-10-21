// Plain-English sentences for what just happened, naming pieces and squares, for the
// "Last move" line and the move history. `before` and `after` are the boards either side of
// the action: the pieces involved are read from them, since the action only records squares.
import { squareName } from './describe'

export function describeAction(la, { before, after, mySide, names }) {
  const mine = la.actorSide === mySide
  const who = mine ? 'You' : names[la.actorSide]
  const p = la.payload ?? {}
  const sq = (row, lane) => squareName(row, lane)
  const pieceAt = (board, row, lane) => board?.[row]?.[lane] ?? null
  // "your Rook" / "their Rook", from this player's point of view
  const whose = piece => (piece?.owner === mySide ? 'your' : 'their')
  const named = piece => `${whose(piece)} ${piece?.type ?? 'piece'}`

  if (la.reactionFired === 'intercept') {
    return `${who} tried to ${attempt(p, before)}, but it was Intercepted.`
  }

  let text
  switch (la.type) {
    case 'place':
      text = `${who} placed a ${p.pieceType} on ${sq(p.row, p.lane)}`
      break
    case 'direct_move': {
      const piece = pieceAt(after, p.toRow, p.toLane) ?? pieceAt(before, p.row, p.lane)
      text = `${who} moved ${named(piece)} ${sq(p.row, p.lane)} → ${sq(p.toRow, p.toLane)}`
      break
    }
    case 'direct_attack': {
      const attacker = pieceAt(before, p.row, p.lane)
      const target = pieceAt(before, p.targetRow, p.targetLane)
      const by = `${named(attacker)} on ${sq(p.row, p.lane)}`
      const on = `${named(target)} on ${sq(p.targetRow, p.targetLane)}`
      if (la.secondaryEffect === 'shield_absorbed') text = `${who} attacked ${on} with ${by}, but a Shield blocked it`
      else if (la.secondaryEffect === 'enslave_placed') text = `${who} took ${on} with ${by} and Enslaved it`
      else text = `${who} took ${on} with ${by}`
      break
    }
    case 'direct_sacrifice':
      text = `${who} sacrificed a ${p.pieceType} on ${sq(p.row, p.lane)}${p.drawCount ? ` and drew ${p.drawCount}` : ''}`
      break
    case 'cycle':
      text = `${who} swapped a card for a new one from the deck`
      break
    case 'end_turn': {
      const n = p.discardIndices?.length ?? 0
      text = `${who} ended the turn${n ? `, discarding ${n} card${n > 1 ? 's' : ''}` : ''}`
      break
    }
    case 'play_command':
      text = `${who} played Command for an extra action`
      break
    case 'play_disrupt':
      text = `${who} played Disrupt: ${mine ? 'they lose' : 'you lose'} an action next turn`
      break
    case 'play_buff':
    case 'play_debuff': {
      const target = pieceAt(before, p.targetRow, p.targetLane)
      text = `${who} put ${p.buffType ?? p.debuffType} on ${named(target)} on ${sq(p.targetRow, p.targetLane)}`
      break
    }
    case 'play_reposition': {
      const piece = pieceAt(before, p.pieceRow, p.pieceLane)
      text = `${who} repositioned ${named(piece)} ${sq(p.pieceRow, p.pieceLane)} → ${sq(p.toRow, p.toLane)}`
      break
    }
    case 'play_swap': {
      const a = pieceAt(before, p.aRow, p.aLane)
      const b = pieceAt(before, p.bRow, p.bLane)
      text = `${who} swapped ${named(a)} on ${sq(p.aRow, p.aLane)} with ${named(b)} on ${sq(p.bRow, p.bLane)}`
      break
    }
    case 'play_dispel': {
      const target = pieceAt(before, p.targetRow, p.targetLane)
      const status = target?.[p.which]?.type ?? (p.which === 'buff' ? 'a Buff' : 'a Debuff')
      text = `${who} dispelled ${status} from ${named(target)} on ${sq(p.targetRow, p.targetLane)}`
      break
    }
    case 'play_return':
      text = `${who} returned a ${p.pieceType} from ${sq(p.pieceRow, p.pieceLane)} to hand`
      break
    case 'play_purge':
      text = `${who} played Purge, clearing every Buff and Debuff`
      break
    case 'bodyguard_save':
      text = p.auto
        ? 'A Bodyguard was sacrificed to save the King'
        : `${who} sacrificed a Bodyguard on ${sq(p.bodyguardRow, p.bodyguardLane)} to stop the attack`
      break
    default:
      text = `${who} acted`
  }
  if (la.reactionFired === 'reversal') text += ', redirected by Reversal'
  return `${text}.`
}

// What an intercepted action would have done, from the action itself
function attempt(action, board) {
  const piece = board?.[action.row]?.[action.lane]
  switch (action.type) {
    case 'place':            return 'place a piece'
    case 'direct_move':      return `move a ${piece?.type ?? 'piece'}`
    case 'direct_attack':    return `attack with a ${piece?.type ?? 'piece'}`
    case 'direct_sacrifice': return `sacrifice a ${piece?.type ?? 'piece'}`
    case 'play_buff':        return 'play a Buff'
    case 'play_debuff':      return 'play a Debuff'
    default: {
      const card = action.type?.startsWith('play_') ? action.type.slice(5) : null
      return card ? `play ${card[0].toUpperCase()}${card.slice(1)}` : 'act'
    }
  }
}
