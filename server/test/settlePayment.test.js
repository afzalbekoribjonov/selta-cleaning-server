const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { install, call, docs, reset, DIST } = require('./fakedb');

install();
const { paymentsRouter } = require(DIST + 'routes/payments.js');

const DRIVER = { uid: 'u1', employeeId: 'd1', role: 'delivery' };

beforeEach(() => {
  reset();
  docs.set('employees/d1', { fullName: 'Dastavchik', department: 'delivery' });
  docs.set('orders/o1', { orderNumber: 7, customerName: 'Aziz', phone: '+998901112233', status: 'done', debtTotal: 100000, paidTotal: 50000 });
  docs.set('payments/debt1', { orderId: 'o1', orderNumber: 7, employeeId: 'd1', kind: 'debt', shortfall: 100000, settled: false });
  docs.set('payments/disc1', { orderId: 'o1', orderNumber: 7, employeeId: 'd1', kind: 'discount', shortfall: 20000, settled: false });
});

test("qarzdan ko'p summa bilan yopib bo'lmaydi (xato bosilgan nol)", async () => {
  const r = await call(paymentsRouter, '/settlePayment', { paymentId: 'debt1', amount: 1000000 }, DRIVER);
  assert.equal(r.statusCode, 400, JSON.stringify(r.body));
  assert.equal(docs.get('payments/debt1').settled, false);
});

test("noto'g'ri summa rad etiladi", async () => {
  for (const amount of [-5, 0, 'abc', Number.NaN]) {
    const r = await call(paymentsRouter, '/settlePayment', { paymentId: 'debt1', amount }, DRIVER);
    assert.equal(r.statusCode, 400, `${amount}: ${JSON.stringify(r.body)}`);
  }
  assert.equal(docs.get('payments/debt1').settled, false);
});

test('chegirma yozuvini yopib bo\'lmaydi', async () => {
  const r = await call(paymentsRouter, '/settlePayment', { paymentId: 'disc1' }, DRIVER);
  assert.equal(r.statusCode, 412, JSON.stringify(r.body));
  assert.equal(docs.get('payments/disc1').settled, false);
});

test("to'liq va qisman yopish odatdagidek ishlaydi", async () => {
  let r = await call(paymentsRouter, '/settlePayment', { paymentId: 'debt1', amount: 60000 }, DRIVER);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const p = docs.get('payments/debt1');
  assert.equal(p.settled, true);
  assert.equal(p.settledAmount, 60000);

  docs.set('payments/debt2', { orderId: 'o1', orderNumber: 7, employeeId: 'd1', kind: 'partial', shortfall: 30000, settled: false });
  r = await call(paymentsRouter, '/settlePayment', { paymentId: 'debt2' }, DRIVER);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(docs.get('payments/debt2').settledAmount, 30000);
});
