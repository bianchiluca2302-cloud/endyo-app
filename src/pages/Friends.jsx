import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import PageTutorial from '../components/PageTutorial'
import useIsMobile from '../hooks/useIsMobile'
import {
  getSocialFeed, toggleLike, getComments, addComment, deleteComment,
  deleteSocialPost, searchUsers, followUser, fetchFollowing, fetchFollowers,
  unfollowUser, imgUrl, getUserPosts, getAdBrands,
} from '../api/client'
import useAuthStore from '../store/authStore'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { useT } from '../i18n'
import CreatePostModal from '../components/CreatePostModal'
import OutfitCanvas from '../components/OutfitCanvas'
import {
  IconHeart, IconMessageCircle, IconSearch, IconPlus,
  IconTrash, IconShoppingBag, IconSparkle,
} from '../components/Icons'

// ── Garment hover tooltip (desktop feed) ─────────────────────────────────────
function GarmentTooltip({ data }) {
  if (!data) return null
  const { garment: g, rect } = data

  const TOOLTIP_W = 252
  const spaceRight = window.innerWidth - rect.right
  const left = spaceRight >= TOOLTIP_W + 20
    ? rect.right + 12
    : rect.left - TOOLTIP_W - 12
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - 440))

  const photo = g.photo_bg || g.photo_front

  // Chip riga: categoria · taglia · prezzo
  const rowChip = (label, value, accent) => value ? (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={{ fontSize: 8.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: accent || 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  ) : null

  const allStyleTags = [...(g.style_tags || []), ...(g.occasion_tags || [])].slice(0, 6)
  const seasonLabel = (g.season_tags || []).join(' · ')

  const node = (
    <div style={{
      position: 'fixed', top, left,
      width: TOOLTIP_W, zIndex: 99999,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
      pointerEvents: 'none',
      animation: 'tooltipIn 0.18s cubic-bezier(0.16,1,0.3,1)',
    }}>

      {/* ── Foto ── */}
      <div style={{ height: 160, background: 'var(--surface)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {photo ? (
          <img src={imgUrl(photo)} alt={g.name || g.category}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 10 }} />
        ) : (
          <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.18 }}>
            <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>
          </svg>
        )}
        {/* Brand badge */}
        {g.brand && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 99, padding: '2px 9px',
            fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.92)',
          }}>{g.brand}</div>
        )}
        {/* Pallino colore */}
        {g.color_hex && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            width: 18, height: 18, borderRadius: '50%',
            background: g.color_hex,
            border: '2px solid rgba(255,255,255,0.25)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          }} title={g.color_primary || ''} />
        )}
      </div>

      {/* ── Corpo info ── */}
      <div style={{ padding: '11px 13px 13px', display: 'flex', flexDirection: 'column', gap: 9 }}>

        {/* Nome + categoria */}
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {g.name || g.category}
          </div>
          {g.category && g.name && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{g.category}</div>
          )}
        </div>

        {/* Riga proprietà: taglia · colore · prezzo */}
        <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
          {rowChip('Taglia', g.size)}
          {rowChip('Colore', g.color_primary)}
          {rowChip('Prezzo', g.price ? `€${g.price}` : null, 'var(--primary-light)')}
        </div>

        {/* Materiale + stagione */}
        {(g.material || seasonLabel) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {g.material && (
              <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600 }}>
                {g.material}
              </span>
            )}
            {seasonLabel && (
              <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 99, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', color: 'var(--primary-light)', fontWeight: 600 }}>
                {seasonLabel}
              </span>
            )}
          </div>
        )}

        {/* Style tags + occasion tags */}
        {allStyleTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {allStyleTags.map((tag, i) => (
              <span key={i} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 99, background: 'var(--primary-dim)', color: 'var(--primary-light)', fontWeight: 600 }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Descrizione AI */}
        {(g.description || g.ai_description) && (
          <p style={{
            fontSize: 10.5, color: 'var(--text-muted)', margin: 0,
            lineHeight: 1.55, display: '-webkit-box',
            WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            borderTop: '1px solid var(--border)', paddingTop: 8,
          }}>
            {g.description || g.ai_description}
          </p>
        )}

      </div>
    </div>
  )

  return createPortal(node, document.body)
}

// ── Google Ad (desktop feed) ──────────────────────────────────────────────────
const ADSENSE_CLIENT_ID = 'ca-pub-XXXXXXXXXXXXXXXXX'
const ADSENSE_SLOT_FEED = 'CCCCCCCCCC'
const hasRealCreds = !ADSENSE_CLIENT_ID.includes('XXXX')
const isElectron   = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')

function FeedAdCard({ lang }) {
  useEffect(() => {
    if (!isElectron && hasRealCreds) {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch {}
    }
  }, [])

  const label = lang === 'en' ? 'Ad' : 'Annuncio'

  if (isElectron || !hasRealCreds) {
    return (
      <div style={{
        borderRadius: 14, border: '1px solid var(--border)',
        background: 'var(--surface)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px 6px' }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #4285f4, #34a853)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 13, fontWeight: 800,
          }}>G</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Google</div>
            <div style={{ fontSize: 10, color: '#4285f4', fontWeight: 600 }}>{label}</div>
          </div>
        </div>
        <div style={{
          height: 120, background: 'linear-gradient(135deg, var(--card), var(--surface))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          color: 'var(--text-dim)',
        }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          <span style={{ fontSize: 11, letterSpacing: '0.04em' }}>{label} · 468×60</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: 120 }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={ADSENSE_SLOT_FEED}
        data-ad-format="rectangle"
        data-full-width-responsive="true"
      />
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(isoStr, t) {
  if (!isoStr) return ''
  const utcStr = isoStr.endsWith('Z') ? isoStr : isoStr + 'Z'
  const diff = Math.floor((Date.now() - new Date(utcStr)) / 1000)
  if (diff < 60) return t('feedJustNow')
  if (diff < 3600) return t('feedTimeAgo', Math.floor(diff / 60), 'min')
  if (diff < 86400) return t('feedTimeAgo', Math.floor(diff / 3600), 'h')
  return t('feedTimeAgo', Math.floor(diff / 86400), 'g')
}

function Avatar({ src, username, size = 36 }) {
  const [err, setErr] = useState(false)
  const picSrc = src ? imgUrl(src) : null
  if (picSrc && !err) {
    return (
      <img
        src={picSrc}
        alt={username}
        onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  const initials = (username || '?')[0].toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--primary), #c084fc)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: 700, fontSize: size * 0.38,
    }}>
      {initials}
    </div>
  )
}

// ── Separatore visuale tra post ───────────────────────────────────────────────
function PostSeparator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 2px', opacity: 0.35 }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, var(--border))' }} />
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--primary)' }} />
        ))}
      </div>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border), transparent)' }} />
    </div>
  )
}

// ── Quick compose bar (parte alta del feed) ───────────────────────────────────
function QuickCompose({ user, onClick, lang }) {
  const placeholder = lang === 'en' ? 'Share a look with your followers…' : 'Condividi un look con i tuoi follower…'
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        background: 'var(--surface)', borderRadius: 14,
        border: '1px solid var(--border)', marginBottom: 16,
        cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-dim)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <Avatar src={user?.profile_picture} username={user?.username} size={34} />
      <div style={{
        flex: 1, fontSize: 13, color: 'var(--text-dim)',
        background: 'var(--card)', borderRadius: 99,
        padding: '7px 14px', border: '1px solid var(--border)',
        userSelect: 'none',
      }}>
        {placeholder}
      </div>
      <button
        className="btn btn-primary btn-sm"
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
        onClick={e => { e.stopPropagation(); onClick() }}
      >
        <IconPlus size={13} />
        Post
      </button>
    </div>
  )
}

// ── Sezione commenti ──────────────────────────────────────────────────────────
function CommentsSection({ postId, t }) {
  const [comments, setComments] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    getComments(postId).then(setComments).catch(() => setComments([]))
  }, [postId])

  const handleSend = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const c = await addComment(postId, text.trim())
      setComments(prev => [...(prev || []), c])
      setText('')
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async (commentId) => {
    await deleteComment(commentId)
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  if (comments === null) return (
    <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-dim)' }}>
      {t('loading')}
    </div>
  )

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--bg)' }}>
      {comments.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          {t('feedComments')} · 0
        </p>
      )}
      {comments.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
          <Avatar src={c.author?.profile_picture} username={c.author?.username} size={26} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12 }}>
              <span style={{ fontWeight: 700, marginRight: 6 }}>{c.author?.username}</span>
              <span style={{ color: 'var(--text-muted)' }}>{c.content}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{timeAgo(c.created_at, t)}</span>
              {c.is_mine && (
                <button
                  onClick={() => handleDelete(c.id)}
                  style={{ fontSize: 10, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {t('feedDeleteComment')}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          className="input"
          style={{ flex: 1, fontSize: 12, padding: '7px 10px' }}
          placeholder={t('feedCommentPlaceholder')}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '7px 14px' }}
        >
          {t('feedCommentSend')}
        </button>
      </div>
    </div>
  )
}

// ── Dialog conferma elimina ───────────────────────────────────────────────────
function ConfirmDeleteDialog({ onConfirm, onCancel, t, lang }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onCancel}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 320, border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)', padding: '24px 20px 18px', textAlign: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <IconTrash size={18} style={{ color: '#ef4444' }} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{t('feedDeletePost')}</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
          {lang === 'en' ? 'Are you sure? This post will be permanently removed.' : 'Sei sicuro? Il post verrà rimosso definitivamente.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} className="btn btn-ghost" style={{ flex: 1 }}>{t('cancel')}</button>
          <button onClick={onConfirm} className="btn" style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', padding: '9px 0', fontSize: 13 }}>{t('feedDeleteComment')}</button>
        </div>
      </div>
    </div>
  )
}

// ── Post card ─────────────────────────────────────────────────────────────────
function PostCard({ post, currentUsername, onDelete, t, onViewProfile, showDeleteBtn = false }) {
  const lang     = useSettingsStore(s => s.language) || 'it'
  const garments = useWardrobeStore(s => s.garments)
  const [liked, setLiked] = useState(post.liked_by_me)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [showComments, setShowComments] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [hoveredGarment, setHoveredGarment] = useState(null) // { garment, rect }

  const isMobile = useIsMobile()
  const handleGarmentHover = (garment, el) => {
    if (!garment || !el || isMobile) { setHoveredGarment(null); return }
    setHoveredGarment({ garment, rect: el.getBoundingClientRect() })
  }

  const handleLike = async () => {
    const prev = liked
    setLiked(!prev)
    setLikeCount(n => n + (prev ? -1 : 1))
    try { await toggleLike(post.id) } catch { setLiked(prev); setLikeCount(n => n + (prev ? 1 : -1)) }
  }

  const handleDelete = async () => {
    setConfirmDelete(false); setDeleting(true)
    try { await deleteSocialPost(post.id); onDelete(post.id) } catch { setDeleting(false) }
  }

  const isBrand  = post.type === 'brand'
  const isOutfit = post.item_type === 'outfit'
  const content  = post.content
  const coverUrl = content?.photo_url || content?.cover_url
  const isMyPost = !isBrand && post.author?.username === currentUsername && showDeleteBtn
  const bgColor  = post.bg_color || content?.bg_color

  // Ricostruisce i garments dell'outfit
  // Priorità: garments embedded nel post (con foto) > fallback dallo store locale
  let outfitGarments = []
  let outfitTransforms = {}
  if (isOutfit) {
    if (Array.isArray(content?.garments) && content.garments.length > 0) {
      outfitGarments   = content.garments
      outfitTransforms = content.transforms || {}
    } else if (garments?.length) {
      const ids = content?.garment_ids || []
      outfitGarments = ids.map(id => garments.find(g => g.id === id)).filter(Boolean)
    }
  }

  const canShowCanvas = isOutfit && outfitGarments.length > 0

  return (
    <>
      {confirmDelete && <ConfirmDeleteDialog onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} t={t} lang={lang} />}
      {/* Outer: border+radius only — no overflow here (fixes white-corner artifact on Safari) */}
      <div style={{ borderRadius: 16, border: `1px solid ${isBrand ? 'rgba(251,191,36,0.3)' : 'var(--border)'}`, isolation: 'isolate' }}>
      {/* Inner: overflow clips media, no border here */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          {isBrand ? (
            post.brand?.logo_url ? (
              <img src={imgUrl(post.brand.logo_url)} alt={post.brand?.name} style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'contain', border: '1px solid var(--border)', background: 'white' }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconShoppingBag size={18} />
              </div>
            )
          ) : (
            <button
              onClick={() => onViewProfile && post.author?.username && onViewProfile(post.author.username)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: onViewProfile ? 'pointer' : 'default' }}
            >
              <Avatar src={post.author?.profile_picture} username={post.author?.username} size={36} />
            </button>
          )}

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {isBrand ? post.brand?.name : (
                <button
                  onClick={() => onViewProfile && post.author?.username && onViewProfile(post.author.username)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: onViewProfile ? 'pointer' : 'default',
                    fontWeight: 700, fontSize: 13, color: 'var(--text)',
                  }}
                  onMouseEnter={e => { if (onViewProfile) e.currentTarget.style.color = 'var(--primary-light)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text)' }}
                >
                  @{post.author?.username}
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
              {timeAgo(post.created_at, t)}
              {isBrand && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(251,191,36,0.15)', color: '#f59e0b', fontWeight: 600 }}>
                  {t('feedSponsored')}
                </span>
              )}
              {post.item_type && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--primary-dim)', color: 'var(--primary-light)', fontWeight: 600 }}>
                  {post.item_type === 'outfit' ? `👗 ${t('feedPostTypeOutfit')}` : `✨ ${t('feedPostTypeGarment')}`}
                </span>
              )}
            </div>
          </div>

          {isMyPost && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              style={{
                opacity: deleting ? 0.4 : 1,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.28)',
                borderRadius: 8,
                cursor: 'pointer',
                color: '#ef4444',
                padding: '5px 8px',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.28)' }}
              title={deleting ? '' : t('feedDeletePost')}
            >
              <IconTrash size={14} />
            </button>
          )}
        </div>

        {/* Media — outfit canvas completo o immagine singola */}
        {canShowCanvas ? (
          <div style={{ width: '100%', background: bgColor || 'var(--card)' }}>
            <OutfitCanvas
              garmentItems={outfitGarments}
              transforms={outfitTransforms}
              bgColor={bgColor}
              height={420}
              onGarmentHover={!isMobile ? handleGarmentHover : undefined}
            />
            <GarmentTooltip data={hoveredGarment} />
          </div>
        ) : coverUrl ? (
          <div style={{ width: '100%', overflow: 'hidden', background: bgColor || (isOutfit ? 'var(--card)' : undefined), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={imgUrl(coverUrl)} alt={content?.name} style={{
              width: '100%', maxWidth: '100%', display: 'block',
              // Per gli outfit senza canvas, usa contain per non tagliare il capo
              objectFit: isOutfit ? 'contain' : (bgColor ? 'contain' : 'cover'),
              maxHeight: isOutfit ? 420 : 440,
              background: bgColor || 'transparent',
            }} />
          </div>
        ) : (
          <div style={{ height: 160, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-dim)' }}>
            <IconSparkle size={28} />
            <span style={{ fontSize: 12, opacity: 0.5 }}>{content?.name || t('feedNoContent')}</span>
          </div>
        )}

        {/* Info */}
        {(content?.name || post.caption || (isBrand && content?.buy_url)) && (
          <div style={{ padding: '10px 16px 0' }}>
            {content?.name && (
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: 'var(--text)' }}>
                {content.name}
                {content.price && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                    {content.currency || '€'}{content.price}
                  </span>
                )}
              </div>
            )}
            {post.caption && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>{post.caption}</p>
            )}
            {isBrand && content?.buy_url && (
              <a href={content.buy_url} target="_blank" rel="noopener noreferrer" className="btn btn-accent"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 14px', marginTop: 10, borderRadius: 8, textDecoration: 'none' }}>
                <IconShoppingBag size={13} />
                {t('feedShopNow')}
              </a>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 16, padding: '10px 16px' }}>
          <button onClick={handleLike} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: liked ? '#ef4444' : 'var(--text-muted)', fontSize: 13, fontWeight: liked ? 700 : 400, transition: 'color 0.15s', padding: 0 }}>
            <svg width={17} height={17} viewBox="0 0 24 24" fill={liked ? '#ef4444' : 'none'} stroke={liked ? '#ef4444' : 'currentColor'} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {likeCount > 0 && likeCount}
          </button>
          <button onClick={() => setShowComments(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: showComments ? 'var(--primary-light)' : 'var(--text-muted)', fontSize: 13, padding: 0 }}>
            <IconMessageCircle size={17} />
            {post.comment_count > 0 && post.comment_count}
          </button>
        </div>

        {showComments && <CommentsSection postId={post.id} t={t} />}
      </div>{/* /inner overflow */}
      </div>{/* /outer border */}
    </>
  )
}

// ── Brand card per People ─────────────────────────────────────────────────────
function BrandCard({ brand }) {
  return (
    <div style={{
      flexShrink: 0, width: 88,
      padding: '12px 8px 10px',
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
      cursor: 'default',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{
        width: 50, height: 50, borderRadius: 14, background: 'white',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {brand.logo_url
          ? <img src={imgUrl(brand.logo_url)} alt={brand.name} style={{ width: '85%', height: '85%', objectFit: 'contain' }} />
          : <IconShoppingBag size={22} style={{ opacity: 0.4 }} />
        }
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, textAlign: 'center', color: 'var(--text-muted)', lineHeight: 1.3, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {brand.name}
      </div>
      <div style={{ fontSize: 9, padding: '2px 8px', borderRadius: 99, background: 'rgba(251,191,36,0.15)', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.04em' }}>
        BRAND
      </div>
    </div>
  )
}

// ── Tab Persone ───────────────────────────────────────────────────────────────
// ── Suggested users strip based on wardrobe style_tags ───────────────────────
function SuggestedUsersStrip({ lang, onViewProfile, currentUser }) {
  const garments = useWardrobeStore(s => s.garments)
  const [suggested, setSuggested] = useState([])
  const [following, setFollowing] = useState(new Set())
  const [toggling, setToggling]   = useState({})

  useEffect(() => {
    // Build frequency map of style_tags
    const freq = {}
    garments.forEach(g => {
      (g.style_tags || []).forEach(tag => { freq[tag] = (freq[tag] || 0) + 1 })
    })
    const topTags = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([tag]) => tag)
    const fallback = ['casual', 'sporty', 'elegant', 'streetwear']
    const queryTags = topTags.length >= 2 ? topTags : fallback

    // Fetch users for each tag, deduplicate
    const seen = new Set()
    Promise.all(queryTags.map(tag => searchUsers(tag).catch(() => [])))
      .then(results => {
        const merged = []
        results.flat().forEach(u => {
          if (u.username && u.username !== currentUser && !seen.has(u.username)) {
            seen.add(u.username)
            merged.push(u)
          }
        })
        setSuggested(merged.slice(0, 8))
      })

    fetchFollowing()
      .then(list => setFollowing(new Set(list.map(u => u.username))))
      .catch(() => {})
  }, [garments, currentUser])

  const handleFollow = async (username) => {
    setToggling(p => ({ ...p, [username]: true }))
    try {
      if (following.has(username)) {
        const list = await fetchFollowing()
        const found = list.find(u => u.username === username)
        if (found) { await unfollowUser(found.friendship_id || found.id); setFollowing(p => { const s = new Set(p); s.delete(username); return s }) }
      } else {
        await followUser(username)
        setFollowing(p => new Set([...p, username]))
      }
    } catch {}
    finally { setToggling(p => ({ ...p, [username]: false })) }
  }

  if (suggested.length === 0) return null

  const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={sectionLabel}>
        {lang === 'en' ? '✦ Suggested for you' : '✦ Suggeriti per te'}
      </div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style>{`.suggested-strip::-webkit-scrollbar { display: none; }`}</style>
        {suggested.map((u, i) => (
          <div
            key={u.username}
            onClick={() => onViewProfile && onViewProfile(u.username)}
            style={{
              flexShrink: 0, width: 120,
              background: 'var(--card)', borderRadius: 14,
              border: '1px solid var(--border)',
              padding: '14px 10px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              transition: 'border-color 0.15s',
              animation: `friendsSlideUp 0.28s ease ${i * 50}ms backwards`,
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-border)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <Avatar src={u.profile_picture} username={u.username} size={46} />
            <div style={{ textAlign: 'center', minWidth: 0, width: '100%' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{u.username}</div>
              {u.name && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>}
            </div>
            <button
              onClick={e => { e.stopPropagation(); handleFollow(u.username) }}
              disabled={toggling[u.username]}
              style={{
                width: '100%', padding: '5px 0', fontSize: 11, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                border: following.has(u.username) ? '1px solid var(--border)' : '1px solid var(--primary)',
                background: following.has(u.username) ? 'var(--card)' : 'var(--primary)',
                color: following.has(u.username) ? 'var(--text-muted)' : '#fff',
                transition: 'all 0.15s',
              }}
            >
              {following.has(u.username) ? (lang === 'en' ? 'Following' : 'Segui già') : (lang === 'en' ? 'Follow' : 'Segui')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function PeopleTab({ t, lang, onViewProfile }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [following, setFollowing] = useState([])
  const [followers, setFollowers] = useState([])
  const [brands, setBrands] = useState([])
  const [loadingFollow, setLoadingFollow] = useState({})
  const user = useAuthStore(s => s.user)

  useEffect(() => {
    fetchFollowing().then(setFollowing).catch(() => {})
    fetchFollowers().then(setFollowers).catch(() => {})
    getAdBrands().then(data => setBrands(Array.isArray(data) ? data.slice(0, 10) : [])).catch(() => {})
  }, [])

  const doSearch = async (q) => {
    if (!q.trim()) { setResults([]); return }
    try {
      const res = await searchUsers(q)
      setResults(res.filter(u => u.username !== user?.username))
    } catch { setResults([]) }
  }

  const handleFollow = async (username) => {
    setLoadingFollow(p => ({ ...p, [username]: true }))
    try { await followUser(username); const updated = await fetchFollowing(); setFollowing(updated) }
    finally { setLoadingFollow(p => ({ ...p, [username]: false })) }
  }

  const handleUnfollow = async (friendshipId, username) => {
    setLoadingFollow(p => ({ ...p, [username]: true }))
    try { await unfollowUser(friendshipId); setFollowing(prev => prev.filter(f => f.friendship_id !== friendshipId)) }
    finally { setLoadingFollow(p => ({ ...p, [username]: false })) }
  }

  const followingMap = Object.fromEntries(following.map(f => [f.username, f.friendship_id]))
  const displayList  = query.trim() ? results : following

  // Follower che non segui ancora
  const followBack = followers.filter(f => !followingMap[f.username] && f.username !== user?.username)

  const UserRow = ({ u, showFollowBtn = true }) => {
    const isFollowing = !!followingMap[u.username]
    const fid         = followingMap[u.username]
    const loading     = loadingFollow[u.username]
    return (
      <div
        onClick={() => onViewProfile && onViewProfile(u.username)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', transition: 'border-color 0.15s', cursor: onViewProfile ? 'pointer' : 'default' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-border)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <Avatar src={u.profile_picture} username={u.username} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>@{u.username}</div>
          {u.name && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.name}</div>}
        </div>
        {showFollowBtn && u.username !== user?.username && (
          isFollowing ? (
            <button onClick={e => { e.stopPropagation(); handleUnfollow(fid, u.username) }} disabled={loading} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
              {t('friendsUnfollow')}
            </button>
          ) : (
            <button onClick={e => { e.stopPropagation(); handleFollow(u.username) }} disabled={loading} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>
              {t('friendsFollow')}
            </button>
          )
        )}
      </div>
    )
  }

  const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Ricerca */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }}>
          <IconSearch size={15} />
        </span>
        <input
          className="input" style={{ paddingLeft: 36 }}
          placeholder={`${t('feedSearchPeople')}…`}
          value={query}
          onChange={e => { setQuery(e.target.value); doSearch(e.target.value) }}
          onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-dim)' }}
          onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = '' }}
        />
      </div>

      {/* Persone suggerite in base ai gusti */}
      {!query.trim() && (
        <SuggestedUsersStrip lang={lang} onViewProfile={onViewProfile} currentUser={user?.username} />
      )}

      {/* Brand consigliati */}
      {!query.trim() && brands.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionLabel}>
            {lang === 'en' ? '✦ Brands to discover' : '✦ Brand da scoprire'}
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {brands.map((brand, i) => <BrandCard key={brand.id || i} brand={brand} />)}
          </div>
        </div>
      )}

      {/* Stats seguiti/follower */}
      {!query.trim() && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { label: lang === 'en' ? 'Following' : 'Seguiti', value: following.length, color: 'var(--primary)' },
            { label: lang === 'en' ? 'Followers' : 'Follower', value: followers.length, color: '#10b981' },
          ].map(stat => (
            <div key={stat.label} style={{ flex: 1, padding: '12px 14px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista seguiti / risultati ricerca */}
      {!query.trim() && (
        <div style={sectionLabel}>{t('feedFollowingTitle')} · {following.length}</div>
      )}
      {displayList.length === 0 && !query.trim() && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>{t('feedFollowingEmpty')}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayList.map(u => <UserRow key={u.id || u.username} u={u} />)}
      </div>

      {/* Segui anche — follower che non segui */}
      {!query.trim() && followBack.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={sectionLabel}>
            {lang === 'en' ? `Follow back · ${followBack.length}` : `Segui anche · ${followBack.length}`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {followBack.map(u => <UserRow key={u.id || u.username} u={u} />)}
          </div>
        </div>
      )}

      {/* Tutti i follower */}
      {!query.trim() && followers.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={sectionLabel}>{t('feedFollowersTitle')} · {followers.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {followers.map(u => (
              <div key={u.id || u.username}
                onClick={() => onViewProfile && onViewProfile(u.username)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', cursor: onViewProfile ? 'pointer' : 'default', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-border)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <Avatar src={u.profile_picture} username={u.username} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>@{u.username}</div>
                  {followingMap[u.username] && (
                    <div style={{ fontSize: 11, color: 'var(--primary-light)', marginTop: 1 }}>
                      {lang === 'en' ? '✓ Following' : '✓ Segui già'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Grid thumb migliorato ─────────────────────────────────────────────────────
function GridThumb({ post, coverUrl, onClick }) {
  const [hovered, setHovered] = useState(false)
  const bg = coverUrl ? imgUrl(coverUrl) : null

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', paddingBottom: '100%', background: 'var(--card)', cursor: 'pointer', overflow: 'hidden', borderRadius: 2 }}
    >
      {bg ? (
        <img src={bg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.2s ease', transform: hovered ? 'scale(1.06)' : 'scale(1)' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)' }}>
          <IconSparkle size={28} style={{ opacity: 0.3 }} />
        </div>
      )}

      {/* Badge tipo (outfit / capo) — sempre visibile in basso a sinistra */}
      {post.item_type && (
        <div style={{
          position: 'absolute', bottom: 5, left: 5,
          fontSize: 9, padding: '2px 6px', borderRadius: 5,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          color: 'white', fontWeight: 600, letterSpacing: '0.03em',
        }}>
          {post.item_type === 'outfit' ? '👗' : '✨'}
        </div>
      )}

      {/* Like count — sempre visibile in basso a destra */}
      {(post.like_count > 0) && !hovered && (
        <div style={{
          position: 'absolute', bottom: 5, right: 5,
          display: 'flex', alignItems: 'center', gap: 3,
          fontSize: 10, color: 'white', fontWeight: 700,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
          padding: '2px 6px', borderRadius: 5,
        }}>
          <IconHeart size={10} style={{ fill: '#ef4444', stroke: 'none' }} />
          {post.like_count}
        </div>
      )}

      {/* Overlay hover */}
      {hovered && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 13, fontWeight: 700, color: 'white' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconHeart size={14} style={{ fill: 'white', stroke: 'none' }} />
            {post.like_count ?? 0}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconMessageCircle size={14} />
            {post.comment_count ?? 0}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Tab I miei post ───────────────────────────────────────────────────────────
function MyPostsTab({ t, user, onDelete, lang, onCreatePost, onSelectPost }) {
  const [posts,  setPosts]  = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'outfit' | 'garment'

  useEffect(() => {
    if (!user?.username) return
    getUserPosts(user.username)
      .then(data => setPosts(Array.isArray(data) ? data : data.posts || []))
      .catch(() => setPosts([]))
  }, [user?.username])

  if (posts === null) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <div style={{ fontSize: 14 }}>{t('loading')}</div>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div style={{ paddingTop: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, opacity: 0.25 }}>
          <IconSparkle size={56} />
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{t('feedMyPostsEmpty')}</h3>
        <p style={{ fontSize: 13, marginBottom: 24 }}>{t('feedMyPostsEmptyHint')}</p>
        <button onClick={onCreatePost} className="btn btn-primary" style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }}>
          <IconPlus size={14} />
          {lang === 'en' ? 'Share your first look' : 'Condividi il tuo primo look'}
        </button>
      </div>
    )
  }

  const handleDelete = (postId) => {
    setPosts(prev => prev.filter(p => p.id !== postId))
    if (onDelete) onDelete(postId)
  }

  const totalLikes    = posts.reduce((s, p) => s + (p.like_count || 0), 0)
  const totalComments = posts.reduce((s, p) => s + (p.comment_count || 0), 0)
  const outfitCount   = posts.filter(p => p.item_type === 'outfit').length
  const garmentCount  = posts.filter(p => p.item_type === 'garment').length

  const filtered = filter === 'all' ? posts : posts.filter(p => p.item_type === filter)

  const StatCell = ({ label, value, color }) => (
    <div style={{ flex: 1, textAlign: 'center', padding: '10px 4px' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--primary-light)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ paddingTop: 8 }}>
      {/* Stats bar + bottone nuovo post */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flex: 1, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <StatCell label={lang === 'en' ? 'Posts' : 'Post'} value={posts.length} color="var(--primary-light)" />
          <div style={{ width: 1, background: 'var(--border)' }} />
          <StatCell label="Likes" value={totalLikes} color="#ef4444" />
          <div style={{ width: 1, background: 'var(--border)' }} />
          <StatCell label={lang === 'en' ? 'Comments' : 'Commenti'} value={totalComments} color="#10b981" />
        </div>
        <button
          onClick={onCreatePost}
          className="btn btn-primary"
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '0 14px', borderRadius: 14 }}
        >
          <IconPlus size={14} />
          Post
        </button>
      </div>

      {/* Filtro tipo — solo se ci sono entrambi */}
      {outfitCount > 0 && garmentCount > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[
            { key: 'all',     label: lang === 'en' ? 'All' : 'Tutti' },
            { key: 'outfit',  label: `👗 ${lang === 'en' ? 'Outfits' : 'Outfit'} · ${outfitCount}` },
            { key: 'garment', label: `✨ ${lang === 'en' ? 'Garments' : 'Capi'} · ${garmentCount}` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 12px', fontSize: 11, borderRadius: 99, cursor: 'pointer',
                fontWeight: 600, border: '1px solid',
                borderColor: filter === f.key ? 'var(--primary)' : 'var(--border)',
                background: filter === f.key ? 'var(--primary-dim)' : 'var(--card)',
                color: filter === f.key ? 'var(--primary-light)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Griglia */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, borderRadius: 10, overflow: 'hidden' }}>
        {filtered.map(post => {
          const coverUrl = post.content?.photo_url || post.content?.cover_url
          return <GridThumb key={post.id} post={post} coverUrl={coverUrl} onClick={() => onSelectPost(post)} />
        })}
      </div>

    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Friends() {
  const t    = useT()
  const user = useAuthStore(s => s.user)
  const lang = useSettingsStore(s => s.language) || 'it'
  const isMobile = useIsMobile()

  const [activeTab, setActiveTab]             = useState('feed')
  const [posts, setPosts]                     = useState([])
  const [loading, setLoading]                 = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  // selectedMyPost è al livello Friends (fuori dal div animato) per evitare
  // che position:fixed venga intrappolato dallo stacking context dell'animazione
  const [selectedMyPost, setSelectedMyPost]   = useState(null)
  // Username per il pannello laterale profilo utente
  const [viewProfileUser, setViewProfileUser] = useState(null)

  // Inject slide-up animation once (matches other sections' "dal basso" pattern)
  useEffect(() => {
    const styleId = 'friends-slide-anim'
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style')
      s.id = styleId
      s.textContent = `
        @keyframes friendsSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `
      document.head.appendChild(s)
    }
  }, [])

  const loadFeed = async () => {
    setLoading(true)
    try { const data = await getSocialFeed(); setPosts(data) }
    catch { setPosts([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (activeTab === 'feed') loadFeed() }, [activeTab])

  const handlePostCreated = (newPost) => { setPosts(prev => [newPost, ...prev]); setShowCreateModal(false) }
  const handleDeletePost  = (postId)  => {
    setPosts(prev => prev.filter(p => p.id !== postId))
    if (selectedMyPost?.id === postId) setSelectedMyPost(null)
  }

  const FRIENDS_TOUR = lang === 'en' ? [
    {
      title: 'Share a look',
      body: 'Use "+ Post" to publish an outfit. Choose background, add a caption and preview before sharing.',
      target: '[data-pagetour="feed-create"]',
      position: 'bottom',
    },
    {
      title: 'People and Brands',
      body: 'Search for friends, follow brands and discover new content in your feed.',
      target: '[data-pagetour="feed-people-tab"]',
      position: 'bottom',
    },
    {
      title: 'My Posts',
      body: 'All your published looks with likes and comments statistics.',
      target: '[data-pagetour="feed-myposts-tab"]',
      position: 'bottom',
      cta: 'Got it →',
    },
  ] : [
    {
      title: 'Condividi un look',
      body: 'Usa "+ Post" per pubblicare un outfit. Scegli lo sfondo, aggiungi una didascalia e anteprima prima di condividere.',
      target: '[data-pagetour="feed-create"]',
      position: 'bottom',
    },
    {
      title: 'Persone e Brand',
      body: 'Cerca amici, segui brand e scopri nuovi contenuti nel tuo feed.',
      target: '[data-pagetour="feed-people-tab"]',
      position: 'bottom',
    },
    {
      title: 'I miei post',
      body: 'Tutti i tuoi look pubblicati con le statistiche di like e commenti.',
      target: '[data-pagetour="feed-myposts-tab"]',
      position: 'bottom',
      cta: 'Capito →',
    },
  ]

  // Tab config
  const TABS = [
    { id: 'feed',    label: lang === 'en' ? 'Feed'     : 'Feed'         },
    { id: 'people',  label: lang === 'en' ? 'People'   : 'Persone',    'data-pagetour': 'feed-people-tab' },
    { id: 'myposts', label: lang === 'en' ? 'My Posts' : 'I miei post', 'data-pagetour': 'feed-myposts-tab' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!isMobile && <PageTutorial pageId="friends" steps={FRIENDS_TOUR} />}

      {/* Header — titolo + tab */}
      <div style={{ padding: isMobile ? '12px 14px 0' : '14px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        {/* Titolo pagina — sopra i tab, come in OutfitBuilder */}
        <div style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>{t('friendsTitle')}</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
            {lang === 'en' ? 'Discover and share your looks' : 'Scopri e condividi i tuoi look'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              {...(tab['data-pagetour'] ? { 'data-pagetour': tab['data-pagetour'] } : {})}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 18px',
                fontSize: 13, fontWeight: 600,
                color: activeTab === tab.id ? 'var(--primary-light)' : 'var(--text-muted)',
                background: activeTab === tab.id ? 'var(--primary-dim)' : 'transparent',
                border: `1px solid ${activeTab === tab.id ? 'var(--primary-border)' : 'transparent'}`,
                borderRadius: 99,
                cursor: 'pointer',
                transition: 'all 0.18s',
                marginBottom: 10,
              }}
              onMouseEnter={e => { if (activeTab !== tab.id) { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
              onMouseLeave={e => { if (activeTab !== tab.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' } }}
            >
              {tab.label}
            </button>
          ))}

          {/* Indicatore tab attivo (sottile linea in basso) */}
          <div style={{ flex: 1 }} />

          {/* Counter post nel feed */}
          {activeTab === 'feed' && posts.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)', paddingBottom: 10 }}>
              {posts.length} {lang === 'en' ? 'posts' : 'post'}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '14px 10px' : '20px 28px' }}>
        <div key={activeTab} style={{ maxWidth: 560, margin: '0 auto', animation: 'friendsSlideUp 0.22s ease forwards' }}>

          {/* ── FEED ── */}
          {activeTab === 'feed' && (
            <>
              {/* Quick compose */}
              <div data-pagetour="feed-create">
                <QuickCompose user={user} onClick={() => setShowCreateModal(true)} lang={lang} />
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
                  <div className="spinner" style={{ margin: '0 auto 16px' }} />
                  <div style={{ fontSize: 14 }}>{t('loading')}</div>
                </div>
              ) : posts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, opacity: 0.25 }}>
                    <IconSparkle size={52} />
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{t('feedEmpty')}</h3>
                  <p style={{ fontSize: 13, marginBottom: 20 }}>{t('feedEmptyHint')}</p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => setShowCreateModal(true)} className="btn btn-primary" style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }}>
                      <IconPlus size={14} />
                      {t('feedNewPost')}
                    </button>
                    <button onClick={() => setActiveTab('people')} className="btn btn-ghost" style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }}>
                      <IconSearch size={14} />
                      {lang === 'en' ? 'Find people' : 'Trova persone'}
                    </button>
                  </div>
                </div>
              ) : (
                posts.flatMap((post, i) => {
                  const card = (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUsername={user?.username}
                      onDelete={handleDeletePost}
                      t={t}
                      onViewProfile={u => u && setViewProfileUser(u)}
                    />
                  )
                  const elements = [
                    i > 0 ? <PostSeparator key={`sep-${i}`} /> : null,
                    card,
                  ].filter(Boolean)

                  if ((i === 0 || (i > 0 && (i + 1) % 3 === 0)) && post.type !== 'brand') {
                    elements.push(<PostSeparator key={`sep-ad-${i}`} />)
                    elements.push(<FeedAdCard key={`ad-${i}`} lang={lang} />)
                  }
                  return elements
                })
              )}
            </>
          )}

          {/* ── PEOPLE ── */}
          {activeTab === 'people' && <PeopleTab t={t} lang={lang} onViewProfile={setViewProfileUser} />}

          {/* ── MY POSTS ── */}
          {activeTab === 'myposts' && (
            <MyPostsTab
              t={t}
              user={user}
              lang={lang}
              onDelete={handleDeletePost}
              onCreatePost={() => setShowCreateModal(true)}
              onSelectPost={setSelectedMyPost}
            />
          )}
        </div>
      </div>

      {/* ── Modale post "My Posts" — FUORI dal div animato per evitare
           che position:fixed venga intrappolato dal transform dell'animazione ── */}
      {selectedMyPost && (
        <div
          onClick={() => setSelectedMyPost(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520,
              maxHeight: '88vh', overflowY: 'auto',
              borderRadius: 16, flexShrink: 0,
            }}
          >
            <PostCard
              post={selectedMyPost}
              currentUsername={user?.username}
              onDelete={handleDeletePost}
              t={t}
              showDeleteBtn
            />
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreatePostModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handlePostCreated}
        />
      )}

      {/* ── Pannello profilo utente ── */}
      {viewProfileUser && (
        <UserProfilePanel
          username={viewProfileUser}
          currentUsername={user?.username}
          lang={lang}
          t={t}
          onClose={() => setViewProfileUser(null)}
        />
      )}
    </div>
  )
}

// ── Pannello laterale profilo utente (desktop) ─────────────────────────────────
function UserProfilePanel({ username, currentUsername, lang, t, onClose }) {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [following, setFollowing] = useState(false)
  const [followId,  setFollowId]  = useState(null)
  const [toggling,  setToggling]  = useState(false)
  const [selected,  setSelected]  = useState(null)   // post selezionato

  useEffect(() => {
    setLoading(true)
    getUserPosts(username)
      .then(raw => {
        const posts = Array.isArray(raw) ? raw : (raw.posts || raw.items || [])
        const profile = raw.user || raw.profile || null
        setData({ posts: posts.filter(p => p.type !== 'brand'), profile })
      })
      .catch(() => setData({ posts: [], profile: null }))
      .finally(() => setLoading(false))

    fetchFollowing()
      .then(list => {
        const found = list.find(u => u.username === username)
        if (found) { setFollowing(true); setFollowId(found.friendship_id || found.id) }
      })
      .catch(() => {})
  }, [username])

  const handleToggleFollow = async () => {
    setToggling(true)
    try {
      if (following) {
        await unfollowUser(followId)
        setFollowing(false); setFollowId(null)
      } else {
        const res = await followUser(username)
        setFollowing(true)
        setFollowId(res?.friendship_id || res?.id || null)
      }
    } catch {}
    finally { setToggling(false) }
  }

  const profilePic = data?.profile?.profile_picture || data?.posts?.[0]?.author?.profile_picture
  const bio        = data?.profile?.bio
  const postCount  = data?.posts?.length || 0
  const totalLikes = (data?.posts || []).reduce((s, p) => s + (p.like_count || 0), 0)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, maxHeight: '88vh',
          background: 'var(--surface)', borderRadius: 20,
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <Avatar src={profilePic} username={username} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
                @{username}
              </div>
              {bio && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{bio}</div>
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  <strong style={{ color: 'var(--text)' }}>{postCount}</strong> post
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  <strong style={{ color: '#f43f5e' }}>{totalLikes}</strong> like
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {username !== currentUsername && (
                <button
                  onClick={handleToggleFollow}
                  disabled={toggling}
                  className={following ? 'btn btn-ghost' : 'btn btn-primary'}
                  style={{ fontSize: 12, padding: '7px 16px' }}
                >
                  {following ? t('friendsUnfollow') : t('friendsFollow')}
                </button>
              )}
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 18, padding: '2px 6px' }}
              >✕</button>
            </div>
          </div>
        </div>

        {/* Post grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 2 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13 }}>{t('loading')}</div>
            </div>
          ) : data?.posts?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              {lang === 'en' ? 'No posts yet' : 'Nessun post ancora'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {(data?.posts || []).map(post => {
                const coverUrl = post.content?.photo_url || post.content?.cover_url
                return (
                  <GridThumb
                    key={post.id}
                    post={post}
                    coverUrl={coverUrl}
                    onClick={() => setSelected(post)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Post detail overlay */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2100,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'var(--surface)', borderRadius: 20,
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
              display: 'flex', flexDirection: 'column',
              maxHeight: '88vh', overflow: 'hidden',
            }}
          >
            {/* Barra superiore con ✕ */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              padding: '10px 14px 0', flexShrink: 0,
            }}>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', fontSize: 20, lineHeight: 1,
                  padding: '2px 6px', borderRadius: 6,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)' }}
              >✕</button>
            </div>
            {/* Contenuto scorrevole — delete nascosto: è un post altrui */}
            <div style={{ overflowY: 'auto', borderRadius: '0 0 20px 20px' }}>
              <PostCard post={selected} currentUsername="" onDelete={() => setSelected(null)} t={t} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
