import type { CardCategory, CardType, PieceType, PlaceablePieceType, BuffType, DebuffType } from './types.js'

export const DECK_COUNTS: Record<CardType, number> = {
  Pawn: 8, Knight: 4, Bishop: 4, Rook: 4, Queen: 2,
  Reposition: 2, Swap: 2, Command: 2, Disrupt: 2,
  Dispel: 1, Purge: 1, Return: 2,
  Enslave: 2, Shield: 3, Bodyguard: 2, Protection: 1,
  Pin: 2, Fatigue: 2, Silence: 2,
  Intercept: 2, Reversal: 2,
}

export const CARD_CATEGORY: Record<CardType | 'King', CardCategory> = {
  Pawn: 'piece', Knight: 'piece', Bishop: 'piece',
  Rook: 'piece', Queen: 'piece', King: 'piece',
  Reposition: 'control', Swap: 'control', Command: 'control',
  Disrupt: 'control', Dispel: 'control', Purge: 'control', Return: 'control',
  Enslave: 'buff', Shield: 'buff', Bodyguard: 'buff', Protection: 'buff',
  Pin: 'debuff', Fatigue: 'debuff', Silence: 'debuff',
  Intercept: 'reaction', Reversal: 'reaction',
}

export const PIECE_TYPES: ReadonlySet<string> = new Set<PieceType>(['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'])
export const PLACEABLE_TYPES: ReadonlySet<string> = new Set<PlaceablePieceType>(['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen'])
export const BUFF_TYPES: ReadonlySet<string> = new Set<BuffType>(['Enslave', 'Shield', 'Bodyguard', 'Protection'])
export const DEBUFF_TYPES: ReadonlySet<string> = new Set<DebuffType>(['Pin', 'Fatigue', 'Silence'])

// Type guards: narrow a CardType to a more specific type after the check
export function isPlaceable(type: string): type is PlaceablePieceType { return PLACEABLE_TYPES.has(type) }
export function isBuff(type: string): type is BuffType { return BUFF_TYPES.has(type) }
export function isDebuff(type: string): type is DebuffType { return DEBUFF_TYPES.has(type) }
