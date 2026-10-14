const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

// زي حالة المستخدم: طلبات اتسلمت من غير مصاريف شحن متسجلة، وتحصيلات اتسجلت من الخزينة من غير تسوية
const state = () => ({
  settings: {}, accounts: [{ id: 'bank', name: 'البنك', type: 'bank', opening: 0 }], couriers: [{ id: 'b', name: 'بوسطة' }, { id: 'a', name: 'أرامكس' }],
  products: [{ id: 'p', name: 'عود', price: 1000 }], adjustments: [{ id: 'o', date: '2026-07-01', productId: 'p', qty: 20, unitCost: 300, reason: 'opening' }],
  sales: [
    { id: 's1', no: 1, date: '2026-07-30', status: 'delivered', courierId: 'b', payment: 'cod', items: [{ productId: 'p', qty: 1, price: 850 }] },
    { id: 's2', no: 2, date: '2026-07-30', status: 'delivered', courierId: 'b', payment: 'cod', items: [{ productId: 'p', qty: 1, price: 2350 }] },
    { id: 's3', no: 3, date: '2026-09-01', status: 'delivered', courierId: 'b', payment: 'cod', items: [{ productId: 'p', qty: 1, price: 8000 }], courierFee: 100 },
    { id: 's4', no: 4, date: '2026-09-20', status: 'shipped', courierId: 'b', payment: 'cod', items: [{ productId: 'p', qty: 1, price: 500 }] },
  ],
  settlements: [{ id: 't1', date: '2026-08-12', courierId: 'b', accountId: 'bank', amount: 3000 }, { id: 't2', date: '2026-09-10', courierId: 'b', accountId: 'bank', amount: 7800 }],
  expenses: [{ id: 'e', date: '2026-09-15', category: '5200', amount: 70, courierId: 'b', accountId: '' }],
  reconciliations: [],
});
const parts = (b) => Acc.round2(b.pending + b.shipped + b.prepaid + b.settledDiff - b.unlinkedPaid - b.expenses + b.other);

test('the courier book balance splits into pending orders, orders still out, unlinked collections and courier charges', () => {
  const s = state(), j = Acc.buildJournal(s);
  const b = Acc.courierBreakdown(s, j, 'b');
  assert.equal(b.balance, Acc.courierBalances(s, j).b);
  assert.equal(b.pending, 850 + 2350 + 7900); assert.equal(b.pendingCount, 3);
  assert.equal(b.shipped, 500); assert.equal(b.shippedCount, 1);
  assert.equal(b.unlinkedPaid, 10800); assert.equal(b.unlinkedCount, 2);
  assert.equal(b.expenses, 70);
  assert.equal(parts(b), b.balance, 'the lines add up to the balance');
  assert.equal(b.balance, 11100 + 500 - 10800 - 70);
  assert.deepEqual(Acc.unlinkedSettlements(s, 'b').map((x) => x.id), ['t1', 't2']);
  assert.equal(Acc.courierBreakdown(s, j, 'a').balance, 0);
});

test('linking the earlier collections to a reconciliation moves them out of «unlinked» and shows the real difference', () => {
  const s = state();
  s.reconciliations.push({ id: 'r', courierId: 'b', manual: true, lines: [{ saleId: 's1' }, { saleId: 's2' }, { saleId: 's3' }], settlementIds: ['t1', 't2'], settlementId: 't1' });
  const j = Acc.buildJournal(s);
  const b = Acc.courierBreakdown(s, j, 'b');
  assert.equal(b.pending, 0); assert.equal(b.unlinkedPaid, 0); assert.equal(b.linkedPaid, 10800);
  assert.equal(b.settledDiff, 11100 - 10800, 'received 300 less than the orders say (fees not recorded)');
  assert.equal(parts(b), b.balance);
  assert.equal(Acc.unlinkedSettlements(s, 'b').length, 0);
});
