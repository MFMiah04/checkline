const CATEGORY = {
  Pawn: 'piece', Knight: 'piece', Bishop: 'piece',
  Rook: 'piece', Queen: 'piece', King: 'piece',
  Reposition: 'control', Swap: 'control', Command: 'control',
  Disrupt: 'control', Dispel: 'control', Purge: 'control', Return: 'control',
  Enslave: 'buff', Shield: 'buff', Bodyguard: 'buff', Protection: 'buff',
  Pin: 'debuff', Fatigue: 'debuff', Silence: 'debuff',
  Intercept: 'reaction', Reversal: 'reaction'
}

const TOOLTIP = {
  Pawn:       'Place on your side. Moves 1 forward. Attacks 1 diagonally forward.',
  Knight:     'Place on your side. Moves in an L-shape (2+1). Can jump over pieces.',
  Bishop:     'Place on your side. Moves diagonally any distance.',
  Rook:       'Place on your side. Moves horizontally or vertically any distance.',
  Queen:      'Place on your side. Moves in any direction any distance. Sacrifice draws 3 cards.',
  King:       'Your King. Moves 1 in any direction. If checkmated, you lose.',
  Reposition: 'Move one of your pieces to any empty space on your side. Does not use its action.',
  Swap:       'Swap two of your pieces. Does not use their actions.',
  Command:    'Gain 1 extra action this turn.',
  Disrupt:    'Opponent gets only 1 action next turn.',
  Dispel:     'Remove a buff or debuff from any piece.',
  Purge:      'Remove all buffs and debuffs from every piece on the board.',
  Return:     'Return one of your pieces to your hand.',
  Enslave:    'After capturing an enemy piece, place it on your side instead of discarding.',
  Shield:     'Protect a friendly piece. The next attack against it is blocked.',
  Bodyguard:  'Assign a friendly piece as a Bodyguard. It will sacrifice itself to protect the target.',
  Protection: 'Discard any Debuff from this piece. This piece cannot receive Debuffs while Protection is attached.',
  Pin:        'Debuff an enemy piece. It cannot move until the debuff is removed.',
  Fatigue:    'Debuff an enemy piece. It cannot attack until the debuff is removed.',
  Silence:    'Debuff an enemy piece. It cannot have buffs applied to it.',
  Intercept:  'React to an opponent\'s action. Cancel it and lock the card or piece for this turn.',
  Reversal:   'React to an opponent\'s buff or debuff. Redirect it to a different target.',
}

export default function CardComponent({ card, faceDown = false, selected = false, intercepted = false, reactionAvailable = false, onClick }) {
  if (faceDown) {
    return <div className="card face-down" />
  }

  const category = CATEGORY[card.type] || ''
  const isClickable = onClick && !intercepted

  const tooltip = TOOLTIP[card.type]

  return (
    <div
      className={`card ${category}${selected ? ' selected' : ''}${intercepted ? ' intercepted' : ''}${reactionAvailable ? ' reaction-available' : ''}${isClickable ? ' clickable' : ''}`}
      onClick={intercepted ? undefined : onClick}
    >
      {intercepted && <span className="card-intercepted-label">Intercepted</span>}
      <span className="card-name">{card.type}</span>
      <span className="card-category">{category}</span>
      {tooltip && <div className="card-tooltip">{tooltip}</div>}
    </div>
  )
}
