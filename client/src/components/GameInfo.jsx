import Avatar from './Avatar'

function ActionDots({ remaining, total, disrupted = false }) {
  const label = disrupted
    ? `${total - 1} action next turn (Disrupted)`
    : `${remaining} of ${total} actions left`
  return (
    <span className="action-dots" role="img" aria-label={label}>
      {Array.from({ length: total }).map((_, i) => {
        const cls = (disrupted && i === total - 1)
          ? 'dot-disrupted'
          : i < remaining ? 'dot-filled' : 'dot-empty'
        return <span key={i} className={`action-dot ${cls}`} />
      })}
    </span>
  )
}

// The bar above the board: each player's avatar, name and actions, and whose turn it is.
// opponentHand is the opponent's face-down hand, shown inside their chip.
export default function GameInfo({ state, side, turnFlash, myWillBeDisrupted, oppWillBeDisrupted, opponentHand }) {
  const isMyTurn   = state.currentTurn === side
  const me         = state.players[side]
  const opponent   = state.players[1 - side]
  const actionsMax = state.actionsMax ?? 2
  const commandPlayed = !!state.commandUsedThisTurn

  const myRemaining  = isMyTurn  ? (state.actionsRemaining ?? 0) : (myWillBeDisrupted  ? 1 : 2)
  const myTotal      = isMyTurn  ? actionsMax : 2
  const myDisrupted  = !isMyTurn && (myWillBeDisrupted ?? false)

  const oppRemaining = !isMyTurn ? (state.actionsRemaining ?? 0) : (oppWillBeDisrupted ? 1 : 2)
  const oppTotal     = !isMyTurn ? actionsMax : 2
  const oppDisrupted = isMyTurn  && (oppWillBeDisrupted ?? false)

  const checkText = state.inCheck?.[side]
    ? 'Your King is in check'
    : state.inCheck?.[1 - side] ? `${opponent.name}'s King is in check` : null

  return (
    <header className={`game-header${turnFlash ? ' turn-flash' : ''}`}>
      <div className={`player-chip player-chip-mine${isMyTurn ? ' is-active' : ''}`}>
        <Avatar avatar={me.avatar} size={38} />
        <span className="player-chip-name">{me.name}</span>
        <ActionDots remaining={myRemaining} total={myTotal} disrupted={myDisrupted} />
        {isMyTurn && commandPlayed && <span className="action-bonus">+1 Command</span>}
      </div>

      <div className="game-header-center" role="status" aria-live="polite">
        <span className={`turn-badge${isMyTurn ? '' : ' turn-badge-theirs'}`}>
          {isMyTurn ? 'Your turn' : `${opponent.name}'s turn`}
        </span>
        {checkText && <span className="check-indicator">{checkText}</span>}
      </div>

      <div className={`player-chip player-chip-theirs${!isMyTurn ? ' is-active' : ''}`}>
        {!isMyTurn && commandPlayed && <span className="action-bonus">+1 Command</span>}
        <ActionDots remaining={oppRemaining} total={oppTotal} disrupted={oppDisrupted} />
        {opponentHand}
        <span className="player-chip-name">{opponent.name}</span>
        <Avatar avatar={opponent.avatar} size={38} />
      </div>
    </header>
  )
}
