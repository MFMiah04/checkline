const CATEGORY = {
  Pawn: 'piece', Knight: 'piece', Bishop: 'piece',
  Rook: 'piece', Queen: 'piece', King: 'piece',
  Reposition: 'control', Swap: 'control', Command: 'control',
  Disrupt: 'control', Dispel: 'control', Purge: 'control', Return: 'control',
  Enslave: 'buff', Shield: 'buff', Bodyguard: 'buff', Protection: 'buff',
  Pin: 'debuff', Fatigue: 'debuff', Silence: 'debuff',
  Intercept: 'reaction', Reversal: 'reaction'
}

export default function CardComponent({ card, faceDown = false, selected = false, intercepted = false, onClick }) {
  if (faceDown) {
    return <div className="card face-down" />
  }

  const category = CATEGORY[card.type] || ''

  return (
    <div
      className={`card ${category}${selected ? ' selected' : ''}${intercepted ? ' intercepted' : ''}${onClick && !intercepted ? ' clickable' : ''}`}
      onClick={intercepted ? undefined : onClick}
    >
      {intercepted && <span className="card-intercepted-label">Intercepted</span>}
      <span className="card-name">{card.type}</span>
      <span className="card-category">{category}</span>
    </div>
  )
}
