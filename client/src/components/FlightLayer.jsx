import { motion } from 'framer-motion'
import CardFace from './CardFace'
import PieceToken from './PieceToken'

export const FLIGHT_MS = 550

// Ghost copies of cards flying from where they were to where they are now.
// While a card is in the air, the real one at its destination is hidden.
export default function FlightLayer({ flights, mySide, onLanded }) {
  if (flights.length === 0) return null
  const hidden = flights.map(f => `[data-fly="${f.id}"]`).join(',')
  return (
    <>
      <style>{`${hidden} { visibility: hidden; }`}</style>
      <div className="flight-layer" aria-hidden="true">
        {flights.map(f => <Flight key={f.key} flight={f} mySide={mySide} onLanded={onLanded} />)}
      </div>
    </>
  )
}

function Flight({ flight, mySide, onLanded }) {
  const { from, to, look } = flight
  return (
    <motion.div
      className="flight"
      initial={{ left: from.left, top: from.top, width: from.width, height: from.height }}
      animate={{ left: to.left, top: to.top, width: to.width, height: to.height }}
      transition={{ duration: FLIGHT_MS / 1000, ease: [0.3, 0, 0.2, 1] }}
      onAnimationComplete={() => onLanded(flight.key)}
    >
      {look.kind === 'piece'
        ? <PieceToken piece={look.piece} mySide={mySide} />
        : look.faceUp
          ? <div className="card"><CardFace type={look.type} compact /></div>
          : <div className="card face-down" />}
    </motion.div>
  )
}
