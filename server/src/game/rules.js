// ── Path helpers ──────────────────────────────────────────────────────────────

function inBounds(row, lane) {
  return row >= 0 && row <= 3 && lane >= 0 && lane <= 4
}

function isPathClear(board, fromRow, fromLane, toRow, toLane) {
  const dRow = Math.sign(toRow - fromRow)
  const dLane = Math.sign(toLane - fromLane)
  let r = fromRow + dRow
  let l = fromLane + dLane
  while (r !== toRow || l !== toLane) {
    if (!inBounds(r, l) || board[r][l] !== null) return false
    r += dRow
    l += dLane
  }
  return true
}

// ── Piece state helpers ───────────────────────────────────────────────────────

export function isPinned(piece)   { return piece.debuff?.type === 'Pin' }
export function isFatigued(piece) { return piece.debuff?.type === 'Fatigue' }

export function findKing(board, side) {
  for (let r = 0; r <= 3; r++)
    for (let l = 0; l <= 4; l++)
      if (board[r][l]?.type === 'King' && board[r][l]?.owner === side)
        return { row: r, lane: l }
  return null
}

export function hasBodyguardAdjacentToKing(board, side) {
  const king = findKing(board, side)
  if (!king) return false
  return [[1,0],[-1,0],[0,1],[0,-1]].some(([dr, dl]) => {
    const r = king.row + dr, l = king.lane + dl
    if (r < 0 || r > 3 || l < 0 || l > 4) return false
    const p = board[r][l]
    return p?.owner === side && p?.buff?.type === 'Bodyguard'
  })
}

// ── Board cloning (for check simulation) ─────────────────────────────────────

export function cloneBoard(board) {
  return board.map(row => row.map(p => p ? { ...p } : null))
}

// ── Movement validation ───────────────────────────────────────────────────────

export function isValidMove(board, piece, fromRow, fromLane, toRow, toLane) {
  if (!inBounds(toRow, toLane)) return false
  if (isPinned(piece)) return false

  const ownRows = piece.owner === 0 ? [0, 1] : [2, 3]
  if (!ownRows.includes(toRow)) return false
  if (board[toRow][toLane] !== null) return false

  const dr = toRow - fromRow
  const dl = toLane - fromLane
  const absDr = Math.abs(dr)
  const absDl = Math.abs(dl)

  let patternOk = false
  switch (piece.type) {
    case 'Pawn': {
      const dir = piece.owner === 0 ? 1 : -1
      patternOk = dr === dir && dl === 0
      break
    }
    case 'Knight':
      patternOk = (absDr === 1 && absDl === 2) || (absDr === 2 && absDl === 1)
      break
    case 'Bishop':
      patternOk = absDr === absDl && absDr > 0 && isPathClear(board, fromRow, fromLane, toRow, toLane)
      break
    case 'Rook':
      patternOk = (dr === 0 || dl === 0) && (absDr + absDl > 0) && isPathClear(board, fromRow, fromLane, toRow, toLane)
      break
    case 'Queen':
      patternOk = (absDr === absDl || dr === 0 || dl === 0) && (absDr + absDl > 0) && isPathClear(board, fromRow, fromLane, toRow, toLane)
      break
    case 'King':
      patternOk = absDr <= 1 && absDl <= 1 && absDr + absDl > 0
      break
    default:
      return false
  }

  if (!patternOk) return false

  // King safety: simulate move and confirm King is not in check
  if (piece.type === 'King') {
    const simBoard = cloneBoard(board)
    simBoard[toRow][toLane] = simBoard[fromRow][fromLane]
    simBoard[fromRow][fromLane] = null
    if (isInCheck(simBoard, toRow, toLane, piece.owner)) return false
  }

  return true
}

// ── Bodyguard helpers ─────────────────────────────────────────────────────────

export function getBodyguardOptions(board, targetRow, targetLane, defenderSide) {
  const options = []
  for (const [dr, dl] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const r = targetRow + dr, l = targetLane + dl
    if (!inBounds(r, l)) continue
    const p = board[r][l]
    if (p?.owner === defenderSide && p?.buff?.type === 'Bodyguard')
      options.push({ row: r, lane: l, pieceType: p.type })
  }
  return options
}

// ── Attack validation ─────────────────────────────────────────────────────────

export function isValidAttack(board, piece, fromRow, fromLane, targetRow, targetLane) {
  if (!inBounds(targetRow, targetLane)) return false
  if (isFatigued(piece)) return false

  const target = board[targetRow][targetLane]
  if (!target) return false
  if (target.owner === piece.owner) return false
  if (target.type === 'King') {
    return getBodyguardOptions(board, targetRow, targetLane, target.owner).length > 0
  }

  const dr = targetRow - fromRow
  const dl = targetLane - fromLane
  const absDr = Math.abs(dr)
  const absDl = Math.abs(dl)

  switch (piece.type) {
    case 'Pawn': {
      const dir = piece.owner === 0 ? 1 : -1
      return dr === dir && absDl === 1
    }
    case 'Knight':
      return (absDr === 1 && absDl === 2) || (absDr === 2 && absDl === 1)
    case 'Bishop':
      return absDr === absDl && absDr > 0 && isPathClear(board, fromRow, fromLane, targetRow, targetLane)
    case 'Rook':
      return (dr === 0 || dl === 0) && (absDr + absDl > 0) && isPathClear(board, fromRow, fromLane, targetRow, targetLane)
    case 'Queen':
      return (absDr === absDl || dr === 0 || dl === 0) && (absDr + absDl > 0) && isPathClear(board, fromRow, fromLane, targetRow, targetLane)
    case 'King':
      return absDr <= 1 && absDl <= 1 && absDr + absDl > 0
    default:
      return false
  }
}

// ── Reposition validation ─────────────────────────────────────────────────────

export function isValidReposition(board, piece, fromRow, fromLane, toRow, toLane) {
  if (!inBounds(toRow, toLane)) return false
  if (isPinned(piece)) return false
  if (fromRow === toRow && fromLane === toLane) return false

  const ownRows = piece.owner === 0 ? [0, 1] : [2, 3]
  if (!ownRows.includes(toRow)) return false
  if (board[toRow][toLane] !== null) return false

  if (piece.type === 'King') {
    const simBoard = cloneBoard(board)
    simBoard[toRow][toLane] = simBoard[fromRow][fromLane]
    simBoard[fromRow][fromLane] = null
    if (isInCheck(simBoard, toRow, toLane, piece.owner)) return false
  }

  return true
}

// ── Swap validation ───────────────────────────────────────────────────────────

export function isValidSwap(board, playerSide, aRow, aLane, bRow, bLane) {
  if (aRow === bRow && aLane === bLane) return false

  const pieceA = board[aRow]?.[aLane]
  const pieceB = board[bRow]?.[bLane]
  if (!pieceA || !pieceB) return false
  if (pieceA.owner !== playerSide || pieceB.owner !== playerSide) return false
  if (isPinned(pieceA) || isPinned(pieceB)) return false

  if (pieceA.type === 'King' || pieceB.type === 'King') {
    const simBoard = cloneBoard(board)
    simBoard[aRow][aLane] = pieceB
    simBoard[bRow][bLane] = pieceA
    if (pieceA.type === 'King' && isInCheck(simBoard, bRow, bLane, playerSide)) return false
    if (pieceB.type === 'King' && isInCheck(simBoard, aRow, aLane, playerSide)) return false
  }

  return true
}

// ── Buff / debuff target validation ──────────────────────────────────────────

export function isValidBuffTarget(piece) {
  if (!piece) return false
  if (piece.type === 'King') return false
  if (piece.buff !== null) return false
  if (piece.debuff?.type === 'Silence') return false
  return true
}

export function isValidDebuffTarget(piece) {
  if (!piece) return false
  if (piece.type === 'King') return false
  if (piece.debuff !== null) return false
  if (piece.buff?.type === 'Protection') return false
  return true
}

// ── Threat map ────────────────────────────────────────────────────────────────

export function getThreatenedSpaces(board, piece, row, lane) {
  if (isFatigued(piece)) return []

  const spaces = []

  switch (piece.type) {
    case 'Pawn': {
      const dir = piece.owner === 0 ? 1 : -1
      const r = row + dir
      for (const dl of [-1, 1]) {
        const l = lane + dl
        if (inBounds(r, l)) spaces.push([r, l])
      }
      break
    }
    case 'Knight':
      for (const [dr, dl] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const r = row + dr, l = lane + dl
        if (inBounds(r, l)) spaces.push([r, l])
      }
      break
    case 'Bishop':
      for (const [dRow, dLane] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        let r = row + dRow, l = lane + dLane
        while (inBounds(r, l)) {
          spaces.push([r, l])
          if (board[r][l] !== null) break
          r += dRow; l += dLane
        }
      }
      break
    case 'Rook':
      for (const [dRow, dLane] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let r = row + dRow, l = lane + dLane
        while (inBounds(r, l)) {
          spaces.push([r, l])
          if (board[r][l] !== null) break
          r += dRow; l += dLane
        }
      }
      break
    case 'Queen':
      for (const [dRow, dLane] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        let r = row + dRow, l = lane + dLane
        while (inBounds(r, l)) {
          spaces.push([r, l])
          if (board[r][l] !== null) break
          r += dRow; l += dLane
        }
      }
      break
    case 'King':
      for (const [dr, dl] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const r = row + dr, l = lane + dl
        if (inBounds(r, l)) spaces.push([r, l])
      }
      break
  }

  return spaces
}

// ── Check detection ───────────────────────────────────────────────────────────

export function isInCheck(board, kingRow, kingLane, kingOwner) {
  // A Bodyguard-buffed friendly piece adjacent to the King intercepts all attacks
  const protectedByBodyguard = [[1,0],[-1,0],[0,1],[0,-1]].some(([dr, dl]) => {
    const r = kingRow + dr, l = kingLane + dl
    if (!inBounds(r, l)) return false
    const p = board[r][l]
    return p?.owner === kingOwner && p?.buff?.type === 'Bodyguard'
  })
  if (protectedByBodyguard) return false

  for (let r = 0; r <= 3; r++) {
    for (let l = 0; l <= 4; l++) {
      const piece = board[r][l]
      if (!piece || piece.owner === kingOwner) continue
      const threatened = getThreatenedSpaces(board, piece, r, l)
      if (threatened.some(([tr, tl]) => tr === kingRow && tl === kingLane)) return true
    }
  }
  return false
}

// ── Check removal simulation ──────────────────────────────────────────────────

export function isCheckRemovalAction(room, action) {
  const playerSide = room.currentTurn
  const king = findKing(room.board, playerSide)
  if (!king) return false
  if (!isInCheck(room.board, king.row, king.lane, playerSide)) return false

  const sim = cloneBoard(room.board)

  switch (action.type) {
    case 'direct_move': {
      const { row, lane, toRow, toLane } = action
      if (!sim[row]?.[lane]) return false
      sim[toRow][toLane] = sim[row][lane]
      sim[row][lane] = null
      break
    }
    case 'direct_attack': {
      const { targetRow, targetLane } = action
      if (!sim[targetRow]?.[targetLane]) return false
      sim[targetRow][targetLane] = null
      break
    }
    case 'place': {
      const card = room.players[playerSide].hand[action.cardIndex]
      if (!card || sim[action.row]?.[action.lane] !== null) return false
      sim[action.row][action.lane] = { type: card.type, owner: playerSide, buff: null, debuff: null }
      break
    }
    case 'play_reposition': {
      const { pieceRow, pieceLane, toRow, toLane } = action
      if (!sim[pieceRow]?.[pieceLane]) return false
      sim[toRow][toLane] = sim[pieceRow][pieceLane]
      sim[pieceRow][pieceLane] = null
      break
    }
    case 'play_swap': {
      const { aRow, aLane, bRow, bLane } = action
      const tmp = sim[aRow]?.[aLane]
      sim[aRow][aLane] = sim[bRow]?.[bLane] ?? null
      sim[bRow][bLane] = tmp ?? null
      break
    }
    case 'play_debuff': {
      const card = room.players[playerSide].hand[action.cardIndex]
      if (card?.type !== 'Fatigue') return false
      const target = sim[action.targetRow]?.[action.targetLane]
      if (!target || target.owner === playerSide) return false
      sim[action.targetRow][action.targetLane] = { ...target, debuff: { type: 'Fatigue' } }
      break
    }
    case 'play_buff': {
      const card = room.players[playerSide].hand[action.cardIndex]
      if (card?.type !== 'Bodyguard') return false
      const target = sim[action.targetRow]?.[action.targetLane]
      if (!isValidBuffTarget(target) || target.owner !== playerSide) return false
      sim[action.targetRow][action.targetLane] = { ...target, buff: { type: 'Bodyguard' } }
      break
    }
    default:
      return false
  }

  const k = findKing(sim, playerSide)
  return k ? !isInCheck(sim, k.row, k.lane, playerSide) : false
}

export function hasLegalCheckRemoval(room, playerSide) {
  const king = findKing(room.board, playerSide)
  if (!king) return false

  const player = room.players[playerSide]
  const ownRows = playerSide === 0 ? [0, 1] : [2, 3]

  function simBoard() { return cloneBoard(room.board) }

  // 2a. King direct_move
  const kingPiece = room.board[king.row][king.lane]
  for (let r = 0; r <= 3; r++) {
    for (let l = 0; l <= 4; l++) {
      if (!isValidMove(room.board, kingPiece, king.row, king.lane, r, l)) continue
      // isValidMove already checks King safety, so if it passes we're good
      return true
    }
  }

  // 2b. Own non-King piece direct_move
  for (let fr = 0; fr <= 3; fr++) {
    for (let fl = 0; fl <= 4; fl++) {
      const piece = room.board[fr][fl]
      if (!piece || piece.owner !== playerSide || piece.type === 'King' || !piece.canActThisTurn) continue
      for (let tr = 0; tr <= 3; tr++) {
        for (let tl = 0; tl <= 4; tl++) {
          if (!isValidMove(room.board, piece, fr, fl, tr, tl)) continue
          const sim = simBoard()
          sim[tr][tl] = sim[fr][fl]
          sim[fr][fl] = null
          const k = findKing(sim, playerSide)
          if (k && !isInCheck(sim, k.row, k.lane, playerSide)) return true
        }
      }
    }
  }

  // 2c. direct_attack
  for (let fr = 0; fr <= 3; fr++) {
    for (let fl = 0; fl <= 4; fl++) {
      const piece = room.board[fr][fl]
      if (!piece || piece.owner !== playerSide || !piece.canActThisTurn) continue
      for (let tr = 0; tr <= 3; tr++) {
        for (let tl = 0; tl <= 4; tl++) {
          if (!isValidAttack(room.board, piece, fr, fl, tr, tl)) continue
          const sim = simBoard()
          sim[tr][tl] = null  // capture (Shield/Enslave ignored in simulation)
          const k = findKing(sim, playerSide)
          if (k && !isInCheck(sim, k.row, k.lane, playerSide)) return true
        }
      }
    }
  }

  // 2d. Place piece card from hand
  for (let ci = 0; ci < player.hand.length; ci++) {
    const card = player.hand[ci]
    if (!['Pawn','Knight','Bishop','Rook','Queen'].includes(card.type)) continue
    for (const r of ownRows) {
      for (let l = 0; l <= 4; l++) {
        if (room.board[r][l] !== null) continue
        const sim = simBoard()
        sim[r][l] = { type: card.type, owner: playerSide, buff: null, debuff: null, canActThisTurn: false }
        const k = findKing(sim, playerSide)
        if (k && !isInCheck(sim, k.row, k.lane, playerSide)) return true
      }
    }
  }

  // 2e. play_reposition (if Reposition in hand)
  if (player.hand.some(c => c.type === 'Reposition')) {
    for (let fr = 0; fr <= 3; fr++) {
      for (let fl = 0; fl <= 4; fl++) {
        const piece = room.board[fr][fl]
        if (!piece || piece.owner !== playerSide) continue
        for (const tr of ownRows) {
          for (let tl = 0; tl <= 4; tl++) {
            if (!isValidReposition(room.board, piece, fr, fl, tr, tl)) continue
            const sim = simBoard()
            sim[tr][tl] = sim[fr][fl]
            sim[fr][fl] = null
            const k = findKing(sim, playerSide)
            if (k && !isInCheck(sim, k.row, k.lane, playerSide)) return true
          }
        }
      }
    }
  }

  // 2f. play_swap (if Swap in hand)
  if (player.hand.some(c => c.type === 'Swap')) {
    const ownPieces = []
    for (let r = 0; r <= 3; r++)
      for (let l = 0; l <= 4; l++)
        if (room.board[r][l]?.owner === playerSide) ownPieces.push([r, l])
    for (let i = 0; i < ownPieces.length; i++) {
      for (let j = i + 1; j < ownPieces.length; j++) {
        const [ar, al] = ownPieces[i], [br, bl] = ownPieces[j]
        if (!isValidSwap(room.board, playerSide, ar, al, br, bl)) continue
        const sim = simBoard()
        const tmp = sim[ar][al]
        sim[ar][al] = sim[br][bl]
        sim[br][bl] = tmp
        const k = findKing(sim, playerSide)
        if (k && !isInCheck(sim, k.row, k.lane, playerSide)) return true
      }
    }
  }

  // 2g. play_buff Bodyguard on a piece adjacent to the King (protects it in place)
  if (player.hand.some(c => c.type === 'Bodyguard')) {
    for (const [dr, dl] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const r = king.row + dr, l = king.lane + dl
      if (!inBounds(r, l)) continue
      const piece = room.board[r][l]
      if (!isValidBuffTarget(piece) || piece.owner !== playerSide) continue
      const sim = simBoard()
      sim[r][l] = { ...sim[r][l], buff: { type: 'Bodyguard' } }
      const k = findKing(sim, playerSide)
      if (k && !isInCheck(sim, k.row, k.lane, playerSide)) return true
    }
  }

  // 2h. play_debuff Fatigue on a checking piece (silences its threat)
  if (player.hand.some(c => c.type === 'Fatigue')) {
    for (let r = 0; r <= 3; r++) {
      for (let l = 0; l <= 4; l++) {
        const piece = room.board[r][l]
        if (!piece || piece.owner === playerSide) continue
        if (!isValidDebuffTarget(piece)) continue
        const sim = simBoard()
        sim[r][l] = { ...sim[r][l], debuff: { type: 'Fatigue' } }
        const k = findKing(sim, playerSide)
        if (k && !isInCheck(sim, k.row, k.lane, playerSide)) return true
      }
    }
  }

  return false
}
