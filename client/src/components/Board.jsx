import BoardSpace from './BoardSpace'

export default function Board({ board, side, onSpaceClick }) {
  // Player always sees their own side at the bottom.
  // Side 0 owns rows 0-1, so visual order is [3,2,1,0] (opponent back → own back).
  // Side 1 owns rows 2-3, so visual order is [0,1,2,3] (opponent back → own back).
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
              onClick={onSpaceClick ? () => onSpaceClick(rowIdx, laneIdx) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
