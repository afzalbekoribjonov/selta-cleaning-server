import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type QueryDocumentSnapshot,
  type DocumentSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

export interface Order {
  id: string
  orderNumber: number
  customerName: string
  phone: string
  location: string
  gpsCoords: string | null
  serviceType: 'pickup' | 'onsite'
  tariff: 'express' | 'comfort' | 'standart' | 'premium' | null
  status: string
  assignedTeam: string[]
  totalArea: number
  totalPrice: number
  createdBy: string
  collectedAmount?: number
  hasFailedItem?: boolean
  createdAt: Date
  dueDate: Date | null
  notedItems: string[]
  estimatedPrice: number | null
  source: string | null
  intakeMethod: string | null
}

function toOrder(snap: QueryDocumentSnapshot | DocumentSnapshot): Order {
  const data = snap.data() ?? {}
  return {
    id: snap.id,
    orderNumber: data.orderNumber ?? 0,
    customerName: data.customerName ?? '',
    phone: data.phone ?? '',
    location: data.location ?? '',
    gpsCoords: data.gpsCoords ?? null,
    serviceType: data.serviceType ?? 'pickup',
    tariff: data.tariff ?? null,
    status: data.status ?? 'new',
    assignedTeam: data.assignedTeam ?? [],
    totalArea: data.totalArea ?? 0,
    totalPrice: data.totalPrice ?? 0,
    createdBy: data.createdBy ?? '',
    collectedAmount: data.collectedAmount ?? undefined,
    hasFailedItem: data.hasFailedItem ?? undefined,
    createdAt: (data.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
    dueDate: (data.dueDate as Timestamp | undefined)?.toDate() ?? null,
    notedItems: data.notedItems ?? [],
    estimatedPrice: data.estimatedPrice ?? null,
    source: data.source ?? null,
    intakeMethod: data.intakeMethod ?? null,
  }
}

export function isOverdue(order: Order): boolean {
  if (!order.dueDate || order.status === 'done') return false
  return new Date() > order.dueDate
}

const ACTIVE_WINDOW_SIZE = 150

/** "Faol buyurtmalar" ro'yxati — cheklangan oynadagi eng yangi buyurtmalar, real-vaqtli. */
export function subscribeRecentOrders(callback: (orders: Order[]) => void): () => void {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ACTIVE_WINDOW_SIZE))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toOrder)))
}

/** Bitta buyurtmani real-vaqtli kuzatadi (detail panel ochiq turganda ham jonli). */
export function subscribeOrder(orderId: string, callback: (order: Order | null) => void): () => void {
  return onSnapshot(doc(db, 'orders', orderId), (snap) => {
    callback(snap.exists() ? toOrder(snap) : null)
  })
}

export function subscribeComments(orderId: string, callback: (comments: Record<string, unknown>[]) => void) {
  const q = query(collection(db, 'orders', orderId, 'comments'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
}

/**
 * Joyida-yuvish jamoasiga biriktirilgan (hali yakunlanmagan) buyurtmalar —
 * mobile/lib/core/services/orders_repository.dart:watchMyTeamOrders bilan
 * bir xil. `!=` filtri Firestore'da qo'shimcha indeks talab qilmaydi
 * (array-contains + notEqual — bitta tengsizlik, standart indeks yetarli).
 */
export function subscribeMyTeamOrders(employeeId: string, callback: (orders: Order[]) => void): () => void {
  const q = query(collection(db, 'orders'), where('assignedTeam', 'array-contains', employeeId))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toOrder).filter((o) => o.status !== 'done')))
}
