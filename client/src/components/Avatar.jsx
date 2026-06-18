import { useId } from 'react'

export const FACE_COLORS  = [
  '#f5c27a', '#e8956d', '#c8a87e', '#a0c4e8',
  '#b8e0b0', '#d4a0d4', '#ff9090', '#90d0ff',
  '#c0c0c0', '#ffb3de', '#a8e6cf', '#ffd3b6',
]
export const EYE_STYLES   = ['dots', 'happy', 'sleepy', 'surprised', 'wink', 'angry', 'stars', 'cool', 'hearts', 'closed']
export const MOUTH_STYLES  = ['smile', 'neutral', 'grin', 'smirk', 'frown', 'open', 'tongue', 'wavy', 'cat', 'teeth']
export const HATS          = ['none', 'cap', 'crown', 'beanie', 'wizard', 'tophat', 'horns', 'halo', 'headband', 'party', 'flower']
export const DEFAULT_AVATAR = { faceColor: '#f5c27a', eyeStyle: 'dots', mouthStyle: 'smile', hat: 'none', customImage: null }

function Eyes({ style }) {
  const c = '#1a1a2e'
  switch (style) {
    case 'dots': return <>
      <circle cx="25" cy="34" r="2.5" fill={c} />
      <circle cx="39" cy="34" r="2.5" fill={c} />
    </>
    case 'happy': return <>
      <path d="M22 35 Q25 31 28 35" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M36 35 Q39 31 42 35" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
    case 'sleepy': return <>
      <line x1="22" y1="34" x2="28" y2="35" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <line x1="36" y1="35" x2="42" y2="34" stroke={c} strokeWidth="2" strokeLinecap="round" />
    </>
    case 'surprised': return <>
      <circle cx="25" cy="34" r="4" fill={c} />
      <circle cx="39" cy="34" r="4" fill={c} />
    </>
    case 'wink': return <>
      <circle cx="25" cy="34" r="2.5" fill={c} />
      <path d="M36 34 Q39 31 42 34" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
    case 'angry': return <>
      <circle cx="25" cy="35" r="2.5" fill={c} />
      <circle cx="39" cy="35" r="2.5" fill={c} />
      <line x1="21" y1="30" x2="30" y2="32" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <line x1="34" y1="32" x2="43" y2="30" stroke={c} strokeWidth="2" strokeLinecap="round" />
    </>
    case 'stars': return <>
      <text x="25" y="38" textAnchor="middle" fontSize="9" fill={c}>★</text>
      <text x="39" y="38" textAnchor="middle" fontSize="9" fill={c}>★</text>
    </>
    case 'cool': return <>
      <rect x="18" y="30" width="12" height="8" rx="3" fill={c} />
      <rect x="34" y="30" width="12" height="8" rx="3" fill={c} />
      <line x1="30" y1="34" x2="34" y2="34" stroke={c} strokeWidth="1.5" />
    </>
    case 'hearts': return <>
      <text x="25" y="38" textAnchor="middle" fontSize="9" fill="#e57373">♥</text>
      <text x="39" y="38" textAnchor="middle" fontSize="9" fill="#e57373">♥</text>
    </>
    case 'closed': return <>
      <line x1="22" y1="34" x2="28" y2="34" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <line x1="36" y1="34" x2="42" y2="34" stroke={c} strokeWidth="2" strokeLinecap="round" />
    </>
    default: return null
  }
}

function Mouth({ style, clipId }) {
  const c = '#1a1a2e'
  switch (style) {
    case 'smile': return (
      <path d="M24 44 Q32 51 40 44" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
    )
    case 'neutral': return (
      <line x1="26" y1="44" x2="38" y2="44" stroke={c} strokeWidth="2" strokeLinecap="round" />
    )
    case 'grin': return <>
      <clipPath id={clipId}>
        <path d="M24 44 Q32 52 40 44 Z" />
      </clipPath>
      <path d="M24 44 Q32 52 40 44" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="25" y="44" width="14" height="5" fill="white" clipPath={`url(#${clipId})`} />
    </>
    case 'smirk': return (
      <path d="M26 46 Q31 43 38 42" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
    )
    case 'frown': return (
      <path d="M24 48 Q32 41 40 48" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
    )
    case 'open': return (
      <ellipse cx="32" cy="46" rx="6" ry="4" fill={c} />
    )
    case 'tongue': return <>
      <path d="M24 44 Q32 51 40 44" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="32" cy="51" rx="4" ry="3" fill="#e57373" />
    </>
    case 'wavy': return (
      <path d="M24 44 Q27 47 30 44 Q33 41 36 44 Q39 47 40 44" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
    )
    case 'cat': return (
      <path d="M26 44 Q29 48 32 44 Q35 48 38 44" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
    )
    case 'teeth': return <>
      <path d="M24 44 Q32 52 40 44" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="27" y="44" width="4" height="4" fill="white" />
      <rect x="32" y="44" width="4" height="4" fill="white" />
    </>
    default: return null
  }
}

function Hat({ style }) {
  if (!style || style === 'none') return null
  const dark   = '#1a1a2e'
  const accent = '#7c83fd'
  switch (style) {
    case 'cap': return <>
      <path d="M20 22 Q32 10 44 22" fill={dark} />
      <rect x="16" y="21" width="32" height="5" rx="2" fill={dark} stroke={accent} strokeWidth="0.5" strokeOpacity="0.5" />
    </>
    case 'crown': return (
      <path d="M18 23 L18 14 L24 19 L32 12 L40 19 L46 14 L46 23 Z" fill="#ffd54f" stroke="#b8860b" strokeWidth="1" />
    )
    case 'beanie': return <>
      <path d="M14 25 Q16 11 32 9 Q48 11 50 25" fill="#5c62d6" />
      <rect x="14" y="22" width="36" height="5" rx="2" fill="#7c83fd" />
    </>
    case 'wizard': return <>
      <path d="M32 3 L18 25 L46 25 Z" fill={dark} stroke={accent} strokeWidth="1" strokeOpacity="0.7" />
      <ellipse cx="32" cy="25" rx="14" ry="3.5" fill="#2a2a4e" />
    </>
    case 'tophat': return <>
      <rect x="22" y="8" width="20" height="16" rx="2" fill={dark} stroke={accent} strokeWidth="0.5" strokeOpacity="0.5" />
      <rect x="16" y="23" width="32" height="4" rx="2" fill={dark} stroke={accent} strokeWidth="0.5" strokeOpacity="0.5" />
    </>
    case 'horns': return <>
      <path d="M22 24 L18 8 L28 18 Z" fill="#e57373" />
      <path d="M42 24 L46 8 L36 18 Z" fill="#e57373" />
    </>
    case 'halo': return (
      <ellipse cx="32" cy="10" rx="14" ry="4" fill="none" stroke="#ffd54f" strokeWidth="3" />
    )
    case 'headband': return <>
      <path d="M14 24 Q32 18 50 24" stroke="#e57373" strokeWidth="5" fill="none" strokeLinecap="round" />
    </>
    case 'party': return <>
      <path d="M32 4 L20 26 L44 26 Z" fill="#e57373" stroke="#ffd54f" strokeWidth="1" />
      <line x1="24" y1="20" x2="28" y2="10" stroke="#ffd54f" strokeWidth="1" />
      <line x1="32" y1="22" x2="35" y2="10" stroke="#7c83fd" strokeWidth="1" />
      <circle cx="32" cy="4" r="2" fill="#ffd54f" />
    </>
    case 'flower': return <>
      <circle cx="32" cy="12" r="4" fill="#ffb3de" />
      <circle cx="32" cy="5"  r="3" fill="#ffb3de" />
      <circle cx="25" cy="8"  r="3" fill="#ffb3de" />
      <circle cx="39" cy="8"  r="3" fill="#ffb3de" />
      <circle cx="32" cy="12" r="3" fill="#ffd54f" />
    </>
    default: return null
  }
}

export default function Avatar({ avatar, size = 36 }) {
  const clipId = useId().replace(/:/g, '')

  const fc    = avatar?.faceColor  ?? DEFAULT_AVATAR.faceColor
  const eyes  = avatar?.eyeStyle   ?? DEFAULT_AVATAR.eyeStyle
  const mouth = avatar?.mouthStyle ?? DEFAULT_AVATAR.mouthStyle
  const hat   = avatar?.hat        ?? DEFAULT_AVATAR.hat

  if (avatar?.customImage) {
    return (
      <img
        src={avatar.customImage}
        alt="avatar"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
      />
    )
  }

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <Hat style={hat} />
      <circle cx="32" cy="38" r="22" fill={fc} />
      <Eyes style={eyes} />
      <Mouth style={mouth} clipId={`grin-${clipId}`} />
    </svg>
  )
}
