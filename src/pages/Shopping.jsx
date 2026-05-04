import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeShoppingAdvisor, confirmGarment, fetchChatQuota, imgUrl } from '../api/client'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import useAuthStore from '../store/authStore'
import { useT, useCategoryLabels } from '../i18n'
import PageTutorial from '../components/PageTutorial'
import QuotaBanner from '../components/QuotaBanner'

// ── Tutorial steps ─────────────────────────────────────────────────────────────
const getShoppingTour = (lang) => lang === 'en' ? [
  {
    title: 'Shopping Advisor',
    body: 'Considering a new item? Upload a photo and find out if it is worth adding to your wardrobe: compatibility score, possible outfits and much more.',
    position: 'center',
  },
  {
    title: 'Upload a photo',
    body: 'Drop the photo of the item you are considering here, or click to select it. Works with any photo.',
    target: '[data-pagetour="shopping-dropzone"]',
    position: 'bottom',
  },
  {
    title: 'Smart results',
    body: 'Here you will see the compatibility score, matching items, possible outfits and a verdict on whether it is worth buying.',
    target: '[data-pagetour="shopping-results"]',
    position: 'top',
    cta: 'Start!',
  },
] : [
  {
    title: 'Shopping Advisor',
    body: 'Stai valutando un capo? Carica la foto e scopri se vale il tuo armadio: compatibilità, outfit possibili e molto altro.',
    position: 'center',
  },
  {
    title: 'Carica la foto',
    body: 'Trascina qui la foto del capo che stai valutando, oppure clicca per selezionarla. Funziona con qualsiasi foto.',
    target: '[data-pagetour="shopping-dropzone"]',
    position: 'bottom',
  },
  {
    title: 'Risultati intelligenti',
    body: 'Qui vedrai lo score di compatibilità, i capi abbinabili, gli outfit possibili e un verdetto su se conviene acquistarlo.',
    target: '[data-pagetour="shopping-results"]',
    position: 'top',
    cta: 'Inizia!',
  },
]

// ── Tops categories for outfit calculation ─────────────────────────────────────
const TOP_CATS    = ['maglietta', 'felpa', 'giacchetto']
const BOTTOM_CATS = ['pantaloni']
const SHOE_CATS   = ['scarpe']

// ── Compatibility logic ────────────────────────────────────────────────────────
function computeCompatibility(analysis, garments) {
  const cat        = (analysis.category || '').toLowerCase()
  const styleTags  = Array.isArray(analysis.style_tags) ? analysis.style_tags.map(t => t.toLowerCase()) : []

  // Count by category in current wardrobe
  const byCategory = {}
  garments.forEach(g => {
    const c = (g.category || '').toLowerCase()
    byCategory[c] = (byCategory[c] || 0) + 1
  })

  const tops    = TOP_CATS.reduce((s, c) => s + (byCategory[c] || 0), 0)
  const bottoms = byCategory['pantaloni'] || 0
  const shoes   = byCategory['scarpe']   || 0

  // Outfit combos before
  const before = tops * bottoms * shoes

  // Outfit combos after adding new item
  let after = before
  if (TOP_CATS.includes(cat)) {
    after = (tops + 1) * bottoms * shoes
  } else if (BOTTOM_CATS.includes(cat)) {
    after = tops * (bottoms + 1) * shoes
  } else if (SHOE_CATS.includes(cat)) {
    after = tops * bottoms * (shoes + 1)
  }
  const newCombos = Math.max(0, after - before)

  // Style matches: garments sharing at least one style tag
  const styleMatches = garments.filter(g => {
    const gTags = Array.isArray(g.style_tags) ? g.style_tags.map(t => t.toLowerCase()) : []
    return styleTags.some(tag => gTags.includes(tag))
  })

  // Similar in wardrobe: same category
  const similarInWardrobe = garments.filter(g => (g.category || '').toLowerCase() === cat)

  // Fills gap: category not present at all
  const fillsGap = !byCategory[cat]

  // Score 0-10
  let score = 5
  if (fillsGap)                          score += 2
  if (similarInWardrobe.length < 3)      score += 1
  if (similarInWardrobe.length >= 3)     score -= 1
  if (similarInWardrobe.length >= 5)     score -= 1  // extra -1 (total -2)
  if (styleMatches.length >= 3)          score += 2
  else if (styleMatches.length >= 1)     score += 1
  if (newCombos >= 3)                    score += 2
  else if (newCombos >= 1)               score += 1

  score = Math.max(0, Math.min(10, score))

  return {
    score,
    newCombos,
    styleMatches,
    similarInWardrobe,
    fillsGap,
  }
}

// ── Score ring SVG ─────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const radius      = 46
  const stroke      = 7
  const circumference = 2 * Math.PI * radius
  const pct         = score / 10
  const dashOffset  = circumference * (1 - pct)

  let color = '#22c55e'  // green
  if (score < 5)  color = '#ef4444'  // red
  else if (score < 8) color = '#f59e0b'  // orange

  return (
    <svg width={120} height={120} viewBox="0 0 120 120">
      {/* Track */}
      <circle
        cx={60} cy={60} r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={stroke}
      />
      {/* Progress */}
      <circle
        cx={60} cy={60} r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
      />
      {/* Score text */}
      <text x={60} y={55} textAnchor="middle" fill="var(--text)" fontSize={22} fontWeight={700} fontFamily="inherit">
        {score.toFixed(1)}
      </text>
      <text x={60} y={72} textAnchor="middle" fill="var(--text-dim)" fontSize={10} fontFamily="inherit">
        / 10
      </text>
    </svg>
  )
}

// ── Step indicator for ANALYZING state ────────────────────────────────────────
function AnalyzingSteps({ currentStep, labels }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {labels.map((label, i) => {
        const done    = i < currentStep
        const active  = i === currentStep
        const pending = i > currentStep
        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: pending ? 0.35 : 1,
              transition: 'opacity 0.3s',
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done
                ? 'var(--primary)'
                : active
                  ? 'var(--primary-dim)'
                  : 'var(--card)',
              border: `2px solid ${done || active ? 'var(--primary)' : 'var(--border)'}`,
              transition: 'all 0.3s',
            }}>
              {done ? (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : active ? (
                <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
              ) : (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border)' }} />
              )}
            </div>
            <span style={{
              fontSize: 13,
              fontWeight: active ? 600 : done ? 500 : 400,
              color: done ? 'var(--primary)' : active ? 'var(--text)' : 'var(--text-dim)',
              transition: 'color 0.3s',
            }}>
              {label}{done ? ' ✓' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
// onClose: se passato, Shopping è in modalità overlay (mostra ×, niente tutorial)
export default function Shopping({ onClose } = {}) {
  const navigate    = useNavigate()
  const garments    = useWardrobeStore(s => s.garments)
  const outfits     = useWardrobeStore(s => s.outfits)
  const addGarment  = useWardrobeStore(s => s.addGarment)
  const language    = useSettingsStore(s => s.language || 'it')
  const user        = useAuthStore(s => s.user)
  const t           = useT()
  const categoryLabels = useCategoryLabels()
  const isModal     = typeof onClose === 'function'

  // ── State ──────────────────────────────────────────────────────────────────
  const [state,     setState]    = useState('idle')   // idle | analyzing | results
  const [photo,     setPhoto]    = useState(null)     // File
  const [preview,   setPreview]  = useState(null)     // data URL
  const [dragOver,  setDragOver] = useState(false)
  const [stepIdx,   setStepIdx]  = useState(0)        // analyzing step 0-3
  const [analysis,  setAnalysis] = useState(null)
  const [tmpPaths,  setTmpPaths] = useState(null)     // { tmp_front, tmp_back, tmp_label }
  const [compat,    setCompat]   = useState(null)
  const [error,          setError]          = useState(null)
  const [added,          setAdded]          = useState(false)
  const [adding,         setAdding]         = useState(false)
  const [quota,          setQuota]          = useState(null)     // { remaining_day, remaining_week, ... }
  const [quotaExhausted, setQuotaExhausted] = useState(false)

  // ── Carica quota shopping al mount ─────────────────────────────────────────
  useEffect(() => {
    fetchChatQuota().then(q => setQuota(q)).catch(() => {})
  }, [])

  const fileInputRef = useRef(null)
  const stepTimers   = useRef([])

  const STEP_LABELS = [
    t('shoppingStep1'),
    t('shoppingStep2'),
    t('shoppingStep3'),
    t('shoppingStep4'),
  ]

  // ── Helpers ────────────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    stepTimers.current.forEach(clearTimeout)
    stepTimers.current = []
    setState('idle')
    setPhoto(null)
    setPreview(null)
    setDragOver(false)
    setStepIdx(0)
    setAnalysis(null)
    setTmpPaths(null)
    setCompat(null)
    setError(null)
    setAdded(false)
    setAdding(false)
  }, [])

  const applyFile = useCallback((file) => {
    if (!file) return
    setPhoto(file)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target.result)
    reader.readAsDataURL(file)
    setError(null)
  }, [])

  // ── Drag & drop handlers ───────────────────────────────────────────────────
  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) applyFile(file)
  }, [applyFile])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  const onFileChange = useCallback((e) => {
    applyFile(e.target.files?.[0])
  }, [applyFile])

  // ── Analyze ────────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!photo) {
      setError(t('shoppingNoPhoto'))
      return
    }
    setError(null)
    setState('analyzing')
    setStepIdx(0)

    // Start step timer animation (independent from API call)
    stepTimers.current.forEach(clearTimeout)
    stepTimers.current = []
    for (let i = 1; i <= 3; i++) {
      const tid = setTimeout(() => setStepIdx(i), i * 900)
      stepTimers.current.push(tid)
    }

    try {
      const formData = new FormData()
      formData.append('photo_front', photo)
      formData.append('language', language)

      const result = await analyzeShoppingAdvisor(formData)

      // Clear remaining timers so we don't advance past current
      stepTimers.current.forEach(clearTimeout)
      stepTimers.current = []
      setStepIdx(3) // show all done

      // Aggiorna quota locale dopo la chiamata
      if (result.remaining_day != null) {
        setQuota(prev => prev ? {
          ...prev,
          shopping_remaining_day:  result.remaining_day,
          shopping_remaining_week: result.remaining_week,
        } : prev)
      }

      const a = result.analysis
      setAnalysis(a)
      setTmpPaths({
        tmp_front: result.tmp_front,
        tmp_back:  result.tmp_back,
        tmp_label: result.tmp_label,
      })

      const compatResult = computeCompatibility(a, garments)
      setCompat(compatResult)

      // Small delay so user sees step 4 complete briefly
      setTimeout(() => setState('results'), 400)

    } catch (err) {
      stepTimers.current.forEach(clearTimeout)
      stepTimers.current = []
      if (err?.response?.status === 429) {
        setQuotaExhausted(true)
      } else {
        setError(t('shoppingError'))
      }
      setState('idle')
    }
  }, [photo, language, garments, t])

  // ── Add to wardrobe ────────────────────────────────────────────────────────
  const handleAddToWardrobe = useCallback(async () => {
    if (!analysis || !tmpPaths || adding) return
    setAdding(true)
    try {
      const payload = {
        ...analysis,
        tmp_front: tmpPaths.tmp_front,
        tmp_back:  tmpPaths.tmp_back,
        tmp_label: tmpPaths.tmp_label,
        language,
      }
      const result = await confirmGarment(payload)
      addGarment(result)
      setAdded(true)
    } catch (err) {
      setError(t('shoppingError'))
    } finally {
      setAdding(false)
    }
  }, [analysis, tmpPaths, adding, language, addGarment, t])

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => { stepTimers.current.forEach(clearTimeout) }
  }, [])

  // ── Verdict helper ─────────────────────────────────────────────────────────
  const getVerdict = (score) => {
    if (score >= 8) return { label: t('shoppingVerdictGreat'),   color: '#22c55e' }
    if (score >= 5) return { label: t('shoppingVerdictConsider'), color: '#f59e0b' }
    return             { label: t('shoppingVerdictSkip'),        color: '#ef4444' }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const wardrobeStat = t('shoppingWardrobeStat', garments.length, outfits.length)
  const catLabel = analysis
    ? (categoryLabels[analysis.category] || analysis.category || '')
    : ''

  // ══════════════════════════════════════════════════════════════════════════
  // IDLE state
  // ══════════════════════════════════════════════════════════════════════════
  if (state === 'idle') {
    return (
      <div style={{ padding: isModal ? '24px 28px' : '32px 36px', maxWidth: 680, margin: '0 auto' }}>
        {/* Tutorial solo quando è pagina standalone */}
        {!isModal && <PageTutorial pageId="shopping" steps={getShoppingTour(language)} />}

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <h1 style={{
                fontSize: isModal ? 20 : 24, fontWeight: 800, letterSpacing: '-0.04em',
                color: 'var(--text)', margin: 0, marginBottom: 6,
              }}>
                {t('shoppingTitle')}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                {t('shoppingSubtitle')}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{
                padding: '5px 12px', borderRadius: 20,
                background: 'var(--primary-dim)', border: '1px solid var(--primary-border)',
                fontSize: 11, color: 'var(--primary-light)', fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                {wardrobeStat}
              </div>
              {isModal && (
                <button
                  onClick={onClose}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: '1px solid var(--border)', background: 'var(--card)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-dim)', fontSize: 16, flexShrink: 0,
                  }}
                  aria-label="Chiudi"
                >×</button>
              )}
            </div>
          </div>
        </div>

        {/* Banner quota shopping */}
        {quotaExhausted ? (
          <QuotaBanner style={{ marginBottom: 16 }} />
        ) : quota != null && (() => {
          const remDay  = quota.shopping_remaining_day  ?? quota.shopping_limit_day  ?? 0
          const limDay  = quota.shopping_limit_day  ?? 1
          const isExhausted = remDay <= 0
          const isLow = remDay === 1 && !isExhausted
          if (isExhausted) {
            return <QuotaBanner style={{ marginBottom: 16 }} />
          }
          if (isLow) {
            return (
              <div style={{
                marginBottom: 16, padding: '9px 14px', borderRadius: 10,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                fontSize: 12, color: '#f59e0b',
              }}>
                {language === 'en' ? '1 shopping analysis remaining today.' : '1 analisi Shopping rimasta oggi.'}
              </div>
            )
          }
          if (remDay < limDay && remDay > 1) {
            return (
              <div style={{
                marginBottom: 16, padding: '7px 14px', borderRadius: 10,
                background: 'var(--card)', border: '1px solid var(--border)',
                fontSize: 12, color: 'var(--text-dim)',
              }}>
                {language === 'en'
                  ? `${remDay} shopping analyses left today.`
                  : `${remDay} analisi Shopping rimaste oggi.`}
              </div>
            )
          }
          return null
        })()}

        {/* Drop zone */}
        <div
          data-pagetour="shopping-dropzone"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !preview && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--primary)' : preview ? 'var(--primary-border)' : 'var(--border)'}`,
            borderRadius: 16,
            background: dragOver ? 'var(--primary-dim)' : preview ? 'var(--card)' : 'var(--surface)',
            padding: preview ? 0 : '48px 32px',
            cursor: preview ? 'default' : 'pointer',
            transition: 'border-color 0.2s, background 0.2s',
            overflow: 'hidden',
            minHeight: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {preview ? (
            /* Photo preview */
            <div style={{ width: '100%', position: 'relative' }}>
              <img
                src={preview}
                alt="preview"
                style={{
                  width: '100%', maxHeight: 340, objectFit: 'contain',
                  display: 'block',
                }}
              />
              {/* Change photo overlay */}
              <button
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                style={{
                  position: 'absolute', top: 10, right: 10,
                  background: 'rgba(0,0,0,0.55)', border: 'none',
                  borderRadius: 8, padding: '6px 12px',
                  color: 'white', fontSize: 12, cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {t('shoppingChangePhoto')}
              </button>
            </div>
          ) : (
            /* Empty drop zone */
            <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'var(--primary-dim)',
                border: '1px solid var(--primary-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="var(--primary-light)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                {t('shoppingDropzone')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
                {t('shoppingDropzoneHint')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {t('shoppingOrClick')}
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#fca5a5', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Analyze button */}
        <button
          className="btn btn-primary"
          disabled={!photo}
          onClick={handleAnalyze}
          style={{
            marginTop: 18, width: '100%',
            padding: '13px', fontSize: 15, fontWeight: 700,
            opacity: photo ? 1 : 0.45,
            cursor: photo ? 'pointer' : 'not-allowed',
            letterSpacing: '-0.01em',
          }}
        >
          {t('shoppingAnalyzeBtn')}
        </button>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ANALYZING state
  // ══════════════════════════════════════════════════════════════════════════
  if (state === 'analyzing') {
    return (
      <div style={{ padding: '32px 36px', maxWidth: 680, margin: '0 auto' }}>
        <div data-pagetour="shopping-analyzing">
          <h1 style={{
            fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em',
            color: 'var(--text)', margin: '0 0 28px',
          }}>
            {t('shoppingAnalyzing')}
          </h1>

          <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
            {/* Thumbnail */}
            {preview && (
              <div style={{
                flexShrink: 0,
                width: 120, height: 150,
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                background: 'var(--card)',
              }}>
                <img
                  src={preview}
                  alt="capo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            {/* Steps */}
            <div style={{ flex: 1 }}>
              <AnalyzingSteps currentStep={stepIdx} labels={STEP_LABELS} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESULTS state
  // ══════════════════════════════════════════════════════════════════════════
  if (state === 'results' && analysis && compat) {
    const verdict = getVerdict(compat.score)

    return (
      <div style={{ padding: isModal ? '24px 28px' : '32px 36px', maxWidth: 760, margin: '0 auto' }}>
        {!isModal && <PageTutorial pageId="shopping" steps={getShoppingTour(language)} />}

        <div data-pagetour="shopping-results">

          {/* ── Top section: photo + score ──────────────────────────────── */}
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', marginBottom: 28 }}>

            {/* Photo */}
            {preview && (
              <div style={{
                flexShrink: 0,
                width: 150, height: 190,
                borderRadius: 14,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                background: 'var(--card)',
              }}>
                <img
                  src={preview}
                  alt={analysis.name || 'capo'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            {/* Info detected + score */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* AI detected badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 10px', borderRadius: 20,
                background: 'var(--primary-dim)',
                border: '1px solid var(--primary-border)',
                fontSize: 11, color: 'var(--primary-light)', fontWeight: 600,
                marginBottom: 10,
              }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                {t('shoppingDetected')}
              </div>

              {/* Name */}
              <h2 style={{
                fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em',
                color: 'var(--text)', margin: '0 0 4px',
              }}>
                {analysis.name || catLabel}
              </h2>

              {/* Category + brand row */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {catLabel && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 20,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    fontSize: 12, color: 'var(--text-muted)', fontWeight: 500,
                  }}>
                    {catLabel}
                  </span>
                )}
                {analysis.brand && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 20,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    fontSize: 12, color: 'var(--text-muted)', fontWeight: 500,
                  }}>
                    {analysis.brand}
                  </span>
                )}
                {analysis.color_primary && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 20,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    fontSize: 12, color: 'var(--text-muted)', fontWeight: 500,
                  }}>
                    {analysis.color_hex && (
                      <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: analysis.color_hex,
                        border: '1px solid rgba(255,255,255,0.15)',
                        flexShrink: 0,
                      }} />
                    )}
                    {analysis.color_primary}
                  </span>
                )}
                {analysis.material && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 20,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    fontSize: 12, color: 'var(--text-muted)', fontWeight: 500,
                  }}>
                    {analysis.material}
                  </span>
                )}
              </div>

              {/* Style tags */}
              {Array.isArray(analysis.style_tags) && analysis.style_tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {analysis.style_tags.map((tag, i) => (
                    <span key={i} style={{
                      padding: '2px 9px', borderRadius: 20,
                      background: 'var(--primary-dim)',
                      border: '1px solid var(--primary-border)',
                      fontSize: 11, color: 'var(--primary-light)',
                    }}>
                      {tag}
                    </span>
                  ))}
                  {Array.isArray(analysis.season_tags) && analysis.season_tags.map((tag, i) => (
                    <span key={`s${i}`} style={{
                      padding: '2px 9px', borderRadius: 20,
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      fontSize: 11, color: 'var(--text-dim)',
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Score ring + verdict */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                <ScoreRing score={compat.score} />
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                    {t('shoppingScoreLabel')}
                  </div>
                  <div style={{
                    fontSize: 20, fontWeight: 800,
                    color: verdict.color,
                    letterSpacing: '-0.03em',
                  }}>
                    {verdict.label}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Stats row ────────────────────────────────────────────────── */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
            marginBottom: 24,
          }}>
            {[
              { value: `+${compat.newCombos}`, label: t('shoppingNewOutfits') },
              { value: compat.styleMatches.length, label: t('shoppingStyleMatches') },
              { value: compat.similarInWardrobe.length, label: t('shoppingSimilarLabel') },
            ].map((stat, i) => (
              <div key={i} className="card" style={{
                textAlign: 'center', padding: '16px 12px',
              }}>
                <div style={{
                  fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em',
                  color: 'var(--text)', marginBottom: 4,
                }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* ── Si abbina con ─────────────────────────────────────────────── */}
          {compat.styleMatches.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>
                {t('shoppingCompatible')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {compat.styleMatches.slice(0, 4).map((g) => (
                  <div key={g.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {g.photo_front ? (
                      <img
                        src={imgUrl(g.photo_front)}
                        alt={g.name || g.category}
                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <div style={{
                        width: '100%', aspectRatio: '1',
                        background: 'var(--surface)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-dim)', fontSize: 24,
                      }}>
                        👕
                      </div>
                    )}
                    <div style={{ padding: '8px 8px 10px' }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--text)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {g.name || categoryLabels[g.category] || g.category}
                      </div>
                      {g.brand && (
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                          {g.brand}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Già in armadio warning ────────────────────────────────────── */}
          {compat.similarInWardrobe.length >= 3 && (
            <div style={{
              marginBottom: 20,
              padding: '14px 16px',
              borderRadius: 12,
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', marginBottom: 2 }}>
                  {t('shoppingAlreadyHave')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t('shoppingAlreadyHaveDesc', compat.similarInWardrobe.length, catLabel)}
                </div>
              </div>
            </div>
          )}

          {/* ── Riempie un vuoto ─────────────────────────────────────────── */}
          {compat.fillsGap && (
            <div style={{
              marginBottom: 20,
              padding: '14px 16px',
              borderRadius: 12,
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.25)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>
                  {t('shoppingFillsGap')}
                </div>
              </div>
            </div>
          )}

          {/* ── Action buttons ────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
            {!added ? (
              <button
                className="btn btn-primary"
                disabled={adding}
                onClick={handleAddToWardrobe}
                style={{
                  flex: 1, padding: '12px', fontSize: 14, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: adding ? 0.7 : 1,
                }}
              >
                {adding && <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
                {t('shoppingAddToWardrobe')}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => navigate('/wardrobe')}
                style={{ flex: 1, padding: '12px', fontSize: 14, fontWeight: 700 }}
              >
                {t('shoppingAdded')} →
              </button>
            )}
            <button
              className="btn btn-ghost"
              onClick={resetAll}
              style={{ padding: '12px 20px', fontSize: 14, fontWeight: 600 }}
            >
              {t('shoppingNewAnalysis')}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 12,
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#fca5a5', fontSize: 13,
            }}>
              {error}
            </div>
          )}

        </div>
      </div>
    )
  }

  return null
}
