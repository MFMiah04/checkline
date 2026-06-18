const RULES = [
  { title: 'OBJECTIVE', lines: [
    "Checkmate your opponent's King — if they cannot escape Check before their turn ends, they lose.",
  ]},
  { title: 'BOARD', lines: [
    '5 lanes × 4 rows. Each player owns the 2 rows on their side. One piece per space.',
  ]},
  { title: 'SETUP', lines: [
    'Each player places their King centre-back. Draw 5 cards. Mulligan (redraw) any number once, then a random player goes first.',
  ]},
  { title: 'TURN ORDER', lines: [
    '1. Draw 1 card.',
    '2. Take up to 2 actions (see below).',
    '3. If in Check, you must remove it before ending your turn.',
    '4. Discard down to 5 cards.',
  ]},
  { title: 'ACTIONS (2 per turn)', lines: [
    'Place — put a piece card onto any empty space on your side.',
    'Direct — move, attack, or sacrifice a placed piece (not the turn it was placed).',
    'Play — play a Control, Buff, or Debuff card.',
    'Cycle — discard 1 card, draw 1 card.',
    'Command and Disrupt are free — each may be played once per turn without spending an action.',
  ]},
  { title: 'MOVEMENT & ATTACKS', lines: [
    'Pieces move only on your side. Attacks reach anywhere on the board; the piece does not move.',
    'Attacked pieces go to the discard pile. Pieces block attacks that pass through their space.',
  ]},
  { title: 'SACRIFICES', lines: [
    'Sacrifice a piece on your side to draw cards: Pawn=1, Knight/Bishop/Rook=2, Queen=3.',
  ]},
  { title: 'CHECK', lines: [
    "Your King is in Check when an opponent's piece can attack it.",
    'Remove Check by: moving the King, blocking the line, destroying or Fatiguing the attacker, or using a Bodyguard.',
  ]},
  { title: 'REACTIONS', lines: [
    'When your opponent acts, a reaction window opens. Hover your hand to slow the timer and reveal available reactions. You may play 1 reaction before the action resolves.',
    'Intercept — cancel the action entirely.',
    'Reversal — redirect a Buff or Debuff to a different valid target.',
    'Reactions cannot block actions that remove the King from Check.',
  ]},
  { title: 'PIECES', lines: [
    'King — moves/attacks 1 space in any direction.',
    'Pawn — moves forward 1; attacks diagonally forward 1.',
    'Knight — L-shape (2+1); jumps over pieces.',
    'Bishop — diagonal, any distance.',
    'Rook — horizontal or vertical, any distance.',
    'Queen — any direction, any distance.',
  ]},
  { title: 'BUFFS (attach to any non-King piece; max 1 per piece)', lines: [
    'Enslave — on capture, place the enemy piece on your side instead of discarding.',
    'Shield — absorbs the next attack instead of the piece.',
    'Bodyguard — a friendly orthogonally adjacent piece (not diagonal) sacrifices itself to cancel an attack on this piece.',
    'Protection — removes existing Debuff; piece cannot receive Debuffs while active.',
  ]},
  { title: 'DEBUFFS (attach to opponent non-King pieces; max 1 per piece)', lines: [
    'Pin — piece cannot move.',
    'Fatigue — piece cannot attack.',
    'Silence — removes existing Buff; piece cannot receive Buffs while active.',
  ]},
]

export default function RulesModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog modal-dialog--rules" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          Rules
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-rules-body">
          {RULES.map(section => (
            <div key={section.title} className="modal-rules-section">
              <div className="modal-rules-section-title">{section.title}</div>
              {section.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
