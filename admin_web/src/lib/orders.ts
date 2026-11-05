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
  startAt,
  endAt,
  type QueryDocumentSnapshot,
  type DocumentSnapshot,
  type Query,
  type DocumentData,
  Timestamp,
  getAggregateFromServer,
  count,
} from 'firebase/firestore'
import { db } from './firebase'
import { businessDayRange } from './business-time'

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
  /** Oldindan to'lov (server: lib/prepayments.ts): olingan jami va shundan topshirishda ishlatilgani. */
  prepaidAmount: number
  prepaidUsed: number
  prepayments: Prepayment[]
  /** Mijoz bonusidan shu buyurtmaga qo'llangani va yakunda berilgan keshbek. */
  bonusAmount: number
  bonusEarned: number | null
  // Talab: marketing statistikasi — sotuv menejeri buyurtma yaratishda
  // ixtiyoriy ravishda tanlaydi.
  source: string | null
  // Talab: "O'zi keldi" — mijoz do'konga o'zi kelganda 'walk_in'.
  intakeMethod: string | null
  /** Birlik bo'yicha umumiy hajm ({ sqm: 12.5, dona: 2 }) — server: lib/orderSummary.ts. */
  itemUnitTotals: Record<string, number>
  /**
   * To'lov yig'indilari (server: lib/paymentSummary.ts): topshirishda olingan
   * va keyin yopilgan pul, chegirma va hali yopilmagan qarz qoldig'i.
   * Oldindan to'lov bularga KIRMAYDI (`prepaidAmount`).
   */
  paidTotal: number
  discountTotal: number
  debtTotal: number
  /** Oxirgi izoh (server: routes/comments.ts) — ro'yxatda o'qimasdan ko'rsatish uchun. */
  lastComment: { text: string; authorName: string; at: Date | null } | null
  doneAt: Date | null
  /** Nazoratchi bergan dastavchik topshirig'i (server: routes/supervisor.ts). */
  assignment: OrderAssignment | null
}

export interface OrderAssignment {
  driverId: string
  driverName: string
  /** YYYY-MM-DD */
  date: string
  kind: 'pickup' | 'delivery'
  /** Bo'sh — hozir tayyor mahsulotlarning hammasi. */
  itemIds: string[]
  note: string | null
  assignedByName: string
  assignedAt: Date | null
}

function toAssignment(raw: unknown): OrderAssignment | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (typeof a.driverId !== 'string' || typeof a.date !== 'string') return null
  return {
    driverId: a.driverId,
    driverName: typeof a.driverName === 'string' ? a.driverName : '',
    date: a.date,
    kind: a.kind === 'pickup' ? 'pickup' : 'delivery',
    itemIds: Array.isArray(a.itemIds) ? a.itemIds.filter((x): x is string => typeof x === 'string') : [],
    note: typeof a.note === 'string' && a.note.trim() ? a.note : null,
    assignedByName: typeof a.assignedByName === 'string' ? a.assignedByName : '',
    assignedAt: (a.assignedAt as Timestamp | undefined)?.toDate?.() ?? null,
  }
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
    prepaidAmount: data.prepaidAmount ?? 0,
    prepaidUsed: data.prepaidUsed ?? 0,
    prepayments: Array.isArray(data.prepayments) ? data.prepayments.map(toPrepayment) : [],
    bonusAmount: data.bonusAmount ?? 0,
    bonusEarned: typeof data.bonusEarned === 'number' ? data.bonusEarned : null,
    source: data.source ?? null,
    intakeMethod: data.intakeMethod ?? null,
    itemUnitTotals: data.itemUnitTotals ?? {},
    paidTotal: Number(data.paidTotal ?? 0),
    discountTotal: Number(data.discountTotal ?? 0),
    debtTotal: Number(data.debtTotal ?? 0),
    lastComment:
      data.lastComment && typeof data.lastComment.text === 'string'
        ? {
            text: data.lastComment.text,
            authorName: data.lastComment.authorName ?? '',
            at: (data.lastComment.at as Timestamp | undefined)?.toDate?.() ?? null,
          }
        : null,
    doneAt: (data.doneAt as Timestamp | undefined)?.toDate?.() ?? null,
    assignment: toAssignment(data.assignment),
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

/** Bitta oldindan to'lov yozuvi — buyurtma hujjatining `prepayments` ro'yxatidan. */
export interface Prepayment {
  id: string
  amount: number
  cashAmount: number
  cardAmount: number
  at: Date | null
  employeeId: string
  employeeName: string | null
  note: string | null
}

function toPrepayment(raw: Record<string, unknown>): Prepayment {
  return {
    id: String(raw.id ?? ''),
    amount: Number(raw.amount ?? 0),
    cashAmount: Number(raw.cashAmount ?? 0),
    cardAmount: Number(raw.cardAmount ?? 0),
    at: (raw.at as Timestamp | undefined)?.toDate?.() ?? null,
    employeeId: String(raw.employeeId ?? ''),
    employeeName: typeof raw.employeeName === 'string' ? raw.employeeName : null,
    note: typeof raw.note === 'string' ? raw.note : null,
  }
}

/**
 * Hali ishlatilmagan "kredit" — oldindan to'lov va qo'llangan bonus;
 * keyingi topshirishda narxdan ayiriladi (server: lib/prepayments.ts).
 */
export function prepaidCredit(order: Pick<Order, 'prepaidAmount' | 'prepaidUsed' | 'bonusAmount'>): number {
  return Math.max(0, order.prepaidAmount + order.bonusAmount - order.prepaidUsed)
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
 * Buyurtmani TO'G'RIDAN-TO'G'RI Firestore'dan qidiradi.
 *
 * Avval qidiruv faqat allaqachon yuklangan ro'yxat ustidan ishlardi:
 * "Barchasi" ko'rinishi 25 tadan sahifalanadi, shuning uchun 175-raqamli
 * buyurtmani topish uchun "Yana yuklash"ni bir necha marta bosish kerak
 * edi. Endi raqam bo'yicha bitta aniq so'rov yuboriladi va natija
 * darhol chiqadi, ro'yxat qanchalik uzun bo'lishidan qat'i nazar.
 *
 * Uchta yo'l, kiritilgan matn shakliga qarab:
 *  - butun son -> `orderNumber` bo'yicha aniq moslik (1 ta hujjat);
 *  - 7+ raqam  -> telefon, bir nechta yozilish shaklini birdaniga
 *    tekshiradi (`in`), chunki raqam turli formatlarda kiritilgan;
 *  - matn      -> mijoz ismi bo'yicha prefiks oralig'i.
 */
export async function searchOrders(term: string): Promise<Order[]> {
  const trimmed = term.trim()
  if (!trimmed) return []

  const queries: Query<DocumentData>[] = []

  const asNumber = Number(trimmed.replace(/^#/, ''))
  if (Number.isInteger(asNumber) && asNumber > 0) {
    queries.push(query(collection(db, 'orders'), where('orderNumber', '==', asNumber), limit(5)))
  }

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 7) {
    // Telefon bazada qanday kiritilgan bo'lsa, shundayligicha saqlanadi —
    // shuning uchun ehtimoliy shakllar birdaniga tekshiriladi.
    const candidates = [...new Set([trimmed, digits, `+${digits}`, `+998${digits.slice(-9)}`, digits.slice(-9)])]
    queries.push(query(collection(db, 'orders'), where('phone', 'in', candidates.slice(0, 10)), limit(25)))
  }

  if (!/^\d+$/.test(trimmed) && trimmed.length >= 2) {
    queries.push(
      query(
        collection(db, 'orders'),
        orderBy('customerName'),
        startAt(trimmed),
        endAt(`${trimmed}\uf8ff`),
        limit(25),
      ),
    )
  }

  const snaps = await Promise.all(queries.map((q) => getDocs(q).catch(() => null)))
  const byId = new Map<string, Order>()
  for (const snap of snaps) {
    if (!snap) continue
    for (const doc of snap.docs) byId.set(doc.id, toOrder(doc))
  }
  return [...byId.values()]
}

const PAGE_SIZE = 25

/**
 * "Barcha buyurtmalar" (yakunlanganlar ham) ko'rish uchun — haqiqiy
 * kursor-asosidagi sahifalash, hech qachon bir yo'la hammasi so'ralmaydi.
 */
export async function fetchOrdersPage(
  cursor?: QueryDocumentSnapshot,
  range?: { start: Date; end: Date },
): Promise<{ orders: Order[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
  // Oy tanlanganda shu oyning o'zi serverdan so'raladi — avval faqat
  // allaqachon yuklangan 25 talik sahifalar filtrlanardi va eski oylar
  // "topilmadi" bo'lib chiqardi.
  const constraints = [
    ...(range
      ? [where('createdAt', '>=', Timestamp.fromDate(range.start)), where('createdAt', '<', Timestamp.fromDate(range.end))]
      : []),
    orderBy('createdAt', 'desc'),
    limit(PAGE_SIZE + 1),
  ]
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

/**
 * Berilgan biznes-kunda YARATILGAN buyurtmalar soni — boshqaruv panelidagi
 * "Qabul qilindi" ko'rsatkichi. Hujjatlar yuklanmaydi, faqat sanash
 * (jamlanma so'rovi — arzon).
 */
export async function countOrdersCreatedOn(dateKey: string): Promise<number> {
  const { start, end } = businessDayRange(dateKey)
  const q = query(
    collection(db, 'orders'),
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<', Timestamp.fromDate(end)),
  )
  const snap = await getAggregateFromServer(q, { n: count() })
  return snap.data().n ?? 0
}
