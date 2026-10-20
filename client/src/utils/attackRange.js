import { getThreatenedSpaces, ownRows } from '@checkline/engine'

// Squares to highlight as a piece's attack range: everything it threatens on the
// opponent's side or held by an opponent. Shown even while the piece is Fatigued,
// so players can see where it will reach once the Debuff is gone.
export function getAttackRange(board, piece, fromRow, fromLane) {
  const range = new Set()
  if (piece.type === 'King') return range

  const unfatigued = piece.debuff?.type === 'Fatigue' ? { ...piece, debuff: null } : piece
  for (const [r, l] of getThreatenedSpaces(board, unfatigued, fromRow, fromLane)) {
    const occupant = board[r][l]
    if (occupant?.owner === piece.owner) continue
    if (piece.type === 'Pawn' && ownRows(piece.owner).includes(r)) continue
    range.add(`${r},${l}`)
  }
  return range
}
