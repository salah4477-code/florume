const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

function baseState() {
  return {
    settings: { startDate: '2026-01-01' },
    accounts: [{ id: 'cash', name: 'الخزينة', opening: 100000 }, { id: 'bank', name: 'البنك', opening: 0 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }],
    suppliers: [{ id: 'sa1', name: 'مورد الرياض', currency: 'SAR' }],
    products: [{ id: 'p1', name: 'عود', price: 1500 }, { id: 'p2', name: 'مسك', price: 900 }],
    customers: [{ id: 'c1', name: 'أحمد' }],
    shipments: [], supplierPayments: [], sales: [], settlements: [], expenses: [], transfers: [], equity: [], adjustments: [],
  };
}

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg || ''} expected ${b} got ${a}`);

test('landed cost distributes extra costs by value', () => {
  const c = Acc.shipmentCosting({
    rate: 13, items: [{ productId: 'p1', qty: 10, unitCost: 100 }, { productId: 'p2', qty: 10, unitCost: 50 }],
    costs: [{ amount: 1950 }],
  });
  assert.equal(c.goodsEGP, 19500);
  assert.equal(c.extras, 1950);
});

test('landed cost numbers', () => {
  const c = Acc.shipmentCosting({ rate: 13, items: [{ productId: 'p1', qty: 10, unitCost: 100 }, { productId: 'p2', qty: 10, unitCost: 50 }], costs: [{ amount: 1950 }] });
  near(c.lines[0].landedUnit, 1430);
  near(c.lines[1].landedUnit, 715);
  near(c.landedTotal, 21450);
});

test('weighted average cost and COGS', () => {
  const s = baseState();
  s.shipments.push({ id: 'sh1', supplierId: 'sa1', currency: 'SAR', rate: 10, orderDate: '2026-01-05', status: 'received', receivedDate: '2026-01-10', items: [{ productId: 'p1', qty: 10, unitCost: 100 }], costs: [] });
  s.shipments.push({ id: 'sh2', supplierId: 'sa1', currency: 'SAR', rate: 10, orderDate: '2026-02-01', status: 'received', receivedDate: '2026-02-05', items: [{ productId: 'p1', qty: 10, unitCost: 200 }], costs: [] });
  s.sales.push({ id: 's1', date: '2026-01-20', status: 'delivered', items: [{ productId: 'p1', qty: 5, price: 1500 }], payment: 'cod', courierId: 'bosta' });
  s.sales.push({ id: 's2', date: '2026-02-10', status: 'delivered', items: [{ productId: 'p1', qty: 3, price: 1500 }], payment: 'cod', courierId: 'bosta' });
  const inv = Acc.computeInventory(s);
  near(inv.saleCogs.s1[0], 5000); // 5 × 1000
  // after sh2: (5×1000 + 10×2000)/15 = 1666.67
  near(inv.saleCogs.s2[0], 5000);
  assert.equal(inv.products.p1.qty, 12);
  near(inv.products.p1.value, 25000 - 5000);
});

test('returns restock at original cost and reverse revenue', () => {
  const s = baseState();
  s.adjustments.push({ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 4, unitCost: 1000, reason: 'opening' });
  s.sales.push({ id: 's1', no: 1, date: '2026-01-02', status: 'returned', returnDate: '2026-01-06', items: [{ productId: 'p1', qty: 1, price: 1500 }], shippingCharged: 60, courierFee: 50, returnFee: 25, payment: 'cod', courierId: 'bosta' });
  const j = Acc.buildJournal(s);
  const inv = j.inventory.products.p1;
  assert.equal(inv.qty, 4);
  near(inv.value, 4000);
  const is = Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31');
  near(is.netSales, 0);
  near(is.cogs, 0);
  near(is.netProfit, -75);
  const cb = Acc.courierBalances(s, j);
  near(cb.bosta, -75); // we owe the courier the fees
});

test('pending orders reserve stock without booking revenue', () => {
  const s = baseState();
  s.adjustments.push({ id: 'a1', date: '2026-01-01', productId: 'p2', qty: 5, unitCost: 300, reason: 'opening' });
  s.sales.push({ id: 's1', date: '2026-01-02', status: 'pending', items: [{ productId: 'p2', qty: 2, price: 900 }] });
  const j = Acc.buildJournal(s);
  assert.equal(j.inventory.products.p2.reserved, 2);
  assert.equal(j.inventory.products.p2.available, 3);
  assert.equal(j.entries.filter((e) => e.source === 'sale').length, 0);
});

test('supplier FX gain/loss on payment', () => {
  const s = baseState();
  s.shipments.push({ id: 'sh1', supplierId: 'sa1', currency: 'SAR', rate: 13, orderDate: '2026-01-05', status: 'ordered', items: [{ productId: 'p1', qty: 10, unitCost: 100 }], costs: [] });
  s.supplierPayments.push({ id: 'pay1', supplierId: 'sa1', date: '2026-01-20', amount: 1000, rate: 13.5, accountId: 'bank', fee: 20 });
  const sup = Acc.computeSuppliers(s);
  near(sup.balances.sa1.foreign, 0);
  near(sup.balances.sa1.egp, 0);
  near(sup.fx.pay1, 500); // loss 1000 × 0.5
  const j = Acc.buildJournal(s);
  const is = Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31');
  near(is.fxLoss, 500);
  const tb = Acc.trialBalance(s, j);
  assert.ok(tb.balanced);
});

test('advance payment then purchase at a different rate', () => {
  const s = baseState();
  s.supplierPayments.push({ id: 'pay1', supplierId: 'sa1', date: '2026-01-01', amount: 1000, rate: 13, accountId: 'cash', fee: 0 });
  s.shipments.push({ id: 'sh1', supplierId: 'sa1', currency: 'SAR', rate: 12.5, orderDate: '2026-01-05', status: 'ordered', items: [{ productId: 'p1', qty: 10, unitCost: 100 }], costs: [] });
  const sup = Acc.computeSuppliers(s);
  near(sup.balances.sa1.foreign, 0);
  near(sup.fx.sh1, 500); // goods booked at 12,500 but we paid 13,000 → loss 500
  const j = Acc.buildJournal(s);
  assert.ok(Acc.trialBalance(s, j).balanced);
  const bs = Acc.balanceSheet(s, j, '2026-12-31');
  assert.ok(bs.balanced);
});

test('full cycle: books balance and the balance sheet ties out', () => {
  const s = baseState();
  s.equity.push({ id: 'e1', date: '2026-01-02', type: 'capital', amount: 50000, accountId: 'bank' });
  s.shipments.push({
    id: 'sh1', supplierId: 'sa1', currency: 'SAR', rate: 13.2, orderDate: '2026-01-05', status: 'received', receivedDate: '2026-01-15',
    items: [{ productId: 'p1', qty: 20, unitCost: 80 }, { productId: 'p2', qty: 30, unitCost: 40 }],
    costs: [{ label: 'شحن جوي', amount: 3000, accountId: 'cash' }, { label: 'جمارك', amount: 2500, accountId: 'cash' }],
  });
  s.supplierPayments.push({ id: 'pay1', supplierId: 'sa1', date: '2026-01-04', amount: 2000, rate: 13.1, accountId: 'bank', fee: 50 });
  s.sales.push({ id: 's1', no: 1, date: '2026-01-20', status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 2, price: 1500 }, { productId: 'p2', qty: 1, price: 900 }], discount: 100, shippingCharged: 60, courierId: 'bosta', courierFee: 55, payment: 'cod' });
  s.sales.push({ id: 's2', no: 2, date: '2026-01-21', status: 'shipped', customerId: 'c1', items: [{ productId: 'p2', qty: 2, price: 900 }], discount: 0, shippingCharged: 0, courierId: 'bosta', courierFee: 55, payment: 'bank' });
  s.settlements.push({ id: 'st1', date: '2026-01-25', courierId: 'bosta', accountId: 'cash', amount: 3805 });
  s.expenses.push({ id: 'x1', date: '2026-01-22', category: '5300', amount: 2000, accountId: 'bank' });
  s.transfers.push({ id: 't1', date: '2026-01-26', fromId: 'cash', toId: 'bank', amount: 10000, fee: 15 });
  s.equity.push({ id: 'e2', date: '2026-01-28', type: 'drawing', amount: 1000, accountId: 'cash' });
  s.adjustments.push({ id: 'a1', date: '2026-01-29', productId: 'p2', qty: -1, reason: 'tester' });

  const j = Acc.buildJournal(s);
  j.entries.forEach((e) => {
    const dr = e.lines.reduce((a, l) => a + l.dr, 0), cr = e.lines.reduce((a, l) => a + l.cr, 0);
    assert.ok(Math.abs(dr - cr) < 0.02, `entry ${e.desc} unbalanced ${dr} ${cr}`);
  });
  const tb = Acc.trialBalance(s, j);
  assert.ok(tb.balanced);
  const bs = Acc.balanceSheet(s, j, '2026-01-31');
  assert.ok(bs.balanced, JSON.stringify(bs));
  const is = Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31');
  near(is.grossSales, 3900 + 1800);
  near(is.discounts, 100);
  near(is.shippingIncome, 60);
  // الربح المحتجز في الميزانية = صافي الربح
  near(bs.equity[2].amount, is.netProfit);
  // courier: 3860 COD - 55 - 55 fees - 3805 settled = -55 (we owe for prepaid order)
  near(Acc.courierBalances(s, j).bosta, -55);
});
