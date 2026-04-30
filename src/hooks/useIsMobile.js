import { useState, useEffect } from 'react'

/**
 * Returns true when the device is a smartphone (≤ 640px on its shortest axis).
 * Uses Math.min(width, height) so the value stays true even when the phone
 * rotates to landscape (otherwise the desktop layout would kick in).
 */
export default function useIsMobile() {
  const check = () => Math.min(window.innerWidth, window.innerHeight) <= 640
  const [isMobile, setIsMobile] = useState(check)
  useEffect(() => {
    const handler = () => setIsMobile(check())
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}
