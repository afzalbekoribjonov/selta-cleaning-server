/**
 * DEMO REJIM (`vite --mode demo`) — `firebase/firestore` o'rniga xotiradagi
 * namunaviy ma'lumot. Faqat demo yig'ilishida ulanadi (vite.config.ts
 * alias), haqiqiy panel bundliga kirmaydi.
 *
 * Panel ishlatadigan qism: collection/doc/query/where/orderBy/limit/
 * startAfter/startAt/endAt, onSnapshot, getDocs/getDoc, collectionGroup va
 * getAggregateFromServer (sum/count). Haqiqiy bazaga hech narsa yozilmaydi.
 */
import { seedDemoStore } from './fixtures'

export class Timestamp {
  readonly seconds: number
  readonly nanoseconds: number

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds
    this.nanoseconds = nanoseconds
  }

  static fromDate(date: Date) {
    const ms = date.getTime()
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6)
  }

  static fromMillis(ms: number) {
    return Timestamp.fromDate(new Date(ms))
  }

  static now() {
    return Timestamp.fromDate(new Date())
  }

  toDate() {
    return new Date(this.toMillis())
  }

  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6)
  }
}

type Data = Record<string, unknown>

/** Yo'l -> hujjat ("orders/o1/items/i1" -> {...}). */
const store = new Map<string, Data>()
let seeded = false
function ensureSeeded() {
  if (seeded) return
  seeded = true
  seedDemoStore(store)
}

interface DbRef {
  kind: 'db'
}
interface CollectionRef {
  kind: 'collection'
  path: string
  id: string
}
interface GroupRef {
  kind: 'group'
  id: string
}
interface DocRef {
  kind: 'doc'
  path: string
  id: string
}

type Constraint =
  | { type: 'where'; field: string; op: string; value: unknown }
  | { type: 'orderBy'; field: string; dir: 'asc' | 'desc' }
  | { type: 'limit'; n: number }
  | { type: 'startAfter' | 'startAt' | 'endAt'; values: unknown[] }

interface Query {
  kind: 'query'
  base: CollectionRef | GroupRef
  constraints: Constraint[]
}

let autoId = 0

export function getFirestore(): DbRef {
  return { kind: 'db' }
}

function joinPath(parent: DbRef | DocRef | CollectionRef, segments: string[]) {
  const prefix = parent.kind === 'db' ? '' : `${parent.path}/`
  return prefix + segments.join('/')
}

export function collection(parent: DbRef | DocRef, ...segments: string[]): CollectionRef {
  const path = joinPath(parent, segments)
  return { kind: 'collection', path, id: path.split('/').pop()! }
}

export function collectionGroup(_db: DbRef, id: string): GroupRef {
  return { kind: 'group', id }
}

export function doc(parent: DbRef | CollectionRef, ...segments: string[]): DocRef {
  const path =
    parent.kind === 'collection' && segments.length === 0 ? `${parent.path}/demo${++autoId}` : joinPath(parent, segments)
  return { kind: 'doc', path, id: path.split('/').pop()! }
}

export const where = (field: string, op: string, value: unknown): Constraint => ({ type: 'where', field, op, value })
export const orderBy = (field: string, dir: 'asc' | 'desc' = 'asc'): Constraint => ({ type: 'orderBy', field, dir })
export const limit = (n: number): Constraint => ({ type: 'limit', n })
export const startAfter = (...values: unknown[]): Constraint => ({ type: 'startAfter', values })
export const startAt = (...values: unknown[]): Constraint => ({ type: 'startAt', values })
export const endAt = (...values: unknown[]): Constraint => ({ type: 'endAt', values })

export function query(base: CollectionRef | GroupRef | Query, ...constraints: Constraint[]): Query {
  if (base.kind === 'query') return { ...base, constraints: [...base.constraints, ...constraints] }
  return { kind: 'query', base, constraints }
}

function fieldValue(data: Data, field: string): unknown {
  return field.split('.').reduce<unknown>((v, key) => (v && typeof v === 'object' ? (v as Data)[key] : undefined), data)
}

function cmpValue(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toMillis()
  if (v instanceof Date) return v.getTime()
  return v
}

function compare(a: unknown, b: unknown): number {
  const x = cmpValue(a) as number | string
  const y = cmpValue(b) as number | string
  if (x === y) return 0
  if (x === undefined || x === null) return -1
  if (y === undefined || y === null) return 1
  return x < y ? -1 : 1
}

function matches(data: Data, c: Extract<Constraint, { type: 'where' }>): boolean {
  const actual = fieldValue(data, c.field)
  switch (c.op) {
    case '==':
      return compare(actual, c.value) === 0
    case '!=':
      return compare(actual, c.value) !== 0
    case '<':
      return actual !== undefined && compare(actual, c.value) < 0
    case '<=':
      return actual !== undefined && compare(actual, c.value) <= 0
    case '>':
      return actual !== undefined && compare(actual, c.value) > 0
    case '>=':
      return actual !== undefined && compare(actual, c.value) >= 0
    case 'in':
      return (c.value as unknown[]).some((v) => compare(actual, v) === 0)
    case 'not-in':
      return !(c.value as unknown[]).some((v) => compare(actual, v) === 0)
    case 'array-contains':
      return Array.isArray(actual) && actual.includes(c.value)
    case 'array-contains-any':
      return Array.isArray(actual) && (c.value as unknown[]).some((v) => actual.includes(v))
    default:
      throw new Error(`demo firestore: '${c.op}' qo'llab-quvvatlanmaydi`)
  }
}

function cloneData(data: Data): Data {
  return { ...data }
}

function docSnapshot(path: string) {
  const data = store.get(path)
  const id = path.split('/').pop()!
  const ref: DocRef = { kind: 'doc', path, id }
  return {
    id,
    ref,
    exists: () => data !== undefined,
    data: () => (data ? cloneData(data) : undefined),
    get: (field: string) => (data ? fieldValue(data, field) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false },
  }
}

type DocSnapshot = ReturnType<typeof docSnapshot>

function runQuery(q: Query): DocSnapshot[] {
  ensureSeeded()
  const base = q.base
  let paths = [...store.keys()].filter((p) => {
    const parts = p.split('/')
    if (base.kind === 'group') return parts.length >= 2 && parts[parts.length - 2] === base.id
    return p.startsWith(`${base.path}/`) && parts.length === base.path.split('/').length + 1
  })
  for (const c of q.constraints) {
    if (c.type === 'where') paths = paths.filter((p) => matches(store.get(p)!, c))
  }
  const orders = q.constraints.filter((c): c is Extract<Constraint, { type: 'orderBy' }> => c.type === 'orderBy')
  if (orders.length > 0) {
    paths.sort((a, b) => {
      for (const o of orders) {
        const r = compare(fieldValue(store.get(a)!, o.field), fieldValue(store.get(b)!, o.field))
        if (r !== 0) return o.dir === 'desc' ? -r : r
      }
      return a.localeCompare(b)
    })
  }
  for (const c of q.constraints) {
    if (c.type === 'startAfter') {
      const cursor = c.values[0] as { ref?: DocRef } | undefined
      const idx = cursor?.ref ? paths.indexOf(cursor.ref.path) : -1
      if (idx >= 0) paths = paths.slice(idx + 1)
    }
    if ((c.type === 'startAt' || c.type === 'endAt') && orders[0]) {
      const field = orders[0].field
      const value = c.values[0]
      paths = paths.filter((p) => {
        const r = compare(fieldValue(store.get(p)!, field), value)
        return c.type === 'startAt' ? r >= 0 : r <= 0
      })
    }
  }
  const lim = q.constraints.find((c): c is Extract<Constraint, { type: 'limit' }> => c.type === 'limit')
  if (lim) paths = paths.slice(0, lim.n)
  return paths.map(docSnapshot)
}

function querySnapshot(docs: DocSnapshot[]) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb: (d: DocSnapshot) => void) => docs.forEach(cb),
    metadata: { fromCache: false, hasPendingWrites: false },
  }
}

function asQuery(target: CollectionRef | GroupRef | Query): Query {
  return target.kind === 'query' ? target : { kind: 'query', base: target, constraints: [] }
}

/** Tarmoq kechikishini taqlid qiladi — yuklanish holatlari ham ko'rinsin. */
const LATENCY_MS = 180

export function onSnapshot(
  target: DocRef | CollectionRef | GroupRef | Query,
  next: (snap: never) => void,
  error?: (err: Error) => void,
): () => void {
  let active = true
  const timer = setTimeout(() => {
    if (!active) return
    try {
      ensureSeeded()
      const snap = target.kind === 'doc' ? docSnapshot(target.path) : querySnapshot(runQuery(asQuery(target)))
      next(snap as never)
    } catch (err) {
      error?.(err as Error)
    }
  }, LATENCY_MS)
  return () => {
    active = false
    clearTimeout(timer)
  }
}

const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS))

export async function getDocs(target: CollectionRef | GroupRef | Query) {
  await wait()
  return querySnapshot(runQuery(asQuery(target)))
}

export async function getDoc(ref: DocRef) {
  await wait()
  ensureSeeded()
  return docSnapshot(ref.path)
}

export const sum = (field: string) => ({ op: 'sum' as const, field })
export const count = () => ({ op: 'count' as const })
export const average = (field: string) => ({ op: 'avg' as const, field })

export async function getAggregateFromServer(
  target: CollectionRef | Query,
  spec: Record<string, { op: 'sum' | 'count' | 'avg'; field?: string }>,
) {
  await wait()
  const docs = runQuery(asQuery(target))
  const out: Record<string, number> = {}
  for (const [key, agg] of Object.entries(spec)) {
    if (agg.op === 'count') out[key] = docs.length
    else {
      const values = docs.map((d) => Number(d.get(agg.field!)) || 0)
      const total = values.reduce((a, b) => a + b, 0)
      out[key] = agg.op === 'sum' ? total : values.length ? total / values.length : 0
    }
  }
  return { data: () => out }
}

/** Demo api.ts uchun — buyurtmani o'qish/yozish (masalan o'chirish). */
export const demoStore = {
  get: (path: string) => {
    ensureSeeded()
    return store.get(path)
  },
  set: (path: string, data: Data) => {
    ensureSeeded()
    store.set(path, data)
  },
  delete: (path: string) => store.delete(path),
  list: (prefix: string) => {
    ensureSeeded()
    return [...store.entries()].filter(([p]) => p.startsWith(prefix))
  },
}
