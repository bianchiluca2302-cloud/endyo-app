import { create } from 'zustand'
import {
  fetchGarments, deleteGarment as apiDeleteGarment,
  updateGarment as apiUpdateGarment,
  fetchOutfits, createOutfit as apiCreateOutfit, deleteOutfit as apiDeleteOutfit,
  setOutfitUsual as apiSetOutfitUsual,
  fetchProfile, saveProfile as apiSaveProfile,
} from '../api/client'

const useWardrobeStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  garments: [],
  outfits: [],
  profile: {},
  loading: false,
  error: null,

  // Selected category filter
  selectedCategory: 'all',
  setSelectedCategory: (cat) => set({ selectedCategory: cat }),

  // Navigation lock (prevents bottom TabBar navigation during analysis)
  navLocked: false,
  setNavLocked: (v) => set({ navLocked: v }),

  // ── Garments ──────────────────────────────────────────────────────────────
  loadGarments: async () => {
    set({ loading: true, error: null })
    try {
      const garments = await fetchGarments()
      set({ garments, loading: false })
    } catch (e) {
      set({ loading: false, error: 'Impossibile caricare i capi. Backend avviato?' })
    }
  },

  addGarment: (garment) => set(state => ({
    garments: [garment, ...state.garments]
  })),

  removeGarment: async (id) => {
    await apiDeleteGarment(id)
    set(state => ({ garments: state.garments.filter(g => g.id !== id) }))
    // Remove from outfits
    set(state => ({
      outfits: state.outfits.map(o => ({
        ...o,
        garment_ids: o.garment_ids.filter(gid => gid !== id)
      }))
    }))
  },

  getGarmentById: (id) => get().garments.find(g => g.id === id),

  // Salva campi modificati nel DB e aggiorna lo store
  updateGarmentFields: async (id, fields) => {
    const updated = await apiUpdateGarment(id, fields)
    set(state => ({
      garments: state.garments.map(g => g.id === id ? { ...g, ...updated } : g),
    }))
    return updated
  },

  // Aggiorna bg_status di un capo nello store
  updateGarmentBg: (id, bg_status, photos = null) => set(state => ({
    garments: state.garments.map(g =>
      g.id === id
        ? { ...g, bg_status, ...(photos || {}) }
        : g
    ),
  })),

  // Aggiorna tryon_status e tryon_image di un capo nello store (senza reload completo)
  updateGarmentTryon: (id, tryon_status, tryon_image) => set(state => ({
    garments: state.garments.map(g =>
      g.id === id ? { ...g, tryon_status, tryon_image: tryon_image || g.tryon_image } : g
    ),
  })),

  getGarmentsByCategory: (cat) => {
    const { garments } = get()
    return cat === 'all' ? garments : garments.filter(g => g.category === cat)
  },

  // ── Outfits ───────────────────────────────────────────────────────────────
  loadOutfits: async () => {
    try {
      const outfits = await fetchOutfits()
      set({ outfits })
    } catch (e) {
      console.error('Error loading outfits:', e)
    }
  },

  saveOutfit: async (outfitData) => {
    const saved = await apiCreateOutfit(outfitData)
    set(state => ({ outfits: [saved, ...state.outfits] }))
    return saved
  },

  removeOutfit: async (id) => {
    await apiDeleteOutfit(id)
    set(state => ({ outfits: state.outfits.filter(o => o.id !== id) }))
  },

  markOutfitUsual: async (id, isUsual) => {
    await apiSetOutfitUsual(id, isUsual)
    set(state => ({
      outfits: state.outfits.map(o => o.id === id ? { ...o, is_usual: isUsual } : o)
    }))
  },

  // ── Profile ───────────────────────────────────────────────────────────────
  loadProfile: async () => {
    try {
      const profile = await fetchProfile()
      set({ profile })
    } catch (e) {
      console.error('Error loading profile:', e)
    }
  },

  updateProfile: async (data) => {
    await apiSaveProfile(data)
    set(state => ({ profile: { ...state.profile, ...data } }))
  },

  // Aggiorna il profilo solo localmente (senza chiamata API)
  patchProfile: (data) => {
    set(state => ({ profile: { ...state.profile, ...data } }))
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  init: async () => {
    await Promise.all([
      get().loadGarments(),
      get().loadOutfits(),
      get().loadProfile(),
    ])
  },

  // ── Re-enrich in-progress tracking (persiste mentre il modale è chiuso) ──────
  enrichingIds: {},
  setGarmentEnriching: (id, isEnriching) => set(state => {
    const enrichingIds = { ...state.enrichingIds }
    if (isEnriching) enrichingIds[id] = true
    else delete enrichingIds[id]
    return { enrichingIds }
  }),

  // ── Pulizia al logout (svuota i dati dell'utente corrente) ─────────────────
  clearData: () => set({ garments: [], outfits: [], profile: null, error: null, enrichingIds: {} }),
}))

export default useWardrobeStore
