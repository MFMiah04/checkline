import { cardInfo } from '@checkline/engine'
import Icon from './Icon'
import { cardTypeLabel } from '../utils/describe'

const COST = { action: '1 action', free: 'free', reaction: "on opponent's turn", none: '' }

// The side panel's explanation of a card, or of a piece on the board and its Buff and Debuff.
export default function CardDetails({ type, piece }) {
  const shownType = piece ? piece.type : type
  if (!shownType) {
    return (
      <div className="card-details card-details-empty">
        <p>Point at a card or piece to see what it does.</p>
      </div>
    )
  }

  const info = cardInfo(shownType)
  const statuses = piece ? [piece.buff, piece.debuff].filter(Boolean) : []
  const cost = COST[info.cost]

  return (
    <div className="card-details" aria-live="polite">
      <div className="card-details-head">
        <span className={`card-details-art type-${info.category}`}><Icon name={shownType} size={38} /></span>
        <div>
          <h2 className="card-details-name">{info.name}</h2>
          <span className={`card-details-type chip-${info.category}`}>
            {cardTypeLabel(info)}{cost && info.cost !== 'free' ? ` · ${cost}` : ''}
          </span>
        </div>
      </div>
      <p className="card-details-text">{info.text}</p>
      {!piece && (
        <div className="card-details-how">
          <span>How to play</span>
          <p>{info.howToPlay}</p>
        </div>
      )}
      {statuses.map(status => {
        const s = cardInfo(status.type)
        return (
          <div key={status.type} className="card-details-status">
            <Icon name={status.type} size={18} className={`type-${s.category}`} />
            <p><strong>{s.name}:</strong> {s.text}</p>
          </div>
        )
      })}
    </div>
  )
}
