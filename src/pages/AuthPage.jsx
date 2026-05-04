import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { authLogin, authRegister, authForgotPassword, authResendVerification, authGoogle, authGoogleLink, authGoogleLinkInit, fetchGoogleClientId, checkUsernameAvailable, updateUsername, api } from '../api/client'
const logoUrl = './Endyoapp.png'
import { useT } from '../i18n'

// ── Schermata scelta username dopo Google OAuth ───────────────────────────────
function UsernameSetupScreen({ onDone }) {
  const [value, setValue]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const status = useUsernameCheck(value)
  const updateUser = useAuthStore(s => s.updateUser)
  const user       = useAuthStore(s => s.user)

  const hint = {
    null:      value.length > 0 && value.length < 3 ? { text: 'Almeno 3 caratteri', color: 'var(--text-dim)' } : null,
    invalid:   { text: 'Solo lettere, numeri, _ . -', color: '#ef4444' },
    checking:  { text: 'Controllo disponibilità…', color: 'var(--text-dim)' },
    available: { text: '✓ Disponibile', color: '#22c55e' },
    taken:     { text: '✗ Già in uso', color: '#ef4444' },
  }[status ?? 'null']

  const canSubmit = status === 'available' && !loading

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const data = await updateUsername(value.trim().toLowerCase())
      // Aggiorna lo store con il nuovo username
      updateUser({ ...user, username: data.username })
      onDone()
    } catch (err) {
      setError(err.response?.data?.detail || 'Errore, riprova')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src={logoUrl} alt="Endyo" style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'contain', marginBottom: 14, boxShadow: '0 4px 16px rgba(139,92,246,0.25)' }} />
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 6 }}>
            Scegli il tuo username
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            È il tuo ID pubblico su Endyo.<br/>Potrai cambiarlo in seguito dalle impostazioni.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                fontSize: 14, color: 'var(--text-dim)', pointerEvents: 'none',
              }}>@</span>
              <input
                className="input"
                value={value}
                onChange={e => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                placeholder="il_tuo_username"
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                style={{ paddingLeft: 30 }}
              />
            </div>
            {hint && (
              <div style={{ fontSize: 11, color: hint.color, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                {status === 'checking' && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5, display: 'inline-block' }} />}
                {hint.text}
              </div>
            )}
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.5 }}>
            Lettere, numeri, <code style={{ background: 'var(--card)', padding: '1px 4px', borderRadius: 3 }}>_</code>{' '}
            <code style={{ background: 'var(--card)', padding: '1px 4px', borderRadius: 3 }}>.</code>{' '}
            <code style={{ background: 'var(--card)', padding: '1px 4px', borderRadius: 3 }}>-</code> · Min 3, max 30 caratteri
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#f87171', fontSize: 12, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: canSubmit ? 'var(--primary)' : 'var(--border)',
              color: canSubmit ? '#fff' : 'var(--text-dim)',
              fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            {loading ? 'Salvataggio…' : 'Continua'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Google Sign-In button ─────────────────────────────────────────────────────
// Carica Google Identity Services on-demand e renderizza il bottone ufficiale.
// onSuccess(user) viene chiamato dopo il login — il chiamante decide se navigare
// o mostrare il picker per lo username (se user.username è null).
function GoogleButton({ onSuccess, onError, onLinkRequired }) {
  const containerRef = useRef(null)
  const [ready, setReady]     = useState(false)
  const [loading, setLoading] = useState(false)
  const setAuth    = useAuthStore(s => s.setAuth)

  useEffect(() => {
    let cancelled = false
    fetchGoogleClientId().then(clientId => {
      if (!clientId || cancelled) return

      const initGSI = () => {
        if (!window.google?.accounts?.id) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (!response.credential) return
            setLoading(true)
            try {
              const data = await authGoogle(response.credential)
              setAuth(data.access_token, data.refresh_token, data.user, true)
              onSuccess?.(data.user)
            } catch (e) {
              // 409 → email già registrata con account normale → proponi collegamento
              if (e.response?.status === 409 && e.response?.data?.action === 'link_required') {
                onLinkRequired?.({ ...e.response.data, credential: response.credential })
              } else {
                onError?.(e.response?.data?.detail || 'Errore accesso con Google')
              }
            } finally {
              setLoading(false)
            }
          },
          auto_select: false,
          use_fedcm_for_prompt: true,
        })
        if (containerRef.current) {
          window.google.accounts.id.renderButton(containerRef.current, {
            theme: 'outline',
            size: 'large',
            width: containerRef.current.offsetWidth || 320,
            text: 'continue_with',
            locale: 'it',
          })
        }
        setReady(true)
      }

      if (window.google?.accounts?.id) {
        initGSI()
      } else {
        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.defer = true
        script.onload = initGSI
        document.head.appendChild(script)
      }
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', minHeight: 44 }} />
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 8,
          background: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
        </div>
      )}
    </div>
  )
}

// ── Divisore "oppure" ─────────────────────────────────────────────────────────
function OrDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 500, letterSpacing: '0.05em' }}>OPPURE</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

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
function LoginForm({ onForgot, onRegister, onGoogleSuccess, onGoogleLinkRequired }) {
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

      <OrDivider />
      <GoogleButton onSuccess={onGoogleSuccess} onError={setError} onLinkRequired={onGoogleLinkRequired} />

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
function RegisterForm({ onLogin, onGoogleSuccess, onGoogleLinkRequired }) {
  const t = useT()
  const [email, setEmail]       = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [phone, setPhone]       = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [gender,    setGender]    = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [termsAccepted,    setTermsAccepted]    = useState(false)
  const [marketingEmail,   setMarketingEmail]   = useState(false)
  const [marketingPhone,   setMarketingPhone]   = useState(false)
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
    if (phone.trim() && phone.trim().length < 5) fe.phone = 'Inserisci un numero di telefono valido'
    if (!termsAccepted) fe.terms = 'Devi accettare i Termini e Condizioni per continuare'
    if (Object.keys(fe).length > 0) { setFieldErrors(fe); return }
    setFieldErrors({})
    setLoading(true)
    try {
      await authRegister({
        email,
        username:        username.toLowerCase(),
        password,
        phone:           phone.trim() || undefined,
        first_name:      firstName  || undefined,
        last_name:       lastName   || undefined,
        gender:          gender     || undefined,
        birth_year:      birthYear  ? parseInt(birthYear, 10) : undefined,
        terms_accepted:  true,
        marketing_email: marketingEmail,
        marketing_phone: marketingPhone,
      })
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

      {/* ── Dati opzionali ──────────────────────────────────────────── */}
      <div style={{ margin: '4px 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 500, letterSpacing: '0.05em', flexShrink: 0 }}>DATI OPZIONALI</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Nome e Cognome */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Nome</label>
          <input type="text" className="input" style={{ width: '100%' }} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Mario" autoComplete="given-name" />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Cognome</label>
          <input type="text" className="input" style={{ width: '100%' }} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Rossi" autoComplete="family-name" />
        </div>
      </div>

      {/* Genere e Anno di nascita */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Genere</label>
          <select className="input" style={{ width: '100%' }} value={gender} onChange={e => setGender(e.target.value)}>
            <option value="">— Seleziona —</option>
            <option value="uomo">Uomo</option>
            <option value="donna">Donna</option>
            <option value="non_binario">Non binario</option>
            <option value="altro">Altro</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Anno di nascita</label>
          <select className="input" style={{ width: '100%' }} value={birthYear} onChange={e => setBirthYear(e.target.value)}>
            <option value="">— Anno —</option>
            {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - 13 - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Telefono obbligatorio */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          {t('authPhoneLabel')} <span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: 10 }}>facoltativo</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={e => { setPhone(e.target.value); clearFieldError('phone') }}
          placeholder={t('authPhonePlaceholder')}
          autoComplete="tel"
          className="input"
          style={{ width: '100%', borderColor: fieldErrors.phone ? 'var(--danger)' : undefined }}
        />
        {fieldErrors.phone && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{fieldErrors.phone}</div>}
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
          Usato solo per recupero account e comunicazioni urgenti.
        </div>
      </div>

      {/* ── Consensi ────────────────────────────────────────────────────── */}
      <div style={{ margin: '4px 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 500, letterSpacing: '0.05em', flexShrink: 0 }}>CONSENSI</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* T&C obbligatorio */}
      {[
        {
          key: 'terms',
          checked: termsAccepted,
          onChange: () => { setTermsAccepted(v => !v); clearFieldError('terms') },
          required: true,
          label: (
            <>
              Ho letto e accetto i{' '}
              <a href="https://endyo.it/terms" target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 700 }}>
                Termini e Condizioni
              </a>{' '}
              e la{' '}
              <a href="https://endyo.it/privacy" target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 700 }}>
                Privacy Policy
              </a>
            </>
          ),
          error: fieldErrors.terms,
        },
        {
          key: 'marketingEmail',
          checked: marketingEmail,
          onChange: () => setMarketingEmail(v => !v),
          required: false,
          label: 'Acconsento a ricevere comunicazioni promozionali via email',
        },
        {
          key: 'marketingPhone',
          checked: marketingPhone,
          onChange: () => setMarketingPhone(v => !v),
          required: false,
          label: 'Acconsento a ricevere comunicazioni promozionali via SMS/telefono',
        },
      ].map(({ key, checked, onChange, required, label, error: fieldErr }) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div
              onClick={onChange}
              style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                border: `2px solid ${checked ? 'var(--primary)' : fieldErr ? 'var(--danger)' : 'var(--border)'}`,
                background: checked ? 'var(--primary)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'var(--transition)',
              }}
            >
              {checked && <span style={{ color: 'white', fontSize: 11, lineHeight: 1 }}>✓</span>}
            </div>
            <span
              style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, cursor: 'pointer', flex: 1 }}
              onClick={onChange}
            >
              {label}
              {required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
            </span>
          </div>
          {fieldErr && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3, paddingLeft: 28 }}>{fieldErr}</div>}
        </div>
      ))}

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', fontSize: 12, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <SubmitBtn loading={loading}>{t('authRegisterBtn')}</SubmitBtn>

      <OrDivider />
      <GoogleButton onSuccess={onGoogleSuccess} onError={msg => setError(msg)} onLinkRequired={onGoogleLinkRequired} />

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

// ── Schermata collegamento account Google (verifica via email) ────────────────
function LinkAccountScreen({ email, googleName, credential, onCancel }) {
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [emailSent,  setEmailSent]  = useState(false)

  const handleSendEmail = async () => {
    setLoading(true)
    setError(null)
    try {
      await authGoogleLinkInit(credential)
      setEmailSent(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Errore, riprova')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{emailSent ? '📬' : '🔗'}</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>
            {emailSent ? 'Controlla la tua email' : 'Collega account Google'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {emailSent ? (
              <>
                Abbiamo inviato un link di conferma a{' '}
                <strong style={{ color: 'var(--text)' }}>{email}</strong>.<br />
                Clicca il link per collegare il tuo account Google.
              </>
            ) : (
              <>
                Esiste già un account Endyo con{' '}
                <strong style={{ color: 'var(--text)' }}>{email}</strong>.<br />
                Ti invieremo una email di conferma per collegarlo a Google.
              </>
            )}
          </p>
        </div>

        {emailSent ? (
          <div style={{
            padding: '12px 16px', background: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10,
            fontSize: 12, color: 'var(--primary-light)', lineHeight: 1.6, marginBottom: 20,
          }}>
            Controlla anche la cartella spam. Il link scade dopo 24 ore.
          </div>
        ) : (
          <>
            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#f87171', fontSize: 12, marginBottom: 14 }}>
                {error}
              </div>
            )}
            <div style={{ padding: '10px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
              Collegando l'account potrai accedere con Google o con email+password in futuro.
            </div>
            <button
              onClick={handleSendEmail}
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 700 }}
            >
              {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Invia email di conferma'}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onCancel}
          style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer', padding: '8px 0' }}
        >
          Annulla
        </button>
      </div>
    </div>
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

// ── Illustrazioni SVG per ogni step (flow reale iOS Safari) ──────────────────

// iOS Step 1 — Safari bottom bar: i tre puntini ••• in basso a destra
function IllustrationIOSThreeDots() {
  return (
    <svg viewBox="0 0 300 88" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 300 }}>
      <rect x="10" y="8" width="280" height="72" rx="12" fill="#1c1c1e" stroke="#3a3a3c" strokeWidth="1.5"/>
      {/* Barra indirizzo scura */}
      <rect x="20" y="14" width="260" height="22" rx="11" fill="#2c2c2e"/>
      <text x="150" y="29" textAnchor="middle" fontSize="9" fill="#aeaeb2" fontFamily="-apple-system,sans-serif">endyo.it</text>
      {/* Bottom bar Safari */}
      <rect x="10" y="56" width="280" height="24" rx="0" fill="#1c1c1e"/>
      <rect x="10" y="68" width="280" height="12" rx="12" fill="#1c1c1e"/>
      <line x1="10" y1="56" x2="290" y2="56" stroke="#3a3a3c" strokeWidth="1"/>
      {/* ‹ indietro */}
      <text x="34" y="72" textAnchor="middle" fontSize="18" fill="#636366">‹</text>
      {/* icona tab (quadrati) */}
      <rect x="70" y="62" width="9" height="9" rx="2" fill="none" stroke="#636366" strokeWidth="1.3"/>
      <rect x="73" y="59" width="9" height="9" rx="2" fill="none" stroke="#636366" strokeWidth="1.3"/>
      {/* URL bar centrale */}
      <rect x="98" y="59" width="104" height="14" rx="7" fill="#2c2c2e"/>
      <text x="150" y="70" textAnchor="middle" fontSize="8" fill="#aeaeb2">endyo.it</text>
      {/* ricarica */}
      <text x="222" y="71" textAnchor="middle" fontSize="11" fill="#636366">↻</text>
      {/* ••• — EVIDENZIATO */}
      <circle cx="264" cy="67" r="14" fill="rgba(245,158,11,0.2)"/>
      <circle cx="264" cy="67" r="14" fill="none" stroke="#f59e0b" strokeWidth="2">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite"/>
      </circle>
      <circle cx="257" cy="67" r="2" fill="#f59e0b"/>
      <circle cx="264" cy="67" r="2" fill="#f59e0b"/>
      <circle cx="271" cy="67" r="2" fill="#f59e0b"/>
    </svg>
  )
}

// iOS Step 2 — Menu a tendina con "Condividi" evidenziato
function IllustrationIOSCondividi({ en }) {
  return (
    <svg viewBox="0 0 300 115" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 300 }}>
      <rect x="10" y="8" width="280" height="99" rx="14" fill="#2c2c2e" stroke="#3a3a3c" strokeWidth="1.5"/>
      {/* Riga Condividi — EVIDENZIATA */}
      <rect x="14" y="12" width="272" height="30" rx="10" fill="rgba(245,158,11,0.18)" stroke="#f59e0b" strokeWidth="1.5">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite"/>
      </rect>
      {/* Icona condividi */}
      <rect x="28" y="20" width="14" height="11" rx="2" fill="none" stroke="#f59e0b" strokeWidth="1.4"/>
      <line x1="35" y1="19" x2="35" y2="14" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/>
      <polyline points="32,16 35,13 38,16" fill="none" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="58" y="31" fontSize="11" fontWeight="700" fill="#f59e0b" fontFamily="-apple-system,sans-serif">{en ? 'Share' : 'Condividi'}</text>
      <line x1="14" y1="42" x2="286" y2="42" stroke="#3a3a3c" strokeWidth="0.8"/>
      {/* Aggiungi a Segnalibri */}
      <text x="28" y="59" fontSize="10" fill="#aeaeb2" fontFamily="-apple-system,sans-serif">{en ? 'Add Bookmark' : 'Aggiungi a Segnalibri'}</text>
      <line x1="14" y1="68" x2="286" y2="68" stroke="#3a3a3c" strokeWidth="0.8"/>
      {/* Nuovo pannello */}
      <text x="28" y="84" fontSize="10" fill="#aeaeb2" fontFamily="-apple-system,sans-serif">{en ? 'New Tab' : 'Nuovo pannello'}</text>
      <line x1="14" y1="93" x2="286" y2="93" stroke="#3a3a3c" strokeWidth="0.8"/>
      <text x="28" y="105" fontSize="10" fill="#aeaeb2" fontFamily="-apple-system,sans-serif">{en ? 'Private Tab' : 'Nuovo pannello privato'}</text>
    </svg>
  )
}

// iOS Step 3 — Share sheet con "Visualizza altro" (↓) evidenziato in basso a destra
function IllustrationIOSVisualizzaAltro({ en }) {
  return (
    <svg viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 300 }}>
      <rect x="10" y="8" width="280" height="104" rx="14" fill="#1c1c1e" stroke="#3a3a3c" strokeWidth="1.5"/>
      {/* Header: icona app + nome */}
      <rect x="18" y="16" width="26" height="26" rx="7" fill="#f3f4f6"/>
      <text x="31" y="33" textAnchor="middle" fontSize="14">🧥</text>
      <text x="52" y="25" fontSize="10" fontWeight="700" fill="#fff" fontFamily="-apple-system,sans-serif">Endyo</text>
      <text x="52" y="37" fontSize="8" fill="#aeaeb2" fontFamily="-apple-system,sans-serif">endyo.it</text>
      <line x1="10" y1="48" x2="290" y2="48" stroke="#3a3a3c" strokeWidth="0.8"/>
      {/* Riga contatti */}
      {[38,82,126,170].map((x,i) => <circle key={i} cx={x} cy="63" r="14" fill="#3a3a3c"/>)}
      <line x1="10" y1="84" x2="290" y2="84" stroke="#3a3a3c" strokeWidth="0.8"/>
      {/* Riga azioni: Copia, Segnalibri, Lettura, [Visualizza altro] */}
      {[38,88,138].map((x,i) => (
        <g key={i}>
          <circle cx={x} cy="98" r="12" fill="#3a3a3c"/>
        </g>
      ))}
      {/* "Visualizza altro" (↓) — EVIDENZIATO */}
      <circle cx="238" cy="98" r="14" fill="rgba(245,158,11,0.2)"/>
      <circle cx="238" cy="98" r="14" fill="none" stroke="#f59e0b" strokeWidth="2">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite"/>
      </circle>
      {/* freccia giù */}
      <line x1="238" y1="93" x2="238" y2="102" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <polyline points="234,99 238,103 242,99" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="238" y="113" textAnchor="middle" fontSize="7" fill="#f59e0b" fontWeight="700" fontFamily="-apple-system,sans-serif">
        {en ? 'More' : 'Visualizza altro'}
      </text>
    </svg>
  )
}

// iOS Step 4 — Lista espansa con "Aggiungi alla schermata Home" evidenziato
function IllustrationIOSAddHomeList({ en }) {
  const items = en
    ? ['Add Bookmark…', 'Add to Favourites', 'Quick Note', 'Find on Page', 'Add to Home Screen']
    : ['Aggiungi segnalibro a…', 'Aggiungi ai preferiti', 'Aggiungi a nota rapida', 'Trova nella pagina', 'Aggiungi alla schermata Home']
  return (
    <svg viewBox="0 0 300 135" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 300 }}>
      <rect x="10" y="8" width="280" height="119" rx="14" fill="#1c1c1e" stroke="#3a3a3c" strokeWidth="1.5"/>
      {items.map((label, i) => {
        const y = 20 + i * 22
        const isTarget = i === items.length - 1
        return (
          <g key={i}>
            {isTarget && (
              <rect x="13" y={y - 2} width="274" height="22" rx="8" fill="rgba(245,158,11,0.18)" stroke="#f59e0b" strokeWidth="1.5">
                <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite"/>
              </rect>
            )}
            <text x="26" y={y + 13} fontSize="9.5"
              fontWeight={isTarget ? '700' : '400'}
              fill={isTarget ? '#f59e0b' : '#aeaeb2'}
              fontFamily="-apple-system,sans-serif">{label}</text>
            {i < items.length - 1 && (
              <line x1="14" y1={y + 20} x2="286" y2={y + 20} stroke="#3a3a3c" strokeWidth="0.7"/>
            )}
          </g>
        )
      })}
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

// ── AdSense banner nella pagina di installazione (pubblica, crawlabile) ───────
// Per attivare:
//   1. Vai su adsense.google.com → Annunci → Per sito → Blocchi annuncio
//   2. Crea un nuovo blocco "Banner adattivo nella pagina"
//   3. Sostituisci INSTALL_AD_SLOT con il codice slot generato (es. "1234567890")
const INSTALL_AD_CLIENT = 'ca-pub-2435292000410787'
const INSTALL_AD_SLOT   = 'CCCCCCCCCC'  // ← sostituisci con il tuo slot ID

function InstallAdBanner() {
  const slotRef = useRef(null)
  const pushed  = useRef(false)

  useEffect(() => {
    if (pushed.current || INSTALL_AD_SLOT.includes('CCC')) return
    if (!slotRef.current) return
    try {
      pushed.current = true
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch (_) {}
  }, [])

  // Placeholder visibile finché lo slot non è configurato
  if (INSTALL_AD_SLOT.includes('CCC')) {
    return (
      <div style={{
        width: '100%', maxWidth: 400, margin: '10px 0',
        height: 60, borderRadius: 10, flexShrink: 0,
        background: 'rgba(245,158,11,0.07)',
        border: '1px dashed rgba(245,158,11,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 11, color: 'rgba(146,64,14,0.4)', letterSpacing: '0.04em' }}>
          AdSense · slot da configurare
        </span>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 400, margin: '10px 0', flexShrink: 0 }}>
      <ins
        ref={slotRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: 60 }}
        data-ad-client={INSTALL_AD_CLIENT}
        data-ad-slot={INSTALL_AD_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}

function InstallScreen({ onBack }) {
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
      height: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', overflow: 'hidden',
      background: INSTALL_C.bg, padding: '0 20px',
      textAlign: 'center',
    }}>
      <style>{`
        @keyframes install-bounce-arrow {
          0%,100% { transform: translateY(0) }
          50%      { transform: translateY(-10px) }
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

      {/* ── Pulsante indietro ── */}
      <div style={{ width: '100%', maxWidth: 400, paddingTop: 'calc(env(safe-area-inset-top,0px) + 12px)', display: 'flex', alignItems: 'center' }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: INSTALL_C.muted, fontSize: 14, fontWeight: 600,
          padding: '6px 0', display: 'flex', alignItems: 'center', gap: 4,
          WebkitTapHighlightColor: 'transparent',
        }}>
          ‹ {en ? 'Back' : 'Indietro'}
        </button>
      </div>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, marginTop: 8 }}>
        <img src={logoUrl} alt="Endyo" style={{
          width: 56, height: 56, borderRadius: 16, objectFit: 'contain',
          boxShadow: '0 4px 20px rgba(245,158,11,0.35)',
        }} />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: INSTALL_C.text, lineHeight: 1.1 }}>
            {en ? 'Install Endyo' : 'Installa Endyo'}
          </div>
          <div style={{ fontSize: 13, color: INSTALL_C.muted, marginTop: 3 }}>
            {isIOS
              ? 'Safari · iPhone / iPad'
              : 'Chrome / Edge · Android'}
          </div>
        </div>
      </div>

      {/* ── Bottone installazione — solo Android (su iOS non funziona) ── */}
      {!isIOS && (
        !installed ? (
          <button
            onClick={handleInstall}
            style={{
              background: `linear-gradient(135deg, ${INSTALL_C.primary}, ${INSTALL_C.primaryD})`,
              color: '#fff', border: 'none', borderRadius: 14,
              padding: '14px 28px', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', marginBottom: 14, letterSpacing: '-0.01em',
              boxShadow: '0 3px 16px rgba(245,158,11,0.4)',
              animation: highlight ? 'install-pulse 0.7s ease 3' : 'none',
              WebkitTapHighlightColor: 'transparent', width: '100%', maxWidth: 360,
            }}
          >
            ＋ {en ? 'Add to Home Screen' : 'Aggiungi alla Home'}
          </button>
        ) : (
          <div style={{ marginBottom: 14, fontSize: 15, color: '#22c55e', fontWeight: 700 }}>
            ✓ {en ? 'Added to home screen!' : 'App aggiunta alla home!'}
          </div>
        )
      )}

      {/* ── Separatore ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 400, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 1, background: INSTALL_C.border }} />
        <span style={{ fontSize: 12, color: INSTALL_C.dim, whiteSpace: 'nowrap' }}>
          {en ? 'Follow the steps below' : 'Segui i passaggi'}
        </span>
        <div style={{ flex: 1, height: 1, background: INSTALL_C.border }} />
      </div>

      {/* ── Steps ── */}
      <div style={{
        width: '100%', maxWidth: 400, flex: 1,
        display: 'flex', flexDirection: 'column',
        gap: 10, overflow: 'hidden',
      }}>
        {isIOS ? (
          <>
            <InstallStep n={1} highlight={highlight}
              illustration={<IllustrationIOSThreeDots />}
              text={en
                ? <>Tap the <strong>••• button</strong> at the bottom-right of Safari</>
                : <>Tocca i <strong>tre puntini •••</strong> in basso a destra in Safari</>}
            />
            <InstallStep n={2} highlight={highlight}
              illustration={<IllustrationIOSCondividi en={en} />}
              text={en
                ? <>Tap <strong>"Share"</strong> in the menu</>
                : <>Tocca <strong>"Condividi"</strong> nel menu</>}
            />
            <InstallStep n={3} highlight={highlight}
              illustration={<IllustrationIOSVisualizzaAltro en={en} />}
              text={en
                ? <>Tap <strong>↓ "More"</strong> at bottom-right</>
                : <>Tocca <strong>"Visualizza altro" ↓</strong> in basso</>}
            />
            <InstallStep n={4} highlight={highlight}
              illustration={<IllustrationIOSAddHomeList en={en} />}
              text={en
                ? <>Tap <strong>"Add to Home Screen"</strong> → <strong>Add</strong></>
                : <>Tocca <strong>"Aggiungi alla schermata Home"</strong> → <strong>Aggiungi</strong></>}
            />
          </>
        ) : (
          <>
            <InstallStep n={1} highlight={highlight}
              illustration={<IllustrationAndroidMenu />}
              text={en
                ? <>Tap the <strong>⋮ menu</strong> top-right in Chrome</>
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

      {/* ── Banner AdSense — pagina pubblica, visibile senza login ─────── */}
      <InstallAdBanner />

      {/* Spazio safe-area bottom */}
      <div style={{ height: 'calc(env(safe-area-inset-bottom,0px) + 16px)', flexShrink: 0 }} />

      {/* ── Freccia animata — punta verso il basso (iOS: verso i •••) ── */}
      {isIOS && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom,0px) + 14px)',
          right: 22,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          animation: 'install-bounce-arrow 1.2s ease-in-out infinite',
          pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 10, color: INSTALL_C.primaryD,
            letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700,
          }}>
            {en ? 'here' : 'qui'}
          </span>
          {/* Freccia verticale verso il basso */}
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12l7 7 7-7" stroke={INSTALL_C.primaryD} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
    </div>
  )
}

/* InstallStep — riga orizzontale: numero | testo | illustrazione */
function InstallStep({ n, illustration, text, highlight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: INSTALL_C.surface,
      border: `1.5px solid ${highlight ? INSTALL_C.primary : INSTALL_C.border}`,
      borderRadius: 16, padding: '12px 14px',
      animation: highlight ? 'install-step-pulse 0.7s ease 3' : 'none',
      transition: 'border-color 0.3s',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      flex: 1,
    }}>
      {/* Numero */}
      <div style={{
        width: 30, height: 30, borderRadius: 50, flexShrink: 0,
        background: 'rgba(245,158,11,0.14)',
        border: '1px solid rgba(245,158,11,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800, color: INSTALL_C.primaryD,
      }}>{n}</div>
      {/* Testo */}
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.45, color: INSTALL_C.text, textAlign: 'left' }}>
        {text}
      </div>
      {/* Illustrazione miniatura */}
      <div style={{
        width: 90, flexShrink: 0, borderRadius: 10, overflow: 'hidden',
        background: '#1a1a1a', border: '1px solid rgba(0,0,0,0.1)',
      }}>
        {illustration}
      </div>
    </div>
  )
}

export default function AuthPage() {
  const t = useT()
  const navigate = useNavigate()
  const [view, setView] = useState('login') // 'login' | 'register' | 'forgot'

  // Stato: dopo Google OAuth l'utente esiste ma non ha ancora uno username
  const [needsUsername, setNeedsUsername] = useState(false)

  // Stato: Google OAuth ha trovato email già registrata → proponi collegamento
  const [linkData, setLinkData] = useState(null) // { email, google_name, credential }

  // Se aperto da browser mobile (non PWA standalone) → mostra istruzioni installazione
  const isMobileBrowser = (
    /android|iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !window.matchMedia('(display-mode: standalone)').matches &&
    window.navigator.standalone !== true &&
    new URLSearchParams(window.location.search).get('pwa') !== '1'
  )

  const [bypassInstall, setBypassInstall] = useState(false)
  if (isMobileBrowser && !bypassInstall) return <InstallScreen onBack={() => { window.location.href = '/' }} />

  // Callback per Google login: naviga direttamente se ha già username, altrimenti
  // mostra il picker dello username (solo per nuovi account Google).
  const handleGoogleSuccess = (user) => {
    if (user?.username) {
      navigate('/', { replace: true })
    } else {
      setNeedsUsername(true)
    }
  }

  // Callback quando Google trova un account già esistente non collegato
  const handleLinkRequired = (data) => {
    setLinkData(data)
  }

  // Schermata scelta username — mostrata subito dopo Google OAuth per nuovi utenti
  if (needsUsername) {
    return <UsernameSetupScreen onDone={() => navigate('/', { replace: true })} />
  }

  // Schermata collegamento account Google
  if (linkData) {
    return (
      <LinkAccountScreen
        email={linkData.email}
        googleName={linkData.google_name}
        credential={linkData.credential}
        onDone={() => navigate('/', { replace: true })}
        onCancel={() => setLinkData(null)}
      />
    )
  }

  const titles = {
    login:    t('authLoginTitle'),
    register: t('authRegisterTitle'),
    forgot:   t('authForgotTitle'),
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
          <img src={logoUrl} alt="Endyo" style={{ width: 80, height: 80, borderRadius: 20, objectFit: 'contain', marginBottom: 14 }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
            {titles[view]}
          </h1>
          {view === 'login' && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('authDigitalWardrobe')}</p>
          )}
        </div>

        {view === 'login'    && <LoginForm    onForgot={() => setView('forgot')}   onRegister={() => setView('register')} onGoogleSuccess={handleGoogleSuccess} onGoogleLinkRequired={handleLinkRequired} />}
        {view === 'register' && <RegisterForm onLogin={() => setView('login')} onGoogleSuccess={handleGoogleSuccess} onGoogleLinkRequired={handleLinkRequired} />}
        {view === 'forgot'   && <ForgotForm   onBack={() => setView('login')} />}
      </div>
    </div>
  )
}
