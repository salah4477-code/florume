const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');
const R = require('../js/rules.js');

function clean() {
  return {
    settings: { startDate: '2026-01-01', invoicePrefix: 'FL-', nextInvoiceNo: 3 },
    accounts: [{ id: 'cash', name: 'الخزينة', opening: 1000 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }],
    suppliers: [], campaigns: [], partners: [], distributions: [], decants: [], reconciliations: [],
    products: [{ id: 'p1', name: 'عود', price: 1500, sizeMl: 100 }],
    customers: [{ id: 'c1', name: 'أحمد', phone: '01012345678' }],
    shipments: [], supplierPayments: [], settlements: [], expenses: [], transfers: [], equity: [],
    adjustments: [{ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 5, unitCost: 500, reason: 'opening' }],
    sales: [
      { id: 's1', no: 1, date: '2026-01-05', status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 1, price: 1500 }], courierId: 'bosta', courierFee: 50, payment: 'cod', trackingNo: 'B1', discount: 0 },
      { id: 's2', no: 2, date: '2026-01-06', status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 1, price: 1500 }], courierId: 'bosta', courierFee: 50, payment: 'cod', trackingNo: 'B2', discount: 0 },
    ],
  };
}
const run = (s) => R.audit(s, Acc.buildJournal(s));
const failed = (r, id) => r.checks.find((c) => c.id === id).issues.filter((i) => i.level === 'error');

test('clean data passes every check', () => {
  const r = run(clean());
  assert.equal(r.errors, 0);
  assert.equal(r.notes, 0);
  assert.equal(r.passed, r.checks.length);
});

test('audit finds each kind of problem', () => {
  const s = clean();
  s.sales.push({ id: 's3', no: 2, date: '2026-01-07', status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 9, price: 1500 }, { productId: 'p1', qty: 1, price: 1400 }], courierId: 'bosta', courierFee: -5, payment: 'cod', trackingNo: 'b 1', discount: 20000 });
  s.sales.push({ id: 's4', no: 4, date: '2026-01-08', status: 'returned', returnDate: '2026-01-02', customerId: 'c1', items: [{ productId: 'p1', qty: 1, price: 1500 }], courierId: '', courierFee: 0, payment: 'cod', discount: 0 });
  s.expenses.push({ id: 'x1', date: '2025-12-20', category: '5300', amount: 3000, accountId: 'cash' });
  s.partners.push({ id: 'pa', name: 'سالم', share: 70 });
  s.shipments.push({ id: 'sh', ref: 'SA-1', supplierId: 'sa', currency: 'SAR', rate: 13, orderDate: '2026-01-10', status: 'received', receivedDate: '2026-01-09', items: [{ productId: 'p2', qty: 1, unitCost: 10 }], costs: [] });
  s.products.push({ id: 'p2', name: 'بدون حجم', price: 100 });
  s.customers.push({ id: 'c2', name: 'منى', phone: '' });
  const r = run(s);
  assert.equal(failed(r, 'stock').length, 1, 'one issue per product: the root cause');
  assert.match(failed(r, 'stock')[0].text, /FL-2 .*1 مستند كمان/);
  assert.equal(failed(r, 'invoiceNo').length, 2, 'duplicate #2 and next number 3 <= 4');
  assert.equal(failed(r, 'tracking').length, 1);
  assert.equal(failed(r, 'lines').length, 1);
  assert.equal(failed(r, 'numbers').length, 1);
  assert.equal(failed(r, 'discount').length, 1);
  assert.equal(failed(r, 'dates').length, 3, 'expense before start, return before sale, received before ordered');
  assert.equal(failed(r, 'cash').length, 1, 'cash went below zero');
  assert.match(failed(r, 'cash')[0].text, /20\/12\/2025/);
  assert.equal(failed(r, 'partners').length, 1);
  assert.equal(failed(r, 'links').length, 1, 'COD returned order without courier');
  const notes = r.checks.find((c) => c.id === 'notes').issues;
  assert.equal(notes.length, 3, 'product without size, customer without phone, COD order without tracking number');
  assert.equal(failed(r, 'books').length, 0, 'books still balance');
  // كل مشكلة ليها زرار يوديك لمكانها
  r.checks.flatMap((c) => c.issues).forEach((i) => assert.ok(i.action, i.text));
});

test('cash episode that recovers shows its end date', () => {
  const s = clean();
  s.expenses.push({ id: 'x1', date: '2026-01-02', category: '5300', amount: 1200, accountId: 'cash' });
  s.equity.push({ id: 'e1', date: '2026-01-04', type: 'capital', amount: 500, accountId: 'cash' });
  const [issue] = failed(run(s), 'cash');
  assert.match(issue.text, /من 02\/01\/2026 لحد 04\/01\/2026/);
  assert.match(issue.text, /-200/);
});
