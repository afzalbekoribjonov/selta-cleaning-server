import {
  ArrowRight,
  Camera,
  CameraOff,
  CircleDot,
  Droplets,
  Package,
  PackageCheck,
  Pencil,
  PlusCircle,
  RotateCcw,
  Trash2,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { formatDateTimeUz } from '@/lib/date-utils'
import { actorName, eventTitle, fieldLabel, formatFieldValue, roleLabel, type ItemEvent } from '@/lib/order-items'
import { formatMoney } from '@/lib/units'
import { cn } from '@/lib/utils'

/** Hodisa turi -> belgi va rang. */
function eventLook(e: ItemEvent): { icon: LucideIcon; tone: string } {
  switch (e.type) {
    case 'created':
      return { icon: PlusCircle, tone: 'bg-brand-primary/10 text-brand-primary' }
    case 'deleted':
      return { icon: Trash2, tone: 'bg-danger-bg text-danger' }
    case 'photo_added':
      return { icon: Camera, tone: 'bg-info-bg text-info' }
    case 'photo_removed':
      return { icon: CameraOff, tone: 'bg-bg text-gray-dark' }
    case 'updated':
      return { icon: Pencil, tone: 'bg-warning-bg text-[#8a5a00]' }
    default:
      switch (e.toStatus) {
        case 'washing':
          return { icon: Droplets, tone: 'bg-info-bg text-info' }
        case 'packing':
          return { icon: Package, tone: 'bg-warning-bg text-[#8a5a00]' }
        case 'ready':
          return { icon: PackageCheck, tone: 'bg-success-bg text-success' }
        case 'done':
          return { icon: Truck, tone: 'bg-success-bg text-success' }
        case 'returned':
          return { icon: RotateCcw, tone: 'bg-danger-bg text-danger' }
        default:
          return { icon: CircleDot, tone: 'bg-bg text-gray-dark' }
      }
  }
}

/**
 * Mahsulot tarixi — vertikal chiziq bo'ylab hodisalar. `showItem` —
 * umumiy tarixda qaysi mahsulotga tegishliligi ham yoziladi.
 */
export function ItemTimeline({
  events,
  employees,
  orderNumber,
  showItem = false,
  newestFirst = false,
}: {
  events: ItemEvent[]
  employees: Record<string, string>
  orderNumber: number
  showItem?: boolean
  newestFirst?: boolean
}) {
  const list = newestFirst ? [...events].reverse() : events
  return (
    <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
      {list.map((e) => (
        <ItemEventRow key={e.id} event={e} employees={employees} orderNumber={orderNumber} showItem={showItem} />
      ))}
    </ol>
  )
}

export function ItemEventRow({
  event: e,
  employees,
  orderNumber,
  showItem,
}: {
  event: ItemEvent
  employees: Record<string, string>
  orderNumber: number
  showItem: boolean
}) {
  const { icon: Icon, tone } = eventLook(e)
  const who = actorName(employees, e.by, e.role)
  const role = roleLabel(e.role)
  const snapshotPrice = typeof e.snapshot?.price === 'number' ? (e.snapshot.price as number) : null

  return (
    <li className="relative flex gap-3">
      <span className={cn('relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-surface', tone)}>
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[13px] font-bold leading-snug text-ink">
          {showItem && (
            <span className="mr-1.5 rounded bg-brand-primary/10 px-1.5 py-px text-[11px] font-extrabold text-brand-primary">
              {orderNumber}/{e.itemNumber ?? '?'}
            </span>
          )}
          {showItem && <span className="text-gray-dark">{e.itemName} — </span>}
          {eventTitle(e)}
        </div>

        {e.type === 'updated' && e.changes.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {e.changes.map((c) => (
              <li key={c.field} className="flex flex-wrap items-center gap-x-1.5 text-xs">
                <span className="text-gray-dark">{fieldLabel(c.field)}:</span>
                <span className="text-gray line-through decoration-gray/60">{formatFieldValue(c.field, c.from)}</span>
                <ArrowRight size={11} className="text-gray" />
                <span className="font-bold text-ink">{formatFieldValue(c.field, c.to)}</span>
              </li>
            ))}
          </ul>
        )}

        {(e.type === 'created' || e.type === 'deleted') && e.snapshot && (
          <p className="mt-0.5 text-xs text-gray-dark">
            {[
              typeof e.snapshot.qty === 'number' && e.snapshot.calcType !== 'size'
                ? `${formatFieldValue('qty', e.snapshot.qty)}${e.snapshot.calcType === 'sqm' ? ' m²' : ''}`
                : null,
              e.snapshot.sizeVariant ? formatFieldValue('sizeVariant', e.snapshot.sizeVariant) : null,
              e.snapshot.tariff ? formatFieldValue('tariff', e.snapshot.tariff) : null,
              snapshotPrice !== null ? formatMoney(snapshotPrice) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}

        {e.note && <p className="mt-0.5 text-xs font-semibold text-danger">Sabab: {e.note}</p>}
        {e.type === 'status' && e.toStatus === 'done' && e.amount !== null && (
          <p className="mt-0.5 text-xs font-semibold text-success">Olingan summa: {formatMoney(e.amount)}</p>
        )}

        <p className="mt-0.5 text-[11px] text-gray-dark">
          {who}
          {role && who !== role && <span className="text-gray"> · {role}</span>}
          {e.at && <> · {formatDateTimeUz(e.at)}</>}
        </p>
      </div>
    </li>
  )
}
