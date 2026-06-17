import { motion } from 'framer-motion'

export default function DeckSlide({ fromPos, toPos, onDone }) {
  if (!fromPos || !toPos) return null
  const dx = toPos.x - fromPos.x
  const dy = toPos.y - fromPos.y
  return (
    <motion.div
      className="card face-down"
      style={{ position: 'fixed', left: fromPos.x, top: fromPos.y, pointerEvents: 'none', zIndex: 200 }}
      initial={{ x: 0, y: 0, scale: 0.8, opacity: 0 }}
      animate={{ x: dx, y: dy, scale: 1, opacity: 1 }}
      transition={{ duration: 0.32, ease: [0.25, 0, 0.5, 1] }}
      onAnimationComplete={onDone}
    />
  )
}
