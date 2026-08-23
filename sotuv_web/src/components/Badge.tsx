import { STATUS_CONFIG, TARIFF_CONFIG } from '@/lib/status-config'

export function StatusBadge({ status }: { status: string }) {
  const info = STATUS_CONFIG[status]
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold"
      style={{ color: info?.color ?? '#7A7482', background: info?.bg ?? '#F1EFF3' }}
    >
      {info?.label ?? status}
    </span>
  )
}

export function TariffBadge({ tariff }: { tariff: string }) {
  const info = TARIFF_CONFIG[tariff]
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold"
      style={{ color: info?.color ?? '#7A7482', background: info?.bg ?? '#F1EFF3' }}
    >
      {info?.label ?? tariff}
    </span>
  )
}

/**
 * Buyurtmalar jadvalida (ustun torligi tufayli) tarif nomlarini emas, har
 * bir mavjud tarifning o'z rangidagi nuqtasini ko'rsatadi — pickup
 * buyurtmalarda bir nechta tarif bo'lishi mumkin (har bir item o'zinikiga
 * ega). admin_web/src/components/ui/StatusBadge.tsx:TariffDots bilan bir xil.
 */
export function TariffDots({ tariffs }: { tariffs: string[] }) {
  if (tariffs.length === 0) return <span className="text-gray-dark">—</span>
  return (
    <div className="flex items-center gap-1">
      {tariffs.map((t) => {
        const info = TARIFF_CONFIG[t]
        return <span key={t} title={info?.label ?? t} className="h-3 w-3 shrink-0 rounded-full" style={{ background: info?.color ?? '#7A7482' }} />
      })}
    </div>
  )
}
