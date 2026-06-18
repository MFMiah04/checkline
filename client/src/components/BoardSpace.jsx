import { motion, AnimatePresence } from 'framer-motion'

const SYMBOLS = { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟' }

const PIECE_TIPS = {
  King:   'Moves 1 in any direction. If checkmated, you lose.',
  Queen:  'Moves any distance in any direction. Sacrifice draws 3 cards.',
  Rook:   'Moves any distance horizontally or vertically.',
  Bishop: 'Moves any distance diagonally.',
  Knight: 'Moves in an L-shape (2+1). Can jump over pieces.',
  Pawn:   'Moves 1 forward. Attacks 1 diagonally forward.',
}
const TOKEN_TIPS = {
  Enslave:    'After capturing an enemy piece, place it on your side instead.',
  Shield:     'The next attack against this piece is blocked.',
  Bodyguard:  'An adjacent piece will sacrifice itself to protect this one.',
  Protection: 'Cannot receive debuffs while this is attached.',
  Pin:        'Cannot move until this debuff is removed.',
  Fatigue:    'Cannot attack until this debuff is removed.',
  Silence:    'Cannot have buffs applied to it.',
}

export default function BoardSpace({
  piece, row, lane, side,
  isSelected, placingCard, isValidMove, isValidAttack, isAttackRange,
  isCardTarget, isUnderAttack, onClick,
  // Floating piece / animation props
  spaceRefCallback, isFloatingOrigin, isFloatingTarget, isFloatingHighlight, floatingCard,
  isConfirmTarget, onMouseEnter,
  // Error / shake
  isShaking, errorTip,
}) {
  const isOwnSide  = side === 0 ? row <= 1 : row >= 2
  const isOwnPiece = piece?.owner === side
  const cantAct    = isOwnPiece && !piece.canActThisTurn

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
  if (placingCard && isOwnSide && !piece) cls += ' place-target'
  if (onClick)          cls += ' clickable'

  // Piece to render: hidden when floating (it's shown at the target cell instead)
  const renderPiece = piece && !isFloatingOrigin

  return (
    <div
      className={cls}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      ref={el => spaceRefCallback?.(row, lane, el)}
    >
      {isOwnPiece && piece?.interceptedThisTurn && (
        <span className="piece-intercepted-label">Intercepted</span>
      )}
      {renderPiece && (
        <div className={`piece${isOwnPiece ? '' : ' enemy'}${cantAct ? ' cant-act' : ''}`}>
          <span className="piece-symbol">{SYMBOLS[piece.type] ?? piece.type[0]}</span>
          <span className="piece-label">{piece.type}</span>
          <div className="piece-tokens">
            {piece.buff   && <span className="piece-buff"   title={piece.buff.type}>{piece.buff.type.slice(0, 3)}</span>}
            {piece.debuff && <span className="piece-debuff" title={piece.debuff.type}>{piece.debuff.type.slice(0, 3)}</span>}
          </div>
          <div className="piece-hover-tooltip">
            <div className="pht-title">{piece.type}</div>
            {PIECE_TIPS[piece.type] && <div className="pht-desc">{PIECE_TIPS[piece.type]}</div>}
            {piece.buff && <div className="pht-buff">{piece.buff.type}: {TOKEN_TIPS[piece.buff.type]}</div>}
            {piece.debuff && <div className="pht-debuff">{piece.debuff.type}: {TOKEN_TIPS[piece.debuff.type]}</div>}
          </div>
        </div>
      )}

      {/* Floating piece / card hovering above this cell */}
      <AnimatePresence>
        {isFloatingTarget && floatingCard && (
          <motion.div
            key="floating-piece"
            layoutId="floating-piece"
            className={`floating-piece-card${floatingCard.owner === side ? '' : ' enemy'}`}
            initial={{ scale: 0.9, opacity: 0.8 }}
            animate={isShaking
              ? { scale: 1.08, opacity: 1, x: [0, -9, 9, -9, 9, -5, 5, 0] }
              : { scale: 1.08, opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={isShaking
              ? { duration: 0.4, ease: 'easeInOut' }
              : { duration: 0.08 }}
          >
            <span className="piece-symbol">{SYMBOLS[floatingCard.type] ?? floatingCard.type?.[0]}</span>
            <span className="piece-label">{floatingCard.type}</span>
            {errorTip && <div className="floating-error-tip">{errorTip}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
