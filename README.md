# checkline
A turn-based multiplayer card game inspired by chess

## Running locally

### Server (Docker)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

The server listens on http://localhost:3001 and reports its status at http://localhost:3001/health.

### Client

```bash
cd client
npm install
npm run dev
```

The client connects to `http://localhost:3001` by default. Set `VITE_SERVER_URL` to point it at a different server.
