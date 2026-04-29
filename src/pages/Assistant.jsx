import { useState, useRef, useEffect } from 'react'
import { chatWithStylist } from '../api/client'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { useT } from '../i18n'

const SUGGESTIONS = {
  it: [
    'Cosa indosso per una cena elegante?',
    'Come abbinare i jeans neri?',
    'Qual è il mio capo più versatile?',
    'Crea un look per il weekend',
    'Come mixare stili diversi?',
    'Consigli per i colori di stagione',
  ],
  en: [
    'What should I wear for an elegant dinner?',
    'How do I style black jeans?',
    'What is my most versatile item?',
    'Create a weekend look',
    'How to mix different styles?',
    'Color advice for this season',
  ],
}

export default function Assistant() {
  const garments = useWardrobeStore(s => s.garments)
  const profile  = useWardrobeStore(s => s.profile)
  const language = useSettingsStore(s => s.language) || 'it'
  const t = useT()

  const welcomeMessage = (n, lang) => lang === 'en'
    ? `Hi! 👋 I'm your AI personal stylist.\n\nI have access to your wardrobe with ${n} ${n === 1 ? 'item' : 'items'}. Ask me what to wear, how to combine your pieces, or any style advice!\n\nHow can I help you today?`
    : `Ciao! 👋 Sono il tuo personal stylist AI.\n\nHo accesso al tuo armadio con ${n} ${n === 1 ? 'capo' : 'capi'}. Chiedimi cosa indossare, come abbinare i tuoi capi, o qualsiasi consiglio di stile!\n\nCosa posso fare per te oggi?`

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: welcomeMessage(garments.length, language),
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Update initial message when garments load or language changes
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: welcomeMessage(garments.length, language),
    }])
  }, [garments.length, language])

  const send = async (text) => {
    if (!text.trim() || loading) return
    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Build history for API (exclude first welcome message)
    const history = messages.slice(1).map(m => ({ role: m.role, content: m.content }))

    try {
      const { reply } = await chatWithStylist(text, history, language)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('assistantError'),
      }])
    }
    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '18px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--primary), #c084fc)',
          flexShrink: 0,
        }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{t('assistantTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
            {t('assistantOnline', garments.length)}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map((msg, i) => (
          <Message key={i} msg={msg} />
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary), #c084fc)',
              flexShrink: 0,
            }} />
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '18px 18px 18px 4px',
              padding: '12px 16px',
              display: 'flex',
              gap: 4,
              alignItems: 'center',
            }}>
              {[0, 1, 2].map(j => (
                <div
                  key={j}
                  style={{
                    width: 6, height: 6,
                    borderRadius: '50%',
                    background: 'var(--text-dim)',
                    animation: `bounce 1s ease infinite ${j * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips */}
      {messages.length <= 1 && (
        <div style={{
          padding: '0 24px 12px',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          {(SUGGESTIONS[language] || SUGGESTIONS.it).map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              style={{
                padding: '7px 14px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                color: 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
              onMouseEnter={e => { e.target.style.color = 'var(--text)'; e.target.style.borderColor = 'var(--primary)' }}
              onMouseLeave={e => { e.target.style.color = 'var(--text-muted)'; e.target.style.borderColor = 'var(--border)' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '12px 24px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        gap: 10,
        flexShrink: 0,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={language === 'en' ? 'Ask your stylist for advice… (Enter to send)' : 'Chiedi consiglio al tuo stylist… (Invio per inviare)'}
          rows={1}
          style={{
            flex: 1,
            padding: '11px 16px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            color: 'var(--text)',
            fontSize: 14,
            fontFamily: 'var(--font)',
            resize: 'none',
            outline: 'none',
            lineHeight: 1.5,
            transition: 'var(--transition)',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--primary)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="btn btn-primary"
          style={{ padding: '11px 18px', alignSelf: 'flex-end' }}
        >
          →
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      gap: 10,
      alignItems: 'flex-end',
      flexDirection: isUser ? 'row-reverse' : 'row',
    }}>
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--primary), #c084fc)',
          flexShrink: 0,
        }} />
      )}
      <div style={{
        maxWidth: '75%',
        padding: '12px 16px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser
          ? 'linear-gradient(135deg, var(--primary), #7c3aed)'
          : 'var(--card)',
        border: isUser ? 'none' : '1px solid var(--border)',
        color: 'var(--text)',
        fontSize: 14,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  )
}
