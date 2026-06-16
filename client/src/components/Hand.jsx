import { useRef, useState } from 'react'
import { motion, Reorder } from 'framer-motion'
import CardComponent from './CardComponent'

function fanTransform(count, i, isOpponent = false) {
  if (count === 0) return { rotate: 0, y: 0, scale: 1 }
  const maxAngle = isOpponent ? 6 : 10
  const mid = (count - 1) / 2
  const t = count === 1 ? 0 : (i - mid) / mid
  const angle = t * maxAngle
  const rad = (angle * Math.PI) / 180
  const y = 600 * (1 - Math.cos(rad))
  return { rotate: angle, y, scale: isOpponent ? 0.72 : 1 }
}

function HandCard({ card, i, fanCount, isSelected, isIntercepted, isReactionAvailable, isClickable, isDraggable, onCardClick, onDragStart, onDragEnd }) {
  const { rotate, y, scale } = fanTransform(fanCount, i)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 })
  const [hovered, setHovered] = useState(false)

  function handleMouseMove(e) {
    const r = e.currentTarget.getBoundingClientRect()
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
    setTilt({ rx: dy * -8, ry: dx * 8 })
  }

  return (
    <Reorder.Item
      value={card}
      as="div"
      style={{ transformOrigin: 'bottom center', position: 'relative', zIndex: isSelected ? 10 : i }}
      animate={{ rotate, y: isSelected ? y - 14 : y, scale }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      dragListener={isDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setTilt({ rx: 0, ry: 0 }) }}
    >
      <motion.div
        animate={{
          rotateX: tilt.rx,
          rotateY: tilt.ry,
          y: hovered && isClickable ? -10 : 0,
          scale: hovered && isClickable ? 1.06 : 1,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onMouseMove={handleMouseMove}
        style={{ perspective: '500px' }}
      >
        <CardComponent
          card={card}
          selected={isSelected}
          intercepted={isIntercepted}
          reactionAvailable={isReactionAvailable}
          onClick={isClickable ? () => onCardClick(i) : undefined}
        />
      </motion.div>
    </Reorder.Item>
  )
}

export default function Hand({ cards, faceDown = false, selectedSet, selectedIdx, interceptedIds, reactionIndices, isOpponent = false, onCardClick, onReorder, onDragEnd: onDragEndProp }) {
  const isDraggingRef = useRef(false)
  const currentOrderRef = useRef(null)

  if (faceDown) {
    const count = typeof cards === 'number' ? cards : (cards?.count ?? 0)
    const ids = typeof cards === 'object' && cards !== null ? (cards.ids ?? null) : null
    const keys = ids ?? Array.from({ length: count }, (_, i) => `opp-${i}`)
    return (
      <div className="hand opponent-hand">
        {keys.map((key, i) => {
          const { rotate, y, scale } = fanTransform(count, i, true)
          return (
            <motion.div
              key={key}
              layout
              style={{ transformOrigin: 'bottom center' }}
              animate={{ rotate, y, scale }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            >
              <CardComponent faceDown />
            </motion.div>
          )
        })}
        {count === 0 && <span className="hand-empty">No cards</span>}
      </div>
    )
  }

  const cardList = Array.isArray(cards) ? cards : []

  return (
    <Reorder.Group
      axis="x"
      values={cardList}
      onReorder={newCards => {
        currentOrderRef.current = newCards
        if (isDraggingRef.current) {
          onReorder?.(newCards)
        }
      }}
      className="hand"
      as="div"
    >
      {cardList.map((card, i) => {
        const isSelected = selectedSet?.has(i) || selectedIdx === i
        const isIntercepted = interceptedIds?.includes(card.id) ?? false
        const isReactionAvailable = reactionIndices?.has(i) ?? false
        const isClickable = !isIntercepted && !!onCardClick && (reactionIndices ? isReactionAvailable : true)
        return (
          <HandCard
            key={card.id}
            card={card}
            i={i}
            fanCount={cardList.length}
            isSelected={isSelected}
            isIntercepted={isIntercepted}
            isReactionAvailable={isReactionAvailable}
            isClickable={isClickable}
            isDraggable={!!onReorder}
            onCardClick={onCardClick}
            onDragStart={() => { isDraggingRef.current = true }}
            onDragEnd={() => {
              isDraggingRef.current = false
              if (onDragEndProp && currentOrderRef.current) {
                onDragEndProp(currentOrderRef.current)
              }
            }}
          />
        )
      })}
      {cardList.length === 0 && <span className="hand-empty">Empty hand</span>}
    </Reorder.Group>
  )
}
