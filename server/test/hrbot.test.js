const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { install, docs, under, reset, DIST } = require('./fakedb');

install();
const { TelegramApi } = require(DIST + 'lib/telegram/api.js');
const { createHrBot } = require(DIST + 'lib/hrbot/bot.js');
const format = require(DIST + 'lib/hrbot/format.js');

const ADMIN = 7001;
const CAND = 5001;
const OTHER = 5002;

let calls;
let bot;
let nextId;

beforeEach(() => {
  reset();
  calls = [];
  nextId = 100;
  const transport = async (method, params) => {
    const call = { method, params, result: true };
    calls.push(call);
    if (/^(sendMessage|copyMessage|sendVideo|sendPhoto|sendVoice|sendVideoNote|sendAudio|sendDocument)$/.test(method)) call.result = { message_id: ++nextId };
    if (method === 'getMe') call.result = { username: 'selta_hr_test_bot' };
    return call.result;
  };
  bot = createHrBot({ api: new TelegramApi(transport), adminIds: new Set([ADMIN]) });
});

let updateId = 1;
const from = (id) => ({ id, is_bot: false, first_name: id === ADMIN ? 'Admin' : 'Aziz', username: id === CAND ? 'aziz_k' : undefined });
const send = (id, fields) =>
  bot.handleUpdate({ update_id: updateId++, message: { message_id: ++nextId, from: from(id), chat: { id, type: 'private' }, ...fields } });
const press = (id, data, messageId) =>
  bot.handleUpdate({
    update_id: updateId++,
    callback_query: { id: `cb${updateId}`, from: from(id), data, message: { message_id: messageId ?? userDoc(id)?.screenId ?? 1, chat: { id, type: 'private' }, text: 'ekran' } },
  });

const userDoc = (id) => docs.get(`hrUsers/${id}`);
const lastTo = (chatId, method = 'sendMessage') => [...calls].reverse().find((c) => c.method === method && c.params.chat_id === chatId);
/** Foydalanuvchiga oxirgi ko'rsatilgan ekran matni (yuborilgan yoki tahrirlangan). */
const screenText = (chatId) =>
  [...calls].reverse().find((c) => (c.method === 'sendMessage' || c.method === 'editMessageText') && c.params.chat_id === chatId && c.params.text !== '✔️')
    ?.params.text ?? '';
const buttons = (chatId) => {
  const c = [...calls].reverse().find((x) => (x.method === 'sendMessage' || x.method === 'editMessageText') && x.params.chat_id === chatId && x.params.reply_markup?.inline_keyboard);
  return (c?.params.reply_markup.inline_keyboard ?? []).flat();
};
const callbackOf = (chatId, textPart) => buttons(chatId).find((b) => b.text.includes(textPart))?.callback_data;

async function adminCreatesVacancy(title, description) {
  await send(ADMIN, { text: '/start' });
  await press(ADMIN, 'a:vn');
  await send(ADMIN, { text: title });
  if (description) await send(ADMIN, { text: description });
  else await press(ADMIN, 'a:skip');
  return under('hrVacancies/').find((v) => v.title === title).id;
}

async function candidateApplies(vacId, id = CAND) {
  await send(id, { text: '/start' });
  await press(id, `c:v:${vacId}`);
  await press(id, `c:a:${vacId}`);
  await send(id, { text: '  aziz   karimov ' });
  await send(id, { text: '27' });
  await send(id, { contact: { phone_number: '998901234567', user_id: id } });
  await send(id, { video: { file_id: 'VID', duration: 25 } });
  await send(id, { photo: [{ file_id: 'small', width: 90, height: 90 }, { file_id: 'PHOTO', width: 800, height: 800 }] });
  await send(id, { voice: { file_id: 'VOICE', duration: 40 } });
}

// ----------------------------------------------------------------- FORMAT

test('format: ism, yosh va telefon tekshiruvi', () => {
  assert.equal(format.cleanFullName("  aziz   o‘g‘li karimov "), "Aziz O'g'li Karimov");
  assert.equal(format.cleanFullName('Азиз Каримов'), 'Азиз Каримов');
  assert.equal(format.cleanFullName('Aziz'), null, 'bitta so\'z');
  assert.equal(format.cleanFullName('Aziz 123'), null);
  assert.equal(format.parseAge('27'), 27);
  assert.equal(format.parseAge('27 yosh'), 27);
  assert.equal(format.parseAge('12'), null);
  assert.equal(format.parseAge('yigirma'), null);
  assert.equal(format.normalizePhone('+998 90 123-45-67'), '+998901234567');
  assert.equal(format.normalizePhone('90 123 45 67'), '+998901234567');
  assert.equal(format.normalizePhone('998901234567'), '+998901234567');
  assert.equal(format.normalizePhone('12345'), null);
  assert.equal(format.prettyPhone('+998901234567'), '+998 90 123 45 67');
});

// ------------------------------------------------------------- NOMZOD TOMONI

test("bo'sh ish o'rni yo'q — xabarnomaga obuna; o'rin ochilganda xabar keladi", async () => {
  await send(CAND, { text: '/start' });
  assert.match(screenText(CAND), /Hozircha bo'sh ish o'rinlari yo'q/);
  await press(CAND, callbackOf(CAND, 'xabar berish'));
  assert.equal(userDoc(CAND).notify, true);
  assert.match(screenText(CAND), /xabar beramiz/);

  const vacId = await adminCreatesVacancy('Haydovchi', 'B toifa guvohnoma, 6/1 ish kuni');
  const notice = lastTo(CAND);
  assert.match(notice.params.text, /Yangi ish o'rni[\s\S]*Haydovchi/);
  assert.equal(notice.params.reply_markup.inline_keyboard[0][0].callback_data, `c:v:${vacId}`);
  assert.match(screenText(ADMIN), /Ish o'rni ochildi. 🔔 1 kishiga/);
});

test("to'liq ariza: 6 qadam, matnlar o'chiriladi, media qoladi, adminga xabar", async () => {
  const vacId = await adminCreatesVacancy('Haydovchi', 'B toifa');
  calls.length = 0;
  await candidateApplies(vacId);

  // Ism va yosh xabarlari o'chirildi, media o'chirilmadi.
  const deleted = calls.filter((c) => c.method === 'deleteMessage' && c.params.chat_id === CAND).map((c) => c.params.message_id);
  const sent = calls.filter((c) => c.method === 'sendMessage' && c.params.chat_id === CAND);
  assert.ok(deleted.length >= 3, 'matnli javoblar va eski savollar o\'chirildi');
  // Telefon so'ralganda pastki klaviatura, keyin yopiladi.
  assert.ok(sent.some((c) => c.params.reply_markup?.keyboard?.[0]?.[0]?.request_contact === true));
  assert.ok(sent.some((c) => c.params.reply_markup?.remove_keyboard === true));

  assert.match(screenText(CAND), /Arizangizni tekshiring[\s\S]*Aziz Karimov[\s\S]*27 yosh[\s\S]*\+998 90 123 45 67[\s\S]*Video ✅/);
  assert.equal(userDoc(CAND).step, 'review');

  await press(CAND, 'c:send');
  const apps = under('hrApplications/').filter((a) => a.fullName);
  assert.equal(apps.length, 1);
  const app = apps[0];
  assert.equal(app.fullName, 'Aziz Karimov');
  assert.equal(app.age, 27);
  assert.equal(app.phone, '+998901234567');
  assert.equal(app.vacancyTitle, 'Haydovchi');
  assert.equal(app.status, 'new');
  assert.equal(app.video.fileId, 'VID');
  assert.equal(app.video.chatId, CAND);
  assert.equal(app.photo.fileId, 'PHOTO', 'eng katta o\'lcham');
  assert.equal(app.voice.fileId, 'VOICE');
  assert.equal(app.username, 'aziz_k');
  assert.match(screenText(CAND), /Arizangiz qabul qilindi/);
  assert.equal(userDoc(CAND).draft, null);

  const toAdmin = lastTo(ADMIN);
  assert.match(toAdmin.params.text, /Yangi ariza[\s\S]*Aziz Karimov, 27 yosh[\s\S]*Haydovchi/);
  assert.equal(toAdmin.params.reply_markup.inline_keyboard[0][0].callback_data, `a:c:${app.id}`);

  // Ikkinchi marta shu lavozimga — bloklanadi.
  await press(CAND, `c:a:${vacId}`);
  assert.match(screenText(CAND), /arizangiz ko'rib chiqilmoqda/);
  assert.equal(under('hrApplications/').filter((a) => a.fullName).length, 1);
});

test("noto'g'ri kiritish: xato xabari, noto'g'ri media o'chiriladi; tahrirlash tekshirishga qaytadi", async () => {
  const vacId = await adminCreatesVacancy('Gilam yuvuvchi');
  await send(CAND, { text: '/start' });
  await press(CAND, `c:a:${vacId}`);
  await send(CAND, { text: 'Aziz' });
  assert.match(screenText(CAND), /Ism va familiyani to'liq yozing/);
  assert.equal(userDoc(CAND).step, 'name');
  await send(CAND, { text: 'Aziz Karimov' });
  await send(CAND, { text: 'yigirma' });
  assert.match(screenText(CAND), /Yoshingizni raqamda yozing/);
  await send(CAND, { text: '30' });
  await send(CAND, { text: '12345' });
  assert.match(screenText(CAND), /Raqam noto'g'ri/);
  await send(CAND, { text: '+998 91 222 33 44' });
  const photoMsgId = nextId + 1;
  await send(CAND, { photo: [{ file_id: 'P', width: 1, height: 1 }] });
  assert.ok(calls.some((c) => c.method === 'deleteMessage' && c.params.message_id === photoMsgId), 'video o\'rniga rasm — o\'chirildi');
  assert.match(screenText(CAND), /Video yuboring/);
  await send(CAND, { video_note: { file_id: 'ROUND', duration: 2 } });
  assert.match(screenText(CAND), /Video juda qisqa/);
  await send(CAND, { video_note: { file_id: 'ROUND', duration: 30 } });
  await send(CAND, { photo: [{ file_id: 'P2', width: 1, height: 1 }] });
  await send(CAND, { voice: { file_id: 'V', duration: 20 } });
  assert.equal(userDoc(CAND).step, 'review');

  // Yoshni o'zgartirish — keyin yana tekshirish ekrani.
  await press(CAND, 'c:edit');
  await press(CAND, 'c:ef:age');
  assert.equal(userDoc(CAND).step, 'age');
  await send(CAND, { text: '31' });
  assert.equal(userDoc(CAND).step, 'review');
  assert.equal(userDoc(CAND).draft.age, 31);
  assert.equal(userDoc(CAND).draft.video.kind, 'video_note');
});

test('bekor qilish qoralamani o\'chiradi; davom ettirish yetishmagan qadamdan boshlaydi', async () => {
  const vacId = await adminCreatesVacancy('Operator');
  await send(CAND, { text: '/start' });
  await press(CAND, `c:a:${vacId}`);
  await send(CAND, { text: 'Aziz Karimov' });
  await send(CAND, { text: '/start' });
  assert.ok(callbackOf(CAND, 'davom ettirish'), "bosh menyuda \"Davom ettirish\"");
  await press(CAND, 'c:resume');
  assert.equal(userDoc(CAND).step, 'age');
  await press(CAND, 'c:cancel');
  assert.equal(userDoc(CAND).draft, null);
  assert.match(screenText(CAND), /Ariza bekor qilindi/);
});

// --------------------------------------------------------------- ADMIN TOMONI

test('admin: karta, media nusxalari, savol-javob, qabul qilish xabar bilan', async () => {
  const vacId = await adminCreatesVacancy('Haydovchi');
  await candidateApplies(vacId);
  await press(CAND, 'c:send');
  const appId = under('hrApplications/').find((a) => a.fullName).id;

  await press(ADMIN, `a:c:${appId}`);
  assert.equal(docs.get(`hrApplications/${appId}`).status, 'reviewing', 'ochilgan yangi ariza — ko\'rib chiqilmoqda');
  assert.match(screenText(ADMIN), /Aziz Karimov<\/b>, 27 yosh[\s\S]*\+998 90 123 45 67[\s\S]*@aziz_k/);

  calls.length = 0;
  await press(ADMIN, `a:md:${appId}:all`);
  const copies = calls.filter((c) => c.method === 'copyMessage' && c.params.chat_id === ADMIN);
  assert.equal(copies.length, 3, 'video, rasm, ovoz');
  assert.ok(copies.every((c) => c.params.from_chat_id === CAND));
  assert.equal(docs.get(`hrUsers/${ADMIN}`).media.length, 3);
  assert.match(screenText(ADMIN), /Aziz Karimov/, 'karta media ostida qayta chiqdi');

  // Ro'yxatga qaytganda media tozalanadi.
  await press(ADMIN, 'a:l:all:0');
  assert.equal(docs.get(`hrUsers/${ADMIN}`).media.length, 0);

  // Savol.
  await press(ADMIN, `a:q:${appId}`);
  await send(ADMIN, { text: 'Guvohnomangiz qaysi toifada?' });
  const question = lastTo(CAND);
  assert.match(question.params.text, /savol[\s\S]*Guvohnomangiz qaysi toifada\?/);
  assert.equal(docs.get(`hrApplications/${appId}`).openQuestions, 1);
  assert.match(screenText(ADMIN), /Savol yuborildi/);

  // Ikkinchi savol — nomzod esa BIRINCHISIGA "reply" qilib javob beradi.
  await press(ADMIN, `a:q:${appId}`);
  await send(ADMIN, { text: 'Qachondan ishlay olasiz?' });
  assert.equal(docs.get(`hrApplications/${appId}`).openQuestions, 2);
  calls.length = 0;
  await send(CAND, { voice: { file_id: 'ANSWER', duration: 12 }, reply_to_message: { message_id: question.result.message_id, chat: { id: CAND, type: 'private' } } });
  assert.match(lastTo(CAND).params.text, /Javobingiz yuborildi/);
  const relay = calls.find((c) => c.method === 'copyMessage' && c.params.chat_id === ADMIN);
  assert.ok(relay, 'javob adminga nusxalandi');
  assert.match(relay.params.caption, /javob berdi[\s\S]*Guvohnomangiz/);
  assert.equal(relay.params.reply_markup.inline_keyboard[0][0].callback_data, `a:c:${appId}`);
  const app = docs.get(`hrApplications/${appId}`);
  assert.equal(app.openQuestions, 1, 'ikkinchi savol hali javobsiz');
  const thread = under(`hrApplications/${appId}/thread/`);
  const first = thread.find((e) => e.text === 'Guvohnomangiz qaysi toifada?');
  const second = thread.find((e) => e.text === 'Qachondan ishlay olasiz?');
  assert.equal(first.answered, true, 'reply qilingan savolga bog\'landi');
  assert.notEqual(second.answered, true);
  const answer = thread.find((e) => e.type === 'answer');
  assert.equal(answer.media.fileId, 'ANSWER');
  assert.equal(answer.questionId, first.id);

  // Reply'siz matnli javob — qolgan (oxirgi) savolga.
  await send(CAND, { text: 'Dushanbadan' });
  assert.equal(docs.get(`hrApplications/${appId}`).openQuestions, 0);
  assert.match(lastTo(ADMIN).params.text, /javob berdi[\s\S]*Qachondan ishlay olasiz\?[\s\S]*Dushanbadan/);

  // Qabul qilish — nomzodga tabrik.
  await press(ADMIN, `a:st:${appId}:acc`);
  await press(ADMIN, `a:sc:${appId}:acc:y`);
  assert.equal(docs.get(`hrApplications/${appId}`).status, 'accepted');
  assert.match(lastTo(CAND).params.text, /Tabriklaymiz, Aziz![\s\S]*Haydovchi/);
  assert.match(screenText(ADMIN), /Qabul qilindi. Nomzodga xabar yuborildi/);

  // Nomzod o'z arizalarida holatni ko'radi.
  await press(CAND, 'c:my');
  assert.match(screenText(CAND), /Haydovchi[\s\S]*Qabul qilindi/);
});

test("nomzodning erkin xabari adminlarga yetadi; admin bo'lmagan a: tugmasi e'tiborsiz", async () => {
  const vacId = await adminCreatesVacancy('Haydovchi');
  await candidateApplies(vacId);
  await press(CAND, 'c:send');
  calls.length = 0;
  await send(CAND, { text: 'Qachon javob berasizlar?' });
  assert.match(lastTo(CAND).params.text, /Xabaringiz yetkazildi/);
  assert.match(lastTo(ADMIN).params.text, /xabar yubordi[\s\S]*Qachon javob berasizlar\?/);

  calls.length = 0;
  await press(OTHER, 'a:home');
  assert.ok(!calls.some((c) => (c.method === 'sendMessage' || c.method === 'editMessageText') && c.params.chat_id === OTHER && /Boshqaruv/.test(c.params.text)));
});

test("ish o'rinlari: nomini o'zgartirish, to'xtatish, o'chirish — nomzodga ko'rinmaydi", async () => {
  const vacId = await adminCreatesVacancy('Kuryer');
  await press(ADMIN, `a:ve:${vacId}:t`);
  await send(ADMIN, { text: 'Kuryer (kechki smena)' });
  assert.equal(docs.get(`hrVacancies/${vacId}`).title, 'Kuryer (kechki smena)');

  await press(ADMIN, `a:vt:${vacId}`);
  assert.equal(docs.get(`hrVacancies/${vacId}`).active, false);
  await send(CAND, { text: '/start' });
  assert.match(screenText(CAND), /bo'sh ish o'rinlari yo'q/);

  await press(ADMIN, `a:vt:${vacId}`);
  await send(CAND, { text: '/start' });
  assert.ok(callbackOf(CAND, 'Kuryer (kechki smena)'));

  await press(ADMIN, `a:vd:${vacId}`);
  await press(ADMIN, `a:vdc:${vacId}`);
  assert.equal(docs.get(`hrVacancies/${vacId}`).deleted, true);
  await send(CAND, { text: '/start' });
  assert.match(screenText(CAND), /bo'sh ish o'rinlari yo'q/);

  // Yangi o'rinni bekor qilish (tavsif bosqichida) — yaratilmaydi.
  await press(ADMIN, 'a:vn');
  await send(ADMIN, { text: 'Vaqtinchalik' });
  await press(ADMIN, 'a:x');
  assert.equal(under('hrVacancies/').find((v) => v.title === 'Vaqtinchalik').deleted, true);
});
