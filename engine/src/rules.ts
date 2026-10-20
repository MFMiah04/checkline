import { isPlaceable } from './cards.js'
import type { Action, Board, Card, Piece, PieceType, Position, Side } from './types.js'

// The parts of a game that check-related rules need to read
export interface CheckContext {
  board: Board
  currentTurn: Side
  players: readonly { hand: Card[] }[]
}

const ORTHOGONAL: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const ALL_DIRECTIONS: readonly [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]

// ── Path helpers ──────────────────────────────────────────────────────────────

export function inBounds(row: number, lane: number): boolean {
  return row >= 0 && row <= 3 && lane >= 0 && lane <= 4
}

export function ownRows(side: Side): [number, number] {
  return side === 0 ? [0, 1] : [2, 3]
}

function isPathClear(board: Board, fromRow: number, fromLane: number, toRow: number, toLane: number): boolean {
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

export function isPinned(piece: Piece): boolean   { return piece.debuff?.type === 'Pin' }
export function isFatigued(piece: Piece): boolean { return piece.debuff?.type === 'Fatigue' }

export function findKing(board: Board, side: Side): Position | null {
  for (let r = 0; r <= 3; r++)
    for (let l = 0; l <= 4; l++)
      if (board[r][l]?.type === 'King' && board[r][l]?.owner === side)
        return { row: r, lane: l }
  return null
}

export function hasBodyguardAdjacentToKing(board: Board, side: Side): boolean {
  const king = findKing(board, side)
  if (!king) return false
  return ORTHOGONAL.some(([dr, dl]) => {
    const r = king.row + dr, l = king.lane + dl
    if (!inBounds(r, l)) return false
    const p = board[r][l]
    return p?.owner === side && p?.buff?.type === 'Bodyguard'
  })
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(p => p ? { ...p } : null))
}

// Is the given side's King in check on this board?
function kingInCheck(board: Board, side: Side): boolean {
  const k = findKing(board, side)
  return k ? isInCheck(board, k.row, k.lane, side) : false
}

// ── Movement validation ───────────────────────────────────────────────────────

// Does the piece's movement pattern allow this step (ignoring board edges and occupancy)?
function matchesPattern(board: Board, type: PieceType, owner: Side, fromRow: number, fromLane: number, toRow: number, toLane: number, attacking: boolean): boolean {
  const dr = toRow - fromRow
  const dl = toLane - fromLane
  const absDr = Math.abs(dr)
  const absDl = Math.abs(dl)

  switch (type) {
    case 'Pawn': {
      const dir = owner === 0 ? 1 : -1
      return attacking ? dr === dir && absDl === 1 : dr === dir && dl === 0
    }
    case 'Knight':
      return (absDr === 1 && absDl === 2) || (absDr === 2 && absDl === 1)
    case 'Bishop':
      return absDr === absDl && absDr > 0 && isPathClear(board, fromRow, fromLane, toRow, toLane)
    case 'Rook':
      return (dr === 0 || dl === 0) && absDr + absDl > 0 && isPathClear(board, fromRow, fromLane, toRow, toLane)
    case 'Queen':
      return (absDr === absDl || dr === 0 || dl === 0) && absDr + absDl > 0 && isPathClear(board, fromRow, fromLane, toRow, toLane)
    case 'King':
      return absDr <= 1 && absDl <= 1 && absDr + absDl > 0
  }
}

export function isValidMove(board: Board, piece: Piece, fromRow: number, fromLane: number, toRow: number, toLane: number): boolean {
  if (!inBounds(toRow, toLane)) return false
  if (isPinned(piece)) return false
  if (!ownRows(piece.owner).includes(toRow)) return false
  if (board[toRow][toLane] !== null) return false
  if (!matchesPattern(board, piece.type, piece.owner, fromRow, fromLane, toRow, toLane, false)) return false

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

export interface BodyguardOption extends Position {
  pieceType: PieceType
}

export function getBodyguardOptions(board: Board, targetRow: number, targetLane: number, defenderSide: Side): BodyguardOption[] {
  const options: BodyguardOption[] = []
  for (const [dr, dl] of ORTHOGONAL) {
    const r = targetRow + dr, l = targetLane + dl
    if (!inBounds(r, l)) continue
    const p = board[r][l]
    if (p?.owner === defenderSide && p?.buff?.type === 'Bodyguard')
      options.push({ row: r, lane: l, pieceType: p.type })
  }
  return options
}

// ── Attack validation ─────────────────────────────────────────────────────────

export function isValidAttack(board: Board, piece: Piece, fromRow: number, fromLane: number, targetRow: number, targetLane: number): boolean {
  if (!inBounds(targetRow, targetLane)) return false
  if (isFatigued(piece)) return false

  const target = board[targetRow][targetLane]
  if (!target) return false
  if (target.owner === piece.owner) return false
  if (target.type === 'King') {
    return getBodyguardOptions(board, targetRow, targetLane, target.owner).length > 0
  }

  return matchesPattern(board, piece.type, piece.owner, fromRow, fromLane, targetRow, targetLane, true)
}

// ── Reposition validation ─────────────────────────────────────────────────────

export function isValidReposition(board: Board, piece: Piece, fromRow: number, fromLane: number, toRow: number, toLane: number): boolean {
  if (!inBounds(toRow, toLane)) return false
  if (isPinned(piece)) return false
  if (fromRow === toRow && fromLane === toLane) return false
  if (!ownRows(piece.owner).includes(toRow)) return false
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

export function isValidSwap(board: Board, playerSide: Side, aRow: number, aLane: number, bRow: number, bLane: number): boolean {
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

export function isValidBuffTarget(piece: Piece | null | undefined): piece is Piece {
  if (!piece) return false
  if (piece.type === 'King') return false
  if (piece.buff !== null) return false
  if (piece.debuff?.type === 'Silence') return false
  return true
}

export function isValidDebuffTarget(piece: Piece | null | undefined): piece is Piece {
  if (!piece) return false
  if (piece.type === 'King') return false
  if (piece.debuff !== null) return false
  if (piece.buff?.type === 'Protection') return false
  return true
}

// ── Threat map ────────────────────────────────────────────────────────────────

export function getThreatenedSpaces(board: Board, piece: Piece, row: number, lane: number): [number, number][] {
  if (isFatigued(piece)) return []

  const spaces: [number, number][] = []
  const addIfInBounds = (r: number, l: number) => { if (inBounds(r, l)) spaces.push([r, l]) }
  const slide = (directions: readonly [number, number][]) => {
    for (const [dRow, dLane] of directions) {
      let r = row + dRow, l = lane + dLane
      while (inBounds(r, l)) {
        spaces.push([r, l])
        if (board[r][l] !== null) break
        r += dRow; l += dLane
      }
    }
  }

  switch (piece.type) {
    case 'Pawn': {
      const dir = piece.owner === 0 ? 1 : -1
      addIfInBounds(row + dir, lane - 1)
      addIfInBounds(row + dir, lane + 1)
      break
    }
    case 'Knight':
      for (const [dr, dl] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const)
        addIfInBounds(row + dr, lane + dl)
      break
    case 'Bishop':
      slide([[-1, -1], [-1, 1], [1, -1], [1, 1]])
      break
    case 'Rook':
      slide(ORTHOGONAL)
      break
    case 'Queen':
      slide(ALL_DIRECTIONS)
      break
    case 'King':
      for (const [dr, dl] of ALL_DIRECTIONS) addIfInBounds(row + dr, lane + dl)
      break
  }

  return spaces
}

// ── Check detection ───────────────────────────────────────────────────────────

export function isInCheck(board: Board, kingRow: number, kingLane: number, kingOwner: Side): boolean {
  // A Bodyguard-buffed friendly piece adjacent to the King intercepts all attacks
  const protectedByBodyguard = ORTHOGONAL.some(([dr, dl]) => {
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

// Would this action take the current player's King out of check?
// Such actions skip the opponent's reaction window.
export function isCheckRemovalAction(game: CheckContext, action: Action): boolean {
  const playerSide = game.currentTurn
  if (!kingInCheck(game.board, playerSide)) return false

  const sim = cloneBoard(game.board)
  const hand = game.players[playerSide]?.hand ?? []

  switch (action.type) {
    case 'direct_move': {
      const { row, lane, toRow, toLane } = action
      if (!sim[row]?.[lane] || !inBounds(toRow, toLane)) return false
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
      const card = hand[action.cardIndex]
      if (!card || !isPlaceable(card.type) || sim[action.row]?.[action.lane] !== null) return false
      sim[action.row][action.lane] = { type: card.type, owner: playerSide, buff: null, debuff: null, firstStatus: null, canActThisTurn: false }
      break
    }
    case 'play_reposition': {
      const { pieceRow, pieceLane, toRow, toLane } = action
      if (!sim[pieceRow]?.[pieceLane] || !inBounds(toRow, toLane)) return false
      sim[toRow][toLane] = sim[pieceRow][pieceLane]
      sim[pieceRow][pieceLane] = null
      break
    }
    case 'play_swap': {
      const { aRow, aLane, bRow, bLane } = action
      if (!inBounds(aRow, aLane) || !inBounds(bRow, bLane)) return false
      const tmp = sim[aRow][aLane]
      sim[aRow][aLane] = sim[bRow][bLane]
      sim[bRow][bLane] = tmp
      break
    }
    case 'play_debuff': {
      const card = hand[action.cardIndex]
      if (card?.type !== 'Fatigue') return false
      const target = sim[action.targetRow]?.[action.targetLane]
      if (!target || target.owner === playerSide) return false
      sim[action.targetRow][action.targetLane] = { ...target, debuff: { type: 'Fatigue', id: card.id } }
      break
    }
    case 'play_buff': {
      const card = hand[action.cardIndex]
      if (card?.type !== 'Bodyguard') return false
      const target = sim[action.targetRow]?.[action.targetLane]
      if (!isValidBuffTarget(target) || target.owner !== playerSide) return false
      sim[action.targetRow][action.targetLane] = { ...target, buff: { type: 'Bodyguard', id: card.id } }
      break
    }
    default:
      return false
  }

  return findKing(sim, playerSide) !== null && !kingInCheck(sim, playerSide)
}

// Does the player have any legal way to get their King out of check this turn?
export function hasLegalCheckRemoval(game: CheckContext, playerSide: Side): boolean {
  const { board } = game
  const king = findKing(board, playerSide)
  if (!king) return false

  const hand = game.players[playerSide]?.hand ?? []
  const rows = ownRows(playerSide)
  const escapes = (sim: Board) => !kingInCheck(sim, playerSide)

  // King move (isValidMove already checks King safety)
  const kingPiece = board[king.row][king.lane]!
  for (let r = 0; r <= 3; r++)
    for (let l = 0; l <= 4; l++)
      if (isValidMove(board, kingPiece, king.row, king.lane, r, l)) return true

  // Move or attack with another piece
  for (let fr = 0; fr <= 3; fr++) {
    for (let fl = 0; fl <= 4; fl++) {
      const piece = board[fr][fl]
      if (!piece || piece.owner !== playerSide || !piece.canActThisTurn) continue
      for (let tr = 0; tr <= 3; tr++) {
        for (let tl = 0; tl <= 4; tl++) {
          if (piece.type !== 'King' && isValidMove(board, piece, fr, fl, tr, tl)) {
            const sim = cloneBoard(board)
            sim[tr][tl] = sim[fr][fl]
            sim[fr][fl] = null
            if (escapes(sim)) return true
          }
          if (isValidAttack(board, piece, fr, fl, tr, tl)) {
            const sim = cloneBoard(board)
            sim[tr][tl] = null  // capture (Shield/Enslave ignored in simulation)
            if (escapes(sim)) return true
          }
        }
      }
    }
  }

  // Place a piece card to block
  for (const card of hand) {
    if (!isPlaceable(card.type)) continue
    for (const r of rows) {
      for (let l = 0; l <= 4; l++) {
        if (board[r][l] !== null) continue
        const sim = cloneBoard(board)
        sim[r][l] = { type: card.type, owner: playerSide, buff: null, debuff: null, firstStatus: null, canActThisTurn: false }
        if (escapes(sim)) return true
      }
    }
  }

  // Reposition
  if (hand.some(c => c.type === 'Reposition')) {
    for (let fr = 0; fr <= 3; fr++) {
      for (let fl = 0; fl <= 4; fl++) {
        const piece = board[fr][fl]
        if (!piece || piece.owner !== playerSide) continue
        for (const tr of rows) {
          for (let tl = 0; tl <= 4; tl++) {
            if (!isValidReposition(board, piece, fr, fl, tr, tl)) continue
            const sim = cloneBoard(board)
            sim[tr][tl] = sim[fr][fl]
            sim[fr][fl] = null
            if (escapes(sim)) return true
          }
        }
      }
    }
  }

  // Swap
  if (hand.some(c => c.type === 'Swap')) {
    const ownPieces: [number, number][] = []
    for (let r = 0; r <= 3; r++)
      for (let l = 0; l <= 4; l++)
        if (board[r][l]?.owner === playerSide) ownPieces.push([r, l])
    for (let i = 0; i < ownPieces.length; i++) {
      for (let j = i + 1; j < ownPieces.length; j++) {
        const [ar, al] = ownPieces[i]!, [br, bl] = ownPieces[j]!
        if (!isValidSwap(board, playerSide, ar, al, br, bl)) continue
        const sim = cloneBoard(board)
        const tmp = sim[ar][al]
        sim[ar][al] = sim[br][bl]
        sim[br][bl] = tmp
        if (escapes(sim)) return true
      }
    }
  }

  // Bodyguard on a piece next to the King
  const bodyguard = hand.find(c => c.type === 'Bodyguard')
  if (bodyguard) {
    for (const [dr, dl] of ORTHOGONAL) {
      const r = king.row + dr, l = king.lane + dl
      if (!inBounds(r, l)) continue
      const piece = board[r][l]
      if (!isValidBuffTarget(piece) || piece.owner !== playerSide) continue
      const sim = cloneBoard(board)
      sim[r][l] = { ...piece, buff: { type: 'Bodyguard', id: bodyguard.id } }
      if (escapes(sim)) return true
    }
  }

  // Fatigue on a checking piece
  const fatigue = hand.find(c => c.type === 'Fatigue')
  if (fatigue) {
    for (let r = 0; r <= 3; r++) {
      for (let l = 0; l <= 4; l++) {
        const piece = board[r][l]
        if (!piece || piece.owner === playerSide || !isValidDebuffTarget(piece)) continue
        const sim = cloneBoard(board)
        sim[r][l] = { ...piece, debuff: { type: 'Fatigue', id: fatigue.id } }
        if (escapes(sim)) return true
      }
    }
  }

  return false
}
