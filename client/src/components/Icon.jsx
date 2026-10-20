// Shows a piece or card icon from src/assets/art in the current text colour.
// Each SVG is used as a CSS mask, so one file can be ink on ivory or ivory on walnut.
const files = import.meta.glob('../assets/art/*/*.svg', { eager: true, query: '?url', import: 'default' })

const ICONS = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop().replace('.svg', ''), url]),
)

export default function Icon({ name, size = 24, label, className = '' }) {
  const url = ICONS[name?.toLowerCase()]
  if (!url) return null
  return (
    <span
      className={`icon ${className}`}
      style={{ width: size, height: size, WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")` }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
