import { useEffect, useRef, useState } from 'react'

/**
 * Sonni oldingi qiymatdan yangi qiymatgacha silliq "hisoblab" ko'rsatadi
 * — statik raqam o'rniga zamonaviy, jonli ko'rinish beradi (Boshqaruv
 * paneli KPI kartalari uchun).
 */
export function AnimatedNumber({
  value,
  format = (n) => String(n),
  duration = 700,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
}) {
  const [display, setDisplay] = useState(value)
  const prevValue = useRef(value)

  useEffect(() => {
    const from = prevValue.current
    const to = value
    if (from === to) return

    const startTime = performance.now()
    let raf: number

    function tick(now: number) {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(from + (to - from) * eased)
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        prevValue.current = to
        setDisplay(to)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <>{format(Math.round(display))}</>
}
