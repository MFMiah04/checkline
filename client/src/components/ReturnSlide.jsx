import { motion } from 'framer-motion'
import Icon from './Icon'


export default function ReturnSlide({ piece, fromPos, toPos, isOwn, onDone }) {
  if (!piece || !fromPos || !toPos) return null
  const dx = toPos.x - fromPos.x
  const dy = toPos.y - fromPos.y
  return (
    <motion.div
      className={`piece slide-piece ${isOwn ? 'piece-mine' : 'piece-theirs'}`}
      style={{ position: 'fixed', left: fromPos.x, top: fromPos.y, pointerEvents: 'none', zIndex: 200 }}
      initial={{ x: 0, y: 0, scale: 1.08, opacity: 1 }}
      animate={{ x: dx, y: dy, scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.25, 0, 0.5, 1] }}
      onAnimationComplete={onDone}
    >
      <Icon name={piece.type} size={null} className="piece-icon" />
    </motion.div>
  )
}
