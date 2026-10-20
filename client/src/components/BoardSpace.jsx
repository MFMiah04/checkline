import { motion, AnimatePresence } from 'framer-motion'

const SYMBOLS = { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟' }

const BUFF_DEBUFF_TYPES = new Set(['Enslave', 'Shield', 'Bodyguard', 'Protection', 'Pin', 'Fatigue', 'Silence'])

const CARD_ART = {
  Reposition: '→', Swap: '⇄', Command: '+', Disrupt: '⊗', Dispel: '×',
  Purge: '⊛', Return: '↩', Enslave: '∞',
  Shield: '◉', Bodyguard: '◈', Protection: '◇',
  Pin: '⊘', Fatigue: '⏸', Silence: '∅',
  Intercept: '✕', Reversal: '↺',
}

const CATEGORY = {
  Pawn: 'piece', Knight: 'piece', Bishop: 'piece',
  Rook: 'piece', Queen: 'piece', King: 'piece',
  Reposition: 'control', Swap: 'control', Command: 'control',
  Disrupt: 'control', Dispel: 'control', Purge: 'control', Return: 'control',
  Enslave: 'buff', Shield: 'buff', Bodyguard: 'buff', Protection: 'buff',
  Pin: 'debuff', Fatigue: 'debuff', Silence: 'debuff',
  Intercept: 'reaction', Reversal: 'reaction'
}

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

// Returns 'status-first' (bottom, z=2) or 'status-second' (top, z=3)
// based on which was placed first. Defaults to buff-first when unknown.
function getStatusPos(piece, which) {
  if (!piece.buff || !piece.debuff) return 'status-first'
  const first = piece.firstStatus ?? 'buff'
  return first === which ? 'status-first' : 'status-second'
}

function StatusCard({ status, posClass, colorClass }) {
  return (
    <div className={`board-status-card ${colorClass} ${posClass}`}>
      <div className="board-card-header">{status.type}</div>
      <div className="board-card-body">
        <span className="board-card-symbol">{CARD_ART[status.type] ?? status.type[0]}</span>
      </div>
    </div>
  )
}

export default function BoardSpace({
  piece, row, lane, side, isMyTurn,
  isSelected, placingCard, isValidMove, isValidAttack, isAttackRange,
  isCardTarget, isUnderAttack, onClick,
  spaceRefCallback, isFloatingOrigin, isFloatingTarget, isFloatingHighlight, floatingCard,
  isConfirmTarget, onMouseEnter,
  isShaking, errorTip,
}) {
  const isOwnSide  = side === 0 ? row <= 1 : row >= 2
  const isOwnPiece = piece?.owner === side
  const cantAct    = isOwnPiece && !piece.canActThisTurn && isMyTurn

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

  const renderPiece = piece && !isFloatingOrigin

  const sharedMotionProps = {
    key: 'floating-piece',
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
        <>
          <div className="piece-group">
            <div className={`board-card${cantAct ? ' cant-act' : ''}`}>
              <div className="board-card-header">{piece.type}</div>
              <div className="board-card-body">
                <span className="board-card-symbol">{SYMBOLS[piece.type] ?? piece.type[0]}</span>
              </div>
            </div>
            {piece.buff && (
              <StatusCard
                status={piece.buff}
                posClass={getStatusPos(piece, 'buff')}
                colorClass="buff-status"
              />
            )}
            {piece.debuff && (
              <StatusCard
                status={piece.debuff}
                posClass={getStatusPos(piece, 'debuff')}
                colorClass="debuff-status"
              />
            )}
          </div>

          {/* tooltip outside piece-group — stays upright regardless of rotation */}
          <div className={`piece-hover-tooltip${cantAct ? ' pht-trigger-cant-act' : ' pht-trigger-piece'}`}>
            <div className="pht-title">{piece.type}</div>
            {PIECE_TIPS[piece.type] && <div className="pht-desc">{PIECE_TIPS[piece.type]}</div>}
            {piece.buff && <div className="pht-buff">{piece.buff.type}: {TOKEN_TIPS[piece.buff.type]}</div>}
            {piece.debuff && <div className="pht-debuff">{piece.debuff.type}: {TOKEN_TIPS[piece.debuff.type]}</div>}
          </div>
        </>
      )}

      <AnimatePresence>
        {isFloatingTarget && floatingCard && (() => {
          const isHandCard = 'id' in floatingCard

          if (!isHandCard) {
            // Board piece being moved — show full piece-group with status cards
            return (
              <motion.div {...sharedMotionProps} className="floating-board-wrapper">
                <div className="piece-group">
                  <div className="board-card floating-piece-highlight">
                    <div className="board-card-header">{floatingCard.type}</div>
                    <div className="board-card-body">
                      <span className="board-card-symbol">{SYMBOLS[floatingCard.type] ?? floatingCard.type[0]}</span>
                    </div>
                  </div>
                  {floatingCard.buff && (
                    <StatusCard
                      status={floatingCard.buff}
                      posClass={getStatusPos(floatingCard, 'buff')}
                      colorClass="buff-status"
                    />
                  )}
                  {floatingCard.debuff && (
                    <StatusCard
                      status={floatingCard.debuff}
                      posClass={getStatusPos(floatingCard, 'debuff')}
                      colorClass="debuff-status"
                    />
                  )}
                </div>
                {errorTip && <div className="floating-error-tip">{errorTip}</div>}
              </motion.div>
            )
          }

          if (BUFF_DEBUFF_TYPES.has(floatingCard.type)) {
            // Buff/debuff hand card — preview as board-style card (portrait, same as when placed)
            const isBuff = CATEGORY[floatingCard.type] === 'buff'
            return (
              <motion.div {...sharedMotionProps} className="floating-hand-wrapper">
                <div className={`board-status-card ${isBuff ? 'buff-status' : 'debuff-status'} floating-status-preview`}>
                  <div className="board-card-header">{floatingCard.type}</div>
                  <div className="board-card-body">
                    <span className="board-card-symbol">{CARD_ART[floatingCard.type] ?? floatingCard.type[0]}</span>
                  </div>
                </div>
                {errorTip && <div className="floating-error-tip">{errorTip}</div>}
              </motion.div>
            )
          }

          // Other hand card (piece/control/reaction) — show portrait with full hand card design
          const icon     = SYMBOLS[floatingCard.type] ?? CARD_ART[floatingCard.type] ?? floatingCard.type[0]
          const category = CATEGORY[floatingCard.type] ?? ''
          return (
            <motion.div {...sharedMotionProps} className="floating-hand-wrapper">
              <div className={`card ${category}`}>
                <div className="card-header">
                  <span className="card-header-icon">{icon}</span>
                  <span className="card-header-name">{floatingCard.type}</span>
                </div>
                <div className="card-body">
                  <span className="card-center-art">{icon}</span>
                </div>
              </div>
              {errorTip && <div className="floating-error-tip">{errorTip}</div>}
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}
