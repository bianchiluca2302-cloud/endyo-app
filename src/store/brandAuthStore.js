import { create } from 'zustand'

// Nessuna persistenza: il token vive solo in memoria.
// Ad ogni ricarica della pagina l'utente deve fare nuovamente il login.
const useBrandAuthStore = create((set, get) => ({
  accessToken:  null,
  refreshToken: null,
  brand:        null,

  setAuth: (accessToken, refreshToken, brand) =>
    set({ accessToken, refreshToken, brand }),

  setAccessToken: (accessToken) => set({ accessToken }),

  logout: () => set({ accessToken: null, refreshToken: null, brand: null }),

  isAuthenticated: () => !!get().accessToken,
}))

export default useBrandAuthStore
