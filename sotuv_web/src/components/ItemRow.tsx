import { AlertCircle } from 'lucide-react'
import { STATUS_CONFIG, TARIFF_CONFIG, colorStageFor, COLOR_STAGE_HEX } from '@/lib/status-config'
import { isItemDone, type OrderItem } from '@/lib/order-items'

const CONDITION_LABELS: Record<string, string> = { average: "O'rtacha", bad: 'Yomon', veryBad: 'Juda yomon' }

function measurementLabel(item: OrderItem): string {
  switch (item.calcType) {
    case 'sqm': {
      const qty = item.qty?.toFixed(2) ?? '0'
      if (item.width != null && item.height != null) return `${qty} m² (${item.width}×${item.height})`
      return `${qty} m²`
    }
    case 'meter':
      return `${item.qty?.toFixed(1) ?? '0'} metr`
    case 'kg':
      return `${item.qty?.toFixed(1) ?? '0'} kg`
    case 'count':
      return `${item.qty?.toFixed(0) ?? '0'} dona`
    case 'size':
      return item.sizeVariant === 'large' ? 'Katta' : 'Kichik'
    default:
      return ''
  }
}

export function ItemRow({ item, subId, onClick }: { item: OrderItem; subId: string; onClick?: () => void }) {
  const failed = item.qcStatus === 'failed'
  const measurement = measurementLabel(item)
  const conditionLabel = item.condition ? CONDITION_LABELS[item.condition] : null
  const done = isItemDone(item)
  const showDot = item.status != null && !done && item.tariff != null && item.createdAt != null
  const colorStage = showDot ? colorStageFor(item.tariff!, item.createdAt!) : null

  return (
    <button onClick={onClick} disabled={!onClick} className="w-full py-2 text-left disabled:cursor-default">
      <div className="flex items-start gap-2.5">
        {colorStage && <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_STAGE_HEX[colorStage] }} />}
        <span className="shrink-0 rounded-lg bg-brand-primary/10 px-2 py-0.5 text-xs font-extrabold text-brand-primary">{subId}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${done ? 'text-success line-through' : 'text-ink'}`}>{item.name}</p>
          {measurement && <p className="text-xs text-gray-dark">{measurement}</p>}
        </div>
        <div className="shrink-0 text-right">
          {/* Talab: narxi 0 bo'lgan (o'lchanmagan) mahsulot qizarib tursin —
              u upakovkaga o'tolmaydi (server: changeItemStatus). */}
          {item.price <= 0 && !done ? (
            <span className="inline-block rounded-md border border-danger/40 bg-danger-bg px-1.5 py-0.5 text-[10px] font-extrabold text-danger">
              0 so'm — o'lchanmagan
            </span>
          ) : (
            <p className="text-xs font-bold text-gray-dark">{item.price.toFixed(0)} so'm</p>
          )}
          {conditionLabel && (
            <span className="mt-1 inline-block rounded-md bg-warning-bg px-1.5 py-0.5 text-[10px] font-bold text-warning">
              {item.conditionSurchargePercent ? `${conditionLabel} +${item.conditionSurchargePercent.toFixed(0)}%` : conditionLabel}
            </span>
          )}
        </div>
        {failed && <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" />}
      </div>
      {(item.tariff || item.status) && (
        <div className="ml-[52px] mt-1.5 flex flex-wrap gap-1.5">
          {item.tariff && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
              style={{ color: TARIFF_CONFIG[item.tariff]?.color, background: TARIFF_CONFIG[item.tariff]?.bg }}
            >
              {TARIFF_CONFIG[item.tariff]?.label ?? item.tariff}
            </span>
          )}
          {item.status && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
              style={{ color: STATUS_CONFIG[item.status]?.color, background: STATUS_CONFIG[item.status]?.bg }}
            >
              {STATUS_CONFIG[item.status]?.label ?? item.status}
            </span>
          )}
        </div>
      )}
      {failed && (
        <p className="ml-[52px] mt-1 text-xs font-semibold text-danger">
          {item.qcNote ? `Sifat nazorati rad etdi: ${item.qcNote}` : 'Sifat nazorati rad etdi — qayta ishlov kerak'}
        </p>
      )}
      {done && item.deliveredByName && (
        <p className="ml-[52px] mt-1 text-xs font-semibold text-gray-dark">Yetkazdi: {item.deliveredByName}</p>
      )}
    </button>
  )
}
