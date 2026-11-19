import { STATUS_CONFIG, TARIFF_CONFIG } from '@/lib/status-config'

export function StatusBadge({ status }: { status: string }) {
  const info = STATUS_CONFIG[status] ?? STATUS_CONFIG.new
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color: info.color, backgroundColor: info.bg }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
      {info.label}
    </span>
  )
}

export function TariffBadge({ tariff }: { tariff: string | null }) {
  if (!tariff) return null
  const info = TARIFF_CONFIG[tariff] ?? TARIFF_CONFIG.standart
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
      style={{ color: info.color, backgroundColor: info.bg }}
    >
      {info.label}
    </span>
  )
}

/**
 * Buyurtma ro'yxatlarida (ustun torligi tufayli) tarif nomlarini emas,
 * har bir mavjud tarifning o'z rangidagi bitta yumaloq nuqtasini
 * ko'rsatadi — talab: "yumaloq shaklda... bitta turishi yetarli".
 */
/**
 * Tarif nuqtalari. `counts` berilsa — har bir tarif yonida mahsulotlar
 * soni (Premium → Express → Comfort → Standart), bitta qatorda.
 */
export function TariffDots({ tariffs, counts }: { tariffs?: string[]; counts?: Record<string, number> }) {
  if (counts) {
    const keys = ['premium', 'express', 'comfort', 'standart'].filter((t) => t in counts)
    if (keys.length === 0) return <span className="text-gray-dark">—</span>
    return (
      <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
        {keys.map((t) => {
          const info = TARIFF_CONFIG[t]
          return (
            <span key={t} title={info.label} className="inline-flex items-center gap-1 text-[11px] font-extrabold" style={{ color: info.color }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: info.color, boxShadow: `0 0 4px ${info.color}66` }} />
              {counts[t] > 0 ? counts[t] : info.label}
            </span>
          )
        })}
      </span>
    )
  }
  if (!tariffs || tariffs.length === 0) return <span className="text-gray-dark">—</span>
  // `span`, `div` emas: bu komponent tugma/matn ichida ham ishlatiladi,
  // u yerda blok element yaroqsiz HTML beradi.
  return (
    <span className="inline-flex items-center gap-1">
      {tariffs.map((t) => {
        const info = TARIFF_CONFIG[t] ?? TARIFF_CONFIG.standart
        return <span key={t} title={info.label} className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
      })}
    </span>
  )
}
