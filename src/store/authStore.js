import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Auth store con strategia token ibrida:
 *  - accessToken  → solo in memoria (mai persistito), dura 15 min
 *  - refreshToken → persistito in localStorage SOLO se rememberMe=true
 *  - user         → persistito (info base: id, email, phone)
 *
 * Al riavvio dell'app:
 *  1. Se c'è un refreshToken salvato → tentiamo /auth/refresh per ottenere un nuovo accessToken
 *  2. Se il refresh fallisce → logout automatico
 *  3. Se non c'è refreshToken → mostriamo la pagina di login
 */

const useAuthStore = create(
  persist(
    (set, get) => ({
      // ── Stato ──────────────────────────────────────────────────────────────
      accessToken:  null,   // in memoria, NON persistito (vedi partialize sotto)
      refreshToken: null,   // persistito solo se rememberMe
      user:         null,   // { id, email, phone, is_verified }
      rememberMe:   false,

      // ── Azioni ─────────────────────────────────────────────────────────────
      setAuth: (accessToken, refreshToken, user, rememberMe) =>
        set({ accessToken, refreshToken, user, rememberMe }),

      setAccessToken: (accessToken) => set({ accessToken }),

      updateUser: (user) => set({ user }),

      logout: () => set({
        accessToken:  null,
        refreshToken: null,
        user:         null,
        rememberMe:   false,
      }),

      // ── Getters ────────────────────────────────────────────────────────────
      isAuthenticated: () => !!get().accessToken,
    }),
    {
      name: 'mirrorfit-auth',
      // Persiste solo refreshToken (se rememberMe) e user — mai l'accessToken
      partialize: (state) => ({
        refreshToken: state.rememberMe ? state.refreshToken : null,
        user:         state.user,
        rememberMe:   state.rememberMe,
      }),
    }
  )
)

export default useAuthStore
