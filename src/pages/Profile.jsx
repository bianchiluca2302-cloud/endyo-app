import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useWardrobeStore from '../store/wardrobeStore'
import { uploadAvatar, uploadFacePhoto, uploadProfilePicture, analyzeArmocromia, imgUrl } from '../api/client'
import useAuthStore from '../store/authStore'
import { useT } from '../i18n'
import useSettingsStore from '../store/settingsStore'
import useIsMobile from '../hooks/useIsMobile'
import { IconUser, IconSmile, IconCamera } from '../components/Icons'
import PageTutorial from '../components/PageTutorial'

// ── Palette colori per stagione cromatica ─────────────────────────────────────
const SEASON_DATA = {
  'primavera chiara':  { accent: '#E8926A', swatches: ['#FBB98A','#F4A261','#F0D080','#87CEEB','#A8D8B0','#F9C0A8'] },
  'primavera calda':   { accent: '#D47830', swatches: ['#E8B020','#D47030','#C8A058','#7A9840','#F0A070','#C87848'] },
  'estate chiara':     { accent: '#9BAEC8', swatches: ['#DEB8C8','#A8C0D8','#C0B0D0','#D8A8B8','#C0A0B8','#A8C4CC'] },
  'estate fredda':     { accent: '#7890A8', swatches: ['#B88898','#7890A8','#9878A8','#6890A0','#9080B0','#C0A8BC'] },
  'autunno caldo':     { accent: '#B85020', swatches: ['#B85020','#988048','#588060','#C07030','#986848','#B06840'] },
  'autunno scuro':     { accent: '#802030', swatches: ['#802030','#4A5830','#703020','#906810','#2A5040','#7A3820'] },
  'inverno freddo':    { accent: '#3060A0', swatches: ['#3878B0','#C01870','#102048','#E8F0F8','#C01830','#502878'] },
  'inverno scuro':     { accent: '#400840', swatches: ['#600850','#101828','#102048','#104828','#680828','#084838'] },
}

function normalizeSeason(s) {
  return (s || '').toLowerCase().trim()
}

// ── Componente risultato armocromia ───────────────────────────────────────────
function ArmocromiaResultCard({ season, notes, lang, compact = false }) {
  const key  = normalizeSeason(season)
  const data = SEASON_DATA[key] || { accent: 'var(--primary)', swatches: [] }

  return (
    <div style={{
      borderRadius: 14,
      border: `1px solid ${data.accent}55`,
      background: `${data.accent}0D`,
      overflow: 'hidden',
    }}>
      {/* Header stagione */}
      <div style={{
        padding: compact ? '10px 14px 8px' : '14px 18px 12px',
        borderBottom: `1px solid ${data.accent}33`,
        background: `${data.accent}18`,
      }}>
        <div style={{ fontSize: compact ? 10 : 11, color: data.accent, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
          {lang === 'en' ? 'Your colour season' : 'La tua stagione cromatica'}
        </div>
        <div style={{ fontSize: compact ? 15 : 18, fontWeight: 800, color: data.accent,
          letterSpacing: '-0.02em' }}>
          {season}
        </div>
      </div>

      {/* Palette colori */}
      {data.swatches.length > 0 && (
        <div style={{ padding: compact ? '10px 14px 8px' : '14px 18px 10px',
          borderBottom: `1px solid ${data.accent}22` }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            {lang === 'en' ? 'Your palette' : 'La tua palette'}
          </div>
          <div style={{ display: 'flex', gap: compact ? 6 : 8 }}>
            {data.swatches.map((color, i) => (
              <div key={i} style={{
                flex: 1,
                height: compact ? 28 : 36,
                borderRadius: 8,
                background: color,
                boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
              }} title={color} />
            ))}
          </div>
        </div>
      )}

      {/* Note / spiegazione */}
      {notes && (
        <div style={{ padding: compact ? '8px 14px 10px' : '12px 18px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
            {lang === 'en' ? 'Analysis' : 'Analisi'}
          </div>
          <p style={{ fontSize: compact ? 11 : 12, color: 'var(--text-muted)',
            lineHeight: 1.65, margin: 0 }}>
            {notes}
          </p>
        </div>
      )}
    </div>
  )
}

const getProfileTour = (lang) => lang === 'en' ? [
  {
    title: 'Body measurements',
    body: 'Add your measurements for more accurate size and fit advice from the AI Stylist.',
    target: '[data-pagetour="profile-measurements"]',
    position: 'bottom',
  },
  {
    title: 'Colour Season (Premium)',
    body: 'Upload a face photo and the AI identifies your chromatic season for personalised colour advice.',
    target: '[data-pagetour="profile-armocromia"]',
    position: 'top',
    cta: 'Got it →',
  },
] : [
  {
    title: 'Misure corporee',
    body: 'Aggiungi le misure per ricevere consigli di taglia e vestibilità più precisi dallo Stylist AI.',
    target: '[data-pagetour="profile-measurements"]',
    position: 'bottom',
  },
  {
    title: 'Armocromia (Premium)',
    body: 'Carica una foto del viso e l\'AI identifica la tua stagione cromatica per consigli sui colori personalizzati.',
    target: '[data-pagetour="profile-armocromia"]',
    position: 'top',
    cta: 'Capito →',
  },
]

const STYLES = ['casual', 'formal', 'sportivo', 'elegante', 'streetwear', 'vintage', 'minimal', 'rock']

// ── Avatar Crop Modal ─────────────────────────────────────────────────────────
function AvatarCropModal({ file, onConfirm, onCancel }) {
  const canvasRef   = useRef(null)
  const imgRef      = useRef(null)
  const [offset,    setOffset]    = useState({ x: 0, y: 0 })
  const [scale,     setScale]     = useState(1)
  const [minScale,  setMinScale]  = useState(1)   // calcolato dopo il caricamento dell'immagine
  const [dragging,  setDragging]  = useState(false)
  const [startPos,  setStartPos]  = useState({ x: 0, y: 0 })
  const [imgLoaded, setImgLoaded] = useState(false)
  const [objectUrl, setObjectUrl] = useState(null)

  const SIZE = 280   // diameter of crop circle

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Calcola il minimo di scala: l'immagine deve coprire il cerchio su almeno 2 bordi paralleli.
  // Formula "cover": minScale = max(1, naturalWidth / naturalHeight)
  //   - Immagine landscape: il limite è l'altezza (tocca top+bottom per prima)
  //   - Immagine portrait:  il limite è la larghezza (tocca left+right per prima)
  //   - Immagine quadrata:  minScale = 1
  const computeMinScale = useCallback(() => {
    const img = imgRef.current
    if (!img || !img.naturalWidth || !img.naturalHeight) return 1
    return Math.max(1, img.naturalWidth / img.naturalHeight)
  }, [])

  const handleMouseDown = (e) => {
    e.preventDefault()
    setDragging(true)
    setStartPos({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }

  // Calcola i limiti di spostamento: l'immagine non deve mai lasciare spazio vuoto nel cerchio
  const clampOffset = useCallback((rawX, rawY, currentScale) => {
    const img = imgRef.current
    const displayW = SIZE * currentScale
    const displayH = img && img.naturalWidth
      ? (img.naturalHeight / img.naturalWidth) * displayW
      : displayW
    const maxX = Math.max(0, (displayW - SIZE) / 2)
    const maxY = Math.max(0, (displayH - SIZE) / 2)
    return {
      x: Math.max(-maxX, Math.min(maxX, rawX)),
      y: Math.max(-maxY, Math.min(maxY, rawY)),
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return
    const raw = { x: e.clientX - startPos.x, y: e.clientY - startPos.y }
    setOffset(clampOffset(raw.x, raw.y, scale))
  }, [dragging, startPos, scale, clampOffset])
  const handleMouseUp = () => setDragging(false)

  // Quando l'immagine è caricata: calcola minScale e imposta lo zoom iniziale
  const handleImageLoad = useCallback(() => {
    const ms = computeMinScale()
    setMinScale(ms)
    setScale(ms)          // parte già al minimo (immagine copre il cerchio di misura)
    setOffset({ x: 0, y: 0 })
    setImgLoaded(true)
  }, [computeMinScale])

  // Re-clamp offset ogni volta che lo zoom cambia (zoom-out potrebbe esporre spazio vuoto)
  useEffect(() => {
    if (!imgLoaded) return
    setOffset(prev => clampOffset(prev.x, prev.y, scale))
  }, [scale, imgLoaded, clampOffset])

  // Impedisce che scale scenda sotto minScale (sicurezza extra)
  const handleScaleChange = useCallback((newScale) => {
    setScale(Math.max(minScale, newScale))
  }, [minScale])

  const handleConfirm = () => {
    const canvas = document.createElement('canvas')
    canvas.width  = 320
    canvas.height = 320
    const ctx = canvas.getContext('2d')
    // clip to circle
    ctx.beginPath()
    ctx.arc(160, 160, 160, 0, Math.PI * 2)
    ctx.clip()

    const img = imgRef.current
    if (!img) return
    const naturalW = img.naturalWidth
    const naturalH = img.naturalHeight
    const displayW = SIZE * scale
    const displayH = (naturalH / naturalW) * displayW
    const sx = (offset.x + SIZE / 2 - displayW / 2) / displayW * naturalW * -1
    const sy = (offset.y + SIZE / 2 - displayH / 2) / displayH * naturalH * -1
    const sw = naturalW * (SIZE / displayW)
    const sh = naturalH * (SIZE / displayH)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 320, 320)

    canvas.toBlob(blob => {
      if (blob) onConfirm(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 20, padding: '28px 28px 24px',
          maxWidth: 380, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          border: '1px solid var(--border)',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.02em' }}>
          Posiziona la foto
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
          Trascina l'immagine per centrarla nel cerchio, poi usa lo zoom per regolare.
        </p>

        {/* Crop area */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              width: SIZE, height: SIZE,
              borderRadius: '50%',
              overflow: 'hidden',
              position: 'relative',
              cursor: dragging ? 'grabbing' : 'grab',
              border: '3px solid var(--primary)',
              boxShadow: '0 0 0 4px rgba(108,63,199,0.2)',
              background: 'var(--card)',
              userSelect: 'none',
            }}
          >
            {objectUrl && (
              <img
                ref={imgRef}
                src={objectUrl}
                alt="crop"
                onLoad={handleImageLoad}
                draggable={false}
                style={{
                  position: 'absolute',
                  width: `${100 * scale}%`,
                  height: 'auto',
                  left: `calc(50% + ${offset.x}px)`,
                  top: `calc(50% + ${offset.y}px)`,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  opacity: imgLoaded ? 1 : 0,
                  transition: 'opacity 0.2s',
                }}
              />
            )}
          </div>
        </div>

        {/* Zoom slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>Zoom</span>
          <input
            type="range"
            min={minScale}
            max={3}
            step={0.01}
            value={scale}
            onChange={e => handleScaleChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--primary)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 34, textAlign: 'right', flexShrink: 0 }}>
            {Math.round(scale * 100)}%
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            className="btn btn-ghost"
            style={{ flex: 1 }}
          >Annulla</button>
          <button
            onClick={handleConfirm}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >Salva foto</button>
        </div>
      </div>
    </div>
  )
}

// ── Componente embeddabile (usato in Settings) ────────────────────────────────
export function ProfileContent() {
  const t             = useT()
  const lang          = useSettingsStore(s => s.language) || 'it'
  const isMobile      = useIsMobile()
  const navigate      = useNavigate()
  const profile       = useWardrobeStore(s => s.profile)
  const updateProfile = useWardrobeStore(s => s.updateProfile)
  const patchProfile  = useWardrobeStore(s => s.patchProfile)
  const loadProfile   = useWardrobeStore(s => s.loadProfile)

  const [form,      setForm]      = useState({})
  const [isEditing, setIsEditing] = useState(false)
  const [saving,    setSaving]    = useState(false)

  const [uploadingPic, setUploadingPic] = useState(false)
  const [picErr,       setPicErr]       = useState(null)
  const [cropFile,     setCropFile]     = useState(null)

  const [uploading, setUploading] = useState({ body: false, face1: false, face2: false })
  const [uploadErr, setUploadErr] = useState({ body: null, face1: null, face2: null })

  const user = useAuthStore(s => s.user)
  const isPremium = user?.plan && user.plan !== 'free'

  const [analyzingArmocromia, setAnalyzingArmocromia] = useState(false)
  const [armocromiaErr,       setArmocromiaErr]       = useState(null)
  // Risultato locale per visualizzazione immediata post-analisi
  const [localArmocromia,    setLocalArmocromia]     = useState(null)

  const picRef   = useRef(null)
  const face1Ref = useRef(null)

  useEffect(() => {
    setForm(profile)
    const hasData = !!(profile.name || profile.gender || (profile.style_preferences || []).length)
    setIsEditing(!hasData)
  }, [profile])

  const setField = (key, val) => {
    if (!isEditing) return
    setForm(f => ({ ...f, [key]: val }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateProfile({
        name: form.name,
        bio: form.bio || null,
        gender: form.gender,
        style_preferences: form.style_preferences,
        // misure corporee
        height_cm:         form.height_cm         ? Number(form.height_cm)         : null,
        weight_kg:         form.weight_kg         ? Number(form.weight_kg)         : null,
        chest_cm:          form.chest_cm          ? Number(form.chest_cm)          : null,
        waist_cm:          form.waist_cm          ? Number(form.waist_cm)          : null,
        hips_cm:           form.hips_cm           ? Number(form.hips_cm)           : null,
        shoulder_width_cm: form.shoulder_width_cm ? Number(form.shoulder_width_cm) : null,
        arm_length_cm:     form.arm_length_cm     ? Number(form.arm_length_cm)     : null,
        leg_length_cm:     form.leg_length_cm     ? Number(form.leg_length_cm)     : null,
        neck_cm:           form.neck_cm           ? Number(form.neck_cm)           : null,
        thigh_cm:          form.thigh_cm          ? Number(form.thigh_cm)          : null,
        shoe_size:         form.shoe_size         ? Number(form.shoe_size)         : null,
      })
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = () => {
    setForm(profile)
    setIsEditing(true)
  }

  // Apre il crop modal prima di caricare
  const handleProfilePicSelect = (file) => {
    if (!file) return
    setCropFile(file)
  }

  // Carica foto profilo pubblica dopo crop
  const handleProfilePic = async (croppedFile) => {
    setCropFile(null)
    setUploadingPic(true)
    setPicErr(null)
    try {
      await uploadProfilePicture(croppedFile)
      await loadProfile()
    } catch {
      setPicErr(t('profilePhotoErr'))
    } finally {
      setUploadingPic(false)
    }
  }

  // Carica foto try-on
  const handleUpload = async (type, file) => {
    if (!file) return
    setUploading(u => ({ ...u, [type]: true }))
    setUploadErr(e => ({ ...e, [type]: null }))
    try {
      if (type === 'body')  await uploadAvatar(file)
      if (type === 'face1') await uploadFacePhoto(1, file)
      if (type === 'face2') await uploadFacePhoto(2, file)
      await loadProfile()
    } catch {
      setUploadErr(e => ({ ...e, [type]: t('profileUploadErr') }))
    } finally {
      setUploading(u => ({ ...u, [type]: false }))
    }
  }

  const picUrl = profile.profile_picture ? imgUrl(profile.profile_picture) : null

  const handleAnalyze = async () => {
    setAnalyzingArmocromia(true)
    setArmocromiaErr(null)
    try {
      const res = await analyzeArmocromia()
      // 1) Salva in stato locale — visualizzazione immediata garantita
      setLocalArmocromia({
        season: res.armocromia_season,
        notes:  res.armocromia_notes,
      })
      // 2) Aggiorna lo store (senza chiamare POST /profile che non gestisce questi campi)
      patchProfile({
        armocromia_season: res.armocromia_season,
        armocromia_notes:  res.armocromia_notes,
      })
    } catch (e) {
      setArmocromiaErr(
        e?.response?.data?.detail ||
        (lang === 'en' ? 'Analysis failed. Try again.' : 'Analisi fallita. Riprova.')
      )
    } finally {
      setAnalyzingArmocromia(false)
    }
  }

  // Stagione e note da mostrare: locale (post-analisi) oppure da store (caricato da server)
  const displaySeason = localArmocromia?.season || profile.armocromia_season || ''
  const displayNotes  = localArmocromia?.notes  || profile.armocromia_notes  || ''

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        {t('profileSubtitle')}
      </p>

      {/* ── Foto profilo (Instagram-style) ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">{t('profilePhotoTitle')}</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          {t('profilePhotoDesc')}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Cerchio anteprima stile Instagram */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div
              onClick={() => !uploadingPic && picRef.current?.click()}
              style={{
                width: 90, height: 90, borderRadius: '50%',
                border: picUrl
                  ? '3px solid var(--primary)'
                  : '2px dashed var(--border)',
                background: picUrl ? 'transparent' : 'var(--surface)',
                cursor: uploadingPic ? 'wait' : 'pointer',
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.2s',
                position: 'relative',
              }}
            >
              {picUrl ? (
                <img
                  src={picUrl}
                  alt={t('profilePhotoAlt')}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ color: 'var(--text-dim)', opacity: 0.35 }}>
                  <IconUser size={32} />
                </div>
              )}
              {uploadingPic && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div className="spinner" style={{ width: 20, height: 20 }} />
                </div>
              )}
            </div>

          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {picUrl ? t('profilePhotoUploaded') : t('profilePhotoNone')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 8 }}>
              {t('profilePhotoHint')}
            </div>
            {picUrl && (
              <button
                onClick={() => picRef.current?.click()}
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '4px 12px' }}
              >{t('profilePhotoChange')}</button>
            )}
            {picErr && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{picErr}</div>}
          </div>
        </div>

        <input
          ref={picRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { handleProfilePicSelect(e.target.files?.[0]); e.target.value = '' }}
        />

        {/* Modale crop */}
        {cropFile && (
          <AvatarCropModal
            file={cropFile}
            onConfirm={handleProfilePic}
            onCancel={() => setCropFile(null)}
          />
        )}
      </div>

      {/* ── Identità ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">{t('profileIdentityTitle')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('profileNameLabel')}</label>
            {isEditing ? (
              <input
                className="input"
                placeholder={t('profileNamePlaceholder')}
                value={form.name || ''}
                onChange={e => setField('name', e.target.value)}
                style={{ width: '100%' }}
              />
            ) : (
              <div style={{ fontSize: 14, fontWeight: 500, padding: '8px 0', color: form.name ? 'var(--text)' : 'var(--text-dim)' }}>
                {form.name || '—'}
              </div>
            )}
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('profileGenderLabel')}</label>
            {isEditing ? (
              <div style={{ display: 'flex', gap: 8 }}>
                {[['maschio', 'M Maschio'], ['femmina', 'F Femmina'], ['altro', '∅ Altro']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setField('gender', val)}
                    className={`category-chip ${form.gender === val ? 'active' : ''}`}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 14, fontWeight: 500, padding: '8px 0', color: form.gender ? 'var(--text)' : 'var(--text-dim)' }}>
                {form.gender
                  ? ({ maschio: t('profileGenderMale'), femmina: t('profileGenderFemale'), altro: t('profileGenderOther') }[form.gender] || form.gender)
                  : '—'}
              </div>
            )}
          </div>
        </div>

        {/* Bio */}
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Bio</label>
          {isEditing ? (
            <textarea
              className="input"
              placeholder="Racconta qualcosa di te e del tuo stile…"
              value={form.bio || ''}
              onChange={e => setField('bio', e.target.value)}
              rows={3}
              maxLength={200}
              style={{ width: '100%', resize: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
            />
          ) : (
            <div style={{
              fontSize: 13, color: form.bio ? 'var(--text)' : 'var(--text-dim)',
              lineHeight: 1.6, padding: '8px 0',
            }}>
              {form.bio || '—'}
            </div>
          )}
        </div>
      </div>

      {/* ── Stile ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">{t('profileStyleTitle')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STYLES.map(s => {
            const active = (form.style_preferences || []).includes(s)
            return (
              <button
                key={s}
                onClick={() => {
                  if (!isEditing) return
                  const curr = form.style_preferences || []
                  setField('style_preferences', active ? curr.filter(x => x !== s) : [...curr, s])
                }}
                className={`category-chip ${active ? 'active' : ''}`}
                style={{
                  cursor: isEditing ? 'pointer' : 'default',
                  opacity: !isEditing && !active ? 0.4 : 1,
                }}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Misure corporee ── */}
      <div className="card" data-pagetour="profile-measurements" style={{ marginBottom: 24 }}>
        <div className="section-title">{t('profileMeasurementsTitle')}</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          {t('profileMeasurementsDesc')}
        </p>

        {/* Griglia uniforme 3 colonne — stessa struttura in view e edit */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <MeasureInput label={t('profileMeasureHeight')}   unit="cm" field="height_cm"         form={form} isEditing={isEditing} setField={setField} step="1"   />
          <MeasureInput label={t('profileMeasureWeight')}   unit="kg" field="weight_kg"         form={form} isEditing={isEditing} setField={setField} step="0.5" />
          <MeasureInput label={t('profileMeasureShoeSize')} unit=""   field="shoe_size"         form={form} isEditing={isEditing} setField={setField} step="0.5" />
          <MeasureInput label={t('profileMeasureChest')}    unit="cm" field="chest_cm"          form={form} isEditing={isEditing} setField={setField} />
          <MeasureInput label={t('profileMeasureWaist')}    unit="cm" field="waist_cm"          form={form} isEditing={isEditing} setField={setField} />
          <MeasureInput label={t('profileMeasureHips')}     unit="cm" field="hips_cm"           form={form} isEditing={isEditing} setField={setField} />
          <MeasureInput label={t('profileMeasureShoulder')} unit="cm" field="shoulder_width_cm" form={form} isEditing={isEditing} setField={setField} />
          <MeasureInput label={t('profileMeasureLeg')}      unit="cm" field="leg_length_cm"     form={form} isEditing={isEditing} setField={setField} />
          <MeasureInput label={t('profileMeasureArm')}      unit="cm" field="arm_length_cm"     form={form} isEditing={isEditing} setField={setField} />
          <MeasureInput label={t('profileMeasureThigh')}    unit="cm" field="thigh_cm"          form={form} isEditing={isEditing} setField={setField} />
          <MeasureInput label={t('profileMeasureNeck')}     unit="cm" field="neck_cm"           form={form} isEditing={isEditing} setField={setField} />
        </div>

        {/* Stato vuoto */}
        {!isEditing && !form.height_cm && !form.chest_cm && (
          <div style={{
            marginTop: 16, padding: '10px 14px',
            background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: 8, fontSize: 12, color: 'var(--text-muted)',
          }}>
            {t('profileMeasurementsEmpty')}
          </div>
        )}
      </div>

      {/* ── Azioni ── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 24 }}>
        {isEditing ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
            style={{ minWidth: 160 }}
          >
            {saving ? t('profileSaving') : t('profileSave')}
          </button>
        ) : (
          <button
            onClick={handleEdit}
            className="btn btn-ghost"
            style={{ minWidth: 160 }}
          >
            {t('profileEdit')}
          </button>
        )}
      </div>

      {/* ── Armocromia (Premium) ── */}
      <div data-pagetour="profile-armocromia" style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{t('profileArmocromiaTitle')}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
            padding: '2px 7px', borderRadius: 10,
            background: 'rgba(245,158,11,0.12)', color: 'var(--primary)',
            border: '1px solid rgba(245,158,11,0.30)',
          }}>{t('profileArmocromiaPremium')}</span>
        </div>

        {!isPremium ? (
          /* ── Upgrade prompt per utenti Free ── */
          <div style={{
            padding: '18px 20px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {t('profileArmocromiaUpgradeTitle')}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
              {t('profileArmocromiaUpgradeDesc')}
            </p>
            <button
              onClick={() => navigate('/premium')}
              className="btn btn-primary"
              style={{ fontSize: 13, padding: '8px 20px', alignSelf: 'flex-start', cursor: 'pointer' }}
            >
              {t('profileArmocromiaUpgradeBtn')}
            </button>
          </div>
        ) : (
          /* ── Sezione armocromia per utenti Premium ── */
          <div>
            {isMobile ? (
              /* ── Layout mobile: foto piccola a sx + risultato/tasto a dx ── */
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

                  {/* Foto compatta */}
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div
                      onClick={() => !uploading.face1 && face1Ref.current?.click()}
                      style={{
                        width: 88, height: 88, borderRadius: 12,
                        border: `2px dashed ${profile.face_photo_1 ? 'var(--primary)' : 'var(--border)'}`,
                        overflow: 'hidden', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--card)', position: 'relative',
                      }}
                    >
                      {profile.face_photo_1
                        ? <img src={imgUrl(profile.face_photo_1)} alt="face" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <IconSmile size={26} style={{ opacity: 0.3 }} />
                      }
                      {uploading.face1 && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                          {t('profileUploading')}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.3, maxWidth: 88 }}>
                      {t('profileArmocromiaPhotoHint')}
                    </div>
                    {profile.face_photo_1 && (
                      <button onClick={() => face1Ref.current?.click()} className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>
                        {t('profilePhotoChangeSmall')}
                      </button>
                    )}
                    <input ref={face1Ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleUpload('face1', e.target.files?.[0])} />
                  </div>

                  {/* Risultato + tasto */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {displaySeason ? (
                      <ArmocromiaResultCard
                        season={displaySeason}
                        notes={displayNotes}
                        lang={lang}
                        compact
                      />
                    ) : (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                        {t('profileArmocromiaDesc')}
                      </p>
                    )}

                    {armocromiaErr && (
                      <div style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 11, color: '#ef4444' }}>
                        {armocromiaErr}
                      </div>
                    )}

                    <button
                      className="btn btn-primary"
                      disabled={analyzingArmocromia || !profile.face_photo_1}
                      onClick={handleAnalyze}
                      style={{ fontSize: 12, padding: '8px 12px', width: '100%' }}
                      title={!profile.face_photo_1 ? (lang === 'en' ? 'Upload a face photo first' : 'Carica prima una foto del viso') : undefined}
                    >
                      {analyzingArmocromia
                        ? t('profileArmocromiaAnalyzing')
                        : displaySeason
                          ? t('profileArmocromiaReanalyze')
                          : t('profileArmocromiaAnalyzeBtn')
                      }
                    </button>
                  </div>
                </div>
            ) : (
              /* ── Layout desktop: verticale esteso ── */
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
                    {t('profileArmocromiaDesc')}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <PhotoSlot
                      label={t('profileArmocromiaPhotoLabel')}
                      hint={t('profileArmocromiaPhotoHint')}
                      icon={<IconSmile size={32} />}
                      photo={profile.face_photo_1}
                      uploading={uploading.face1}
                      error={uploadErr.face1}
                      inputRef={face1Ref}
                      onChange={f => handleUpload('face1', f)}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {displaySeason && (
                        <ArmocromiaResultCard
                          season={displaySeason}
                          notes={displayNotes}
                          lang={lang}
                        />
                      )}
                      {armocromiaErr && (
                        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#ef4444' }}>
                          {armocromiaErr}
                        </div>
                      )}
                      <button
                        className="btn btn-primary"
                        disabled={analyzingArmocromia || !profile.face_photo_1}
                        onClick={handleAnalyze}
                        style={{ alignSelf: 'flex-start', fontSize: 13 }}
                        title={!profile.face_photo_1 ? (lang === 'en' ? 'Upload a face photo first' : 'Carica prima una foto del viso') : undefined}
                      >
                        {analyzingArmocromia
                          ? t('profileArmocromiaAnalyzing')
                          : displaySeason
                            ? t('profileArmocromiaReanalyze')
                            : t('profileArmocromiaAnalyzeBtn')
                        }
                      </button>
                    </div>
                  </div>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/// ── Helper: campo numerico misura ────────────────────────────────────────────
function MeasureInput({ label, unit, field, form, isEditing, setField, step = '1' }) {
  const val = form?.[field]
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
        {label}{unit ? ` (${unit})` : ''}
      </label>
      {isEditing ? (
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            step={step}
            min="0"
            max={field === 'height_cm' ? '250' : field === 'weight_kg' ? '300' : field === 'shoe_size' ? '55' : '200'}
            className="input"
            style={{ paddingRight: unit ? 34 : 12, width: '100%' }}
            value={val ?? ''}
            onChange={e => setField(field, e.target.value === '' ? null : e.target.value)}
            placeholder="—"
          />
          {unit && (
            <span style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11, color: 'var(--text-dim)', pointerEvents: 'none',
            }}>{unit}</span>
          )}
        </div>
      ) : (
        /* Stessa altezza dell'input per evitare layout shift */
        <div style={{
          fontSize: 13, fontWeight: val ? 500 : 400,
          color: val ? 'var(--text)' : 'var(--text-dim)',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0 12px',
          height: 38,
          display: 'flex', alignItems: 'center',
          gap: 4,
          opacity: val ? 1 : 0.5,
        }}>
          {val
            ? <><span style={{ fontVariantNumeric: 'tabular-nums' }}>{val}</span>{unit && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 2 }}>{unit}</span>}</>
            : '—'
          }
        </div>
      )}
    </div>
  )
}

// ── Pagina standalone (mantiene la route /profile funzionante) ────────────────
export default function Profile() {
  const t        = useT()
  const language = useSettingsStore(s => s.language) || 'it'
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const PROFILE_TOUR = getProfileTour(language)
  return (
    <div style={{
      padding: isMobile ? '20px 16px' : '32px 40px 60px',
      paddingBottom: isMobile
        ? 'calc(env(safe-area-inset-bottom, 0px) + 130px)'
        : '60px',
    }}>
      {/* ── Back button mobile (identico a Settings) ── */}
      {isMobile && (
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--primary-light)', fontSize: 15, fontWeight: 600,
            padding: '0 0 20px', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          {language === 'en' ? 'Back' : 'Indietro'}
        </button>
      )}
      {!isMobile && <PageTutorial pageId="profile" steps={PROFILE_TOUR} />}
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {!isMobile && <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{t('profilePageTitle')}</h1>}
        <ProfileContent />
      </div>
    </div>
  )
}

// ── Componente slot foto ──────────────────────────────────────────────────────
function PhotoSlot({ label, hint, icon, photo, uploading, error, inputRef, onChange, required }) {
  const t = useT()
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
        {label} {required && <span style={{ color: '#f87171' }}>*</span>}
      </div>

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          height: 160,
          borderRadius: 10,
          overflow: 'hidden',
          border: `2px dashed ${photo ? 'var(--primary)' : 'var(--border)'}`,
          background: photo ? 'var(--card)' : 'var(--surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          position: 'relative',
          transition: 'border-color 0.2s',
          marginBottom: 8,
        }}
      >
        {photo ? (
          <img src={imgUrl(photo)} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ opacity: 0.3, marginBottom: 6, display: 'flex', justifyContent: 'center' }}>{icon}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('profileUploadClick')}</div>
          </div>
        )}

        {uploading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: 'white',
          }}>
            {t('profileUploading')}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => onChange(e.target.files?.[0])}
      />

      <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>{hint}</div>
      {error && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{error}</div>}

      {photo && !uploading && (
        <button
          onClick={() => inputRef.current?.click()}
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: '4px 10px', marginTop: 6, width: '100%' }}
        >
          {t('profilePhotoChangeSmall')}
        </button>
      )}
    </div>
  )
}
