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
