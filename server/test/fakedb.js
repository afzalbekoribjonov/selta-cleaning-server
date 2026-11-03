// Yo'l asosidagi soxta Firestore — server route'larini haqiqiy bazasiz sinash
// uchun (node --test test/). `install()` server/dist/lib/admin.js va
// notifications.js ni shu soxta bilan almashtiradi, keyin route'lar odatdagidek
// require qilinadi. FieldValue belgilari (increment, arrayUnion,
// serverTimestamp, delete) talqin qilinadi.
const path = require('node:path');

const DIST = path.resolve(__dirname, '../dist') + '/';
const { Timestamp } = require('firebase-admin/firestore');

const docs = new Map();
let autoId = 0;

function sentinelName(v) {
  return v && v.constructor ? v.constructor.name : '';
}

function resolveSentinel(prev, v) {
  const name = sentinelName(v);
  if (/Increment/i.test(name)) return (typeof prev === 'number' ? prev : 0) + (v.operand ?? v._operand);
  if (/ArrayUnion/i.test(name)) {
    const els = v.elements ?? v._elements ?? [];
    const base = Array.isArray(prev) ? prev : [];
    return [...base, ...els.filter((e) => !base.includes(e))];
  }
  if (/ServerTimestamp/i.test(name)) return Timestamp.now();
  return v;
}

const isDelete = (v) => /Delete/i.test(sentinelName(v));

function applyUpdate(key, patch, merge = true) {
  const cur = merge ? { ...(docs.get(key) ?? {}) } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (isDelete(v)) delete cur[k];
    else cur[k] = resolveSentinel(cur[k], v);
  }
  docs.set(key, cur);
}

// Haqiqiy Firestore kabi: snapshot o'qilgan paytdagi ma'lumotni saqlaydi.
function snapOf(key) {
  const data = docs.has(key) ? { ...docs.get(key) } : undefined;
  return { exists: data !== undefined, id: key.split('/').pop(), ref: ref(key), data: () => data };
}

function ref(key) {
  return {
    key,
    id: key.split('/').pop(),
    get: async () => snapOf(key),
    delete: async () => docs.delete(key),
    set: async (data, opts) => applyUpdate(key, data, !!(opts && opts.merge)),
    update: async (data) => applyUpdate(key, data),
    collection: (name) => collection(`${key}/${name}`),
  };
}

function comparable(v) {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return v;
}

function matches(data, [field, op, value]) {
  const actual = comparable(data[field]);
  const expected = comparable(value);
  switch (op) {
    case '==':
      return actual === expected;
    case 'in':
      return value.map(comparable).includes(actual);
    case 'array-contains':
      return Array.isArray(data[field]) && data[field].includes(value);
    case '>=':
      return actual !== undefined && actual >= expected;
    case '>':
      return actual !== undefined && actual > expected;
    case '<':
      return actual !== undefined && actual < expected;
    case '<=':
      return actual !== undefined && actual <= expected;
    default:
      throw new Error(`fakedb: '${op}' qo'llab-quvvatlanmaydi`);
  }
}

function collection(collPath) {
  const depth = collPath.split('/').length + 1;
  const query = (filters, order, max) => {
    const list = () => {
      let keys = [...docs.keys()].filter(
        (k) => k.startsWith(collPath + '/') && k.split('/').length === depth && filters.every((f) => matches(docs.get(k), f)),
      );
      if (order) {
        const [field, dir] = order;
        keys.sort((a, b) => {
          const x = comparable(docs.get(a)[field]);
          const y = comparable(docs.get(b)[field]);
          return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
        });
      }
      if (max !== undefined) keys = keys.slice(0, max);
      return keys.map(snapOf);
    };
    return {
      key: 'query:' + collPath,
      _list: list,
      get: async () => {
        const d = list();
        return { docs: d, size: d.length, empty: d.length === 0 };
      },
      where: (f, op, v) => query([...filters, [f, op, v]], order, max),
      orderBy: (f, dir = 'asc') => query(filters, [f, dir], max),
      limit: (n) => query(filters, order, n),
    };
  };
  return { ...query([], null, undefined), doc: (id) => ref(`${collPath}/${id ?? 'auto' + ++autoId}`) };
}

const db = {
  collection,
  runTransaction: async (fn) =>
    fn({
      get: async (r) => (r._list ? { docs: r._list(), size: r._list().length } : snapOf(r.key)),
      set: (r, data, opts) => applyUpdate(r.key, data, !!(opts && opts.merge)),
      update: (r, data) => applyUpdate(r.key, data),
      delete: (r) => docs.delete(r.key),
    }),
  getAll: async (...refs) => refs.map((r) => snapOf(r.key)),
  batch: () => {
    const ops = [];
    return {
      set: (r, data, opts) => ops.push(() => applyUpdate(r.key, data, !!(opts && opts.merge))),
      update: (r, data) => ops.push(() => applyUpdate(r.key, data)),
      delete: (r) => ops.push(() => docs.delete(r.key)),
      commit: async () => ops.forEach((op) => op()),
    };
  },
  recursiveDelete: async (r) => {
    for (const k of [...docs.keys()]) if (k === r.key || k.startsWith(r.key + '/')) docs.delete(k);
  },
};

function install() {
  const stub = (rel, exports) => {
    const p = require.resolve(DIST + rel);
    require.cache[p] = { id: p, filename: p, loaded: true, exports };
  };
  stub('lib/admin.js', { db, auth: {}, messaging: {} });
  // Bildirishnomalar test paytida jo'natilmaydi.
  stub('lib/notifications.js', { notifyDepartment: async () => {}, notifyEmployee: async () => {}, notifyLater: () => {} });
}

function handlerOf(router, routePath) {
  const layer = router.stack.find((l) => l.route && l.route.path === routePath);
  if (!layer) throw new Error("route yo'q: " + routePath);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

/** Route'ning OXIRGI ishlovchisini chaqiradi (withAuth/requireAdmin chetlab o'tiladi). */
async function call(router, routePath, body, auth) {
  const res = { statusCode: 200, body: undefined };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  await handlerOf(router, routePath)({ body, auth }, res);
  return res;
}

/** Berilgan prefiks ostidagi hujjatlar (masalan 'orders/o1/itemEvents/'). */
function under(prefix) {
  return [...docs.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ id: k.split('/').pop(), ...v }));
}

function reset() {
  docs.clear();
}

module.exports = { DIST, docs, db, install, call, under, reset, Timestamp };
