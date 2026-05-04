import { useNavigate } from 'react-router-dom'
import useSettingsStore from '../store/settingsStore'

export default function QuotaBanner({ style }) {
  const navigate = useNavigate()
  const language = useSettingsStore(s => s.language) || 'it'
  const en = language === 'en'

  return (
    <div style={{
      borderRadius: 16,
      border: '1px solid rgba(239,68,68,0.25)',
      background: 'rgba(239,68,68,0.06)',
      padding: '24px 20px 20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 14, textAlign: 'center',
      ...style,
    }}>
      <div style={{ fontSize: 36, lineHeight: 1 }}>😔</div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 6 }}>
          {en ? "Oops… you've run out of credits" : 'Ops… hai finito i tuoi crediti'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {en
            ? 'Upgrade your plan to get more, or wait for the daily reset.'
            : 'Passa a un piano superiore per averne di più, oppure attendi il reset giornaliero.'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <button
          onClick={() => navigate('/settings', { state: { openSection: 'usage' } })}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {en ? 'View usage' : 'Vedi utilizzo'}
        </button>
        <button
          onClick={() => navigate('/premium')}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 12,
            border: 'none',
            background: 'var(--primary)', color: 'white',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {en ? 'View plans' : 'Vedi piani'}
        </button>
      </div>
    </div>
  )
}
