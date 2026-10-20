import { useEffect, useRef } from 'react'

import CardFace from './CardFace'
import PieceToken from './PieceToken'

export default function DiscardPile({
  discardPile = [], viewIndex = 0, browserId = null, mySide,
  canCycle = false, onBrowse, onCycle, pileRef: externalRef,
  // Sacrifice hover
  canSacrifice = false, discardHovered = false, floatingPiece = null,
  onSacrificeHover, onSacrificeLeave, onSacrifice,
  // Cycle hover
  liftedCard = null, cycleHovered = false, onCycleHover, onCycleLeave,
  // Opponent hover
  oppDiscardHovered = false, oppLiftedCardType = null,
}) {
  const pileRef = useRef(null)
  const throttleRef = useRef(null)
  const count = discardPile.length
  const viewCard = count > 0 ? (discardPile[viewIndex] ?? discardPile[0]) : null
  const opponentBrowsing = browserId !== null && browserId !== mySide

  useEffect(() => {
    const el = pileRef.current
    if (!el || !onBrowse) return
    function handleWheel(e) {
      e.preventDefault()
      if (count === 0) return
      if (throttleRef.current) return
      onBrowse(e.deltaY > 0 ? 1 : -1)
      throttleRef.current = setTimeout(() => { throttleRef.current = null }, 120)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [onBrowse, count])

  function handleClick() {
    if (canSacrifice && discardHovered && onSacrifice) { onSacrifice(); return }
    if (canCycle && onCycle) onCycle()
  }

  return (
    <div
      ref={el => { pileRef.current = el; if (externalRef) externalRef.current = el }}
      className={[
        'pile-area',
        canCycle ? 'can-cycle' : '',
        canSacrifice && discardHovered ? 'sacrifice-hover' : '',
        opponentBrowsing ? 'opponent-browsing' : '',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      onMouseEnter={canSacrifice ? onSacrificeHover : canCycle ? onCycleHover : undefined}
      onMouseLeave={canSacrifice ? onSacrificeLeave : canCycle ? onCycleLeave : undefined}
    >
      <span className="pile-label">
        Discard · {count}{opponentBrowsing ? ' · opponent browsing' : ''}
      </span>
      <div className="pile-stack">
        {count === 0 ? (
          <div className="pile-empty">Empty</div>
        ) : (
          <>
            {count > 2 && <div className="card face-down pile-card pile-card-3" />}
            {count > 1 && <div className="card face-down pile-card pile-card-2" />}
            <div className="card pile-card pile-card-1">
              <CardFace type={viewCard.type} compact />
              {viewIndex > 0 && (
                <span className="pile-browse-idx">{viewIndex + 1}/{count}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Floating card preview when hovering with a lifted card for cycle */}
      {canCycle && cycleHovered && liftedCard && (
        <div className="card pile-floating-preview">
          <CardFace type={liftedCard.card.type} compact />
        </div>
      )}

      {/* Floating piece preview when hovering with a selected piece for sacrifice */}
      {canSacrifice && discardHovered && floatingPiece && (
        <div className="pile-floating-preview pile-floating-piece">
          <PieceToken piece={floatingPiece.piece} mySide={mySide} />
        </div>
      )}

      {/* Card preview when opponent is hovering their card over discard pile */}
      {oppDiscardHovered && !canSacrifice && !canCycle && (
        oppLiftedCardType
          ? <div className="card pile-floating-preview">
              <CardFace type={oppLiftedCardType} compact />
            </div>
          : <div className="card face-down pile-floating-preview" />
      )}

      {canSacrifice
        ? <span className="pile-cycle-hint pile-hint-danger">Sacrifice? (1 action)</span>
        : canCycle
          ? <span className="pile-cycle-hint">Cycle? (1 action)</span>
          : count > 1 && <span className="pile-scroll-hint">Scroll to browse</span>
      }
    </div>
  )
}
