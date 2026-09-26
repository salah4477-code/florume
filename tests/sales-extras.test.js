const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg || ''} expected ${b} got ${a}`);
function base() {
  return {
    settings: { startDate: '2026-01-01' },
    accounts: [{ id: 'cash', name: 'الخزينة', opening: 10000 }, { id: 'voda', name: 'فودافون كاش', opening: 0 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }], suppliers: [], customers: [{ id: 'c1', name: 'أحمد' }],
    products: [{ id: 'p1', name: 'عود', price: 1000 }, { id: 'p2', name: 'مسك', price: 500 }, { id: 's', name: 'عينة', price: 0 }, { id: 'box', name: 'بوكس', price: 2000 }],
    shipments: [], supplierPayments: [], settlements: [], expenses: [], transfers: [], equity: [], decants: [], coupons: [], commissionPayments: [],
    adjustments: [
      { id: 'o1', date: '2026-01-01', productId: 'p1', qty: 10, unitCost: 400, reason: 'opening' },
      { id: 'o2', date: '2026-01-01', productId: 'p2', qty: 10, unitCost: 200, reason: 'opening' },
      { id: 'o3', date: '2026-01-01', productId: 's', qty: 20, unitCost: 15, reason: 'opening' },
    ],
    sales: [],
  };
}
const sale = (extra) => ({ id: 'x', no: 1, date: '2026-01-05', status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 2, price: 1000 }, { productId: 'p2', qty: 1, price: 500 }], discount: 250, shippingCharged: 50, courierId: 'bosta', courierFee: 60, payment: 'cod', ...extra });
const balanced = (s, j) => {
  j.entries.forEach((e) => { const dr = e.lines.reduce((a, l) => a + l.dr, 0), cr = e.lines.reduce((a, l) => a + l.cr, 0); assert.ok(Math.abs(dr - cr) < 0.02, `${e.desc} ${dr} ${cr}`); });
  assert.ok(Acc.trialBalance(s, j).balanced);
  assert.ok(Acc.balanceSheet(s, j, '2026-12-31').balanced);
  near(Acc.ledger(s, j, '1300').closing, Object.values(j.inventory.products).reduce((a, p) => a + p.value, 0), 'inventory ties');
};

test('partial return (COD): one piece back, discount shared, courier collects less', () => {
  const s = base();
  // الخصم 250 على 2500 = 10٪ — قطعة عود قيمتها بعد الخصم 900
  s.sales.push(sale({ returns: [{ id: 'r1', date: '2026-01-08', items: [{ line: 0, qty: 1 }], fee: 30 }] }));
  const j = Acc.buildJournal(s);
  assert.equal(j.inventory.products.p1.qty, 9);
  const pr = Acc.partialReturns(s.sales[0]);
  near(pr.value, 900);
  const is = Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31');
  near(is.netSales, 2250 + 50 - 900);
  near(is.cogs, 400 + 200);
  // المستحق على بوسطة: 2300 − 60 شحن − 900 مرتجع − 30 مصاريف المرتجع
  near(Acc.courierBalances(s, j).bosta, 2300 - 60 - 900 - 30);
  const p = Acc.saleProfit(s.sales[0], j);
  near(p.keptTotal, 1400);
  near(p.profit, 1400 - 600 - 60 - 30);
  const perf = Object.fromEntries(Acc.productPerformance(s, j).map((r) => [r.productId, r]));
  assert.equal(perf.p1.qty, 1);
  assert.equal(perf.p1.returnedQty, 1);
  balanced(s, j);
});

test('partial return (prepaid) refunds from the chosen account, then full return takes only the rest', () => {
  const s = base();
  s.sales.push(sale({ payment: 'voda', status: 'returned', returnDate: '2026-01-10', returnFee: 40, refundAccountId: 'cash', returns: [{ id: 'r1', date: '2026-01-08', items: [{ line: 1, qty: 1 }], fee: 0, refundAccountId: 'voda' }] }));
  const j = Acc.buildJournal(s);
  assert.equal(j.inventory.products.p1.qty, 10);
  assert.equal(j.inventory.products.p2.qty, 10);
  const cb = Object.fromEntries(Acc.cashBalances(s, j).map((a) => [a.id, a.balance]));
  near(cb.voda, 2300 - 450); // المرتجع الجزئي رجع من فودافون
  near(cb.cash, 10000 - (2300 - 450)); // الباقي رجع من الخزينة
  near(Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31').netSales, 0);
  balanced(s, j);
});

test('payment gateway fee on prepaid orders', () => {
  const s = base();
  s.sales.push(sale({ payment: 'voda', payFee: 23 }));
  const j = Acc.buildJournal(s);
  const cb = Object.fromEntries(Acc.cashBalances(s, j).map((a) => [a.id, a.balance]));
  near(cb.voda, 2300 - 23);
  near(Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31').opex.find((o) => o.code === '5700').amount, 23);
  near(Acc.saleProfit(s.sales[0], j).profit, 2300 - 1000 - 60 - 23);
  balanced(s, j);
});

test('influencer commission accrues, reverses on return, and is paid', () => {
  const s = base();
  s.coupons.push({ id: 'cp', code: 'MARWA10' });
  s.sales.push(sale({ couponId: 'cp', commission: 225 }));
  s.sales.push(sale({ id: 'y', no: 2, couponId: 'cp', commission: 225, status: 'returned', returnDate: '2026-01-09' }));
  s.commissionPayments.push({ id: 'cpay', date: '2026-01-20', couponId: 'cp', amount: 200, accountId: 'cash' });
  const j = Acc.buildJournal(s);
  const bs = Acc.balanceSheet(s, j, '2026-12-31');
  near(bs.liabilities.find((l) => /مؤثرين/.test(l.name)).amount, 25);
  near(Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31').opex.find((o) => o.code === '5300').amount, 225);
  near(Acc.saleProfit(s.sales[0], j).commission, 225);
  balanced(s, j);
});

test('lost shipment: revenue reversed, goods written off, compensation income', () => {
  const s = base();
  s.sales.push(sale({ status: 'lost', lostDate: '2026-01-15', compensation: 800 }));
  const j = Acc.buildJournal(s);
  assert.equal(j.inventory.products.p1.qty, 8);
  const is = Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31');
  near(is.netSales, 0);
  near(is.cogs, 0);
  near(is.opex.find((o) => o.code === '5820').amount, 1000);
  near(is.otherIncome, 800); // تعويض شركة الشحن جزء من صافي الربح
  near(Acc.courierBalances(s, j).bosta, -60 + 800);
  near(Acc.saleProfit(s.sales[0], j).profit, -60 - 1000 + 800);
  balanced(s, j);
});

test('free samples with an order are expensed and come back on a full return', () => {
  const s = base();
  s.sales.push(sale({ samples: [{ productId: 's', qty: 2 }] }));
  s.sales.push(sale({ id: 'y', no: 2, samples: [{ productId: 's', qty: 1 }], status: 'returned', returnDate: '2026-01-09' }));
  const j = Acc.buildJournal(s);
  assert.equal(j.inventory.products.s.qty, 18);
  near(Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31').opex.find((o) => o.code === '5810').amount, 30);
  near(Acc.saleProfit(s.sales[0], j).samples, 30);
  balanced(s, j);
});

test('assemble boxes from pieces', () => {
  const s = base();
  s.decants.push({ id: 'a1', kind: 'assemble', date: '2026-01-03', sourceProductId: 'box', sourceQty: 3, inputs: [{ productId: 'p1', qty: 3 }, { productId: 'p2', qty: 6 }], materialsCost: 90, accountId: 'cash' });
  const j = Acc.buildJournal(s);
  assert.equal(j.inventory.products.box.qty, 3);
  assert.equal(j.inventory.products.p1.qty, 7);
  assert.equal(j.inventory.products.p2.qty, 4);
  near(j.inventory.products.box.avgCost, (1200 + 1200 + 90) / 3);
  balanced(s, j);
});
