/**
 * AdSidebar — colonna destra con:
 *   1. Slot Google AdSense (skyscraper 160×600)
 *   2. Brand ad interno rotante
 *
 * AdSense NON funziona in Electron locale: in quell'ambiente viene mostrato
 * un placeholder "Pubblica qui". I tag <ins> sono già pronti per il deploy web.
 *
 * Per attivare AdSense su web:
 *   1. Crea un account AdSense su https://adsense.google.com
 *   2. Sostituisci ADSENSE_CLIENT_ID con il tuo "ca-pub-XXXXXXXXXXXXXXXXX"
 *   3. Sostituisci ADSENSE_SLOT_ID con il codice slot corretto
 *   4. Aggiungi lo script AdSense nell'index.html (già presente con placeholder)
 */

import { useState, useEffect, useCallback } from 'react'
import { getAdBrands, imgUrl } from '../api/client'
import useAuthStore from '../store/authStore'

// ─── Configura qui le tue credenziali AdSense ────────────────────────────────
const ADSENSE_CLIENT_ID = 'ca-pub-XXXXXXXXXXXXXXXXX'   // ← sostituisci
const ADSENSE_SLOT_ID   = 'XXXXXXXXXX'                  // ← sostituisci
// ─────────────────────────────────────────────────────────────────────────────

const isElectron = typeof navigator !== 'undefined' &&
  navigator.userAgent.includes('Electron')

// ── Slot AdSense / placeholder ────────────────────────────────────────────────
function AdSenseSlot() {
  useEffect(() => {
    if (!isElectron) {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch {}
    }
  }, [])

  if (isElectron || ADSENSE_CLIENT_ID.includes('XXXX')) {
    return (
      <div style={{
        width: 160, height: 600,
        border: '1px dashed var(--border)',
        borderRadius: 12,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 10,
        background: 'var(--card)',
        color: 'var(--text-dim)',
        cursor: 'default',
        userSelect: 'none',
      }}>
        {/* Mini logo adv */}
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'var(--primary-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
            stroke="var(--primary-light)" strokeWidth={1.75}
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
        </div>
        <div style={{ textAlign: 'center', padding: '0 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
            Spazio pubblicitario
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.4 }}>
            Google AdSense attivo su versione web
          </div>
        </div>
        <div style={{
          fontSize: 9, color: 'var(--text-dim)', opacity: 0.6,
          border: '1px solid var(--border)', borderRadius: 4,
          padding: '2px 6px',
        }}>
          160 × 600
        </div>
      </div>
    )
  }

  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block', width: 160, height: 600 }}
      data-ad-client={ADSENSE_CLIENT_ID}
      data-ad-slot={ADSENSE_SLOT_ID}
    />
  )
}

// ── Card brand interna ─────────────────────────────────────────────────────────
function BrandAdCard({ ad }) {
  return (
    <a
      href={ad.buy_url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', flexDirection: 'column',
        width: 160, borderRadius: 12, overflow: 'hidden',
        border: '1px solid var(--border)', background: 'var(--card)',
        textDecoration: 'none', color: 'inherit',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      {/* Immagine prodotto */}
      {ad.photo_url ? (
        <img
          src={imgUrl(ad.photo_url)}
          alt={ad.name}
          style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: 130, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        </div>
      )}

      {/* Info */}
      <div style={{ padding: '8px 10px 10px' }}>
        {/* Badge sponsorizzato */}
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
          color: '#f59e0b', marginBottom: 4, textTransform: 'uppercase',
        }}>
          Sponsorizzato
        </div>
        {/* Brand name */}
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>
          {ad.brand_name}
        </div>
        {/* Product name */}
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, marginBottom: 6, color: 'var(--text)' }}>
          {ad.name}
        </div>
        {/* Prezzo + CTA */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {ad.price ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-light)' }}>
              {ad.currency}{ad.price}
            </span>
          ) : <span />}
          <span style={{
            fontSize: 10, fontWeight: 700,
            background: 'var(--primary)', color: 'white',
            borderRadius: 6, padding: '3px 8px',
          }}>
            Scopri →
          </span>
        </div>
      </div>
    </a>
  )
}

// ── AdSidebar principale ───────────────────────────────────────────────────────
export default function AdSidebar() {
  const user = useAuthStore(s => s.user)
  const [ads, setAds]   = useState([])
  const [idx, setIdx]   = useState(0)

  const loadAds = useCallback(() => {
    getAdBrands().then(data => {
      if (Array.isArray(data) && data.length > 0) setAds(data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadAds()
    // Ruota l'ad brand ogni 45 secondi
    const rotate = setInterval(() => setIdx(i => i + 1), 45000)
    // Ricarica prodotti ogni 5 minuti
    const reload = setInterval(loadAds, 300000)
    return () => { clearInterval(rotate); clearInterval(reload) }
  }, [loadAds])

  const currentAd = ads.length > 0 ? ads[idx % ads.length] : null

  if (user?.plan?.startsWith('premium_plus')) return null

  return (
    <aside style={{
      width: 184,
      flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 14,
      padding: '20px 12px',
      background: 'var(--surface)',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* Label discreta */}
      <div style={{
        fontSize: 9, color: 'var(--text-dim)', opacity: 0.5,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        alignSelf: 'flex-start',
      }}>
        Annunci
      </div>

      {/* Slot AdSense */}
      <AdSenseSlot />

      {/* Brand ad interno */}
      {currentAd && <BrandAdCard ad={currentAd} />}
    </aside>
  )
}
