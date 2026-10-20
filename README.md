# checkline
A turn-based multiplayer card game inspired by chess

## Project layout

```
engine/   Game rules in TypeScript, with no networking code
server/   Node.js + Socket.io server that runs games using the engine
client/   React + Vite front end
```

`engine` and `server` are npm workspaces, installed together from the repository root.

## Running locally

### Server (Docker)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

The server listens on http://localhost:3001 and reports its status at http://localhost:3001/health.

### Server (without Docker)

```bash
npm install
npm run build
npm start --workspace server
```

### Client

```bash
cd client
npm install
npm run dev
```

The client connects to `http://localhost:3001` by default. Set `VITE_SERVER_URL` to point it at a different server.

## Tests

```bash
npm install
npm run build
npm test
```
