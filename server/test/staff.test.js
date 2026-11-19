const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { install, call, docs, db, reset, DIST, Timestamp } = require('./fakedb');

install();
const { staffRouter, invalidateStaffDirectory } = require(DIST + 'routes/staff.js');
const { expensesRouter } = require(DIST + 'routes/expenses.js');
const { businessDayRangeUtc } = require(DIST + 'lib/businessTime.js');

const W1 = { uid: 'u1', employeeId: 'w1', role: 'worker' };

beforeEach(() => {
  reset();
  invalidateStaffDirectory();
});

test("xodimlar ma'lumotnomasi: faqat ism va kasb — telefon, PIN, maosh berilmaydi", async () => {
  docs.set('employees/w1', {
    fullName: 'Aliyev Vali',
    phone: '+998901234567',
    pinHash: 'secret',
    salary: { method: 'washing', params: { baseSalary: 1 } },
    department: 'worker',
    specializations: ['gilam', 'parda'],
    canPack: true,
    status: 'active',
  });
  docs.set('employees/d1', { fullName: 'Karimov', department: 'delivery', status: 'terminated' });
  docs.set('employees/x1', { fullName: 'Omborchi', department: 'ombor', status: 'active' });
  docs.set('customDepartments/ombor', { label: 'Omborchi' });

  const r = await call(staffRouter, '/staffDirectory', {}, W1);
  assert.equal(r.statusCode, 200);
  const byId = Object.fromEntries(r.body.employees.map((e) => [e.id, e]));
  assert.deepEqual(byId.w1, {
    id: 'w1',
    fullName: 'Aliyev Vali',
    department: 'worker',
    departmentLabel: 'Ishchi',
    specializations: ['gilam', 'parda'],
    canPack: true,
    active: true,
  });
  assert.equal(byId.d1.departmentLabel, 'Dastavchik');
  assert.equal(byId.d1.active, false);
  assert.equal(byId.x1.departmentLabel, 'Omborchi', "maxsus bo'lim nomi");
  for (const e of r.body.employees) {
    assert.equal(e.phone, undefined);
    assert.equal(e.pinHash, undefined);
    assert.equal(e.salary, undefined);
  }
});

test("ma'lumotnoma 5 daqiqa keshlanadi — qayta so'rovda Firestore o'qilmaydi", async () => {
  docs.set('employees/w1', { fullName: 'Birinchi', department: 'worker', status: 'active' });
  await call(staffRouter, '/staffDirectory', {}, W1);
  docs.set('employees/w2', { fullName: 'Ikkinchi', department: 'worker', status: 'active' });
  const cached = await call(staffRouter, '/staffDirectory', {}, W1);
  assert.equal(cached.body.employees.length, 1);
  invalidateStaffDirectory();
  const fresh = await call(staffRouter, '/staffDirectory', {}, W1);
  assert.equal(fresh.body.employees.length, 2);
});

function expense(id, employeeId, dateKey, amount, extra = {}) {
  docs.set(`expenses/${id}`, {
    employeeId,
    name: 'Yoqilg\'i',
    amount,
    note: null,
    fromCash: false,
    dateKey,
    date: Timestamp.fromDate(new Date(businessDayRangeUtc(dateKey).start.getTime() + 10 * 3600_000)),
    ...extra,
  });
}

test("o'z chiqimlari: faqat o'ziniki, davr ichida, eng yangisi birinchi", async () => {
  expense('a', 'w1', '2026-10-31', 10000);
  expense('b', 'w1', '2026-11-01', 20000, { fromCash: true, note: 'Damas' });
  expense('c', 'w1', '2026-11-15', 30000);
  expense('d', 'w2', '2026-11-10', 99000);
  expense('e', 'w1', '2026-12-01', 40000);

  const r = await call(expensesRouter, '/myExpenses', { from: '2026-11-01', to: '2026-11-30' }, W1);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.expenses.map((e) => e.id), ['c', 'b']);
  const b = r.body.expenses[1];
  assert.equal(b.fromCash, true);
  assert.equal(b.note, 'Damas');
  assert.equal(b.dateKey, '2026-11-01');
  assert.match(b.at, /^2026-11-01T/);
});

test("o'z chiqimlari: noto'g'ri yoki juda uzun oraliq rad etiladi", async () => {
  let r = await call(expensesRouter, '/myExpenses', { from: '2026-11-10', to: '2026-11-01' }, W1);
  assert.equal(r.statusCode, 400);
  r = await call(expensesRouter, '/myExpenses', { from: '2026-13-01', to: '2026-13-02' }, W1);
  assert.equal(r.statusCode, 400);
  r = await call(expensesRouter, '/myExpenses', { from: '2026-01-01', to: '2026-06-30' }, W1);
  assert.equal(r.statusCode, 400);
});

test("o'z chiqimlari: indeks hali joylanmagan bo'lsa zaxira so'rov ishlaydi", async () => {
  expense('a', 'w1', '2026-11-02', 10000);
  expense('b', 'w2', '2026-11-02', 20000);
  const original = db.collection;
  db.collection = (name) => {
    const c = original(name);
    if (name !== 'expenses') return c;
    return {
      ...c,
      where: (field, op, value) => {
        const q = c.where(field, op, value);
        if (field !== 'employeeId') return q;
        const fail = () => ({ where: fail, get: async () => { throw Object.assign(new Error('index'), { code: 9 }); } });
        return fail();
      },
    };
  };
  try {
    const r = await call(expensesRouter, '/myExpenses', { from: '2026-11-01', to: '2026-11-30' }, W1);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.body.expenses.map((e) => e.id), ['a']);
  } finally {
    db.collection = original;
  }
});
