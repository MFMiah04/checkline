export default function DeckPile({ deckSize = 0, pileRef, deckHovered, liftedCard, onDeckHover, onDeckLeave, onDeckClick, oppDeckHovered }) {
  const showInsert = (deckHovered && liftedCard) || oppDeckHovered
  const isOwn = deckHovered && liftedCard

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
              isOwn ? (
                <div className="card pile-card pile-card-insert">
                  <span className="card-name">{liftedCard.card.type}</span>
                </div>
              ) : (
                <div className="card face-down pile-card pile-card-insert" />
              )
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
