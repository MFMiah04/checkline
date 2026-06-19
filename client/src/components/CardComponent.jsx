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

// Chess piece symbols — used as center art AND corner badge for piece cards
const PIECE_SYMBOLS = { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟' }

// Center art for non-piece cards
const CARD_ART = {
  Reposition: '→', Swap: '⇄', Command: '+', Disrupt: '⊗', Dispel: '×',
  Purge: '⊛', Return: '↩', Enslave: '∞',
  Shield: '◉', Bodyguard: '◈', Protection: '◇',
  Pin: '⊘', Fatigue: '⏸', Silence: '∅',
  Intercept: '✕', Reversal: '↺',
}

// Corner badge abbreviation for non-piece cards
const CARD_ABBREV = {
  Reposition: 'Re', Swap: 'Sw', Command: 'Cm', Disrupt: 'Di', Dispel: 'Dp',
  Purge: 'Pu', Return: 'Rt', Enslave: 'En',
  Shield: 'Sh', Bodyguard: 'Bg', Protection: 'Pr',
  Pin: 'Pi', Fatigue: 'Fa', Silence: 'Si',
  Intercept: 'In', Reversal: 'Rv',
}

export default function CardComponent({ card, faceDown = false, selected = false, intercepted = false, reactionAvailable = false, onClick }) {
  if (faceDown) {
    return <div className="card face-down" />
  }

  const category = CATEGORY[card.type] || ''
  const isClickable = onClick && !intercepted
  const tooltip = TOOLTIP[card.type]

  const pieceSymbol = PIECE_SYMBOLS[card.type]
  const cornerText  = pieceSymbol ?? CARD_ABBREV[card.type] ?? card.type.slice(0, 2)
  const centerArt   = pieceSymbol ?? CARD_ART[card.type] ?? card.type[0]
  const isPiece     = !!pieceSymbol

  return (
    <div
      className={`card ${category}${selected ? ' selected' : ''}${intercepted ? ' intercepted' : ''}${reactionAvailable ? ' reaction-available' : ''}${isClickable ? ' clickable' : ''}`}
      onClick={intercepted ? undefined : onClick}
    >
      {/* Top-left corner badge */}
      <div className="card-corner-tl">{cornerText}</div>

      {intercepted && <span className="card-intercepted-label">Intercepted</span>}

      {/* Center art */}
      {isPiece
        ? <span className="card-center-symbol">{centerArt}</span>
        : <span className="card-center-art">{centerArt}</span>
      }

      <span className="card-name">{card.type}</span>

      {/* Bottom-right corner badge (mirrored, rotated 180° via CSS) */}
      <div className="card-corner-br">{cornerText}</div>

      {tooltip && <div className="card-tooltip">{tooltip}</div>}
    </div>
  )
}
