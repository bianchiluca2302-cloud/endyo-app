import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useSettingsStore from '../store/settingsStore'
import useIsMobile from '../hooks/useIsMobile'
import useWardrobeStore from '../store/wardrobeStore'
import useAuthStore from '../store/authStore'
import {
  ACCENT_COLORS, THEMES, CURRENCIES, LANGUAGES,
  SHOE_SIZE_SYSTEMS, CLOTHING_SIZE_SYSTEMS, STYLIST_TONES,
} from '../store/settingsStore'
import { useT } from '../i18n'
import { fetchChatQuota, authDeleteAccount, startUploadPackCheckout, checkUsernameAvailable, updateUsername, updatePhone, updateMarketingConsent } from '../api/client'
import {
  IconAlertTriangle, IconStar, IconCalendar, IconRefreshCw, IconCheck,
  IconLightbulb, IconPalette, IconGlobe,
  IconRuler, IconSparkle, IconUser, IconDatabase, IconInfo,
} from '../components/Icons'

// ── Accordion section ─────────────────────────────────────────────────────────
function Section({ id, icon, title, openId, onToggle, children }) {
  const isOpen = openId === id

  return (
    <div style={{
      marginBottom: 8,
      border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`,
      borderRadius: 12, overflow: 'hidden',
      transition: 'border-color 0.25s',
    }}>
      {/* Header cliccabile */}
      <button
        onClick={() => onToggle(id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: isOpen ? 'var(--primary-dim)' : 'var(--card)',
          border: 'none', cursor: 'pointer',
          transition: 'background 0.25s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            color: isOpen ? 'var(--primary-light)' : 'var(--text-dim)',
            display: 'flex', alignItems: 'center',
            transition: 'color 0.25s',
          }}>{icon}</span>
          <span style={{
            fontSize: 14, fontWeight: 700,
            color: isOpen ? 'var(--primary-light)' : 'var(--text)',
            letterSpacing: '-0.01em',
            transition: 'color 0.25s',
          }}>{title}</span>
        </div>
        <span style={{
          fontSize: 11, color: 'var(--text-dim)',
          display: 'inline-block',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}>▾</span>
      </button>

      {/* Contenuto con animazione smooth */}
      <div style={{
        display: 'grid',
        gridTemplateRows: isOpen ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{
            padding: '16px',
            display: 'flex', flexDirection: 'column', gap: 12,
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'translateY(0)' : 'translateY(-6px)',
            transition: 'opacity 0.22s ease, transform 0.28s ease',
          }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, desc, children, stack = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: stack ? 'flex-start' : 'center',
      flexDirection: stack ? 'column' : 'row',
      justifyContent: 'space-between',
      gap: stack ? 10 : 16, padding: '10px 14px',
      background: 'var(--card)', borderRadius: 10,
      border: '1px solid var(--border)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0, maxWidth: stack ? '100%' : undefined }}>{children}</div>
    </div>
  )
}

function ChipGroup({ options, value, onChange, getKey = o => o.id, getLabel = o => o.label }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(opt => {
        const k = getKey(opt)
        const active = k === value
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            style={{
              padding: '5px 12px', fontSize: 12, borderRadius: 20,
              border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
              background: active ? 'var(--primary-dim)' : 'transparent',
              color: active ? 'var(--primary-light)' : 'var(--text-muted)',
              cursor: 'pointer', fontWeight: active ? 600 : 400,
              transition: 'var(--transition)',
            }}
          >
            {getLabel(opt)}
          </button>
        )
      })}
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: value ? 'var(--primary)' : 'var(--border)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: 'white',
        transition: 'left 0.2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

// ── Modale "azione irreversibile" ─────────────────────────────────────────────
function IrreversibleModal({ onConfirm, onCancel, t }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 16,
          padding: '28px 32px',
          maxWidth: 420, width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          animation: 'fadeIn 0.18s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: '#f87171' }}>
          <IconAlertTriangle size={36} />
        </div>
        <h3 style={{
          fontSize: 16, fontWeight: 700, color: '#f87171',
          marginBottom: 10, textAlign: 'center',
        }}>
          {t('irreversibleTitle')}
        </h3>
        <p style={{
          fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6,
          textAlign: 'center', marginBottom: 24,
        }}>
          {t('irreversibleText')}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            className="btn btn-ghost"
            style={{ minWidth: 100 }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            style={{
              minWidth: 160,
              padding: '9px 18px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.5)',
              borderRadius: 8,
              color: '#f87171',
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              transition: 'var(--transition)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.28)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)' }}
          >
            {t('irreversibleConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modale eliminazione account ───────────────────────────────────────────────
function DeleteAccountModal({ onSuccess, onCancel, t }) {
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const handleDelete = async () => {
    if (!password) return
    setLoading(true)
    setError(null)
    try {
      await authDeleteAccount(password)
      onSuccess()
    } catch (err) {
      const detail = err?.response?.data?.detail || ''
      if (err?.response?.status === 403 || detail.toLowerCase().includes('password')) {
        setError(t('deleteAccountWrongPassword'))
      } else {
        setError(t('deleteAccountError'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 16,
          padding: '28px 32px',
          maxWidth: 420, width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Icona */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: '#ef4444' }}>
          <IconAlertTriangle size={36} />
        </div>

        {/* Titolo */}
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f87171', marginBottom: 8, textAlign: 'center' }}>
          {t('deleteAccountModalTitle')}
        </h3>

        {/* Descrizione */}
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center', marginBottom: 20 }}>
          {t('deleteAccountModalDesc')}
        </p>

        {/* Campo password */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
            {t('deleteAccountPasswordLabel')}
          </label>
          <input
            type="password"
            className="input"
            placeholder={t('deleteAccountPasswordPlaceholder')}
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null) }}
            onKeyDown={e => e.key === 'Enter' && !loading && handleDelete()}
            autoFocus
            style={{ width: '100%', borderColor: error ? 'rgba(239,68,68,0.5)' : undefined }}
          />
          {error && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconAlertTriangle size={12} /> {error}
            </div>
          )}
        </div>

        {/* Bottoni */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            className="btn btn-ghost"
            style={{ flex: 1 }}
            disabled={loading}
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleDelete}
            disabled={!password || loading}
            style={{
              flex: 1, padding: '9px 18px',
              background: password && !loading ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.45)',
              borderRadius: 8,
              color: password && !loading ? '#f87171' : 'rgba(248,113,113,0.4)',
              fontSize: 13, fontWeight: 600,
              cursor: password && !loading ? 'pointer' : 'not-allowed',
              transition: 'var(--transition)',
            }}
            onMouseEnter={e => { if (password && !loading) e.currentTarget.style.background = 'rgba(239,68,68,0.28)' }}
            onMouseLeave={e => { if (password && !loading) e.currentTarget.style.background = 'rgba(239,68,68,0.18)' }}
          >
            {loading ? t('deleteAccountDeleting') : t('deleteAccountConfirmBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hook: controllo username disponibilità (debounced 400ms) ─────────────────
function useUsernameAvail(username) {
  const [status, setStatus] = useState(null) // null|'checking'|'available'|'taken'|'invalid'
  const timerRef = useRef(null)
  useEffect(() => {
    const v = (username || '').trim().toLowerCase()
    if (!v || v.length < 3) { setStatus(null); return }
    setStatus('checking')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      checkUsernameAvailable(v)
        .then(r => setStatus(r.available ? 'available' : r.reason === 'invalid' ? 'invalid' : 'taken'))
        .catch(() => setStatus(null))
    }, 400)
    return () => clearTimeout(timerRef.current)
  }, [username])
  return status
}

// ── Editor username inline ────────────────────────────────────────────────────
function UsernameEditor({ user, language, onUpdateUser }) {
  const [editing, setEditing]   = useState(false)
  const [value,   setValue]     = useState(user?.username || '')
  const [loading, setLoading]   = useState(false)
  const [error,   setError]     = useState(null)
  const [saved,   setSaved]     = useState(false)
  const status = useUsernameAvail(editing ? value : '')

  const en = language === 'en'
  const hint = {
    null:      value.length > 0 && value.length < 3
                 ? { text: en ? 'Min 3 characters' : 'Almeno 3 caratteri', color: 'var(--text-dim)' }
                 : null,
    invalid:   { text: en ? 'Letters, numbers, _ . - only' : 'Solo lettere, numeri, _ . -', color: '#ef4444' },
    checking:  { text: en ? 'Checking…' : 'Controllo…', color: 'var(--text-dim)' },
    available: { text: '✓ ' + (en ? 'Available' : 'Disponibile'), color: '#22c55e' },
    taken:     { text: '✗ ' + (en ? 'Already taken' : 'Già in uso'), color: '#ef4444' },
  }[status ?? 'null']

  const canSave = status === 'available' && !loading

  const handleSave = async () => {
    if (!canSave) return
    setLoading(true); setError(null)
    try {
      const data = await updateUsername(value.trim().toLowerCase())
      onUpdateUser({ ...user, username: data.username })
      setSaved(true); setEditing(false)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || (en ? 'Error, try again' : 'Errore, riprova'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '10px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Username</div>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
            {user?.username
              ? <span>@{user.username}</span>
              : <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>{en ? 'Not set' : 'Non impostato'}</span>
            }
            {saved && <span style={{ fontSize: 11, color: '#22c55e', marginLeft: 8 }}>✓ {en ? 'Saved' : 'Salvato'}</span>}
          </div>
          <button
            onClick={() => { setEditing(true); setValue(user?.username || ''); setError(null) }}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--primary-light)', cursor: 'pointer', fontWeight: 600,
            }}
          >
            {en ? 'Change' : 'Modifica'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 13, color: 'var(--text-dim)', pointerEvents: 'none',
            }}>@</span>
            <input
              className="input"
              value={value}
              onChange={e => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
              placeholder="username"
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              style={{ paddingLeft: 26, width: '100%' }}
            />
          </div>
          {hint && (
            <div style={{ fontSize: 11, color: hint.color, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              {status === 'checking' && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5, display: 'inline-block' }} />}
              {hint.text}
            </div>
          )}
          {error && <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              onClick={() => { setEditing(false); setError(null) }}
              style={{
                flex: 1, fontSize: 12, padding: '7px 0', borderRadius: 7,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              {en ? 'Cancel' : 'Annulla'}
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={{
                flex: 1, fontSize: 12, padding: '7px 0', borderRadius: 7, border: 'none',
                background: canSave ? 'var(--primary)' : 'var(--border)',
                color: canSave ? '#fff' : 'var(--text-dim)',
                cursor: canSave ? 'pointer' : 'not-allowed', fontWeight: 600,
                transition: 'background 0.2s',
              }}
            >
              {loading ? '…' : (en ? 'Save' : 'Salva')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Editor numero di telefono inline ─────────────────────────────────────────
function PhoneEditor({ user, language, onUpdateUser }) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(user?.phone || '')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [saved,   setSaved]   = useState(false)
  const en = language === 'en'

  const handleSave = async () => {
    setLoading(true); setError(null)
    try {
      const data = await updatePhone(value.trim() || null)
      onUpdateUser({ ...user, phone: data.phone })
      setSaved(true); setEditing(false)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err?.response?.data?.detail || (en ? 'Error, try again' : 'Errore, riprova'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '10px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', marginTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
        {en ? 'Phone number' : 'Numero di telefono'}{' '}
        <span style={{ opacity: 0.6 }}>({en ? 'recovery' : 'recupero account'})</span>
      </div>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
            {user?.phone
              ? <span>{user.phone}</span>
              : <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>{en ? 'Not set' : 'Non impostato'}</span>
            }
            {saved && <span style={{ fontSize: 11, color: '#22c55e', marginLeft: 8 }}>✓ {en ? 'Saved' : 'Salvato'}</span>}
          </div>
          <button
            onClick={() => { setEditing(true); setValue(user?.phone || ''); setError(null) }}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {en ? 'Edit' : 'Modifica'}
          </button>
        </div>
      ) : (
        <div>
          <input
            type="tel"
            className="input"
            value={value}
            onChange={e => { setValue(e.target.value); setError(null) }}
            placeholder="+39 333 1234567"
            autoComplete="tel"
            style={{ width: '100%', marginBottom: 6, fontSize: 13 }}
          />
          {error && <div style={{ fontSize: 11, color: '#f87171', marginBottom: 6 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setEditing(false)} style={{ flex: 1, fontSize: 12, padding: '7px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
              {en ? 'Cancel' : 'Annulla'}
            </button>
            <button onClick={handleSave} disabled={loading} style={{ flex: 1, fontSize: 12, padding: '7px 0', borderRadius: 7, border: 'none', background: 'var(--primary)', color: '#fff', cursor: loading ? 'wait' : 'pointer', fontWeight: 600 }}>
              {loading ? '…' : (en ? 'Save' : 'Salva')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sezione utilizzo Stylist AI ───────────────────────────────────────────────
const PLAN_META = {
  free:                { label: 'Free',         limDay: 2,   limWeek: 8,   shLimDay: 1,  shLimWeek: 4,   arLimWeek: 0,  upLimDay: 10,  upLimWeek: 40,   color: 'var(--text-muted)',  bg: 'var(--bg)',                     border: 'var(--border)',              isPlus: false },
  premium:             { label: 'Premium',      limDay: 30,  limWeek: 120, shLimDay: 5,  shLimWeek: 20,  arLimWeek: 2,  upLimDay: 30,  upLimWeek: 120,  color: 'var(--primary)',     bg: 'rgba(139,92,246,0.08)',          border: 'rgba(139,92,246,0.25)',      isPlus: false },
  premium_annual:      { label: 'Premium',      limDay: 30,  limWeek: 120, shLimDay: 5,  shLimWeek: 20,  arLimWeek: 2,  upLimDay: 30,  upLimWeek: 120,  color: 'var(--primary)',     bg: 'rgba(139,92,246,0.08)',          border: 'rgba(139,92,246,0.25)',      isPlus: false },
  premium_plus:        { label: 'Premium Plus', limDay: 60,  limWeek: 240, shLimDay: 10, shLimWeek: 40,  arLimWeek: 5,  upLimDay: 100, upLimWeek: 400,  color: '#f59e0b',            bg: 'rgba(251,191,36,0.08)',          border: 'rgba(251,191,36,0.3)',       isPlus: true  },
  premium_plus_annual: { label: 'Premium Plus', limDay: 60,  limWeek: 240, shLimDay: 10, shLimWeek: 40,  arLimWeek: 5,  upLimDay: 100, upLimWeek: 400,  color: '#f59e0b',            bg: 'rgba(251,191,36,0.08)',          border: 'rgba(251,191,36,0.3)',       isPlus: true  },
}

function StylistUsage({ language }) {
  const [quota, setQuota]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [packBuying, setPackBuying] = useState(null)  // 's'|'m'|'l'|null

  useEffect(() => {
    fetchChatQuota()
      .then(q => setQuota(q))
      .catch(() => setQuota(null))
      .finally(() => setLoading(false))
  }, [])

  const buyPack = async (pack) => {
    setPackBuying(pack)
    try {
      const data = await startUploadPackCheckout(pack)
      if (data.checkout_url) window.location.href = data.checkout_url
    } catch {
      alert('Errore pagamento. Riprova.')
    } finally {
      setPackBuying(null)
    }
  }

  const L = {
    it: {
      plan:        'Piano',
      annual:      'Annuale',
      daily:       'Oggi',
      weekly:      'Questa settimana',
      used:        'usate',
      of:          'di',
      unlimited:   'Illimitata',
      resetDay:    'Si ripristina ogni giorno a mezzanotte',
      resetWeek:   'Si ripristina ogni lunedì',
      upgradeHint:  'Passa a Premium per aumentare il limite di richieste.',
      loading:      'Caricamento…',
      error:        'Impossibile caricare i dati di utilizzo.',
      stylistLabel: 'Stylist AI',
      shopLabel:    'Shopping Advisor',
      armoLabel:    'Armocromia',
      uploadLabel:  'Upload Vestiti',
      blocked:      'Bloccato (solo Premium)',
      extraCredits: 'Crediti extra',
      buyPack:      'Acquista pacchetto',
      packS:        '40 upload — 2,49€',
      packM:        '100 upload — 4,99€',
      packL:        '300 upload — 9,99€',
      buying:       'Apertura pagamento…',
    },
    en: {
      plan:         'Plan',
      annual:       'Annual',
      daily:        'Today',
      weekly:       'This week',
      used:         'used',
      of:           'of',
      unlimited:    'Unlimited',
      resetDay:     'Resets every day at midnight',
      resetWeek:    'Resets every Monday',
      upgradeHint:  'Upgrade to Premium to increase your request limit.',
      loading:      'Loading…',
      error:        'Unable to load usage data.',
      stylistLabel: 'Stylist AI',
      shopLabel:    'Shopping Advisor',
      armoLabel:    'Colour Season',
      uploadLabel:  'Garment Uploads',
      blocked:      'Locked (Premium only)',
      extraCredits: 'Extra credits',
      buyPack:      'Buy a pack',
      packS:        '40 uploads — €2.49',
      packM:        '100 uploads — €4.99',
      packL:        '300 uploads — €9.99',
      buying:       'Opening payment…',
    },
  }
  const s = L[language] || L.it

  if (loading) return (
    <div style={{ padding: '12px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)' }}>
      {s.loading}
    </div>
  )
  if (!quota) return (
    <div style={{ padding: '12px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)' }}>
      {s.error}
    </div>
  )

  const planKey  = quota.plan || 'free'
  const meta     = PLAN_META[planKey] || PLAN_META.free
  const isAnnual = planKey.endsWith('_annual')
  const isFree   = planKey === 'free'

  // Usa i limiti dell'API (più affidabili degli hard-coded in PLAN_META).
  // Un limite >= 999 viene trattato come "illimitato" → visualizzato come -1.
  const UNLIMITED = 999
  const apiLimDay  = quota.limit_day  ?? meta.limDay
  const apiLimWeek = quota.limit_week ?? meta.limWeek
  const dispLimDay  = apiLimDay  >= UNLIMITED ? -1 : apiLimDay
  const dispLimWeek = apiLimWeek >= UNLIMITED || apiLimWeek === -1 ? -1 : apiLimWeek

  const usedDay  = dispLimDay  !== -1 ? Math.max(0, apiLimDay  - (quota.remaining_day  ?? quota.remaining ?? 0)) : 0
  const usedWeek = dispLimWeek !== -1 ? Math.max(0, apiLimWeek - (quota.remaining_week ?? 0)) : 0

  const pctDay  = dispLimDay  > 0 ? Math.min(100, Math.round((usedDay  / apiLimDay)  * 100)) : 0
  const pctWeek = dispLimWeek > 0 ? Math.min(100, Math.round((usedWeek / apiLimWeek) * 100)) : 0

  // Shopping — usa i limiti restituiti dall'API (quota.shopping_limit_day/week)
  const shLimDay  = quota.shopping_limit_day  ?? meta.shLimDay
  const shLimWeek = quota.shopping_limit_week ?? meta.shLimWeek
  const dispShLimDay  = shLimDay  >= UNLIMITED ? -1 : shLimDay
  const dispShLimWeek = shLimWeek >= UNLIMITED ? -1 : shLimWeek

  const shUsedDay  = dispShLimDay  !== -1 ? Math.max(0, shLimDay  - (quota.shopping_remaining_day  ?? shLimDay))  : 0
  const shUsedWeek = dispShLimWeek !== -1 ? Math.max(0, shLimWeek - (quota.shopping_remaining_week ?? shLimWeek)) : 0
  const shPctDay   = dispShLimDay  > 0 ? Math.min(100, Math.round((shUsedDay  / shLimDay)  * 100)) : 0
  const shPctWeek  = dispShLimWeek > 0 ? Math.min(100, Math.round((shUsedWeek / shLimWeek) * 100)) : 0

  // Armocromia
  const arLimWeek  = quota.armo_limit_week ?? meta.arLimWeek
  const dispArLimWeek = arLimWeek >= UNLIMITED ? -1 : arLimWeek
  const arUsedWeek = dispArLimWeek !== -1 ? Math.max(0, arLimWeek - (quota.armo_remaining_week ?? arLimWeek)) : 0
  const arPctWeek  = dispArLimWeek > 0 ? Math.min(100, Math.round((arUsedWeek / arLimWeek) * 100)) : 0

  // Upload vestiti
  const upLimDay   = quota.upload_limit_day  ?? meta.upLimDay
  const upLimWeek  = quota.upload_limit_week ?? meta.upLimWeek
  const dispUpLimDay  = upLimDay  >= UNLIMITED ? -1 : upLimDay
  const dispUpLimWeek = upLimWeek >= UNLIMITED ? -1 : upLimWeek
  const upUsedDay  = dispUpLimDay  !== -1 ? Math.max(0, upLimDay  - (quota.upload_remaining_day  ?? upLimDay))  : 0
  const upUsedWeek = dispUpLimWeek !== -1 ? Math.max(0, upLimWeek - (quota.upload_remaining_week ?? upLimWeek)) : 0
  const upPctDay   = dispUpLimDay  > 0 ? Math.min(100, Math.round((upUsedDay  / upLimDay)  * 100)) : 0
  const upPctWeek  = dispUpLimWeek > 0 ? Math.min(100, Math.round((upUsedWeek / upLimWeek) * 100)) : 0
  const upExtra    = quota.upload_extra ?? 0

  const barColor = (pct) => pct >= 90 ? '#ef4444' : pct >= 65 ? '#f59e0b' : 'var(--primary)'

  const UsageBar = ({ label, used, limit, pct, resetNote }) => (
    <div style={{ padding: '12px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconCalendar size={13} /> {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {limit === -1 ? s.unlimited : `${used} ${s.of} ${limit} ${s.used}`}
        </span>
      </div>
      {limit !== -1 && (
        <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${pct}%`,
            background: barColor(pct),
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}
      {limit === -1 && (
        <div style={{ height: 6, background: meta.bg, borderRadius: 3, border: `1px solid ${meta.border}` }} />
      )}
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconRefreshCw size={11} /> {resetNote}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Piano badge */}
      <div style={{
        padding: '10px 14px', borderRadius: 10,
        background: meta.bg, border: `1px solid ${meta.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{s.plan}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isAnnual && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#16a34a', background: 'rgba(34,197,94,0.12)', padding: '2px 6px', borderRadius: 99, letterSpacing: '0.04em' }}>
              {s.annual}
            </span>
          )}
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
            background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
            letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {!isFree && <IconStar size={11} />} {meta.label}
          </span>
        </div>
      </div>

      {/* ── Stylist AI ─────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 2px 0' }}>
        {s.stylistLabel}
      </div>
      <UsageBar label={s.daily}  used={usedDay}  limit={dispLimDay}  pct={pctDay}  resetNote={s.resetDay}  />
      <UsageBar label={s.weekly} used={usedWeek} limit={dispLimWeek} pct={pctWeek} resetNote={s.resetWeek} />

      {/* ── Shopping Advisor ─────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 2px 0' }}>
        {s.shopLabel}
      </div>
      <UsageBar label={s.daily}  used={shUsedDay}  limit={dispShLimDay}  pct={shPctDay}  resetNote={s.resetDay}  />
      <UsageBar label={s.weekly} used={shUsedWeek} limit={dispShLimWeek} pct={shPctWeek} resetNote={s.resetWeek} />

      {/* ── Armocromia ───────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 2px 0' }}>
        {s.armoLabel}
      </div>
      {isFree ? (
        <div style={{ padding: '10px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
          🔒 {s.blocked}
        </div>
      ) : (
        <UsageBar label={s.weekly} used={arUsedWeek} limit={dispArLimWeek} pct={arPctWeek} resetNote={s.resetWeek} />
      )}

      {/* ── Upload Vestiti ───────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 2px 0' }}>
        {s.uploadLabel}
      </div>
      <UsageBar label={s.daily} used={upUsedDay} limit={dispUpLimDay} pct={upPctDay} resetNote={s.resetDay} />

      {/* Crediti extra — sezione separata al posto del limite settimanale */}
      <div style={{ padding: '12px 14px', background: upExtra > 0 ? 'rgba(34,197,94,0.06)' : 'var(--card)', borderRadius: 10, border: `1px solid ${upExtra > 0 ? 'rgba(34,197,94,0.2)' : 'var(--border)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconStar size={13} /> {s.extraCredits}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: upExtra > 0 ? '#22c55e' : 'var(--text-dim)' }}>
            {upExtra > 0 ? `+${upExtra}` : '0'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          {language === 'en'
            ? 'Used automatically when your daily limit runs out.'
            : 'Utilizzati automaticamente quando i caricamenti giornalieri sono esauriti.'}
        </div>
      </div>

      {/* Pacchetti upload */}
      <div style={{ padding: '12px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
          {s.buyPack}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { pack: 's', label: s.packS },
            { pack: 'm', label: s.packM },
            { pack: 'l', label: s.packL },
          ].map(({ pack, label }) => (
            <button
              key={pack}
              onClick={() => buyPack(pack)}
              disabled={!!packBuying}
              style={{
                width: '100%', padding: '9px 14px',
                borderRadius: 8, border: '1px solid var(--primary)',
                background: packBuying === pack ? 'var(--primary-dim)' : 'transparent',
                color: 'var(--primary)', fontSize: 13, fontWeight: 600,
                cursor: packBuying ? 'not-allowed' : 'pointer',
                opacity: packBuying && packBuying !== pack ? 0.5 : 1,
                transition: 'background 0.2s, opacity 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>{label}</span>
              {packBuying === pack && <span style={{ fontSize: 11, opacity: 0.7 }}>{s.buying}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Hint upgrade per utenti free */}
      {isFree && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5, padding: '4px 2px', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <IconLightbulb size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {s.upgradeHint}
        </div>
      )}
    </div>
  )
}

// ── Pagina principale ─────────────────────────────────────────────────────────
export default function Settings() {
  const settings       = useSettingsStore()
  const updateSetting  = useSettingsStore(s => s.updateSetting)
  const resetSettings  = useSettingsStore(s => s.resetSettings)
  const garments       = useWardrobeStore(s => s.garments)
  const outfits        = useWardrobeStore(s => s.outfits)
  const removeGarment  = useWardrobeStore(s => s.removeGarment)
  const removeOutfit   = useWardrobeStore(s => s.removeOutfit)
  const clearData      = useWardrobeStore(s => s.clearData)
  const user           = useAuthStore(s => s.user)
  const updateUser     = useAuthStore(s => s.updateUser)
  const logout         = useAuthStore(s => s.logout)
  const navigate       = useNavigate()

  const language = settings.language || 'it'
  const t = useT()
  const isMobile = useIsMobile()

  // Accordion: una sola sezione aperta alla volta (null = tutte chiuse)
  const [openSection, setOpenSection] = useState(null)
  const toggleSection = (id) => setOpenSection(prev => prev === id ? null : id)

  // Stato conferme a catena: null → 'outfits'/'garments'/'all'/'settings'/'logout'
  const [resetConfirm, setResetConfirm] = useState(null)
  // Azione in attesa della conferma modale irreversibile
  const [pendingAction, setPendingAction] = useState(null)
  // Modale eliminazione account
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)

  // Stato feedback toggle marketing: null | 'loading' | 'done'
  const [emailToggleStatus, setEmailToggleStatus] = useState(null)
  const [phoneToggleStatus, setPhoneToggleStatus] = useState(null)

  // ── Prima conferma → modale irreversibile ───────────────────────────────────
  const requestConfirm = (type) => setResetConfirm(type)

  const handleFirstConfirm = (type) => {
    setResetConfirm(null)
    // Il logout non è irreversibile: eseguiamo direttamente senza il modale "azione irreversibile"
    if (type === 'logout') {
      logout()
      clearData()
      navigate('/auth', { replace: true })
    } else {
      setPendingAction(type)
    }
  }

  const handleIrreversibleConfirm = async () => {
    const type = pendingAction
    setPendingAction(null)
    if (type === 'garments') {
      for (const g of garments) await removeGarment(g.id)
    } else if (type === 'outfits') {
      for (const o of outfits) await removeOutfit(o.id)
    } else if (type === 'all') {
      for (const g of garments) await removeGarment(g.id)
      for (const o of outfits) await removeOutfit(o.id)
      resetSettings()
    } else if (type === 'settings') {
      resetSettings()
    } else if (type === 'logout') {
      logout()
      clearData()
      navigate('/auth', { replace: true })
    }
  }

  const handleDeleteAccountSuccess = () => {
    setShowDeleteAccount(false)
    logout()
    clearData()
    navigate('/auth', { replace: true })
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: '100%', overflow: 'auto',
      padding: isMobile ? '20px 16px' : '28px 32px',
      paddingBottom: isMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 130px)' : '60px',
      maxWidth: 760, margin: '0 auto',
      animation: 'slideUp 0.32s ease backwards',
    }}>

      {/* Modale irreversibile */}
      {pendingAction && (
        <IrreversibleModal
          t={t}
          onConfirm={handleIrreversibleConfirm}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {/* Modale eliminazione account */}
      {showDeleteAccount && (
        <DeleteAccountModal
          t={t}
          onSuccess={handleDeleteAccountSuccess}
          onCancel={() => setShowDeleteAccount(false)}
        />
      )}

      {/* Back button su mobile */}
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

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>{t('settings')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {t('settingsDesc')}
        </p>
      </div>

      {/* ── ASPETTO ───────────────────────────────────────────────── */}
      <Section id="appearance" icon={<IconPalette size={18} />} title={t('sectionAppearance')} openId={openSection} onToggle={toggleSection}>

        {/* Colore accent */}
        <div style={{ padding: '12px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 10 }}>
            {t('accentColor')}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {ACCENT_COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => updateSetting('accentColor', c.id)}
                title={c.label}
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: c.hex,
                  border: settings.accentColor === c.id
                    ? `3px solid var(--text)`
                    : '3px solid transparent',
                  cursor: 'pointer',
                  boxShadow: settings.accentColor === c.id ? `0 0 0 2px ${c.hex}` : 'none',
                  transition: 'var(--transition)',
                  transform: settings.accentColor === c.id ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
          </div>
          {settings.accentColor && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
              {t('selectedColor')}: <span style={{ color: 'var(--primary-light)', fontWeight: 600 }}>
                {(() => { const c = ACCENT_COLORS.find(c => c.id === settings.accentColor); return c?.label[language] ?? c?.label.it })()}
              </span>
            </div>
          )}
        </div>

        {/* Temi */}
        <div style={{ padding: '12px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {/* Tema automatico */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {language === 'en' ? 'Automatic' : 'Automatico'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {THEMES.filter(th => th.auto).map(th => (
              <ThemeButton key={th.id} theme={th} active={settings.theme === th.id} onSelect={() => updateSetting('theme', th.id)} language={language} />
            ))}
          </div>
          {/* Temi scuri */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('darkThemes')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {THEMES.filter(th => th.dark && !th.auto).map(th => (
              <ThemeButton key={th.id} theme={th} active={settings.theme === th.id} onSelect={() => updateSetting('theme', th.id)} language={language} />
            ))}
          </div>
          {/* Temi chiari */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('lightThemes')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {THEMES.filter(th => !th.dark && !th.auto).map(th => (
              <ThemeButton key={th.id} theme={th} active={settings.theme === th.id} onSelect={() => updateSetting('theme', th.id)} language={language} />
            ))}
          </div>
        </div>

        <Row label={t('compactCards')} desc={t('compactCardsDesc')}>
          <Toggle value={settings.compactCards} onChange={v => updateSetting('compactCards', v)} />
        </Row>

        <Row label={t('showPrices')} desc={t('showPricesDesc')}>
          <Toggle value={settings.showPrices} onChange={v => updateSetting('showPrices', v)} />
        </Row>
      </Section>

      {/* ── LINGUA E REGIONE ───────────────────────────────────────── */}
      <Section id="language" icon={<IconGlobe size={18} />} title={t('sectionLanguage')} openId={openSection} onToggle={toggleSection}>
        <div style={{ padding: '12px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
            {t('interfaceLanguage')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.5 }}>
            {t('languageNote')}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LANGUAGES.map(l => (
              <button
                key={l.id}
                onClick={() => l.ready && updateSetting('language', l.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 20, fontSize: 12,
                  border: `1px solid ${settings.language === l.id ? 'var(--primary)' : 'var(--border)'}`,
                  background: settings.language === l.id ? 'var(--primary-dim)' : 'transparent',
                  color: settings.language === l.id ? 'var(--primary-light)' : 'var(--text-muted)',
                  cursor: l.ready ? 'pointer' : 'not-allowed',
                  fontWeight: settings.language === l.id ? 600 : 400,
                  opacity: l.ready ? 1 : 0.45,
                  transition: 'var(--transition)',
                }}
              >
                <span>{l.flag}</span> {l.label}
                {!l.ready && (
                  <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>{t('comingSoon')}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <Row label={t('currency')} desc={t('currencyDesc')} stack={isMobile}>
          <ChipGroup
            options={CURRENCIES}
            value={settings.currency}
            onChange={v => updateSetting('currency', v)}
            getLabel={o => `${o.symbol} ${o.id.toUpperCase()}`}
          />
        </Row>
      </Section>

      {/* ── TAGLIE ────────────────────────────────────────────────── */}
      <Section id="sizes" icon={<IconRuler size={18} />} title={t('sectionSizes')} openId={openSection} onToggle={toggleSection}>
        <Row label={t('shoeSize')} desc={t('shoeSizeDesc')} stack={isMobile}>
          <ChipGroup
            options={SHOE_SIZE_SYSTEMS}
            value={settings.shoeSizeSystem}
            onChange={v => updateSetting('shoeSizeSystem', v)}
          />
        </Row>

        <Row label={t('clothingSize')} desc={t('clothingSizeDesc')} stack={isMobile}>
          <ChipGroup
            options={CLOTHING_SIZE_SYSTEMS}
            value={settings.clothingSizeSystem}
            onChange={v => updateSetting('clothingSizeSystem', v)}
          />
        </Row>
      </Section>

      {/* ── AI STYLIST ────────────────────────────────────────────── */}
      <Section id="ai" icon={<IconSparkle size={18} />} title={t('sectionAI')} openId={openSection} onToggle={toggleSection}>
        <div style={{ padding: '12px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 10 }}>
            {t('stylistToneLabel')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STYLIST_TONES.map(tone => (
              <button
                key={tone.id}
                onClick={() => updateSetting('stylistTone', tone.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 8, textAlign: 'left',
                  border: `1px solid ${settings.stylistTone === tone.id ? 'var(--primary)' : 'var(--border)'}`,
                  background: settings.stylistTone === tone.id ? 'var(--primary-dim)' : 'var(--surface)',
                  color: settings.stylistTone === tone.id ? 'var(--primary-light)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'var(--transition)',
                }}
              >
                <div>
                  <span style={{ fontSize: 12, fontWeight: settings.stylistTone === tone.id ? 600 : 400 }}>
                    {tone.label[language] ?? tone.label.it}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>
                    {tone.desc[language] ?? tone.desc.it}
                  </span>
                </div>
                {settings.stylistTone === tone.id && (
                  <span style={{ color: 'var(--primary)', display: 'flex' }}><IconCheck size={14} /></span>
                )}
              </button>
            ))}
          </div>
        </div>

        <Row label={t('autoRemoveBg')} desc={t('autoRemoveBgDesc')}>
          <Toggle value={settings.autoRemoveBg} onChange={v => updateSetting('autoRemoveBg', v)} />
        </Row>
      </Section>

      {/* ── UTILIZZO ─────────────────────────────────────────────── */}
      <Section
        id="usage"
        icon={<IconInfo size={18} />}
        title={language === 'en' ? 'Usage' : 'Utilizzo'}
        openId={openSection}
        onToggle={toggleSection}
      >
        <StylistUsage language={language} />

        {/* Link alla pagina Premium */}
        <a
          href="#/premium"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '9px 14px', borderRadius: 9,
            background: 'var(--primary-dim)', border: '1px solid rgba(139,92,246,0.25)',
            color: 'var(--primary-light)', fontSize: 12, fontWeight: 600,
            textDecoration: 'none', transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {language === 'en' ? 'View Premium plans →' : 'Gestisci piano Premium →'}
        </a>
      </Section>

      {/* ── ACCOUNT ──────────────────────────────────────────────── */}
      <Section id="account" icon={<IconUser size={18} />} title={t('sectionAccount')} openId={openSection} onToggle={toggleSection}>
        {user?.email && (
          <div style={{ padding: '10px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>{t('emailLabel')}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{user.email}</div>
          </div>
        )}

        {/* Username editor */}
        <UsernameEditor user={user} language={language} onUpdateUser={updateUser} />

        {/* Phone editor */}
        <PhoneEditor user={user} language={language} onUpdateUser={updateUser} />

        {/* Logout */}
        <Row label={t('logoutLabel')} desc={t('logoutDesc')}>
          {resetConfirm === 'logout' ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setResetConfirm(null)} className="btn btn-ghost" style={{ fontSize: 11 }}>{t('cancel')}</button>
              <button onClick={() => handleFirstConfirm('logout')} className="btn btn-danger" style={{ fontSize: 11 }}>{t('confirm')}</button>
            </div>
          ) : (
            <button onClick={() => requestConfirm('logout')} className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}>
              {t('logoutBtn')}
            </button>
          )}
        </Row>
      </Section>

      {/* ── DATI, PRIVACY E CONSENSI ─────────────────────────────── */}
      <Section id="data" icon={<IconDatabase size={18} />} title={language === 'en' ? 'Data & Privacy' : 'Dati e privacy'} openId={openSection} onToggle={toggleSection}>

        {/* Cancella outfit */}
        <Row label={t('deleteOutfits')} desc={t('outfitsSaved', outfits.length)}>
          {resetConfirm === 'outfits' ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setResetConfirm(null)} className="btn btn-ghost" style={{ fontSize: 11 }}>{t('cancel')}</button>
              <button onClick={() => handleFirstConfirm('outfits')} className="btn btn-danger" style={{ fontSize: 11 }}>{t('confirm')}</button>
            </div>
          ) : (
            <button onClick={() => requestConfirm('outfits')} className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}>
              {t('deleteBtn')}
            </button>
          )}
        </Row>

        {/* Cancella capi */}
        <Row label={t('deleteGarments')} desc={t('garmentsSaved', garments.length)}>
          {resetConfirm === 'garments' ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setResetConfirm(null)} className="btn btn-ghost" style={{ fontSize: 11 }}>{t('cancel')}</button>
              <button onClick={() => handleFirstConfirm('garments')} className="btn btn-danger" style={{ fontSize: 11 }}>{t('confirm')}</button>
            </div>
          ) : (
            <button onClick={() => requestConfirm('garments')} className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}>
              {t('deleteBtn')}
            </button>
          )}
        </Row>

        {/* Reset completo */}
        <Row label={t('resetAll')} desc={t('resetAllDesc')}>
          {resetConfirm === 'all' ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setResetConfirm(null)} className="btn btn-ghost" style={{ fontSize: 11 }}>{t('cancel')}</button>
              <button onClick={() => handleFirstConfirm('all')} className="btn btn-danger" style={{ fontSize: 11, background: '#7f1d1d' }}>{t('confirmDeleteAll')}</button>
            </div>
          ) : (
            <button onClick={() => requestConfirm('all')} className="btn btn-danger" style={{ fontSize: 12, opacity: 0.8 }}>
              {t('reset')}
            </button>
          )}
        </Row>

        {/* Reset impostazioni */}
        <Row label={t('resetSettings')} desc={t('resetSettingsDesc')}>
          {resetConfirm === 'settings' ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setResetConfirm(null)} className="btn btn-ghost" style={{ fontSize: 11 }}>{t('cancel')}</button>
              <button onClick={() => handleFirstConfirm('settings')} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--primary-light)' }}>{t('confirm')}</button>
            </div>
          ) : (
            <button onClick={() => requestConfirm('settings')} className="btn btn-ghost" style={{ fontSize: 12 }}>
              {t('restore')}
            </button>
          )}
        </Row>

        {/* Separatore */}
        <div style={{ height: 1, background: 'rgba(139,92,246,0.12)', margin: '4px 0' }} />

        {/* Marketing email */}
        <Row
          label={language === 'en' ? 'Promotional emails' : 'Email promozionali'}
          desc={language === 'en' ? 'Receive personalized offers and news via email' : 'Ricevi offerte personalizzate e novità via email'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <div
              onClick={async () => {
                if (emailToggleStatus === 'loading') return
                const newVal = !(user?.marketing_email)
                updateUser({ ...user, marketing_email: newVal })
                setEmailToggleStatus('loading')
                try {
                  await updateMarketingConsent({ marketing_email: newVal })
                  setEmailToggleStatus('done')
                  setTimeout(() => setEmailToggleStatus(null), 2000)
                } catch {
                  updateUser({ ...user, marketing_email: !newVal })
                  setEmailToggleStatus(null)
                }
              }}
              style={{
                width: 44, height: 24, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
                background: user?.marketing_email ? 'var(--primary)' : 'var(--border)',
                position: 'relative', transition: 'background 0.3s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: user?.marketing_email ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              }} />
            </div>
            {emailToggleStatus === 'loading' && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{language === 'en' ? 'saving…' : 'caricamento…'}</span>
            )}
            {emailToggleStatus === 'done' && (
              <span style={{ fontSize: 10, color: '#22c55e' }}>{language === 'en' ? 'saved' : 'completato'}</span>
            )}
          </div>
        </Row>

        {/* Marketing phone */}
        <Row
          label={language === 'en' ? 'SMS / Phone promotions' : 'Promozioni via SMS/telefono'}
          desc={language === 'en' ? 'Receive offers via SMS or phone call' : 'Ricevi offerte tramite SMS o chiamata'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <div
              onClick={async () => {
                if (phoneToggleStatus === 'loading') return
                const newVal = !(user?.marketing_phone)
                updateUser({ ...user, marketing_phone: newVal })
                setPhoneToggleStatus('loading')
                try {
                  await updateMarketingConsent({ marketing_phone: newVal })
                  setPhoneToggleStatus('done')
                  setTimeout(() => setPhoneToggleStatus(null), 2000)
                } catch {
                  updateUser({ ...user, marketing_phone: !newVal })
                  setPhoneToggleStatus(null)
                }
              }}
              style={{
                width: 44, height: 24, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
                background: user?.marketing_phone ? 'var(--primary)' : 'var(--border)',
                position: 'relative', transition: 'background 0.3s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: user?.marketing_phone ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              }} />
            </div>
            {phoneToggleStatus === 'loading' && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{language === 'en' ? 'saving…' : 'caricamento…'}</span>
            )}
            {phoneToggleStatus === 'done' && (
              <span style={{ fontSize: 10, color: '#22c55e' }}>{language === 'en' ? 'saved' : 'completato'}</span>
            )}
          </div>
        </Row>

        {/* Link documenti legali */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: language === 'en' ? 'Terms & Conditions' : 'Termini e Condizioni', url: 'https://endyo.it/terms' },
            { label: language === 'en' ? 'Privacy Policy' : 'Privacy Policy', url: 'https://endyo.it/privacy' },
            { label: language === 'en' ? 'Cookie Policy' : 'Cookie Policy', url: 'https://endyo.it/cookie' },
          ].map(({ label, url }) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: 'var(--card)',
                border: '1px solid var(--border)', borderRadius: 10,
                textDecoration: 'none', color: 'var(--text)',
                fontSize: 13, fontWeight: 500,
              }}
            >
              <span>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>↗</span>
            </a>
          ))}
        </div>

        {user?.terms_accepted_at && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
            {language === 'en' ? 'Terms accepted on' : 'T&C accettati il'}{' '}
            {new Date(user.terms_accepted_at).toLocaleDateString(language === 'en' ? 'en-GB' : 'it-IT')}
          </div>
        )}

        {/* Separatore */}
        <div style={{ height: 1, background: 'rgba(239,68,68,0.15)', margin: '4px 0' }} />

        {/* Elimina account */}
        <Row label={t('deleteAccount')} desc={t('deleteAccountDesc')}>
          <button
            onClick={() => setShowDeleteAccount(true)}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 600,
              borderRadius: 8, cursor: 'pointer',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: '#f87171',
              transition: 'var(--transition)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
          >
            {t('deleteAccountBtn')}
          </button>
        </Row>
      </Section>

      {/* ── INFO ─────────────────────────────────────────────────── */}
      <Section id="info" icon={<IconInfo size={18} />} title={t('sectionInfo')} openId={openSection} onToggle={toggleSection}>
        <div style={{
          padding: '16px', background: 'var(--card)', borderRadius: 10,
          border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {[
            [t('infoApp'),     'Endyo'],
            [t('infoVersion'), '1.0.0'],
            [t('infoWebsite'), 'endyo.it'],
            [t('infoContact'), 'info@endyo.it'],
            [t('infoAI'),      'OpenAI GPT-4o'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)' }}>{k}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', paddingTop: 4 }}>
          {t('infoFooter')}
        </div>
      </Section>

    </div>
  )
}

// ── Bottone tema (senza color-box, testo centrato) ────────────────────────────
function ThemeButton({ theme, active, onSelect, language = 'it' }) {
  const label = typeof theme.label === 'object'
    ? (theme.label[language] ?? theme.label.it)
    : theme.label
  return (
    <button
      onClick={onSelect}
      style={{
        padding: '7px 16px',
        borderRadius: 20,
        fontSize: 12,
        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        background: active ? 'var(--primary-dim)' : 'transparent',
        color: active ? 'var(--primary-light)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
        transition: 'var(--transition)',
        textAlign: 'center',
      }}
    >
      {label}
    </button>
  )
}
