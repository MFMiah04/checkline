import { useEffect, useRef } from 'react'

const CATEGORY = {
  Pawn: 'piece', Knight: 'piece', Bishop: 'piece',
  Rook: 'piece', Queen: 'piece', King: 'piece',
  Reposition: 'control', Swap: 'control', Command: 'control',
  Disrupt: 'control', Dispel: 'control', Purge: 'control', Return: 'control',
  Enslave: 'buff', Shield: 'buff', Bodyguard: 'buff', Protection: 'buff',
  Pin: 'debuff', Fatigue: 'debuff', Silence: 'debuff',
  Intercept: 'reaction', Reversal: 'reaction'
}

export default function DiscardPile({ discardPile = [], viewIndex = 0, browserId = null, mySide, canCycle = false, onBrowse, onCycle }) {
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

  return (
    <div
      ref={pileRef}
      className={`pile-area${canCycle ? ' can-cycle' : ''}${opponentBrowsing ? ' opponent-browsing' : ''}`}
      onClick={canCycle && onCycle ? onCycle : undefined}
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
      {canCycle
        ? <span className="pile-cycle-hint">Cycle? (1 action)</span>
        : count > 1 && <span className="pile-scroll-hint">Scroll to browse</span>
      }
    </div>
  )
}
