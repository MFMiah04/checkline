import CardComponent from './CardComponent'

export default function Hand({ cards, faceDown = false, selectedSet, selectedIdx, interceptedIds, onCardClick }) {
  if (faceDown) {
    const count = typeof cards === 'number' ? cards : (cards?.count ?? 0)
    return (
      <div className="hand opponent-hand">
        {Array.from({ length: count }, (_, i) => <CardComponent key={i} faceDown />)}
        {count === 0 && <span className="hand-empty">No cards</span>}
      </div>
    )
  }

  const cardList = Array.isArray(cards) ? cards : []
  return (
    <div className="hand">
      {cardList.map((card, i) => (
        <CardComponent
          key={card.id}
          card={card}
          selected={selectedSet?.has(i) || selectedIdx === i}
          intercepted={interceptedIds?.includes(card.id) ?? false}
          onClick={onCardClick ? () => onCardClick(i) : undefined}
        />
      ))}
      {cardList.length === 0 && <span className="hand-empty">Empty hand</span>}
    </div>
  )
}
