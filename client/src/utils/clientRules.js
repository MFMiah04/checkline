function inBounds(row, lane) {
  return row >= 0 && row <= 3 && lane >= 0 && lane <= 4
}

function isPathClear(board, fromRow, fromLane, toRow, toLane) {
  const dRow = Math.sign(toRow - fromRow)
  const dLane = Math.sign(toLane - fromLane)
  let r = fromRow + dRow, l = fromLane + dLane
  while (r !== toRow || l !== toLane) {
    if (!inBounds(r, l) || board[r][l] !== null) return false
    r += dRow; l += dLane
  }
  return true
}

export function isPinned(piece)   { return piece?.debuff?.type === 'Pin' }
export function isFatigued(piece) { return piece?.debuff?.type === 'Fatigue' }

export function isValidMove(board, piece, fromRow, fromLane, toRow, toLane) {
  if (!inBounds(toRow, toLane)) return false
  if (piece.debuff?.type === 'Pin') return false
  const ownRows = piece.owner === 0 ? [0, 1] : [2, 3]
  if (!ownRows.includes(toRow)) return false
  if (board[toRow][toLane] !== null) return false

  const dr = toRow - fromRow, dl = toLane - fromLane
  const absDr = Math.abs(dr), absDl = Math.abs(dl)

  switch (piece.type) {
    case 'Pawn': { const dir = piece.owner === 0 ? 1 : -1; return dr === dir && dl === 0 }
    case 'Knight': return (absDr === 1 && absDl === 2) || (absDr === 2 && absDl === 1)
    case 'Bishop': return absDr === absDl && absDr > 0 && isPathClear(board, fromRow, fromLane, toRow, toLane)
    case 'Rook': return (dr === 0 || dl === 0) && absDr + absDl > 0 && isPathClear(board, fromRow, fromLane, toRow, toLane)
    case 'Queen': return (absDr === absDl || dr === 0 || dl === 0) && absDr + absDl > 0 && isPathClear(board, fromRow, fromLane, toRow, toLane)
    case 'King': return absDr <= 1 && absDl <= 1 && absDr + absDl > 0
    default: return false
  }
}

export function getAttackRange(board, piece, fromRow, fromLane) {
  const s = new Set()
  if (piece.type === 'King') return s

  function slide(dr, dl) {
    let r = fromRow + dr, l = fromLane + dl
    while (r >= 0 && r <= 3 && l >= 0 && l <= 4) {
      const occupant = board[r][l]
      if (occupant !== null) {
        if (occupant.owner !== piece.owner) s.add(`${r},${l}`)  // enemy — include, then stop
        break  // friendly — skip square, stop
      }
      s.add(`${r},${l}`)
      r += dr; l += dl
    }
  }

  switch (piece.type) {
    case 'Pawn': {
      const dir     = piece.owner === 0 ? 1 : -1
      const ownRows = piece.owner === 0 ? [0, 1] : [2, 3]
      for (const dl of [-1, 1]) {
        const r = fromRow + dir, l = fromLane + dl
        if (r >= 0 && r <= 3 && l >= 0 && l <= 4 && !ownRows.includes(r)) {
          const occupant = board[r][l]
          if (!occupant || occupant.owner !== piece.owner) s.add(`${r},${l}`)
        }
      }
      break
    }
    case 'Knight':
      for (const [dr, dl] of [[1,2],[1,-2],[-1,2],[-1,-2],[2,1],[2,-1],[-2,1],[-2,-1]]) {
        const r = fromRow + dr, l = fromLane + dl
        if (r >= 0 && r <= 3 && l >= 0 && l <= 4) {
          const occupant = board[r][l]
          if (!occupant || occupant.owner !== piece.owner) s.add(`${r},${l}`)
        }
      }
      break
    case 'Bishop':
      for (const [dr, dl] of [[1,1],[1,-1],[-1,1],[-1,-1]]) slide(dr, dl)
      break
    case 'Rook':
      for (const [dr, dl] of [[1,0],[-1,0],[0,1],[0,-1]]) slide(dr, dl)
      break
    case 'Queen':
      for (const [dr, dl] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) slide(dr, dl)
      break
    default: break
  }
  return s
}

export function isValidAttack(board, piece, fromRow, fromLane, targetRow, targetLane) {
  if (!inBounds(targetRow, targetLane)) return false
  if (piece.debuff?.type === 'Fatigue') return false
  const target = board[targetRow][targetLane]
  if (!target || target.owner === piece.owner) return false
  if (target.type === 'King') {
    // King can only be attacked when a Bodyguard-buffed friendly piece is orthogonally adjacent
    const hasBodyguard = [[1,0],[-1,0],[0,1],[0,-1]].some(([dr, dl]) => {
      const r = targetRow + dr, l = targetLane + dl
      if (r < 0 || r > 3 || l < 0 || l > 4) return false
      const p = board[r][l]
      return p?.owner === target.owner && p?.buff?.type === 'Bodyguard'
    })
    if (!hasBodyguard) return false
  }

  const dr = targetRow - fromRow, dl = targetLane - fromLane
  const absDr = Math.abs(dr), absDl = Math.abs(dl)

  switch (piece.type) {
    case 'Pawn': { const dir = piece.owner === 0 ? 1 : -1; return dr === dir && absDl === 1 }
    case 'Knight': return (absDr === 1 && absDl === 2) || (absDr === 2 && absDl === 1)
    case 'Bishop': return absDr === absDl && absDr > 0 && isPathClear(board, fromRow, fromLane, targetRow, targetLane)
    case 'Rook': return (dr === 0 || dl === 0) && absDr + absDl > 0 && isPathClear(board, fromRow, fromLane, targetRow, targetLane)
    case 'Queen': return (absDr === absDl || dr === 0 || dl === 0) && absDr + absDl > 0 && isPathClear(board, fromRow, fromLane, targetRow, targetLane)
    case 'King': return absDr <= 1 && absDl <= 1 && absDr + absDl > 0
    default: return false
  }
}
