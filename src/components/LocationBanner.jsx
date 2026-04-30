/**
 * LocationBanner — mostra una volta sola il prompt per abilitare la posizione.
 * Sparisce se: l'utente accetta, rifiuta, o chiude il banner.
 * Usa localStorage per non riapparire nelle sessioni successive.
 */
import { useState, useEffect } from 'react'

export default function LocationBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Non mostrare se già gestito in precedenza
    if (localStorage.getItem('location_banner_done')) return

    // Controlla lo stato attuale del permesso
    if (!navigator.geolocation) return
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(perm => {
        if (perm.state === 'granted') {
          localStorage.setItem('location_banner_done', '1')
          return
        }
        if (perm.state === 'denied') {
          localStorage.setItem('location_banner_done', '1')
          return
        }
        // stato 'prompt' → mostra il banner dopo 2s
        setTimeout(() => setVisible(true), 2000)
      })
    } else {
      setTimeout(() => setVisible(true), 2000)
    }
  }, [])

  const handleEnable = () => {
    navigator.geolocation.getCurrentPosition(
      () => {
        localStorage.setItem('location_banner_done', '1')
        setVisible(false)
      },
      () => {
        localStorage.setItem('location_banner_done', '1')
        setVisible(false)
      },
      { timeout: 10000 }
    )
  }

  const handleDismiss = () => {
    localStorage.setItem('location_banner_done', '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      width: 'min(420px, calc(100vw - 32px))',
      background: 'var(--surface)',
      border: '1px solid rgba(139,92,246,0.3)',
      borderRadius: 16,
      padding: '16px 20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
      animation: 'slideUp 0.3s ease',
    }}>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(16px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }`}</style>

      {/* Icona */}
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: 'rgba(139,92,246,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
        </svg>
      </div>

      {/* Testo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          Abilita la posizione
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Lo Stylist AI usa meteo e posizione reale per consigliarti outfit più precisi.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleEnable}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '7px 16px' }}
          >
            Abilita
          </button>
          <button
            onClick={handleDismiss}
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '7px 12px' }}
          >
            Non ora
          </button>
        </div>
      </div>

      {/* Chiudi */}
      <button
        onClick={handleDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-dim)', fontSize: 18, lineHeight: 1,
          padding: 0, flexShrink: 0,
        }}
      >×</button>
    </div>
  )
}
