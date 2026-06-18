import Avatar from './Avatar'

function ActionDots({ remaining, total, disrupted = false }) {
  return (
    <div className="action-dots">
      {Array.from({ length: total }).map((_, i) => {
        const cls = (disrupted && i === total - 1)
          ? 'dot-disrupted'
          : i < remaining ? 'dot-filled' : 'dot-empty'
        return <span key={i} className={`action-dot ${cls}`} title={disrupted && i === total - 1 ? 'Disrupted next turn' : undefined} />
      })}
    </div>
  )
}

export default function GameInfo({ state, side, turnFlash, myWillBeDisrupted, oppWillBeDisrupted }) {
  const isMyTurn   = state.currentTurn === side
  const me         = state.players[side]
  const opponent   = state.players[1 - side]
  const actionsMax = state.actionsMax ?? 2

  const myRemaining  = isMyTurn  ? (state.actionsRemaining ?? 0) : (myWillBeDisrupted  ? 1 : 2)
  const myTotal      = isMyTurn  ? actionsMax : 2
  const myDisrupted  = !isMyTurn && (myWillBeDisrupted ?? false)

  const oppRemaining = !isMyTurn ? (state.actionsRemaining ?? 0) : (oppWillBeDisrupted ? 1 : 2)
  const oppTotal     = !isMyTurn ? actionsMax : 2
  const oppDisrupted = isMyTurn  && (oppWillBeDisrupted ?? false)

  return (
    <div className={`game-info-bar${turnFlash ? ' turn-flash' : ''}`}>
      {/* Left = me */}
      <div className={`gib-side${isMyTurn ? ' gib-side-active' : ''}`}>
        <div className="gib-avatar-wrap">
          <Avatar avatar={me.avatar} size={48} />
        </div>
        <div className="gib-info">
          <span className={`gib-name${isMyTurn ? ' gib-name-active' : ' gib-name-dim'}`}>{me.name}</span>
          <ActionDots remaining={myRemaining} total={myTotal} disrupted={myDisrupted} />
        </div>
      </div>

      <div className="gib-center">
        <span className="gib-vs">VS</span>
        {state.inCheck?.[1 - side] && (
          <span className="check-indicator gib-check">{opponent.name} in check</span>
        )}
      </div>

      {/* Right = opponent */}
      <div className={`gib-side gib-side-right${!isMyTurn ? ' gib-side-active' : ''}`}>
        <div className="gib-info">
          <span className={`gib-name${!isMyTurn ? ' gib-name-active' : ' gib-name-dim'}`}>{opponent.name}</span>
          <ActionDots remaining={oppRemaining} total={oppTotal} disrupted={oppDisrupted} />
        </div>
        <div className="gib-avatar-wrap">
          <Avatar avatar={opponent.avatar} size={48} />
        </div>
      </div>
    </div>
  )
}
