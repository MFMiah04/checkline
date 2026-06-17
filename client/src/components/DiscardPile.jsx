import { useEffect, useRef } from 'react'

const SYMBOLS = { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟' }

const CATEGORY = {
  Pawn: 'piece', Knight: 'piece', Bishop: 'piece',
  Rook: 'piece', Queen: 'piece', King: 'piece',
  Reposition: 'control', Swap: 'control', Command: 'control',
  Disrupt: 'control', Dispel: 'control', Purge: 'control', Return: 'control',
  Enslave: 'buff', Shield: 'buff', Bodyguard: 'buff', Protection: 'buff',
  Pin: 'debuff', Fatigue: 'debuff', Silence: 'debuff',
  Intercept: 'reaction', Reversal: 'reaction'
}

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
  const category = viewCard ? (CATEGORY[viewCard.type] || '') : ''
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
        Discard ({count}){opponentBrowsing ? ' — browsing' : ''}
      </span>
      <div className="pile-stack">
        {count === 0 ? (
          <div className="pile-empty">Empty</div>
        ) : (
          <>
            {count > 2 && <div className="card face-down pile-card pile-card-3" />}
            {count > 1 && <div className="card face-down pile-card pile-card-2" />}
            <div className={`card ${category} pile-card pile-card-1`}>
              <span className="card-name">{viewCard?.type}</span>
              <span className="card-category">{category}</span>
              {viewIndex > 0 && (
                <span className="pile-browse-idx">{viewIndex + 1}/{count}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Floating card preview when hovering with a lifted card for cycle */}
      {canCycle && cycleHovered && liftedCard && (
        <div className="pile-floating-preview">
          <span className="card-name">{liftedCard.card.type}</span>
        </div>
      )}

      {/* Floating piece preview when hovering with a selected piece for sacrifice */}
      {canSacrifice && discardHovered && floatingPiece && (
        <div className={`pile-floating-preview${floatingPiece.piece.owner === mySide ? '' : ' enemy'}`}>
          <span className="piece-symbol">{SYMBOLS[floatingPiece.piece.type] ?? floatingPiece.piece.type?.[0]}</span>
          <span className="piece-label">{floatingPiece.piece.type}</span>
        </div>
      )}

      {/* Card preview when opponent is hovering their card over discard pile */}
      {oppDiscardHovered && !canSacrifice && !canCycle && (
        oppLiftedCardType
          ? <div className="pile-floating-preview">
              <span className="card-name">{oppLiftedCardType}</span>
            </div>
          : <div className="pile-floating-preview pile-floating-facedown" />
      )}

      {canSacrifice
        ? <span className="pile-cycle-hint" style={{ color: 'rgba(239,83,80,0.85)' }}>Sacrifice? (1 action)</span>
        : canCycle
          ? <span className="pile-cycle-hint">Cycle? (1 action)</span>
          : count > 1 && <span className="pile-scroll-hint">Scroll to browse</span>
      }
    </div>
  )
}
