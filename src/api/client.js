import axios from 'axios'
import useAuthStore from '../store/authStore'

const _envUrl = import.meta.env.VITE_API_URL
const BASE_URL = (_envUrl && _envUrl.startsWith('http')) ? _envUrl
  : (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000')

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
})

// ── Interceptor REQUEST: aggiunge Bearer token ────────────────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Interceptor RESPONSE: su 401 tenta refresh, altrimenti logout ─────────────
let _refreshing = null  // promise condivisa per evitare refresh paralleli

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true

      const { refreshToken, setAccessToken, logout } = useAuthStore.getState()

      if (!refreshToken) {
        logout()
        return Promise.reject(err)
      }

      // Se c'è già un refresh in corso, aspettiamo quello
      if (!_refreshing) {
        _refreshing = axios
          .post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
          .then((r) => r.data.access_token)
          .finally(() => { _refreshing = null })
      }

      try {
        const newAccessToken = await _refreshing
        setAccessToken(newAccessToken)
        original.headers.Authorization = `Bearer ${newAccessToken}`
        return api.request(original)
      } catch {
        logout()
        return Promise.reject(err)
      }
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authRegister = (data) =>
  api.post('/auth/register', data).then(r => r.data)

export const authLogin = (data) =>
  api.post('/auth/login', data).then(r => r.data)

export const authRefresh = (refreshToken) =>
  api.post('/auth/refresh', { refresh_token: refreshToken }).then(r => r.data)

export const authForgotPassword = (email) =>
  api.post('/auth/forgot-password', { email }).then(r => r.data)

export const authResetPassword = (token, new_password) =>
  api.post('/auth/reset-password', { token, new_password }).then(r => r.data)

export const authVerifyEmail = (token) =>
  api.get(`/auth/verify-email/${token}`).then(r => r.data)

export const authResendVerification = (email) =>
  api.post('/auth/resend-verification', { email }).then(r => r.data)

export const authMe = () =>
  api.get('/auth/me').then(r => r.data)

export const authDeleteAccount = (password) =>
  api.delete('/auth/me', { data: { password } }).then(r => r.data)

// ── Garments ──────────────────────────────────────────────────────────────────
export const fetchGarments = () => api.get('/garments').then(r => r.data)

export const fetchGarment = (id) => api.get(`/garments/${id}`).then(r => r.data)

export const createGarment = (formData) =>
  api.post('/garments', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }).then(r => r.data)

export const analyzeGarment = (formData) =>
  api.post('/garments/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }).then(r => r.data)

// Shopping Advisor — endpoint separato con quota propria
export const analyzeShoppingAdvisor = (formData) =>
  api.post('/ai/shopping-advisor', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }).then(r => r.data)

export const confirmGarment = (data) =>
  api.post('/garments/confirm', data, { timeout: 30000 }).then(r => r.data)

export const updateGarment = (id, data) =>
  api.patch(`/garments/${id}`, data).then(r => r.data)

export const deleteGarment = (id) =>
  api.delete(`/garments/${id}`).then(r => r.data)

export const reEnrichGarment = (id, language) =>
  api.post(`/garments/${id}/reenrich`, { language }, { timeout: 30000 }).then(r => r.data)

// ── Outfits ───────────────────────────────────────────────────────────────────
export const fetchOutfits = () => api.get('/outfits').then(r => r.data)

export const createOutfit = (data) =>
  api.post('/outfits', data).then(r => r.data)

export const deleteOutfit = (id) =>
  api.delete(`/outfits/${id}`).then(r => r.data)

export const setOutfitUsual = (id, isUsual) =>
  api.patch(`/outfits/${id}/usual`, { is_usual: isUsual }).then(r => r.data)

// ── AI ────────────────────────────────────────────────────────────────────────
export const generateOutfits = (request, n = 3) =>
  api.post('/ai/generate-outfits', { request, n }).then(r => r.data)

export const completeOutfit = (selectedIds) =>
  api.post('/ai/complete-outfit', { selected_ids: selectedIds }, { timeout: 60000 }).then(r => r.data)

export const removeGarmentBackground = (id) =>
  api.post(`/garments/${id}/remove-background`).then(r => r.data)

export const fetchBgStatus = (id) =>
  api.get(`/garments/${id}/bg-status`).then(r => r.data)

export const outfitTryon = (garmentIds) =>
  api.post('/outfit-tryon', { garment_ids: garmentIds }, { timeout: 300000 }).then(r => r.data)

export const removeAllBackgrounds = () =>
  api.post('/admin/remove-backgrounds').then(r => r.data)

export const chatWithStylist = (message, history, language = 'it') =>
  api.post('/ai/chat', { message, history, language }).then(r => r.data)

/**
 * Streaming SSE della chat stylist.
 * @param {object} opts
 * @param {string}   opts.message
 * @param {Array}    opts.history
 * @param {string}   opts.language
 * @param {function} opts.onToken   - chiamato con ogni token stringa
 * @param {function} opts.onDone    - chiamato a fine stream con { remaining }
 * @param {function} opts.onError   - chiamato con messaggio di errore stringa
 */
export const chatWithStylistStream = async ({ message, history, language = 'it', weather = null, occasion = null, onToken, onDone, onError }) => {
  const token = useAuthStore.getState().accessToken
  let res
  try {
    res = await fetch(`${BASE_URL}/ai/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, history, language, weather, occasion }),
    })
  } catch (networkErr) {
    onError?.('Connessione al server non riuscita.')
    return
  }

  if (!res.ok) {
    let detail = 'Errore del server.'
    try { detail = (await res.json()).detail || detail } catch {}
    onError?.(detail)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // ultima riga potenzialmente incompleta
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload) continue
      try {
        const msg = JSON.parse(payload)
        if (msg.t === 'tok') onToken?.(msg.v)
        else if (msg.t === 'err') onError?.(msg.v)
        else if (msg.t === 'done') {
          onDone?.({
            remaining:      msg.remaining_day ?? msg.remaining ?? null,
            remaining_day:  msg.remaining_day  ?? null,
            remaining_week: msg.remaining_week ?? null,
            brandProducts:  msg.brand_products || [],
          })
          return
        }
      } catch {}
    }
  }
  onDone?.({ remaining: null, remaining_day: null, remaining_week: null })
}

export const fetchChatQuota = async (retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await api.get('/user/chat-quota')
      return r.data
    } catch (err) {
      if (err?.response?.status === 429 && i < retries) {
        await new Promise(res => setTimeout(res, 800 * (i + 1)))
        continue
      }
      throw err
    }
  }
}

export const upgradeUserPlan = (plan) =>
  api.post('/user/upgrade', { plan }).then(r => r.data)

export const startStripeCheckout = (plan) =>
  api.post('/payments/checkout', { plan }).then(r => r.data)

export const cancelScheduledDowngrade = () =>
  api.delete('/user/scheduled-downgrade').then(r => r.data)

export const importWardrobe = (data) =>
  api.post('/import', data).then(r => r.data)

// ── Follow system ─────────────────────────────────────────────────────────────
export const searchUsers    = (q) => api.get('/users/search', { params: { q } }).then(r => r.data)
export const followUser     = (username) => api.post('/friends/request', { username }).then(r => r.data)
export const fetchFollowing = () => api.get('/friends').then(r => r.data)        // chi seguo
export const fetchFollowers = () => api.get('/followers').then(r => r.data)      // chi mi segue
export const unfollowUser   = (id) => api.delete(`/friends/${id}`).then(r => r.data)
// alias per compatibilità
export const sendFriendRequest = followUser
export const removeFriend      = unfollowUser

// ── Vetrina ───────────────────────────────────────────────────────────────────
export const fetchMyShowcase     = () => api.get('/showcase').then(r => r.data)
export const fetchUserShowcase   = (username) => api.get(`/showcase/${username}`).then(r => r.data)
export const addShowcaseItem     = (item_type, item_id) => api.post('/showcase', { item_type, item_id }).then(r => r.data)
export const removeShowcaseItem  = (showcase_id) => api.delete(`/showcase/${showcase_id}`).then(r => r.data)

// ── Profile ───────────────────────────────────────────────────────────────────
export const fetchProfile = () => api.get('/profile').then(r => r.data)
export const saveProfile = (data) => api.post('/profile', data).then(r => r.data)

export const uploadAvatar = (file) => {
  const fd = new FormData()
  fd.append('photo', file)
  return api.post('/profile/avatar', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  }).then(r => r.data)
}

export const uploadFacePhoto = (slot, file) => {
  const fd = new FormData()
  fd.append('photo', file)
  return api.post(`/profile/face-photo/${slot}`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  }).then(r => r.data)
}

export const uploadProfilePicture = (file) => {
  const fd = new FormData()
  fd.append('photo', file)
  return api.post('/profile/picture', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  }).then(r => r.data)
}

// ── Armocromia ────────────────────────────────────────────────────────────────
export const analyzeArmocromia = () =>
  api.post('/profile/armocromia-analyze', {}, { timeout: 60000 }).then(r => r.data)

// ── Try-on (legacy) ───────────────────────────────────────────────────────────
export const generateTryon = (garmentId) =>
  api.post(`/garments/${garmentId}/generate-tryon`).then(r => r.data)

export const fetchTryonStatus = (garmentId) =>
  api.get(`/garments/${garmentId}/tryon-status`).then(r => r.data)

// ── Brand (tracking click e feedback dall'app utente) ────────────────────────
export const trackBrandClick    = (productId) =>
  api.post(`/brand/products/${productId}/click`).then(r => r.data)

export const sendBrandFeedback  = (productId, vote, reason = null) =>
  api.post(`/brand/products/${productId}/feedback`, { vote, reason }).then(r => r.data)

// Helper: full image URL
export const imgUrl = (path) => path ? `${BASE_URL}${path}` : null

// ── Wear log ──────────────────────────────────────────────────────────────────
export const wearOutfit     = (outfitId, note = null) =>
  api.post(`/outfits/${outfitId}/wear`, { note }).then(r => r.data)

export const fetchWearStats = () =>
  api.get('/outfits/wear-stats').then(r => r.data)

// ── Social Feed ───────────────────────────────────────────────────────────────
export const getSocialFeed   = (page = 1) => api.get('/social/feed', { params: { page } }).then(r => r.data)

export const createSocialPost = (data) =>
  api.post('/social/posts', data).then(r => r.data)

export const deleteSocialPost = (postId) =>
  api.delete(`/social/posts/${postId}`).then(r => r.data)

export const toggleLike      = (postId) =>
  api.post(`/social/posts/${postId}/like`).then(r => r.data)

export const getComments     = (postId) =>
  api.get(`/social/posts/${postId}/comments`).then(r => r.data)

export const addComment      = (postId, content) =>
  api.post(`/social/posts/${postId}/comments`, { content }).then(r => r.data)

export const deleteComment   = (commentId) =>
  api.delete(`/social/comments/${commentId}`).then(r => r.data)

export const getUserPosts    = (username) =>
  api.get(`/social/profile/${username}`).then(r => r.data)

// ── Brand social (portale brand) ──────────────────────────────────────────────
export const createBrandPost = (data) =>
  api.post('/brand/posts', data).then(r => r.data)

export const getBrandPosts   = () => api.get('/brand/posts').then(r => r.data)

export const deleteBrandPost = (postId) =>
  api.delete(`/brand/posts/${postId}`).then(r => r.data)

// ── Banner pubblicitari brand ─────────────────────────────────────────────────
// Endpoint pubblico — nessun token richiesto
export const getAdBrands = () =>
  fetch(`${BASE_URL}/ads/brand`).then(r => r.json())
