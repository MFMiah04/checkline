export default function GameInfo({ state, side }) {
  const me = state.players[side]
  const opponent = state.players[1 - side]
  const isMyTurn = state.currentTurn === side
  const topDiscard = state.discardPile?.[0]

  return (
    <div className="game-info">
      <div className="turn-indicator">
        {isMyTurn
          ? <strong>Your turn</strong>
          : <span>{opponent.name}'s turn</span>
        }
      </div>

      {isMyTurn && (
        <div className="actions-remaining">
          Actions remaining: <strong>{state.actionsRemaining}</strong>
        </div>
      )}

      <div className="deck-discard">
        <span>Deck: {state.deckSize}</span>
        <span>
          Discard: {state.discardPile?.length ?? 0}
          {topDiscard && ` (top: ${topDiscard.type})`}
        </span>
      </div>
    </div>
  )
}
