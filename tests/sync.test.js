const test = require('node:test');
const assert = require('node:assert/strict');
const SYNC = require('../js/sync.js');
global.window = undefined;

function state() {
  return {
    version: 1, settings: { businessName: 'Florume', invoicePrefix: 'FL-' },
    accounts: [{ id: 'cash', name: 'الخزينة' }], products: [{ id: 'p1', name: 'عود' }, { id: 'p2', name: 'مسك' }],
    customers: [{ id: 'c1', name: 'أحمد' }],
    sales: [{ id: 's1', no: 1, date: '2026-09-01', items: [] }, { id: 's2', no: 2, date: '2026-09-02', items: [] }, { id: 's3', no: 3, date: '2026-08-30', items: [] }],
    expenses: [{ id: 'e1', date: '2026-09-05', amount: 100 }],
  };
}

test('records are grouped by list and month, and round-trip exactly', () => {
  const s = state();
  const docs = SYNC.encode(s);
  const ids = Object.keys(docs);
  assert.ok(ids.includes('meta'));
  assert.ok(ids.every((id) => /^[A-Za-z0-9_\-.~:@+]+$/.test(id)), 'valid doc ids');
  assert.ok(ids.some((id) => id.startsWith('sales.2026-09.')));
  assert.ok(ids.some((id) => id.startsWith('sales.2026-08.')));
  assert.ok(ids.some((id) => id.startsWith('products.all.')));
  const back = SYNC.decode(docs, {});
  assert.deepEqual(back.sales, s.sales); // نفس الترتيب
  assert.deepEqual(back.products, s.products);
  assert.deepEqual(back.settings, s.settings);
  assert.equal(back.demo, false);
});

test('diff writes only the changed records; deletes become null', () => {
  const a = state();
  const b = JSON.parse(JSON.stringify(a));
  b.sales[1].notes = 'اتعدل';
  b.expenses = [];
  b.customers.push({ id: 'c2', name: 'منى' });
  const d = SYNC.diff(SYNC.encode(a), SYNC.encode(b));
  const all = Object.assign({}, ...d.filter((x) => x.changes).map((x) => x.changes));
  assert.deepEqual(Object.keys(all).sort(), ['c2', 'e1', 's2']);
  assert.equal(all.e1, null);
  assert.equal(d.some((x) => x.meta), false);
  // سجل التعديلات
  const log = SYNC.changesForLog(SYNC.encode(a), SYNC.encode(b), 'FL-');
  const by = Object.fromEntries(log.map((l) => [l.id, l]));
  assert.equal(by.s2.action, 'edit');
  assert.equal(by.s2.label, 'فاتورة FL-2');
  assert.equal(by.e1.action, 'delete');
  assert.equal(by.c2.action, 'add');
  assert.equal(by.c2.label, 'عميل منى');
});

test('two people editing different records in the same batch both survive (per-record merge)', () => {
  const base = state();
  const docs = SYNC.encode(base);
  // جهاز 1 عدّل s1، وجهاز 2 عدّل s2 — كل واحد بيبعت سجله بس
  const mine = JSON.parse(JSON.stringify(base)); mine.sales[0].notes = 'من الجهاز 1';
  const theirs = JSON.parse(JSON.stringify(base)); theirs.sales[1].notes = 'من الجهاز 2';
  const merged = JSON.parse(JSON.stringify(docs));
  [SYNC.diff(docs, SYNC.encode(mine)), SYNC.diff(docs, SYNC.encode(theirs))].flat().forEach((d) => Object.assign(merged[d.docId].items, d.changes));
  const out = SYNC.decode(merged, {});
  assert.equal(out.sales.find((x) => x.id === 's1').notes, 'من الجهاز 1');
  assert.equal(out.sales.find((x) => x.id === 's2').notes, 'من الجهاز 2');
});

test('deleted records (null) are skipped when rebuilding', () => {
  const docs = SYNC.encode(state());
  const d = Object.keys(docs).find((id) => id.startsWith('expenses.'));
  docs[d].items.e1 = null;
  assert.equal(SYNC.decode(docs, {}).expenses.length, 0);
});

test('a heavy month stays under the 256 KB document limit', () => {
  const s = { settings: {}, sales: [] };
  for (let i = 0; i < 2000; i++) s.sales.push({ id: 'sale' + i, no: 1000 + i, date: '2026-09-15', customerId: 'c' + i, channel: 'instagram', status: 'delivered', items: [{ productId: 'p1', qty: 1, price: 1450 }, { productId: 'p2', qty: 1, price: 1150 }], discount: 100, shippingCharged: 60, courierId: 'bosta', courierFee: 55, payment: 'cod', trackingNo: 'BST' + (1000000 + i), campaignId: 'camp1', notes: 'ملاحظة قصيرة على الطلب' });
  const docs = SYNC.encode(s);
  const biggest = Math.max(...Object.values(docs).map((d) => JSON.stringify(d).length));
  assert.ok(biggest < 256 * 1024, `biggest doc ${biggest} bytes`);
});

test('roles', () => {
  assert.equal(SYNC.canSeePage('orders', 'sales'), true);
  assert.equal(SYNC.canSeePage('orders', 'reports'), false);
  assert.equal(SYNC.canSeePage('manager', 'reports'), true);
  assert.equal(SYNC.canWrite('viewer'), false);
  assert.equal(SYNC.seesCosts('orders'), false);
});
