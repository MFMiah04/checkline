import Icon from './Icon'

// A piece on the board: ivory for you, walnut for your opponent, with any Buff or Debuff
// shown as small labels underneath.
export default function PieceToken({ piece, mySide, cantAct = false, className = '' }) {
  const mine = piece.owner === mySide
  return (
    <span className={`piece ${mine ? 'piece-mine' : 'piece-theirs'}${cantAct ? ' cant-act' : ''} ${className}`}>
      <Icon name={piece.type} size={null} className="piece-icon" />
      {(piece.buff || piece.debuff) && (
        <span className="piece-statuses">
          {piece.buff && <span className="piece-status status-buff"><Icon name={piece.buff.type} size={null} />{piece.buff.type}</span>}
          {piece.debuff && <span className="piece-status status-debuff"><Icon name={piece.debuff.type} size={null} />{piece.debuff.type}</span>}
        </span>
      )}
    </span>
  )
}

