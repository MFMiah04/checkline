const SYMBOLS = { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟' }
const CARD_ART = {
  Reposition: '→', Swap: '⇄', Command: '+', Disrupt: '⊗', Dispel: '×',
  Purge: '⊛', Return: '↩', Enslave: '∞',
  Shield: '◉', Bodyguard: '◈', Protection: '◇',
  Pin: '⊘', Fatigue: '⏸', Silence: '∅',
  Intercept: '✕', Reversal: '↺',
}
const CATEGORY = {
  Pawn: 'piece', Knight: 'piece', Bishop: 'piece',
  Rook: 'piece', Queen: 'piece', King: 'piece',
  Reposition: 'control', Swap: 'control', Command: 'control',
  Disrupt: 'control', Dispel: 'control', Purge: 'control', Return: 'control',
  Enslave: 'buff', Shield: 'buff', Bodyguard: 'buff', Protection: 'buff',
  Pin: 'debuff', Fatigue: 'debuff', Silence: 'debuff',
  Intercept: 'reaction', Reversal: 'reaction',
}

export default function DeckPile({ deckSize = 0, pileRef, deckHovered, liftedCard, onDeckHover, onDeckLeave, onDeckClick, oppDeckHovered }) {
  const showInsert = (deckHovered && liftedCard) || oppDeckHovered
  const isOwn = deckHovered && liftedCard

  let insertCard = null
  if (showInsert && isOwn && liftedCard) {
    const t    = liftedCard.card.type
    const icon = SYMBOLS[t] ?? CARD_ART[t] ?? t[0]
    const cat  = CATEGORY[t] ?? ''
    insertCard = (
      <div className={`card ${cat} pile-card pile-card-insert`}>
        <div className="card-header">
          <span className="card-header-icon">{icon}</span>
          <span className="card-header-name">{t}</span>
        </div>
        <div className="card-body">
          <span className="card-center-art">{icon}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={['pile-area deck-pile', showInsert ? 'deck-insert' : ''].filter(Boolean).join(' ')}
      ref={pileRef}
      onClick={onDeckClick}
      onMouseEnter={onDeckHover}
      onMouseLeave={onDeckLeave}
    >
      <span className="pile-label">Deck ({deckSize})</span>
      <div className="pile-stack">
        {deckSize === 0 && !showInsert ? (
          <div className="pile-empty">Empty</div>
        ) : (
          <>
            {deckSize > 2 && <div className="card face-down pile-card pile-card-3" />}
            {deckSize > 1 && <div className="card face-down pile-card pile-card-2" />}
            {showInsert && (
              isOwn
                ? insertCard
                : <div className="card face-down pile-card pile-card-insert" />
            )}
            {deckSize > 0 && <div className="card face-down pile-card pile-card-1" />}
          </>
        )}
      </div>
      {showInsert && (
        <span className="pile-cycle-hint">
          {isOwn ? 'Shuffle in? (free)' : 'Shuffling in…'}
        </span>
      )}
    </div>
  )
}
