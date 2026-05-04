import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { authResetPassword } from '../api/client'
import { useT } from '../i18n'
const logoUrl = './Endyoapp.png'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconEye = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)
const IconEyeOff = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)
const IconCheck = () => (
  <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

// ── Password field ────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="input"
          style={{ width: '100%', paddingRight: 42 }}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', padding: 4, display: 'flex', alignItems: 'center',
          }}
        >
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ResetPasswordPage() {
  const { token } = useParams()
  const t = useT()

  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError(t('resetPasswordErrLength')); return }
    if (password !== confirm) { setError(t('resetPasswordErrMatch'));  return }
    setLoading(true)
    try {
      await authResetPassword(token, password)
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.detail || t('resetPasswordErrGeneric'))
    }
    setLoading(false)
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 400, textAlign: 'center',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 20, padding: '40px 36px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <img src={logoUrl} alt="Endyo" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'contain', marginBottom: 20 }} />

        {success ? (
          <>
            {/* Success icon circle */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
              background: 'rgba(16,185,129,0.12)',
              border: '2px solid rgba(16,185,129,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--success)',
            }}>
              <IconCheck />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.02em' }}>
              {t('resetPasswordSuccess')}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 24 }}>
              {t('resetPasswordSuccessDesc')}
            </p>
            {/* No navigate button — this is a browser tab opened from email */}
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 18px',
              fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5,
            }}>
              Puoi chiudere questa pagina e tornare al login nell'app.
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, textAlign: 'left', letterSpacing: '-0.02em' }}>
              {t('resetPasswordTitle')}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, textAlign: 'left', lineHeight: 1.5 }}>
              {t('resetPasswordDesc')}
            </p>
            <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
              <Field
                label={t('resetPasswordNewLabel')}
                value={password}
                onChange={setPassword}
                placeholder={t('resetPasswordPlaceholderMin')}
              />
              <Field
                label={t('resetPasswordConfirmLabel')}
                value={confirm}
                onChange={setConfirm}
                placeholder={t('resetPasswordPlaceholderRepeat')}
              />
              {error && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 8, color: '#f87171',
                  fontSize: 12.5, marginBottom: 16, lineHeight: 1.4,
                }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ width: '100%', padding: '11px 0', fontSize: 14 }}
              >
                {loading
                  ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  : t('resetPasswordSubmit')
                }
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
