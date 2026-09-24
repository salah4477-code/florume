const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const LOCK = require('../js/lock.js');
const SYNC = require('../js/sync.js');

test('sha256 matches the standard digest (ASCII and Arabic)', () => {
  for (const s of ['', 'abc', 'فلورم ١٢٣', 'x'.repeat(200)]) {
    assert.equal(LOCK.sha256(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});

test('password and recovery code verify; wrong ones fail', () => {
  const { lock, code } = LOCK.create('عطر2026', { graceMin: 5, today: '2026-09-24' });
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(lock.graceMin, 5);
  assert.ok(!JSON.stringify(lock).includes('عطر2026'), 'the password itself is never stored');
  assert.equal(LOCK.verify(lock, 'عطر2026'), true);
  assert.equal(LOCK.verify(lock, 'عطر2025'), false);
  assert.equal(LOCK.verifyRecovery(lock, code.toLowerCase().replace(/-/g, ' ')), true);
  assert.equal(LOCK.verifyRecovery(lock, 'AAAA-BBBB-CCCC'), false);
  assert.equal(LOCK.enabled(null), false);
  assert.equal(LOCK.verify(null, 'x'), false);
  // ملح مختلف لكل باسورد
  assert.notEqual(LOCK.create('عطر2026').lock.hash, lock.hash);
});

test('password rules', () => {
  assert.ok(LOCK.passwordError('12'));
  assert.ok(LOCK.passwordError('1234', '1235'));
  assert.equal(LOCK.passwordError('1234', '1234'), null);
});

const base = () => ({
  settings: { businessName: 'Florume', nextInvoiceNo: 5 },
  products: [{ id: 'p1', name: 'عود', price: 100 }],
  customers: [{ id: 'c1', name: 'أحمد' }],
  sales: [{ id: 's1', no: 4, date: '2026-09-01', status: 'pending', items: [] }],
});
const clone = (x) => JSON.parse(JSON.stringify(x));

test('adding records (and the invoice counter) needs no password', () => {
  const a = base(), b = clone(a);
  b.sales.push({ id: 's2', no: 5, date: '2026-09-02', status: 'pending', items: [] });
  b.customers.push({ id: 'c2', name: 'منى' });
  b.settings.nextInvoiceNo = 6;
  assert.deepEqual(LOCK.guardedChanges(a, b, SYNC), []);
});

test('editing, deleting and settings changes need the password', () => {
  const a = base();
  const e = clone(a); e.sales[0].status = 'shipped';
  assert.deepEqual(LOCK.guardedChanges(a, e, SYNC).map((c) => c.action + ':' + c.list), ['edit:sales']);
  const d = clone(a); d.products = [];
  assert.deepEqual(LOCK.guardedChanges(a, d, SYNC).map((c) => c.action + ':' + c.list), ['delete:products']);
  const s = clone(a); s.settings.businessName = 'X';
  assert.deepEqual(LOCK.guardedChanges(a, s, SYNC).map((c) => c.list), ['settings']);
  // مسح الباسورد نفسه = تعديل إعدادات
  const l = clone(a); l.settings.lock = { hash: 'h', salt: 's' }; const off = clone(l); delete off.settings.lock;
  assert.equal(LOCK.guardedChanges(l, off, SYNC).length, 1);
});

test('five wrong tries lock the prompt for 30 seconds', () => {
  let s = {};
  for (let i = 0; i < LOCK.MAX_TRIES - 1; i++) s = LOCK.throttle(s, 1000, false);
  assert.equal(s.until, 0);
  s = LOCK.throttle(s, 1000, false);
  assert.equal(s.until, 1000 + LOCK.WAIT_MS);
  assert.deepEqual(LOCK.throttle(s, 2000, true), { fails: 0, until: 0 });
});
