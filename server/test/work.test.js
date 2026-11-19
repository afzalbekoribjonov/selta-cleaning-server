const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { install, call, docs, under, reset, DIST, Timestamp } = require('./fakedb');

install();
const { buildDayWork, emptyWork, unitTotals } = require(DIST + 'lib/workSummary.js');
const { computePay, hasWork } = require(DIST + 'lib/salaryCalc.js');
const { ratesFromDocs, invalidateProductRates } = require(DIST + 'lib/productRates.js');
const { workRouter, monthOfRange } = require(DIST + 'routes/work.js');
const { ordersRouter } = require(DIST + 'routes/orders.js');
const { productsRouter } = require(DIST + 'routes/products.js');
const { isItemInWarehouse, warehouseItemCount } = require(DIST + 'lib/warehouse.js');
const { businessDateString, businessDayRangeUtc } = require(DIST + 'lib/businessTime.js');

const ADMIN = { uid: 'admin', role: 'admin' };
const today = businessDateString(new Date());
const dayStart = (key) => businessDayRangeUtc(key).start.getTime();
const ts = (key, h = 10) => Timestamp.fromDate(new Date(dayStart(key) + h * 3600_000));
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  reset();
  invalidateProductRates();
});

const rates = (list) => ratesFromDocs(list.map(([id, name, wash, pack]) => ({ id, data: { name, workRates: { wash, pack } } })));

function ev(type, employeeId, extra = {}) {
  return {
    type,
    employeeId,
    orderId: 'o1',
    orderNumber: 1201,
    itemId: 'i1',
    itemName: 'Gilam',
    calcType: 'sqm',
    qty: 10,
    price: 150000,
    collectedAmount: null,
    cashAmount: null,
    cardAmount: null,
    ...extra,
  };
}

test("kun ishi: mahsulot × tarif × birlik, tarif hodisadan yoki nusxadan, nom birlashadi", () => {
  const orders = new Map([
    ['o1', { orderNumber: 1201, itemsMirror: [{ id: 'i2', tariff: 'premium' }] }],
    ['o9', { orderNumber: 1300, serviceType: 'onsite', assignedTeam: ['w1', 'w2'], tariff: 'comfort' }],
    ['oc', {
      orderNumber: 1400, createdBy: 'disp', createdAt: ts('2026-11-10'), totalPrice: 500000, pickedUpBy: 'd1', pickedUpAt: ts('2026-11-10', 12), itemCount: 2,
      itemsMirror: [
        { id: 'a', name: 'Gilam', calcType: 'sqm', qty: 12.5, price: 250000, tariff: 'express' },
        { id: 'b', name: 'Yostiq', calcType: 'count', qty: 3, price: 60000, tariff: 'standart' },
      ],
    }],
  ]);
  const day = buildDayWork('2026-11-10', [
    ev('washed', 'w1', { tariff: 'express' }),
    ev('washed', 'w1', { itemId: 'i2', itemName: ' gilam ', qty: 5.5, price: 80000 }),
    ev('washed', 'w1', { itemId: 'i3', itemName: 'Parda', calcType: 'meter', qty: 4, price: 60000, tariff: 'comfort' }),
    ev('packed', 'w2', { tariff: 'express' }),
    ev('returned', 'w1', { tariff: 'express', recordedBy: 'w2' }),
    ev('delivered', 'd1', { tariff: 'express', collectedAmount: 140000, cashAmount: 100000, cardAmount: 40000 }),
    ev('onsite_done', 'w1', { orderId: 'o9', itemId: null, itemName: 'Joyida yuvish', calcType: null, qty: null, price: 300000, collectedAmount: 300000 }),
  ], orders);

  const w1 = day.employees.w1;
  const washed = Object.values(w1.washed);
  assert.equal(washed.length, 3);
  assert.deepEqual(washed.find((l) => l.tariff === 'express'), { name: 'Gilam', tariff: 'express', unit: 'sqm', count: 1, amount: 10, price: 150000 });
  // Tarif yozilmagan hodisa — buyurtma nusxasidan; nom bo'shliq/registrsiz.
  assert.equal(washed.find((l) => l.tariff === 'premium').amount, 5.5);
  assert.deepEqual(unitTotals(w1.washed), { sqm: 15.5, meter: 4, kg: 0, dona: 0 });
  assert.equal(Object.values(w1.returned)[0].amount, 10);
  assert.deepEqual(w1.onsite, { orders: 1, revenue: 300000, collected: 300000 });
  // Joyida yuvish jamoasi — ikkala a'zoga.
  assert.deepEqual(day.employees.w2.onsiteTeam, { orders: 1, revenue: 300000 });
  assert.equal(Object.values(day.employees.w2.packed)[0].count, 1);

  const d1 = day.employees.d1;
  assert.deepEqual(d1.deliveredMoney, { value: 150000, collected: 140000, cash: 100000, card: 40000, orders: 1 });
  assert.deepEqual(d1.pickedUp, { orders: 1, items: 2, orderNumbers: [1400] });

  const disp = day.employees.disp.created;
  assert.equal(disp.orders, 1);
  assert.equal(disp.revenue, 500000);
  assert.deepEqual(unitTotals(disp.items), { sqm: 12.5, meter: 0, kg: 0, dona: 3 });
});

test("maosh: ishbay — har bir MAHSULOT o'z narxida (m², metr, kg, dona); fiksa faqat oyda; avans ayiriladi", () => {
  const work = emptyWork();
  work.washed = {
    a: { name: 'Gilam', tariff: 'express', unit: 'sqm', count: 3, amount: 40.5, price: 0 },
    b: { name: 'Parda', tariff: 'comfort', unit: 'meter', count: 2, amount: 8, price: 0 },
    c: { name: 'Yostiq', tariff: 'standart', unit: 'dona', count: 4, amount: 4, price: 0 },
    d: { name: 'Adyol', tariff: 'standart', unit: 'kg', count: 1, amount: 6.5, price: 0 },
  };
  work.packed = { a: { name: 'Gilam', tariff: 'express', unit: 'sqm', count: 1, amount: 10, price: 0 } };
  const r = rates([
    ['p1', 'Gilam', 1500, 500],
    ['p2', 'Parda', 2000, null],
    ['p3', 'Yostiq', 5000, 1000],
    ['p4', ' adyol ', 800, null],
  ]);
  // Xodimda faqat usul va fiksa — eski birlik narxlari e'tiborsiz.
  const salary = { method: 'washing', params: { baseAmount: 1000000, pricePerSqm: 99999 } };

  const day = computePay(salary, work, { month: false, advances: 300000, rates: r });
  assert.equal(day.variable, 40.5 * 1500 + 8 * 2000 + 4 * 5000 + 6.5 * 800 + 10 * 500);
  assert.equal(day.baseIncluded, false);
  assert.equal(day.advances, 0);
  assert.equal(day.total, day.variable);
  assert.deepEqual(day.lines.map((l) => l.label), ['Yuvish', 'Qadoqlash']);
  assert.match(day.lines[0].detail, /^10 ta · 40,5 m² · 8 metr · 6,5 kg · 4 dona$/);

  const month = computePay(salary, work, { month: true, advances: 300000, rates: r });
  assert.equal(month.total, month.variable + 1000000 - 300000);

  // Narxi kiritilmagan mahsulot — 0 so'm, nomi bilan alohida qatorda.
  const quilt = { k: { name: "Ko'rpa", tariff: 'none', unit: 'dona', count: 1, amount: 1, price: 0 } };
  const noRate = computePay({ method: 'finishing', params: {} }, { ...emptyWork(), washed: quilt }, { month: true, advances: 0, rates: r });
  assert.equal(noRate.variable, 0);
  assert.equal(noRate.base, 0, "ishbay usulida fiksa yo'q");
  assert.equal(noRate.lines[1].label, 'Yuvish: narxi kiritilmagan');
  assert.match(noRate.lines[1].detail, /Ko'rpa — Mahsulotlar bo'limida kiriting/);

  // productId bo'yicha topiladi (nomi boshqacha yozilgan bo'lsa ham).
  const big = { x: { name: 'Gilam katta', tariff: 'none', unit: 'sqm', count: 1, amount: 2, price: 0, productId: 'p1' } };
  assert.equal(computePay(salary, { ...emptyWork(), washed: big }, { month: false, advances: 0, rates: r }).variable, 3000);

  assert.equal(computePay(null, work, { month: true, advances: 0 }), null);
});

test("qayta yuvish: haq to'lanmaydi, yuvilganlarga qo'shilmaydi, alohida sanaladi", () => {
  const day = buildDayWork('2026-11-10', [
    ev('washed', 'w1', { tariff: 'express' }),
    ev('returned', 'w1', { tariff: 'express', recordedBy: 'w2' }),
    ev('rewashed', 'w3', { tariff: 'express' }),
  ], new Map());
  assert.equal(Object.values(day.employees.w3.washed).length, 0, "qayta yuvgan xodimning yuvganiga qo'shilmadi");
  assert.equal(Object.values(day.employees.w3.rewashed)[0].amount, 10);
  assert.ok(hasWork(day.employees.w3));
  const r = rates([['p1', 'Gilam', 1500, 500]]);
  const pay = computePay({ method: 'washing', params: { baseAmount: 0 } }, day.employees.w3, { month: false, advances: 0, rates: r });
  assert.equal(pay.variable, 0);
  // Asl yuvgan xodim haqi saqlanadi.
  assert.equal(computePay({ method: 'washing', params: {} }, day.employees.w1, { month: false, advances: 0, rates: r }).variable, 15000);
});

test("maosh: pardozlash qadoqlanganlardan, sotuv menejeri foizi, dastavka, joyida yuvish", () => {
  const work = emptyWork();
  work.washed = { a: { name: 'Gilam', tariff: 'express', unit: 'sqm', count: 1, amount: 100, price: 0 } };
  work.packed = { a: { name: 'Gilam', tariff: 'express', unit: 'sqm', count: 1, amount: 20, price: 0 } };
  work.created = { orders: 4, revenue: 2000000, orderNumbers: [], items: {} };
  work.deliveredMoney = { value: 1000000, collected: 900000, cash: 0, card: 0, orders: 2 };
  work.onsite = { orders: 1, revenue: 500000, collected: 400000 };
  work.onsiteTeam = { orders: 2, revenue: 800000 };

  const r = rates([['p1', 'Gilam', null, 1000]]);
  assert.equal(computePay({ method: 'finishing', params: {} }, work, { month: false, advances: 0, rates: r }).variable, 20000);
  assert.equal(computePay({ method: 'fixed_percent', params: { baseAmount: 1000000, percent: 3 } }, work, { month: false, advances: 0 }).variable, 60000);
  const delivery = computePay({ method: 'delivery', params: { baseAmount: 0, percentOfOrderValue: 2, percentOfCashCollected: 1 } }, work, { month: false, advances: 0 });
  assert.equal(delivery.variable, Math.round(1500000 * 0.02) + Math.round(1300000 * 0.01));
  assert.equal(computePay({ method: 'furniture_onsite_percent', params: { percent: 10 } }, work, { month: false, advances: 0 }).variable, 80000);
  const fixed = computePay({ method: 'fixed', params: { fixedAmount: 4000000 } }, work, { month: true, advances: 0 });
  assert.equal(fixed.total, 4000000);
});

test("oy aniqlash: to'liq oy, joriy oy bugungacha; boshqa oraliq — oy emas", () => {
  assert.equal(monthOfRange('2026-10-01', '2026-10-31', '2026-11-19'), '2026-10');
  assert.equal(monthOfRange('2026-11-01', '2026-11-19', '2026-11-19'), '2026-11');
  assert.equal(monthOfRange('2026-11-01', '2026-11-18', '2026-11-19'), null);
  assert.equal(monthOfRange('2026-10-02', '2026-10-31', '2026-11-19'), null);
  assert.equal(monthOfRange('2026-10-01', '2026-11-01', '2026-11-19'), null);
});

test("/adminWorkPeriod: xodimlar, ishbay, mahsulotlar statistikasi; oy — maosh yozuvi", async () => {
  const d1 = addDays(today, -1);
  docs.set('employees/w1', { fullName: 'Bobur Aliyev', phone: '+998901112233', department: 'worker', status: 'active', specializations: ['gilam'], salary: { method: 'washing', params: { baseAmount: 1000000 } } });
  docs.set('products/p1', { name: 'Gilam', calcType: 'sqm', workRates: { wash: 2000, pack: 700 } });
  docs.set('employees/disp', { fullName: 'Madina', department: 'dispatcher', status: 'active' });
  docs.set('employees/old', { fullName: 'Eski', department: 'worker', status: 'terminated' });
  docs.set(`dailyActivity/${today}/events/washed__i1__${today}`, ev('washed', 'w1', { tariff: 'express' }));
  docs.set(`dailyActivity/${d1}/events/washed__i2__${d1}`, ev('washed', 'w1', { itemId: 'i2', qty: 5, tariff: 'comfort' }));
  docs.set(`dailyActivity/${today}/events/returned__i1__${today}`, ev('returned', 'w1', { tariff: 'express' }));

  const r = await call(workRouter, '/adminWorkPeriod', { from: d1, to: today }, ADMIN);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.employees.map((e) => e.id), ['w1', 'disp'], "bo'shatilgan va ishsiz chiqmaydi");
  const w1 = r.body.employees[0];
  assert.equal(w1.phone, '+998901112233');
  assert.equal(w1.work.washed.length, 2);
  assert.equal(w1.pay.variable, 15 * 2000);
  assert.ok(w1.work.washed.every((l) => l.rate === 2000), 'qatorda mahsulot narxi');
  assert.equal(r.body.employees[1].salary, null, 'maosh usuli belgilanmagan');
  const gilamExpress = r.body.products.find((p) => p.tariff === 'express');
  assert.equal(gilamExpress.washed.amount, 10);
  assert.equal(gilamExpress.returned.amount, 10);

  // Joriy oy — maosh yozuvi yoziladi (baza bilan).
  const monthStart = `${today.slice(0, 7)}-01`;
  const m = await call(workRouter, '/adminWorkPeriod', { from: monthStart, to: today }, ADMIN);
  assert.equal(m.body.month, today.slice(0, 7));
  const run = docs.get(`employees/w1/payrollRuns/${today.slice(0, 7)}`);
  assert.ok(run, 'payrollRuns yozildi');
  assert.equal(run.amount, m.body.employees[0].pay.total);
  assert.equal(docs.get(`employees/disp/payrollRuns/${today.slice(0, 7)}`), undefined);

  const bad = await call(workRouter, '/adminWorkPeriod', { from: addDays(today, 1), to: addDays(today, 1) }, ADMIN);
  assert.equal(bad.statusCode, 400);
  const long = await call(workRouter, '/adminWorkPeriod', { from: addDays(today, -200), to: today }, ADMIN);
  assert.equal(long.statusCode, 400);
});

test("qayta yuvish: jurnalda yuvgan xodim hisobiga yoziladi va unga ogohlantirish boradi", async () => {
  docs.set('employees/w1', { fullName: 'Ali Yuvuvchi', department: 'worker', status: 'active', specializations: ['gilam'], canPack: false });
  docs.set('employees/w2', { fullName: 'Vali Upakovkachi', department: 'worker', status: 'active', specializations: ['gilam'], canPack: true });
  docs.set('orders/o1', { orderNumber: 77, serviceType: 'pickup', status: 'brought_in', customerName: 'Aziz' });
  docs.set('orders/o1/items/i1', { itemNumber: 2, name: 'Gilam', status: 'packing', price: 100000, calcType: 'sqm', qty: 6, tariff: 'premium', washedBy: 'w1', category: 'gilam' });

  const r = await call(ordersRouter, '/changeItemStatus', { orderId: 'o1', itemId: 'i1', toStatus: 'returned', qcNote: "Dog' qolgan" }, { uid: 'u2', employeeId: 'w2', role: 'worker' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const event = under(`dailyActivity/${today}/events/`).find((e) => e.type === 'returned');
  assert.equal(event.employeeId, 'w1');
  assert.equal(event.recordedBy, 'w2');
  assert.equal(event.tariff, 'premium');
  assert.equal(event.note, "Dog' qolgan");

  // Ogohlantirish fonda yoziladi.
  for (let i = 0; i < 20 && !(docs.get('employees/w1').pendingWarnings ?? []).length; i += 1) await new Promise((r2) => setTimeout(r2, 5));
  const pending = docs.get('employees/w1').pendingWarnings;
  assert.equal(pending.length, 1);
  assert.match(pending[0].text, /#77\/2 «Gilam» sifat nazoratidan o'tmadi .* Sabab: Dog' qolgan\. .*jiddiy e'tibor/);
  assert.equal(pending[0].byName, 'Vali Upakovkachi');
  const warning = under('warnings/')[0];
  assert.equal(warning.kind, 'rewash');
  assert.equal(warning.employeeId, 'w1');

  // Qaytgan mahsulot belgilandi.
  const returnedItem = docs.get('orders/o1/items/i1');
  assert.equal(returnedItem.rewashPending, true);
  assert.equal(returnedItem.returnCount, 1);

  // Boshqa ishchi qayta yuvadi: `rewashed` yoziladi, `washed` emas; asl yuvgan o'zgarmaydi.
  docs.set('employees/w3', { fullName: 'Sardor', department: 'worker', status: 'active', specializations: ['gilam'], canPack: false });
  const W3 = { uid: 'u3', employeeId: 'w3', role: 'worker' };
  let s = await call(ordersRouter, '/changeItemStatus', { orderId: 'o1', itemId: 'i1', toStatus: 'washing' }, W3);
  assert.equal(s.statusCode, 200, JSON.stringify(s.body));
  s = await call(ordersRouter, '/changeItemStatus', { orderId: 'o1', itemId: 'i1', toStatus: 'packing' }, W3);
  assert.equal(s.statusCode, 200, JSON.stringify(s.body));
  const events = under(`dailyActivity/${today}/events/`);
  assert.equal(events.filter((e) => e.type === 'washed').length, 0, "qayta yuvish 'yuvildi' emas");
  const rewash = events.find((e) => e.type === 'rewashed');
  assert.equal(rewash.employeeId, 'w3');
  const after = docs.get('orders/o1/items/i1');
  assert.equal(after.washedBy, 'w1');
  assert.equal(after.rewashedBy, 'w3');
  assert.equal(after.rewashPending, false);
  const mirror = docs.get('orders/o1').itemsMirror.find((m) => m.id === 'i1');
  assert.equal(mirror.rewashedBy, 'w3');
  assert.equal(mirror.returnCount, 1);
});

test("omborxona qoidasi serverda ilova bilan bir xil (kalendar kunlari)", () => {
  const now = new Date(dayStart(today) + 9 * 3600_000);
  const readyAgo = (days) => ({ status: 'ready', packedAt: Timestamp.fromDate(new Date(dayStart(today) - days * 86_400_000 + 20 * 3600_000)) });
  assert.equal(isItemInWarehouse(readyAgo(5), 5, now), true);
  assert.equal(isItemInWarehouse(readyAgo(4), 5, now), false);
  assert.equal(isItemInWarehouse({ ...readyAgo(9), status: 'done' }, 5, now), false);
  assert.equal(isItemInWarehouse({ status: 'ready', washedAt: readyAgo(6).packedAt }, 5, now), true, 'packedAt yo\'q — washedAt');
  const order = { serviceType: 'pickup', itemsMirror: [readyAgo(7), readyAgo(1), { status: 'washing' }] };
  assert.equal(warehouseItemCount(order, 5, now), 1);
  assert.equal(warehouseItemCount({ ...order, serviceType: 'onsite' }, 5, now), 0);
});

test("ishbay narxlari: mahsulotga saqlanadi (0 — olib tashlanadi), noto'g'ri qiymat rad etiladi", async () => {
  docs.set('products/p1', { name: 'Gilam', calcType: 'sqm' });
  docs.set('products/p2', { name: 'Adyol', calcType: 'kg', workRates: { wash: 900, pack: 300 } });
  const r = await call(productsRouter, '/adminSetProductWorkRates', { rates: { p1: { wash: 1500, pack: 450.5 }, p2: { wash: 0, pack: null } } }, ADMIN);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(docs.get('products/p1').workRates, { wash: 1500, pack: 450.5 });
  assert.deepEqual(docs.get('products/p2').workRates, { wash: null, pack: null });

  const bad = await call(productsRouter, '/adminSetProductWorkRates', { rates: { p1: { wash: -5 } } }, ADMIN);
  assert.equal(bad.statusCode, 400);
  const missing = await call(productsRouter, '/adminSetProductWorkRates', { rates: { nope: { wash: 100 } } }, ADMIN);
  assert.equal(missing.statusCode, 404);
  const empty = await call(productsRouter, '/adminSetProductWorkRates', { rates: {} }, ADMIN);
  assert.equal(empty.statusCode, 400);
});
