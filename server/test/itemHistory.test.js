const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { install, call, docs, under, reset, DIST } = require('./fakedb');

install();
const { ordersRouter } = require(DIST + 'routes/orders.js');
const { paymentsRouter } = require(DIST + 'routes/payments.js');

const DISP = { uid: 'ud', employeeId: 'disp', role: 'dispatcher' };
const ADMIN = { uid: 'ua', employeeId: 'adm', role: 'admin' };
const base = { customerName: 'Aziz', phone: '+998901112233', location: 'Yunusobod' };
const gilam = (price = 50000, name = 'Gilam') => ({ name, calcType: 'fixed', price, tariff: 'standard' });

beforeEach(() => {
  reset();
  docs.set('employees/disp', { fullName: 'Sotuvchi', department: 'dispatcher' });
  docs.set('employees/adm', { fullName: 'Admin' });
});

async function createOrder(body, auth = DISP) {
  const r = await call(ordersRouter, '/createOrder', body, auth);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.orderId ?? r.body.id;
}

const eventsOf = (orderId) =>
  under(`orders/${orderId}/itemEvents/`).sort((a, b) => a.at.toMillis() - b.at.toMillis() || a.id.localeCompare(b.id));
const itemIdOf = (orderId, n) => under(`orders/${orderId}/items/`).find((i) => i.itemNumber === n).id;

test("mahsulotsiz yaratilgan buyurtmada ham bo'sh nusxa; tarix bo'sh", async () => {
  for (const body of [
    { ...base, serviceType: 'pickup', notedItems: ['Gilam'] },
    { ...base, serviceType: 'pickup', walkIn: true },
    { ...base, serviceType: 'onsite', tariff: 'standard' },
  ]) {
    const id = await createOrder(body);
    const order = docs.get(`orders/${id}`);
    assert.deepEqual(order.itemsMirror, [], JSON.stringify(body));
    assert.equal(order.itemCount, 0);
    assert.equal(eventsOf(id).length, 0);
  }
});

test("yaratishda har bir mahsulot \"qo'shildi\" — o'sha paytdagi maydonlar bilan", async () => {
  const id = await createOrder({ ...base, serviceType: 'pickup', items: [gilam(50000), gilam(30000, 'Parda')] });
  const events = eventsOf(id);
  assert.equal(events.length, 2);
  for (const e of events) {
    assert.equal(e.type, 'created');
    assert.equal(e.by, 'disp');
    assert.equal(e.role, 'dispatcher');
    assert.ok(e.at, 'vaqt yozilgan');
  }
  const parda = events.find((e) => e.itemName === 'Parda');
  assert.equal(parda.itemNumber, 2);
  assert.equal(parda.snapshot.price, 30000);
  assert.equal(parda.snapshot.tariff, 'standard');
  assert.equal(parda.snapshot.name, 'Parda');
});

test("qo'shish: takroriy so'rov tarixni ikki marta yozmaydi", async () => {
  const id = await createOrder({ ...base, serviceType: 'pickup' });
  const actionId = 'A'.repeat(20);
  for (let i = 0; i < 2; i++) {
    const r = await call(ordersRouter, '/addOrderItems', { orderId: id, items: [gilam(70000)], actionId }, DISP);
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  }
  const events = eventsOf(id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'created');
  assert.equal(events[0].itemNumber, 1);
});

test("tahrirlash: faqat o'zgargan maydonlar; o'zgarishsiz tahrir yozilmaydi", async () => {
  const id = await createOrder({ ...base, serviceType: 'pickup', items: [gilam(50000)] });
  const itemId = itemIdOf(id, 1);
  let r = await call(ordersRouter, '/updateOrderItem', { orderId: id, itemId, item: gilam(65000, 'Gilam katta') }, DISP);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  r = await call(ordersRouter, '/updateOrderItem', { orderId: id, itemId, item: gilam(65000, 'Gilam katta') }, DISP);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));

  const updates = eventsOf(id).filter((e) => e.type === 'updated');
  assert.equal(updates.length, 1, "ikkinchi (bir xil) tahrir yozilmadi");
  const byField = Object.fromEntries(updates[0].changes.map((c) => [c.field, c]));
  assert.deepEqual(Object.keys(byField).sort(), ['name', 'price']);
  assert.equal(byField.price.from, 50000);
  assert.equal(byField.price.to, 65000);
  assert.equal(byField.name.to, 'Gilam katta');
});

test('holatlar: yuvish → upakovka → qaytarildi (izoh bilan) → … → yetkazildi (summa bilan)', async () => {
  const id = await createOrder({ ...base, serviceType: 'pickup', walkIn: true, items: [gilam(80000)] });
  const itemId = itemIdOf(id, 1);
  for (const [toStatus, extra] of [
    ['washing', {}],
    ['packing', {}],
    ['returned', { qcNote: "Dog' qolgan" }],
    ['washing', {}],
    ['packing', {}],
    ['ready', {}],
  ]) {
    const r = await call(ordersRouter, '/changeItemStatus', { orderId: id, itemId, toStatus, ...extra }, ADMIN);
    assert.equal(r.statusCode, 200, `${toStatus}: ${JSON.stringify(r.body)}`);
  }
  const r = await call(paymentsRouter, '/deliverOrderItems', { orderId: id, itemIds: [itemId], paidAmount: 80000 }, ADMIN);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));

  const statuses = eventsOf(id).filter((e) => e.type === 'status');
  assert.deepEqual(
    statuses.map((e) => `${e.fromStatus}>${e.toStatus}`),
    ['pending>washing', 'washing>packing', 'packing>returned', 'returned>washing', 'washing>packing', 'packing>ready', 'ready>done'],
  );
  assert.equal(statuses[2].note, "Dog' qolgan");
  assert.equal(statuses.at(-1).amount, 80000);
  assert.ok(statuses.every((e) => e.by === 'adm'));
});

test("o'chirish: mahsulot nima bo'lgani saqlanadi", async () => {
  const id = await createOrder({ ...base, serviceType: 'pickup', items: [gilam(50000), gilam(20000, 'Yostiq')] });
  const itemId = itemIdOf(id, 2);
  const r = await call(ordersRouter, '/deleteOrderItem', { orderId: id, itemId }, DISP);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const deleted = eventsOf(id).find((e) => e.type === 'deleted');
  assert.equal(deleted.itemId, itemId);
  assert.equal(deleted.itemName, 'Yostiq');
  assert.equal(deleted.snapshot.price, 20000);
});

test('rasm qo‘shildi / o‘chirildi — holati (eski/tayyor) bilan', async () => {
  const imagekit = require(DIST + 'lib/imagekit.js');
  const { photosRouter } = require(DIST + 'routes/photos.js');
  process.env.IMAGEKIT_PRIVATE_KEY = 'priv';
  process.env.IMAGEKIT_PUBLIC_KEY = 'pub';
  process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/selta';
  const id = await createOrder({ ...base, serviceType: 'pickup', items: [gilam(50000)] });
  const itemId = itemIdOf(id, 1);
  const file = { filePath: `/selta/orders/${id}/${itemId}/before_1.jpg`, url: 'https://ik.imagekit.io/selta/x.jpg', fileType: 'image', size: 1000 };
  imagekit.imageKitDeps.fetch = async (url, init = {}) =>
    init.method === 'DELETE'
      ? { ok: true, status: 204, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ fileId: 'f1', ...file }) };

  let r = await call(photosRouter, '/addItemPhoto', { orderId: id, itemId, state: 'before', fileId: 'f1' }, ADMIN);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  r = await call(photosRouter, '/addItemPhoto', { orderId: id, itemId, state: 'before', fileId: 'f1' }, ADMIN);
  r = await call(photosRouter, '/deleteItemPhoto', { orderId: id, itemId, fileId: 'f1' }, ADMIN);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));

  const photoEvents = eventsOf(id).filter((e) => e.type.startsWith('photo_'));
  assert.deepEqual(
    photoEvents.map((e) => `${e.type}:${e.photoState}`),
    ['photo_added:before', 'photo_removed:before'],
    'takroriy qo‘shish yozilmadi',
  );
});
