// In-memory room store
const rooms = new Map()  // code → room

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  } while (rooms.has(code))
  return code
}

export function createRoom(hostSocket, hostName, hostToken) {
  const code = generateCode()
  const room = {
    code,
    phase: 'lobby',
    players: [
      { socketId: hostSocket.id, sessionToken: hostToken, name: hostName, side: 0, hand: [], mulliganDone: false, connected: true }
    ],
  }
  rooms.set(code, room)
  return room
}

export function joinRoom(code, guestSocket, guestName, guestToken) {
  const room = rooms.get(code)
  if (!room) return { error: 'Room not found.' }
  if (room.phase !== 'lobby') return { error: 'Game already in progress.' }

  if (room.players.length >= 2) {
    // Allow joining only if the existing guest slot is disconnected (grace period)
    if (room.players[1].connected) return { error: 'Room is full.' }
    room.players.splice(1, 1)  // evict the disconnected ghost
  }

  room.players.push({
    socketId: guestSocket.id,
    sessionToken: guestToken,
    name: guestName,
    side: 1,
    hand: [],
    mulliganDone: false,
    connected: true
  })
  return { room }
}

export function getRoom(code) {
  return rooms.get(code) || null
}

export function getRoomByToken(token) {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.sessionToken === token)
    if (player) return { room, player }
  }
  return null
}

export function getRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.socketId === socketId)
    if (player) return { room, player }
  }
  return null
}

export function removeRoom(code) {
  rooms.delete(code)
}

export function updateSocketId(token, newSocketId) {
  const result = getRoomByToken(token)
  if (!result) return null
  result.player.socketId = newSocketId
  result.player.connected = true
  return result
}
