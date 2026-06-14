export const DECK_COUNTS = {
  Pawn: 8, Knight: 4, Bishop: 4, Rook: 4, Queen: 2,
  Reposition: 2, Swap: 2, Command: 2, Disrupt: 2,
  Dispel: 1, Purge: 1, Return: 2,
  Enslave: 2, Shield: 3, Bodyguard: 2, Protection: 1,
  Pin: 2, Fatigue: 2, Silence: 2,
  Intercept: 2, Reversal: 2
}

export const CARD_CATEGORY = {
  Pawn: 'piece', Knight: 'piece', Bishop: 'piece',
  Rook: 'piece', Queen: 'piece', King: 'piece',
  Reposition: 'control', Swap: 'control', Command: 'control',
  Disrupt: 'control', Dispel: 'control', Purge: 'control', Return: 'control',
  Enslave: 'buff', Shield: 'buff', Bodyguard: 'buff', Protection: 'buff',
  Pin: 'debuff', Fatigue: 'debuff', Silence: 'debuff',
  Intercept: 'reaction', Reversal: 'reaction'
}

export const PIECE_TYPES = new Set(['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'])
