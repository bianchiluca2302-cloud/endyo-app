import { useState, useEffect, createContext, useContext, useCallback } from 'react'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const show = useCallback((msg, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
  }, [])

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9000, display: 'flex', flexDirection: 'column-reverse', gap: 8,
        alignItems: 'center', pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '10px 18px',
            borderRadius: 14,
            fontSize: 13.5, fontWeight: 500,
            color: 'white',
            background: t.type === 'error'   ? 'rgba(220,38,38,0.97)'
                      : t.type === 'success' ? 'rgba(5,150,105,0.97)'
                      : t.type === 'warning' ? 'rgba(217,119,6,0.97)'
                      : 'rgba(20,20,34,0.96)',
            border: `1px solid ${
              t.type === 'error'   ? 'rgba(239,68,68,0.4)'
            : t.type === 'success' ? 'rgba(16,185,129,0.4)'
            : t.type === 'warning' ? 'rgba(245,158,11,0.4)'
            : 'rgba(139,92,246,0.25)'}`,
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
            whiteSpace: 'nowrap',
            maxWidth: 'min(88vw, 360px)',
            textAlign: 'center',
            animation: 'toastIn 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {t.type === 'error'   && '✕ '}
            {t.type === 'success' && '✓ '}
            {t.type === 'warning' && '⚠ '}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastCtx)
  if (!ctx) return { show: () => {} }
  return ctx
}
