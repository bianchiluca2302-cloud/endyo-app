/**
 * TutorialOverlay — tour guidato al primo accesso.
 *
 * - Spotlight SVG sull'elemento target
 * - Tooltip posizionato dinamicamente (non copre mai il target)
 * - Scroll lock: impossibile scorrere durante il tutorial
 * - Scroll automatico: l'elemento target viene portato in vista
 * - Navigazione: Indietro / Avanti / Salta
 * - Animazione: testo sfuma → tooltip si sposta → testo riappare
 * - Persiste su localStorage: 'endyo_tutorial_done'
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import useSettingsStore from '../store/settingsStore'

const STORAGE_KEY = 'endyo_tutorial_done'

// ── Definizione passi IT ──────────────────────────────────────────────────────
const STEPS_IT = [
  {
    id: 'welcome', title: 'Benvenuto in Endyo! 👋',
    body: 'Un tour rapido per scoprire le sezioni principali. Ogni sezione ha un mini-tutorial dedicato al primo accesso.',
    target: null, position: 'center',
  },
  {
    id: 'upload', title: 'Aggiungi un capo',
    body: 'Fotografa un capo e l\'AI compila automaticamente colore, categoria, brand e stagione.',
    target: '[data-tour="nav-upload"]', position: 'right',
  },
  {
    id: 'wardrobe', title: 'Armadio',
    body: 'Tutti i tuoi capi in un unico posto, organizzati e sempre a portata di mano.',
    target: '[data-tour="nav-wardrobe"]', position: 'right',
  },
  {
    id: 'outfits', title: 'Outfit Builder',
    body: 'Crea look con i tuoi capi e chiedi allo Stylist AI consigli su abbinamenti e occasioni.',
    target: '[data-tour="nav-outfits"]', position: 'right',
  },
  {
    id: 'social', title: 'Social',
    body: 'Pubblica i tuoi outfit, scopri quelli degli altri e segui chi ti ispira.',
    target: '[data-tour="nav-friends"]', position: 'right',
  },
  {
    id: 'profile', title: 'Profilo',
    body: 'Completa il profilo per ricevere consigli sempre più precisi dallo Stylist AI.',
    target: '[data-tour="nav-profile"]', position: 'right',
  },
  {
    id: 'done', title: 'Tutto pronto! 🎉',
    body: 'Inizia caricando il tuo primo capo: basta una foto e l\'AI pensa al resto.',
    target: null, position: 'center', cta: 'Inizia →',
  },
]

// ── Definizione passi EN ──────────────────────────────────────────────────────
const STEPS_EN = [
  {
    id: 'welcome', title: 'Welcome to Endyo! 👋',
    body: 'A quick tour of the main sections. Each section has its own mini-tutorial on first visit.',
    target: null, position: 'center',
  },
  {
    id: 'upload', title: 'Add an item',
    body: 'Photograph a garment and the AI automatically fills in colour, category, brand and season.',
    target: '[data-tour="nav-upload"]', position: 'right',
  },
  {
    id: 'wardrobe', title: 'Wardrobe',
    body: 'All your items in one place, organised and always at hand.',
    target: '[data-tour="nav-wardrobe"]', position: 'right',
  },
  {
    id: 'outfits', title: 'Outfit Builder',
    body: 'Create looks with your items and ask the AI Stylist for advice on pairings and occasions.',
    target: '[data-tour="nav-outfits"]', position: 'right',
  },
  {
    id: 'social', title: 'Social',
    body: 'Share your outfits, discover others\' and follow who inspires you.',
    target: '[data-tour="nav-friends"]', position: 'right',
  },
  {
    id: 'profile', title: 'Profile',
    body: 'Complete your profile to get increasingly precise advice from the AI Stylist.',
    target: '[data-tour="nav-profile"]', position: 'right',
  },
  {
    id: 'done', title: 'All set! 🎉',
    body: 'Start by uploading your first item: just take a photo and the AI handles the rest.',
    target: null, position: 'center', cta: 'Start →',
  },
]

// ── Hook per il rect dell'elemento target (con scroll in view) ────────────────
function useTargetRect(selector) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!selector) { setRect(null); return }

    const el = document.querySelector(selector)
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      const t = setTimeout(() => {
        const r = el.getBoundingClientRect()
        setRect({ x: r.x, y: r.y, width: r.width, height: r.height })
      }, 120)
      return () => clearTimeout(t)
    } else {
      setRect(null)
    }

    const measure = () => {
      const el2 = document.querySelector(selector)
      if (el2) {
        const r = el2.getBoundingClientRect()
        setRect({ x: r.x, y: r.y, width: r.width, height: r.height })
      }
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [selector])

  return rect
}

// ── Scroll lock ───────────────────────────────────────────────────────────────
function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    const prevent = (e) => e.preventDefault()
    document.addEventListener('wheel',      prevent, { passive: false })
    document.addEventListener('touchmove',  prevent, { passive: false })
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('wheel',     prevent)
      document.removeEventListener('touchmove', prevent)
      document.body.style.overflow = ''
    }
  }, [active])
}

// ── Tooltip card ──────────────────────────────────────────────────────────────
function TooltipCard({ step, stepIndex, total, onNext, onBack, onSkip, targetRect, language = 'it', visible }) {
  const isFirst  = stepIndex === 0
  const isLast   = stepIndex === total - 1
  const isCenter = step.position === 'center' || !targetRect

  const CARD_W        = Math.min(320, window.innerWidth - 32)
  const CARD_H_APPROX = 220
  const PAD           = 16

  let style = {}
  if (isCenter) {
    style = {
      position: 'fixed',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 10000,
    }
  } else if (targetRect) {
    const spaceRight  = window.innerWidth  - (targetRect.x + targetRect.width  + PAD)
    const spaceLeft   = targetRect.x - PAD
    const spaceBottom = window.innerHeight - (targetRect.y + targetRect.height + PAD)

    let left, top

    if (spaceRight >= CARD_W + PAD) {
      left = targetRect.x + targetRect.width + PAD
      top  = targetRect.y + targetRect.height / 2 - CARD_H_APPROX / 2
    } else if (spaceLeft >= CARD_W + PAD) {
      left = targetRect.x - CARD_W - PAD
      top  = targetRect.y + targetRect.height / 2 - CARD_H_APPROX / 2
    } else if (spaceBottom >= CARD_H_APPROX + PAD) {
      left = targetRect.x + targetRect.width / 2 - CARD_W / 2
      top  = targetRect.y + targetRect.height + PAD
    } else {
      left = targetRect.x + targetRect.width / 2 - CARD_W / 2
      top  = targetRect.y - CARD_H_APPROX - PAD
    }

    left = Math.max(PAD, Math.min(window.innerWidth  - CARD_W - PAD, left))
    top  = Math.max(PAD, Math.min(window.innerHeight - CARD_H_APPROX - PAD, top))

    style = { position: 'fixed', left, top, zIndex: 10000 }
  }

  return (
    <div style={{
      ...style,
      width: CARD_W,
      background: 'var(--surface)',
      borderRadius: 18,
      border: '1px solid var(--border)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      overflow: 'hidden',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.98)',
      transition: 'opacity 0.22s ease, transform 0.22s ease',
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      {/* Barra progresso */}
      <div style={{ height: 3, background: 'var(--border)' }}>
        <div style={{
          height: '100%',
          width: `${((stepIndex + 1) / total) * 100}%`,
          background: 'linear-gradient(90deg, var(--primary), #c084fc)',
          borderRadius: 99,
          transition: 'width 0.4s ease',
        }} />
      </div>

      <div style={{ padding: '20px 22px 18px' }}>
        {/* Titolo */}
        <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10, lineHeight: 1.3 }}>
          {step.title}
        </h3>

        {/* Testo */}
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
          {step.body}
        </p>

        {/* Azioni */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={onSkip}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: 'var(--text-dim)', padding: '8px 4px',
              transition: 'color 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => e.target.style.color = 'var(--text-muted)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
          >
            {language === 'en' ? 'Skip' : 'Salta'}
          </button>
          <div style={{ flex: 1 }} />
          {!isFirst && (
            <button
              onClick={onBack}
              className="btn btn-ghost"
              style={{ fontSize: 13, padding: '9px 14px' }}
            >
              {language === 'en' ? '← Back' : '← Indietro'}
            </button>
          )}
          <button
            onClick={onNext}
            className="btn btn-primary"
            style={{ fontSize: 13, padding: '9px 14px' }}
          >
            {isLast ? (step.cta || (language === 'en' ? 'Close' : 'Chiudi')) : (language === 'en' ? 'Next →' : 'Avanti →')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Spotlight SVG ─────────────────────────────────────────────────────────────
function Spotlight({ rect, padding = 10, radius = 14 }) {
  const W = window.innerWidth
  const H = window.innerHeight

  if (!rect) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.72)',
        pointerEvents: 'none',
      }} />
    )
  }

  const x = rect.x - padding
  const y = rect.y - padding
  const w = rect.width  + padding * 2
  const h = rect.height + padding * 2

  return (
    <svg
      style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}
      width={W} height={H}
    >
      <defs>
        <mask id="endyo-tour-mask">
          <rect width={W} height={H} fill="white" />
          <rect x={x} y={y} width={w} height={h} rx={radius} ry={radius} fill="black" />
        </mask>
      </defs>
      <rect
        width={W} height={H}
        fill="rgba(0,0,0,0.72)"
        mask="url(#endyo-tour-mask)"
      />
      {/* Bordo luminoso attorno all'elemento */}
      <rect
        x={x} y={y} width={w} height={h} rx={radius} ry={radius}
        fill="none"
        style={{ stroke: 'var(--primary)', strokeOpacity: 0.8 }}
        strokeWidth={2}
      />
    </svg>
  )
}

// ── Componente principale ─────────────────────────────────────────────────────
export default function TutorialOverlay({ onDone }) {
  const language = useSettingsStore(s => s.language) || 'it'
  const STEPS    = language === 'en' ? STEPS_EN : STEPS_IT

  const [step, setStep]       = useState(0)
  const [visible, setVisible] = useState(true)
  const transitioning         = useRef(false)

  const current    = STEPS[step]
  const targetRect = useTargetRect(current.target)

  useScrollLock(true)

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    // Mantieni compatibilità con vecchia chiave
    localStorage.setItem('mf_tutorial_done', '1')
    window.dispatchEvent(new CustomEvent('endyo:tutorial-done'))
    onDone()
  }, [onDone])

  // Animazione: sfuma fuori → aggiorna step (rect si aggiorna in ~120ms) → sfuma dentro
  const navigateTo = useCallback((nextStep) => {
    if (transitioning.current) return
    transitioning.current = true
    setVisible(false)
    setTimeout(() => {
      setStep(nextStep)
      // Attendi che useTargetRect risolva il nuovo rect (timeout interno 120ms + buffer)
      setTimeout(() => {
        setVisible(true)
        transitioning.current = false
      }, 180)
    }, 220)
  }, [])

  const advance = useCallback(() => {
    if (step < STEPS.length - 1) {
      navigateTo(step + 1)
    } else {
      finish()
    }
  }, [step, STEPS.length, finish, navigateTo])

  const goBack = useCallback(() => {
    if (step > 0) navigateTo(step - 1)
  }, [step, navigateTo])

  // ESC / frecce
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape')     finish()
      if (e.key === 'ArrowRight') advance()
      if (e.key === 'ArrowLeft')  goBack()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [finish, advance, goBack])

  return (
    <>
      {/* Overlay click intercept */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9997, cursor: 'default' }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Spotlight / overlay */}
      <Spotlight rect={targetRect} />

      {/* Tooltip */}
      <TooltipCard
        step={current}
        stepIndex={step}
        total={STEPS.length}
        targetRect={targetRect}
        onNext={advance}
        onBack={goBack}
        onSkip={finish}
        language={language}
        visible={visible}
      />
    </>
  )
}

// ── Helper: controlla se mostrare il tutorial ─────────────────────────────────
export function shouldShowTutorial() {
  return !localStorage.getItem(STORAGE_KEY) && !localStorage.getItem('mf_tutorial_done')
}
