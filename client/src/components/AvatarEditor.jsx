import Avatar from './Avatar'
import { FACE_COLORS, EYE_STYLES, MOUTH_STYLES, HATS } from './avatarOptions'

const FEATURES = [
  { key: 'hat',        label: 'Hat',    arr: HATS },
  { key: 'eyeStyle',   label: 'Eyes',   arr: EYE_STYLES },
  { key: 'mouthStyle', label: 'Mouth',  arr: MOUTH_STYLES },
  { key: 'faceColor',  label: 'Colour', arr: FACE_COLORS },
]

export default function AvatarEditor({ avatar, setAvatar }) {
  function cycle(key, arr, dir) {
    const idx = arr.indexOf(avatar[key])
    setAvatar(prev => ({ ...prev, [key]: arr[(idx + dir + arr.length) % arr.length] }))
  }

  function randomize() {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)]
    setAvatar({ faceColor: pick(FACE_COLORS), eyeStyle: pick(EYE_STYLES), mouthStyle: pick(MOUTH_STYLES), hat: pick(HATS), customImage: null })
  }

  return (
    <div className="avatar-editor">
      <div className="avatar-editor-preview">
        <Avatar avatar={avatar} size={88} />
      </div>
      <div className="avatar-editor-controls">
        {FEATURES.map(f => (
          <div key={f.key} className="avatar-editor-row">
            <span>{f.label}</span>
            <button type="button" className="avatar-arrow-btn" onClick={() => cycle(f.key, f.arr, -1)} aria-label={`Previous ${f.label.toLowerCase()}`}>‹</button>
            <button type="button" className="avatar-arrow-btn" onClick={() => cycle(f.key, f.arr, 1)} aria-label={`Next ${f.label.toLowerCase()}`}>›</button>
          </div>
        ))}
        <button type="button" className="btn-link" onClick={randomize}>Randomise</button>
      </div>
    </div>
  )
}
