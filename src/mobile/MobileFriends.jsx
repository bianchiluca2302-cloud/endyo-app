import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getSocialFeed, toggleLike, imgUrl,
  searchUsers, followUser, unfollowUser, fetchFollowing,
  getUserPosts, deleteSocialPost,
} from '../api/client'
import useAuthStore from '../store/authStore'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { useT } from '../i18n'
import CreatePostModal from '../components/CreatePostModal'
import OutfitCanvas from '../components/OutfitCanvas'
import MobileGarmentSheet from './MobileGarmentSheet'

/* ── Google Ad inline (ogni 3 post nel feed) ─────────────────────────────────── */
const ADSENSE_CLIENT_ID = 'ca-pub-XXXXXXXXXXXXXXXXX'
const ADSENSE_SLOT_FEED = 'CCCCCCCCCC'
const hasRealCreds = !ADSENSE_CLIENT_ID.includes('XXXX')
const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')

function FeedAdCard({ language }) {
  useEffect(() => {
    if (!isElectron && hasRealCreds) {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch {}
    }
  }, [])

  const label = language === 'en' ? 'Ad' : 'Annuncio'

  if (isElectron || !hasRealCreds) {
    return (
      <div style={{
        marginBottom: 12, borderRadius: 18,
        boxShadow: '0 0 0 1.5px var(--border)',
        background: 'var(--card)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px 6px',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg,#4285f4,#34a853)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0,
          }}>G</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Google</div>
            <div style={{ fontSize: 10, color: '#4285f4', fontWeight: 600 }}>{label}</div>
          </div>
        </div>
        <div style={{
          height: 140, background: 'linear-gradient(135deg,var(--card),var(--surface))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          color: 'var(--text-dim)',
        }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          <span style={{ fontSize: 11, letterSpacing: '0.04em' }}>{label} · 320×50</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 12, borderRadius: 18, overflow: 'hidden', boxShadow: '0 0 0 1.5px var(--border)' }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: 140 }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={ADSENSE_SLOT_FEED}
        data-ad-format="rectangle"
        data-full-width-responsive="true"
      />
    </div>
  )
}

/* ── SuggestedUsers — consiglia utenti basandosi sui tag stile dell'armadio ───── */
function SuggestedUsers({ language, garments, onSelectUser }) {
  const [users,     setUsers]     = useState([])
  const [following, setFollowing] = useState(new Set())
  const [loaded,    setLoaded]    = useState(false)

  useEffect(() => {
    // Estrae i tag stile più frequenti dall'armadio
    const freq = {}
    garments.forEach(g => (g.style_tags || []).forEach(t => { freq[t] = (freq[t] || 0) + 1 }))
    const topTags = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t)
    const queries = topTags.length > 0 ? topTags : ['casual', 'sporty', 'elegant', 'streetwear']

    // Cerca utenti per ciascun tag, merge & deduplica
    Promise.all(queries.map(q => searchUsers(q).catch(() => [])))
      .then(results => {
        const seen = new Set()
        const merged = results.flat().filter(u => {
          if (seen.has(u.id)) return false
          seen.add(u.id)
          return true
        })
        setUsers(merged.slice(0, 8))
        setLoaded(true)
      })

    fetchFollowing()
      .then(list => setFollowing(new Set(list.map(u => u.username))))
      .catch(() => {})
  }, [garments])

  const toggleFollow = async (u) => {
    const isF = following.has(u.username)
    setFollowing(s => { const n = new Set(s); isF ? n.delete(u.username) : n.add(u.username); return n })
    try { isF ? await unfollowUser(u.friendship_id || u.id) : await followUser(u.username) }
    catch { setFollowing(s => { const n = new Set(s); isF ? n.add(u.username) : n.delete(u.username); return n }) }
  }

  if (!loaded || users.length === 0) return null

  const en = language === 'en'

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, paddingLeft: 2 }}>
        {en ? 'People you might like' : 'Persone che potrebbero piacerti'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {users.map((u, i) => {
          const isF = following.has(u.username)
          const picSrc = u.profile_picture ? imgUrl(u.profile_picture) : null
          return (
            <div
              key={u.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '12px 14px',
                animation: `slideUp 0.4s ease ${i * 60}ms backwards`,
              }}
            >
              {/* Avatar */}
              <button
                onClick={() => u.username && onSelectUser(u.username)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}
              >
                {picSrc ? (
                  <img src={picSrc} alt={u.username} style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: 46, height: 46, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--primary), var(--primary-light))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 800, color: '#fff',
                  }}>
                    {(u.username || '?')[0].toUpperCase()}
                  </div>
                )}
              </button>

              {/* Info */}
              <button
                onClick={() => u.username && onSelectUser(u.username)}
                style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  @{u.username}
                </div>
                {u.bio && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.bio}
                  </div>
                )}
              </button>

              {/* Follow button */}
              <button
                onClick={() => toggleFollow(u)}
                style={{
                  padding: '7px 16px', borderRadius: 99, cursor: 'pointer',
                  background: isF ? 'var(--card)' : 'var(--primary)',
                  color: isF ? 'var(--text-muted)' : '#fff',
                  border: isF ? '1px solid var(--border)' : 'none',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {isF ? (en ? 'Following' : 'Segui già') : (en ? 'Follow' : 'Segui')}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── ConfirmActionSheet — iOS-style destructive action sheet ─────────────────── */
function ConfirmActionSheet({ message, confirmLabel, onConfirm, onCancel, language = 'it' }) {
  confirmLabel = confirmLabel ?? (language === 'en' ? 'Delete' : 'Elimina')
  const [visible, setVisible] = useState(false)
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleCancel = () => {
    setVisible(false)
    setTimeout(onCancel, 300)
  }
  const handleConfirm = () => {
    setVisible(false)
    setTimeout(onConfirm, 300)
  }

  return (
    <div
      onClick={handleCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: `rgba(0,0,0,${visible ? 0.55 : 0})`,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        transition: 'background 0.25s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          padding: '0 12px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          transform: visible ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
      >
        {/* Card principale */}
        <div style={{
          borderRadius: 16, overflow: 'hidden',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          marginBottom: 10,
        }}>
          {/* Messaggio */}
          <div style={{
            padding: '16px 16px 14px',
            textAlign: 'center',
            borderBottom: '1px solid var(--border)',
            fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5,
          }}>
            {message}
          </div>
          {/* Bottone distruttivo */}
          <button
            onClick={handleConfirm}
            style={{
              width: '100%', padding: '16px', border: 'none', background: 'none',
              color: '#f43f5e', fontSize: 17, fontWeight: 600,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              letterSpacing: '-0.01em',
            }}
          >
            {confirmLabel}
          </button>
        </div>

        {/* Bottone Annulla separato */}
        <div style={{
          borderRadius: 16, overflow: 'hidden',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}>
          <button
            onClick={handleCancel}
            style={{
              width: '100%', padding: '16px', border: 'none', background: 'none',
              color: 'var(--text)', fontSize: 17, fontWeight: 700,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            {language === 'en' ? 'Cancel' : 'Annulla'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Time helper ─────────────────────────────────────────────────────────────── */
function timeAgo(isoStr, lang = 'it') {
  if (!isoStr) return ''
  const diff = Math.floor((Date.now() - new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z')) / 1000)
  if (lang === 'en') {
    if (diff < 60)    return 'just now'
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }
  if (diff < 60)    return 'adesso'
  if (diff < 3600)  return `${Math.floor(diff / 60)}min fa`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`
  return `${Math.floor(diff / 86400)}g fa`
}

/* ── Avatar ──────────────────────────────────────────────────────────────────── */
function Avatar({ src, username, size = 38 }) {
  const [err, setErr] = useState(false)
  const picSrc = src ? imgUrl(src) : null
  const initial = (username || '?')[0].toUpperCase()
  if (picSrc && !err) {
    return <img src={picSrc} alt={username} onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--primary), var(--primary-light))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.38,
    }}>{initial}</div>
  )
}

/* ── Post media — gestisce outfit canvas o singola foto ──────────────────────── */
function PostMedia({ post, garments }) {
  const isBrand  = post.type === 'brand'
  const isOutfit = post.item_type === 'outfit'
  const content  = post.content
  const coverUrl = content?.photo_url || content?.cover_url || post.photo_url
  const bgColor  = post.bg_color || content?.bg_color

  // Per gli outfit: usa garments embedded (con foto + transforms) se disponibili,
  // altrimenti fallback allo store locale
  let outfitGarments   = []
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

  // Outfit con garments → canvas completo con transforms salvati
  if (isOutfit && outfitGarments.length > 0) {
    return (
      <div style={{ width: '100%', background: bgColor || 'var(--card)' }}>
        <OutfitCanvas garmentItems={outfitGarments} transforms={outfitTransforms} bgColor={bgColor} height={340} />
      </div>
    )
  }

  // Singola foto
  if (coverUrl) {
    return (
      <div style={{
        width: '100%', background: bgColor || (isOutfit ? 'var(--card)' : undefined),
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img src={imgUrl(coverUrl)} alt=""
          style={{
            width: '100%', maxWidth: '100%', display: 'block',
            objectFit: isOutfit ? 'contain' : 'cover',
            maxHeight: isOutfit ? 380 : 360,
            background: bgColor || 'transparent',
          }} />
      </div>
    )
  }

  return null
}

/* ── Post card ───────────────────────────────────────────────────────────────── */
function PostCard({ post, currentUser, garments, onTapUser, onDelete, onTap, showDelete = false }) {
  const language = useSettingsStore(s => s.language) || 'it'
  const isBrand  = post.type === 'brand'
  // showDelete: true solo nella sezione "I miei post", mai nel feed generale
  const isMyPost = showDelete && !isBrand && post.author?.username === currentUser
  const [liked,       setLiked]       = useState(post.is_liked || post.liked_by_me)
  const [likes,       setLikes]       = useState(post.likes_count || post.like_count || 0)
  const [deleting,    setDeleting]    = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleLike = async () => {
    const next = !liked
    setLiked(next); setLikes(l => next ? l + 1 : l - 1)
    try { await toggleLike(post.id) }
    catch { setLiked(!next); setLikes(l => next ? l - 1 : l + 1) }
  }

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try { await deleteSocialPost(post.id); onDelete && onDelete(post.id) }
    catch { setDeleting(false) }
  }

  const authorUsername = isBrand ? post.brand?.name : post.author?.username
  const authorPic      = isBrand ? post.brand?.logo  : post.author?.profile_picture

  return (
    <>
    {confirmOpen && (
      <ConfirmActionSheet
        message={language === 'en' ? 'Delete this post?' : 'Vuoi eliminare questo post?'}
        language={language}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    )}
    <div style={{
      borderRadius: 18,
      boxShadow: isBrand
        ? '0 0 0 1.5px var(--primary-border)'
        : '0 0 0 1.5px var(--border)',
      marginBottom: 12,
      isolation: 'isolate',
    }}>
      {/* ── Inner wrapper: overflow:hidden clippa il contenuto, nessun border qui ── */}
      <div style={{
        borderRadius: 18,
        overflow: 'hidden',
        background: isBrand ? 'var(--card)' : 'var(--surface)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 8px' }}>
          <button
            onClick={() => !isBrand && onTapUser && onTapUser(post.author?.username)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: isBrand ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            <Avatar src={authorPic} username={authorUsername} size={36} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => !isBrand && onTapUser && onTapUser(post.author?.username)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: isBrand ? 'default' : 'pointer',
                  fontSize: 14, fontWeight: 700, color: isBrand ? 'var(--primary-light)' : 'var(--text)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {isBrand ? authorUsername : `@${authorUsername}`}
              </button>
              {isBrand && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#f59e0b',
                  background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: 99, padding: '1px 7px', flexShrink: 0,
                }}>{language === 'en' ? 'Sponsored' : 'Sponsor'}</span>
              )}
              {post.item_type && (
                <span style={{
                  fontSize: 10, padding: '1px 7px', borderRadius: 99, flexShrink: 0,
                  background: 'var(--primary-dim)', color: 'var(--primary-light)', fontWeight: 600,
                  border: '1px solid var(--primary-border)',
                }}>
                  {post.item_type === 'outfit' ? '👗 Outfit' : '✨ Capo'}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 1 }}>
              {timeAgo(post.created_at, language)}
            </div>
          </div>

          {/* Tasto elimina — solo per i post propri */}
          {isMyPost && (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
              style={{
                opacity: deleting ? 0.4 : 1,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, cursor: 'pointer',
                color: '#ef4444', padding: '6px 8px',
                display: 'flex', alignItems: 'center',
                WebkitTapHighlightColor: 'transparent',
                flexShrink: 0,
              }}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </button>
          )}
        </div>

        {/* Media + Caption — tappable to open detail */}
        <div
          onClick={() => onTap && onTap(post)}
          style={{ cursor: onTap ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}
        >
          <PostMedia post={post} garments={garments} />

          {/* Caption */}
          {post.caption && (
            <div style={{ padding: '10px 14px 6px', fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
              {post.caption}
            </div>
          )}
          {post.content?.name && (
            <div style={{ padding: post.caption ? '0 14px 6px' : '8px 14px 6px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {post.content.name}
            </div>
          )}
        </div>

        {/* Actions */}
        {!isBrand ? (
          <div style={{ display: 'flex', gap: 16, padding: '8px 14px 12px', alignItems: 'center' }}>
            <button onClick={handleLike} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: liked ? '#f43f5e' : 'var(--text-muted)',
              WebkitTapHighlightColor: 'transparent',
            }}>
              <svg width={20} height={20} viewBox="0 0 24 24"
                fill={liked ? '#f43f5e' : 'none'} stroke={liked ? '#f43f5e' : 'currentColor'}
                strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
              {likes > 0 && <span style={{ fontSize: 13, fontWeight: 500 }}>{likes}</span>}
            </button>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--text-muted)', WebkitTapHighlightColor: 'transparent',
            }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              {(post.comments_count || post.comment_count) > 0 && (
                <span style={{ fontSize: 13, fontWeight: 500 }}>{post.comments_count || post.comment_count}</span>
              )}
            </button>
          </div>
        ) : (
          (post.buy_url || post.content?.buy_url) && (
            <div style={{ padding: '8px 14px 12px' }}>
              <a href={post.buy_url || post.content?.buy_url} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 18px', borderRadius: 10,
                background: 'var(--primary-dim)', border: '1px solid var(--primary-border)',
                color: 'var(--primary-light)', fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}>{language === 'en' ? 'Discover →' : 'Scopri →'}</a>
            </div>
          )
        )}

      </div>{/* fine inner wrapper */}
    </div>
    </>
  )
}

/* ── User profile page (fullscreen, slide-in da destra) ─────────────────────── */
function UserProfileSheet({ username, currentUsername, onClose, language = 'it' }) {
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [following,    setFollowing]    = useState(false)
  const [followId,     setFollowId]     = useState(null)
  const [toggling,     setToggling]     = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)

  useEffect(() => {
    setLoading(true)
    getUserPosts(username)
      .then(raw => {
        // Il backend ora restituisce { user, posts }
        const posts       = Array.isArray(raw) ? raw : (raw.posts || raw.items || [])
        const profileInfo = Array.isArray(raw) ? null : (raw.user || raw.profile || null)
        setData({ posts: posts.filter(p => p.type !== 'brand'), profile: profileInfo })
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

  const profilePic     = data?.profile?.profile_picture || data?.posts?.[0]?.author?.profile_picture
  const bio            = data?.profile?.bio
  const postCount      = data?.profile?.posts_count    ?? data?.posts?.length ?? 0
  const followersCount = data?.profile?.followers_count ?? 0
  const followingCount = data?.profile?.following_count ?? 0
  const totalLikes     = (data?.posts || []).reduce((s, p) => s + (p.like_count || 0), 0)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 800,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      animation: 'slideInRight 0.28s ease forwards',
    }}>
      {/* ── Navbar con freccia indietro ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)', flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '1px solid var(--border)', background: 'var(--card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text)', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>@{username}</div>
        {username !== currentUsername && (
          <button
            onClick={handleToggleFollow}
            disabled={toggling}
            style={{
              padding: '8px 18px', borderRadius: 99, cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              background: following ? 'var(--card)' : 'var(--primary)',
              color: following ? 'var(--text-muted)' : '#fff',
              border: following ? '1px solid var(--border)' : 'none',
              WebkitTapHighlightColor: 'transparent',
              opacity: toggling ? 0.6 : 1,
            }}
          >
            {following
            ? (language === 'en' ? 'Following' : 'Seguito')
            : (language === 'en' ? 'Follow' : 'Segui')}
          </button>
        )}
      </div>

      {/* ── Corpo scrollabile ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 130px)' }}>

        {/* Header profilo */}
        <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar src={profilePic} username={username} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {bio && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
                {bio}
              </div>
            )}
            {/* Stats */}
            <div style={{ display: 'flex', gap: 20 }}>
              {[
                { label: language === 'en' ? 'Posts' : 'Post',       value: postCount },
                { label: language === 'en' ? 'Followers' : 'Follower', value: followersCount },
                { label: language === 'en' ? 'Following' : 'Seguiti',  value: followingCount },
                { label: 'Like',                                         value: totalLikes, color: '#f43f5e' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: s.color || 'var(--text)' }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Griglia post */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>
        ) : !data?.posts?.length ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {language === 'en' ? 'No posts yet' : 'Nessun post ancora'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, marginTop: 2 }}>
            {(data.posts).map(post => {
              const coverUrl = post.content?.photo_url || post.content?.cover_url
              return (
                <div
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  style={{ position: 'relative', paddingBottom: '100%', background: 'var(--card)', overflow: 'hidden', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                >
                  {coverUrl ? (
                    <img src={imgUrl(coverUrl)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', opacity: 0.25 }}>
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/></svg>
                    </div>
                  )}
                  {post.like_count > 0 && (
                    <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', borderRadius: 4, padding: '1px 5px', fontSize: 9, color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <svg width={7} height={7} viewBox="0 0 24 24" fill="#f43f5e" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                      {post.like_count}
                    </div>
                  )}
                  {post.item_type === 'outfit' && (
                    <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: '1px 5px', fontSize: 9, color: 'white' }}>👗</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedPost && (
        <PostDetailSheet
          post={selectedPost}
          currentUser={currentUsername}
          onClose={() => setSelectedPost(null)}
          onDelete={(postId) => {
            setSelectedPost(null)
            setData(d => d ? { ...d, posts: d.posts.filter(p => p.id !== postId) } : d)
          }}
        />
      )}
    </div>
  )
}

/* ── Post grid thumb (I miei post) ───────────────────────────────────────────── */
function PostThumb({ post, onTap }) {
  const coverUrl = post.content?.photo_url || post.content?.cover_url
  return (
    <div onClick={() => onTap(post)} style={{
      position: 'relative', paddingBottom: '100%',
      background: 'var(--card)', overflow: 'hidden', cursor: 'pointer',
    }}>
      {coverUrl ? (
        <img src={imgUrl(coverUrl)} alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
        }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-dim)', opacity: 0.3,
        }}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/></svg>
        </div>
      )}
      {post.like_count > 0 && (
        <div style={{
          position: 'absolute', bottom: 4, right: 4,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          borderRadius: 5, padding: '2px 5px',
          fontSize: 9, color: 'white', fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <svg width={8} height={8} viewBox="0 0 24 24" fill="#f43f5e" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          {post.like_count}
        </div>
      )}
      {post.item_type && (
        <div style={{
          position: 'absolute', top: 4, left: 4,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          borderRadius: 4, padding: '1px 5px', fontSize: 9, color: 'white',
        }}>
          {post.item_type === 'outfit' ? '👗' : '✨'}
        </div>
      )}
    </div>
  )
}

/* ── I miei post tab ─────────────────────────────────────────────────────────── */
function MyPostsTab({ user, onCreatePost, onSelectPost, language = 'it' }) {
  const [posts,  setPosts]  = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!user?.username) return
    getUserPosts(user.username)
      .then(data => {
        const list = Array.isArray(data) ? data : (data.posts || [])
        setPosts(list.filter(p => p.type !== 'brand'))
      })
      .catch(() => setPosts([]))
  }, [user?.username])

  if (posts === null) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
    </div>
  )

  if (posts.length === 0) return (
    <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-muted)' }}>
      <div style={{ opacity: 0.2, marginBottom: 12 }}>
        <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
        {language === 'en' ? 'No posts yet' : 'Nessun post ancora'}
      </div>
      <div style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.55 }}>
        {language === 'en' ? 'Share an outfit with your followers' : 'Condividi un outfit con i tuoi follower'}
      </div>
      <button onClick={onCreatePost} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 22px', borderRadius: 99, border: 'none',
        background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        {language === 'en' ? 'Share a look' : 'Condividi un look'}
      </button>
    </div>
  )

  const totalLikes    = posts.reduce((s, p) => s + (p.like_count || 0), 0)
  const totalComments = posts.reduce((s, p) => s + (p.comment_count || p.comments_count || 0), 0)
  const outfitCount   = posts.filter(p => p.item_type === 'outfit').length
  const garmentCount  = posts.filter(p => p.item_type === 'garment').length
  const filtered      = filter === 'all' ? posts : posts.filter(p => p.item_type === filter)

  return (
    <div>
      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 0, margin: '12px 12px 0',
        background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {[
          { label: language === 'en' ? 'Posts' : 'Post',     value: posts.length,   color: 'var(--primary-light)' },
          { label: 'Like',                                  value: totalLikes,     color: '#f43f5e' },
          { label: language === 'en' ? 'Comments' : 'Commenti', value: totalComments, color: '#10b981' },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, textAlign: 'center', padding: '12px 4px',
            borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtri */}
      {outfitCount > 0 && garmentCount > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '12px 12px 0' }}>
          {[
            { key: 'all',     label: language === 'en' ? 'All' : 'Tutti' },
            { key: 'outfit',  label: `👗 Outfit · ${outfitCount}` },
            { key: 'garment', label: `✨ ${language === 'en' ? 'Items' : 'Capi'} · ${garmentCount}` },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '5px 12px', fontSize: 11, borderRadius: 99, cursor: 'pointer',
              fontWeight: 600,
              border: `1px solid ${filter === f.key ? 'var(--primary)' : 'var(--border)'}`,
              background: filter === f.key ? 'var(--primary-dim)' : 'var(--card)',
              color: filter === f.key ? 'var(--primary-light)' : 'var(--text-muted)',
              WebkitTapHighlightColor: 'transparent',
            }}>{f.label}</button>
          ))}
        </div>
      )}

      {/* Griglia */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, marginTop: 12 }}>
        {filtered.map(post => (
          <PostThumb key={post.id} post={post} onTap={onSelectPost} />
        ))}
      </div>

      {/* Bottone nuovo post in fondo */}
      <div style={{ padding: '16px 12px' }}>
        <button onClick={onCreatePost} style={{
          width: '100%', padding: '13px', borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          border: 'none', background: 'var(--primary)', color: '#fff',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          {language === 'en' ? 'New post' : 'Nuovo post'}
        </button>
      </div>
    </div>
  )
}

/* ── Post detail sheet (per I miei post) ─────────────────────────────────────── */
function PostDetailSheet({ post, onClose, onDelete, currentUser, showDelete = false, language = 'it' }) {
  const [liked,           setLiked]           = useState(post.liked_by_me || post.is_liked)
  const [likes,           setLikes]           = useState(post.like_count || post.likes_count || 0)
  const [deleting,        setDeleting]        = useState(false)
  const [visible,         setVisible]         = useState(false)
  const [dragY,           setDragY]           = useState(0)
  const [selectedGarment, setSelectedGarment] = useState(null)
  const [confirmOpen,     setConfirmOpen]     = useState(false)
  const startYRef   = useRef(0)
  const draggingRef = useRef(false)
  const sheetRef    = useRef(null)
  const garments = useWardrobeStore(s => s.garments)
  // showDelete: true only when opened from "My posts" context
  const isMyPost = showDelete && post.author?.username && currentUser && post.author.username === currentUser
  const coverUrl = post.content?.photo_url || post.content?.cover_url

  // Slide-in: set visible on next frame
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 350)
  }

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteSocialPost(post.id)
      onDelete && onDelete(post.id)
      handleClose()
    } catch { setDeleting(false) }
  }

  // Ricostruisce i garments dell'outfit — embedded (con foto + transforms) oppure dallo store
  let outfitGarments   = []
  let outfitTransforms = {}
  if (post.item_type === 'outfit') {
    if (Array.isArray(post.content?.garments) && post.content.garments.length > 0) {
      outfitGarments   = post.content.garments
      outfitTransforms = post.content.transforms || {}
    } else if (garments?.length) {
      const ids = post.content?.garment_ids || []
      outfitGarments = ids.map(id => garments.find(g => g.id === id)).filter(Boolean)
    }
  }

  const handleLike = async () => {
    const next = !liked
    setLiked(next); setLikes(l => next ? l + 1 : l - 1)
    try { await toggleLike(post.id) }
    catch { setLiked(!next); setLikes(l => next ? l - 1 : l + 1) }
  }

  // Swipe solo sull'handle — soglia 50% altezza sheet
  const onHandleTouchStart = (e) => {
    startYRef.current   = e.touches[0].clientY
    draggingRef.current = true
  }
  const onHandleTouchMove = (e) => {
    if (!draggingRef.current) return
    const delta = e.touches[0].clientY - startYRef.current
    if (delta > 0) { setDragY(delta); e.preventDefault() }
  }
  const onHandleTouchEnd = () => {
    draggingRef.current = false
    const sheetH = sheetRef.current?.offsetHeight || 400
    if (dragY > sheetH * 0.35) {
      setDragY(0)
      setTimeout(() => handleClose(), 0)
    } else {
      setDragY(0)
    }
  }

  return (
    <div onClick={handleClose} style={{
      position: 'fixed', inset: 0, background: `rgba(0,0,0,${visible ? 0.7 : 0})`, zIndex: 700,
      display: 'flex', alignItems: 'flex-end',
      transition: 'background 0.3s ease',
    }}>
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: 'var(--surface)',
          borderRadius: '22px 22px 0 0',
          maxHeight: '90dvh', overflowY: 'auto',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
          transform: visible ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragY > 0 ? 'none' : 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
      >
        {/* ── Sticky drag header — sempre visibile anche scrollando ───────────── */}
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--surface)',
            borderBottom: '2px solid var(--border)',
            touchAction: 'none', cursor: 'grab',
          }}
        >
          {/* Pill handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--border)' }} />
          </div>
          {/* Titolo + azioni */}
          <div style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {post.content?.name || (post.item_type === 'outfit' ? 'Outfit' : (language === 'en' ? 'Item' : 'Capo'))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isMyPost && (
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={deleting}
                  style={{
                    opacity: deleting ? 0.4 : 1,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 8, cursor: 'pointer', color: '#ef4444',
                    padding: '5px 8px', display: 'flex', alignItems: 'center',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>{/* /sticky header */}

        {/* Outfit canvas o foto singola */}
        {post.item_type === 'outfit' && outfitGarments.length > 0 ? (
          <div style={{ marginTop: 10, background: post.bg_color || 'var(--card)' }}>
            <OutfitCanvas garmentItems={outfitGarments} transforms={outfitTransforms} bgColor={post.bg_color} height={360} />
          </div>
        ) : coverUrl ? (
          <div style={{ width: '100%', background: post.bg_color || 'var(--card)', marginTop: 10 }}>
            <img src={imgUrl(coverUrl)} alt="" style={{
              width: '100%', display: 'block',
              objectFit: post.item_type === 'outfit' ? 'contain' : 'cover',
              maxHeight: 380,
            }} />
          </div>
        ) : null}

        {post.caption && (
          <div style={{ padding: '10px 16px', fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{post.caption}</div>
        )}
        <div style={{ display: 'flex', gap: 16, padding: '10px 16px 4px', alignItems: 'center' }}>
          <button onClick={handleLike} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: liked ? '#f43f5e' : 'var(--text-muted)',
          }}>
            <svg width={20} height={20} viewBox="0 0 24 24"
              fill={liked ? '#f43f5e' : 'none'} stroke={liked ? '#f43f5e' : 'currentColor'}
              strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{likes}</span>
          </button>
        </div>

        {/* ── Capi dell'outfit — tappabili per analisi ── */}
        {post.item_type === 'outfit' && outfitGarments.length > 0 && (
          <div style={{ padding: '12px 16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              {language === 'en'
                ? `${outfitGarments.length} item${outfitGarments.length === 1 ? '' : 's'} · Tap to analyze`
                : `${outfitGarments.length === 1 ? '1 capo' : `${outfitGarments.length} capi`} · Tocca per analizzare`}
            </div>
            <div style={{
              display: 'flex', gap: 10, overflowX: 'auto',
              scrollbarWidth: 'none', msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch', paddingBottom: 4,
            }}>
              {outfitGarments.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGarment(g)}
                  style={{
                    flexShrink: 0, width: 90,
                    background: 'var(--card)',
                    borderRadius: 12,
                    border: '2px solid var(--border)',
                    overflow: 'hidden', cursor: 'pointer',
                    padding: 0, textAlign: 'left',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ height: 90, background: 'var(--photo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(g.photo_front || g.photo_bg) ? (
                      <img
                        src={imgUrl(g.photo_front || g.photo_bg)}
                        alt={g.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth={1} strokeLinecap="round">
                        <path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.86H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.86l.58-3.57a2 2 0 00-1.34-2.23z"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ padding: '6px 8px 8px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {g.name || g.category || '—'}
                    </div>
                    {g.brand && (
                      <div style={{ fontSize: 9.5, color: 'var(--text-dim)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {g.brand}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Garment detail sheet */}
      {selectedGarment && (
        <MobileGarmentSheet garment={selectedGarment} onClose={() => setSelectedGarment(null)} />
      )}

      {/* Conferma eliminazione */}
      {confirmOpen && (
        <ConfirmActionSheet
          message={language === 'en' ? 'Delete this post?' : 'Vuoi eliminare questo post?'}
          language={language}
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  )
}

/* ── Cerca utenti (sheet) ────────────────────────────────────────────────────── */
function SearchSheet({ onClose, onSelectUser, currentUser, language = 'it', garments = [] }) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [following, setFollowing] = useState(new Set())
  const [loading,   setLoading]   = useState(false)
  const [visible,   setVisible]   = useState(false)
  const [dragY,     setDragY]     = useState(0)
  const startYRef   = useRef(0)
  const draggingRef = useRef(false)
  const sheetRef    = useRef(null)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 350)
  }

  const onHandleTouchStart = (e) => { startYRef.current = e.touches[0].clientY; draggingRef.current = true }
  const onHandleTouchMove  = (e) => {
    if (!draggingRef.current) return
    const delta = e.touches[0].clientY - startYRef.current
    if (delta > 0) { setDragY(delta); e.preventDefault() }
  }
  const onHandleTouchEnd   = () => {
    draggingRef.current = false
    const sheetH = sheetRef.current?.offsetHeight || 400
    if (dragY > sheetH * 0.35) {
      setDragY(0)
      setTimeout(() => handleClose(), 0)
    } else {
      setDragY(0)
    }
  }

  useEffect(() => {
    fetchFollowing().then(list => setFollowing(new Set(list.map(u => u.username)))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      try { setResults(await searchUsers(query)) }
      catch { setResults([]) }
      finally { setLoading(false) }
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  const toggleFollow = async (u) => {
    const isF = following.has(u.username)
    setFollowing(s => { const n = new Set(s); isF ? n.delete(u.username) : n.add(u.username); return n })
    try { isF ? await unfollowUser(u.friendship_id || u.id) : await followUser(u.username) }
    catch { setFollowing(s => { const n = new Set(s); isF ? n.add(u.username) : n.delete(u.username); return n }) }
  }

  return (
    <div onClick={handleClose} style={{
      position: 'fixed', inset: 0, background: `rgba(0,0,0,${visible ? 0.6 : 0})`,
      zIndex: 600, display: 'flex', alignItems: 'flex-end',
      transition: 'background 0.3s ease',
    }}>
      <div ref={sheetRef} onClick={e => e.stopPropagation()} style={{
        width: '100%', background: 'var(--surface)',
        borderRadius: '22px 22px 0 0',
        maxHeight: '80dvh', display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
        transform: visible ? `translateY(${dragY}px)` : 'translateY(100%)',
        transition: dragY > 0 ? 'none' : 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
        willChange: 'transform',
      }}>
        {/* Sticky drag header */}
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--surface)',
            borderBottom: '2px solid var(--border)',
            touchAction: 'none', cursor: 'grab',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--border)' }} />
          </div>
          <div style={{ padding: '6px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {language === 'en' ? 'Search users' : 'Cerca utenti'}
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 16px 8px' }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={language === 'en' ? 'Search users…' : 'Cerca utenti…'}
            autoFocus
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 14,
              background: 'var(--card)', border: '1px solid var(--border)',
              color: 'var(--text)', fontSize: 15, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Suggeriti — visibili solo prima di digitare */}
          {!query.trim() && (
            <div style={{ padding: '12px 16px 4px' }}>
              <SuggestedUsers
                language={language}
                garments={garments}
                onSelectUser={username => { onSelectUser(username); handleClose() }}
              />
            </div>
          )}

          {loading && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              {language === 'en' ? 'Searching…' : 'Ricerca…'}
            </div>
          )}
          {results.map(u => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
            }}>
              <button
                onClick={() => { onSelectUser(u.username); handleClose() }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flex: 1, textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
              >
                <Avatar src={u.profile_picture} username={u.username} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>@{u.username}</div>
                  {u.name && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{u.name}</div>}
                </div>
              </button>
              {u.username !== currentUser && (
                <button onClick={() => toggleFollow(u)} style={{
                  padding: '7px 16px', borderRadius: 99, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: following.has(u.username) ? 'var(--card)' : 'var(--primary)',
                  color: following.has(u.username) ? 'var(--text-muted)' : '#fff',
                  WebkitTapHighlightColor: 'transparent',
                  border: following.has(u.username) ? '1px solid var(--border)' : 'none',
                }}>
                  {following.has(u.username)
                  ? (language === 'en' ? 'Following' : 'Seguito')
                  : (language === 'en' ? 'Follow' : 'Segui')}
                </button>
              )}
            </div>
          ))}
          {!loading && query.trim() && results.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              {language === 'en' ? 'No users found' : 'Nessun utente trovato'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────────── */
export default function MobileFriends() {
  const user     = useAuthStore(s => s.user)
  const garments = useWardrobeStore(s => s.garments)
  const language = useSettingsStore(s => s.language) || 'it'

  const [tab,                    setTab]                    = useState('feed')   // 'feed' | 'myposts'
  const [posts,                  setPosts]                  = useState([])
  const [loading,                setLoading]                = useState(true)
  const [showSearch,             setShowSearch]             = useState(false)
  const [showCreate,             setShowCreate]             = useState(false)
  const [page,                   setPage]                   = useState(1)
  const [hasMore,                setHasMore]                = useState(true)
  const [profileUser,            setProfileUser]            = useState(null)
  const [selectedPost,           setSelectedPost]           = useState(null)
  const [selectedPostFromMyPosts, setSelectedPostFromMyPosts] = useState(false)

  const loadFeed = useCallback(async (p = 1) => {
    try {
      setLoading(true)
      const data  = await getSocialFeed(p)
      const items = Array.isArray(data) ? data : (data.posts || data.items || data.feed || [])
      if (p === 1) setPosts(items)
      else setPosts(prev => [...prev, ...items])
      setHasMore(items.length >= 10)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (tab === 'feed') loadFeed(1)
  }, [tab, loadFeed])

  const handlePostCreated = () => { setShowCreate(false); loadFeed(1) }
  const handleDeletePost  = (postId) => setPosts(prev => prev.filter(p => p.id !== postId))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Header con tab ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 16px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1, margin: 0 }}>
            {language === 'en' ? 'Friends' : 'Amici'}
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowSearch(true)} style={{
              width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--border)',
              cursor: 'pointer', background: 'var(--card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', WebkitTapHighlightColor: 'transparent',
            }}>
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </button>
            <button onClick={() => setShowCreate(true)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 14px', borderRadius: 99, border: 'none',
              background: 'var(--primary)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Post
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'feed',    label: 'Feed' },
            { id: 'myposts', label: language === 'en' ? 'My posts' : 'I miei post' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 16px', borderRadius: '10px 10px 0 0',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: 'none',
              background: tab === t.id ? 'var(--card)' : 'transparent',
              color: tab === t.id ? 'var(--primary-light)' : 'var(--text-dim)',
              borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              WebkitTapHighlightColor: 'transparent',
              transition: 'all 0.15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ── FEED ── */}
        {tab === 'feed' && (
          <div style={{ padding: '12px 12px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 130px)' }}>
            {loading && posts.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
              </div>
            ) : posts.length === 0 ? (
              /* ── Feed vuoto: suggerisci persone + 1 annuncio ── */
              <>
                <div style={{ textAlign: 'center', padding: '32px 24px 20px' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                    {language === 'en' ? 'Nothing here yet' : 'Ancora nessun post'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 16 }}>
                    {language === 'en'
                      ? 'Follow these people for some inspiration based on your style!'
                      : 'Segui queste persone per prendere ispirazione basata sul tuo stile!'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => setShowSearch(true)} style={{
                      padding: '8px 18px', borderRadius: 99, border: '1px solid var(--border)',
                      background: 'var(--card)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}>{language === 'en' ? 'Search people' : 'Cerca persone'}</button>
                    <button onClick={() => setShowCreate(true)} style={{
                      padding: '8px 18px', borderRadius: 99, border: 'none',
                      background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}>+ {language === 'en' ? 'Create post' : 'Crea post'}</button>
                  </div>
                </div>

                {/* Suggeriti basati sull'armadio */}
                <SuggestedUsers
                  language={language}
                  garments={garments}
                  onSelectUser={username => setProfileUser(username)}
                />

                {/* Sempre almeno 1 annuncio */}
                <FeedAdCard language={language} />
              </>
            ) : (
              <>
                {posts.map((post, index) => (
                  <div key={post.id} style={{ animation: `slideUp 0.38s ease ${Math.min(index * 60, 420)}ms backwards` }}>
                    <PostCard
                      post={post}
                      currentUser={user?.username}
                      garments={garments}
                      onTapUser={username => username && setProfileUser(username)}
                      onDelete={handleDeletePost}
                      onTap={p => { setSelectedPost(p); setSelectedPostFromMyPosts(false) }}
                    />
                    {/* Annuncio dopo il 1° post, poi ogni 3 — almeno 1 sempre garantito */}
                    {(index === 0 || (index > 0 && (index + 1) % 3 === 0)) && (
                      <FeedAdCard language={language} />
                    )}
                  </div>
                ))}
                {hasMore && (
                  <button
                    onClick={() => { const next = page + 1; setPage(next); loadFeed(next) }}
                    disabled={loading}
                    style={{
                      width: '100%', padding: '13px', borderRadius: 14,
                      background: 'var(--card)', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', fontSize: 14, fontWeight: 500,
                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {loading
                      ? (language === 'en' ? 'Loading…' : 'Caricamento…')
                      : (language === 'en' ? 'Load more' : 'Carica altri')}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── I MIEI POST ── */}
        {tab === 'myposts' && (
          <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 130px)' }}>
            <MyPostsTab
              user={user}
              onCreatePost={() => setShowCreate(true)}
              onSelectPost={p => { setSelectedPost(p); setSelectedPostFromMyPosts(true) }}
              language={language}
            />
          </div>
        )}
      </div>

      {/* ── Modali / sheet ──────────────────────────────────────────────────── */}
      {showSearch && (
        <SearchSheet
          onClose={() => setShowSearch(false)}
          onSelectUser={setProfileUser}
          currentUser={user?.username}
          language={language}
          garments={garments}
        />
      )}
      {showCreate && (
        <CreatePostModal onClose={() => setShowCreate(false)} onCreated={handlePostCreated} />
      )}
      {profileUser && (
        <UserProfileSheet
          username={profileUser}
          currentUsername={user?.username}
          onClose={() => setProfileUser(null)}
          language={language}
        />
      )}
      {selectedPost && (
        <PostDetailSheet
          post={selectedPost}
          currentUser={user?.username}
          showDelete={selectedPostFromMyPosts}
          language={language}
          onClose={() => { setSelectedPost(null); setSelectedPostFromMyPosts(false) }}
          onDelete={(postId) => { setSelectedPost(null); setSelectedPostFromMyPosts(false); handleDeletePost(postId) }}
        />
      )}
    </div>
  )
}
