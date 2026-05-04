import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { authVerifyEmail } from '../api/client'
import { useT } from '../i18n'
const logoUrl = './Endyoapp.png'
import { IconCheckCircle, IconAlertTriangle } from '../components/Icons'

export default function VerifyEmailPage() {
  const { token } = useParams()
  const navigate  = useNavigate()
  const t = useT()
  const [status, setStatus] = useState('loading') // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage(t('verifyEmailTokenMissing')); return }
    authVerifyEmail(token)
      .then(data => {
        setMessage(data.message)
        setStatus('success')
        // Auto-redirect al login dopo 3 secondi
        setTimeout(() => navigate('/auth', { replace: true }), 3000)
      })
      .catch(err => { setMessage(err.response?.data?.detail || t('verifyEmailFailed')); setStatus('error') })
  }, [token])

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
        <img src={logoUrl} alt="Endyo" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'contain', marginBottom: 20 }} />

        {status === 'loading' && (
          <>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('verifyEmailLoading')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ marginBottom: 12, color: 'var(--success)', display: 'flex', justifyContent: 'center' }}><IconCheckCircle size={52} /></div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t('verifyEmailSuccess')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8 }}>
              {message}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24 }}>
              {t('verifyEmailRedirect')}
            </p>
            <button
              onClick={() => navigate('/auth', { replace: true })}
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px 0' }}
            >
              {t('verifyEmailLoginNow')}
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ marginBottom: 12, color: '#f87171', display: 'flex', justifyContent: 'center' }}><IconAlertTriangle size={52} /></div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t('verifyEmailFailed')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
              {message}
            </p>
            <button
              onClick={() => navigate('/auth', { replace: true })}
              className="btn btn-ghost"
              style={{ width: '100%' }}
            >
              {t('verifyEmailBack')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
