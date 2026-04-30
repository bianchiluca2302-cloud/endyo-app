import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeGarment, confirmGarment, imgUrl } from '../api/client'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { useT, useCategoryLabels, useUploadCategories, useTagTranslator } from '../i18n'

/* ── CameraCapture — modale fotocamera getUserMedia con torcia ────────────────
 *  Usa la fotocamera posteriore (environment), attiva il flash (torch) se
 *  disponibile, blocca l'orientamento in ritratto, e restituisce il file
 *  catturato come oggetto File JPEG.
 * ─────────────────────────────────────────────────────────────────────────── */
function CameraCapture({ label, onCapture, onClose }) {
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)
  const trackRef   = useRef(null)
  const [torchOn,  setTorchOn]  = useState(false)
  const [torchOk,  setTorchOk]  = useState(false)  // il dispositivo supporta torch
  const [ready,    setReady]    = useState(false)
  const [err,      setErr]      = useState(null)

  // Avvia lo stream al mount
  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        // Prima prova con fotocamera posteriore esplicita
        let stream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          })
        } catch {
          // Fallback senza 'exact' (es. dispositivi con una sola fotocamera)
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          })
        }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        trackRef.current = track

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // Controlla supporto torch
        const caps = track.getCapabilities?.() ?? {}
        if (caps.torch) {
          setTorchOk(true)
          // Attiva il flash di default se disponibile
          try {
            await track.applyConstraints({ advanced: [{ torch: true }] })
            setTorchOn(true)
          } catch {}
        }

        setReady(true)
      } catch (e) {
        if (!cancelled) setErr(e.name === 'NotAllowedError' ? 'Permesso fotocamera negato' : 'Fotocamera non disponibile')
      }
    }

    startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const toggleTorch = useCallback(async () => {
    if (!trackRef.current) return
    const next = !torchOn
    try {
      await trackRef.current.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch {}
  }, [torchOn])

  const capture = useCallback(async () => {
    if (!videoRef.current || !ready) return
    const video   = videoRef.current
    const canvas  = document.createElement('canvas')
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      // Spegni il flash prima di chiudere
      if (torchOn && trackRef.current) {
        trackRef.current.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {})
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
      onCapture(file)
    }, 'image/jpeg', 0.92)
  }, [ready, torchOn, onCapture])

  const handleClose = () => {
    if (torchOn && trackRef.current) {
      trackRef.current.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {})
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: '#000', display: 'flex', flexDirection: 'column',
    }}>
      {/* Video feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ flex: 1, width: '100%', objectFit: 'cover' }}
      />

      {/* Errore */}
      {err && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 32, background: '#000',
        }}>
          <span style={{ fontSize: 40 }}>📷</span>
          <div style={{ fontSize: 15, color: '#fff', textAlign: 'center' }}>{err}</div>
          <button onClick={handleClose} style={{
            padding: '12px 28px', borderRadius: 12, border: 'none',
            background: 'var(--primary)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>Chiudi</button>
        </div>
      )}

      {/* Overlay UI: label + controlli */}
      {!err && (
        <>
          {/* Intestazione */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            padding: 'calc(env(safe-area-inset-top, 16px) + 8px) 16px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)',
          }}>
            <button onClick={handleClose} style={{
              background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff',
              borderRadius: 99, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>✕</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '0.03em' }}>{label}</span>
            {/* Toggle flash */}
            {torchOk ? (
              <button onClick={toggleTorch} style={{
                background: torchOn ? '#f59e0b' : 'rgba(0,0,0,0.4)',
                border: 'none', color: torchOn ? '#000' : '#fff',
                borderRadius: 99, width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 18,
              }}>⚡</button>
            ) : <div style={{ width: 36 }} />}
          </div>

          {/* Guida inquadratura */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '65%', aspectRatio: '3/4',
            border: '2px solid rgba(255,255,255,0.35)',
            borderRadius: 16, pointerEvents: 'none',
          }} />

          {/* Pulsante scatto */}
          <div style={{
            position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 24px) + 24px)',
            left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
          }}>
            <button
              onClick={capture}
              disabled={!ready}
              style={{
                width: 72, height: 72, borderRadius: '50%',
                background: ready ? '#fff' : 'rgba(255,255,255,0.4)',
                border: '4px solid rgba(255,255,255,0.6)',
                cursor: ready ? 'pointer' : 'not-allowed',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: ready ? '#fff' : 'rgba(255,255,255,0.4)' }} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Duplicate check (same as Upload.jsx) ────────────────────────────────────── */
function findDuplicates(analysis, garments) {
  const cat   = analysis.category
  const brand = (analysis.brand || '').toLowerCase().trim()
  const color = (analysis.color_primary || '').toLowerCase().trim()
  const name  = (analysis.name || '').toLowerCase().trim()
  return garments.filter(g => {
    if (g.category !== cat) return false
    const sameBrand = !!(brand && (g.brand||'').toLowerCase().trim() === brand)
    const sameColor = !!(color && (g.color_primary||'').toLowerCase().trim() === color)
    const sameName  = !!(name  && ((g.name||'').toLowerCase().includes(name) || name.includes((g.name||'').toLowerCase())))
    return sameBrand && sameColor && sameName
  })
}

/* ── Icons ───────────────────────────────────────────────────────────────────── */
const CameraIcon = () => (
  <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)

const CheckIcon = () => (
  <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
)

const ChevronIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6"/>
  </svg>
)

/* ── Photo slot ──────────────────────────────────────────────────────────────── */
function PhotoSlot({ label, preview, onChange, required, small, style: extraStyle = {} }) {
  const [showCamera, setShowCamera] = useState(false)
  const galleryRef = useRef(null)

  // Usa getUserMedia se disponibile (controllo flash, orientamento); altrimenti file input nativo
  const hasGetUserMedia = !!(navigator.mediaDevices?.getUserMedia)

  const handleClick = () => {
    if (hasGetUserMedia) {
      setShowCamera(true)
    } else {
      galleryRef.current?.click()
    }
  }

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          borderRadius: small ? 14 : 20,
          border: `2px dashed ${preview ? 'var(--primary-border)' : 'var(--border)'}`,
          background: preview ? 'transparent' : 'var(--card)',
          cursor: 'pointer',
          overflow: 'hidden',
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: small ? 5 : 8,
          WebkitTapHighlightColor: 'transparent',
          transition: 'border-color 0.2s',
          ...extraStyle,
        }}
      >
        {preview ? (
          <img src={preview} alt={label}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <>
            <div style={{ color: required ? 'var(--primary-light)' : 'var(--text-dim)', opacity: small ? 0.7 : 1 }}>
              {small
                ? <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                : <CameraIcon />
              }
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: small ? 11 : 14, fontWeight: 600, color: required ? 'var(--text)' : 'var(--text-muted)' }}>
                {label}
              </div>
              {required && (
                <div style={{ fontSize: 11, color: 'var(--primary-light)', marginTop: 2 }}>Obbligatoria</div>
              )}
            </div>
          </>
        )}
        {/* Fallback: input galleria (nessun capture, solo libreria) */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files[0]
            if (f) onChange(f)
            e.target.value = ''   // reset per permettere ri-selezione
          }}
        />
      </div>

      {/* Modal fotocamera custom */}
      {showCamera && (
        <CameraCapture
          label={label}
          onCapture={file => { onChange(file); setShowCamera(false) }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </>
  )
}

/* ── Analyzing / Confirming spinner ─────────────────────────────────────────── */
function LoadingScreen({ title, subtitle }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32,
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'var(--primary-dim)',
        border: '1px solid var(--primary-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>{subtitle}</div>
      </div>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────────── */
export default function MobileUpload() {
  const navigate    = useNavigate()
  const addGarment  = useWardrobeStore(s => s.addGarment)
  const garments    = useWardrobeStore(s => s.garments)
  const language    = useSettingsStore(s => s.language || 'it')
  const t           = useT()
  const CATEGORIES  = useUploadCategories()
  const CATEGORY_LABELS = useCategoryLabels()
  const translateTag    = useTagTranslator()

  const [photos,    setPhotos]   = useState({ front: null, back: null, label: null })
  const [previews,  setPreviews] = useState({ front: null, back: null, label: null })
  const [category,  setCategory] = useState('')
  const [loading,   setLoading]  = useState(false)
  const [error,     setError]    = useState(null)
  const [step,      setStep]     = useState('upload')
  const [analysis,  setAnalysis] = useState(null)
  const [tmpFiles,  setTmpFiles] = useState(null)
  const [duplicates, setDuplicates] = useState([])
  const [result,    setResult]   = useState(null)
  const [showCatSheet, setShowCatSheet] = useState(false)

  const handleFile = (type, file) => {
    if (!file) return
    setPhotos(p => ({ ...p, [type]: file }))
    setPreviews(p => ({ ...p, [type]: URL.createObjectURL(file) }))
  }

  const handleAnalyze = async () => {
    if (!photos.front) { setError('Aggiungi almeno la foto frontale'); return }
    setError(null); setLoading(true); setStep('analyzing')
    try {
      const fd = new FormData()
      fd.append('photo_front', photos.front)
      if (photos.back)  fd.append('photo_back',  photos.back)
      if (photos.label) fd.append('photo_label', photos.label)
      if (category)     fd.append('category',    category)
      fd.append('language', language)
      const data = await analyzeGarment(fd)
      setAnalysis(data.analysis)
      setTmpFiles({ tmp_front: data.tmp_front, tmp_back: data.tmp_back, tmp_label: data.tmp_label })
      setDuplicates(findDuplicates(data.analysis, garments))
      setStep('review')
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
      setStep('upload')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    setLoading(true); setStep('confirming')
    try {
      const garment = await confirmGarment({ ...tmpFiles, analysis, category: analysis.category })
      addGarment(garment)
      setResult(garment)
      setStep('done')
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
      setStep('review')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setPhotos({ front: null, back: null, label: null })
    setPreviews({ front: null, back: null, label: null })
    setCategory(''); setResult(null); setAnalysis(null)
    setTmpFiles(null); setDuplicates([]); setError(null); setStep('upload')
  }

  /* ── STEP: analyzing ─────────────────────────────────────────────────────── */
  if (step === 'analyzing') return (
    <LoadingScreen title="Analisi in corso…" subtitle="L'AI sta riconoscendo brand, colore, categoria e stagione" />
  )

  /* ── STEP: confirming ────────────────────────────────────────────────────── */
  if (step === 'confirming') return (
    <LoadingScreen title="Salvataggio…" subtitle="Stiamo aggiungendo il capo al tuo armadio" />
  )

  /* ── STEP: done ──────────────────────────────────────────────────────────── */
  if (step === 'done' && result) return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 28, gap: 20, background: 'var(--bg)',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981',
      }}>
        <CheckIcon />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>Capo aggiunto!</div>
        <div style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 6 }}>{result.name}</div>
      </div>

      {/* Summary card */}
      <div style={{
        width: '100%', background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18, padding: '16px 20px',
      }}>
        {[
          [CATEGORY_LABELS[result.category] || result.category, 'Categoria'],
          [result.brand || '—', 'Brand'],
          [result.color_primary || '—', 'Colore'],
          [result.size || '—', 'Taglia'],
        ].map(([v, k]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{k}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <button onClick={handleReset} style={{
          flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          Aggiungi altro
        </button>
        <button onClick={() => navigate('/wardrobe')} style={{
          flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
          background: 'var(--primary)', color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          Armadio
        </button>
      </div>
    </div>
  )

  /* ── STEP: review ────────────────────────────────────────────────────────── */
  if (step === 'review' && analysis) return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 100px', background: 'var(--bg)' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4, color: 'var(--text)' }}>
        Controlla i dati
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
        L'AI ha analizzato il tuo capo. Verifica e salva.
      </p>

      {/* Foto + dati AI */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        {previews.front && (
          <div style={{ width: 100, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: 'var(--card)', aspectRatio: '3/4' }}>
            <img src={previews.front} alt="fronte" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{analysis.name}</div>
          {[
            [CATEGORY_LABELS[analysis.category] || analysis.category, 'Categoria'],
            [analysis.brand || '—', 'Brand'],
            [analysis.color_primary || '—', 'Colore'],
            [analysis.size || '—', 'Taglia'],
          ].map(([v, k]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      {(analysis.style_tags || analysis.season_tags) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {[...(analysis.style_tags || []), ...(analysis.season_tags || [])].map(tag => (
            <span key={tag} style={{
              padding: '4px 10px', borderRadius: 99,
              background: 'var(--primary-dim)', border: '1px solid var(--primary-border)',
              color: 'var(--primary-light)', fontSize: 12, fontWeight: 600,
            }}>{translateTag(tag)}</span>
          ))}
        </div>
      )}

      {/* Avviso duplicato */}
      {duplicates.length > 0 && (
        <div style={{
          background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 14, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, color: '#fbbf24', lineHeight: 1.5,
        }}>
          ⚠️ Hai già un capo simile nell'armadio: <strong>{duplicates[0].name}</strong>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* Azioni */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleReset} style={{
          flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          Riprendi
        </button>
        <button onClick={handleConfirm} disabled={loading} style={{
          flex: 2, padding: '14px 0', borderRadius: 14, border: 'none',
          background: 'var(--primary)', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}>
          Salva nell'armadio
        </button>
      </div>
    </div>
  )

  /* ── STEP: upload ────────────────────────────────────────────────────────── */
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 100px', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
      }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 4 }}>
          Aggiungi capo
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
          Scatta o carica una foto — l'AI fa il resto
        </p>
      </div>

      {/* Griglia foto: principale a sx, retro+etichetta a dx */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 8,
        marginBottom: 14,
        height: 'clamp(220px, 38dvh, 300px)',
      }}>
        {/* Foto frontale — occupa entrambe le righe */}
        <PhotoSlot
          label="Foto frontale"
          preview={previews.front}
          onChange={f => handleFile('front', f)}
          required
          style={{ gridRow: '1 / 3', height: '100%', borderRadius: 20 }}
        />
        {/* Retro */}
        <PhotoSlot
          label="Retro"
          preview={previews.back}
          onChange={f => handleFile('back', f)}
          small
          style={{ height: '100%' }}
        />
        {/* Etichetta */}
        <PhotoSlot
          label="Etichetta"
          preview={previews.label}
          onChange={f => handleFile('label', f)}
          small
          style={{ height: '100%' }}
        />
      </div>

      {/* Categoria (opzionale) */}
      <button
        onClick={() => setShowCatSheet(true)}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 14,
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', marginBottom: 20, WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: category ? 'var(--primary-dim)' : 'var(--card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={category ? 'var(--primary-light)' : 'var(--text-dim)'} strokeWidth={2} strokeLinecap="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 1 }}>Categoria (opzionale)</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: category ? 'var(--text)' : 'var(--text-muted)' }}>
              {category ? (CATEGORY_LABELS[category] || category) : 'Lascia scegliere all\'AI'}
            </div>
          </div>
        </div>
        <ChevronIcon />
      </button>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleAnalyze}
        disabled={!photos.front || loading}
        style={{
          width: '100%', padding: '16px', borderRadius: 16, border: 'none',
          background: photos.front ? 'var(--primary)' : 'var(--primary-dim)',
          color: photos.front ? 'white' : 'var(--text-dim)',
          fontSize: 16, fontWeight: 700, cursor: photos.front ? 'pointer' : 'not-allowed',
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        Analizza con AI
      </button>

      {/* Category sheet overlay */}
      {showCatSheet && (
        <div
          onClick={() => setShowCatSheet(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 800, display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: 'var(--surface)',
              borderRadius: '24px 24px 0 0',
              padding: '12px 0 calc(env(safe-area-inset-bottom,0px) + 20px)',
              maxHeight: '75dvh', overflowY: 'auto',
            }}
          >
            {/* Handle */}
            <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--border)', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', padding: '0 20px 12px' }}>Scegli categoria</div>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => { setCategory(cat.value); setShowCatSheet(false) }}
                style={{
                  width: '100%', padding: '14px 20px', background: 'transparent',
                  border: 'none', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: '1px solid var(--border)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ fontSize: 15, color: category === cat.value ? 'var(--primary-light)' : 'var(--text)', fontWeight: category === cat.value ? 600 : 400 }}>
                  {cat.label}
                </span>
                {category === cat.value && (
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--primary-light)" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
