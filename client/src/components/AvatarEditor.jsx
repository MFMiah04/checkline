import Avatar, { FACE_COLORS, EYE_STYLES, MOUTH_STYLES, HATS } from './Avatar'

const FEATURES = [
  { key: 'hat',        arr: HATS },
  { key: 'eyeStyle',   arr: EYE_STYLES },
  { key: 'mouthStyle', arr: MOUTH_STYLES },
  { key: 'faceColor',  arr: FACE_COLORS },
]

export default function AvatarEditor({ avatar, setAvatar }) {
  function set(key, value) {
    setAvatar(prev => ({ ...prev, [key]: value }))
  }

  function cycle(key, arr, dir) {
    const idx = arr.indexOf(avatar[key])
    set(key, arr[(idx + dir + arr.length) % arr.length])
  }

  function randomize() {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)]
    setAvatar({ faceColor: pick(FACE_COLORS), eyeStyle: pick(EYE_STYLES), mouthStyle: pick(MOUTH_STYLES), hat: pick(HATS), customImage: null })
  }

  return (
    <div className="avatar-editor">
      <div className="avatar-editor-panel">
        <div className="avatar-arrow-col">
          {FEATURES.map(f => (
            <button key={f.key} className="avatar-arrow-btn" onClick={() => cycle(f.key, f.arr, -1)}>◀</button>
          ))}
        </div>
        <div className="avatar-editor-preview">
          <Avatar avatar={avatar} size={96} />
        </div>
        <div className="avatar-arrow-col">
          {FEATURES.map(f => (
            <button key={f.key} className="avatar-arrow-btn" onClick={() => cycle(f.key, f.arr, 1)}>▶</button>
          ))}
        </div>
      </div>
      <button className="avatar-dice-btn" onClick={randomize} title="Randomise">🎲</button>
    </div>
  )
}
