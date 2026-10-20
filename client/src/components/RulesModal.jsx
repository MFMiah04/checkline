import { ALL_CARD_TYPES, cardInfo } from '@checkline/engine'
import Modal from './Modal'
import Icon from './Icon'

const RULES = [
  ['Goal', [
    "Checkmate your opponent's King: if their King is still in check when their turn ends, they lose.",
  ]],
  ['Board', [
    'The board has 5 lanes and 4 rows. You own the 2 rows on your side. One piece per square.',
  ]],
  ['Setup', [
    'Each King starts in the middle of its back row. Both players draw 5 cards, may swap any of them once (the mulligan), and a random player goes first.',
  ]],
  ['Your turn', [
    'Draw 1 card, then take 2 actions.',
    'Actions: place a piece card on your side; move, attack with or sacrifice a piece already on the board (not on the turn it arrived); play a Control, Buff or Debuff card; or cycle (discard a card to draw one).',
    'Command and Disrupt are free and can each be played once per turn.',
    'If your King is in check, get it out before your turn ends. Then discard down to 5 cards.',
  ]],
  ['Moving and attacking', [
    'Pieces only move on your side, but attacks reach the whole board. The attacker stays where it is and the captured piece is discarded.',
    'Every piece blocks attacks through its square, except that Knights jump.',
    'Sacrifice a piece to draw cards: Pawn 1, Knight, Bishop or Rook 2, Queen 3.',
  ]],
  ['Check', [
    "Your King is in check when an opponent's piece can attack it.",
    'Get out of check by moving the King, blocking the line, removing or Fatiguing the attacker, or having a Bodyguard next to your King.',
  ]],
  ['Buffs, Debuffs and reactions', [
    "Buffs and Debuffs go on any piece except a King, yours or your opponent's. Each piece holds at most one of each.",
    'When your opponent acts, a reaction window may open. Play one reaction before the action happens, or let it through. Actions that get a King out of check cannot be reacted to.',
  ]],
]

export default function RulesModal({ onClose }) {
  return (
    <Modal title="Rules" onClose={onClose} className="modal-dialog--rules">
      <button className="modal-close-btn" onClick={onClose} aria-label="Close rules">×</button>
      <div className="modal-rules-body">
        {RULES.map(([title, lines]) => (
          <section key={title}>
            <h3 className="modal-rules-section-title">{title}</h3>
            {lines.map(line => <p key={line}>{line}</p>)}
          </section>
        ))}
        <section>
          <h3 className="modal-rules-section-title">Cards</h3>
          <ul className="rules-cards">
            {ALL_CARD_TYPES.map(type => {
              const info = cardInfo(type)
              return (
                <li key={type}>
                  <span className={`rules-card-icon type-${info.category}`}><Icon name={type} size={30} /></span>
                  <div>
                    <strong>{info.name}</strong> <span className="rules-card-type">{info.category}{info.cost === 'free' ? ', free' : ''}</span>
                    <p>{info.text}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </Modal>
  )
}
