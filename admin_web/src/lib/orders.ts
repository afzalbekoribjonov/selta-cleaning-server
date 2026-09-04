import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  type QueryDocumentSnapshot,
  type DocumentSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { businessDayStart } from './business-time'

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
  pickedUpAt?: Date
  pickedUpByName?: string
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
  // Faqat onsite — sotuv menejeri ixtiyoriy ravishda yozgan mahsulot
  // nomlari (vergul bilan ajratilgan matndan ro'yxatga aylantirilgan)
  // va taxminiy summa (server: createOrder).
  // --- Mahsulotlardan HOSILA (server: lib/orderSummary.ts) ---
  // Pickup buyurtmalarda tarif/muddat/holat item darajasida. Avval
  // ro'yxatlar buni ko'rsatish uchun HAR BIR buyurtmaning items
  // pastki jamlanmasiga alohida obuna ochardi — bu Firestore kunlik
  // o'qish limitini tugatib qo'ydi. Endi server bu qiymatlarni
  // mahsulot o'zgarganda buyurtma hujjatiga yozib qo'yadi.
  itemCount: number | null
  itemTariffs: string[]
  earliestPendingDueDate: Date | null
  zeroPriceItemCount: number
  itemStatusCounts: Record<string, number>
  itemStageCategories: Record<string, string[]>
  notedItems: string[]
  estimatedPrice: number | null
  // Talab: marketing statistikasi — sotuv menejeri buyurtma yaratishda
  // ixtiyoriy ravishda tanlaydi.
  source: string | null
  // Talab: "O'zi keldi" — mijoz do'konga o'zi kelganda 'walk_in'.
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
    pickedUpBy: data.pickedUpBy ?? undefined,
    pickedUpAt: (data.pickedUpAt as Timestamp | undefined)?.toDate(),
    pickedUpByName: data.pickedUpByName ?? undefined,
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
    // Hosila maydonlar — hali to'ldirilmagan (eski) buyurtmalarda
    // `itemCount` null bo'ladi, shunda UI noto'g'ri "0 ta / muddat yo'q"
    // ko'rsatish o'rniga "noma'lum" deb muomala qila oladi.
    itemCount: data.itemStatusCounts === undefined ? null : (data.itemCount ?? 0),
    itemTariffs: data.itemTariffs ?? [],
    earliestPendingDueDate: (data.earliestPendingDueDate as Timestamp | undefined)?.toDate() ?? null,
    zeroPriceItemCount: data.zeroPriceItemCount ?? 0,
    itemStatusCounts: data.itemStatusCounts ?? {},
    itemStageCategories: data.itemStageCategories ?? {},
    notedItems: data.notedItems ?? [],
    estimatedPrice: data.estimatedPrice ?? null,
    source: data.source ?? null,
    intakeMethod: data.intakeMethod ?? null,
  }
}

/**
 * Bitta buyurtmani real-vaqtli kuzatadi — OrderDetailDrawer shu orqali
 * ochilgan payt statik (list'dan olingan) obyektdan emas, doim jonli
 * hujjatdan o'qiydi. Buni qilmasa, drawer ochiq turganda buyurtma
 * boshqa joydan (mobil ilova, boshqa admin) o'zgartirilsa — status,
 * summa va h.k. eskirgan holicha qolib ketardi.
 */
export function subscribeOrder(orderId: string, callback: (order: Order | null) => void): () => void {
  return onSnapshot(doc(db, 'orders', orderId), (snap) => {
    callback(snap.exists() ? toOrder(snap) : null)
  })
}

export function isOverdue(order: Order): boolean {
  if (!order.dueDate || order.status === 'done') return false
  return new Date() > order.dueDate
}

const ACTIVE_WINDOW_SIZE = 150

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

/**
 * FAOL buyurtmalar — HOLAT bo'yicha so'raladi, "oxirgi N ta" oynasi bilan
 * cheklanmaydi.
 *
 * Avval "Faol" ro'yxat `subscribeRecentOrders`dan (oxirgi 150 ta) olinib,
 * keyin klientda `status !== 'done'` bo'yicha filtrlanardi — bu jiddiy
 * xato edi: yakunlangan buyurtmalar oynani to'ldirgach, eski (lekin hamon
 * FAOL) buyurtmalar ro'yxatdan butunlay yo'qolib qolardi. (status,
 * createdAt) composite indeksi firestore.indexes.json'da mavjud.
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
 * Dashboard statistikasi uchun — oxirgi N ta buyurtma, YAKUNLANGANLARI
 * bilan birga ("bugun yetgazildi/olindi" kabi ko'rsatkichlar shundan
 * hisoblanadi). Faol ro'yxat uchun `subscribeActiveOrders`ni ishlating.
 */
export function subscribeRecentOrders(callback: (orders: Order[]) => void): () => void {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ACTIVE_WINDOW_SIZE))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toOrder)))
}

/**
 * BUGUNGI buyurtmalar — boshqaruv panelidagi "Bugungi buyurtmalar" va
 * "Bugungi tushum" uchun.
 *
 * Avval bu ikki son `subscribeRecentOrders`dan (oxirgi 150 ta hujjat)
 * hisoblanardi, ya'ni panel har ochilganda 150 ta hujjat o'qilib,
 * ulardan atigi bugungilari ishlatilardi. Kun chegarasi biznes vaqti
 * (UTC+5) bo'yicha, brauzer zonasidan mustaqil.
 */
export function subscribeTodayOrders(callback: (orders: Order[]) => void): () => void {
  const q = query(
    collection(db, 'orders'),
    where('createdAt', '>=', Timestamp.fromDate(businessDayStart())),
    orderBy('createdAt', 'desc'),
  )
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
