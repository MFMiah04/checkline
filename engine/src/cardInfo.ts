// Player-facing descriptions of every card, kept beside the rules they describe.
// The interface uses these for card faces, the details panel and the rules screen.
import { CARD_CATEGORY } from './cards.js'
import type { CardCategory, CardType } from './types.js'

export type CardCost = 'action' | 'free' | 'reaction' | 'none'

export interface CardInfo {
  name: string
  category: CardCategory
  cost: CardCost
  short: string      // one line, small enough for the card face
  text: string       // the full effect
  howToPlay: string  // what to click or tap next
}

const PIECE_HOW = 'Place it on an empty square on your side. From your next turn it can move, attack or be sacrificed. Pieces only move on your side, but attacks reach the whole board.'
const BUFF_HOW = "Choose any piece except a King that has no Buff and isn't Silenced, yours or your opponent's."
const DEBUFF_HOW = "Choose any piece except a King that has no Debuff and no Protection, yours or your opponent's."

type Described = Omit<CardInfo, 'category'>

const INFO: Record<CardType | 'King', Described> = {
  King: {
    name: 'King', cost: 'none', short: 'Keep it out of check',
    text: "Moves and attacks 1 square in any direction. It can't hold Buffs or Debuffs. If your King is still in check when your turn ends, you lose.",
    howToPlay: 'Your King starts on the board. Select it to move it out of danger.',
  },
  Pawn: {
    name: 'Pawn', cost: 'action', short: 'Moves 1 forward',
    text: 'Moves forward 1 square. Attacks 1 square diagonally forward. Sacrifice it to draw 1 card.',
    howToPlay: PIECE_HOW,
  },
  Knight: {
    name: 'Knight', cost: 'action', short: 'Moves in an L',
    text: 'Moves and attacks in an L-shape: 2 squares one way and 1 to the side. Jumps over other pieces. Sacrifice it to draw 2 cards.',
    howToPlay: PIECE_HOW,
  },
  Bishop: {
    name: 'Bishop', cost: 'action', short: 'Moves diagonally',
    text: 'Moves and attacks diagonally, any distance. Sacrifice it to draw 2 cards.',
    howToPlay: PIECE_HOW,
  },
  Rook: {
    name: 'Rook', cost: 'action', short: 'Moves in straight lines',
    text: 'Moves and attacks horizontally or vertically, any distance. Sacrifice it to draw 2 cards.',
    howToPlay: PIECE_HOW,
  },
  Queen: {
    name: 'Queen', cost: 'action', short: 'Moves in any line',
    text: 'Moves and attacks in any straight or diagonal line, any distance. Sacrifice it to draw 3 cards.',
    howToPlay: PIECE_HOW,
  },
  Reposition: {
    name: 'Reposition', cost: 'action', short: 'Move one of your pieces',
    text: 'Move one of your pieces to any empty square on your side. It can still act this turn.',
    howToPlay: "Choose one of your pieces that isn't Pinned, then an empty square on your side.",
  },
  Swap: {
    name: 'Swap', cost: 'action', short: 'Swap two of your pieces',
    text: 'Swap the positions of two of your pieces. They can still act this turn.',
    howToPlay: "Choose two of your pieces. Pinned pieces can't be swapped.",
  },
  Command: {
    name: 'Command', cost: 'free', short: '+1 action this turn',
    text: 'Gain 1 extra action this turn.',
    howToPlay: 'Free to play, once per turn. Your opponent can still Intercept it.',
  },
  Disrupt: {
    name: 'Disrupt', cost: 'free', short: 'Opponent loses an action',
    text: 'Your opponent has 1 fewer action on their next turn.',
    howToPlay: 'Free to play, once per turn.',
  },
  Dispel: {
    name: 'Dispel', cost: 'action', short: 'Remove a Buff or Debuff',
    text: 'Remove one Buff or Debuff from any piece.',
    howToPlay: 'Choose a piece with a Buff or Debuff, then which one to remove.',
  },
  Purge: {
    name: 'Purge', cost: 'action', short: 'Clear all Buffs and Debuffs',
    text: 'Remove every Buff and Debuff from every piece on the board.',
    howToPlay: 'Play it from your hand. No target needed.',
  },
  Return: {
    name: 'Return', cost: 'action', short: 'Take a piece back to hand',
    text: 'Return one of your pieces to your hand. Its Buffs and Debuffs are discarded.',
    howToPlay: 'Choose one of your pieces other than the King.',
  },
  Enslave: {
    name: 'Enslave', cost: 'action', short: 'Captures join your side',
    text: 'When this piece captures, put the captured piece on an empty square on your side instead of discarding it. Then Enslave is discarded.',
    howToPlay: BUFF_HOW,
  },
  Shield: {
    name: 'Shield', cost: 'action', short: 'Blocks one capture',
    text: 'The next time this piece would be captured, the Shield is discarded instead and the piece survives.',
    howToPlay: BUFF_HOW,
  },
  Bodyguard: {
    name: 'Bodyguard', cost: 'action', short: 'Guards its neighbours',
    text: "When a friendly piece directly next to this one is attacked, you may sacrifice this piece to cancel the attack. Next to your King, it stops your King being in check.",
    howToPlay: BUFF_HOW,
  },
  Protection: {
    name: 'Protection', cost: 'action', short: 'Blocks Debuffs',
    text: "Removes any Debuff on this piece, and it can't receive Debuffs while Protection is attached.",
    howToPlay: BUFF_HOW,
  },
  Pin: {
    name: 'Pin', cost: 'action', short: "Can't move",
    text: "This piece can't move, be Repositioned or be Swapped.",
    howToPlay: DEBUFF_HOW,
  },
  Fatigue: {
    name: 'Fatigue', cost: 'action', short: "Can't attack",
    text: "This piece can't attack, so it can't put a King in check either.",
    howToPlay: DEBUFF_HOW,
  },
  Silence: {
    name: 'Silence', cost: 'action', short: 'Blocks Buffs',
    text: "Removes any Buff on this piece, and it can't receive Buffs while Silence is attached.",
    howToPlay: DEBUFF_HOW,
  },
  Intercept: {
    name: 'Intercept', cost: 'reaction', short: "Cancel opponent's action",
    text: "Cancels an action or card your opponent is playing. That card or piece can't be used again this turn.",
    howToPlay: "When your opponent acts, a reaction window opens if you can react. Choose this card there.",
  },
  Reversal: {
    name: 'Reversal', cost: 'reaction', short: 'Redirect a Buff or Debuff',
    text: 'When your opponent plays a Buff or Debuff, move it onto a different piece that can legally take it.',
    howToPlay: 'In the reaction window, choose Reversal, then the new target.',
  },
}

export function cardInfo(type: CardType | 'King'): CardInfo {
  return { ...INFO[type], category: CARD_CATEGORY[type] }
}

export const ALL_CARD_TYPES = Object.keys(INFO) as (CardType | 'King')[]
