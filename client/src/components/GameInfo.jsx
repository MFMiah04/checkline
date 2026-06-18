export default function GameInfo({ state, side, turnFlash }) {
  const isMyTurn = state.currentTurn === side
  const opponent = state.players[1 - side]
  const me = state.players[side]

  return (
    <div className={`game-info ${isMyTurn ? 'my-turn' : 'opp-turn'}${turnFlash ? ' turn-flash' : ''}`}>
      <div className="turn-indicator">
        <span className={`turn-label ${isMyTurn ? 'turn-label-mine' : 'turn-label-opp'}`}>
          {isMyTurn ? 'YOUR TURN' : `${opponent.name}'s TURN`}
        </span>
      </div>
      <div className="turn-players">
        <span className={isMyTurn ? 'turn-player-active' : 'turn-player-waiting'}>{me.name}</span>
        <span className="turn-vs">vs</span>
        <span className={!isMyTurn ? 'turn-player-active' : 'turn-player-waiting'}>{opponent.name}</span>
      </div>
      {state.inCheck?.[1 - side] && (
        <span className="check-indicator">{opponent.name} in check</span>
      )}
    </div>
  )
}
