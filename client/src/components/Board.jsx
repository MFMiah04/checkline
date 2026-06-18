import BoardSpace from './BoardSpace'

const PIECE_TYPES = new Set(['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen'])

export default function Board({
  board, side, isMyTurn, selectedPiece, placingCard,
  validMoves, validAttacks, attackRange, cardTargets,
  underAttack, onSpaceClick,
  // Floating piece props
  spaceRefCallback, onSpaceMouseEnter, onBoardMouseLeave,
  floatingPiece,        // { piece, fromRow, fromLane } — own player's floating piece
  boardHoveredCell,     // { row, lane } — own player's hovered cell
  handFloatingCard,     // { type, owner, ... } — selected hand card to show as floating preview
  oppSelectedPiece,     // { row, lane } — opponent's selected piece origin
  oppHoveredCell,       // { row, lane } — opponent's hovered cell
  oppSelectedCardType,  // string | null — opponent's currently selected card type
  confirmTarget,        // { row, lane } — brief gold pulse on confirmed target
  // Error / shake
  isShaking, errorTip,
}) {
  const rowOrder = side === 0 ? [3, 2, 1, 0] : [0, 1, 2, 3]

  // Pre-compute origin / target keys for floating pieces
  const ownOriginKey   = floatingPiece    ? `${floatingPiece.fromRow},${floatingPiece.fromLane}` : null
  const ownTargetKey   = boardHoveredCell ? `${boardHoveredCell.row},${boardHoveredCell.lane}`    : null
  const oppOriginKey   = oppSelectedPiece ? `${oppSelectedPiece.row},${oppSelectedPiece.lane}`    : null
  const oppTargetKey   = oppHoveredCell   ? `${oppHoveredCell.row},${oppHoveredCell.lane}`        : null
  const confirmKey     = confirmTarget    ? `${confirmTarget.row},${confirmTarget.lane}`           : null

  // The piece shown floating (own: from floatingPiece state; opp: from board or card selection)
  const ownFloatingCard    = floatingPiece?.piece ?? null
  const oppFloatingCard    = oppSelectedPiece
    ? board[oppSelectedPiece.row]?.[oppSelectedPiece.lane] ?? null
    : null
  const oppHandFloatingCard = oppSelectedCardType
    ? { type: oppSelectedCardType, owner: 1 - side }
    : null

  return (
    <div className="board" onMouseLeave={onBoardMouseLeave}>
      {rowOrder.map(rowIdx => (
        <div key={rowIdx} className="board-row">
          {board[rowIdx].map((piece, laneIdx) => {
            const cellKey = `${rowIdx},${laneIdx}`

            const isMyOrigin  = cellKey === ownOriginKey
            const isMyTarget  = cellKey === ownTargetKey
            const isOppOrigin = cellKey === oppOriginKey
            const isOppTarget = cellKey === oppTargetKey

            const isFloatingOrigin = isMyOrigin || isOppOrigin
            const isFloatingTarget = isMyTarget || isOppTarget

            // Own player's floating card takes priority over hand card over opponent's
            const floatingCard = isMyTarget
              ? (ownFloatingCard ?? handFloatingCard ?? null)
              : isOppTarget
                ? (oppFloatingCard ?? oppHandFloatingCard ?? null)
                : null

            // isFloatingHighlight: controls floating-target CSS class (valid targets only)
            // Own board piece → always highlight target
            // Own hand piece card → only own-side empty cells
            // Own hand buff/debuff/control → only cardTarget cells
            // Opponent board piece → always highlight
            // Opponent hand card → no cell highlight (card float is enough)
            const isOwnSide = side === 0 ? rowIdx <= 1 : rowIdx >= 2
            const isFloatingHighlight =
              (isMyTarget && ownFloatingCard != null && (!cardTargets || cardTargets.has(cellKey))) ||
              (isMyTarget && !ownFloatingCard && handFloatingCard != null && (
                PIECE_TYPES.has(handFloatingCard.type)
                  ? (isOwnSide && piece === null)
                  : (cardTargets?.has(cellKey) ?? false)
              )) ||
              (isOppTarget && oppFloatingCard != null)

            return (
              <BoardSpace
                key={laneIdx}
                piece={piece}
                row={rowIdx}
                lane={laneIdx}
                side={side}
                isMyTurn={isMyTurn}
                isSelected={selectedPiece?.row === rowIdx && selectedPiece?.lane === laneIdx}
                placingCard={placingCard}
                isValidMove={validMoves?.has(cellKey) ?? false}
                isValidAttack={validAttacks?.has(cellKey) ?? false}
                isAttackRange={attackRange?.has(cellKey) ?? false}
                isCardTarget={cardTargets?.has(cellKey) ?? false}
                isUnderAttack={underAttack === cellKey}
                onClick={onSpaceClick ? () => onSpaceClick(rowIdx, laneIdx) : undefined}
                spaceRefCallback={spaceRefCallback}
                isFloatingOrigin={isFloatingOrigin}
                isFloatingTarget={isFloatingTarget}
                isFloatingHighlight={isFloatingHighlight}
                floatingCard={floatingCard}
                isConfirmTarget={cellKey === confirmKey}
                onMouseEnter={onSpaceMouseEnter ? () => onSpaceMouseEnter(rowIdx, laneIdx) : undefined}
                isShaking={isShaking}
                errorTip={errorTip}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
