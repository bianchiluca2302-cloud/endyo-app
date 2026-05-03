/**
 * MobileAdBanner — banner orizzontale (320×50) per la versione mobile.
 *
 * Utilizzato due volte in App.jsx:
 *   • position="top"    → sopra il <main>, sotto l'eventuale errore backend
 *   • position="bottom" → tra <main> e <MobileTabBar>
 *
 * In ambiente Electron o con credenziali placeholder vengono mostrati
 * dei segnaposto grafici. I tag <ins> AdSense sono pronti per il deploy web.
 *
 * Per attivare AdSense:
 *   1. Sostituisci ADSENSE_CLIENT_ID con il tuo "ca-pub-XXXXXXXXXXXXXXXXX"
 *   2. Sostituisci ADSENSE_SLOT_TOP / ADSENSE_SLOT_BOTTOM con i codici slot
 *      (crea due slot separati nel pannello AdSense — tipo "Banner mobile")
 *   3. Decommenta lo <script> AdSense in index.html
 */

import { useState, useEffect, useCallback } from 'react'
import { getAdBrands, imgUrl } from '../api/client'
import useAuthStore from '../store/authStore'

// ─── Credenziali AdSense ─────────────────────────────────────────────────────
const ADSENSE_CLIENT_ID   = 'ca-pub-2435292000410787'
const ADSENSE_SLOT_TOP    = 'AAAAAAAAAA'   // ← crea slot "Banner mobile top"
const ADSENSE_SLOT_BOTTOM = 'BBBBBBBBBB'   // ← crea slot "Banner mobile bottom"
// ─────────────────────────────────────────────────────────────────────────────

const isElectron = typeof navigator !== 'undefined' &&
  navigator.userAgent.includes('Electron')

const hasRealCreds = !ADSENSE_CLIENT_ID.includes('XXXX')

/* ── Slot AdSense (o placeholder) ─────────────────────────────────────────── */
function AdSenseSlot({ slot, position }) {
  useEffect(() => {
    if (!isElectron && hasRealCreds) {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch {}
    }
  }, [])

  /* Placeholder locale */
  if (isElectron || !hasRealCreds) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: 50, background: 'var(--card)',
        borderTop:    position === 'bottom' ? '1px solid var(--border)' : 'none',
        borderBottom: position === 'top'    ? '1px solid var(--border)' : 'none',
      }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
          stroke="var(--text-dim)" strokeWidth={1.5} strokeLinecap="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <path d="M8 21h8M12 17v4"/>
        </svg>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
          Annuncio · 320×50
        </span>
      </div>
    )
  }

  /* Tag AdSense reale */
  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block', width: '100%', height: 50 }}
      data-ad-client={ADSENSE_CLIENT_ID}
      data-ad-slot={slot}
      data-ad-format="banner"
      data-full-width-responsive="true"
    />
  )
}

/* ── Card brand interna (rotante ogni 45s) ─────────────────────────────────── */
function BrandBanner({ ad }) {
  if (!ad) return null
  return (
    <a
      href={ad.buy_url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        height: 50, padding: '0 14px',
        background: 'var(--card)',
        textDecoration: 'none', color: 'inherit',
        overflow: 'hidden',
      }}
    >
      {/* Immagine prodotto */}
      {ad.photo_url ? (
        <img
          src={imgUrl(ad.photo_url)}
          alt={ad.name}
          style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: 'var(--primary-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--primary-light)" strokeWidth={1.5}>
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
      )}

      {/* Testo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Sponsorizzato · {ad.brand_name}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {ad.name}
        </div>
      </div>

      {/* CTA */}
      <span style={{
        fontSize: 11, fontWeight: 700, flexShrink: 0,
        background: 'var(--primary)', color: 'white',
        borderRadius: 8, padding: '5px 12px',
        WebkitTapHighlightColor: 'transparent',
      }}>
        Scopri
      </span>
    </a>
  )
}

/* ── Componente principale ─────────────────────────────────────────────────── */
export default function MobileAdBanner({ position = 'bottom' }) {
  const user = useAuthStore(s => s.user)
  const [ads, setAds] = useState([])
  const [idx, setIdx] = useState(0)

  const load = useCallback(() => {
    getAdBrands().then(data => { if (Array.isArray(data) && data.length) setAds(data) }).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const rot = setInterval(() => setIdx(i => i + 1), 45000)
    const rel = setInterval(load, 300000)
    return () => { clearInterval(rot); clearInterval(rel) }
  }, [load])

  /* Utenti premium_plus: nessuna pubblicità */
  if (user?.plan?.startsWith('premium_plus')) return null

  const slot        = position === 'top' ? ADSENSE_SLOT_TOP : ADSENSE_SLOT_BOTTOM
  const currentAd = ads.length > 0 ? ads[idx % ads.length] : null

  // Il banner inferiore è position:fixed a bottom:0, sotto la tab bar (che è a bottom:50px)
  const positionStyle = position === 'bottom'
    ? { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 490 }
    : {}
  const borderStyle = position === 'top'
    ? { borderBottom: '1px solid var(--border)' }
    : { borderTop:    '1px solid var(--border)' }

  // Quando position="top", il banner deve estendersi dentro la safe-area per
  // coprire il "buco" tra la notch/dynamic-island e il contenuto dell'app.
  const topSafeArea = position === 'top'
    ? { paddingTop: 'env(safe-area-inset-top, 0px)' }
    : {}

  return (
    <div style={{ width: '100%', flexShrink: 0, background: 'var(--card)', ...borderStyle, ...positionStyle, ...topSafeArea }}>
      {/* Se ci sono brand interni li mostriamo a rotazione, altrimenti AdSense */}
      {currentAd ? (
        <BrandBanner ad={currentAd} />
      ) : (
        <AdSenseSlot slot={slot} position={position} />
      )}
    </div>
  )
}
