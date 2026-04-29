/**
 * MobileTutorial — tour guidato al primo accesso su smartphone.
 *
 * 5 step con spotlight sul tab bar corrispondente.
 * Animazione slide + fade al cambio step.
 * Footer sticky con i tasti sempre visibili.
 * Usa la stessa chiave localStorage di TutorialOverlay.
 */

import { useState, useEffect, useCallback } from 'react'
import useSettingsStore from '../store/settingsStore'

const STORAGE_KEY = 'endyo_tutorial_done'

const STEPS_IT = [
  {
    tabTarget: 'tab-wardrobe',
    icon: '🗂',
    title: 'Il tuo armadio',
    body: 'Qui trovi tutti i capi che hai caricato. Tieni il tuo guardaroba sempre organizzato e sotto controllo.',
  },
  {
    tabTarget: 'tab-upload',
    icon: '📸',
    title: 'Aggiungi un capo',
    body: 'Scatta o carica una foto e premi il pulsante centrale. L\'AI riconosce brand, colore e categoria in pochi secondi.',
  },
  {
    tabTarget: 'tab-outfit',
    icon: '⭐',
    title: 'Crea outfit',
    body: 'Combina i tuoi capi e chiedi allo Stylist AI consigli su abbinamenti, occasioni e meteo. Salva i look che preferisci.',
  },
  {
    tabTarget: 'tab-friends',
    icon: '👥',
    title: 'Social',
    body: 'Pubblica i tuoi outfit, scopri quelli degli altri e segui chi ti ispira.',
  },
  {
    tabTarget: 'tab-profile',
    icon: '🙂',
    title: 'Profilo',
    body: 'Personalizza il tuo account. Con il piano Premium puoi analizzare la tua stagione cromatica con l\'AI.',
    cta: 'Inizia →',
  },
]

const STEPS_EN = [
  {
    tabTarget: 'tab-wardrobe',
    icon: '🗂',
    title: 'Your wardrobe',
    body: 'Find all your uploaded items here. Keep your wardrobe organised and always under control.',
  },
  {
    tabTarget: 'tab-upload',
    icon: '📸',
    title: 'Add an item',
    body: 'Take or upload a photo and press the centre button. The AI recognises the brand, colour and category in seconds.',
  },
  {
    tabTarget: 'tab-outfit',
    icon: '⭐',
    title: 'Create outfits',
    body: 'Combine your items and ask the AI Stylist for advice on pairings, occasions and weather. Save the looks you love.',
  },
  {
    tabTarget: 'tab-friends',
    icon: '👥',
    title: 'Social',
    body: 'Share your outfits, discover others\' and follow who inspires you.',
  },
  {
    tabTarget: 'tab-profile',
    icon: '🙂',
    title: 'Profile',
    body: 'Customise your account. With a Premium plan you can analyse your colour season with AI.',
    cta: 'Get started →',
  },
]

export default function MobileTutorial({ onDone }) {
  const language  = useSettingsStore(s => s.language) || 'it'
  const STEPS     = language === 'en' ? STEPS_EN : STEPS_IT
  const [step,      setStep]      = useState(0)
  const [phase,     setPhase]     = useState('in')   // 'in' | 'out-fwd' | 'out-back'
  const [tabRect,   setTabRect]   = useState(null)
  const current = STEPS[step]
  const total   = STEPS.length

  /* Trova il tab target nel DOM */
  useEffect(() => {
    const find = () => {
      const el = document.querySelector(`[data-mobiletour="${current.tabTarget}"]`)
      if (el) setTabRect(el.getBoundingClientRect())
      else    setTabRect(null)
    }
    find()
    const t = setTimeout(find, 120)
    return () => clearTimeout(t)
  }, [current.tabTarget, step])

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    localStorage.setItem('mf_tutorial_done', '1')
    window.dispatchEvent(new CustomEvent('endyo:tutorial-done'))
    onDone()
  }, [onDone])

  /* Animazione slide fluida: esce → cambia step → entra */
  const navigateTo = useCallback((next, dir) => {
    setPhase(dir === 'fwd' ? 'out-fwd' : 'out-back')
    setTimeout(() => {
      setStep(next)
      setPhase(dir === 'fwd' ? 'in-from-right' : 'in-from-left')
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase('in')))
    }, 200)
  }, [])

  const advance = useCallback(() => {
    if (step < total - 1) navigateTo(step + 1, 'fwd')
    else finish()
  }, [step, total, finish, navigateTo])

  const goBack = useCallback(() => {
    if (step > 0) navigateTo(step - 1, 'back')
  }, [step, navigateTo])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape')     finish()
      if (e.key === 'ArrowRight') advance()
      if (e.key === 'ArrowLeft')  goBack()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [finish, advance, goBack])

  /* Calcolo transform/opacity per la fase corrente */
  const phaseStyle = {
    'in':             { opacity: 1,   transform: 'translateX(0)' },
    'out-fwd':        { opacity: 0,   transform: 'translateX(-28px)' },
    'out-back':       { opacity: 0,   transform: 'translateX(28px)' },
    'in-from-right':  { opacity: 0,   transform: 'translateX(28px)' },
    'in-from-left':   { opacity: 0,   transform: 'translateX(-28px)' },
  }[phase] ?? { opacity: 1, transform: 'translateX(0)' }

  const W = window.innerWidth
  const H = window.innerHeight
  const pad = 10

  /* SVG spotlight path */
  const spotlightPath = tabRect
    ? (() => {
        const x = tabRect.left - pad
        const y = tabRect.top  - pad
        const w = tabRect.width  + pad * 2
        const h = tabRect.height + pad * 2
        const r = 14
        return (
          `M 0 0 H ${W} V ${H} H 0 Z ` +
          `M ${x + r} ${y} H ${x + w - r} ` +
          `Q ${x + w} ${y} ${x + w} ${y + r} ` +
          `V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
          `H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} ` +
          `V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
        )
      })()
    : `M 0 0 H ${W} V ${H} H 0 Z`

  const tabTop      = tabRect ? tabRect.top : H - 120
  const cardBottom  = H - tabTop + 20
  /* Altezza massima della card: dallo spazio sopra il tab bar, meno margine in cima */
  const cardMaxH    = tabTop - 24

  const tabCenterX  = tabRect ? tabRect.left + tabRect.width / 2 : W / 2

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>

      {/* ── Overlay SVG spotlight ── */}
      <svg width={W} height={H}
        style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }}>
        <path d={spotlightPath} fill="rgba(0,0,0,0.80)" fillRule="evenodd" />
        {tabRect && (
          <rect
            x={tabRect.left - pad} y={tabRect.top - pad}
            width={tabRect.width + pad * 2} height={tabRect.height + pad * 2}
            rx={14} fill="none" stroke="var(--primary-light)" strokeWidth={2.5}
          >
            <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
          </rect>
        )}
        {tabRect && (
          <line
            x1={tabCenterX} y1={H - cardBottom - 4}
            x2={tabCenterX} y2={tabRect.top - pad - 6}
            stroke="var(--primary-light)" strokeWidth={2}
            strokeDasharray="4 4" opacity={0.65}
          />
        )}
      </svg>

      {/* ── Card tutorial ── */}
      <div style={{
        position: 'absolute',
        bottom: cardBottom,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: 360,
        maxHeight: cardMaxH,
        background: 'var(--surface)',
        borderRadius: 20,
        border: '1px solid var(--border)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Barra progresso — sempre in cima */}
        <div style={{ height: 3, background: 'var(--border)', flexShrink: 0 }}>
          <div style={{
            height: '100%',
            width: `${((step + 1) / total) * 100}%`,
            background: 'linear-gradient(90deg, var(--primary), #c084fc)',
            transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Contenuto scorrevole con animazione slide */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px 0',
          ...phaseStyle,
          transition: phase === 'in'
            ? 'opacity 0.22s ease, transform 0.22s ease'
            : 'opacity 0.18s ease, transform 0.18s ease',
        }}>
          {/* Icona */}
          <div style={{ fontSize: 28, marginBottom: 8, textAlign: 'center' }}>
            {current.icon}
          </div>

          {/* Contatore */}
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 5, textAlign: 'center',
          }}>
            {step + 1} {language === 'en' ? 'of' : 'di'} {total}
          </div>

          {/* Titolo */}
          <h3 style={{
            fontSize: 17, fontWeight: 800, letterSpacing: '-0.025em',
            textAlign: 'center', lineHeight: 1.25, color: 'var(--text)',
            margin: '0 0 8px',
          }}>
            {current.title}
          </h3>

          {/* Testo */}
          <p style={{
            fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65,
            textAlign: 'center', margin: '0 0 14px',
          }}>
            {current.body}
          </p>
        </div>

        {/* Footer tasti — sempre visibile, non scorrevole */}
        <div style={{
          flexShrink: 0,
          padding: '10px 20px 14px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <button
            onClick={finish}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: 'var(--text-dim)', padding: '8px 0',
              flexShrink: 0, WebkitTapHighlightColor: 'transparent',
            }}
          >
            {language === 'en' ? 'Skip' : 'Salta'}
          </button>
          <div style={{ flex: 1 }} />
          {step > 0 && (
            <button
              onClick={goBack}
              style={{
                padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border)',
                background: 'var(--card)', color: 'var(--text-muted)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >←</button>
          )}
          <button
            onClick={advance}
            style={{
              padding: '10px 22px', borderRadius: 12, border: 'none',
              background: 'var(--primary)', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 12px var(--primary-shadow)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {step === total - 1
              ? (current.cta || (language === 'en' ? 'Close' : 'Chiudi'))
              : (language === 'en' ? 'Next →' : 'Avanti →')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function shouldShowMobileTutorial() {
  return !localStorage.getItem(STORAGE_KEY) && !localStorage.getItem('mf_tutorial_done')
}
