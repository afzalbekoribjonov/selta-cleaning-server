const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { install, call, docs, reset, DIST } = require('./fakedb');

install();
const { attendanceRouter } = require(DIST + 'routes/attendance.js');
const { businessDateString } = require(DIST + 'lib/businessTime.js');

const W = { uid: 'uw', employeeId: 'w1', role: 'worker' };
const OFFICE = { lat: 41.3111, lng: 69.2797 };
const METERS_PER_DEG_LAT = 111_195;
const north = (meters) => ({ lat: OFFICE.lat + meters / METERS_PER_DEG_LAT, lng: OFFICE.lng });
const today = businessDateString(new Date());

beforeEach(() => {
  reset();
  docs.set('settings/attendance', {
    enabled: true,
    location: OFFICE,
    radiusMeters: 200,
    arrivalTime: '00:00',
    lateToleranceMinutes: 1439,
  });
  docs.set('employees/w1', { fullName: 'Vali', attendanceEnabled: true });
});

const checkin = async (body) => {
  const r = await call(attendanceRouter, '/submitAttendanceCheckin', body, W);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.body;
};
const web = { source: 'web', platform: 'ios-safari' };

test("aniq bo'lmagan joylashuv (iPhone 'Aniq joylashuv' o'chiq) qabul qilinmaydi va adminga yoziladi", async () => {
  const body = await checkin({ ...north(10), accuracy: 3200, ...web });
  assert.equal(body.reason, 'imprecise');
  assert.equal(docs.has(`attendanceRecords/w1_${today}`), false);
  const issue = docs.get(`attendanceIssues/w1_${today}`);
  assert.equal(issue.issue, 'imprecise');
  assert.equal(issue.accuracyMeters, 3200);
  assert.equal(issue.platform, 'ios-safari');
});

test('eski (keshdagi) joylashuv — yangisi so\'raladi, hech narsa yozilmaydi', async () => {
  const body = await checkin({ ...north(10), accuracy: 15, fixAgeMs: 10 * 60_000, ...web });
  assert.equal(body.reason, 'stale');
  assert.equal(docs.has(`attendanceRecords/w1_${today}`), false);
  assert.equal(docs.has(`attendanceIssues/w1_${today}`), false);
});

test("radiusdan tashqarida — masofa bilan adminga yoziladi", async () => {
  const body = await checkin({ ...north(1500), accuracy: 20, ...web });
  assert.equal(body.reason, 'out_of_range');
  assert.ok(Math.abs(body.distanceMeters - 1500) < 5);
  const issue = docs.get(`attendanceIssues/w1_${today}`);
  assert.equal(issue.issue, 'out_of_range');
  assert.equal(issue.accuracyMeters, 20);
});

test("chegarada GPS xatosiga cheklangan bardosh: 250 m (±60) qabul, 320 m (±300) rad", async () => {
  let body = await checkin({ ...north(320), accuracy: 300, ...web });
  assert.equal(body.reason, 'out_of_range', "bardosh ko'pi bilan 100 m");

  body = await checkin({ ...north(250), accuracy: 60, fixAgeMs: 2000, ...web });
  assert.equal(body.recorded, true, JSON.stringify(body));
  const record = docs.get(`attendanceRecords/w1_${today}`);
  assert.equal(record.accuracyMeters, 60);
  assert.equal(record.source, 'web');
  assert.equal(record.platform, 'ios-safari');
  assert.ok(Math.abs(record.distanceMeters - 250) < 5);
});

test("ilovaning eski versiyasi (aniqliksiz) avvalgidek ishlaydi; ikkinchi belgilash yozilmaydi", async () => {
  assert.equal((await checkin(north(50))).recorded, true);
  assert.equal((await checkin(north(50))).reason, 'already');
});

test("GPS o'chiq — sabab va qurilma adminga yoziladi", async () => {
  const body = await checkin({ issue: 'location_off', ...web });
  assert.equal(body.reason, 'issue_logged');
  const issue = docs.get(`attendanceIssues/w1_${today}`);
  assert.equal(issue.issue, 'location_off');
  assert.equal(issue.source, 'web');
});
