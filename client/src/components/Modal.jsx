import { useEffect, useId, useRef } from 'react'

// An accessible dialog: announced to screen readers, closes on Escape or a click outside,
// moves focus into the dialog when it opens and back to where it was when it closes.
export default function Modal({ title, onClose, children, className = '', titleClassName = '' }) {
  const titleId = useId()
  const dialogRef = useRef(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const first = dialogRef.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    first?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
      // Keep Tab inside the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        if (focusable.length === 0) return
        const firstEl = focusable[0]
        const lastEl = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`modal-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <h2 id={titleId} className={`modal-title ${titleClassName}`}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
