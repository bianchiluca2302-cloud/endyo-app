/**
 * PageTutorial — mini-tutorial per singola pagina.
 *
 * - Mostra solo al primo accesso alla pagina (chiave localStorage per pageId)
 * - Spotlight SVG sull'elemento target
 * - Scroll automatico dell'elemento target in vista
 * - Scroll lock durante il tutorial
 * - Navigazione: Indietro / Avanti / Salta
 * - Animazione: testo sfuma → tooltip si sposta → testo riappare
 * - Barra progresso (niente puntini)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import useSettingsStore from '../store/settingsStore'

const STORAGE_PREFIX    = 'mf_page_tour_'
const MAIN_TUTORIAL_KEY = 'endyo_tutorial_done'
const MAIN_TUTORIAL_KEY_OLD = 'mf_tutorial_done'

// ── Hook rect target (con scroll in view) ─────────────────────────────────────
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

      const measure = () => {
        const el2 = document.querySelector(selector)
        if (el2) {
          const r = el2.getBoundingClientRect()
          setRect({ x: r.x, y: r.y, width: r.width, height: r.height })
        }
      }
      window.addEventListener('resize', measure)
      return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
    } else {
      setRect(null)
    }
  }, [selector])

  return rect
}

// ── Scroll lock ───────────────────────────────────────────────────────────────
function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    const prevent = (e) => e.preventDefault()
    document.addEventListener('wheel',     prevent, { passive: false })
    document.addEventListener('touchmove', prevent, { passive: false })
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('wheel',     prevent)
      document.removeEventListener('touchmove', prevent)
      document.body.style.overflow = ''
    }
  }, [active])
}

// ── Spotlight ─────────────────────────────────────────────────────────────────
function Spotlight({ rect, padding = 10, radius = 12 }) {
  const W = window.innerWidth
  const H = window.innerHeight

  if (!rect) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.65)',
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
        <mask id="mf-page-tour-mask">
          <rect width={W} height={H} fill="white" />
          <rect x={x} y={y} width={w} height={h} rx={radius} ry={radius} fill="black" />
        </mask>
      </defs>
      <rect width={W} height={H} fill="rgba(0,0,0,0.65)" mask="url(#mf-page-tour-mask)" />
      <rect
        x={x} y={y} width={w} height={h} rx={radius} ry={radius}
        fill="none"
        style={{ stroke: 'var(--primary)', strokeOpacity: 0.8 }}
        strokeWidth={2}
      />
    </svg>
  )
}

// ── Tooltip card ──────────────────────────────────────────────────────────────
function TooltipCard({ step, stepIndex, total, onNext, onBack, onSkip, targetRect, language = 'it', visible }) {
  const isFirst  = stepIndex === 0
  const isLast   = stepIndex === total - 1
  const isCenter = step.position === 'center' || !targetRect

  const CARD_W = Math.min(300, window.innerWidth - 28)
  const CARD_H  = 210
  const PAD     = 14

  let style = {}
  if (isCenter) {
    style = { position: 'fixed', top: '50%', left: '50%', transform: visible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -48%) scale(0.98)', zIndex: 10000 }
  } else if (targetRect) {
    const spaceRight  = window.innerWidth  - (targetRect.x + targetRect.width  + PAD)
    const spaceLeft   = targetRect.x - PAD
    const spaceBottom = window.innerHeight - (targetRect.y + targetRect.height + PAD)

    let left, top

    if (spaceRight >= CARD_W + PAD) {
      left = targetRect.x + targetRect.width + PAD
      top  = targetRect.y + targetRect.height / 2 - CARD_H / 2
    } else if (spaceLeft >= CARD_W + PAD) {
      left = targetRect.x - CARD_W - PAD
      top  = targetRect.y + targetRect.height / 2 - CARD_H / 2
    } else if (spaceBottom >= CARD_H + PAD) {
      left = targetRect.x + targetRect.width / 2 - CARD_W / 2
      top  = targetRect.y + targetRect.height + PAD
    } else {
      left = targetRect.x + targetRect.width / 2 - CARD_W / 2
      top  = targetRect.y - CARD_H - PAD
    }

    left = Math.max(PAD, Math.min(window.innerWidth  - CARD_W - PAD, left))
    top  = Math.max(PAD, Math.min(window.innerHeight - CARD_H - PAD, top))

    style = { position: 'fixed', left, top, zIndex: 10000 }
  }

  return (
    <div style={{
      ...style,
      width: CARD_W,
      background: 'var(--surface)',
      borderRadius: 16,
      border: '1px solid var(--border)',
      boxShadow: '0 20px 56px rgba(0,0,0,0.5)',
      overflow: 'hidden',
      opacity: visible ? 1 : 0,
      transform: (style.transform || '') + (visible ? '' : ' translateY(6px)'),
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

      <div style={{ padding: '16px 18px 14px' }}>
        {/* Titolo */}
        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 7, letterSpacing: '-0.02em', lineHeight: 1.3 }}>
          {step.title}
        </h4>

        {/* Testo */}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          {step.body}
        </p>

        {/* Azioni */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={onSkip}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--text-dim)', padding: '6px 0',
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
              style={{ fontSize: 12, padding: '7px 12px' }}
            >
              {language === 'en' ? '← Back' : '← Indietro'}
            </button>
          )}
          <button
            onClick={onNext}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '7px 14px' }}
          >
            {isLast ? (step.cta || (language === 'en' ? 'Close' : 'Chiudi')) : (language === 'en' ? 'Next →' : 'Avanti →')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principale ─────────────────────────────────────────────────────
export default function PageTutorial({ pageId, steps }) {
  const language = useSettingsStore(s => s.language) || 'it'
  const key = STORAGE_PREFIX + pageId

  const mainDone = () =>
    !!localStorage.getItem(MAIN_TUTORIAL_KEY) || !!localStorage.getItem(MAIN_TUTORIAL_KEY_OLD)

  const [active,  setActive]  = useState(() => mainDone() && !localStorage.getItem(key))
  const [step,    setStep]    = useState(0)
  const [visible, setVisible] = useState(true)
  const transitioning         = useRef(false)

  const current    = steps[step]
  const targetRect = useTargetRect(current?.target || null)

  useScrollLock(active)

  const finish = useCallback(() => {
    localStorage.setItem(key, '1')
    setActive(false)
  }, [key])

  // Attiva quando il tutorial principale del menu termina
  useEffect(() => {
    const handler = () => {
      if (!localStorage.getItem(key)) setActive(true)
    }
    window.addEventListener('endyo:tutorial-done', handler)
    return () => window.removeEventListener('endyo:tutorial-done', handler)
  }, [key])

  // Animazione: sfuma fuori → aggiorna step → sfuma dentro
  const navigateTo = useCallback((nextStep) => {
    if (transitioning.current) return
    transitioning.current = true
    setVisible(false)
    setTimeout(() => {
      setStep(nextStep)
      setTimeout(() => {
        setVisible(true)
        transitioning.current = false
      }, 180)
    }, 220)
  }, [])

  const advance = useCallback(() => {
    if (step < steps.length - 1) {
      navigateTo(step + 1)
    } else {
      finish()
    }
  }, [step, steps.length, finish, navigateTo])

  const goBack = useCallback(() => {
    if (step > 0) navigateTo(step - 1)
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

  if (!active || !current) return null

  return (
    <>
      {/* Intercetta click sul resto dell'app */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9997, cursor: 'default' }}
        onClick={(e) => e.stopPropagation()}
      />
      <Spotlight rect={targetRect} />
      <TooltipCard
        step={current}
        stepIndex={step}
        total={steps.length}
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
