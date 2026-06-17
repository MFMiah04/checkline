import { motion } from 'framer-motion'

const SYMBOLS = { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟' }

export default function ReturnSlide({ piece, fromPos, toPos, isOwn, onDone }) {
  if (!piece || !fromPos || !toPos) return null
  const dx = toPos.x - fromPos.x
  const dy = toPos.y - fromPos.y
  return (
    <motion.div
      className={`capture-slide-piece${isOwn ? '' : ' enemy'}`}
      style={{ position: 'fixed', left: fromPos.x, top: fromPos.y, pointerEvents: 'none', zIndex: 200 }}
      initial={{ x: 0, y: 0, scale: 1.08, opacity: 1 }}
      animate={{ x: dx, y: dy, scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.25, 0, 0.5, 1] }}
      onAnimationComplete={onDone}
    >
      <span className="piece-symbol">{SYMBOLS[piece.type] ?? piece.type?.[0]}</span>
      <span className="piece-label">{piece.type}</span>
    </motion.div>
  )
}
