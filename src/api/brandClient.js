import axios from 'axios'
import useBrandAuthStore from '../store/brandAuthStore'

const _envUrl = import.meta.env.VITE_API_URL
const BASE_URL = (_envUrl && _envUrl.startsWith('http')) ? _envUrl
  : (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000')

export const brandApi = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
})

brandApi.interceptors.request.use((config) => {
  const token = useBrandAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let _refreshing = null
brandApi.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const { refreshToken, setAccessToken, logout } = useBrandAuthStore.getState()
      if (!refreshToken) { logout(); return Promise.reject(err) }
      if (!_refreshing) {
        _refreshing = axios
          .post(`${BASE_URL}/brand/refresh`, { refresh_token: refreshToken })
          .then(r => r.data.access_token)
          .finally(() => { _refreshing = null })
      }
      try {
        const newToken = await _refreshing
        setAccessToken(newToken)
        original.headers.Authorization = `Bearer ${newToken}`
        return brandApi.request(original)
      } catch {
        logout()
        return Promise.reject(err)
      }
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const brandLogin    = (data)  => brandApi.post('/brand/login', data).then(r => r.data)
export const brandRegister = (data)  => brandApi.post('/brand/register', data).then(r => r.data)
export const brandMe       = ()      => brandApi.get('/brand/me').then(r => r.data)
export const brandUpdate   = (data)  => brandApi.patch('/brand/me', data).then(r => r.data)

export const brandUploadLogo = (file) => {
  const fd = new FormData()
  fd.append('photo', file)
  return brandApi.post('/brand/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}

// ── Products ──────────────────────────────────────────────────────────────────
export const brandListProducts  = ()         => brandApi.get('/brand/products').then(r => r.data)
export const brandCreateProduct = (data)     => brandApi.post('/brand/products', data).then(r => r.data)
export const brandUpdateProduct = (id, data) => brandApi.patch(`/brand/products/${id}`, data).then(r => r.data)
export const brandDeleteProduct = (id)       => brandApi.delete(`/brand/products/${id}`).then(r => r.data)

export const brandUploadProductImage = (id, file) => {
  const fd = new FormData()
  fd.append('photo', file)
  return brandApi.post(`/brand/products/${id}/image`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  }).then(r => r.data)
}

// ── Password recovery ─────────────────────────────────────────────────────────
export const brandForgotPassword = (email)           => brandApi.post('/brand/forgot-password', { email }).then(r => r.data)
export const brandResetPassword  = (token, password) => brandApi.post('/brand/reset-password', { token, new_password: password }).then(r => r.data)

// ── Analytics & Usage ─────────────────────────────────────────────────────────
export const brandAnalytics = () => brandApi.get('/brand/analytics').then(r => r.data)
export const brandUsage     = () => brandApi.get('/brand/usage').then(r => r.data)

// ── Post sponsorizzati ────────────────────────────────────────────────────────
export const brandGetPosts    = ()                   => brandApi.get('/brand/posts').then(r => r.data)
export const brandCreatePost  = (data)               => brandApi.post('/brand/posts', data).then(r => r.data)
export const brandDeletePost  = (postId)             => brandApi.delete(`/brand/posts/${postId}`).then(r => r.data)

// ── Helper ────────────────────────────────────────────────────────────────────
export const brandImgUrl = (path) => path ? `${BASE_URL}${path}` : null
