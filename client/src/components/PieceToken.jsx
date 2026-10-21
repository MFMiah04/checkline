import Icon from './Icon'

// A piece on the board: ivory for you, walnut for your opponent, with any Buff or Debuff
// shown as small labels underneath. flyId tags the piece (and its statuses) for the move
// animations; only the real piece on its square gets one, not previews or ghosts.
export default function PieceToken({ piece, mySide, cantAct = false, className = '', flyId = null }) {
  const mine = piece.owner === mySide
  const tag = id => (flyId != null && id != null ? { 'data-fly': id } : {})
  return (
    <span className={`piece ${mine ? 'piece-mine' : 'piece-theirs'}${cantAct ? ' cant-act' : ''} ${className}`} {...tag(flyId)}>
      <Icon name={piece.type} size={null} className="piece-icon" />
      {(piece.buff || piece.debuff) && (
        <span className="piece-statuses">
          {piece.buff && <span className="piece-status status-buff" {...tag(piece.buff.id)}><Icon name={piece.buff.type} size={null} />{piece.buff.type}</span>}
          {piece.debuff && <span className="piece-status status-debuff" {...tag(piece.debuff.id)}><Icon name={piece.debuff.type} size={null} />{piece.debuff.type}</span>}
        </span>
      )}
    </span>
  )
}

