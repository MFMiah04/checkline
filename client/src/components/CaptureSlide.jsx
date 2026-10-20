import { motion } from 'framer-motion'
import Icon from './Icon'

// Renders a piece (or card token) sliding from a board position to the discard pile.
// fromPos / toPos are { x, y } viewport pixel positions (top-left of element).
export default function CaptureSlide({ piece, fromPos, toPos, isOwn, onDone }) {
  if (!piece || !fromPos || !toPos) return null

  const dx = toPos.x - fromPos.x
  const dy = toPos.y - fromPos.y

  return (
    <motion.div
      className={`piece slide-piece ${isOwn ? 'piece-mine' : 'piece-theirs'}`}
      style={{ position: 'fixed', left: fromPos.x, top: fromPos.y, pointerEvents: 'none', zIndex: 200 }}
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={{ x: dx, y: dy, scale: 0.45, opacity: 0 }}
      transition={{ duration: 0.52, ease: [0.4, 0, 1, 1] }}
      onAnimationComplete={onDone}
    >
      <Icon name={piece.type} size={null} className="piece-icon" />
    </motion.div>
  )
}
