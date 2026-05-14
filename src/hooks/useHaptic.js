// Light haptic feedback using Vibration API (Android) — no-op on iOS/desktop
export const haptic = (pattern = [8]) => {
  try { navigator.vibrate?.(pattern) } catch {}
}

export const hapticLight  = () => haptic([6])
export const hapticMedium = () => haptic([12])
export const hapticError  = () => haptic([20, 60, 20])
export const hapticSuccess = () => haptic([8, 40, 8])
