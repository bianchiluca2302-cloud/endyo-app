import { useState, useMemo, useRef } from 'react'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { imgUrl } from '../api/client'
import { useCategoryLabels } from '../i18n'

/* ── Icons ───────────────────────────────────────────────────────────────────── */
const PlusIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2.2} strokeLinecap="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)

const CloseIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2.2} strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
)

const CheckIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
)

/* ── Garment mini-chip per il builder ───────────────────────────────────────── */
function GarmentPickerItem({ g, selected, onToggle }) {
  return (
    <div
      onClick={() => onToggle(g.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        background: selected ? 'rgba(124,58,237,0.1)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: g.bg_color || '#1a1a2e',
        overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {g.front_photo_url
          ? <img src={imgUrl(g.front_photo_url)} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1.3} strokeLinecap="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.86H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.86l.58-3.57a2 2 0 00-1.34-2.23z"/></svg>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#f0f0f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {g.name}
        </div>
        {g.brand && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{g.brand}</div>}
      </div>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: selected ? '#7c3aed' : 'rgba(255,255,255,0.07)',
        border: selected ? 'none' : '1.5px solid rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', transition: 'background 0.15s',
      }}>
        {selected && <CheckIcon />}
      </div>
    </div>
  )
}

/* ── Outfit card nella griglia ───────────────────────────────────────────────── */
function OutfitCard({ outfit, language }) {
  const garments = useWardrobeStore(s => s.garments)
  const members  = outfit.garment_ids
    ? garments.filter(g => outfit.garment_ids.includes(g.id)).slice(0, 4)
    : []

  return (
    <div style={{
      borderRadius: 18, overflow: 'hidden',
      background: '#13131f', border: '1px solid rgba(255,255,255,0.07)',
      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{ aspectRatio: '1/1', position: 'relative', background: '#0d0d14' }}>
        {members.length === 0 ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1.2} strokeLinecap="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
        ) : members.length === 1 ? (
          <img src={imgUrl(members[0].front_photo_url)} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', height: '100%', gap: 1 }}>
            {members.slice(0, 4).map(g => (
              <div key={g.id} style={{ background: g.bg_color || '#1a1a2e', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {g.front_photo_url
                  ? <img src={imgUrl(g.front_photo_url)} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : null}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f0f0f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {outfit.name || 'Outfit'}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
          {language === 'en'
            ? `${members.length} item${members.length === 1 ? '' : 's'}`
            : `${members.length} ${members.length === 1 ? 'capo' : 'capi'}`}
        </div>
      </div>
    </div>
  )
}

/* ── Builder sheet ───────────────────────────────────────────────────────────── */
function BuilderSheet({ onClose, language }) {
  const garments    = useWardrobeStore(s => s.garments)
  const saveOutfit  = useWardrobeStore(s => s.saveOutfit)
  const CATEGORY_LABELS = useCategoryLabels()

  const [selected,   setSelected]   = useState(new Set())
  const [name,       setName]       = useState('')
  const [search,     setSearch]     = useState('')
  const [activeCat,  setActiveCat]  = useState('')
  const [saving,     setSaving]     = useState(false)
  const [done,       setDone]       = useState(false)
  const [dragY,      setDragY]      = useState(0)
  const startYRef   = useRef(0)
  const draggingRef = useRef(false)
  const sheetRef    = useRef(null)

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
      setTimeout(() => onClose(), 0)
    } else {
      setDragY(0)
    }
  }

  const categories = useMemo(
    () => [...new Set(garments.map(g => g.category).filter(Boolean))].sort(),
    [garments]
  )

  const toggleGarment = (id) => {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const filtered = useMemo(() => {
    let list = garments
    if (activeCat) list = list.filter(g => g.category === activeCat)
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(g =>
      (g.name || '').toLowerCase().includes(q) ||
      (g.brand || '').toLowerCase().includes(q)
    )
  }, [garments, search, activeCat])

  const handleSave = async () => {
    if (selected.size === 0 || !name.trim()) return
    setSaving(true)
    try {
      await saveOutfit({ name: name.trim(), garment_ids: [...selected] })
      setDone(true)
      setTimeout(onClose, 900)
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  const en = language === 'en'

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 600, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: '#111118',
          borderRadius: '24px 24px 0 0',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: `translateY(${dragY}px)`,
          transition: dragY > 0 ? 'none' : 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
      >
        {/* Sticky drag header */}
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: '#111118',
            borderBottom: '2px solid rgba(255,255,255,0.08)',
            touchAction: 'none', cursor: 'grab',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 44, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.18)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 14px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f0f0f8' }}>
              {en ? 'Create outfit' : 'Crea outfit'}
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#f0f0f8' }}>
              <CloseIcon />
            </button>
          </div>
        </div>

        <div style={{ padding: '0 20px 12px' }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={en ? 'Outfit name (e.g. Casual look)' : 'Nome outfit (es. Look casual)'}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#f0f0f8', fontSize: 15, outline: 'none', WebkitAppearance: 'none',
            }}
          />
        </div>

        {selected.size > 0 && (
          <div style={{ padding: '0 20px 8px', fontSize: 13, color: '#a78bfa', fontWeight: 600 }}>
            {en
              ? `${selected.size} item${selected.size === 1 ? '' : 's'} selected`
              : `${selected.size} ${selected.size === 1 ? 'capo selezionato' : 'capi selezionati'}`}
          </div>
        )}

        <div style={{ padding: '0 20px 8px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={en ? 'Search items…' : 'Cerca capi…'}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 12,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
              color: '#f0f0f8', fontSize: 14, outline: 'none',
            }}
          />
        </div>

        {categories.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, padding: '0 20px 8px',
            overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0,
            WebkitOverflowScrolling: 'touch',
          }}>
            <button
              onClick={() => setActiveCat('')}
              style={{
                padding: '5px 13px', borderRadius: 99, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                background: activeCat === '' ? '#7c3aed' : 'rgba(255,255,255,0.08)',
                color: activeCat === '' ? '#fff' : 'rgba(255,255,255,0.5)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >{en ? 'All' : 'Tutti'}</button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCat(cat === activeCat ? '' : cat)}
                style={{
                  padding: '5px 13px', borderRadius: 99, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                  background: activeCat === cat ? '#7c3aed' : 'rgba(255,255,255,0.08)',
                  color: activeCat === cat ? '#fff' : 'rgba(255,255,255,0.5)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >{CATEGORY_LABELS[cat] || cat}</button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(g => (
            <GarmentPickerItem key={g.id} g={g} selected={selected.has(g.id)} onToggle={toggleGarment} />
          ))}
        </div>

        <div style={{ padding: '14px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={handleSave}
            disabled={selected.size === 0 || !name.trim() || saving}
            style={{
              width: '100%', padding: '15px', borderRadius: 14, border: 'none',
              background: done ? '#10b981' : (selected.size > 0 && name.trim() ? '#7c3aed' : 'rgba(124,58,237,0.25)'),
              color: (selected.size > 0 && name.trim()) ? 'white' : 'rgba(255,255,255,0.35)',
              fontSize: 16, fontWeight: 700, cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {done
              ? (en ? '✓ Saved!' : '✓ Salvato!')
              : saving
                ? (en ? 'Saving…' : 'Salvataggio…')
                : (en
                    ? `Save outfit (${selected.size} item${selected.size === 1 ? '' : 's'})`
                    : `Salva outfit (${selected.size} capi)`)}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────────── */
export default function MobileOutfits() {
  const outfits  = useWardrobeStore(s => s.outfits)
  const garments = useWardrobeStore(s => s.garments)
  const language = useSettingsStore(s => s.language) || 'it'
  const CATEGORY_LABELS = useCategoryLabels()

  const [showBuilder, setShowBuilder] = useState(false)
  const [search,      setSearch]      = useState('')
  const [activeCat,   setActiveCat]   = useState('')

  const en = language === 'en'

  const outfitCategories = useMemo(() => {
    const cats = new Set()
    outfits.forEach(o => {
      (o.garment_ids || []).forEach(id => {
        const g = garments.find(g => g.id === id)
        if (g?.category) cats.add(g.category)
      })
    })
    return [...cats].sort()
  }, [outfits, garments])

  const filtered = useMemo(() => {
    let list = outfits
    if (activeCat) {
      list = list.filter(o =>
        (o.garment_ids || []).some(id => {
          const g = garments.find(g => g.id === id)
          return g?.category === activeCat
        })
      )
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o => (o.name || '').toLowerCase().includes(q))
    }
    return list
  }, [outfits, garments, search, activeCat])

  return (
    <div style={{ minHeight: '100%', background: '#0a0a0f', animation: 'fadeIn 0.4s ease backwards' }}>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,10,15,0.96)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 52px) 20px 0',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#f0f0f8', lineHeight: 1 }}>
              Outfit
            </h1>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>
              {filtered.length} {en ? `look${filtered.length === 1 ? '' : 's'}` : 'look'}
              {search || activeCat
                ? (en ? ` of ${outfits.length}` : ` su ${outfits.length}`)
                : (en ? ' saved' : ' salvati')}
            </div>
          </div>
          <button
            onClick={() => setShowBuilder(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 99, border: 'none',
              background: '#7c3aed', color: 'white',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <PlusIcon />
            {en ? 'Create' : 'Crea'}
          </button>
        </div>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <svg
            width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.3)" strokeWidth={2} strokeLinecap="round"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={en ? 'Search outfits…' : 'Cerca outfit…'}
            style={{
              width: '100%', padding: '11px 36px 11px 38px',
              borderRadius: 14, border: 'none',
              background: 'rgba(255,255,255,0.07)',
              color: '#f0f0f8', fontSize: 14, outline: 'none',
              WebkitAppearance: 'none', boxSizing: 'border-box',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
                width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 0,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        {outfitCategories.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, paddingBottom: 12,
            overflowX: 'auto', scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          }}>
            <button
              onClick={() => setActiveCat('')}
              style={{
                padding: '5px 13px', borderRadius: 99, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                background: activeCat === '' ? '#7c3aed' : 'rgba(255,255,255,0.08)',
                color: activeCat === '' ? '#fff' : 'rgba(255,255,255,0.45)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >{en ? 'All' : 'Tutti'}</button>
            {outfitCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCat(cat === activeCat ? '' : cat)}
                style={{
                  padding: '5px 13px', borderRadius: 99, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                  background: activeCat === cat ? '#7c3aed' : 'rgba(255,255,255,0.08)',
                  color: activeCat === cat ? '#fff' : 'rgba(255,255,255,0.45)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >{CATEGORY_LABELS[cat] || cat}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Grid outfit ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 12px 130px' }}>
        {outfits.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 28px', gap: 14 }}>
            <div style={{
              width: 80, height: 80, borderRadius: 24,
              background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeLinecap="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f0f0f8', marginBottom: 6 }}>
                {en ? 'No outfits yet' : 'Nessun outfit ancora'}
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                {en ? 'Combine your items and create your first look' : 'Combina i tuoi capi e crea il tuo primo look'}
              </div>
            </div>
            <button
              onClick={() => setShowBuilder(true)}
              style={{
                padding: '13px 28px', borderRadius: 14, border: 'none',
                background: '#7c3aed', color: 'white',
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
              }}
            >
              {en ? 'Create first outfit' : 'Crea il primo outfit'}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '52px 24px', color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>
            {en
              ? `No outfits match "${search || activeCat}"`
              : `Nessun outfit corrisponde a "${search || activeCat}"`}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => { setSearch(''); setActiveCat('') }}
                style={{
                  background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 10,
                  color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '8px 16px',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >{en ? 'Clear filters' : 'Azzera filtri'}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {filtered.map((o, i) => (
              <div key={o.id} style={{ animation: `slideUp 0.65s cubic-bezier(0.22, 1, 0.36, 1) ${Math.min(i * 90, 540)}ms backwards` }}>
                <OutfitCard outfit={o} language={language} />
              </div>
            ))}
          </div>
        )}
      </div>

      {showBuilder && <BuilderSheet onClose={() => setShowBuilder(false)} language={language} />}
    </div>
  )
}
