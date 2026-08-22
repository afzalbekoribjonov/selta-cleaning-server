import { STATUS_CONFIG, TARIFF_CONFIG } from '@/lib/status-config'

export function StatusBadge({ status }: { status: string }) {
  const info = STATUS_CONFIG[status] ?? STATUS_CONFIG.new
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color: info.color, backgroundColor: info.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: info.color }} />
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
export function TariffDots({ tariffs }: { tariffs: string[] }) {
  if (tariffs.length === 0) return <span className="text-gray-dark">—</span>
  return (
    <div className="flex items-center gap-1">
      {tariffs.map((t) => {
        const info = TARIFF_CONFIG[t] ?? TARIFF_CONFIG.standart
        return <span key={t} title={info.label} className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
      })}
    </div>
  )
}
