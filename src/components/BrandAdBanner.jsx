/**
 * BrandAdBanner — banner orizzontale nativo con prodotto brand.
 * Si carica in autonomia, ruota ogni 45s, non mostra nulla se non ci sono brand attivi.
 */

import { useState, useEffect, useCallback } from 'react'
import { getAdBrands, imgUrl } from '../api/client'
import useAuthStore from '../store/authStore'

export default function BrandAdBanner({ style = {} }) {
  const user = useAuthStore(s => s.user)
  const [ads, setAds] = useState([])
  const [idx, setIdx] = useState(0)

  const loadAds = useCallback(() => {
    getAdBrands().then(data => {
      if (Array.isArray(data) && data.length > 0) setAds(data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadAds()
    const rotate = setInterval(() => setIdx(i => i + 1), 45000)
    const reload  = setInterval(loadAds, 300000)
    return () => { clearInterval(rotate); clearInterval(reload) }
  }, [loadAds])

  const ad = ads.length > 0 ? ads[idx % ads.length] : null
  if (!ad || user?.plan?.startsWith('premium_plus')) return null

  return (
    <a
      href={ad.buy_url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'background 0.15s, box-shadow 0.15s',
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.boxShadow = '' }}
    >
      {/* Foto prodotto */}
      {ad.photo_url ? (
        <img
          src={imgUrl(ad.photo_url)}
          alt={ad.name}
          style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
        />
      ) : (
        <div style={{
          width: 56, height: 56, borderRadius: 10, flexShrink: 0,
          background: 'var(--card)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-dim)',
        }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
      )}

      {/* Testo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sponsorizzato
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>·</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{ad.brand_name}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
          {ad.name}
        </div>
        {ad.price && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {ad.currency}{ad.price}
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{
        flexShrink: 0,
        fontSize: 12, fontWeight: 700,
        background: 'var(--primary)', color: 'white',
        borderRadius: 8, padding: '7px 14px',
        whiteSpace: 'nowrap',
      }}>
        Scopri →
      </div>
    </a>
  )
}
