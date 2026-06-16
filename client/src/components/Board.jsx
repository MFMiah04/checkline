import BoardSpace from './BoardSpace'

export default function Board({ board, side, selectedPiece, placingCard, validMoves, validAttacks, attackRange, cardTargets, underAttack, flashCells, onSpaceClick }) {
  const rowOrder = side === 0 ? [3, 2, 1, 0] : [0, 1, 2, 3]

  return (
    <div className="board">
      {rowOrder.map(rowIdx => (
        <div key={rowIdx} className="board-row">
          {board[rowIdx].map((piece, laneIdx) => (
            <BoardSpace
              key={laneIdx}
              piece={piece}
              row={rowIdx}
              lane={laneIdx}
              side={side}
              isSelected={selectedPiece?.row === rowIdx && selectedPiece?.lane === laneIdx}
              placingCard={placingCard}
              isValidMove={validMoves?.has(`${rowIdx},${laneIdx}`) ?? false}
              isValidAttack={validAttacks?.has(`${rowIdx},${laneIdx}`) ?? false}
              isAttackRange={attackRange?.has(`${rowIdx},${laneIdx}`) ?? false}
              isCardTarget={cardTargets?.has(`${rowIdx},${laneIdx}`) ?? false}
              isUnderAttack={underAttack === `${rowIdx},${laneIdx}`}
              isFlashing={flashCells?.has(`${rowIdx},${laneIdx}`) ?? false}
              onClick={onSpaceClick ? () => onSpaceClick(rowIdx, laneIdx) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
