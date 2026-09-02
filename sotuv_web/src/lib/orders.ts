import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
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

/**
 * Buyurtmaning YAKUNLANMAGAN (faol) holatlari — `done`dan boshqa hammasi.
 * Item-darajasiga ko'chirilishidan oldingi eski buyurtmalarda order
 * darajasida qolgan holatlar (`washing`, `ready` va h.k.) ham kiritilgan.
 * `pending`/`returned` ATAYLAB yo'q — ular faqat ITEM holatlari, hech
 * qachon buyurtmaning o'zida uchramaydi. Ro'yxat 10 tadan oshmasligi ham
 * muhim: Firestore'ning eski `in` chegarasi aynan shuncha edi.
 */
export const ACTIVE_ORDER_STATUSES = [
  'new',
  'picked_up',
  'brought_in',
  'washing',
  'packing',
  'qc_review',
  'ready',
  'team_assigned',
  'in_progress',
]

const ACTIVE_LIMIT = 400
const RECENT_WINDOW_SIZE = 150

/**
 * FAOL buyurtmalar — HOLAT bo'yicha so'raladi, "oxirgi N ta" oynasi bilan
 * cheklanmaydi.
 *
 * Avval bu ro'yxat `createdAt` bo'yicha oxirgi 150 tadan olinib, keyin
 * klientda `status !== 'done'` bo'yicha filtrlanardi — bu jiddiy xato edi:
 * yakunlangan buyurtmalar oynani to'ldirgach, eski (lekin hamon FAOL)
 * buyurtmalar ro'yxatdan butunlay yo'qolib qolardi va xodimlar ularni
 * hech qayerda ko'ra olmasdi. Holat bo'yicha so'rov bu xatoni tubdan
 * yo'q qiladi. (status, createdAt) composite indeksi
 * firebase/firestore.indexes.json'da allaqachon mavjud.
 */
export function subscribeActiveOrders(callback: (orders: Order[]) => void): () => void {
  const q = query(
    collection(db, 'orders'),
    where('status', 'in', ACTIVE_ORDER_STATUSES),
    orderBy('createdAt', 'desc'),
    limit(ACTIVE_LIMIT),
  )
  return onSnapshot(q, (snap) => callback(snap.docs.map(toOrder)))
}

/**
 * Oxirgi N ta buyurtma — YAKUNLANGANLARI bilan birga. Faol ro'yxatga
 * qo'shimcha sifatida ishlatiladi, shunda qidiruvda yaqinda yetkazilgan
 * buyurtmalar ham topiladi va bugungi statistika to'g'ri chiqadi.
 */
export function subscribeRecentOrders(callback: (orders: Order[]) => void): () => void {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(RECENT_WINDOW_SIZE))
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
 * Talab: qidiruv tugmasiga telefon raqam kiritib, aynan u raqamga tegishli
 * BARCHA buyurtmalarni (istalgan holat, istalgan vaqt) ko'rish. firestore.rules:
 * `orders/{orderId}: allow read: if isSignedIn()` — to'g'ridan-to'g'ri client
 * Firestore tenglik so'rovi. Faqat bitta tenglik filtri (`orderBy` yo'q) —
 * composite indeks shart emas; tartiblash natija olingach JS'da qilinadi.
 */
export async function searchOrdersByPhone(phone: string): Promise<Order[]> {
  const q = query(collection(db, 'orders'), where('phone', '==', phone))
  const snap = await getDocs(q)
  return snap.docs.map(toOrder).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}
