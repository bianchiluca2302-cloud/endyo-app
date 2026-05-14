import { useState, useRef, useEffect } from 'react'

const THRESHOLD = 72

export default function usePullToRefresh(onRefresh, containerRef) {
  const [refreshing, setRefreshing] = useState(false)
  const [pullY, setPullY] = useState(0)
  const startY = useRef(0)
  const active = useRef(false)
  const refreshingRef = useRef(false)

  useEffect(() => {
    const el = containerRef?.current
    if (!el) return

    const onTouchStart = (e) => {
      if (el.scrollTop <= 0 && !refreshingRef.current) {
        startY.current = e.touches[0].clientY
        active.current = true
      }
    }

    const onTouchMove = (e) => {
      if (!active.current) return
      const dy = Math.max(0, e.touches[0].clientY - startY.current)
      setPullY(Math.min(dy * 0.45, 60))
    }

    const onTouchEnd = async () => {
      if (!active.current) return
      active.current = false
      const currentPull = pullY
      setPullY(0)
      if (currentPull >= THRESHOLD * 0.45 && !refreshingRef.current) {
        refreshingRef.current = true
        setRefreshing(true)
        try { await onRefresh() } catch {}
        setRefreshing(false)
        refreshingRef.current = false
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [containerRef, onRefresh, pullY])

  return { refreshing, pullY }
}
