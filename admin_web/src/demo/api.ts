/**
 * DEMO REJIM — `@/lib/api` o'rniga: server javoblari namunaviy
 * buyurtmalardan (demo/fixtures.ts) hisoblanadi. Hech qanday so'rov
 * tarmoqqa chiqmaydi. O'zgartiruvchi amallar xotirada bajariladi yoki
 * shunchaki `{ok: true}` qaytaradi.
 */
import { businessDateKey, businessDayStart } from '@/lib/business-time'
import { DEMO_EMPLOYEES, DEMO_ONSITE_DONE, DEMO_STAMPS, employeeName } from './fixtures'
import { demoStore, Timestamp } from './firestore'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type Data = Record<string, unknown>
type Handler = (body: Data) => unknown

const UNIT_LABELS: Record<string, string> = { sqm: 'm²', meter: 'metr', kg: 'kg', dona: 'dona' }
const UNIT_ORDER = ['sqm', 'meter', 'kg', 'dona']
const unitOf = (calcType: unknown) =>
  calcType === 'sqm' ? 'sqm' : calcType === 'meter' ? 'meter' : calcType === 'kg' ? 'kg' : 'dona'

function toUnitTotals(map: Map<string, number>) {
  return [...map.entries()]
    .filter(([, a]) => a > 0)
    .sort((a, b) => UNIT_ORDER.indexOf(a[0]) - UNIT_ORDER.indexOf(b[0]))
    .map(([unit, amount]) => ({ unit, label: UNIT_LABELS[unit], amount: Math.round(amount * 100) / 100 }))
}

const order = (id: string) => demoStore.get(`orders/${id}`) as Data
const item = (orderId: string, itemId: string) => demoStore.get(`orders/${orderId}/items/${itemId}`) as Data | undefined
const iso = (d: Date) => d.toISOString()

/** Naqd/karta ulushi — buyurtmadan buyurtmaga barqaror (har ochilishda bir xil). */
function cashShare(id: string): number {
  const h = [...id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 10
  return h < 6 ? 1 : h < 8 ? 0 : 0.5
}

function dayRange(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const start = businessDayStart(new Date(Date.UTC(y, m - 1, d, 12)))
  return { start: start.getTime(), end: start.getTime() + 86_400_000 }
}

function rowsFor(dateKey: string) {
  const { start, end } = dayRange(dateKey)
  const inDay = (t: Date) => t.getTime() >= start && t.getTime() < end && t.getTime() <= Date.now()
  const rows: Record<string, Data[]> = { washed: [], packed: [], delivered: [] }
  for (const s of DEMO_STAMPS) {
    if (!inDay(s.at)) continue
    const it = item(s.orderId, s.itemId)
    const o = order(s.orderId)
    if (!it || !o) continue
    const unit = unitOf(it.calcType)
    const price = (it.price as number) ?? 0
    const share = cashShare(s.itemId)
    rows[s.stage].push({
      id: `${s.stage}__${s.itemId}`,
      at: iso(s.at),
      orderId: s.orderId,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      phone: o.phone,
      itemId: s.itemId,
      itemNumber: it.itemNumber,
      itemName: it.name,
      unit,
      unitLabel: UNIT_LABELS[unit],
      unitAmount: unit === 'dona' ? 1 : ((it.qty as number) ?? 0),
      qty: it.qty ?? null,
      price,
      employeeId: s.employeeId,
      employeeName: employeeName(s.employeeId),
      collectedAmount: s.stage === 'delivered' ? price : null,
      cashAmount: s.stage === 'delivered' ? Math.round(price * share) : null,
      cardAmount: s.stage === 'delivered' ? price - Math.round(price * share) : null,
      orderTotalPrice: o.totalPrice,
      orderItemCount: o.itemCount,
    })
  }
  for (const d of DEMO_ONSITE_DONE) {
    if (!inDay(d.at)) continue
    const o = order(d.orderId)
    rows.delivered.push({
      id: `onsite_done__${d.orderId}`,
      at: iso(d.at),
      orderId: d.orderId,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      phone: o.phone,
      itemId: null,
      itemNumber: null,
      itemName: 'Joyida yuvish',
      unit: 'dona',
      unitLabel: 'dona',
      unitAmount: 1,
      qty: null,
      price: d.amount,
      employeeId: d.employeeId,
      employeeName: employeeName(d.employeeId),
      collectedAmount: d.amount,
      cashAmount: d.amount,
      cardAmount: 0,
      orderTotalPrice: o.totalPrice,
      orderItemCount: o.itemCount,
    })
  }
  for (const list of Object.values(rows)) list.sort((a, b) => String(b.at).localeCompare(String(a.at)))
  return rows
}

function summarize(rows: Data[]) {
  const units = new Map<string, number>()
  for (const r of rows) units.set(r.unit as string, (units.get(r.unit as string) ?? 0) + (r.unitAmount as number))
  return {
    count: rows.length,
    orderCount: new Set(rows.map((r) => r.orderId)).size,
    totals: toUnitTotals(units),
    totalPrice: rows.reduce((s, r) => s + (r.price as number), 0),
    rows,
  }
}

function intakeOrders(dateKey: string) {
  const { start, end } = dayRange(dateKey)
  return demoStore
    .list('orders/')
    .filter(([p, o]) => /^orders\/[^/]+$/.test(p) && o.pickedUpAt instanceof Timestamp)
    .filter(([, o]) => {
      const t = (o.pickedUpAt as Timestamp).toMillis()
      return t >= start && t < end && t <= Date.now()
    })
}

const handedOver = new Map<string, number>()

function dailyReport(body: Data) {
  const date = (body.date as string) || businessDateKey(new Date())
  const rows = rowsFor(date)
  const intake = intakeOrders(date)
  const intakeUnits = new Map<string, number>()
  let itemCount = 0
  let unmeasured = 0
  const orders = intake.map(([p, o]) => {
    const totals = new Map(Object.entries((o.itemUnitTotals as Record<string, number>) ?? {}))
    for (const [u, a] of totals) intakeUnits.set(u, (intakeUnits.get(u) ?? 0) + a)
    itemCount += (o.itemCount as number) ?? 0
    unmeasured += (o.zeroPriceItemCount as number) ?? 0
    return {
      orderId: p.split('/')[1],
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      phone: o.phone,
      location: o.location,
      at: iso((o.pickedUpAt as Timestamp).toDate()),
      itemCount: o.itemCount ?? 0,
      totals: toUnitTotals(totals),
      totalPrice: o.totalPrice ?? 0,
      unmeasuredCount: o.zeroPriceItemCount ?? 0,
      intakeMethod: o.intakeMethod ?? null,
      broughtInBy: o.pickedUpBy ?? '',
      broughtInByName: o.pickedUpByName ?? '',
    }
  })

  const drivers = new Map<string, Data & { orderIds: Set<string> }>()
  for (const r of rows.delivered) {
    const id = r.employeeId as string
    const d =
      drivers.get(id) ??
      ({ employeeId: id, name: r.employeeName, amount: 0, cashAmount: 0, cardAmount: 0, settledAmount: 0, prepaidAmount: 0, expenseAmount: 0, expenses: [], itemCount: 0, orderIds: new Set<string>() } as Data & {
        orderIds: Set<string>
      })
    d.amount = (d.amount as number) + (r.collectedAmount as number)
    d.cashAmount = (d.cashAmount as number) + (r.cashAmount as number)
    d.cardAmount = (d.cardAmount as number) + (r.cardAmount as number)
    d.itemCount = (d.itemCount as number) + 1
    d.orderIds.add(r.orderId as string)
    drivers.set(id, d)
  }
  const { start, end } = dayRange(date)
  for (const [, e] of demoStore.list('expenses/')) {
    const t = (e.date as Timestamp).toMillis()
    if (!e.fromCash || t < start || t >= end) continue
    const d = drivers.get(e.employeeId as string)
    if (!d) continue
    d.expenseAmount = (d.expenseAmount as number) + (e.amount as number)
    ;(d.expenses as Data[]).push({ id: 'x', name: e.name, amount: e.amount, at: iso(new Date(t)) })
  }

  const delivered = summarize(rows.delivered)
  return {
    date,
    isToday: date === businessDateKey(new Date()),
    hasActivityLog: rows.washed.length + rows.packed.length + rows.delivered.length > 0,
    intake: { orderCount: orders.length, itemCount, unmeasuredCount: unmeasured, totals: toUnitTotals(intakeUnits), orders },
    washed: summarize(rows.washed),
    packed: summarize(rows.packed),
    delivered: {
      ...delivered,
      deliveredAmount: rows.delivered.reduce((s, r) => s + (r.collectedAmount as number), 0),
      cashAmount: rows.delivered.reduce((s, r) => s + (r.cashAmount as number), 0),
      cardAmount: rows.delivered.reduce((s, r) => s + (r.cardAmount as number), 0),
    },
    drivers: [...drivers.values()]
      .map(({ orderIds, ...d }): Data => {
        const key = `${date}:${d.employeeId}`
        return {
          ...d,
          handOverAmount: (d.cashAmount as number) - (d.expenseAmount as number),
          orderCount: orderIds.size,
          handedOver: handedOver.has(key),
          handedOverAmount: handedOver.get(key) ?? null,
          handedOverAt: handedOver.has(key) ? iso(new Date()) : null,
        }
      })
      .sort((a, b) => (b.amount as number) - (a.amount as number)),
  }
}

function shiftKey(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

function unitMap(totals: { unit: string; amount: number }[]) {
  return Object.fromEntries(totals.map((t) => [t.unit, t.amount]))
}

function dailyTrend(body: Data) {
  const end = (body.end as string) || businessDateKey(new Date())
  const days = Math.min(Math.max(Number(body.days) || 14, 7), 62)
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftKey(end, -i)
    const r = dailyReport({ date })
    const stage = (s: { count: number; orderCount: number; totals: { unit: string; amount: number }[] }) => ({
      count: s.count,
      orderCount: s.orderCount,
      units: unitMap(s.totals),
    })
    out.push({
      date,
      intake: { orderCount: r.intake.orderCount, itemCount: r.intake.itemCount, units: unitMap(r.intake.totals) },
      washed: stage(r.washed),
      packed: stage(r.packed),
      delivered: { ...stage(r.delivered), amount: r.delivered.deliveredAmount, cash: r.delivered.cashAmount, card: r.delivered.cardAmount },
      collected: { amount: r.delivered.deliveredAmount, cash: r.delivered.cashAmount, card: r.delivered.cardAmount },
    })
  }
  return { days: out }
}

function employeeActivity(body: Data) {
  const from = body.from as string
  const to = body.to as string
  const inRange = (d: Date) => {
    const k = businessDateKey(d)
    return k >= from && k <= to
  }
  const rows = new Map<string, Data>()
  const row = (id: string) => {
    let r = rows.get(id)
    if (!r) {
      r = { employeeId: id, name: employeeName(id), ordersCreated: 0, ordersCreatedTotal: 0, pickedUpCount: 0, pickedUpTotal: 0, deliveredCount: 0, deliveredTotal: 0, washedCount: 0, packedCount: 0 }
      rows.set(id, r)
    }
    return r
  }
  for (const [p, o] of demoStore.list('orders/')) {
    if (!/^orders\/[^/]+$/.test(p)) continue
    if (inRange((o.createdAt as Timestamp).toDate())) {
      const r = row(o.createdBy as string)
      r.ordersCreated = (r.ordersCreated as number) + 1
      r.ordersCreatedTotal = (r.ordersCreatedTotal as number) + ((o.totalPrice as number) ?? 0)
    }
    if (o.pickedUpAt instanceof Timestamp && o.intakeMethod !== 'walk_in' && inRange(o.pickedUpAt.toDate())) {
      const r = row(o.pickedUpBy as string)
      r.pickedUpCount = (r.pickedUpCount as number) + 1
      r.pickedUpTotal = (r.pickedUpTotal as number) + ((o.totalPrice as number) ?? 0)
    }
  }
  for (const s of DEMO_STAMPS) {
    if (!inRange(s.at)) continue
    const r = row(s.employeeId)
    if (s.stage === 'washed') r.washedCount = (r.washedCount as number) + 1
    if (s.stage === 'packed') r.packedCount = (r.packedCount as number) + 1
    if (s.stage === 'delivered') {
      r.deliveredCount = (r.deliveredCount as number) + 1
      r.deliveredTotal = (r.deliveredTotal as number) + ((item(s.orderId, s.itemId)?.price as number) ?? 0)
    }
  }
  return { from, to, rows: [...rows.values()] }
}

function listPayments(body: Data) {
  const rows = demoStore
    .list('orders/')
    .filter(([p, o]) => /^orders\/[^/]+$/.test(p) && (((o.debtTotal as number) ?? 0) > 0 || ((o.discountTotal as number) ?? 0) > 0))
    .map(([p, o]) => {
      const debt = (o.debtTotal as number) ?? 0
      const discount = (o.discountTotal as number) ?? 0
      const at = ((o.doneAt as Timestamp | undefined) ?? (o.createdAt as Timestamp)).toDate()
      return {
        id: `pay-${p.split('/')[1]}`,
        orderId: p.split('/')[1],
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        phone: o.phone,
        employeeId: o.deliveredBy ?? 'd1',
        employeeName: employeeName((o.deliveredBy as string) ?? 'd1'),
        dateKey: businessDateKey(at),
        at: iso(at),
        itemCount: o.itemCount,
        remainingItemCount: 0,
        dueAmount: (o.paidTotal as number) + debt + discount,
        paidAmount: o.paidTotal,
        cashAmount: o.paidTotal,
        cardAmount: 0,
        shortfall: debt + discount,
        kind: debt > 0 ? 'debt' : 'discount',
        settled: false,
        settledAt: null,
        settledByName: null,
        settledAmount: 0,
        settledCashAmount: 0,
        settledCardAmount: 0,
        note: null,
      }
    })
  const outstanding = rows.filter((r) => r.kind === 'debt')
  const scoped = body.scope === 'outstanding' ? outstanding : rows
  return {
    scope: body.scope,
    rows: scoped,
    totals: {
      debtCount: outstanding.length,
      debtAmount: outstanding.reduce((s, r) => s + r.shortfall, 0),
      partialCount: 0,
      partialAmount: 0,
      discountCount: rows.filter((r) => r.kind === 'discount').length,
      discountAmount: rows.filter((r) => r.kind === 'discount').reduce((s, r) => s + r.shortfall, 0),
    },
  }
}

function intakeItems(body: Data) {
  const date = body.date as string
  const out: Data[] = []
  const units = new Map<string, number>()
  for (const [p, o] of intakeOrders(date)) {
    for (const [ip, it] of demoStore.list(`${p}/items/`)) {
      const unit = unitOf(it.calcType)
      const amount = unit === 'dona' ? 1 : ((it.qty as number) ?? 0)
      units.set(unit, (units.get(unit) ?? 0) + amount)
      out.push({
        orderId: p.split('/')[1],
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        phone: o.phone,
        at: iso((o.pickedUpAt as Timestamp).toDate()),
        itemId: ip.split('/').pop(),
        itemNumber: it.itemNumber,
        itemName: it.name,
        status: it.status ?? null,
        tariff: it.tariff ?? null,
        unit,
        unitLabel: UNIT_LABELS[unit],
        unitAmount: amount,
        qty: it.qty ?? null,
        width: it.width ?? null,
        height: it.height ?? null,
        price: it.price ?? 0,
      })
    }
  }
  return { date, count: out.length, totals: toUnitTotals(units), rows: out }
}

const HANDLERS: Record<string, Handler> = {
  '/adminListEmployees': () => ({
    employees: DEMO_EMPLOYEES.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      phone: e.phone,
      department: e.department,
      status: e.status,
      salary: e.department === 'worker' ? { method: 'perSqm', params: { rate: 2500 } } : { method: 'fixed', params: { amount: 4500000 } },
      specializations: e.specializations,
      canPack: e.canPack,
      canCreateOrders: e.department === 'dispatcher',
      canDoOnsiteWashing: e.id === 't1' || e.id === 'w2',
      canViewStats: e.department === 'dispatcher',
      canViewFinance: false,
      canAccessWarehouse: e.id === 'disp1',
      canAddExpenses: e.department === 'delivery',
      canTakePrepayment: e.department === 'delivery',
      canPrintReceipts: e.department !== 'worker',
      canPrintDailyReport: e.id === 'disp1',
      canViewPhotos: true,
      canUploadPhotos: e.department !== 'dispatcher',
      canDeletePhotos: e.id === 'disp1',
      canSeeWorkshopQueue: true,
      attendanceEnabled: e.attendanceEnabled,
      attendanceEnabledAt: e.attendanceEnabled ? new Date(Date.now() - 60 * 86_400_000).toISOString() : null,
      createdAt: e.createdAt.toISOString(),
      terminatedAt: e.status === 'terminated' ? new Date(Date.now() - 20 * 86_400_000).toISOString() : null,
    })),
  }),
  '/adminDailyReport': dailyReport,
  '/adminDailyTrend': dailyTrend,
  '/adminEmployeeActivity': employeeActivity,
  '/listPayments': listPayments,
  '/adminDailyIntakeItems': intakeItems,
  '/customerBonus': () => ({ balance: 24500, earnedTotal: 61500, spentTotal: 37000, percent: 3 }),
  '/adminSetCashHandover': (body) => {
    const key = `${body.date}:${body.employeeId}`
    if (body.handedOver) handedOver.set(key, Number(body.amount) || 0)
    else handedOver.delete(key)
    return { ok: true }
  },
  '/adminDeleteOrder': (body) => {
    for (const [p] of demoStore.list(`orders/${body.orderId}`)) demoStore.delete(p)
    return { ok: true }
  },
  '/dailyReceiptReport': (body) => ({
    blocks: [
      { kind: 'logo' },
      { kind: 'text', text: 'KUNLIK HISOBOT', align: 'center', bold: true },
      { kind: 'divider', char: '=' },
      { kind: 'pair', left: 'Sana:', right: body.date as string, bold: true },
      { kind: 'text', text: '(demo rejim)', align: 'center' },
    ],
  }),
}

const LATENCY_MS = 250

export async function apiPost<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  await new Promise((r) => setTimeout(r, LATENCY_MS))
  const handler = HANDLERS[path]
  if (!handler) {
    // Backfill va o'zgartiruvchi amallar — demo'da hech narsa qilmaydi.
    console.info(`[demo] ${path}`, body ?? {})
    return { ok: true, skipped: true, done: true } as T
  }
  return handler(body ?? {}) as T
}
