const SYMBOLS = { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟' }

export default function BoardSpace({ piece, row, lane, side, onClick }) {
  const isOwnSide = side === 0 ? row <= 1 : row >= 2

  return (
    <div
      className={`board-space${isOwnSide ? ' own-side' : ''}${onClick ? ' clickable' : ''}`}
      onClick={onClick}
    >
      {piece && (
        <div className={`piece${piece.owner !== side ? ' enemy' : ''}`}>
          <span className="piece-symbol">{SYMBOLS[piece.type] ?? piece.type}</span>
          <span className="piece-label">{piece.type}</span>
          <div className="piece-tokens">
            {piece.buff && <span className="piece-buff" title={piece.buff.type}>+</span>}
            {piece.debuff && <span className="piece-debuff" title={piece.debuff.type}>−</span>}
          </div>
        </div>
      )}
    </div>
  )
}
