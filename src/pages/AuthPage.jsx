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
export default function AuthPage() {
  const t = useT()
  const [view, setView] = useState('login') // 'login' | 'register' | 'forgot'

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
