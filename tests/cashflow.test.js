const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.01, `${m || ''} expected ${b} got ${a}`);
function base() {
  return {
    settings: { startDate: '2026-01-01', rates: { SAR: 13 } },
    accounts: [{ id: 'bank', name: 'البنك', opening: 20000 }, { id: 'cash', name: 'الخزينة', opening: 3000 }, { id: 'voda', name: 'فودافون', opening: 0, feePct: 1 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }], suppliers: [{ id: 'sa', name: 'مورد', currency: 'SAR' }], customers: [{ id: 'c1', name: 'أحمد' }],
    partners: [{ id: 'pa', name: 'شريك', share: 50 }],
    products: [{ id: 'p1', name: 'عود', price: 1000 }],
    adjustments: [{ id: 'op', date: '2026-01-01', productId: 'p1', qty: 10, unitCost: 400, reason: 'opening' }],
    shipments: [{ id: 'sh', ref: 'SA-1', supplierId: 'sa', currency: 'SAR', rate: 13, orderDate: '2026-02-01', status: 'received', receivedDate: '2026-02-10', items: [{ productId: 'p1', qty: 10, unitCost: 30 }], costs: [{ amount: 600, basis: 'value', accountId: 'cash', date: '2026-02-10' }] }],
    supplierPayments: [{ id: 'sp', date: '2026-02-02', supplierId: 'sa', amount: 300, rate: 13.2, accountId: 'bank', fee: 20 }],
    settlements: [{ id: 'st', date: '2026-02-20', courierId: 'bosta', amount: 1800, accountId: 'bank' }],
    expenses: [{ id: 'e1', date: '2026-02-05', category: '5300', amount: 700, accountId: 'bank' }, { id: 'e2', date: '2026-01-15', category: '5600', amount: 500, accountId: 'cash' }],
    transfers: [{ id: 't', date: '2026-02-06', fromId: 'bank', toId: 'cash', amount: 1000, fee: 10 }],
    equity: [{ id: 'q1', date: '2026-02-01', type: 'capital', amount: 5000, accountId: 'bank' }, { id: 'q2', date: '2026-02-25', type: 'drawing', amount: 800, accountId: 'cash' }, { id: 'q3', date: '2026-02-26', type: 'drawing', amount: 300, accountId: 'bank', partnerId: 'pa' }],
    formation: [{ id: 'f1', date: '2026-01-02', kind: 'website', amount: 1200, accountId: 'bank' }, { id: 'f2', date: '2026-01-02', kind: 'photos', amount: 400 }],
    decants: [], cashCounts: [{ id: 'k', date: '2026-02-28', accountId: 'cash', actual: 2600 }],
    sales: [
      { id: 's1', no: 1, date: '2026-02-12', status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 2, price: 1000 }], courierId: 'bosta', courierFee: 60, shippingCharged: 50, payment: 'cod' },
      { id: 's2', no: 2, date: '2026-02-14', status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 1, price: 1000 }], courierId: 'bosta', courierFee: 60, payment: 'voda' },
      { id: 's3', no: 3, date: '2026-02-15', status: 'returned', returnDate: '2026-02-18', returnFee: 30, customerId: 'c1', items: [{ productId: 'p1', qty: 1, price: 1000 }], courierId: 'bosta', courierFee: 60, payment: 'voda', refundAccountId: 'voda' },
    ],
  };
}
const cashAt = (s, j, asOf) => Acc.cashBalances(s, j, asOf).reduce((t, a) => t + a.balance, 0);

test('cash flow reconciles to the real cash balance for any period', () => {
  const s = base(); const j = Acc.buildJournal(s);
  for (const [from, to] of [[null, null], ['2026-01-01', '2026-01-31'], ['2026-02-01', '2026-02-28'], ['2026-02-10', '2026-02-20']]) {
    const cf = Acc.cashFlow(s, j, from, to);
    near(cf.start, from ? cashAt(s, j, new Date(Date.parse(from) - 86400000).toISOString().slice(0, 10)) : 0, `start ${from}`);
    near(cf.end, cashAt(s, j, to || '2099-12-31'), `end ${to}`);
  }
});

test('cash flow puts each movement in the right section', () => {
  const s = base(); const j = Acc.buildJournal(s);
  const cf = Acc.cashFlow(s, j, '2026-02-01', '2026-02-28');
  const find = (label) => cf.sections.flatMap((x) => x.rows.map((r) => ({ ...r, section: x.key }))).find((r) => r.label.includes(label));
  near(find('تحصيل من شركات الشحن').amount, 1800); assert.equal(find('تحصيل من شركات الشحن').section, 'operating');
  near(find('مبيعات مدفوعة مقدم').amount, 2000, 'two invoices paid upfront on Vodafone Cash');
  near(find('رد فلوس للعملاء').amount, -1000, 'refund of the returned prepaid invoice');
  assert.equal(find('دفعات للموردين').section, 'goods'); near(find('دفعات للموردين').amount, -(300 * 13.2 + 20));
  near(find('مصاريف شحن وجمارك').amount, -600);
  assert.equal(find('إضافات رأس مال').section, 'financing'); near(find('إضافات رأس مال').amount, 5000);
  near(find('مسحوبات').amount, -1100);
  near(find('عمولات التحويل').amount, -10);
  near(find('مصروفات — إعلانات').amount, -700);
  // يناير: الأرصدة الافتتاحية تمويل، والتأسيس من حساب النشاط على البضاعة والتأسيس، والتأسيس من الجيب مالوش حركة فلوس
  const jan = Acc.cashFlow(s, j, '2026-01-01', '2026-01-31');
  const jf = (label) => jan.sections.flatMap((x) => x.rows).find((r) => r.label.includes(label));
  near(jf('أرصدة افتتاحية').amount, 23000);
  near(jf('مصروفات التأسيس').amount, -1200);
});

test('equity changes reconcile to the balance sheet and chain between periods', () => {
  const s = base(); const j = Acc.buildJournal(s);
  const jan = Acc.equityChanges(s, j, '2026-01-01', '2026-01-31');
  const feb = Acc.equityChanges(s, j, '2026-02-01', '2026-02-28');
  near(jan.start, 0);
  near(jan.added.opening, 23000); near(jan.added.stock, 4000); near(jan.added.formation, 400);
  near(jan.end, Acc.balanceSheet(s, j, '2026-01-31').totalEquity, 'january end = balance sheet');
  near(feb.start, jan.end, 'february starts where january ended');
  near(feb.added.capital, 5000); near(feb.withdrawn.personal, 800); near(feb.withdrawn.partners, 300);
  near(feb.end, Acc.balanceSheet(s, j, '2026-02-28').totalEquity, 'february end = balance sheet');
  near(feb.end, feb.actual);
});
