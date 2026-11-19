/**
 * DEMO: /adminWorkPeriod — server/src/routes/work.ts javobi shaklida,
 * namunaviy buyurtmalardan (fixtures). Maosh hisobi server/src/lib/salaryCalc.ts
 * qoidalarini soddalashtirib takrorlaydi — faqat sahifani ko'rib tekshirish uchun.
 */
import { businessDateKey, businessDayRange } from '@/lib/business-time'
import { monthOf } from '@/lib/uz-dates'
import { DEMO_EMPLOYEES, DEMO_ONSITE_DONE, DEMO_STAMPS } from './fixtures'
import { demoStore, Timestamp } from './firestore'

type Data = Record<string, unknown>
type Unit = 'sqm' | 'meter' | 'kg' | 'dona'
interface Line {
  name: string
  tariff: string
  unit: Unit
  count: number
  amount: number
  price: number
}
type Lines = Record<string, Line>

const unitOf = (calcType: unknown): Unit => (calcType === 'sqm' ? 'sqm' : calcType === 'meter' ? 'meter' : calcType === 'kg' ? 'kg' : 'dona')
const amountOf = (it: Data): number => {
  const unit = unitOf(it.calcType)
  if (unit !== 'dona') return Number(it.qty) || 0
  return it.calcType === 'count' ? Number(it.qty) || 1 : 1
}

function emptyWork() {
  return {
    washed: {} as Lines,
    packed: {} as Lines,
    delivered: {} as Lines,
    returned: {} as Lines,
    rewashed: {} as Lines,
    deliveredMoney: { value: 0, collected: 0, cash: 0, card: 0, orders: 0 },
    onsite: { orders: 0, revenue: 0, collected: 0 },
    onsiteTeam: { orders: 0, revenue: 0 },
    created: { orders: 0, revenue: 0, orderNumbers: [] as number[], items: {} as Lines },
    pickedUp: { orders: 0, items: 0, orderNumbers: [] as number[] },
  }
}
type Work = ReturnType<typeof emptyWork>

function add(lines: Lines, it: Data) {
  const unit = unitOf(it.calcType)
  const name = String(it.name ?? 'Mahsulot')
  const tariff = String(it.tariff ?? 'none')
  const key = `${name.toLowerCase()}|${tariff}|${unit}`
  const l = (lines[key] ??= { name, tariff, unit, count: 0, amount: 0, price: 0 })
  l.count += 1
  l.amount = Math.round((l.amount + amountOf(it)) * 100) / 100
  l.price += Number(it.price) || 0
}

const SALARIES: Record<string, { method: string; params: Record<string, number> } | null> = {
  disp1: { method: 'fixed_percent', params: { baseAmount: 1_500_000, percent: 3 } },
  disp2: { method: 'fixed_percent', params: { baseAmount: 1_200_000, percent: 2.5 } },
  w1: { method: 'washing', params: { baseAmount: 1_000_000 } },
  w2: { method: 'washing', params: { baseAmount: 1_000_000 } },
  w3: { method: 'finishing', params: {} },
  w4: null,
  d1: { method: 'delivery', params: { baseAmount: 1_500_000, percentOfOrderValue: 2, percentOfCashCollected: 1 } },
  d2: { method: 'delivery', params: { baseAmount: 1_500_000, percentOfOrderValue: 2, percentOfCashCollected: 1 } },
  d3: null,
  t1: { method: 'furniture_onsite_percent', params: { percent: 10 } },
}

const UNIT_LABEL: Record<Unit, string> = { sqm: 'm²', meter: 'metr', kg: 'kg', dona: 'dona' }

/** Mahsulot ishbay narxlari (demo katalogidan, nom bo'yicha). */
function productRates(): Map<string, { wash: number | null; pack: number | null }> {
  const m = new Map<string, { wash: number | null; pack: number | null }>()
  for (const [, p] of demoStore.list('products/')) {
    const r = (p.workRates ?? {}) as { wash?: number | null; pack?: number | null }
    m.set(String(p.name).trim().toLowerCase(), { wash: r.wash ?? null, pack: r.pack ?? null })
  }
  return m
}
const money = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

function pay(salary: (typeof SALARIES)[string], w: Work, month: boolean, rates: ReturnType<typeof productRates>) {
  if (!salary) return null
  const p = salary.params
  const lines: { label: string; detail: string; amount: number }[] = []
  const pieceLines = (label: string, src: Lines, stage: 'wash' | 'pack') => {
    const list = Object.values(src)
    if (!list.length) return
    let amount = 0
    const missing: string[] = []
    const totals: Partial<Record<Unit, number>> = {}
    for (const l of list) {
      totals[l.unit] = (totals[l.unit] ?? 0) + l.amount
      const rate = rates.get(l.name.toLowerCase())?.[stage] ?? null
      if (rate === null) missing.push(l.name)
      else amount += l.amount * rate
    }
    const units = (Object.keys(UNIT_LABEL) as Unit[])
      .filter((u) => totals[u])
      .map((u) => `${Math.round(totals[u]! * 100) / 100} ${UNIT_LABEL[u]}`.replace('.', ','))
      .join(' · ')
    lines.push({ label, detail: `${list.reduce((s, l) => s + l.count, 0)} ta · ${units}`, amount: Math.round(amount) })
    if (missing.length) lines.push({ label: `${label}: narxi kiritilmagan`, detail: `${[...new Set(missing)].join(', ')} — Mahsulotlar bo'limida kiriting`, amount: 0 })
  }
  let base = 0
  if (salary.method === 'fixed_percent') {
    base = p.baseAmount ?? 0
    lines.push({
      label: 'Ochilgan buyurtmalardan foiz',
      detail: `${w.created.orders} ta buyurtma · ${money(w.created.revenue)} so'm × ${p.percent}%`,
      amount: Math.round((w.created.revenue * (p.percent ?? 0)) / 100),
    })
  } else if (salary.method === 'delivery') {
    base = p.baseAmount ?? 0
    const value = w.deliveredMoney.value + w.onsite.revenue
    const collected = w.deliveredMoney.collected + w.onsite.collected
    lines.push({ label: 'Yetkazilganlar summasidan', detail: `${money(value)} so'm × ${p.percentOfOrderValue}%`, amount: Math.round((value * p.percentOfOrderValue) / 100) })
    lines.push({ label: "Yig'ilgan puldan", detail: `${money(collected)} so'm × ${p.percentOfCashCollected}%`, amount: Math.round((collected * p.percentOfCashCollected) / 100) })
  } else if (salary.method === 'washing' || salary.method === 'finishing') {
    base = salary.method === 'washing' ? (p.baseAmount ?? 0) : 0
    pieceLines('Yuvish', w.washed, 'wash')
    pieceLines('Qadoqlash', w.packed, 'pack')
    if (!lines.length) lines.push({ label: 'Ishbay', detail: "Shu davrda ish yo'q", amount: 0 })
  } else if (salary.method === 'furniture_onsite_percent') {
    lines.push({
      label: 'Joyida yuvish summasidan',
      detail: `${w.onsiteTeam.orders} ta buyurtma · ${money(w.onsiteTeam.revenue)} so'm × ${p.percent}%`,
      amount: Math.round((w.onsiteTeam.revenue * p.percent) / 100),
    })
  }
  const variable = lines.reduce((s, l) => s + l.amount, 0)
  const advances = month ? 300_000 : 0
  return { method: salary.method, variable, base, baseIncluded: month, advances, total: variable + (month ? base : 0) - advances, lines }
}

const hashOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)

export function workPeriod(body: Data) {
  const today = businessDateKey(new Date())
  const from = typeof body.from === 'string' ? body.from : today
  const to = typeof body.to === 'string' ? body.to : from
  const start = businessDayRange(from).start.getTime()
  const end = Math.min(businessDayRange(to).end.getTime(), Date.now())
  const inRange = (t: number) => t >= start && t < end

  const works = new Map<string, Work>()
  const W = (id: string) => works.get(id) ?? works.set(id, emptyWork()).get(id)!
  const orderOf = (id: string) => demoStore.get(`orders/${id}`) as Data
  const itemOf = (o: string, i: string) => demoStore.get(`orders/${o}/items/${i}`) as Data | undefined

  const deliveredOrders = new Map<string, Set<string>>()
  for (const s of DEMO_STAMPS) {
    if (!inRange(s.at.getTime())) continue
    const it = itemOf(s.orderId, s.itemId)
    if (!it) continue
    const w = W(s.employeeId)
    add(w[s.stage], it)
    if (s.stage === 'washed' && hashOf(s.itemId) % 9 === 0) {
      add(w.returned, it)
      // Qaytganini boshqa ishchi qayta yuvadi (haq to'lanmaydi).
      add(W(s.employeeId === 'w2' ? 'w1' : 'w2').rewashed, it)
    }
    if (s.stage === 'delivered') {
      const price = Number(it.price) || 0
      w.deliveredMoney.value += price
      w.deliveredMoney.collected += price
      const cash = hashOf(s.itemId) % 3 === 0 ? 0 : price
      w.deliveredMoney.cash += cash
      w.deliveredMoney.card += price - cash
      const set = deliveredOrders.get(s.employeeId) ?? new Set<string>()
      set.add(s.orderId)
      deliveredOrders.set(s.employeeId, set)
    }
  }
  for (const [id, set] of deliveredOrders) W(id).deliveredMoney.orders = set.size

  for (const [path, o] of demoStore.list('orders/')) {
    if (!/^orders\/[^/]+$/.test(path)) continue
    const created = (o.createdAt as Timestamp | undefined)?.toMillis()
    if (created !== undefined && inRange(created) && typeof o.createdBy === 'string') {
      const w = W(o.createdBy)
      w.created.orders += 1
      w.created.revenue += Number(o.totalPrice) || 0
      w.created.orderNumbers.push(Number(o.orderNumber))
      for (const it of (o.itemsMirror as Data[] | undefined) ?? []) add(w.created.items, it)
    }
    const picked = o.pickedUpAt instanceof Timestamp ? o.pickedUpAt.toMillis() : undefined
    if (picked !== undefined && inRange(picked) && typeof o.pickedUpBy === 'string') {
      const w = W(o.pickedUpBy)
      w.pickedUp.orders += 1
      w.pickedUp.items += Number(o.itemCount) || 0
      w.pickedUp.orderNumbers.push(Number(o.orderNumber))
    }
  }
  for (const d of DEMO_ONSITE_DONE) {
    if (!inRange(d.at.getTime())) continue
    const o = orderOf(d.orderId)
    const w = W(d.employeeId)
    w.onsite.orders += 1
    w.onsite.revenue += d.amount
    w.onsite.collected += d.amount
    for (const member of (o?.assignedTeam as string[] | undefined) ?? []) {
      W(member).onsiteTeam.orders += 1
      W(member).onsiteTeam.revenue += d.amount
    }
  }

  const month = monthOf({ from, to }, today) !== null
  const sorted = (l: Lines) => Object.values(l).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  const rates = productRates()
  const withRate = (l: Lines, stage: 'wash' | 'pack') => sorted(l).map((x) => ({ ...x, rate: rates.get(x.name.toLowerCase())?.[stage] ?? null }))
  const order = ['worker', 'dispatcher', 'delivery', 'supervisor']
  const employees = DEMO_EMPLOYEES.filter((e) => e.status === 'active' || works.has(e.id))
    .map((e) => {
      const w = works.get(e.id) ?? emptyWork()
      const salary = SALARIES[e.id] ?? null
      return {
        id: e.id,
        fullName: e.fullName,
        phone: e.phone,
        department: e.department,
        status: e.status,
        specializations: e.specializations,
        canPack: e.canPack,
        salary,
        work: {
          ...w,
          washed: withRate(w.washed, 'wash'),
          packed: withRate(w.packed, 'pack'),
          delivered: sorted(w.delivered),
          returned: sorted(w.returned),
          rewashed: sorted(w.rewashed),
          created: { ...w.created, orderNumbers: [...w.created.orderNumbers].sort((a, b) => a - b), items: sorted(w.created.items) },
        },
        pay: pay(salary, w, month, rates),
      }
    })
    .sort((a, b) => order.indexOf(a.department) - order.indexOf(b.department) || a.fullName.localeCompare(b.fullName))

  const products = new Map<string, Data>()
  for (const stage of ['washed', 'packed', 'delivered', 'returned', 'rewashed'] as const) {
    const totals: Lines = {}
    for (const w of works.values()) {
      for (const l of Object.values(w[stage])) {
        const key = `${l.name.toLowerCase()}|${l.tariff}|${l.unit}`
        const t = (totals[key] ??= { ...l, count: 0, amount: 0, price: 0 })
        t.count += l.count
        t.amount = Math.round((t.amount + l.amount) * 100) / 100
        t.price += l.price
      }
    }
    for (const [key, l] of Object.entries(totals)) {
      const row = products.get(key) ?? { name: l.name, tariff: l.tariff, unit: l.unit, washed: null, packed: null, delivered: null, returned: null, rewashed: null }
      row[stage] = l
      products.set(key, row)
    }
  }

  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  return {
    from,
    to,
    days,
    month: month ? from.slice(0, 7) : null,
    generatedAt: new Date().toISOString(),
    employees,
    products: [...products.values()],
  }
}
