const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { install, call, docs, under, reset, DIST } = require('./fakedb');

install();
const { ordersRouter } = require(DIST + 'routes/orders.js');
const { supervisorRouter } = require(DIST + 'routes/supervisor.js');
const { authRouter } = require(DIST + 'routes/auth.js');
const { businessDateString } = require(DIST + 'lib/businessTime.js');

const DISP = { uid: 'ud', employeeId: 'disp', role: 'dispatcher' };
const SUP = { uid: 'us', employeeId: 'sup', role: 'supervisor' };
const WORKER = { uid: 'uw', employeeId: 'w1', role: 'worker' };
const base = { customerName: 'Aziz', phone: '+998901112233', location: 'Yunusobod' };
const gilam = (price = 50000, name = 'Gilam') => ({ name, calcType: 'fixed', price, tariff: 'standard' });
const today = () => businessDateString(new Date());

beforeEach(() => {
  reset();
  docs.set('employees/disp', { fullName: 'Sotuvchi', department: 'dispatcher', status: 'active' });
  docs.set('employees/sup', { fullName: 'Nodir Nazoratchi', department: 'supervisor', status: 'active' });
  docs.set('employees/w1', { fullName: 'Ali Yuvuvchi', department: 'worker', status: 'active', specializations: ['gilam'], canPack: false });
  docs.set('employees/w2', { fullName: 'Vali Upakovkachi', department: 'worker', status: 'active', specializations: ['parda'], canPack: true });
  docs.set('employees/d1', { fullName: 'Akmal Dastavchik', department: 'delivery', status: 'active' });
});

async function orderWithItem() {
  const r = await call(ordersRouter, '/createOrder', { ...base, serviceType: 'pickup', items: [gilam()] }, DISP);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const orderId = r.body.orderId ?? r.body.id;
  // Sexga kelgan holat (dastavchik GPS bilan olib kelgani o'rniga to'g'ridan-to'g'ri).
  docs.set(`orders/${orderId}`, { ...docs.get(`orders/${orderId}`), status: 'brought_in' });
  const itemId = under(`orders/${orderId}/items/`)[0].id;
  return { orderId, itemId };
}

const move = (ids, toStatus, auth, extra = {}) =>
  call(ordersRouter, '/changeItemStatus', { orderId: ids.orderId, itemId: ids.itemId, toStatus, ...extra }, auth);

test('nazoratchi ishni tanlangan ishchi nomidan qayd etadi — ish o\'sha ishchiga yoziladi', async () => {
  const ids = await orderWithItem();

  let r = await move(ids, 'washing', SUP);
  assert.equal(r.statusCode, 400, 'kim bajargani tanlanmasa — rad');

  r = await move(ids, 'washing', SUP, { onBehalfOf: 'w1' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  let item = docs.get(`orders/${ids.orderId}/items/${ids.itemId}`);
  assert.equal(item.status, 'washing');
  assert.equal(item.washingBy, 'w1');

  r = await move(ids, 'packing', SUP, { onBehalfOf: 'w1' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  item = docs.get(`orders/${ids.orderId}/items/${ids.itemId}`);
  assert.equal(item.washedBy, 'w1');
  assert.deepEqual(docs.get(`orders/${ids.orderId}`).washedByEmployees, ['w1']);

  const washed = under(`dailyActivity/${today()}/events/`).filter((e) => e.type === 'washed');
  assert.equal(washed.length, 1);
  assert.equal(washed[0].employeeId, 'w1', 'kunlik hisob ishchiga');

  const events = under(`orders/${ids.orderId}/itemEvents/`).filter((e) => e.type === 'status');
  assert.ok(events.length >= 2);
  for (const e of events) {
    assert.equal(e.by, 'w1');
    assert.equal(e.role, 'worker');
    assert.equal(e.recordedBy, 'sup', 'kim qayd etgani saqlanadi');
  }
});

test('upakovka: huquqi yo\'q ishchi nomidan qayd etib bo\'lmaydi, huquqlisi bilan bo\'ladi', async () => {
  const ids = await orderWithItem();
  await move(ids, 'washing', SUP, { onBehalfOf: 'w1' });
  await move(ids, 'packing', SUP, { onBehalfOf: 'w1' });

  let r = await move(ids, 'ready', SUP, { onBehalfOf: 'w1' });
  assert.equal(r.statusCode, 403, JSON.stringify(r.body));
  assert.match(r.body.message, /Ali Yuvuvchi/, 'xato kimligini aytadi');

  r = await move(ids, 'ready', SUP, { onBehalfOf: 'w2' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(docs.get(`orders/${ids.orderId}/items/${ids.itemId}`).packedBy, 'w2');
});

test('qayta yuvish ham tanlangan ishchi nomidan; mutaxassislik mos kelishi shart', async () => {
  const ids = await orderWithItem();
  const itemPath = `orders/${ids.orderId}/items/${ids.itemId}`;
  docs.set(itemPath, { ...docs.get(itemPath), category: 'gilam' });
  await move(ids, 'washing', SUP, { onBehalfOf: 'w1' });
  await move(ids, 'packing', SUP, { onBehalfOf: 'w1' });
  let r = await move(ids, 'returned', SUP, { onBehalfOf: 'w2', qcNote: "Dog' qolgan" });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));

  r = await move(ids, 'washing', SUP, { onBehalfOf: 'w2' });
  assert.equal(r.statusCode, 403, 'parda mutaxassisi gilam yuvolmaydi');
  r = await move(ids, 'washing', SUP, { onBehalfOf: 'w1' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(docs.get(itemPath).washingBy, 'w1');
});

test("nazoratchi topshirishni (dastavchik ishi) qayd etmaydi; ishchi bo'lmagan xodimni tanlab bo'lmaydi; oddiy xodim boshqa nomidan yozolmaydi", async () => {
  const ids = await orderWithItem();
  let r = await move(ids, 'washing', SUP, { onBehalfOf: 'd1' });
  assert.equal(r.statusCode, 400);
  r = await move(ids, 'washing', WORKER, { onBehalfOf: 'w2' });
  assert.equal(r.statusCode, 403);

  const itemPath = `orders/${ids.orderId}/items/${ids.itemId}`;
  docs.set(itemPath, { ...docs.get(itemPath), status: 'ready' });
  r = await move(ids, 'done', SUP, { onBehalfOf: 'w1' });
  assert.equal(r.statusCode, 403);
});

/* ---------------------------- topshiriq ---------------------------- */

function seedOrders() {
  docs.set('orders/oNew', { orderNumber: 11, serviceType: 'pickup', status: 'new', customerName: 'A' });
  docs.set('orders/oReady', {
    orderNumber: 12,
    serviceType: 'pickup',
    status: 'brought_in',
    customerName: 'B',
    itemsMirror: [
      { id: 'i1', itemNumber: 1, status: 'ready' },
      { id: 'i2', itemNumber: 2, status: 'washing' },
      { id: 'i3', itemNumber: 3, status: 'ready' },
    ],
  });
  docs.set('orders/oDone', { orderNumber: 13, serviceType: 'pickup', status: 'done' });
  docs.set('orders/oSite', { orderNumber: 14, serviceType: 'onsite', status: 'new' });
}

const assign = (body, auth = SUP) => call(supervisorRouter, '/supervisorAssignDeliveries', { date: today(), ...body }, auth);

test('topshiriq: olib kelish va yetkazish turi buyurtma holatidan; tartib va dastavchik saqlanadi', async () => {
  seedOrders();
  const r = await assign({ driverId: 'd1', stops: [{ orderId: 'oReady', itemIds: ['i3'] }, { orderId: 'oNew' }], note: 'Avval Chilonzor' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const ready = docs.get('orders/oReady').assignment;
  assert.equal(ready.driverId, 'd1');
  assert.equal(ready.driverName, 'Akmal Dastavchik');
  assert.equal(ready.kind, 'delivery');
  assert.deepEqual(ready.itemIds, ['i3']);
  assert.equal(ready.seq, 0);
  assert.equal(ready.note, 'Avval Chilonzor');
  assert.equal(ready.assignedByName, 'Nodir Nazoratchi');
  const pick = docs.get('orders/oNew').assignment;
  assert.equal(pick.kind, 'pickup');
  assert.equal(pick.seq, 1);
});

test('topshiriq: mahsulot tanlanmasa hozir tayyorlarining hammasi; tayyor bo\'lmagani rad', async () => {
  seedOrders();
  let r = await assign({ driverId: 'd1', stops: [{ orderId: 'oReady' }] });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(docs.get('orders/oReady').assignment.itemIds, ['i1', 'i3']);

  r = await assign({ driverId: 'd1', stops: [{ orderId: 'oReady', itemIds: ['i2'] }] });
  assert.equal(r.statusCode, 412);
  assert.match(r.body.message, /12\/2/);
});

test("topshiriq qayta saqlanganda ro'yxatdan chiqqan buyurtmadan olib tashlanadi; bo'sh ro'yxat — bekor", async () => {
  seedOrders();
  await assign({ driverId: 'd1', stops: [{ orderId: 'oReady' }, { orderId: 'oNew' }] });
  let r = await assign({ driverId: 'd1', stops: [{ orderId: 'oReady' }] });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.cleared, 1);
  assert.equal(docs.get('orders/oNew').assignment, undefined);

  r = await assign({ driverId: 'd1', stops: [] });
  assert.equal(r.statusCode, 200);
  assert.equal(docs.get('orders/oReady').assignment, undefined);
});

test("topshiriq: noto'g'ri dastavchik, o'tgan sana, yakunlangan/joyida yuvish buyurtmasi va ruxsatsiz xodim rad etiladi", async () => {
  seedOrders();
  assert.equal((await assign({ driverId: 'w1', stops: [{ orderId: 'oNew' }] })).statusCode, 400);
  assert.equal((await assign({ driverId: 'd1', date: '2020-01-01', stops: [{ orderId: 'oNew' }] })).statusCode, 400);
  assert.equal((await assign({ driverId: 'd1', stops: [{ orderId: 'oDone' }] })).statusCode, 412);
  assert.equal((await assign({ driverId: 'd1', stops: [{ orderId: 'oSite' }] })).statusCode, 400);
  assert.equal((await assign({ driverId: 'd1', stops: [{ orderId: 'oNew' }, { orderId: 'oNew' }] })).statusCode, 400);
  assert.equal((await assign({ driverId: 'd1', stops: [{ orderId: 'oNew' }] }, WORKER)).statusCode, 403);
  assert.equal(docs.get('orders/oNew').assignment, undefined, 'hech narsa yozilmadi');
});

/* -------------------------- ogohlantirish -------------------------- */

test('ogohlantirish: tarixga va xodim hujjatiga yoziladi; xodim tanishgach o\'chadi', async () => {
  let r = await call(supervisorRouter, '/supervisorWarnEmployee', { employeeId: 'w1', text: 'Ishga kechikdingiz' }, SUP);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const id = r.body.warningId;
  assert.equal(docs.get(`warnings/${id}`).employeeId, 'w1');
  assert.equal(docs.get(`warnings/${id}`).createdByName, 'Nodir Nazoratchi');
  let pending = docs.get('employees/w1').pendingWarnings;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].text, 'Ishga kechikdingiz');

  r = await call(supervisorRouter, '/acknowledgeWarning', { warningId: id }, { uid: 'u2', employeeId: 'w2', role: 'worker' });
  assert.equal(r.statusCode, 404, 'boshqa xodimniki emas');

  r = await call(supervisorRouter, '/acknowledgeWarning', { warningId: id }, WORKER);
  assert.equal(r.statusCode, 200);
  assert.ok(docs.get(`warnings/${id}`).ackAt);
  assert.equal(docs.get('employees/w1').pendingWarnings.length, 0);

  r = await call(supervisorRouter, '/employeeWarnings', { employeeId: 'w1' }, SUP);
  assert.equal(r.body.warnings.length, 1);
  assert.ok(r.body.warnings[0].ackAt);
  assert.equal((await call(supervisorRouter, '/employeeWarnings', { employeeId: 'w1' }, WORKER)).statusCode, 403);
});

test("ogohlantirish: o'ziga, bo'sh matn va oddiy xodim tomonidan — rad", async () => {
  assert.equal((await call(supervisorRouter, '/supervisorWarnEmployee', { employeeId: 'sup', text: 'Matn' }, SUP)).statusCode, 400);
  assert.equal((await call(supervisorRouter, '/supervisorWarnEmployee', { employeeId: 'w1', text: '  ' }, SUP)).statusCode, 400);
  assert.equal((await call(supervisorRouter, '/supervisorWarnEmployee', { employeeId: 'w1', text: 'Matn' }, WORKER)).statusCode, 403);
});

/* ----------------------------- boshqa ------------------------------ */

test('"Boshqa" ro\'yxatida nazoratchi o\'z nomi bilan chiqadi; oddiy xodim xodim ishini ko\'ra olmaydi', async () => {
  const r = await call(authRouter, '/listEmployeesByDepartment', { department: 'other' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const sup = r.body.employees.find((e) => e.id === 'sup');
  assert.equal(sup.departmentLabel, 'Nazoratchi');
  assert.equal(sup.departmentKey, 'supervisor');
  assert.equal(r.body.employees.some((e) => e.id === 'w1'), false);

  const denied = await call(supervisorRouter, '/supervisorEmployeeActivity', { employeeId: 'w2' }, WORKER);
  assert.equal(denied.statusCode, 403);
  const ok = await call(supervisorRouter, '/supervisorEmployeeActivity', { employeeId: 'w2' }, SUP);
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.date, today());
});
