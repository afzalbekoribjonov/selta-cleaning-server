/**
 * DEMO REJIM — haqiqatga yaqin namunaviy ma'lumot (faqat `vite --mode demo`).
 *
 * Har bir buyurtmaning hayot yo'li VAQT bo'yicha quriladi: qabul → olib
 * ketildi → sexga keldi → yuvildi → upakovka → yetkazildi. Hozirgi paytga
 * qadar yetib kelgan bosqich holatni belgilaydi, shuning uchun "bugun" har
 * doim jonli faoliyat bilan ko'rinadi. Kunlik hisobot, grafiklar va xodim
 * faolligi (demo/api.ts) ham AYNAN shu buyurtmalardan hisoblanadi — raqamlar
 * bir-biriga mos keladi.
 */
import { businessDateKey, businessDayStart } from '@/lib/business-time'
import { Timestamp } from './firestore'

type Data = Record<string, unknown>

// --- Takrorlanadigan tasodif (har ochilishda bir xil ma'lumot) ---
let seed = 20261103
function rand() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
const between = (min: number, max: number) => min + rand() * (max - min)
const chance = (p: number) => rand() < p
const round = (n: number, step = 1000) => Math.round(n / step) * step
const ts = (d: Date) => Timestamp.fromDate(d)
const HOUR = 3_600_000
const DAY = 24 * HOUR

export interface DemoEmployee {
  id: string
  fullName: string
  phone: string
  department: string
  specializations: string[]
  canPack: boolean
  attendanceEnabled: boolean
  status: 'active' | 'terminated'
  createdAt: Date
}

export const DEMO_EMPLOYEES: DemoEmployee[] = [
  { id: 'disp1', fullName: 'Dilnoza Karimova', phone: '+998901234501', department: 'dispatcher', specializations: [], canPack: false, attendanceEnabled: true, status: 'active', createdAt: new Date('2025-03-01') },
  { id: 'disp2', fullName: 'Sardor Rahimov', phone: '+998901234502', department: 'dispatcher', specializations: [], canPack: false, attendanceEnabled: true, status: 'active', createdAt: new Date('2025-08-12') },
  { id: 'w1', fullName: 'Bekzod Toshmatov', phone: '+998901234503', department: 'worker', specializations: ['gilam'], canPack: true, attendanceEnabled: true, status: 'active', createdAt: new Date('2025-02-10') },
  { id: 'w2', fullName: 'Jasurbek Aliyev', phone: '+998901234504', department: 'worker', specializations: ['gilam'], canPack: false, attendanceEnabled: true, status: 'active', createdAt: new Date('2025-05-20') },
  { id: 'w3', fullName: 'Nodira Yusupova', phone: '+998901234505', department: 'worker', specializations: ['parda', 'boshqa'], canPack: true, attendanceEnabled: true, status: 'active', createdAt: new Date('2025-06-01') },
  { id: 'w4', fullName: "Ulug'bek Ergashev", phone: '+998901234506', department: 'worker', specializations: ['gilam', 'boshqa'], canPack: true, attendanceEnabled: true, status: 'active', createdAt: new Date('2025-09-15') },
  { id: 'd1', fullName: 'Akmal Qodirov', phone: '+998901234507', department: 'delivery', specializations: [], canPack: false, attendanceEnabled: false, status: 'active', createdAt: new Date('2025-01-15') },
  { id: 'd2', fullName: 'Sherzod Nazarov', phone: '+998901234508', department: 'delivery', specializations: [], canPack: false, attendanceEnabled: false, status: 'active', createdAt: new Date('2025-04-02') },
  { id: 'd3', fullName: 'Rustam Abdullayev', phone: '+998901234509', department: 'delivery', specializations: [], canPack: false, attendanceEnabled: false, status: 'active', createdAt: new Date('2025-10-01') },
  { id: 't1', fullName: 'Kamoliddin Mirzayev', phone: '+998901234510', department: 'worker', specializations: ['gilam'], canPack: false, attendanceEnabled: true, status: 'active', createdAt: new Date('2025-07-07') },
  { id: 'x1', fullName: 'Oybek Saidov', phone: '+998901234511', department: 'worker', specializations: ['gilam'], canPack: false, attendanceEnabled: false, status: 'terminated', createdAt: new Date('2025-01-05') },
]

export const employeeName = (id: string) => DEMO_EMPLOYEES.find((e) => e.id === id)?.fullName ?? "Noma'lum"

const FIRST = ['Aziz', 'Malika', 'Shahzod', 'Gulnora', 'Otabek', 'Zarina', 'Farrux', 'Madina', 'Javlon', 'Sevara', 'Bobur', 'Dildora', 'Jahongir', 'Nigora', 'Islom', 'Kamola', 'Sanjar', 'Feruza', 'Timur', 'Laylo']
const LAST = ['Karimov', 'Rashidova', 'Umarov', 'Saidova', 'Xolmatov', 'Ismoilova', "Qo'chqorov", 'Nurmatova', 'Hasanov', 'Abdullayeva', 'Tursunov', 'Mahmudova']
const PLACES = ['Yunusobod 4-mavze, 12-uy', 'Chilonzor 9-kvartal, 21-uy', "Mirzo Ulug'bek, Buyuk Ipak yo'li 112", 'Sergeli 7, 45-uy', 'Yakkasaroy, Shota Rustaveli 30', 'Olmazor, Qorasaroy 14', 'Uchtepa 23-kvartal, 8-uy', 'Mirobod, Amir Temur 77', "Shayxontohur, Navoiy ko'chasi 5", 'Yashnobod, Parkent 220']

const TARIFF_DAYS: Record<string, number> = { express: 4, comfort: 7, standart: 12, premium: 4 }
const PRICE: Record<string, Record<string, number>> = {
  sqm: { standart: 18000, comfort: 22000, express: 28000, premium: 35000 },
  meter: { standart: 14000, comfort: 16000, express: 20000, premium: 25000 },
  count: { standart: 25000, comfort: 28000, express: 35000, premium: 40000 },
  kg: { standart: 15000, comfort: 17000, express: 22000, premium: 26000 },
}
const KINDS = [
  { name: 'Gilam', calcType: 'sqm', category: 'gilam', weight: 6 },
  { name: "Gilam (qo'lda to'qilgan)", calcType: 'sqm', category: 'gilam', weight: 2 },
  { name: 'Parda', calcType: 'meter', category: 'parda', weight: 2 },
  { name: 'Yostiq', calcType: 'count', category: 'boshqa', weight: 2 },
  { name: 'Adyol', calcType: 'kg', category: 'boshqa', weight: 1 },
  { name: "Ko'rpa", calcType: 'size', category: 'boshqa', weight: 1 },
] as const

function pickKind() {
  const total = KINDS.reduce((s, k) => s + k.weight, 0)
  let r = rand() * total
  for (const k of KINDS) {
    r -= k.weight
    if (r <= 0) return k
  }
  return KINDS[0]
}

const SOURCES = [
  { id: 'src_instagram', name: 'Instagram', color: '#E1306C' },
  { id: 'src_telegram', name: 'Telegram', color: '#229ED9' },
  { id: 'src_tanish', name: 'Tanish orqali', color: '#16A34A' },
  { id: 'src_qayta', name: 'Qayta mijoz', color: '#5A148C' },
  { id: 'src_banner', name: 'Banner', color: '#F59E0B' },
]

const PHOTO = (seedText: string) => `https://picsum.photos/seed/${seedText}/600/800`

/** Mahsulotlarning jonli hodisalari — demo/api.ts kunlik hisobot uchun ishlatadi. */
export interface ItemStamp {
  orderId: string
  itemId: string
  stage: 'washed' | 'packed' | 'delivered'
  at: Date
  employeeId: string
}

function makeItem(orderId: string, n: number, tariff: string, createdAt: Date, creator: string, measured: boolean) {
  const kind = pickKind()
  const item: Data = {
    itemNumber: n,
    name: kind.name,
    calcType: kind.calcType,
    category: kind.category,
    tariff,
    qcStatus: 'pending',
    condition: chance(0.15) ? pick(['average', 'bad', 'veryBad']) : null,
    addedBy: creator,
    addedByDepartment: DEMO_EMPLOYEES.find((e) => e.id === creator)?.department ?? 'dispatcher',
    createdAt: ts(createdAt),
    dueDate: ts(new Date(createdAt.getTime() + TARIFF_DAYS[tariff] * DAY)),
  }
  let price = 0
  if (measured) {
    if (kind.calcType === 'sqm') {
      const w = Math.round(between(1.5, 4) * 10) / 10
      const h = Math.round(between(2, 5) * 10) / 10
      item.width = w
      item.height = h
      item.qty = Math.round(w * h * 100) / 100
      price = (item.qty as number) * PRICE.sqm[tariff]
    } else if (kind.calcType === 'meter') {
      item.qty = Math.round(between(3, 12) * 10) / 10
      price = (item.qty as number) * PRICE.meter[tariff]
    } else if (kind.calcType === 'count') {
      item.qty = Math.ceil(between(1, 6))
      price = (item.qty as number) * PRICE.count[tariff]
    } else if (kind.calcType === 'kg') {
      item.qty = Math.round(between(2, 9) * 10) / 10
      price = (item.qty as number) * PRICE.kg[tariff]
    } else {
      item.sizeVariant = chance(0.5) ? 'large' : 'small'
      price = item.sizeVariant === 'large' ? 90000 : 60000
    }
    const surcharge = item.condition === 'bad' ? 20 : item.condition === 'veryBad' ? 40 : item.condition === 'average' ? 10 : 0
    if (surcharge) item.conditionSurchargePercent = surcharge
    price = round(price * (1 + surcharge / 100))
  }
  item.price = price
  item.area = kind.calcType === 'sqm' ? (item.qty ?? 0) : 0
  if (chance(0.35)) {
    item.photos = {
      before: [{ fileId: `${orderId}-${n}-b`, url: PHOTO(`${orderId}${n}b`), uploadedByName: employeeName(creator), uploadedAt: ts(createdAt) }],
      ready: [],
    }
  }
  return item
}

const STATUS_ORDER = ['pending', 'washing', 'packing', 'ready', 'done'] as const

export function seedDemoStore(store: Map<string, Data>) {
  const now = new Date()
  const todayStart = businessDayStart(now)
  const stamps: ItemStamp[] = []
  DEMO_STAMPS.length = 0

  // --- Xodimlar ---
  for (const e of DEMO_EMPLOYEES) {
    store.set(`employees/${e.id}`, {
      fullName: e.fullName,
      phone: e.phone,
      department: e.department,
      status: e.status,
      specializations: e.specializations,
      canPack: e.canPack,
      attendanceEnabled: e.attendanceEnabled,
      createdAt: ts(e.createdAt),
    })
  }

  // --- Sozlamalar ---
  store.set('settings/attendance', {
    enabled: true,
    arrivalTime: '08:30',
    lateToleranceMinutes: 15,
    location: { lat: 41.3111, lng: 69.2797 },
    radiusMeters: 150,
    workDays: [1, 2, 3, 4, 5, 6],
    enabledAt: ts(new Date(now.getTime() - 60 * DAY)),
  })
  store.set('settings/warehouse', { thresholdDays: 14 })
  store.set('settings/bonus', { percent: 3 })
  store.set('settings/tariffs', {})
  store.set('settings/conditionSurcharges', { average: 10, bad: 20, veryBad: 40 })
  for (const s of SOURCES) store.set(`orderSources/${s.id}`, { name: s.name, color: s.color })

  // --- Mahsulotlar katalogi ---
  const catalog: [string, string, string, Record<string, number>][] = [
    ['Gilam', 'sqm', 'gilam', PRICE.sqm],
    ["Gilam (qo'lda to'qilgan)", 'sqm', 'gilam', { standart: 26000, express: 36000 }],
    ['Parda', 'meter', 'parda', PRICE.meter],
    ['Yostiq', 'count', 'boshqa', PRICE.count],
    ['Adyol', 'kg', 'boshqa', PRICE.kg],
  ]
  catalog.forEach(([name, calcType, category, prices], i) => {
    store.set(`products/p${i + 1}`, {
      name,
      calcType,
      category,
      tariffs: Object.keys(prices),
      pricesByTariff: Object.fromEntries(Object.entries(prices).map(([t, p]) => [t, { unitPrice: p }])),
    })
  })
  store.set('products/p6', {
    name: "Ko'rpa",
    calcType: 'size',
    category: 'boshqa',
    tariffs: ['standart', 'express'],
    pricesByTariff: { standart: { smallPrice: 60000, largePrice: 90000 }, express: { smallPrice: 80000, largePrice: 120000 } },
  })

  // --- Buyurtmalar ---
  const ORDER_COUNT = 96
  for (let i = 0; i < ORDER_COUNT; i++) {
    const orderId = `ord${String(i + 1).padStart(3, '0')}`
    // Yaqin kunlarda zichroq: 0..70 kun oldin.
    const ageDays = Math.pow(rand(), 1.6) * 70
    const createdAt = new Date(Math.min(now.getTime() - 20 * 60_000, now.getTime() - ageDays * DAY - between(0, 6) * HOUR))
    const onsite = chance(0.13)
    const walkIn = !onsite && chance(0.12)
    const creator = pick(['disp1', 'disp1', 'disp2'])
    const driver = pick(['d1', 'd2', 'd3'])
    const tariff = pick(['standart', 'standart', 'standart', 'comfort', 'express', 'premium'])
    const first = pick(FIRST)
    const customerName = `${first} ${pick(LAST)}`
    const order: Data = {
      orderNumber: i + 1,
      customerName,
      phone: `+9989${pick(['0', '1', '3', '4', '7', '9'])}${String(Math.floor(between(1000000, 9999999)))}`,
      location: pick(PLACES),
      gpsCoords: chance(0.7) ? `${(41.28 + rand() * 0.08).toFixed(5)},${(69.2 + rand() * 0.12).toFixed(5)}` : null,
      serviceType: onsite ? 'onsite' : 'pickup',
      tariff: onsite ? tariff : null,
      createdBy: creator,
      createdAt: ts(createdAt),
      updatedAt: ts(createdAt),
      assignedTeam: [],
      notedItems: chance(0.4) ? [pick(['Gilam 3x4', 'Gilam 2x3', 'Parda 2 ta', 'Yostiq', "Ko'rpa"]), ...(chance(0.4) ? ['Parda'] : [])] : [],
      estimatedPrice: chance(0.3) ? round(between(150000, 900000), 10000) : null,
      source: chance(0.85) ? pick(SOURCES).id : null,
      intakeMethod: walkIn ? 'walk_in' : null,
      washedByEmployees: [],
      deliveredByEmployees: [],
      deliveryAddedByEmployees: [],
      prepaidAmount: 0,
      prepaidUsed: 0,
      prepayments: [],
      bonusAmount: 0,
    }
    const history: { from: string | null; to: string; at: Date; by: string; note?: string }[] = [
      { from: null, to: walkIn ? 'brought_in' : 'new', at: createdAt, by: creator, ...(walkIn ? { note: "Mijoz o'zi keldi" } : {}) },
    ]
    const events: Data[] = []

    if (onsite) {
      // Joyida yuvish: jamoa biriktiriladi, ish bajarilib yakunlanadi.
      const due = new Date(createdAt.getTime() + TARIFF_DAYS[tariff] * DAY)
      order.dueDate = ts(due)
      const assignedAt = new Date(createdAt.getTime() + between(1, 10) * HOUR)
      const startAt = new Date(assignedAt.getTime() + between(10, 40) * HOUR)
      const doneAt = new Date(startAt.getTime() + between(3, 8) * HOUR)
      let status = 'new'
      if (assignedAt < now) {
        status = 'team_assigned'
        order.assignedTeam = ['t1', 'w2']
        history.push({ from: 'new', to: 'team_assigned', at: assignedAt, by: creator })
      }
      if (startAt < now) {
        status = 'in_progress'
        history.push({ from: 'team_assigned', to: 'in_progress', at: startAt, by: 't1' })
      }
      const items: [string, Data][] = []
      if (startAt < now) {
        const count = Math.ceil(between(1, 3))
        for (let n = 1; n <= count; n++) {
          const id = `${orderId}-i${n}`
          const item = makeItem(orderId, n, tariff, startAt, 't1', true)
          delete item.dueDate
          items.push([id, item])
        }
      }
      if (doneAt < now) {
        status = 'done'
        order.doneAt = ts(doneAt)
        order.deliveredBy = 't1'
        history.push({ from: 'in_progress', to: 'done', at: doneAt, by: 't1' })
        const total = items.reduce((s, [, it]) => s + (it.price as number), 0)
        order.collectedAmount = total
        order.paidTotal = total
        order.discountTotal = 0
        order.debtTotal = 0
        DEMO_ONSITE_DONE.push({ orderId, at: doneAt, employeeId: 't1', amount: total })
      }
      order.status = status
      finishOrder(store, orderId, order, items, history, events)
      continue
    }

    // --- Olib kelish ---
    const pickedUpAt = walkIn ? createdAt : new Date(createdAt.getTime() + between(2, 30) * HOUR)
    const broughtInAt = walkIn ? createdAt : new Date(pickedUpAt.getTime() + between(1, 4) * HOUR)
    let status = 'new'
    const items: [string, Data][] = []
    if (pickedUpAt < now) {
      order.pickedUpBy = walkIn ? creator : driver
      order.pickedUpByName = employeeName(order.pickedUpBy as string)
      order.pickedUpAt = ts(pickedUpAt)
      if (!walkIn) {
        status = 'picked_up'
        history.push({ from: 'new', to: 'picked_up', at: pickedUpAt, by: driver })
      }
    }
    if (broughtInAt < now) {
      if (!walkIn) history.push({ from: 'picked_up', to: 'brought_in', at: broughtInAt, by: driver })
      status = 'brought_in'
      const count = Math.ceil(between(1, 4))
      const addedBy = walkIn ? creator : driver
      for (let n = 1; n <= count; n++) {
        const id = `${orderId}-i${n}`
        // Yangi kelgan mahsulotlarning bir qismi hali o'lchanmagan.
        const fresh = now.getTime() - broughtInAt.getTime() < 1.5 * DAY
        const measured = !(fresh && chance(0.35))
        const item = makeItem(orderId, n, tariff, broughtInAt, addedBy, measured)
        item.dueDate = ts(new Date(broughtInAt.getTime() + TARIFF_DAYS[tariff] * DAY))
        events.push({ type: 'created', itemId: id, itemNumber: n, itemName: item.name, by: addedBy, at: ts(broughtInAt), snapshot: { name: item.name, tariff, ...(measured ? { price: item.price } : {}) } })
        if (item.photos) events.push({ type: 'photo_added', itemId: id, itemNumber: n, itemName: item.name, by: addedBy, at: ts(new Date(broughtInAt.getTime() + 5 * 60_000)), photoState: 'before' })

        // Bosqichlar vaqti.
        const slow = chance(0.12) // ba'zilari kechikadi
        const washStart = new Date(broughtInAt.getTime() + between(2, 20) * HOUR + (slow ? 4 * DAY : 0))
        const washedAt = new Date(washStart.getTime() + between(4, 26) * HOUR)
        const packedAt = new Date(washedAt.getTime() + between(3, 20) * HOUR)
        const deliveredAt = new Date(packedAt.getTime() + between(6, 60) * HOUR)
        const washer = pick(['w1', 'w2', 'w4'])
        const packer = pick(['w1', 'w3', 'w4'])
        let st: (typeof STATUS_ORDER)[number] = 'pending'
        if (measured && washStart < now) {
          st = 'washing'
          events.push({ type: 'status', itemId: id, itemNumber: n, itemName: item.name, by: washer, at: ts(washStart), fromStatus: 'pending', toStatus: 'washing' })
        }
        if (measured && washedAt < now) {
          st = 'packing'
          item.washedBy = washer
          item.washedAt = ts(washedAt)
          stamps.push({ orderId, itemId: id, stage: 'washed', at: washedAt, employeeId: washer })
          if (!(order.washedByEmployees as string[]).includes(washer)) (order.washedByEmployees as string[]).push(washer)
          events.push({ type: 'status', itemId: id, itemNumber: n, itemName: item.name, by: washer, at: ts(washedAt), fromStatus: 'washing', toStatus: 'packing' })
        }
        if (measured && packedAt < now) {
          st = 'ready'
          item.qcStatus = 'passed'
          item.packedBy = packer
          item.packedAt = ts(packedAt)
          stamps.push({ orderId, itemId: id, stage: 'packed', at: packedAt, employeeId: packer })
          events.push({ type: 'status', itemId: id, itemNumber: n, itemName: item.name, by: packer, at: ts(packedAt), fromStatus: 'packing', toStatus: 'ready' })
          if (chance(0.5)) {
            const p = (item.photos as Data | undefined) ?? { before: [], ready: [] }
            ;(p.ready as Data[]).push({ fileId: `${orderId}-${n}-r`, url: PHOTO(`${orderId}${n}r`), uploadedByName: employeeName(packer), uploadedAt: ts(packedAt) })
            item.photos = p
            events.push({ type: 'photo_added', itemId: id, itemNumber: n, itemName: item.name, by: packer, at: ts(packedAt), photoState: 'ready' })
          }
        }
        // Ba'zilari omborda uzoq turadi (mijoz olib ketmayapti).
        if (measured && deliveredAt < now && !(chance(0.08))) {
          st = 'done'
          item.deliveredBy = driver
          item.deliveredByName = employeeName(driver)
          item.deliveredAt = ts(deliveredAt)
          item.collectedAmount = item.price
          stamps.push({ orderId, itemId: id, stage: 'delivered', at: deliveredAt, employeeId: driver })
          if (!(order.deliveredByEmployees as string[]).includes(driver)) (order.deliveredByEmployees as string[]).push(driver)
          events.push({ type: 'status', itemId: id, itemNumber: n, itemName: item.name, by: driver, at: ts(deliveredAt), fromStatus: 'ready', toStatus: 'done', amount: item.price })
        }
        if (measured && chance(0.15) && st !== 'pending') {
          events.push({
            type: 'updated',
            itemId: id,
            itemNumber: n,
            itemName: item.name,
            by: washer,
            at: ts(new Date(washStart.getTime() - 30 * 60_000)),
            changes: [{ field: 'price', from: round((item.price as number) * 0.85), to: item.price }, ...(item.width ? [{ field: 'width', from: Math.round(((item.width as number) - 0.3) * 10) / 10, to: item.width }] : [])],
          })
        }
        item.status = st
        items.push([id, item])
      }
      const allDone = items.every(([, it]) => it.status === 'done')
      if (allDone && items.length > 0) {
        status = 'done'
        const last = items.reduce((m, [, it]) => Math.max(m, (it.deliveredAt as Timestamp).toMillis()), 0)
        order.doneAt = ts(new Date(last))
        order.deliveredBy = driver
        history.push({ from: 'brought_in', to: 'done', at: new Date(last), by: driver, note: 'Barcha mahsulotlar yetkazildi' })
      }
    }
    order.status = status

    // Oldindan to'lov va bonus.
    if (chance(0.12) && status !== 'new') {
      const amount = round(between(50000, 200000), 10000)
      order.prepaidAmount = amount
      order.prepayments = [{ id: `${orderId}-pp`, amount, cashAmount: amount, cardAmount: 0, at: ts(new Date(createdAt.getTime() + HOUR)), employeeId: driver, employeeName: employeeName(driver), note: chance(0.5) ? 'Zaklad' : null }]
      if (status === 'done') order.prepaidUsed = amount
    }
    // To'lov xulosasi (yakunlanganlar uchun): ba'zilarida qarz yoki chegirma.
    const delivered = items.filter(([, it]) => it.status === 'done').reduce((s, [, it]) => s + (it.price as number), 0)
    if (delivered > 0) {
      const debt = chance(0.1) ? round(delivered * between(0.1, 0.4)) : 0
      const discount = !debt && chance(0.12) ? round(delivered * 0.05) : 0
      order.debtTotal = debt
      order.discountTotal = discount
      order.paidTotal = delivered - debt - discount
    }
    if (status === 'done' && chance(0.5)) order.bonusEarned = round(((order.paidTotal as number) ?? 0) * 0.03, 100)
    finishOrder(store, orderId, order, items, history, events)
  }

  DEMO_STAMPS.push(...stamps)

  // --- Izohlar ---
  const comments = ['Mijoz kechqurun 19:00 dan keyin uyda', "Gilamda qizil vino dog'i bor — ehtiyot bo'ling", 'Lift ishlamaydi, 5-qavat', 'Tez kerak, mehmonlar keladi', "Qo'ng'iroq qilib keyin boring"]
  let c = 0
  for (const [path, data] of [...store.entries()]) {
    if (!/^orders\/[^/]+$/.test(path) || !chance(0.3)) continue
    const at = new Date((data.createdAt as Timestamp).toMillis() + HOUR)
    const author = pick(['disp1', 'disp2', 'd1', 'w1'])
    const text = pick(comments)
    store.set(`${path}/comments/c${++c}`, { authorId: author, authorName: employeeName(author), text, createdAt: ts(at) })
    store.set(path, { ...data, lastComment: { commentId: `c${c}`, text, authorName: employeeName(author), authorId: author, at: ts(at) } })
  }

  // --- Chiqimlar ---
  const expenseNames = ["Yoqilg'i", 'Kimyoviy vositalar', 'Elektr energiya', 'Suv', 'Texnik xizmat', 'Reklama', 'Qadoqlash plyonkasi']
  for (let i = 0; i < 34; i++) {
    const date = new Date(now.getTime() - Math.floor(between(0, 58)) * DAY)
    const name = pick(expenseNames)
    const fromCash = name === "Yoqilg'i" && chance(0.7)
    store.set(`expenses/ex${i}`, {
      name,
      amount: round(name === 'Reklama' ? between(300000, 1200000) : between(40000, 450000), 5000),
      date: ts(date),
      recurring: false,
      ...(fromCash ? { employeeId: pick(['d1', 'd2', 'd3']), fromCash: true } : {}),
      note: chance(0.2) ? 'Chek bor' : null,
    })
  }
  store.set('expenses/rent', { name: 'Ijara (sex)', amount: 6500000, date: ts(new Date(now.getFullYear(), now.getMonth(), 1)), recurring: true })

  // --- Davomat (oxirgi 30 kun) ---
  const enrolled = DEMO_EMPLOYEES.filter((e) => e.attendanceEnabled && e.status === 'active')
  for (let d = 0; d < 30; d++) {
    const day = new Date(todayStart.getTime() - d * DAY)
    const weekday = new Date(day.getTime() + 5 * HOUR).getUTCDay()
    if (weekday === 0) continue
    const key = businessDateKey(day)
    for (const e of enrolled) {
      if (d === 0 && chance(0.25)) continue // bugun hali kelmaganlar
      const r = rand()
      if (r < 0.06) {
        store.set(`attendanceIssues/${e.id}_${key}`, { employeeId: e.id, date: key, issue: pick(['location_off', 'out_of_range', 'imprecise']), distanceMeters: 2300, accuracyMeters: 3200, source: 'web', platform: 'iPhone · Safari', reportedAt: ts(new Date(day.getTime() + 8.5 * HOUR)) })
        continue
      }
      if (r < 0.1) continue // kelmagan
      const minutes = 8 * 60 + 30 + Math.round((r < 0.25 ? between(17, 75) : between(-35, 12)))
      const at = new Date(day.getTime() + minutes * 60_000)
      const web = e.id === 'disp2' || e.id === 'w3'
      store.set(`attendanceRecords/${e.id}_${key}`, {
        employeeId: e.id,
        date: key,
        status: minutes - (8 * 60 + 30) <= 15 ? 'on_time' : 'late',
        checkedInAt: ts(at),
        checkedInTime: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
        minutesFromArrival: minutes - (8 * 60 + 30),
        isWorkDay: true,
        gpsCoords: '41.3112,69.2799',
        distanceMeters: Math.round(between(5, 120)),
        accuracyMeters: Math.round(between(5, 40)),
        source: web ? 'web' : 'app',
        ...(web ? { platform: 'iPhone · Safari' } : {}),
      })
    }
  }
}

/** Mahsulot bosqichlari va joyida yuvish yakunlari — demo/api.ts uchun. */
export const DEMO_STAMPS: ItemStamp[] = []
export const DEMO_ONSITE_DONE: { orderId: string; at: Date; employeeId: string; amount: number }[] = []

function finishOrder(
  store: Map<string, Data>,
  orderId: string,
  order: Data,
  items: [string, Data][],
  history: { from: string | null; to: string; at: Date; by: string; note?: string }[],
  events: Data[],
) {
  const now = Date.now()
  const statusCounts: Record<string, number> = {}
  const stageCategories: Record<string, string[]> = {}
  const unitTotals: Record<string, number> = {}
  let earliest: number | null = null
  let zeroPrice = 0
  let total = 0
  let area = 0
  for (const [, it] of items) {
    const st = it.status as string | undefined
    if (st) {
      statusCounts[st] = (statusCounts[st] ?? 0) + 1
      const cats = (stageCategories[st] ??= [])
      if (!cats.includes(it.category as string)) cats.push(it.category as string)
    }
    total += it.price as number
    area += (it.area as number) ?? 0
    const unit = it.calcType === 'sqm' ? 'sqm' : it.calcType === 'meter' ? 'meter' : it.calcType === 'kg' ? 'kg' : 'dona'
    const amount = unit === 'dona' ? 1 : ((it.qty as number) ?? 0)
    if (amount > 0) unitTotals[unit] = Math.round(((unitTotals[unit] ?? 0) + amount) * 100) / 100
    if (st !== 'done') {
      const due = (it.dueDate as Timestamp | undefined)?.toMillis()
      if (due && (earliest === null || due < earliest)) earliest = due
      if (!((it.price as number) > 0)) zeroPrice++
    }
  }
  const latest = Math.max(
    (order.createdAt as Timestamp).toMillis(),
    ...history.map((h) => h.at.getTime()),
    ...events.map((e) => (e.at as Timestamp).toMillis()),
  )
  store.set(`orders/${orderId}`, {
    ...order,
    totalPrice: total,
    totalArea: Math.round(area * 100) / 100,
    itemCount: items.length,
    itemTariffs: [...new Set(items.map(([, it]) => it.tariff as string).filter(Boolean))],
    itemStatusCounts: statusCounts,
    itemStageCategories: stageCategories,
    itemUnitTotals: unitTotals,
    earliestPendingDueDate: earliest ? Timestamp.fromMillis(earliest) : null,
    zeroPriceItemCount: zeroPrice,
    itemsMirror: items.map(([id, it]) => ({ id, ...it })),
    updatedAt: Timestamp.fromMillis(Math.min(latest, now)),
  })
  for (const [id, it] of items) store.set(`orders/${orderId}/items/${id}`, it)
  history.forEach((h, i) =>
    store.set(`orders/${orderId}/statusHistory/h${i}`, {
      fromStatus: h.from,
      toStatus: h.to,
      changedBy: h.by,
      changedAt: ts(h.at),
      note: h.note ?? null,
    }),
  )
  events.forEach((e, i) => store.set(`orders/${orderId}/itemEvents/e${String(i).padStart(3, '0')}`, e))
}
