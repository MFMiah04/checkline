// Every action so far, grouped by turn with the newest first. Each action, or a whole turn,
// can be replayed on the board.
export default function HistoryPanel({ history, names, mySide, canReplay, replayingKey, onReplay }) {
  if (history.length === 0) {
    return <p className="history-empty">Moves will be listed here as they happen.</p>
  }

  const turns = []
  for (const entry of history) {
    const last = turns.at(-1)
    if (last?.turn === entry.turn) last.entries.push(entry)
    else turns.push({ turn: entry.turn, side: entry.turnSide, entries: [entry] })
  }

  return (
    <ol className="history" aria-label="Move history">
      {turns.reverse().map(t => (
        <li key={t.turn} className="history-turn">
          <div className="history-turn-head">
            <span className={`history-turn-name ${t.side === mySide ? 'is-mine' : 'is-theirs'}`}>
              Turn {t.turn} · {t.side === mySide ? 'You' : names[t.side]}
            </span>
            {canReplay && (
              <button type="button" className="btn-link history-replay-turn" onClick={() => onReplay(t.entries)}>
                Replay turn
              </button>
            )}
          </div>
          <ol className="history-entries">
            {t.entries.map(e => (
              <li key={e.key} className={`history-entry${e.key === replayingKey ? ' is-replaying' : ''}`}>
                <span className="history-text">{e.text}</span>
                {canReplay && (
                  <button type="button" className="history-replay" onClick={() => onReplay([e])} aria-label={`Replay: ${e.text}`} title="Replay">
                    ▶
                  </button>
                )}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}
