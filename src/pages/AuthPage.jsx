import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { authLogin, authRegister, authForgotPassword, authResendVerification, api } from '../api/client'
import logoUrl from '../assets/logo.png'
import { useT } from '../i18n'

// ── Password strength checker ─────────────────────────────────────────────────
function PasswordStrength({ password }) {
  if (!password) return null
  const checks = [
    { label: 'Almeno 8 caratteri', ok: password.length >= 8 },
    { label: 'Una lettera maiuscola', ok: /[A-Z]/.test(password) },
    { label: 'Un numero',            ok: /[0-9]/.test(password) },
    { label: 'Un carattere speciale',ok: /[^a-zA-Z0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e']
  const color  = colors[score - 1] || '#ef4444'
  return (
    <div style={{ marginTop: -8, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i < score ? color : 'var(--border)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {checks.map(c => (
          <span key={c.label} style={{ fontSize: 11, color: c.ok ? '#22c55e' : 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 10 }}>{c.ok ? '✓' : '○'}</span>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Username availability ─────────────────────────────────────────────────────
function useUsernameCheck(username) {
  const [status, setStatus] = useState(null) // null | 'checking' | 'available' | 'taken' | 'invalid'
  const timerRef = useRef(null)

  useEffect(() => {
    if (!username || username.length < 3) { setStatus(null); return }
    setStatus('checking')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/check-username/${encodeURIComponent(username.toLowerCase())}`)
        if (res.data.reason === 'invalid') setStatus('invalid')
        else setStatus(res.data.available ? 'available' : 'taken')
      } catch {
        setStatus(null)
      }
    }, 500)
    return () => clearTimeout(timerRef.current)
  }, [username])

  return status
}

// ── Helper componente campo input ─────────────────────────────────────────────
function Field({ label, type = 'text', value, onChange, placeholder, error, autoComplete }) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="input"
          style={{
            width: '100%',
            paddingRight: isPassword ? 42 : 14,
            borderColor: error ? 'var(--danger)' : undefined,
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 15, color: 'var(--text-dim)', padding: 0, lineHeight: 1,
            }}
          >
            {show ? '🙈' : '👁'}
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

// ── Bottone primario ──────────────────────────────────────────────────────────
function SubmitBtn({ loading, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="btn btn-primary"
      style={{ width: '100%', padding: '11px 0', fontSize: 14, marginTop: 4 }}
    >
      {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : children}
    </button>
  )
}

// ── Schermata di attesa verifica email ────────────────────────────────────────
function VerifyEmailPending({ email, onResend, onBack }) {
  const t = useT()
  const [sent, setSent] = useState(false)
  const handleResend = async () => {
    await onResend(email)
    setSent(true)
    setTimeout(() => setSent(false), 5000)
  }
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t('authVerifyTitle')}</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
        {t('authVerifyDescBefore')}<br />
        <strong style={{ color: 'var(--text)' }}>{email}</strong>.<br />
        {t('authVerifyDescAfter')}
      </p>
      <div style={{
        padding: '10px 14px', borderRadius: 10, marginBottom: 20,
        background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
        fontSize: 12, color: 'var(--primary-light)', lineHeight: 1.6,
      }}>
        {t('authVerifyHint')}
      </div>
      <button
        onClick={handleResend}
        className="btn btn-ghost"
        style={{ width: '100%', marginBottom: 10 }}
      >
        {sent ? t('authVerifySent') : t('authVerifyResend')}
      </button>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer' }}>
        {t('authBackToLogin')}
      </button>
    </div>
  )
}

// ── Form di Login ─────────────────────────────────────────────────────────────
function LoginForm({ onForgot, onRegister }) {
  const t = useT()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [needsVerify, setNeedsVerify] = useState(false)

  const setAuth    = useAuthStore(s => s.setAuth)
  const navigate   = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) { setError(t('authErrEmailPassword')); return }
    setLoading(true)
    try {
      const data = await authLogin({ email, password, remember_me: rememberMe })
      setAuth(data.access_token, data.refresh_token, data.user, rememberMe)
      navigate('/', { replace: true })
    } catch (err) {
      const detail = err.response?.data?.detail || t('authConnectionError')
      if (err.response?.status === 403) setNeedsVerify(true)
      else setError(detail)
    }
    setLoading(false)
  }

  if (needsVerify) {
    return (
      <VerifyEmailPending
        email={email}
        onResend={authResendVerification}
        onBack={() => setNeedsVerify(false)}
      />
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field
        label={t('authEmailLabel')}
        type="email"
        value={email}
        onChange={setEmail}
        placeholder={t('authEmailPlaceholder')}
        autoComplete="email"
      />
      <Field
        label={t('authPasswordLabel')}
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="••••••••"
        autoComplete="current-password"
      />

      {/* Remember me */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <div
          onClick={() => setRememberMe(v => !v)}
          style={{
            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
            border: `2px solid ${rememberMe ? 'var(--primary)' : 'var(--border)'}`,
            background: rememberMe ? 'var(--primary)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'var(--transition)',
          }}
        >
          {rememberMe && <span style={{ color: 'white', fontSize: 11, lineHeight: 1 }}>✓</span>}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setRememberMe(v => !v)}>
          {t('authRememberMe')}
        </span>
        <button
          type="button"
          onClick={onForgot}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: 12, cursor: 'pointer' }}
        >
          {t('authForgotPassword')}
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', fontSize: 12, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <SubmitBtn loading={loading}>{t('authLoginBtn')}</SubmitBtn>

      <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'var(--text-dim)' }}>
        {t('authNoAccount')}{' '}
        <button type="button" onClick={onRegister} style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
          {t('authRegister')}
        </button>
      </div>
    </form>
  )
}

// ── Form di Registrazione ─────────────────────────────────────────────────────
function RegisterForm({ onLogin }) {
  const t = useT()
  const [email, setEmail]       = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [phone, setPhone]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [registered, setRegistered] = useState(false)

  const usernameStatus = useUsernameCheck(username)

  const clearFieldError = (field) => setFieldErrors(prev => ({ ...prev, [field]: null }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    const fe = {}
    if (!email.trim()) fe.email = t('authErrEmailRequired')
    if (!username.trim()) fe.username = t('authErrUsernameRequired')
    else if (username.length < 3) fe.username = t('authErrUsernameLength')
    else if (!/^[a-zA-Z0-9_.-]+$/.test(username)) fe.username = t('authErrUsernameChars')
    else if (usernameStatus === 'taken') fe.username = 'Username non disponibile'
    if (password.length < 8) fe.password = t('authErrPasswordLength')
    if (password !== confirm) fe.confirm = t('authErrPasswordMatch')
    if (Object.keys(fe).length > 0) { setFieldErrors(fe); return }
    setFieldErrors({})
    setLoading(true)
    try {
      await authRegister({ email, username: username.toLowerCase(), password, phone: phone || undefined })
      setRegistered(true)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        setError(detail.map(d => d.msg || JSON.stringify(d)).join(', '))
      } else {
        setError(detail || err.message || t('authRegistrationError'))
      }
    }
    setLoading(false)
  }

  const usernameHint = {
    checking:  { color: 'var(--text-dim)',    icon: '…', text: 'Controllo...' },
    available: { color: '#22c55e',             icon: '✓', text: 'Disponibile' },
    taken:     { color: '#ef4444',             icon: '✕', text: 'Non disponibile' },
    invalid:   { color: 'var(--text-dim)',    icon: '○', text: 'Min. 3 caratteri, solo lettere/numeri/_.-' },
  }[usernameStatus]

  if (registered) {
    return (
      <VerifyEmailPending
        email={email}
        onResend={authResendVerification}
        onBack={onLogin}
      />
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field label={t('authEmailLabel')} type="email" value={email} onChange={v => { setEmail(v); clearFieldError('email') }}
        placeholder={t('authEmailPlaceholder')} autoComplete="email" error={fieldErrors.email} />

      {/* Username con check disponibilità */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          {t('authUsernameLabel')}
        </label>
        <input
          type="text"
          value={username}
          onChange={e => { setUsername(e.target.value); clearFieldError('username') }}
          placeholder={t('authUsernamePlaceholder')}
          autoComplete="username"
          className="input"
          style={{ width: '100%', borderColor: usernameStatus === 'taken' ? 'var(--danger)' : usernameStatus === 'available' ? '#22c55e' : undefined }}
        />
        {usernameHint && !fieldErrors.username && (
          <div style={{ fontSize: 11, color: usernameHint.color, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{usernameHint.icon}</span>
            <span>{usernameHint.text}</span>
          </div>
        )}
        {fieldErrors.username && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{fieldErrors.username}</div>}
      </div>

      {/* Password con strength meter */}
      <Field label={t('authPasswordLabel')} type="password" value={password} onChange={v => { setPassword(v); clearFieldError('password'); clearFieldError('confirm') }}
        placeholder={t('authPasswordPlaceholder')} autoComplete="new-password" error={fieldErrors.password} />
      <PasswordStrength password={password} />

      <Field label={t('authConfirmLabel')} type="password" value={confirm} onChange={v => { setConfirm(v); clearFieldError('confirm') }}
        placeholder={t('authConfirmPlaceholder')} autoComplete="new-password" error={fieldErrors.confirm} />

      {/* Telefono opzionale */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          {t('authPhoneLabel')} <span style={{ fontWeight: 400, opacity: 0.6 }}>{t('authPhoneOptional')}</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder={t('authPhonePlaceholder')}
          autoComplete="tel"
          className="input"
          style={{ width: '100%' }}
        />
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', fontSize: 12, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <SubmitBtn loading={loading}>{t('authRegisterBtn')}</SubmitBtn>

      <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'var(--text-dim)' }}>
        {t('authHaveAccount')}{' '}
        <button type="button" onClick={onLogin} style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
          {t('authSignIn')}
        </button>
      </div>
    </form>
  )
}

// ── Form Password dimenticata ─────────────────────────────────────────────────
function ForgotForm({ onBack }) {
  const t = useT()
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authForgotPassword(email)
      setSent(true)
    } catch {
      setError(t('authConnectionRetry'))
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📩</div>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{t('authForgotSentTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
          {t('authForgotSentDescBefore')} <strong>{email}</strong> {t('authForgotSentDescAfter')}
        </p>
        <button onClick={onBack} className="btn btn-ghost" style={{ width: '100%' }}>
          {t('authBackToLogin')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
        {t('authForgotDesc')}
      </p>
      <Field label={t('authEmailLabel')} type="email" value={email} onChange={setEmail}
        placeholder={t('authEmailPlaceholder')} autoComplete="email" />
      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', fontSize: 12, marginBottom: 14 }}>
          {error}
        </div>
      )}
      <SubmitBtn loading={loading}>{t('authForgotBtn')}</SubmitBtn>
      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer' }}>
          {t('authBackToLogin')}
        </button>
      </div>
    </form>
  )
}

// ── Pagina principale ─────────────────────────────────────────────────────────
// ── Schermata installa PWA (mobile browser, non standalone) ──────────────────
// ── Palette amber per la schermata di installazione ──────────────────────────
const INSTALL_C = {
  primary:  '#f59e0b',
  primaryD: '#d97706',
  bg:       '#fffcf0',
  surface:  '#ffffff',
  border:   '#fde68a',
  text:     '#1a1208',
  muted:    '#6b5b3e',
  dim:      '#a08060',
}

// ── Illustrazioni SVG per ogni step ──────────────────────────────────────────

// iOS Step 1 — Safari bottom bar con tasto Share evidenziato
function IllustrationIOSShare() {
  return (
    <svg viewBox="0 0 300 90" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 300 }}>
      {/* Sfondo telefono / browser */}
      <rect x="10" y="8" width="280" height="74" rx="12" fill="#f8f8f8" stroke="#e5e7eb" strokeWidth="1.5"/>
      {/* Barra indirizzi */}
      <rect x="20" y="14" width="260" height="22" rx="8" fill="#fff" stroke="#e5e7eb" strokeWidth="1"/>
      <text x="150" y="29" textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="-apple-system,sans-serif">endyo.it</text>
      {/* Bottom bar Safari */}
      <rect x="10" y="60" width="280" height="22" rx="0" fill="#f8f8f8"/>
      <line x1="10" y1="60" x2="290" y2="60" stroke="#e5e7eb" strokeWidth="1"/>
      {/* Icone bottom bar: indietro, avanti, share, segnalibri, tab */}
      {/* ← */}
      <text x="36" y="75" textAnchor="middle" fontSize="14" fill="#c4c4c4" fontFamily="-apple-system,sans-serif">‹</text>
      {/* → */}
      <text x="80" y="75" textAnchor="middle" fontSize="14" fill="#e5e5e5" fontFamily="-apple-system,sans-serif">›</text>
      {/* Share — EVIDENZIATO */}
      <circle cx="150" cy="71" r="14" fill="rgba(245,158,11,0.18)"/>
      <circle cx="150" cy="71" r="14" fill="none" stroke="#f59e0b" strokeWidth="2">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite"/>
      </circle>
      {/* Icona share (quadrato con freccia su) */}
      <rect x="145" y="67" width="10" height="8" rx="1.5" fill="none" stroke="#f59e0b" strokeWidth="1.6"/>
      <line x1="150" y1="66" x2="150" y2="61" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round"/>
      <polyline points="147,63 150,60 153,63" fill="none" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Segnalibri */}
      <text x="220" y="76" textAnchor="middle" fontSize="12" fill="#c4c4c4">⊡</text>
      {/* Tab */}
      <text x="264" y="76" textAnchor="middle" fontSize="11" fill="#c4c4c4">⊞</text>
      {/* Label */}
      <text x="150" y="56" textAnchor="middle" fontSize="8" fill="#f59e0b" fontWeight="700" fontFamily="-apple-system,sans-serif">TAP HERE</text>
    </svg>
  )
}

// iOS Step 2 — Share sheet con "Aggiungi a schermata Home" evidenziato
function IllustrationIOSAddHome({ en }) {
  return (
    <svg viewBox="0 0 300 110" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 300 }}>
      <rect x="10" y="8" width="280" height="94" rx="12" fill="#fff" stroke="#e5e7eb" strokeWidth="1.5"/>
      {/* Titolo sheet */}
      <text x="150" y="24" textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="-apple-system,sans-serif">Share</text>
      <line x1="10" y1="29" x2="290" y2="29" stroke="#f3f4f6" strokeWidth="1"/>
      {/* Icone app nella riga */}
      {[40,80,120,160,200,240].map((x, i) => (
        <g key={i}>
          <rect x={x-14} y="33" width="28" height="28" rx="7" fill="#f3f4f6"/>
        </g>
      ))}
      <line x1="10" y1="68" x2="290" y2="68" stroke="#f3f4f6" strokeWidth="1"/>
      {/* Riga "Aggiungi a schermata Home" — evidenziata */}
      <rect x="14" y="72" width="272" height="26" rx="8" fill="rgba(245,158,11,0.12)" stroke="#f59e0b" strokeWidth="1.5">
        <animate attributeName="opacity" values="1;0.5;1" dur="1.4s" repeatCount="indefinite"/>
      </rect>
      {/* Icona casa */}
      <text x="32" y="89" textAnchor="middle" fontSize="13" fontFamily="-apple-system,sans-serif">🏠</text>
      <text x="154" y="89" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#1a1208" fontFamily="-apple-system,sans-serif">
        {en ? 'Add to Home Screen' : 'Aggiungi a schermata Home'}
      </text>
      {/* freccia */}
      <text x="272" y="89" textAnchor="middle" fontSize="10" fill="#f59e0b" fontWeight="700">›</text>
    </svg>
  )
}

// iOS Step 3 — Dialog "Aggiungi" in alto a destra
function IllustrationIOSConfirm({ en }) {
  return (
    <svg viewBox="0 0 300 100" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 300 }}>
      <rect x="10" y="8" width="280" height="84" rx="12" fill="#fff" stroke="#e5e7eb" strokeWidth="1.5"/>
      {/* Barra in alto con Annulla e Aggiungi */}
      <rect x="10" y="8" width="280" height="28" rx="12" fill="#f8f8f8"/>
      <rect x="10" y="24" width="280" height="12" fill="#f8f8f8"/>
      <line x1="10" y1="36" x2="290" y2="36" stroke="#e5e7eb" strokeWidth="1"/>
      <text x="36" y="26" textAnchor="middle" fontSize="10" fill="#9ca3af" fontFamily="-apple-system,sans-serif">
        {en ? 'Cancel' : 'Annulla'}
      </text>
      <text x="150" y="26" textAnchor="middle" fontSize="10" fontWeight="600" fill="#1a1208" fontFamily="-apple-system,sans-serif">
        {en ? 'Add to Home Screen' : 'Aggiungi a schermata'}
      </text>
      {/* Aggiungi — EVIDENZIATO */}
      <rect x="242" y="14" width="48" height="20" rx="6" fill="rgba(245,158,11,0.15)" stroke="#f59e0b" strokeWidth="1.5">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite"/>
      </rect>
      <text x="266" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill="#f59e0b" fontFamily="-apple-system,sans-serif">
        {en ? 'Add' : 'Aggiungi'}
      </text>
      {/* Contenuto dialog */}
      <rect x="116" y="46" width="68" height="28" rx="8" fill="#f3f4f6"/>
      <text x="150" y="64" textAnchor="middle" fontSize="18">🧥</text>
      <text x="150" y="83" textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="-apple-system,sans-serif">endyo.it</text>
    </svg>
  )
}

// Android Step 1 — Chrome top bar con ⋮ evidenziato
function IllustrationAndroidMenu() {
  return (
    <svg viewBox="0 0 300 90" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 300 }}>
      <rect x="10" y="8" width="280" height="74" rx="12" fill="#f8f8f8" stroke="#e5e7eb" strokeWidth="1.5"/>
      {/* Barra indirizzo Chrome */}
      <rect x="10" y="8" width="280" height="34" rx="12" fill="#4285F4"/>
      <rect x="10" y="28" width="280" height="14" fill="#4285F4"/>
      {/* URL bar */}
      <rect x="28" y="13" width="208" height="18" rx="9" fill="rgba(255,255,255,0.2)"/>
      <text x="132" y="25" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.9)" fontFamily="-apple-system,sans-serif">endyo.it</text>
      {/* Menu ⋮ — EVIDENZIATO */}
      <circle cx="265" cy="22" r="14" fill="rgba(245,158,11,0.25)"/>
      <circle cx="265" cy="22" r="14" fill="none" stroke="#f59e0b" strokeWidth="2">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite"/>
      </circle>
      <circle cx="265" cy="16" r="1.8" fill="#fff"/>
      <circle cx="265" cy="22" r="1.8" fill="#fff"/>
      <circle cx="265" cy="28" r="1.8" fill="#fff"/>
      {/* Label */}
      <text x="265" y="10" textAnchor="middle" fontSize="7.5" fill="#f59e0b" fontWeight="700" fontFamily="-apple-system,sans-serif">TAP</text>
      {/* Contenuto pagina */}
      <rect x="20" y="48" width="160" height="8" rx="3" fill="#e5e7eb"/>
      <rect x="20" y="62" width="120" height="6" rx="3" fill="#f3f4f6"/>
    </svg>
  )
}

// Android Step 2 — Menu Chrome con voce evidenziata
function IllustrationAndroidAddHome({ en }) {
  return (
    <svg viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 300 }}>
      <rect x="10" y="8" width="280" height="104" rx="12" fill="#fff" stroke="#e5e7eb" strokeWidth="1.5"/>
      {/* Header menu */}
      <rect x="10" y="8" width="280" height="24" rx="12" fill="#4285F4"/>
      <rect x="10" y="20" width="280" height="12" fill="#4285F4"/>
      <text x="150" y="23" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.8)" fontFamily="-apple-system,sans-serif">endyo.it</text>
      {/* Voci menu */}
      {[
        en ? 'New tab' : 'Nuova scheda',
        en ? 'Add to Home Screen' : 'Aggiungi a schermata Home',
        en ? 'Share…' : 'Condividi…',
      ].map((label, i) => {
        const y = 40 + i * 26
        const isTarget = i === 1
        return (
          <g key={i}>
            {isTarget && (
              <rect x="14" y={y - 10} width="272" height="24" rx="6" fill="rgba(245,158,11,0.14)" stroke="#f59e0b" strokeWidth="1.5">
                <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite"/>
              </rect>
            )}
            <text x="28" y={y + 6} fontSize="10" fontWeight={isTarget ? '700' : '400'}
              fill={isTarget ? '#1a1208' : '#6b7280'}
              fontFamily="-apple-system,sans-serif">{label}</text>
            {isTarget && (
              <text x="272" y={y + 6} textAnchor="end" fontSize="10" fill="#f59e0b" fontWeight="700">←</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// Android Step 3 — Dialog conferma
function IllustrationAndroidConfirm({ en }) {
  return (
    <svg viewBox="0 0 300 110" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 300 }}>
      <rect x="10" y="8" width="280" height="94" rx="12" fill="#fff" stroke="#e5e7eb" strokeWidth="1.5"/>
      <text x="150" y="32" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1a1208" fontFamily="-apple-system,sans-serif">
        {en ? 'Add to Home screen?' : 'Aggiungere alla schermata?'}
      </text>
      {/* Icona app */}
      <rect x="122" y="40" width="56" height="30" rx="8" fill="#f3f4f6"/>
      <text x="150" y="61" textAnchor="middle" fontSize="18">🧥</text>
      {/* Pulsanti */}
      <text x="196" y="94" textAnchor="middle" fontSize="10" fill="#9ca3af" fontFamily="-apple-system,sans-serif">
        {en ? 'Cancel' : 'Annulla'}
      </text>
      {/* Installa — evidenziato */}
      <rect x="220" y="82" width="58" height="20" rx="6" fill="rgba(245,158,11,0.15)" stroke="#f59e0b" strokeWidth="1.5">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite"/>
      </rect>
      <text x="249" y="95" textAnchor="middle" fontSize="10" fontWeight="700" fill="#f59e0b" fontFamily="-apple-system,sans-serif">
        {en ? 'Install' : 'Installa'}
      </text>
    </svg>
  )
}

function InstallScreen() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled]           = useState(false)
  const [highlight, setHighlight]           = useState(false)

  // Rileva lingua dal localStorage (impostata da settingsStore) o dal browser
  const lang = (() => {
    try {
      const s = localStorage.getItem('endyo-settings')
      if (s) { const p = JSON.parse(s); if (p?.state?.language) return p.state.language }
    } catch (_) {}
    return navigator.language?.startsWith('en') ? 'en' : 'it'
  })()
  const en = lang === 'en'

  useEffect(() => {
    const handler = e => { e.preventDefault(); setDeferredPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setDeferredPrompt(null)
    } else {
      setHighlight(true)
      setTimeout(() => setHighlight(false), 2200)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: INSTALL_C.bg, padding: '32px 24px 80px',
      textAlign: 'center',
    }}>
      <style>{`
        @keyframes install-bounce {
          0%,100% { transform: translateX(-50%) translateY(0) }
          50%      { transform: translateX(-50%) translateY(-10px) }
        }
        @keyframes install-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.45) }
          50%      { box-shadow: 0 0 0 14px rgba(245,158,11,0) }
        }
        @keyframes install-step-pulse {
          0%,100% { border-color: rgba(245,158,11,0.3) }
          50%      { border-color: rgba(245,158,11,0.9) }
        }
      `}</style>

      {/* Logo */}
      <img src={logoUrl} alt="Endyo" style={{
        width: 80, height: 80, borderRadius: 22, marginBottom: 20,
        boxShadow: '0 8px 32px rgba(245,158,11,0.35)',
      }} />

      {/* Titolo */}
      <h1 style={{
        fontSize: 26, fontWeight: 900, letterSpacing: '-0.035em',
        color: INSTALL_C.text, margin: '0 0 10px',
      }}>
        {en ? 'Install Endyo' : 'Installa Endyo'}
      </h1>
      <p style={{
        fontSize: 14, color: INSTALL_C.muted, lineHeight: 1.65,
        margin: '0 0 28px', maxWidth: 300,
      }}>
        {en
          ? 'Add the app to your Home Screen for the best experience — fast, full-screen, always at hand.'
          : 'Aggiungi l\'app alla schermata Home per la migliore esperienza — veloce, a schermo intero, sempre a portata di mano.'}
      </p>

      {/* Bottone principale */}
      {!installed ? (
        <button
          onClick={handleInstall}
          style={{
            background: `linear-gradient(135deg, ${INSTALL_C.primary}, ${INSTALL_C.primaryD})`,
            color: '#fff', border: 'none', borderRadius: 16,
            padding: '15px 40px', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', marginBottom: 32, letterSpacing: '-0.01em',
            boxShadow: '0 4px 24px rgba(245,158,11,0.4)',
            animation: highlight ? 'install-pulse 0.7s ease 3' : 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ＋ {en ? 'Add to Home Screen' : 'Aggiungi alla Home'}
        </button>
      ) : (
        <div style={{ marginBottom: 32, fontSize: 15, color: '#22c55e', fontWeight: 700 }}>
          ✓ {en ? 'App added to your home screen!' : 'App aggiunta alla home screen!'}
        </div>
      )}

      {/* Badge piattaforma */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: 20, padding: '4px 14px', marginBottom: 20,
        fontSize: 12, fontWeight: 600, color: INSTALL_C.primaryD,
      }}>
        {isIOS ? '🍎 iPhone / iPad' : '🤖 Android'}
        <span style={{ opacity: 0.5, margin: '0 2px' }}>·</span>
        {isIOS
          ? (en ? 'Safari required' : 'Richiede Safari')
          : (en ? 'Chrome / Edge' : 'Chrome / Edge')}
      </div>

      {/* Steps con illustrazioni SVG */}
      <div style={{
        width: '100%', maxWidth: 340,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {isIOS ? (
          <>
            <InstallStep n={1} highlight={highlight}
              illustration={<IllustrationIOSShare />}
              text={en
                ? <><strong>Tap the Share ⬆️ button</strong> at the bottom of Safari</>
                : <>Tocca il tasto <strong>Condividi ⬆️</strong> in basso in Safari</>}
            />
            <InstallStep n={2} highlight={highlight}
              illustration={<IllustrationIOSAddHome en={en} />}
              text={en
                ? <>Scroll down and tap <strong>"Add to Home Screen"</strong></>
                : <>Scorri e tocca <strong>"Aggiungi a schermata Home"</strong></>}
            />
            <InstallStep n={3} highlight={highlight}
              illustration={<IllustrationIOSConfirm en={en} />}
              text={en
                ? <>Tap <strong>Add</strong> (top-right) to confirm</>
                : <>Tocca <strong>Aggiungi</strong> in alto a destra</>}
            />
          </>
        ) : (
          <>
            <InstallStep n={1} highlight={highlight}
              illustration={<IllustrationAndroidMenu />}
              text={en
                ? <>Tap the <strong>⋮ menu</strong> at the top-right of Chrome</>
                : <>Tocca il menu <strong>⋮</strong> in alto a destra in Chrome</>}
            />
            <InstallStep n={2} highlight={highlight}
              illustration={<IllustrationAndroidAddHome en={en} />}
              text={en
                ? <>Tap <strong>"Add to Home Screen"</strong></>
                : <>Tocca <strong>"Aggiungi a schermata Home"</strong></>}
            />
            <InstallStep n={3} highlight={highlight}
              illustration={<IllustrationAndroidConfirm en={en} />}
              text={en
                ? <>Tap <strong>Install</strong> to confirm</>
                : <>Tocca <strong>Installa</strong> per confermare</>}
            />
          </>
        )}
      </div>

      {/* Freccia animata in basso per iOS */}
      {isIOS && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          animation: 'install-bounce 1.4s ease-in-out infinite',
          pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 10, color: INSTALL_C.primaryD,
            letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700,
          }}>
            {en ? 'Share' : 'Condividi'}
          </span>
          <span style={{ fontSize: 26 }}>⬆️</span>
        </div>
      )}
    </div>
  )
}

function InstallStep({ n, illustration, text, highlight }) {
  return (
    <div style={{
      background: INSTALL_C.surface,
      border: `1px solid ${INSTALL_C.border}`,
      borderRadius: 16, overflow: 'hidden',
      animation: highlight ? 'install-step-pulse 0.7s ease 3' : 'none',
      transition: 'border-color 0.3s',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      {/* Illustrazione SVG */}
      <div style={{ padding: '12px 12px 6px', background: '#fafaf8' }}>
        {illustration}
      </div>
      {/* Testo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px 12px',
        borderTop: `1px solid ${INSTALL_C.border}`,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 50, flexShrink: 0,
          background: 'rgba(245,158,11,0.14)',
          border: '1px solid rgba(245,158,11,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: INSTALL_C.primaryD,
        }}>{n}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: INSTALL_C.text, textAlign: 'left' }}>
          {text}
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  const t = useT()
  const [view, setView] = useState('login') // 'login' | 'register' | 'forgot'

  // Se aperto da browser mobile (non PWA standalone) → mostra istruzioni installazione
  const isMobileBrowser = (
    /android|iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !window.matchMedia('(display-mode: standalone)').matches &&
    window.navigator.standalone !== true &&
    new URLSearchParams(window.location.search).get('pwa') !== '1'
  )

  if (isMobileBrowser) return <InstallScreen />

  const titles = {
    login:    t('authLoginTitle'),
    register: t('authRegisterTitle'),
    forgot:   t('authForgotTitle'),
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '36px 36px 32px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        {/* Logo + titolo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src={logoUrl} alt="Endyo" style={{ width: 54, height: 54, borderRadius: 14, marginBottom: 14 }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
            {titles[view]}
          </h1>
          {view === 'login' && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('authDigitalWardrobe')}</p>
          )}
        </div>

        {view === 'login'    && <LoginForm    onForgot={() => setView('forgot')}   onRegister={() => setView('register')} />}
        {view === 'register' && <RegisterForm onLogin={() => setView('login')} />}
        {view === 'forgot'   && <ForgotForm   onBack={() => setView('login')} />}
      </div>
    </div>
  )
}
