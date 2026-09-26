const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.01, `${m || ''} expected ${b} got ${a}`);
function base() {
  return {
    settings: { startDate: '2026-01-01', rates: {} },
    accounts: [{ id: 'bank', name: 'البنك', opening: 10000 }],
    couriers: [], suppliers: [], customers: [], shipments: [], supplierPayments: [], settlements: [], expenses: [], transfers: [], equity: [], decants: [], sales: [],
    partners: [{ id: 'pa', name: 'أحمد', share: 50 }],
    products: [{ id: 'p1', name: 'عود', price: 1500 }],
    adjustments: [{ id: 'op', date: '2026-01-01', productId: 'p1', qty: 20, unitCost: 500, reason: 'opening' }],
    formation: [
      { id: 'f1', date: '2026-01-01', kind: 'website', amount: 3000, notes: 'دومين واستضافة' }, // من جيب المالك
      { id: 'f2', date: '2026-01-02', kind: 'photos', amount: 1200, partnerId: 'pa' }, // من فلوس الشريك
      { id: 'f3', date: '2026-01-03', kind: 'legal', amount: 800, accountId: 'bank' }, // من حساب النشاط
    ],
  };
}

test('pre-operating expenses never touch profit and loss', () => {
  const s = base(); const j = Acc.buildJournal(s);
  const is = Acc.incomeStatement(s, j);
  near(is.totalOpex, 0, 'opex'); near(is.netProfit, 0, 'net profit');
  const bs = Acc.balanceSheet(s, j);
  assert.equal(bs.balanced, true);
  near(bs.assets.find((a) => a.name === 'مصروفات التأسيس وما قبل التشغيل').amount, 5000);
  near(bs.equity.find((e) => e.name === 'رأس المال').amount, 10000 + 20 * 500 + 3000 + 1200);
  near(bs.equity.find((e) => /الأرباح المحتجزة/.test(e.name)).amount, 0);
  near(bs.totalCash, 10000 - 800, 'paid from the bank lowers cash only');
});

test('founding capital breakdown and partner capital', () => {
  const s = base(); const j = Acc.buildJournal(s);
  const fc = Acc.foundingCapital(s, j);
  near(fc.cash, 10000); near(fc.stock, 10000); near(fc.formationOwn, 4200); near(fc.formationFromCash, 800);
  near(fc.total, 24200); near(fc.formationTotal, 5000);
  near(Acc.partnerAccounts(s, j).find((p) => p.id === 'pa').capital, 1200);
});

test('later operating expenses still hit the income statement', () => {
  const s = base();
  s.expenses.push({ id: 'e1', date: '2026-02-01', category: '5300', amount: 700, accountId: 'bank' });
  const j = Acc.buildJournal(s);
  near(Acc.incomeStatement(s, j, '2026-02-01', '2026-02-28').totalOpex, 700);
  near(Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31').netProfit, 0);
});
