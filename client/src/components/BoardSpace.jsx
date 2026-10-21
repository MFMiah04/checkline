import { motion, AnimatePresence } from 'framer-motion'
import { isPlaceable } from '@checkline/engine'
import CardFace from './CardFace'
import PieceToken from './PieceToken'
import { describePiece, squareName } from '../utils/describe'
import { flyId } from '../utils/cardLocations'

// One square of the board. It is a button so keyboard and screen-reader users can play,
// but squares with nothing to do are taken out of the Tab order.
export default function BoardSpace({
  piece, row, lane, side, isMyTurn,
  isSelected, placingCard, isValidMove, isValidAttack, isAttackRange,
  isCardTarget, isUnderAttack, isInCheck, rankLabel, fileLabel, onClick, onInspect,
  spaceRefCallback, isFloatingOrigin, isFloatingTarget, isFloatingHighlight, floatingCard,
  isConfirmTarget, onMouseEnter,
  isShaking, errorTip,
}) {
  const isOwnSide  = side === 0 ? row <= 1 : row >= 2
  const isOwnPiece = piece?.owner === side
  const cantAct    = isOwnPiece && !piece.canActThisTurn && isMyTurn
  const isPlaceTarget = placingCard && isOwnSide && !piece

  let cls = 'board-space'
  if (isOwnSide)        cls += ' own-side'
  if (isSelected)       cls += ' selected-piece'
  if (isFloatingOrigin)    cls += ' floating-origin'
  if (isFloatingHighlight) cls += ' floating-target'
  if (isConfirmTarget)  cls += ' confirm-target'
  if (isValidMove)      cls += ' valid-move'
  if (isValidAttack)    cls += ' valid-attack'
  else if (isAttackRange && !isValidMove) cls += ' attack-range'
  if (isCardTarget && !isSelected && !isValidMove && !isValidAttack) cls += ' card-target'
  if (isUnderAttack)    cls += ' under-attack'
  if (isInCheck)       cls += ' in-check'
  if (isPlaceTarget)    cls += ' place-target'
  if (onClick)          cls += ' clickable'

  const renderPiece = piece && !isFloatingOrigin

  // What a screen reader hears for this square
  const hints = [
    isSelected && 'selected',
    isValidMove && 'move here',
    isValidAttack && 'attack',
    isPlaceTarget && 'place here',
    isCardTarget && 'choose as target',
    isUnderAttack && 'under attack',
    isInCheck && 'in check',
  ].filter(Boolean)
  const label = `${squareName(row, lane)}: ${piece ? describePiece(piece, side) : 'empty'}, ${isOwnSide ? 'your side' : "opponent's side"}${hints.length ? `. ${hints.join(', ')}` : ''}`
  const actionable = !!onClick && (isSelected || isValidMove || isValidAttack || isPlaceTarget || isCardTarget || isOwnPiece)

  // React needs `key` passed directly, not spread from an object, so it is added at each use
  const sharedMotionProps = {
    layoutId: 'floating-piece',
    initial: { scale: 0.9, opacity: 0.8 },
    animate: isShaking
      ? { scale: 1.08, opacity: 1, x: [0, -9, 9, -9, 9, -5, 5, 0] }
      : { scale: 1.08, opacity: 1, x: 0 },
    exit: { opacity: 0, transition: { duration: 0 } },
    transition: isShaking
      ? { duration: 0.4, ease: 'easeInOut' }
      : { duration: 0.08 },
  }

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      onMouseEnter={() => { onMouseEnter?.(); if (piece) onInspect?.(piece) }}
      onFocus={piece ? () => onInspect?.(piece) : undefined}
      aria-label={label}
      aria-disabled={!onClick}
      tabIndex={actionable ? 0 : -1}
      ref={el => spaceRefCallback?.(row, lane, el)}
    >
      {rankLabel != null && <span className="board-coord board-rank" aria-hidden="true">{rankLabel}</span>}
      {fileLabel != null && <span className="board-coord board-file" aria-hidden="true">{fileLabel}</span>}

      {isOwnPiece && piece?.interceptedThisTurn && (
        <span className="piece-intercepted-label" aria-hidden="true">Intercepted</span>
      )}

      {renderPiece && <PieceToken piece={piece} mySide={side} cantAct={cantAct} flyId={flyId(piece)} />}

      <AnimatePresence>
        {isFloatingTarget && floatingCard && (() => {
          const isHandCard = 'id' in floatingCard
          return (
            <motion.div key="floating-piece" {...sharedMotionProps} className="floating-wrapper" aria-hidden="true">
              {/* Held over the board, a piece card already shows as the piece it will become,
                  in its owner's colour; other cards stay cards */}
              {isHandCard && !isPlaceable(floatingCard.type)
                ? <div className="card card-mini held" data-fly={floatingCard.id ?? undefined}><CardFace type={floatingCard.type} compact /></div>
                : <PieceToken
                    piece={isHandCard ? { type: floatingCard.type, owner: floatingCard.owner } : floatingCard}
                    mySide={side}
                    className="held"
                    flyId={isHandCard ? floatingCard.id : flyId(floatingCard)}
                  />}
              {errorTip && <div className="floating-error-tip">{errorTip}</div>}
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </button>
  )
}
