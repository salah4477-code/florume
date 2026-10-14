const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg || ''} expected ${b} got ${a}`);
const base = (sales) => ({
  settings: { startDate: '2026-01-01' }, accounts: [{ id: 'cash', name: 'الخزينة', opening: 1000 }, { id: 'bank', name: 'البنك', opening: 0 }],
  couriers: [{ id: 'bosta', name: 'بوسطة' }], products: [{ id: 'p1', name: 'عود', price: 1500 }], customers: [{ id: 'c1', name: 'أحمد' }],
  adjustments: [{ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 10, unitCost: 400, reason: 'opening' }], sales,
});
const sale = (extra) => ({ id: 's1', no: 1, date: '2026-01-10', customerId: 'c1', items: [{ productId: 'p1', qty: 2, price: 1500 }], shippingCharged: 50, courierId: 'bosta', courierFee: 60, payment: 'cod', ...extra });
const books = (s) => { const j = Acc.buildJournal(s); const bal = (acc) => Acc.ledger(s, j, acc).closing; return { j, bal, tb: Acc.trialBalance(s, j).balanced, bs: Acc.balanceSheet(s, j, '2026-12-31'), is: (f, t) => Acc.incomeStatement(s, j, f, t), courier: Acc.courierBalances(s, j).bosta || 0 }; };

test('an order still with the courier: goods move to «with couriers», no sale, nothing owed by the courier', () => {
  const b = books(base([sale({ status: 'shipped' })]));
  assert.ok(b.tb && b.bs.balanced);
  near(b.is().grossSales, 0); near(b.is().cogs, 0);
  near(b.courier, 0);
  near(b.bal('1320'), 800); near(b.bal('1300'), 3200);
  const calc = Object.values(b.j.inventory.products).reduce((a, p) => a + p.value, 0);
  near(b.bal('1300'), calc, 'stock in the books = stock in the products list');
});

test('delivery books the sale on the delivery date and makes the courier owe the net', () => {
  const b = books(base([sale({ status: 'delivered', deliveredDate: '2026-02-03' })]));
  assert.ok(b.tb && b.bs.balanced);
  near(b.is('2026-01-01', '2026-01-31').grossSales, 0, 'nothing in January');
  const feb = b.is('2026-02-01', '2026-02-28');
  near(feb.grossSales, 3000); near(feb.cogs, 800); near(feb.shippingIncome, 50);
  near(b.courier, 3050 - 60);
  near(b.bal('1320'), 0);
  // من غير تاريخ تسليم (طلبات قديمة): بتاريخ الطلب
  const old = books(base([sale({ status: 'delivered' })]));
  near(old.is('2026-01-01', '2026-01-31').grossSales, 3000);
});

test('returned without delivery: goods back, only the shipping and return fees are a cost', () => {
  const b = books(base([sale({ status: 'returned', returnDate: '2026-01-15', returnFee: 25 })]));
  assert.ok(b.tb && b.bs.balanced);
  const is = b.is();
  near(is.grossSales, 0); near(is.netSales, 0); near(is.cogs, 0); near(is.netProfit, -85);
  near(b.courier, -85); near(b.bal('1320'), 0); near(b.bal('1300'), 4000);
});

test('prepaid order: money is a customer deposit until delivery, refunded if it comes back', () => {
  const shipped = books(base([sale({ status: 'shipped', payment: 'bank' })]));
  assert.ok(shipped.tb && shipped.bs.balanced);
  near(shipped.bal('1100:bank'), 3050); near(shipped.bal('2300'), -3050); near(shipped.is().grossSales, 0);
  const delivered = books(base([sale({ status: 'delivered', payment: 'bank', deliveredDate: '2026-01-12' })]));
  near(delivered.bal('2300'), 0); near(delivered.is().grossSales, 3000); near(delivered.courier, -60, 'we owe the courier its fee');
  const back = books(base([sale({ status: 'returned', payment: 'bank', refundAccountId: 'bank', returnDate: '2026-01-20', returnFee: 25 })]));
  assert.ok(back.tb && back.bs.balanced);
  near(back.bal('2300'), 0); near(back.bal('1100:bank'), 0); near(back.is().grossSales, 0); near(back.courier, -85);
});

test('lost before delivery: the goods are a loss, compensation is income', () => {
  const b = books(base([sale({ status: 'lost', lostDate: '2026-01-20', compensation: 500 })]));
  assert.ok(b.tb && b.bs.balanced);
  near(b.bal('1320'), 0); near(b.is().grossSales, 0);
  near(b.courier, 500 - 60);
});

test('delivered then partly returned still balances', () => {
  const s = base([sale({ status: 'delivered', deliveredDate: '2026-01-12', returns: [{ id: 'r1', date: '2026-01-20', lines: [{ line: 0, qty: 1 }], fee: 30 }] })]);
  const b = books(s);
  assert.ok(b.tb && b.bs.balanced);
  near(b.bal('1320'), 0);
  near(b.bal('1300'), Object.values(b.j.inventory.products).reduce((a, p) => a + p.value, 0));
});
