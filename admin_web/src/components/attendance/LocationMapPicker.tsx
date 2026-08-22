import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Vite bilan Leaflet'ning standart marker rasm yo'llari buzilib qoladi
// (bundler ularni to'g'ri hal qila olmaydi) — qo'lda qayta belgilanadi.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

const TASHKENT_CENTER: [number, number] = [41.2995, 69.2401]

/**
 * Ishxona joylashuvini xaritada bosib belgilash — talab: "xaritada
 * belgilab qo'yish imkoniyati". Vanilla Leaflet (OpenStreetMap plitkalari,
 * API kalit shart emas) — react-leaflet qo'shimcha qaramlik kiritmaslik
 * uchun ishlatilmadi.
 */
export function LocationMapPicker({
  value,
  onChange,
  radiusMeters,
}: {
  value: { lat: number; lng: number } | null
  onChange: (coords: { lat: number; lng: number }) => void
  radiusMeters: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Xarita bir marta yaratiladi — `value`/`radiusMeters` o'zgarishi bilan
  // qayta yaratilmaydi (aks holda foydalanuvchi surib qo'ygan ko'rinish
  // har safar qayta tiklanib ketardi).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const center: [number, number] = value ? [value.lat, value.lng] : TASHKENT_CENTER
    const map = L.map(containerRef.current).setView(center, value ? 16 : 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat bir marta, `value` faqat boshlang'ich markaz sifatida
  }, [])

  // Marker + radius doirasi — qiymat yoki radius o'zgarganda yangilanadi.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
    if (circleRef.current) {
      circleRef.current.remove()
      circleRef.current = null
    }

    if (value) {
      markerRef.current = L.marker([value.lat, value.lng]).addTo(map)
      circleRef.current = L.circle([value.lat, value.lng], {
        radius: radiusMeters,
        color: '#5A148C',
        fillColor: '#5A148C',
        fillOpacity: 0.12,
      }).addTo(map)
    }
  }, [value, radiusMeters])

  return (
    <div>
      <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-xl border border-border" />
      <p className="mt-1.5 text-xs text-gray-dark">Ishxona joylashuvini belgilash uchun xaritaga bosing</p>
    </div>
  )
}
