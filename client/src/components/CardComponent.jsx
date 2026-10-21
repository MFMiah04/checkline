import { cardInfo } from '@checkline/engine'
import CardFace from './CardFace'
import { cardTypeLabel } from '../utils/describe'

// A card in a hand. Playable cards are buttons, so they can be reached and played by keyboard.
// onInspect reports the card when it is hovered or focused, for the card details panel.
export default function CardComponent({ card, faceDown = false, selected = false, intercepted = false, reactionAvailable = false, onClick, onInspect }) {
  if (faceDown) {
    return <div className="card face-down" />
  }

  const info = cardInfo(card.type)
  const isClickable = !!onClick && !intercepted
  const Tag = isClickable ? 'button' : 'div'
  const label = `${info.name}, ${cardTypeLabel(info)}. ${info.short}.${intercepted ? ' Intercepted this turn.' : ''}`

  return (
    <Tag
      type={isClickable ? 'button' : undefined}
      className={`card card-${info.category}${selected ? ' selected' : ''}${intercepted ? ' intercepted' : ''}${reactionAvailable ? ' reaction-available' : ''}${isClickable ? ' clickable' : ''}`}
      onClick={isClickable ? onClick : undefined}
      onMouseEnter={onInspect ? () => onInspect(card.type) : undefined}
      onFocus={onInspect ? () => onInspect(card.type) : undefined}
      aria-label={label}
      aria-pressed={isClickable ? selected : undefined}
      data-fly={card.id}
    >
      <CardFace type={card.type} />
      {intercepted && <span className="card-intercepted-label" aria-hidden="true">Intercepted</span>}
    </Tag>
  )
}
