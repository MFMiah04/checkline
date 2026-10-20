import { createGameServer } from './server.js'

const PORT = process.env.PORT || 3001
const { httpServer, io } = createGameServer()

httpServer.listen(PORT, () => {
  console.log(`Checkline server running on port ${PORT}`)
})

// Containers are stopped with SIGTERM. Node runs as PID 1 in the container,
// which ignores SIGTERM unless a handler exists, so close sockets and exit cleanly.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`)
  io.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
