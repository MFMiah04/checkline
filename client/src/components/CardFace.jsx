import { cardInfo } from '@checkline/engine'
import Icon from './Icon'
import { cardTypeLabel } from '../utils/describe'

// The front of a card: name, icon, type and (unless compact) its one-line effect.
// The surrounding element supplies the card's size and frame.
export default function CardFace({ type, compact = false }) {
  const info = cardInfo(type)
  return (
    <>
      <span className="card-name">{info.name}</span>
      <span className={`card-art type-${info.category}`}><Icon name={type} size={null} /></span>
      {!compact && <span className={`card-type type-${info.category}`}>{cardTypeLabel(info)}</span>}
      {!compact && <span className="card-short">{info.short}</span>}
    </>
  )
}
