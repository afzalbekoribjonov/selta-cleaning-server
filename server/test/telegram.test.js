const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { install, docs, reset, DIST, Timestamp } = require('./fakedb');

install();
const text = require(DIST + 'lib/telegram/text.js');
const access = require(DIST + 'lib/telegram/access.js');
const { buildDayReport, computeDayReport, toRawOrder } = require(DIST + 'lib/telegram/dayReport.js');
const { renderDayReport } = require(DIST + 'lib/telegram/reportMessages.js');
const orderLookup = require(DIST + 'lib/telegram/orderLookup.js');
const { createBot } = require(DIST + 'lib/telegram/bot.js');
const { TelegramApi, TelegramError } = require(DIST + 'lib/telegram/api.js');
const { businessDateString, businessDayRangeUtc } = require(DIST + 'lib/businessTime.js');

const DAY = '2026-11-06';
const at = (h, m = 0) => new Date(businessDayRangeUtc(DAY).start.getTime() + (h * 60 + m) * 60_000);
const ts = (h, m = 0) => Timestamp.fromDate(at(h, m));

beforeEach(() => {
  reset();
  orderLookup.clearOrderCache();
  access.invalidateBotUsersCache();
});

// ------------------------------------------------------------------ MATN

test("pul, hajm va sana formati", () => {
  assert.equal(text.money(1250000), '1 250 000 so\'m');
  assert.equal(text.money(-50000.4), '−50 000 so\'m');
  assert.equal(text.qty(186.5), '186,5');
  assert.equal(text.qty(12), '12');
  assert.equal(text.qty(0), '0');
  assert.equal(text.qty(2.345), '2,35');
  assert.equal(text.longDateOfKey('2026-11-06'), '6-noyabr, 2026 · Juma');
  assert.equal(text.esc('<b>&'), '&lt;b&gt;&amp;');
});

test("lotin -> kirill: so'zlar, ismlar, teglar va buyruqlar", () => {
  const c = text.toCyrillic;
  assert.equal(c("Yo'q"), 'Йўқ');
  assert.equal(c("Qo'lida naqd: 1 000 so'm"), 'Қўлида нақд: 1 000 сўм');
  assert.equal(c("Muhammadali Abdurahmonov O'g'li"), 'Муҳаммадали Абдураҳмонов Ўғли');
  assert.equal(c('Yetkazildi · Chegirma · Shanba'), 'Етказилди · Чегирма · Шанба');
  assert.equal(c("ma'lumot"), 'маълумот');
  assert.equal(c('eski ertaga'), 'эски эртага');
  assert.equal(c('Yusupov Yoqub'), 'Юсупов Ёқуб');
  assert.equal(c('⚡ EXPRESS · Premium · m² 12 · kg 3'), '⚡ ЭКСПРЕСС · Премиум · м² 12 · кг 3');
  assert.equal(c("TARIFLAR BO'YICHA"), 'ТАРИФЛАР БЎЙИЧА');
  assert.equal(c('6-sentabr, 7-oktabr, noyabr'), '6-сентябр, 7-октябр, ноябр');
  // Teglar, belgilar va buyruqlar o'zgarmaydi.
  assert.equal(c('<b>Jami</b> &amp; /hisobot #1245/2'), '<b>Жами</b> &amp; /hisobot #1245/2');
  assert.equal(c('<code>1245</code> ID'), '<code>1245</code> ID');
});

test("uzun matn bloklar bo'yicha bo'linadi, teglar uzilmaydi", () => {
  const block = (i) => `<b>Blok ${i}</b>\n` + 'x'.repeat(900);
  const parts = text.packBlocks(Array.from({ length: 10 }, (_, i) => block(i)), 3900);
  assert.ok(parts.length >= 3);
  for (const p of parts) {
    assert.ok(p.length <= 3900);
    assert.equal((p.match(/<b>/g) ?? []).length, (p.match(/<\/b>/g) ?? []).length);
  }
  assert.equal(parts.join('\n\n').match(/<b>Blok/g).length, 10);
  // Bitta juda katta blok — qatorlari bo'yicha.
  const huge = Array.from({ length: 300 }, (_, i) => `qator ${i} ` + 'y'.repeat(40)).join('\n');
  const split = text.packBlocks([huge], 3900);
  assert.ok(split.length > 1 && split.every((p) => p.length <= 3900));
});

// ---------------------------------------------------------------- RUXSAT

test("username yoki ID tekshiruvi", () => {
  assert.deepEqual(access.parseIdentifier('@Ali_Valiyev'), { username: 'ali_valiyev' });
  assert.deepEqual(access.parseIdentifier('https://t.me/ali_valiyev'), { username: 'ali_valiyev' });
  assert.deepEqual(access.parseIdentifier(' 123456789 '), { userId: 123456789 });
  assert.equal(access.parseIdentifier('@ab'), null);
  assert.equal(access.parseIdentifier('1abcde'), null);
  assert.equal(access.parseIdentifier(''), null);
  assert.equal(access.parseIdentifier(42), null);
});

test("ruxsat: ID ustun, bog'langan username boshqa odamni o'tkazmaydi", () => {
  const users = [
    { key: 'a', username: 'boss', userId: null },
    { key: 'b', username: 'manager', userId: 777 },
    { key: 'c', username: null, userId: 555 },
  ];
  assert.equal(access.matchBotUser(users, { id: 1, username: 'Boss' }).key, 'a');
  assert.equal(access.matchBotUser(users, { id: 555 }).key, 'c');
  assert.equal(access.matchBotUser(users, { id: 777, username: 'other' }).key, 'b');
  // "manager" username'ini boshqa odam egallagan — o'tmaydi.
  assert.equal(access.matchBotUser(users, { id: 999, username: 'manager' }), null);
  assert.equal(access.matchBotUser(users, { id: 2 }), null);
  assert.equal(access.matchBotUser(users, { id: 555, is_bot: true }), null);
  assert.equal(access.matchBotUser(users, undefined), null);
});

test("admin ro'yxati: qo'shish, takrorni rad etish, bog'lash, o'chirish", async () => {
  const added = await access.addBotUser('@Direktor_01', 'Direktor');
  assert.equal(added.username, 'direktor_01');
  await assert.rejects(access.addBotUser('direktor_01', ''), /allaqachon/);
  await assert.rejects(access.addBotUser('@x', ''), /Username/);
  await access.addBotUser('123456789', '');

  await access.bindBotUser(added.key, { id: 4242, first_name: 'Akmal', last_name: 'Qodirov', username: 'direktor_01' });
  let users = await access.loadBotUsers(true);
  const bound = users.find((u) => u.key === added.key);
  assert.equal(bound.userId, 4242);
  assert.equal(bound.linkedName, 'Akmal Qodirov');
  assert.ok(bound.linkedAt instanceof Date);

  await access.setBotUserLang(added.key, 'cyrl');
  users = await access.loadBotUsers(true);
  assert.equal(users.find((u) => u.key === added.key).lang, 'cyrl');

  // ID bilan kiritilgan hisob: begona ID bog'lanmaydi, egasining ismi bir marta yoziladi.
  const byId = users.find((u) => u.userId === 123456789);
  await access.bindBotUser(byId.key, { id: 999, first_name: 'Begona' });
  await access.bindBotUser(byId.key, { id: 123456789, first_name: 'Rustam' });
  await access.bindBotUser(byId.key, { id: 123456789, first_name: 'Boshqa ism' });
  users = await access.loadBotUsers(true);
  assert.equal(users.find((u) => u.key === byId.key).linkedName, 'Rustam');
  // Boshqa yozuvga bog'langan ID ikkinchi yozuvga bog'lanmaydi.
  const extra = await access.addBotUser('@second_user', '');
  await access.bindBotUser(extra.key, { id: 4242, username: 'second_user' });
  users = await access.loadBotUsers(true);
  assert.equal(users.find((u) => u.key === extra.key).userId, null);
  await access.removeBotUser(extra.key);

  await access.removeBotUser(added.key);
  users = await access.loadBotUsers(true);
  assert.equal(users.length, 1);
  await assert.rejects(access.removeBotUser('yoq'), /topilmadi/);
});

// ------------------------------------------------------------- HISOBOT

function employees() {
  return new Map([
    ['disp', { name: 'Madina Sobirova', department: 'dispatcher', status: 'active' }],
    ['disp2', { name: 'Zarina Ahmedova', department: 'dispatcher', status: 'active' }],
    ['w1', { name: 'Bobur Aliyev', department: 'worker', status: 'active' }],
    ['w2', { name: 'Sherzod Karimov', department: 'worker', status: 'active' }],
    ['d1', { name: 'Akmal Qodirov', department: 'delivery', status: 'active' }],
    ['old', { name: 'Eski Xodim', department: 'worker', status: 'terminated' }],
  ]);
}

function sampleInput() {
  const order = (id, number, extra = {}) => ({
    id,
    orderNumber: number,
    serviceType: 'pickup',
    tariff: null,
    createdBy: 'disp',
    createdAtKey: null,
    pickedUpBy: '',
    pickedUpAtKey: null,
    intakeMethod: null,
    itemCount: 0,
    totalPrice: 0,
    itemTariffs: new Map(),
    items: [],
    ...extra,
  });
  const orders = new Map([
    ['o1', order('o1', 1201, {
      createdAtKey: DAY, pickedUpBy: 'd1', pickedUpAtKey: DAY, itemCount: 3,
      itemTariffs: new Map([['i1', 'express'], ['i2', 'standart'], ['i3', 'Standard']]),
      items: [
        { id: 'i1', name: 'Gilam', calcType: 'sqm', qty: 6.5, price: 195000 },
        { id: 'i2', name: 'Parda', calcType: 'meter', qty: 4, price: 60000 },
        { id: 'i3', name: ' yostiq ', calcType: 'count', qty: 2, price: 0 },
      ],
    })],
    ['o2', order('o2', 1199, { createdAtKey: DAY, createdBy: 'sup' })],
    ['o3', order('o3', 1180, { itemTariffs: new Map([['j1', 'premium']]) })],
    ['o4', order('o4', 1210, { createdAtKey: DAY, pickedUpBy: 'disp', pickedUpAtKey: DAY, intakeMethod: 'walk_in', itemCount: 1 })],
  ]);
  const NAMES = { i1: 'Gilam', i2: 'Parda', i3: 'Yostiq', j1: 'Adyol' };
  const ev = (type, orderId, orderNumber, itemId, calcType, qty, price, employeeId, extra = {}) => ({
    type, orderId, orderNumber, itemId, itemName: NAMES[itemId] ?? null, calcType, qty, price, employeeId,
    collectedAmount: null, cashAmount: null, cardAmount: null, ...extra,
  });
  const events = [
    ev('washed', 'o1', 1201, 'i1', 'sqm', 6.5, 195000, 'w1'),
    ev('washed', 'o1', 1201, 'i2', 'meter', 4, 60000, 'w1'),
    ev('washed', 'o1', 1201, 'i3', 'count', 2, 40000, 'w2'),
    ev('packed', 'o1', 1201, 'i1', 'sqm', 6.5, 195000, 'w2'),
    ev('delivered', 'o3', 1180, 'j1', 'kg', 3.5, 70000, 'd1', { collectedAmount: 50000, cashAmount: 30000, cardAmount: 20000 }),
    ev('settled', 'o9', 1100, null, null, null, null, 'd1', { collectedAmount: 15000, cashAmount: 15000, cardAmount: 0 }),
    ev('onsite_done', 'o8', 1150, null, null, null, 300000, 'w2', { collectedAmount: 300000 }),
  ];
  return {
    dateKey: DAY,
    now: at(14, 35),
    events,
    orders,
    payments: [
      { employeeId: 'd1', kind: 'discount', shortfall: 20000 },
      { employeeId: 'd1', kind: 'full', shortfall: 0 },
      { employeeId: 'd1', kind: 'debt', shortfall: 10000 },
    ],
    expenses: [
      { employeeId: 'd1', name: 'Benzin', amount: 5000, fromCash: true },
      { employeeId: 'd1', name: 'Taksi', amount: 9999, fromCash: false },
      { employeeId: '', name: 'Yuvish vositasi', amount: 100000, fromCash: false },
    ],
    employees: employees(),
  };
}

test("kunlik hisobot: sonlar, hajm, tarif, xodimlar va kassa aniq", () => {
  const r = buildDayReport(sampleInput());

  assert.equal(r.created.orders, 3);
  assert.equal(r.intake.orders, 2);
  assert.equal(r.washed.items, 3);
  assert.deepEqual(r.washed.units, { sqm: 6.5, meter: 4, kg: 0, dona: 2 });
  assert.equal(r.washed.price, 295000);
  assert.equal(r.packed.items, 1);
  assert.equal(r.delivered.orderIds.size, 1);
  assert.equal(r.onsiteDone.orders, 1);

  // Tariflar: barcha to'rttasi doim bor; "Standard" -> standart.
  assert.deepEqual([...r.tariffs.keys()], ['express', 'comfort', 'standart', 'premium']);
  assert.equal(r.tariffs.get('express').washed.units.sqm, 6.5);
  assert.equal(r.tariffs.get('standart').washed.items, 2);
  assert.equal(r.tariffs.get('standart').washed.units.dona, 2);
  assert.equal(r.tariffs.get('premium').delivered.units.kg, 3.5);
  assert.equal(r.tariffs.get('comfort').washed.items, 0);

  // Ishchilar: ishsizi ham ro'yxatda, bo'shatilgani yo'q.
  const w1 = r.workers.find((w) => w.id === 'w1');
  assert.equal(w1.washed.items, 2);
  assert.equal(w1.washedByTariff.get('express').items, 1);
  assert.equal(r.workers.find((w) => w.id === 'w2').packed.items, 1);
  assert.equal(r.workers.find((w) => w.id === 'w2').onsite.orders, 1);
  assert.ok(!r.workers.some((w) => w.id === 'old'));

  // Dastavchik: olib kelgan (walk_in hisobga olinmaydi), pul, chegirma, chiqim.
  const d1 = r.drivers.find((d) => d.id === 'd1');
  assert.deepEqual(d1.pickedUpOrderNumbers, [1201]);
  assert.equal(d1.collected, 65000);
  assert.equal(d1.card, 20000);
  assert.equal(d1.cash, 45000);
  assert.equal(d1.cashInHand, 40000);
  assert.deepEqual(d1.discount, { count: 1, amount: 20000 });
  assert.deepEqual(d1.debt, { count: 1, amount: 10000 });
  // Joyida yuvishda pul olgan ishchi ham kassa ro'yxatida.
  assert.equal(r.drivers.find((d) => d.id === 'w2').cashInHand, 300000);
  assert.ok(!r.drivers.some((d) => d.id === 'disp'));

  // Sotuv menejerlari: buyurtma ochmagani ham bor; boshqa bo'lim ham ko'rinadi.
  assert.deepEqual(r.dispatchers.find((d) => d.id === 'disp').orderNumbers, [1201, 1210]);
  assert.deepEqual(r.dispatchers.find((d) => d.id === 'disp2').orderNumbers, []);
  assert.equal(r.dispatchers.find((d) => d.id === 'sup').isDispatcher, false);

  assert.equal(r.money.collected, 365000);
  assert.equal(r.money.discount, 20000);
  assert.equal(r.money.debt, 10000);

  // Kunlik kassadan chiqimlar ayiriladi (xodimniki va adminniki).
  assert.equal(r.money.expenses.total, 114999);
  assert.equal(r.money.net, 365000 - 114999);
  assert.deepEqual(r.money.expenses.items.map((x) => [x.name, x.who]), [
    ['Yuvish vositasi', null],
    ['Taksi', 'Akmal Qodirov'],
    ['Benzin', 'Akmal Qodirov'],
  ]);

  // Mahsulot nomlari bo'yicha: sexga keldi (nusxadan) va bosqichlar; nom bo'shliq/registrsiz birlashadi.
  const gilam = r.products.find((p) => p.name === 'Gilam');
  assert.equal(gilam.intake.items, 1);
  assert.equal(gilam.intake.units.sqm, 6.5);
  assert.equal(gilam.washed.items, 1);
  assert.equal(gilam.packed.items, 1);
  const yostiq = r.products.filter((p) => p.name.toLowerCase() === 'yostiq');
  assert.equal(yostiq.length, 1);
  assert.equal(yostiq[0].intake.items, 1);
  assert.equal(yostiq[0].washed.units.dona, 2);
  assert.equal(r.products.find((p) => p.name === 'Adyol').delivered.units.kg, 3.5);
  // Butun buyurtma yozuvlari (joyida yuvish, yopilgan qarz) mahsulot emas.
  assert.equal(r.products.length, 4);
  assert.equal(r.products[0].name, 'Gilam');
});

function tagsBalanced(s) {
  for (const tag of ['b', 'i', 'code']) {
    assert.equal((s.match(new RegExp(`<${tag}>`, 'g')) ?? []).length, (s.match(new RegExp(`</${tag}>`, 'g')) ?? []).length, `${tag}: ${s}`);
  }
}

test("hisobot xabarlari: 7 ta, har biri o'z qatorida, nollar yashirilmaydi, HTML to'g'ri, ikkala yozuvda", () => {
  const r = buildDayReport(sampleInput());
  const latn = renderDayReport(r, 'latn');
  assert.equal(latn.length, 7);
  for (const group of latn) {
    assert.ok(group.length >= 1);
    for (const m of group) {
      assert.ok(m.length <= 4096);
      tagsBalanced(m);
    }
  }
  const all = latn.map((g) => g.join('\n\n'));
  const [summary, washed, dispatchers, workers, tariffs, drivers, products] = all.map((t) => t.replace(/\u00A0/g, ' '));
  // Daraxt belgilari yo'q; birliklar bitta qatorga tiqilmagan.
  for (const t of all) {
    assert.equal(/[├└]/.test(t), false, 'daraxt belgisi qolgan');
    assert.equal(/m² [\d,]+ · metr/.test(t), false, 'birliklar bitta qatorda');
  }
  assert.match(summary, /Qabul qilindi — <b>3 ta<\/b>/);
  assert.match(summary, /14:35 holatiga/);
  assert.match(summary, /Tushum — <b>365 000 so'm<\/b>/);
  assert.match(summary, /Chiqimlar — <b>114 999 so'm<\/b>\n {4}Yuvish vositasi — 100 000 so'm\n {4}Taksi <i>\(Akmal Qodirov\)<\/i>/);
  assert.match(summary, /<b>Qoldiq — 250 001 so'm<\/b>/);
  assert.match(washed, /<b>Comfort<\/b> — 0 ta\n {4}m² — 0\n {4}metr — 0\n {4}kg — 0\n {4}dona — 0/);
  assert.match(washed, /<b>Hajm<\/b>\n {4}m² — 6,5\n {4}metr — 4\n {4}kg — 0\n {4}dona — 2/);
  assert.match(dispatchers, /<b>Madina Sobirova<\/b> — <b>2 ta<\/b>\n {4}#1201, #1210/);
  assert.match(dispatchers, /<b>Zarina Ahmedova<\/b>\n {4}Bugun buyurtma ochmadi/);
  assert.match(workers, /<b>Bobur Aliyev<\/b>\nYuvdi — <b>2 ta<\/b> · 255 000 so'm\n {4}hajm — 6,5 m² \+ 4 metr\n {4}Express — 1 ta · 6,5 m² · 195 000 so'm/);
  assert.match(tariffs, /<b>PREMIUM<\/b>\nYuvildi — 0 ta\nQadoqlandi — 0 ta\nYetkazildi — <b>1 ta<\/b> · 70 000 so'm\n {4}hajm — 3,5 kg/);
  assert.match(drivers, /<b>Akmal Qodirov<\/b>[\s\S]* {4}chegirma — 20 000 so'm \(1 ta\)[\s\S]*<b>Qo'lida naqd — 40 000 so'm<\/b>/);
  assert.match(drivers, /<b>Sherzod Karimov<\/b> <i>\(Ishchi\)<\/i>/);
  assert.match(drivers, /┈+\n\n<b>/);
  assert.match(products, /MAHSULOTLAR BO'YICHA/);
  assert.match(products, /<b>Gilam<\/b>\nSexga keldi — <b>1 ta<\/b> · 6,5 m² · 195 000 so'm\nYuvildi — <b>1 ta<\/b> · 6,5 m² · 195 000 so'm\nQadoqlandi — <b>1 ta<\/b>/);
  // O'lchanmagan (narxi 0) mahsulot narxsiz ko'rsatiladi.
  assert.match(products, /<b>Yostiq<\/b>\nSexga keldi — <b>1 ta<\/b> · 2 dona\n/);

  const cyrl = renderDayReport(r, 'cyrl').map((g) => g.join('\n\n')).join('\n');
  tagsBalanced(cyrl);
  assert.match(cyrl, /КУНЛИК ҲИСОБОТ/);
  assert.match(cyrl, /Акмал Қодиров/);
  // Teg va buyruqlardan tashqari lotin harfi qolmagan (ID va m² dan boshqa).
  const stripped = cyrl.replace(/<[^>]+>/g, '').replace(/ID/g, '');
  assert.equal(/[A-Za-z]/.test(stripped), false, stripped.match(/.{0,20}[A-Za-z].{0,20}/)?.[0]);
});

test("hisobot bazadan o'qiladi (createdAt/pickedUpAt kuni, to'lov, chiqim, tarif nusxasi)", async () => {
  docs.set('employees/w1', { fullName: 'Bobur Aliyev', department: 'worker', status: 'active' });
  docs.set('employees/d1', { fullName: 'Akmal Qodirov', department: 'delivery', status: 'active' });
  docs.set('orders/o1', {
    orderNumber: 1201, serviceType: 'pickup', createdBy: 'd1', createdAt: ts(9), pickedUpBy: 'd1', pickedUpAt: ts(10), itemCount: 1,
    itemsMirror: [{ id: 'i1', tariff: 'express', itemNumber: 1 }],
  });
  docs.set('orders/old', { orderNumber: 1100, createdAt: Timestamp.fromDate(new Date(at(0).getTime() - 3600_000)), itemsMirror: [{ id: 'k1', tariff: 'premium' }] });
  docs.set(`dailyActivity/${DAY}/events/washed__i1__${DAY}`, { type: 'washed', orderId: 'o1', orderNumber: 1201, itemId: 'i1', calcType: 'sqm', qty: 5, price: 100000, employeeId: 'w1' });
  docs.set(`dailyActivity/${DAY}/events/delivered__k1__${DAY}`, { type: 'delivered', orderId: 'old', orderNumber: 1100, itemId: 'k1', calcType: 'fixed', price: 30000, employeeId: 'd1', collectedAmount: 30000 });
  docs.set('payments/p1', { dateKey: DAY, employeeId: 'd1', kind: 'discount', shortfall: 5000 });
  docs.set('expenses/x1', { dateKey: DAY, date: ts(12), employeeId: 'd1', amount: 2000, fromCash: true, name: 'Benzin' });
  docs.set('expenses/a1', { date: ts(13), amount: 50000, name: 'Kukun', recurring: false });
  docs.set('expenses/a2', { date: ts(13), amount: 3000000, name: 'Ijara', recurring: true });
  docs.set('expenses/a3', { date: Timestamp.fromDate(new Date(at(0).getTime() - 3600_000)), amount: 70000, name: 'Kechagi', recurring: false });

  const r = await computeDayReport(DAY, at(15));
  assert.equal(r.created.orders, 1);
  assert.equal(r.intake.orders, 1);
  assert.equal(r.tariffs.get('express').washed.units.sqm, 5);
  // Kecha ochilgan buyurtmaning tarifi alohida o'qib olinadi.
  assert.equal(r.tariffs.get('premium').delivered.items, 1);
  const d1 = r.drivers.find((d) => d.id === 'd1');
  assert.equal(d1.cashInHand, 28000);
  assert.equal(d1.discount.amount, 5000);
  // Adminning bugungi bir martalik chiqimi kiradi; takrorlanuvchi va kechagisi — yo'q.
  assert.deepEqual(r.money.expenses.items.map((x) => x.name), ['Kukun', 'Benzin']);
  assert.equal(r.money.net, 30000 - 52000);
});

// --------------------------------------------------------- BUYURTMA

function orderDoc(extra = {}) {
  return {
    orderNumber: 1245,
    customerName: 'Dilnoza <Karimova>',
    phone: '+998901234567',
    location: 'Yunusobod 4-mavze',
    serviceType: 'pickup',
    status: 'brought_in',
    createdBy: 'disp',
    createdAt: ts(9, 0),
    pickedUpBy: 'd1',
    pickedUpAt: ts(11, 0),
    totalPrice: 255000,
    itemCount: 3,
    itemsMirror: [
      { id: 'i1', itemNumber: 1, name: 'Gilam', calcType: 'sqm', qty: 6.5, width: 2.5, height: 2.6, price: 195000, tariff: 'express', status: 'ready', createdAt: ts(9, 1), washedBy: 'w1', washedAt: ts(12), packedBy: 'w2', packedAt: ts(13) },
      { id: 'i2', itemNumber: 2, name: 'Parda', calcType: 'meter', qty: 4, price: 60000, tariff: 'standart', status: 'washing', washingBy: 'w1', washingAt: ts(12, 30) },
      { id: 'i3', itemNumber: 3, name: 'Yostiq', calcType: 'size', sizeVariant: 'large', price: 0, status: 'pending' },
    ],
    ...extra,
  };
}

test("buyurtma bitta o'qish bilan (nusxadan) va keshdan", async () => {
  docs.set('orders/ord1', orderDoc());
  const view = await orderLookup.findOrderByNumber(1245);
  assert.equal(view.items.length, 3);
  assert.equal(view.items[0].washedBy, 'w1');
  // Bazadan o'chirilsa ham kesh javob beradi (qayta o'qilmaydi).
  docs.delete('orders/ord1');
  assert.equal((await orderLookup.findOrderByNumber(1245)).id, 'ord1');
  assert.equal((await orderLookup.getOrderView('ord1')).id, 'ord1');
  assert.equal(await orderLookup.findOrderByNumber(9999), null);
});

test("nusxa to'liq bo'lmasa mahsulotlar jamlanmasi o'qiladi", async () => {
  docs.set('orders/ord2', orderDoc({ orderNumber: 1300, itemsMirror: undefined, itemCount: 1 }));
  docs.set('orders/ord2/items/x1', { itemNumber: 1, name: 'Kurpa', calcType: 'count', qty: 2, price: 50000, status: 'pending', addedBy: 'w1' });
  const view = await orderLookup.findOrderByNumber(1300);
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0].addedBy, 'w1');
});

// ------------------------------------------------------------------ BOT

function fakeApi() {
  const calls = [];
  let nextId = 100;
  const transport = async (method, params) => {
    calls.push({ method, params });
    if (method === 'sendMessage') return { message_id: nextId++, chat: { id: params.chat_id, type: 'private' }, text: params.text };
    return true;
  };
  return { api: new TelegramApi(transport), calls };
}

function makeBot(overrides = {}) {
  const { api, calls } = fakeApi();
  const state = {
    users: [{ key: 'u1', username: 'boss', userId: null, label: '', lang: 'latn' }],
    bound: [],
    langs: [],
    reportCalls: 0,
  };
  docs.set('orders/ord1', orderDoc());
  const bot = createBot({
    api,
    loadUsers: async () => state.users,
    bindUser: async (key, from) => state.bound.push({ key, id: from.id }),
    setUserLang: async (key, lang) => state.langs.push({ key, lang }),
    loadReport: async () => {
      state.reportCalls += 1;
      return buildDayReport(sampleInput());
    },
    findOrderByNumber: orderLookup.findOrderByNumber,
    getOrder: orderLookup.getOrderView,
    loadEmployees: async () => employees(),
    now: () => at(14, 35),
    messageGapMs: 0,
    log: () => {},
    ...overrides,
  });
  return { bot, calls, state };
}

let updateId = 1;
const msg = (textValue, from = { id: 4242, first_name: 'Akmal', username: 'Boss' }, chatType = 'private') => ({
  update_id: updateId++,
  message: { message_id: updateId, from, chat: { id: from.id, type: chatType }, text: textValue },
});
const press = (data, messageId = 100, from = { id: 4242, username: 'boss' }) => ({
  update_id: updateId++,
  callback_query: { id: `cb${updateId}`, from, data, message: { message_id: messageId, chat: { id: from.id, type: 'private' } } },
});
const sent = (calls) => calls.filter((c) => c.method === 'sendMessage');

test("ro'yxatda yo'q hisob va guruh — hech qanday javob yo'q", async () => {
  const { bot, calls } = makeBot();
  await bot.handleUpdate(msg('/start', { id: 1, first_name: 'Begona', username: 'stranger' }));
  await bot.handleUpdate(msg('/hisobot', { id: 2 }));
  await bot.handleUpdate(press('h:latn:2026-11-06', 5, { id: 3, username: 'stranger' }));
  await bot.handleUpdate(msg('/start', { id: 4242, username: 'boss' }, 'group'));
  assert.equal(calls.length, 0);
});

test("/start: hisob bog'lanadi, salom va shaxsiy buyruqlar menyusi", async () => {
  const { bot, calls, state } = makeBot();
  const start = msg('/start');
  await bot.handleUpdate(start);
  await bot.handleUpdate(start); // takroriy yangilanish e'tiborsiz
  assert.deepEqual(state.bound, [{ key: 'u1', id: 4242 }]);
  const greet = sent(calls);
  assert.equal(greet.length, 1);
  assert.match(greet[0].params.text, /Assalomu alaykum, <b>Akmal<\/b>/);
  assert.match(greet[0].params.text, /\/hisobot/);
  assert.equal(greet[0].params.parse_mode, 'HTML');
  const menu = calls.find((c) => c.method === 'setMyCommands');
  assert.deepEqual(menu.params.scope, { type: 'chat', chat_id: 4242 });
});

test("/hisobot: yozuv tanlanadi, 6 ta hisobot alohida yuboriladi", async () => {
  const { bot, calls, state } = makeBot();
  await bot.handleUpdate(msg('/hisobot'));
  const prompt = sent(calls)[0];
  const buttons = prompt.params.reply_markup.inline_keyboard[0].map((b) => b.callback_data);
  assert.deepEqual(buttons, [`h:latn:${businessDateString(at(14, 35))}`, `h:cyrl:${businessDateString(at(14, 35))}`]);

  calls.length = 0;
  await bot.handleUpdate(press(`h:cyrl:${DAY}`, 100));
  // Hisobot ketayotganda yana bosilsa — ikkinchisi boshlanmaydi.
  await bot.handleUpdate(press(`h:cyrl:${DAY}`, 100));
  await bot.idle();

  assert.equal(state.reportCalls, 1);
  assert.deepEqual(state.langs, [{ key: 'u1', lang: 'cyrl' }]);
  const answers = calls.filter((c) => c.method === 'answerCallbackQuery');
  assert.equal(answers.length, 2);
  assert.match(answers[1].params.text, /Ҳисобот тайёрланмоқда/);

  const reports = sent(calls);
  assert.ok(reports.length >= 7, `xabarlar: ${reports.length}`);
  assert.match(reports[0].params.text, /КУНЛИК ҲИСОБОТ/);
  assert.match(reports[reports.length - 1].params.text, /МАҲСУЛОТЛАР БЎЙИЧА/);
  const edits = calls.filter((c) => c.method === 'editMessageText').map((c) => c.params.text);
  assert.match(edits[0], /тайёрланмоқда/);
  assert.match(edits[edits.length - 1], /Ҳисобот юборилди/);
});

test("/hisobot sana bilan: kecha, sana; kelajak — rad", async () => {
  const { bot, calls } = makeBot();
  await bot.handleUpdate(msg('/hisobot kecha'));
  assert.match(sent(calls)[0].params.reply_markup.inline_keyboard[0][0].callback_data, /^h:latn:2026-11-05$/);
  await bot.handleUpdate(msg('/hisobot 01.11.2026'));
  assert.match(sent(calls)[1].params.text, /1-noyabr kungi hisobot/);
  await bot.handleUpdate(msg('/hisobot 2027-01-01'));
  assert.match(sent(calls)[2].params.text, /Sana noto'g'ri/);
});

test("hisobot xatosi — tushunarli xabar va qayta urinish tugmasi, bot ishlayveradi", async () => {
  const { bot, calls } = makeBot({ loadReport: async () => { throw new Error('quota'); } });
  await bot.handleUpdate(press(`h:latn:${DAY}`, 100));
  await bot.idle();
  const last = calls.filter((c) => c.method === 'editMessageText').pop();
  assert.match(last.params.text, /tayyorlab bo'lmadi/);
  assert.equal(last.params.reply_markup.inline_keyboard[0][0].callback_data, `h:latn:${DAY}`);
  calls.length = 0;
  await bot.handleUpdate(msg('/start'));
  assert.equal(sent(calls).length, 1);
});

test("/id: so'raydi, buyurtmani tugmalar bilan ko'rsatadi, mahsulot va ortga", async () => {
  const { bot, calls } = makeBot();
  await bot.handleUpdate(msg('/id'));
  assert.match(sent(calls)[0].params.text, /Buyurtma ID raqamini yuboring/);

  calls.length = 0;
  await bot.handleUpdate(msg('1245'));
  const order = sent(calls)[0];
  assert.match(order.params.text, /BUYURTMA #1245/);
  assert.match(order.params.text, /Dilnoza &lt;Karimova&gt;/);
  assert.match(order.params.text, /\+998 90 123 45 67/);
  assert.match(order.params.text, /6,5 m² \(2,5×2,6\)/);
  assert.match(order.params.text, /Holati — <b>🏭 Sexda · 1\/3 tayyor<\/b>/);
  assert.equal(/[├└]/.test(order.params.text), false);
  tagsBalanced(order.params.text);
  const kb = order.params.reply_markup.inline_keyboard;
  assert.deepEqual(kb[0].map((b) => b.text), ['1245/1', '1245/2']);
  assert.deepEqual(kb[1].map((b) => b.text), ['1245/3']);
  assert.equal(kb[2][0].callback_data, 'r:ord1');
  for (const row of kb) for (const b of row) assert.ok(Buffer.byteLength(b.callback_data) <= 64);

  calls.length = 0;
  await bot.handleUpdate(press(kb[0][0].callback_data, 100));
  const item = calls.find((c) => c.method === 'editMessageText');
  assert.match(item.params.text, /1245\/1 · Gilam/);
  const itemText = item.params.text.replace(/\u00A0/g, ' ');
  assert.match(itemText, /Yuvdi — <b>Bobur Aliyev<\/b>\n {4}6-noyabr, 12:00/);
  assert.match(itemText, /Qadoqladi — <b>Sherzod Karimov<\/b>/);
  assert.match(itemText, /Qo'shdi — <b>Madina Sobirova<\/b>/);
  assert.match(itemText, /Topshirdi — <i>hali yo'q<\/i>/);
  const nav = item.params.reply_markup.inline_keyboard;
  assert.deepEqual(nav[0].map((b) => b.text), ['1245/2 ▶️']);
  assert.equal(nav[1][0].callback_data, 'o:ord1');

  calls.length = 0;
  await bot.handleUpdate(press('i:ord1:i2', 100));
  assert.match(calls.find((c) => c.method === 'editMessageText').params.text, /Yuvmoqda — <b>Bobur Aliyev<\/b>/);

  calls.length = 0;
  await bot.handleUpdate(press('o:ord1', 100));
  assert.match(calls.find((c) => c.method === 'editMessageText').params.text, /BUYURTMA #1245/);
});

test("/id 1245/2 to'g'ridan-to'g'ri mahsulot; topilmasa va noto'g'ri kiritilsa", async () => {
  const { bot, calls } = makeBot();
  await bot.handleUpdate(msg('/id 1245/2'));
  assert.match(sent(calls)[0].params.text, /1245\/2 · Parda/);
  await bot.handleUpdate(msg('#777'));
  assert.match(sent(calls)[1].params.text, /#777<\/b> raqamli buyurtma topilmadi/);
  await bot.handleUpdate(msg('/id'));
  await bot.handleUpdate(msg('abc'));
  assert.match(sent(calls)[3].params.text, /faqat sonlardan/);
  await bot.handleUpdate(msg('salom'));
  assert.match(sent(calls)[4].params.text, /faqat sonlardan/);
});

test("kirill tanlangan hisobda buyurtma ham kirillda; o'chirilgan buyurtma tugmasi", async () => {
  const { bot, calls, state } = makeBot();
  state.users[0].lang = 'cyrl';
  await bot.handleUpdate(msg('1245'));
  const t = sent(calls)[0].params.text;
  assert.match(t, /БУЮРТМА #1245/);
  assert.match(sent(calls)[0].params.reply_markup.inline_keyboard[2][0].text, /Янгилаш/);

  docs.delete('orders/ord1');
  orderLookup.clearOrderCache();
  calls.length = 0;
  await bot.handleUpdate(press('o:ord1', 100));
  assert.match(calls.find((c) => c.method === 'editMessageText').params.text, /топилмади/);
});

test("Telegram xatosi bitta yangilanish bilan cheklanadi", async () => {
  let fail = true;
  const calls = [];
  const api = new TelegramApi(async (method, params) => {
    calls.push(method);
    if (fail && method === 'sendMessage') throw new TelegramError(method, 403, 'Forbidden: bot was blocked by the user');
    return { message_id: 1 };
  });
  const bot = createBot({
    api,
    loadUsers: async () => [{ key: 'u', username: null, userId: 4242, label: '', lang: 'latn' }],
    bindUser: async () => {},
    setUserLang: async () => {},
    loadReport: async () => buildDayReport(sampleInput()),
    findOrderByNumber: async () => null,
    getOrder: async () => null,
    loadEmployees: async () => employees(),
    now: () => at(10),
    messageGapMs: 0,
    log: () => {},
  });
  await bot.handleUpdate(msg('/start'));
  fail = false;
  await bot.handleUpdate(msg('/start'));
  assert.equal(calls.filter((m) => m === 'sendMessage').length, 2);
});

test("katta hajm: 120 mahsulotli buyurtma va 60 xodimli hisobot Telegram chegarasida", () => {
  const items = Array.from({ length: 120 }, (_, i) =>
    orderLookup.toItemView(`item${String(i).padStart(16, '0')}`, {
      itemNumber: i + 1, name: `Juda uzun nomli gilam mahsuloti ${i + 1}`, calcType: 'sqm', qty: 12.75, width: 3.4, height: 3.75, price: 1255000, tariff: 'premium', status: 'washing',
    }),
  );
  const view = orderLookup.toOrderView('ORDERIDORDERIDORDER1', orderDoc(), items);
  for (const script of ['latn', 'cyrl']) {
    const r = orderLookup.renderOrder(view, () => 'Xodim', script, at(12));
    assert.ok(r.text.length <= 4096, `uzunlik ${r.text.length}`);
    assert.match(r.text, script === 'latn' ? /va yana \d+ ta/ : /ва яна \d+ та/);
    tagsBalanced(r.text);
    const buttons = r.keyboard.flat();
    assert.ok(buttons.length <= 100);
    assert.ok(r.keyboard.every((row) => row.length <= 2));
    for (const b of buttons) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  }

  const input = sampleInput();
  for (let i = 0; i < 60; i += 1) {
    const worker = i % 2 === 1;
    input.employees.set(`x${i}`, { name: `Xodim Familiyasi Uzun ${i}`, department: worker ? 'worker' : 'delivery', status: 'active' });
    for (const [n, tariffItem] of [['a', 'i1'], ['b', 'i2'], ['c', 'i3']]) {
      input.events.push({
        type: worker ? 'washed' : 'delivered', orderId: 'o1', orderNumber: 1201 + i, itemId: tariffItem, calcType: 'sqm', qty: 3.5, price: 70000,
        employeeId: `x${i}`, collectedAmount: worker ? null : 70000, cashAmount: null, cardAmount: null, n,
      });
    }
  }
  const groups = renderDayReport(buildDayReport(input), 'cyrl');
  assert.equal(groups.length, 7);
  assert.ok(groups[3].length > 1 || groups[5].length > 1, 'uzun ro\'yxat bo\'linishi kerak');
  for (const g of groups) for (const m of g) {
    assert.ok(m.length <= 4096);
    tagsBalanced(m);
  }
});

test("API: 429 da kutib qayta urinadi, 'not modified' xato emas", async () => {
  let n = 0;
  const api = new TelegramApi(async (method) => {
    n += 1;
    if (method === 'sendMessage' && n === 1) throw new TelegramError(method, 429, 'Too Many Requests', 0);
    if (method === 'editMessageText') throw new TelegramError(method, 400, 'Bad Request: message is not modified');
    return { message_id: 9 };
  });
  assert.equal((await api.sendMessage(1, 'x')).message_id, 9);
  await api.editMessage(1, 2, 'x');
  await assert.rejects(new TelegramApi(async () => { throw new TelegramError('m', 400, 'bad'); }).call('m'), /bad/);
});
