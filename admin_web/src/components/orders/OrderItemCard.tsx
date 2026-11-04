import { useState } from 'react'
import { ChevronDown, History } from 'lucide-react'
import { formatDateTimeUz, formatDateUz } from '@/lib/date-utils'
import {
  CONDITION_LABELS,
  actorName,
  derivedItemEvents,
  itemMeasurement,
  unitPriceLabel,
  type ItemEvent,
  type OrderItem,
} from '@/lib/order-items'
import { daysUntil, dueLabel } from '@/lib/order-tariffs'
import { COLOR_STAGE_HEX, STATUS_CONFIG, TARIFF_CONFIG, colorStageFor } from '@/lib/status-config'
import { type TariffConfig } from '@/lib/tariffs'
import { formatMoney } from '@/lib/units'
import { readyDaysOf } from '@/lib/warehouse'
import { useWarehouseDays } from '@/hooks/useWarehouseDays'
import { cn } from '@/lib/utils'
import { ItemPhotoStrip } from './ItemPhotos'
import { ItemTimeline } from './ItemTimeline'

/**
 * Bitta mahsulot — nima (o'lcham, birlik narxi, holati, tarif, muddat),
 * kim va qachon (qo'shdi → yuvdi → upakovka → yetkazdi) va alohida
 * o'zgarish tarixi (ochiladigan qism).
 */
export function OrderItemCard({
  item,
  orderId,
  orderNumber,
  events,
  employees,
  tariffs,
}: {
  item: OrderItem
  orderId: string
  orderNumber: number
  /** Shu mahsulotning server yozgan tarixi (bo'sh bo'lsa vaqt belgilaridan tiklanadi). */
  events: ItemEvent[]
  employees: Record<string, string>
  tariffs: TariffConfig
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const done = item.status === 'done'
  const statusInfo = item.status ? STATUS_CONFIG[item.status] : null
  const tariffInfo = item.tariff ? TARIFF_CONFIG[item.tariff] : null
  const colorStage = item.status && !done && item.tariff && item.createdAt ? colorStageFor(item.tariff, item.createdAt, tariffs) : null
  const unmeasured = item.price <= 0 && !done
  const measurement = itemMeasurement(item)
  const perUnit = unitPriceLabel(item)
  const overdue = !!item.dueDate && !done && daysUntil(item.dueDate) < 0
  // Tayyor bo'lganiga chegara kunidan oshgan mahsulot omborda turadi
  // (ilovadagi Omborxona bilan bir xil qoida).
  const threshold = useWarehouseDays()
  const sinceReady = item.status === 'ready' ? readyDaysOf(item.packedAt ?? item.washedAt) : null
  const warehouseDays = sinceReady !== null && sinceReady >= threshold ? sinceReady : null

  // Tarix yozilishidan oldingi mahsulotlar uchun — vaqt belgilaridan tiklanadi.
  const history = events.length > 0 ? events : derivedItemEvents(item)
  const historyIsDerived = events.length === 0 && history.length > 0

  const steps = [
    { key: 'added', label: "Qo'shildi", by: item.addedBy, role: item.addedByDepartment, at: item.createdAt },
    { key: 'washed', label: 'Yuvildi', by: item.washedBy, role: 'worker', at: item.washedAt },
    { key: 'packed', label: 'Upakovka', by: item.packedBy, role: 'worker', at: item.packedAt },
    { key: 'delivered', label: 'Yetkazildi', by: item.deliveredBy, role: 'delivery', at: item.deliveredAt },
  ]
  const isPickupItem = item.status !== null

  return (
    <li
      className={cn(
        'rounded-2xl border bg-surface p-3.5',
        unmeasured ? 'border-danger/40 bg-danger-bg/30' : item.status === 'returned' ? 'border-danger/30' : 'border-border',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-px shrink-0 rounded-md bg-brand-primary/10 px-2 py-0.5 text-xs font-extrabold tabular-nums text-brand-primary">
          {orderNumber}/{item.itemNumber}
        </span>
        <span className={cn('min-w-0 flex-1 text-sm font-bold leading-snug [overflow-wrap:anywhere]', done ? 'text-success' : 'text-ink')}>
          {item.name}
        </span>
        <span className={cn('shrink-0 whitespace-nowrap text-sm font-extrabold tabular-nums', unmeasured ? 'text-danger' : 'text-ink')}>
          {unmeasured ? "Narxsiz" : formatMoney(item.price)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {statusInfo && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: statusInfo.color, backgroundColor: statusInfo.bg }}>
            {statusInfo.label}
          </span>
        )}
        {tariffInfo && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: tariffInfo.color, backgroundColor: tariffInfo.bg }}>
            {tariffInfo.label}
          </span>
        )}
        {item.dueDate && !done && (
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
              overdue ? 'bg-danger-bg text-danger' : 'bg-bg text-gray-dark',
            )}
          >
            {colorStage && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLOR_STAGE_HEX[colorStage] }} />}
            {formatDateUz(item.dueDate)} · {dueLabel(item.dueDate)}
          </span>
        )}
        {warehouseDays !== null && (
          <span className="rounded-full bg-[#fdf0e6] px-2 py-0.5 text-[11px] font-bold text-[#dd6b20]">
            Omborda · {warehouseDays} kun
          </span>
        )}
      </div>

      {/* O'lchov va narx tarkibi */}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {measurement && (
          <>
            <dt className="text-gray-dark">O'lchami</dt>
            <dd className={cn('font-semibold', unmeasured ? 'text-danger' : 'text-ink')}>{measurement}</dd>
          </>
        )}
        {perUnit && (
          <>
            <dt className="text-gray-dark">Birlik narxi</dt>
            <dd className="font-semibold text-ink">{perUnit}</dd>
          </>
        )}
        {item.condition && (
          <>
            <dt className="text-gray-dark">Holati</dt>
            <dd className="font-semibold text-ink">
              {CONDITION_LABELS[item.condition] ?? item.condition}
              {item.conditionSurchargePercent ? ` (+${item.conditionSurchargePercent}%)` : ''}
            </dd>
          </>
        )}
        {done && item.collectedAmount !== null && (
          <>
            <dt className="text-gray-dark">Olingan</dt>
            <dd className="font-semibold text-success">{formatMoney(item.collectedAmount)}</dd>
          </>
        )}
      </dl>

      {item.status === 'returned' && item.qcNote && (
        <p className="mt-2 rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs font-semibold text-danger">Qaytarish sababi: {item.qcNote}</p>
      )}

      {/* Kim va qachon — bosqichlar */}
      {isPickupItem && (
        <ol className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {steps.map((s) => {
            const reached = !!s.at
            return (
              <li key={s.key} className={cn('min-w-0 rounded-xl px-2.5 py-1.5', reached ? 'bg-success-bg/60' : 'bg-bg')}>
                <div className={cn('text-[10.5px] font-bold uppercase tracking-wide', reached ? 'text-success' : 'text-gray')}>{s.label}</div>
                {reached ? (
                  <>
                    <div className="text-[11.5px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
                      {s.key === 'delivered' && item.deliveredByName && !employees[s.by ?? '']
                        ? item.deliveredByName
                        : actorName(employees, s.by ?? '', s.role)}
                    </div>
                    <div className="text-[10.5px] tabular-nums text-gray-dark">{formatDateTimeUz(s.at!)}</div>
                  </>
                ) : (
                  <div className="text-[11.5px] text-gray">—</div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <ItemPhotoStrip orderId={orderId} itemId={item.id} photos={item.photos} />

      {history.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="flex w-full items-center gap-1.5 rounded-lg py-1 text-left text-xs font-bold text-brand-primary hover:opacity-80"
          >
            <History size={14} />
            O'zgarish tarixi ({history.length})
            <ChevronDown size={14} className={cn('ml-auto transition-transform', historyOpen && 'rotate-180')} />
          </button>
          {historyOpen && (
            <div className="mt-2">
              <ItemTimeline events={history} employees={employees} orderNumber={orderNumber} />
              {historyIsDerived && (
                <p className="mt-2 text-[11px] text-gray">
                  Bu mahsulot batafsil tarix yozilishidan oldin qo'shilgan — faqat asosiy bosqichlar ko'rsatildi.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
