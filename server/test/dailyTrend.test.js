const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { install, call, docs, reset, DIST, Timestamp } = require('./fakedb');

install();
const { dailyReportRouter } = require(DIST + 'routes/dailyReport.js');
const { businessDateString, businessDayRangeUtc } = require(DIST + 'lib/businessTime.js');
const { shiftDateKey } = require(DIST + 'lib/dailyStats.js');

const ADMIN = { uid: 'ua', employeeId: 'adm', role: 'admin' };
const today = businessDateString(new Date());
const yesterday = shiftDateKey(today, -1);
const fiveAgo = shiftDateKey(today, -5);

function event(day, id, data) {
  docs.set(`dailyActivity/${day}/events/${id}`, { orderId: data.orderId ?? 'o1', employeeId: 'drv', ...data });
}

function intakeOrder(day, id, data) {
  const { start } = businessDayRangeUtc(day);
  docs.set(`orders/${id}`, { pickedUpAt: Timestamp.fromDate(new Date(start.getTime() + 3 * 3600_000)), ...data });
}

beforeEach(() => {
  reset();
  // 5 kun oldin: 2 ta gilam yuvildi (12.5 + 8 m²), 1 dona yostiq; bitta yetkazish naqd+karta.
  event(fiveAgo, 'w1', { type: 'washed', calcType: 'sqm', qty: 12.5, orderId: 'o1' });
  event(fiveAgo, 'w2', { type: 'washed', calcType: 'sqm', qty: 8, orderId: 'o2' });
  event(fiveAgo, 'w3', { type: 'washed', calcType: 'fixed', qty: null, orderId: 'o2' });
  event(fiveAgo, 'd1', { type: 'delivered', calcType: 'kg', qty: 3.5, price: 90000, collectedAmount: 90000, cashAmount: 40000, cardAmount: 50000 });
  event(fiveAgo, 's1', { type: 'settled', collectedAmount: 20000, cashAmount: 20000, cardAmount: 0 });
  intakeOrder(fiveAgo, 'in1', { itemCount: 3, itemUnitTotals: { sqm: 20.5, dona: 1 } });
  // Kecha: 1 ta upakovka.
  event(yesterday, 'p1', { type: 'packed', calcType: 'meter', qty: 4 });
  // Bugun: joyida yuvish yakunlandi (narxi bilan, eski yozuv — naqd/karta yo'q).
  event(today, 'od', { type: 'onsite_done', price: 150000, orderId: 'o9' });
});

const trend = async (body = { days: 7 }) => {
  const r = await call(dailyReportRouter, '/adminDailyTrend', body, ADMIN);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.days;
};

test("kunlar eskidan yangiga, birliklar va pul to'g'ri", async () => {
  const days = await trend();
  assert.equal(days.length, 7);
  assert.equal(days.at(-1).date, today);
  assert.equal(days[0].date, shiftDateKey(today, -6));

  const d5 = days.find((d) => d.date === fiveAgo);
  assert.equal(d5.washed.count, 3);
  assert.equal(d5.washed.orderCount, 2);
  assert.deepEqual(d5.washed.units, { sqm: 20.5, dona: 1 });
  assert.deepEqual(d5.delivered.units, { kg: 3.5 });
  assert.equal(d5.delivered.amount, 90000);
  assert.equal(d5.delivered.cash, 40000);
  assert.equal(d5.delivered.card, 50000);
  assert.deepEqual(d5.collected, { amount: 110000, cash: 60000, card: 50000 }, "yopilgan qarz kassaga qo'shiladi");
  assert.deepEqual(d5.intake, { orderCount: 1, itemCount: 3, units: { sqm: 20.5, dona: 1 } });

  assert.deepEqual(days.find((d) => d.date === yesterday).packed.units, { meter: 4 });
  const t = days.at(-1);
  assert.equal(t.delivered.orderCount, 1);
  assert.equal(t.delivered.amount, 150000);
  assert.equal(t.delivered.cash, 150000, 'eski yozuv — naqd deb hisoblanadi');
});

test("o'tgan kunlar keshlanadi, bugun keshlanmaydi; kecha har safar qayta hisoblanadi", async () => {
  await trend();
  assert.ok(docs.has(`dailyStats/${fiveAgo}`), "o'tgan kun keshda");
  assert.ok(!docs.has(`dailyStats/${today}`), 'bugun keshlanmaydi');

  // Keshdan keyin o'zgarish: eski kunniki keshdan qaytadi, kechagisi yangilanadi.
  event(fiveAgo, 'w4', { type: 'washed', calcType: 'sqm', qty: 100 });
  event(yesterday, 'p2', { type: 'packed', calcType: 'meter', qty: 6 });
  const days = await trend();
  assert.equal(days.find((d) => d.date === fiveAgo).washed.count, 3, 'kesh ishlatildi');
  assert.deepEqual(days.find((d) => d.date === yesterday).packed.units, { meter: 10 });
});

test('kunlar soni chegarada; kelajak kunlari qaytarilmaydi', async () => {
  assert.equal((await trend({ days: 2 })).length, 7);
  assert.equal((await trend({ days: 500 })).length, 62);
  const r = await call(dailyReportRouter, '/adminDailyTrend', { days: 7, end: '2026-02-30' }, ADMIN);
  assert.equal(r.statusCode, 400);
});
