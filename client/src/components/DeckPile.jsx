export default function DeckPile({ deckSize = 0 }) {
  return (
    <div className="pile-area">
      <span className="pile-label">Deck ({deckSize})</span>
      <div className="pile-stack">
        {deckSize === 0 ? (
          <div className="pile-empty">Empty</div>
        ) : (
          <>
            {deckSize > 2 && <div className="card face-down pile-card pile-card-3" />}
            {deckSize > 1 && <div className="card face-down pile-card pile-card-2" />}
            <div className="card face-down pile-card pile-card-1" />
          </>
        )}
      </div>
    </div>
  )
}
