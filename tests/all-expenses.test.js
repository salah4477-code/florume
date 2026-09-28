const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.01, `${m || ''} expected ${b} got ${a}`);
function base() {
  return {
    settings: { startDate: '2026-01-01', rates: {} },
    accounts: [{ id: 'bank', name: 'البنك', opening: 20000, feePct: 1 }, { id: 'cash', name: 'الخزينة', opening: 1000 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }], suppliers: [], customers: [{ id: 'c1', name: 'أحمد' }],
    products: [{ id: 'p1', name: 'عود', price: 1000 }, { id: 's', name: 'عينة', price: 0 }],
    adjustments: [{ id: 'op', date: '2026-01-01', productId: 'p1', qty: 20, unitCost: 400, reason: 'opening' }, { id: 'os', date: '2026-01-01', productId: 's', qty: 20, unitCost: 15, reason: 'opening' }, { id: 'dm', date: '2026-01-20', productId: 'p1', qty: -1, reason: 'damage' }],
    shipments: [], supplierPayments: [], settlements: [], transfers: [{ id: 't', date: '2026-01-05', fromId: 'bank', toId: 'cash', amount: 500, fee: 5 }], equity: [], decants: [], cashCounts: [], formation: [],
    expenses: [{ id: 'e1', date: '2026-01-03', category: '5300', amount: 700, accountId: 'bank' }],
    sales: [
      { id: 's1', no: 1, date: '2026-01-10', status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 1, price: 1000 }], discount: 100, courierId: 'bosta', courierFee: 60, shippingCharged: 0, payment: 'cod', samples: [{ productId: 's', qty: 2 }] },
      { id: 's2', no: 2, date: '2026-01-11', status: 'returned', returnDate: '2026-01-15', returnFee: 30, customerId: 'c1', items: [{ productId: 'p1', qty: 1, price: 1000 }], courierId: 'bosta', courierFee: 60, payment: 'cod' },
      { id: 'pr', no: 3, kind: 'promo', date: '2026-01-12', status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 1, price: 0 }], courierFee: 50, payment: 'cod' },
    ],
  };
}

test('every expense account total equals the income statement, including automatic ones', () => {
  const s = base(); const j = Acc.buildJournal(s);
  const rows = Acc.allExpenses(s, j);
  const is = Acc.incomeStatement(s, j);
  const byAcc = {}; rows.filter((r) => r.kind === 'opex').forEach((r) => (byAcc[r.acc] = (byAcc[r.acc] || 0) + r.amount));
  is.opex.forEach((o) => near(byAcc[o.code] || 0, o.amount, o.name));
  near(Object.values(byAcc).reduce((a, b) => a + b, 0), is.totalOpex, 'total opex');
  near(rows.filter((r) => r.kind === 'discount').reduce((a, r) => a + r.amount, 0), is.discounts, 'discounts');
});

test('automatic expenses show where they came from', () => {
  const s = base(); const j = Acc.buildJournal(s);
  const rows = Acc.allExpenses(s, j);
  const has = (acc, source) => rows.some((r) => r.acc === acc && r.source === source);
  assert.ok(has('5300', 'expense'), 'manual ad expense');
  assert.ok(has('5200', 'sale'), 'courier fee from the invoice');
  assert.ok(has('5810', 'sale'), 'free samples with the order');
  assert.ok(has('5300', 'sale'), 'promo invoice cost goes to advertising');
  assert.ok(has('5210', 'saleReturn') || has('5210', 'sale'), 'return fee');
  assert.ok(has('5700', 'transfer'), 'transfer fee');
  assert.ok(has('5800', 'adjustment'), 'damaged stock');
  assert.ok(has('4110', 'sale'), 'invoice discount');
  assert.ok(!rows.some((r) => r.acc === '5100'), 'cost of goods sold is not listed as an expense');
  // فلتر الفترة
  assert.ok(Acc.allExpenses(s, j, '2026-01-11', '2026-01-31').every((r) => r.date >= '2026-01-11'));
});
