const SYMBOLS = { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟' }

export default function BoardSpace({ piece, row, lane, side, isSelected, placingCard, isValidMove, isValidAttack, isAttackRange, isCardTarget, isUnderAttack, isFlashing, onClick }) {
  const isOwnSide  = side === 0 ? row <= 1 : row >= 2
  const isOwnPiece = piece?.owner === side
  const cantAct    = isOwnPiece && !piece.canActThisTurn

  let cls = 'board-space'
  if (isOwnSide)    cls += ' own-side'
  if (isSelected)   cls += ' selected-piece'
  if (isValidMove)  cls += ' valid-move'
  if (isValidAttack) cls += ' valid-attack'
  else if (isAttackRange && !isValidMove) cls += ' attack-range'
  if (isCardTarget && !isSelected && !isValidMove && !isValidAttack) cls += ' card-target'
  if (isUnderAttack) cls += ' under-attack'
  if (isFlashing && !isUnderAttack) cls += ' last-action-flash'
  if (placingCard && isOwnSide && !piece) cls += ' place-target'
  if (onClick)      cls += ' clickable'

  return (
    <div className={cls} onClick={onClick}>
      {isOwnPiece && piece?.interceptedThisTurn && (
        <span className="piece-intercepted-label">Intercepted</span>
      )}
      {piece && (
        <div className={`piece${isOwnPiece ? '' : ' enemy'}${cantAct ? ' cant-act' : ''}`}>
          <span className="piece-symbol">{SYMBOLS[piece.type] ?? piece.type[0]}</span>
          <span className="piece-label">{piece.type}</span>
          <div className="piece-tokens">
            {piece.buff   && <span className="piece-buff"   title={piece.buff.type}>{piece.buff.type.slice(0, 3)}</span>}
            {piece.debuff && <span className="piece-debuff" title={piece.debuff.type}>{piece.debuff.type.slice(0, 3)}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
