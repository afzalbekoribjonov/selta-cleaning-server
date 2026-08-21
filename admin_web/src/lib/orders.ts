import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  type QueryDocumentSnapshot,
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
  // Faqat onsite buyurtmalarda mavjud — pickup'da tarif item-darajasiga
  // ko'chirildi (server/src/routes/orders.ts: createOrder).
  tariff: 'express' | 'comfort' | 'standart' | 'premium' | null
  status: string
  assignedTeam: string[]
  totalArea: number
  totalPrice: number
  createdBy: string
  pickedUpBy?: string
  washedBy?: string
  deliveredBy?: string
  // Pickup buyurtmalarda yuvish/yetkazish item-darajasida — bu massivlar
  // "qaysi xodimlar qatnashgan" so'rovlari uchun (server: changeItemStatus).
  washedByEmployees: string[]
  deliveredByEmployees: string[]
  deliveryAddedByEmployees: string[]
  collectedAmount?: number
  hasFailedItem?: boolean
  qcRating?: number
  qcRatingNote?: string
  createdAt: Date
  dueDate: Date | null
}

function toOrder(doc: QueryDocumentSnapshot): Order {
  const data = doc.data()
  return {
    id: doc.id,
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
    pickedUpBy: data.pickedUpBy ?? undefined,
    washedBy: data.washedBy ?? undefined,
    deliveredBy: data.deliveredBy ?? undefined,
    washedByEmployees: data.washedByEmployees ?? [],
    deliveredByEmployees: data.deliveredByEmployees ?? [],
    deliveryAddedByEmployees: data.deliveryAddedByEmployees ?? [],
    collectedAmount: data.collectedAmount ?? undefined,
    hasFailedItem: data.hasFailedItem ?? undefined,
    qcRating: data.qcRating ?? undefined,
    qcRatingNote: data.qcRatingNote ?? undefined,
    createdAt: (data.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
    dueDate: (data.dueDate as Timestamp | undefined)?.toDate() ?? null,
  }
}

export function isOverdue(order: Order): boolean {
  if (!order.dueDate || order.status === 'done') return false
  return new Date() > order.dueDate
}

const ACTIVE_WINDOW_SIZE = 150

/**
 * Dashboard va "Faol buyurtmalar" bo'limi uchun — talab #9: hech qachon
 * butun jamlanma yuklanmaydi, cheklangan oynadagi eng yangi buyurtmalarga
 * qarab real-vaqtli yangilanadi (kichik-o'rta biznes hajmi uchun yetarli).
 */
export function subscribeRecentOrders(callback: (orders: Order[]) => void): () => void {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ACTIVE_WINDOW_SIZE))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toOrder)))
}

const PAGE_SIZE = 25

/**
 * "Barcha buyurtmalar" (yakunlanganlar ham) ko'rish uchun — haqiqiy
 * kursor-asosidagi sahifalash, hech qachon bir yo'la hammasi so'ralmaydi.
 */
export async function fetchOrdersPage(
  cursor?: QueryDocumentSnapshot,
): Promise<{ orders: Order[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const constraints = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE + 1)]
  const q = cursor
    ? query(collection(db, 'orders'), ...constraints, startAfter(cursor))
    : query(collection(db, 'orders'), ...constraints)

  const snap = await getDocs(q)
  const docs = snap.docs
  const hasMore = docs.length > PAGE_SIZE
  const pageDocs = hasMore ? docs.slice(0, PAGE_SIZE) : docs

  return {
    orders: pageDocs.map(toOrder),
    lastDoc: pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null,
    hasMore,
  }
}

export type { QueryDocumentSnapshot }
