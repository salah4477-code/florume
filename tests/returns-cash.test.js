const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');
const OPS = require('../js/ops.js');

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.01, `${m || ''} expected ${b} got ${a}`);
function base() {
  return {
    settings: { startDate: '2026-01-01', rates: {} },
    accounts: [{ id: 'cash', name: 'الخزينة', opening: 5000 }, { id: 'voda', name: 'فودافون كاش', opening: 1000 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }, { id: 'aramex', name: 'أرامكس' }],
    customers: [
      { id: 'c1', name: 'أحمد', phone: '01012345678', city: 'الجيزة' },
      { id: 'c2', name: 'أحمد م', phone: '+20 101 234 5678', city: 'الجيزة' }, // نفس الموبايل بعميل تاني
      { id: 'c3', name: 'منى', phone: '01199999999', city: 'القاهرة' },
    ],
    products: [{ id: 'p1', name: 'عود', price: 1000 }],
    adjustments: [{ id: 'op', date: '2026-01-01', productId: 'p1', qty: 50, unitCost: 400, reason: 'opening' }],
    suppliers: [], shipments: [], supplierPayments: [], settlements: [], expenses: [], transfers: [], equity: [], decants: [], cashCounts: [],
    sales: [],
  };
}
const sale = (id, cust, status, extra) => ({ id, no: id, date: '2026-02-01', customerId: cust, channel: 'facebook', status, items: [{ productId: 'p1', qty: 1, price: 1000 }], courierId: 'bosta', courierFee: 60, shippingCharged: 50, payment: 'cod', ...extra });

test('customer risk counts refusals across customers with the same phone', () => {
  const s = base();
  s.sales.push(sale('a', 'c1', 'returned', { returnReason: 'refused', returnDate: '2026-02-05', returnFee: 30 }));
  let r = OPS.customerRisk(s, 'c3');
  assert.equal(r.level, 'none');
  r = OPS.customerRisk(s, 'c2'); // عميل تاني بنفس الموبايل
  assert.equal(r.refused, 1);
  assert.equal(r.level, 'high', 'refused once and never received anything');
  s.sales.push(sale('b', 'c1', 'delivered'));
  assert.equal(OPS.customerRisk(s, 'c1').level, 'watch');
  s.sales.push(sale('c', 'c2', 'returned', { returnReason: 'noAnswer', returnDate: '2026-03-01' }));
  r = OPS.customerRisk(s, 'c1');
  assert.equal(r.refused, 2); assert.equal(r.level, 'high'); assert.equal(r.lastRefusal, '2026-03-01');
  // مرتجع بسبب مشكلة في المنتج مش بيتحسب على العميل
  const t = base(); t.sales.push(sale('d', 'c3', 'returned', { returnReason: 'damaged' }), sale('e', 'c3', 'delivered'));
  assert.equal(OPS.customerRisk(t, 'c3').refused, 0);
  // الفاتورة اللي بنعدلها نفسها مش بتتحسب
  assert.equal(OPS.customerRisk(s, 'c1', null, 'c').refused, 1);
  assert.equal(OPS.phoneKey('+20 101 234 5678'), '01012345678');
});

test('return analysis by governorate, courier and reason', () => {
  const s = base();
  s.sales.push(
    sale('a', 'c1', 'returned', { returnReason: 'refused', returnDate: '2026-02-05', returnFee: 30 }),
    sale('b', 'c1', 'delivered'),
    sale('c', 'c3', 'delivered', { courierId: 'aramex' }),
    sale('d', 'c3', 'delivered', { returns: [{ id: 'r1', date: '2026-02-09', fee: 20, reason: 'damaged', items: [{ line: 0, qty: 1 }] }] }),
    sale('e', 'c3', 'pending'), // لسه ما اتشحنش: مش بيتحسب
  );
  const a = OPS.returnAnalysis(s);
  assert.equal(a.total.orders, 4); assert.equal(a.total.returned, 1); assert.equal(a.total.partial, 1);
  near(a.total.rate, 0.25); near(a.total.loss, 60 + 30 + 20);
  const giza = a.gov.find((g) => g.key === 'الجيزة');
  assert.equal(giza.orders, 2); near(giza.rate, 0.5);
  assert.equal(a.courier.find((c) => c.key === 'aramex').returned, 0);
  assert.equal(a.reason.find((r) => r.key === 'refused').returned, 1);
  assert.equal(a.reason.find((r) => r.key === 'damaged').partial, 1);
});

test('cash count books the shortage or surplus against the book balance', () => {
  const s = base();
  s.expenses.push({ id: 'e1', date: '2026-02-01', category: '5300', amount: 800, accountId: 'cash' });
  s.cashCounts.push({ id: 'k1', date: '2026-02-28', accountId: 'cash', actual: 4000 }); // الدفاتر 4200 → عجز 200
  s.cashCounts.push({ id: 'k2', date: '2026-02-28', accountId: 'voda', actual: 1050 }); // زيادة 50
  let j = Acc.buildJournal(s);
  near(j.cashCounts.k1.book, 4200); near(j.cashCounts.k1.diff, -200); near(j.cashCounts.k2.diff, 50);
  const bs = Acc.balanceSheet(s, j);
  near(bs.totalCash, 5050); assert.equal(bs.balanced, true);
  const is = Acc.incomeStatement(s, j);
  near(is.opex.find((o) => o.code === '5830').amount, 200);
  near(is.otherIncome, 50);
  near(is.netProfit, -800 - 200 + 50);
  // افتكرت مصروف 150 اتدفع قبل الجرد: العجز يقل لوحده
  s.expenses.push({ id: 'e2', date: '2026-02-20', category: '5600', amount: 150, accountId: 'cash' });
  j = Acc.buildJournal(s);
  near(j.cashCounts.k1.diff, -50);
  near(Acc.balanceSheet(s, j).totalCash, 5050);
  // جرد تاني بعده بيبدأ من الرصيد الفعلي للجرد اللي قبله
  s.cashCounts.push({ id: 'k3', date: '2026-03-31', accountId: 'cash', actual: 4000 });
  near(Acc.buildJournal(s).cashCounts.k3.diff, 0);
});

test('courier compensation is part of net profit (income statement matches balance sheet)', () => {
  const s = base();
  s.sales.push(sale('l', 'c1', 'lost', { lostDate: '2026-02-10', compensation: 600 }));
  const j = Acc.buildJournal(s);
  const is = Acc.incomeStatement(s, j);
  near(is.otherIncome, 600);
  const bs = Acc.balanceSheet(s, j);
  near(bs.equity.find((e) => /الأرباح المحتجزة/.test(e.name)).amount, is.netProfit);
});
