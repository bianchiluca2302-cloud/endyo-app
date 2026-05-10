import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function FullscreenImageViewer({ src, alt = '', onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.96)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100dvw', maxHeight: '100dvh',
          objectFit: 'contain',
          userSelect: 'none',
          WebkitUserDrag: 'none',
          cursor: 'default',
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 'max(16px, env(safe-area-inset-top, 16px))', right: 16,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white',
          fontSize: 22, lineHeight: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >×</button>
    </div>,
    document.body
  )
}
