import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import './App.css'

// The home page loads first. The lobby, the game screen (with its animation library)
// and the computer player are only downloaded when someone needs them.
const Lobby = lazy(() => import('./pages/Lobby'))
const Game = lazy(() => import('./pages/Game'))
const SoloGame = lazy(() => import('./pages/SoloGame'))

const loading = <div className="game-loading">Loading…</div>

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={loading}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby/:code" element={<Lobby />} />
          <Route path="/game/:code" element={<Game />} />
          <Route path="/solo" element={<SoloGame />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
