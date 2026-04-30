/**
 * MobileTutorial — tour guidato al primo accesso su smartphone.
 * Palette amber (come la landing). Contenuto realistico e dettagliato.
 */

import { useState, useEffect, useCallback } from 'react'
import useSettingsStore from '../store/settingsStore'

const STORAGE_KEY = 'endyo_tutorial_done'

const STEPS_IT = [
  {
    tabTarget: 'tab-wardrobe',
    emoji: '👗',
    title: 'Il tuo armadio digitale',
    body: 'Tutti i tuoi capi in un unico posto. Puoi filtrarli per categoria, colore, stagione o brand. Toccane uno per vederne i dettagli, le statistiche di utilizzo e gli outfit in cui l\'hai indossato.',
    tip: '💡 Scorri in su per vedere l\'intero guardaroba',
  },
  {
    tabTarget: 'tab-upload',
    emoji: '📸',
    title: 'Aggiungi un capo',
    body: 'Premi il pulsante centrale ＋ per fotografare o caricare un capo. L\'AI lo analizza automaticamente: riconosce categoria, colore, brand e stagione. Puoi correggere qualsiasi campo prima di salvare.',
    tip: '💡 Scatta su sfondo neutro per risultati migliori',
  },
  {
    tabTarget: 'tab-outfit',
    emoji: '✨',
    title: 'Stylist AI & Outfit',
    body: 'Crea outfit combinando i tuoi capi oppure chiedi allo Stylist AI. Scrivi ad esempio "outfit casual per domani con pioggia" e l\'AI suggerirà combinazioni dai tuoi capi, tenendo conto del meteo e dell\'occasione.',
    tip: '💡 Il meteo in alto mostra le condizioni attuali',
  },
  {
    tabTarget: 'tab-friends',
    emoji: '👥',
    title: 'Social & amici',
    body: 'Pubblica i tuoi outfit preferiti, scopri quelli degli altri utenti e segui chi ti ispira. Puoi cercare persone tramite username e commentare i look che ami.',
    tip: '💡 Il feed mostra gli outfit più recenti dei tuoi amici',
  },
  {
    tabTarget: 'tab-profile',
    emoji: '🙂',
    title: 'Profilo & impostazioni',
    body: 'Personalizza avatar, foto corpo e preferenze. Con il piano Premium sblocchi l\'analisi dell\'armocromia AI, outfit illimitati e lo Shopping Advisor personalizzato. Vai su Impostazioni per cambiare lingua e tema.',
    tip: null,
    cta: 'Inizia ora →',
  },
]

const STEPS_EN = [
  {
    tabTarget: 'tab-wardrobe',
    emoji: '👗',
    title: 'Your digital wardrobe',
    body: 'All your items in one place. Filter by category, colour, season or brand. Tap any item to see details, wear stats and the outfits you\'ve built with it.',
    tip: '💡 Scroll up to browse your full wardrobe',
  },
  {
    tabTarget: 'tab-upload',
    emoji: '📸',
    title: 'Add an item',
    body: 'Tap the central ＋ button to photograph or upload an item. The AI automatically detects category, colour, brand and season. You can edit any field before saving.',
    tip: '💡 Shoot on a neutral background for best results',
  },
  {
    tabTarget: 'tab-outfit',
    emoji: '✨',
    title: 'AI Stylist & Outfits',
    body: 'Build outfits by combining your items, or ask the AI Stylist. Try "casual outfit for tomorrow with rain" and the AI will suggest combinations from your wardrobe, considering the weather and occasion.',
    tip: '💡 The weather badge at the top shows current conditions',
  },
  {
    tabTarget: 'tab-friends',
    emoji: '👥',
    title: 'Social & friends',
    body: 'Share your favourite outfits, discover other users\' looks and follow who inspires you. Search people by username and comment on looks you love.',
    tip: '💡 The feed shows the most recent outfits from people you follow',
  },
  {
    tabTarget: 'tab-profile',
    emoji: '🙂',
    title: 'Profile & settings',
    body: 'Customise your avatar, body photo and preferences. With Premium you unlock AI colour season analysis, unlimited outfits and a personalised Shopping Advisor. Go to Settings to change language and theme.',
    tip: null,
    cta: 'Get started →',
  },
]

// ── Palette amber (identica alla landing) ─────────────────────────────────────
const C = {
  bg:       '#fffcf0',
  surface:  '#ffffff',
  border:   'rgba(0,0,0,0.08)',
  primary:  '#f59e0b',
  primaryD: '#d97706',
  text:     '#1a1208',
  muted:    '#6b5b3e',
  dim:      '#a08060',
  overlay:  'rgba(26,18,8,0.82)',
}

export default function MobileTutorial({ onDone }) {
  const language  = useSettingsStore(s => s.language) || 'it'
  const STEPS     = language === 'en' ? STEPS_EN : STEPS_IT
  const [step,    setStep]  = useState(0)
  const [phase,   setPhase] = useState('in')
  const [tabRect, setTabRect] = useState(null)
  const current = STEPS[step]
  const total   = STEPS.length

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

  const tabTop     = tabRect ? tabRect.top : H - 120
  const cardBottom = H - tabTop + 20
  const cardMaxH   = tabTop - 24
  const tabCenterX = tabRect ? tabRect.left + tabRect.width / 2 : W / 2

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>

      {/* ── Overlay SVG spotlight ── */}
      <svg width={W} height={H}
        style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }}>
        <path d={spotlightPath} fill={C.overlay} fillRule="evenodd" />
        {tabRect && (
          <rect
            x={tabRect.left - pad} y={tabRect.top - pad}
            width={tabRect.width + pad * 2} height={tabRect.height + pad * 2}
            rx={14} fill="none" stroke={C.primary} strokeWidth={2.5}
          >
            <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
          </rect>
        )}
        {tabRect && (
          <line
            x1={tabCenterX} y1={H - cardBottom - 4}
            x2={tabCenterX} y2={tabRect.top - pad - 6}
            stroke={C.primary} strokeWidth={1.5}
            strokeDasharray="4 4" opacity={0.6}
          />
        )}
      </svg>

      {/* ── Card tutorial (palette amber) ── */}
      <div style={{
        position: 'absolute',
        bottom: cardBottom,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: 360,
        maxHeight: cardMaxH,
        background: C.surface,
        borderRadius: 20,
        border: `1px solid ${C.border}`,
        boxShadow: `0 8px 40px rgba(245,158,11,0.18), 0 2px 16px rgba(0,0,0,0.12)`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Barra progresso amber */}
        <div style={{ height: 3, background: 'rgba(245,158,11,0.12)', flexShrink: 0 }}>
          <div style={{
            height: '100%',
            width: `${((step + 1) / total) * 100}%`,
            background: `linear-gradient(90deg, ${C.primary}, ${C.primaryD})`,
            transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Contenuto con animazione slide */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px 0',
          ...phaseStyle,
          transition: phase === 'in'
            ? 'opacity 0.22s ease, transform 0.22s ease'
            : 'opacity 0.18s ease, transform 0.18s ease',
        }}>
          {/* Emoji */}
          <div style={{ fontSize: 30, marginBottom: 6, textAlign: 'center' }}>
            {current.emoji}
          </div>

          {/* Contatore */}
          <div style={{
            fontSize: 10, fontWeight: 700, color: C.primaryD,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            marginBottom: 5, textAlign: 'center',
          }}>
            {step + 1} {language === 'en' ? 'of' : 'di'} {total}
          </div>

          {/* Titolo */}
          <h3 style={{
            fontSize: 17, fontWeight: 800, letterSpacing: '-0.025em',
            textAlign: 'center', lineHeight: 1.25, color: C.text,
            margin: '0 0 10px',
          }}>
            {current.title}
          </h3>

          {/* Testo */}
          <p style={{
            fontSize: 13, color: C.muted, lineHeight: 1.7,
            textAlign: 'center', margin: '0 0 12px',
          }}>
            {current.body}
          </p>

          {/* Tip */}
          {current.tip && (
            <div style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 10, padding: '8px 12px',
              fontSize: 12, color: C.primaryD,
              textAlign: 'center', marginBottom: 12,
              lineHeight: 1.5,
            }}>
              {current.tip}
            </div>
          )}
        </div>

        {/* Footer tasti */}
        <div style={{
          flexShrink: 0,
          padding: '10px 20px 14px',
          borderTop: `1px solid ${C.border}`,
          background: C.surface,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <button
            onClick={finish}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: C.dim, padding: '8px 0',
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
                padding: '10px 16px', borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: 'rgba(245,158,11,0.06)',
                color: C.muted,
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >←</button>
          )}
          <button
            onClick={advance}
            style={{
              padding: '10px 22px', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg, ${C.primary}, ${C.primaryD})`,
              color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(245,158,11,0.35)',
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
