// Text descriptions shared by components: card type labels and spoken piece descriptions.

export function cardTypeLabel(info) {
  const category = info.category[0].toUpperCase() + info.category.slice(1)
  return info.cost === 'free' ? `${category} · free` : category
}

export function describePiece(piece, mySide) {
  const owner = piece.owner === mySide ? 'Your' : "Opponent's"
  const statuses = [piece.buff?.type, piece.debuff?.type].filter(Boolean)
  return `${owner} ${piece.type}${statuses.length ? ` with ${statuses.join(' and ')}` : ''}`
}

// Squares are named like chess: columns a–e left to right, rows 1–4 from the first player's back row.
// Both players see the same names, so "b2" means the same square on either screen.
export const FILES = 'abcde'

export function squareName(row, lane) {
  return `${FILES[lane]}${row + 1}`
}
