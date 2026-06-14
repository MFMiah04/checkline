const SYMBOLS = { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟' }

export default function BoardSpace({ piece, row, lane, side, isSelected, placingCard, isValidMove, isValidAttack, isAttackRange, onClick }) {
  const isOwnSide  = side === 0 ? row <= 1 : row >= 2
  const isOwnPiece = piece?.owner === side
  const cantAct    = isOwnPiece && !piece.canActThisTurn

  let cls = 'board-space'
  if (isOwnSide)    cls += ' own-side'
  if (isSelected)   cls += ' selected-piece'
  if (isValidMove)  cls += ' valid-move'
  if (isValidAttack) cls += ' valid-attack'
  else if (isAttackRange && !isValidMove) cls += ' attack-range'
  if (placingCard && isOwnSide && !piece) cls += ' place-target'
  if (onClick)      cls += ' clickable'

  return (
    <div className={cls} onClick={onClick}>
      {piece && (
        <div className={`piece${isOwnPiece ? '' : ' enemy'}${cantAct ? ' cant-act' : ''}`}>
          <span className="piece-symbol">{SYMBOLS[piece.type] ?? piece.type[0]}</span>
          <span className="piece-label">{piece.type}</span>
          <div className="piece-tokens">
            {piece.buff   && <span className="piece-buff"   title={piece.buff.type}>+</span>}
            {piece.debuff && <span className="piece-debuff" title={piece.debuff.type}>−</span>}
          </div>
        </div>
      )}
    </div>
  )
}
