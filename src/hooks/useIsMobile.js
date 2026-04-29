import { useState, useEffect } from 'react'

/**
 * Returns true when the viewport width is ≤ 640px (smartphone).
 * Re-evaluates on window resize.
 */
export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}
