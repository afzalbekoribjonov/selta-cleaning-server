import { collection, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'
import { photosOf, type ItemPhotos } from './item-photos'
import { STATUS_CONFIG, TARIFF_CONFIG } from './status-config'
import { DEPARTMENTS } from './departments'
import { formatMoney, formatQty } from './units'

/**
 * Buyurtma mahsuloti — `orders/{id}/items` hujjati, admin ko'rishi uchun
 * kerakli BARCHA maydonlar bilan (server: lib/pricing.ts ComputedItem +
 * routes/orders.ts holat maydonlari).
 */
export interface OrderItem {
  id: string
  itemNumber: number
  name: string
  calcType: string
  category: string | null
  width: number | null
  height: number | null
  qty: number | null
  /** Eski mahsulotlarda faqat shu bor (o'lcham maydonlaridan oldin). */
  area: number
  sizeVariant: string | null
  unitPrice: number | null
  condition: string | null
  conditionSurchargePercent: number | null
  tariff: string | null
  price: number
  status: string | null
  qcStatus: string
  qcNote: string | null
  dueDate: Date | null
  createdAt: Date | null
  addedBy: string | null
  addedByDepartment: string | null
  washedBy: string | null
  washedAt: Date | null
  packedBy: string | null
  packedAt: Date | null
  deliveredBy: string | null
  deliveredAt: Date | null
  deliveredByName: string | null
  collectedAmount: number | null
  photos: ItemPhotos
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const date = (v: unknown): Date | null => (v as Timestamp | undefined)?.toDate?.() ?? null

export function mapOrderItem(id: string, d: Record<string, unknown>): OrderItem {
  return {
    id,
    itemNumber: num(d.itemNumber) ?? 0,
    name: str(d.name) ?? 'Mahsulot',
    calcType: str(d.calcType) ?? (num(d.area) ? 'sqm' : 'fixed'),
    category: str(d.category),
    width: num(d.width),
    height: num(d.height),
    qty: num(d.qty),
    area: num(d.area) ?? 0,
    sizeVariant: str(d.sizeVariant),
    unitPrice: num(d.unitPrice),
    condition: str(d.condition),
    conditionSurchargePercent: num(d.conditionSurchargePercent),
    tariff: str(d.tariff),
    price: num(d.price) ?? 0,
    status: str(d.status),
    qcStatus: str(d.qcStatus) ?? 'pending',
    qcNote: str(d.qcNote),
    dueDate: date(d.dueDate),
    createdAt: date(d.createdAt),
    addedBy: str(d.addedBy),
    addedByDepartment: str(d.addedByDepartment),
    washedBy: str(d.washedBy),
    washedAt: date(d.washedAt),
    packedBy: str(d.packedBy),
    packedAt: date(d.packedAt),
    deliveredBy: str(d.deliveredBy),
    deliveredAt: date(d.deliveredAt),
    deliveredByName: str(d.deliveredByName),
    collectedAmount: num(d.collectedAmount),
    photos: photosOf(d.photos),
  }
}

export const CONDITION_LABELS: Record<string, string> = { average: "O'rtacha", bad: 'Yomon', veryBad: 'Juda yomon' }
export const SIZE_LABELS: Record<string, string> = { small: 'Kichik', large: 'Katta' }
export const CALC_TYPE_LABELS: Record<string, string> = {
  sqm: 'Kvadrat metr',
  meter: 'Metr',
  kg: 'Kilogramm',
  count: 'Dona',
  size: "O'lcham (kichik/katta)",
  fixed: 'Belgilangan narx',
}

/** 3 / 3.5 / 2.25 — keraksiz nollarsiz. */
function dim(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}

/** "12,5 m² (2,5×5)" / "3 dona" / "Katta" — ilovadagi `itemMeasurementLabel` bilan bir xil. */
export function itemMeasurement(item: Pick<OrderItem, 'calcType' | 'qty' | 'width' | 'height' | 'sizeVariant' | 'area'>): string {
  switch (item.calcType) {
    case 'sqm': {
      const qty = item.qty ?? item.area
      if (!qty) return "O'lchanmagan"
      const size = item.width && item.height ? ` (${dim(item.width)}×${dim(item.height)})` : ''
      return `${formatQty(qty, 'sqm')} m²${size}`
    }
    case 'meter':
      return item.qty ? `${formatQty(item.qty, 'meter')} metr` : "O'lchanmagan"
    case 'kg':
      return item.qty ? `${formatQty(item.qty, 'kg')} kg` : "O'lchanmagan"
    case 'count':
      return `${formatQty(item.qty ?? 0, 'dona')} dona`
    case 'size':
      return SIZE_LABELS[item.sizeVariant ?? ''] ?? 'Kichik'
    default:
      return ''
  }
}

/** Birlik narxi matni — "25 000 so'm / m²". */
export function unitPriceLabel(item: Pick<OrderItem, 'calcType' | 'unitPrice'>): string | null {
  if (!item.unitPrice) return null
  const per: Record<string, string> = { sqm: 'm²', meter: 'metr', kg: 'kg', count: 'dona' }
  return per[item.calcType] ? `${formatMoney(item.unitPrice)} / ${per[item.calcType]}` : null
}

/* ------------------------------------------------------------------ */
/* Mahsulot o'zgarish tarixi — orders/{id}/itemEvents                   */
/* ------------------------------------------------------------------ */

export type ItemEventType = 'created' | 'updated' | 'status' | 'deleted' | 'photo_added' | 'photo_removed'

export interface ItemEvent {
  id: string
  type: ItemEventType
  itemId: string
  itemNumber: number | null
  itemName: string
  by: string
  role: string | null
  /** Ishchi nomidan nazoratchi qayd etgan bo'lsa — nazoratchi. */
  recordedBy: string | null
  changes: { field: string; from: unknown; to: unknown }[]
  snapshot: Record<string, unknown> | null
  fromStatus: string | null
  toStatus: string | null
  note: string | null
  amount: number | null
  photoState: string | null
  at: Date | null
}

export function mapItemEvent(id: string, d: Record<string, unknown>): ItemEvent {
  return {
    id,
    type: (str(d.type) ?? 'updated') as ItemEventType,
    itemId: str(d.itemId) ?? '',
    itemNumber: num(d.itemNumber),
    itemName: str(d.itemName) ?? 'Mahsulot',
    by: str(d.by) ?? '',
    role: str(d.role),
    recordedBy: str(d.recordedBy),
    changes: Array.isArray(d.changes) ? (d.changes as ItemEvent['changes']) : [],
    snapshot: d.snapshot && typeof d.snapshot === 'object' ? (d.snapshot as Record<string, unknown>) : null,
    fromStatus: str(d.fromStatus),
    toStatus: str(d.toStatus),
    note: str(d.note),
    amount: num(d.amount),
    photoState: str(d.photoState),
    at: date(d.at),
  }
}

/** Buyurtmaning barcha mahsulot hodisalari — vaqt bo'yicha, jonli. */
export function useItemEvents(orderId: string): { events: ItemEvent[]; loading: boolean; error: boolean } {
  const [state, setState] = useState<{ id: string; events: ItemEvent[]; loading: boolean; error: boolean }>({
    id: orderId,
    events: [],
    loading: true,
    error: false,
  })
  useEffect(() => {
    const q = query(collection(db, 'orders', orderId, 'itemEvents'), orderBy('at', 'asc'))
    return onSnapshot(
      q,
      (snap) => setState({ id: orderId, events: snap.docs.map((d) => mapItemEvent(d.id, d.data())), loading: false, error: false }),
      () => setState({ id: orderId, events: [], loading: false, error: true }),
    )
  }, [orderId])
  // Boshqa buyurtmaga o'tilganda eski buyurtma tarixi bir lahza ham ko'rinmasin.
  return state.id === orderId ? state : { events: [], loading: true, error: false }
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nomi',
  calcType: 'Hisoblash turi',
  width: 'Eni',
  height: "Bo'yi",
  qty: 'Miqdori',
  sizeVariant: "O'lchami",
  condition: 'Holati',
  tariff: 'Tarif',
  price: 'Narxi',
}

/** Maydon qiymatini o'qiladigan matnga aylantiradi. */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (field) {
    case 'price':
      return formatMoney(Number(value))
    case 'width':
    case 'height':
      return `${dim(Number(value))} m`
    case 'qty':
      return formatQty(Number(value))
    case 'condition':
      return CONDITION_LABELS[String(value)] ?? String(value)
    case 'sizeVariant':
      return SIZE_LABELS[String(value)] ?? String(value)
    case 'tariff':
      return TARIFF_CONFIG[String(value)]?.label ?? String(value)
    case 'calcType':
      return CALC_TYPE_LABELS[String(value)] ?? String(value)
    default:
      return String(value)
  }
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

export function statusText(status: string | null): string {
  return status ? (STATUS_CONFIG[status]?.label ?? status) : '—'
}

export function roleLabel(role: string | null): string | null {
  if (!role) return null
  if (role === 'admin') return 'Admin'
  return DEPARTMENTS[role]?.label ?? null
}

/** Xodim ismi — topilmasa bo'lim nomi yoki umumiy "Xodim". */
export function actorName(employees: Record<string, string>, id: string, role: string | null): string {
  if (id && employees[id]) return employees[id]
  return roleLabel(role) ?? (id ? 'Xodim' : "Noma'lum")
}

/** Hodisaning qisqa sarlavhasi — "Qo'shildi", "Yuvildi", "Narxi o'zgardi". */
export function eventTitle(e: ItemEvent): string {
  switch (e.type) {
    case 'created':
      return "Qo'shildi"
    case 'deleted':
      return "O'chirildi"
    case 'photo_added':
      return e.photoState === 'ready' ? "Tayyor holati rasmi qo'shildi" : "Eski holati rasmi qo'shildi"
    case 'photo_removed':
      return "Rasm o'chirildi"
    case 'status':
      switch (e.toStatus) {
        case 'washing':
          return e.fromStatus === 'returned' ? 'Qayta yuvishga olindi' : 'Yuvishga olindi'
        case 'packing':
          return 'Yuvildi, upakovkaga o\'tdi'
        case 'ready':
          return 'Upakovka qilindi — tayyor'
        case 'returned':
          return 'Sifatdan qaytarildi'
        case 'done':
          return 'Mijozga yetkazildi'
        case 'pending':
          return 'Navbatga qaytarildi'
        default:
          return `Holati: ${statusText(e.toStatus)}`
      }
    default:
      if (e.changes.length === 1) return `${fieldLabel(e.changes[0].field)} o'zgardi`
      return "Ma'lumotlari o'zgardi"
  }
}

/**
 * Tarixi yozilmagan (bu xususiyatdan oldingi) mahsulotlar uchun — mahsulot
 * hujjatidagi vaqt belgilaridan tiklangan qisqa tarix. Ular aniq, faqat
 * o'lcham/narx tahrirlari ko'rinmaydi.
 */
export function derivedItemEvents(item: OrderItem): ItemEvent[] {
  const base = {
    itemId: item.id,
    itemNumber: item.itemNumber,
    itemName: item.name,
    role: null,
    recordedBy: null,
    changes: [],
    snapshot: null,
    note: null,
    amount: null,
    photoState: null,
  }
  const out: ItemEvent[] = []
  if (item.createdAt) {
    out.push({ ...base, id: `${item.id}-c`, type: 'created', by: item.addedBy ?? '', role: item.addedByDepartment, fromStatus: null, toStatus: null, at: item.createdAt })
  }
  if (item.washedAt) {
    out.push({ ...base, id: `${item.id}-w`, type: 'status', by: item.washedBy ?? '', fromStatus: 'washing', toStatus: 'packing', at: item.washedAt })
  }
  if (item.packedAt) {
    out.push({ ...base, id: `${item.id}-p`, type: 'status', by: item.packedBy ?? '', fromStatus: 'packing', toStatus: 'ready', at: item.packedAt })
  }
  if (item.deliveredAt) {
    out.push({
      ...base,
      id: `${item.id}-d`,
      type: 'status',
      by: item.deliveredBy ?? '',
      fromStatus: 'ready',
      toStatus: 'done',
      amount: item.collectedAmount,
      at: item.deliveredAt,
    })
  }
  return out
}
