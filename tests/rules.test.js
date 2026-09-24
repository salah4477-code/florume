const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');
const R = require('../js/rules.js');

function baseState() {
  return {
    settings: { startDate: '2026-01-01', invoicePrefix: 'FL-', nextInvoiceNo: 5 },
    accounts: [{ id: 'cash', name: 'الخزينة', opening: 1000 }, { id: 'bank', name: 'البنك', opening: 0 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }],
    suppliers: [{ id: 'sa1', name: 'مورد', currency: 'SAR' }],
    products: [{ id: 'p1', name: 'عود', price: 1500 }, { id: 'p2', name: 'مسك', price: 900 }],
    customers: [{ id: 'c1', name: 'أحمد' }],
    shipments: [], supplierPayments: [], sales: [], settlements: [], expenses: [], transfers: [], equity: [],
    adjustments: [{ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 3, unitCost: 500, reason: 'opening' }],
    campaigns: [], partners: [], distributions: [], decants: [], reconciliations: [],
  };
}
const sale = (id, extra) => ({ id, no: 1, date: '2026-01-10', status: 'pending', items: [{ productId: 'p1', qty: 1, price: 1500 }], courierId: 'bosta', courierFee: 50, payment: 'cod', discount: 0, shippingCharged: 0, ...extra });

test('rule 1: cannot sell more than available stock', () => {
  const s = baseState();
  const j = Acc.buildJournal(s);
  assert.equal(R.checkSaleStock(s, j, sale('x', { items: [{ productId: 'p1', qty: 3, price: 1 }] })).errors.length, 0);
  const r = R.checkSaleStock(s, j, sale('x', { items: [{ productId: 'p1', qty: 4, price: 1 }] }));
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].available, 3);
  // منتج رصيده صفر
  assert.equal(R.checkSaleStock(s, j, sale('x', { status: 'delivered', items: [{ productId: 'p2', qty: 1, price: 900 }] })).errors.length, 1);
  // الملغي لا يسحب من المخزون
  assert.equal(R.checkSaleStock(s, j, sale('x', { status: 'cancelled', items: [{ productId: 'p2', qty: 1, price: 900 }] })).errors.length, 0);
  // فاتورة الدعاية تخضع لنفس القاعدة
  assert.equal(R.checkSaleStock(s, j, sale('x', { kind: 'promo', status: 'delivered', items: [{ productId: 'p2', qty: 1, price: 0 }] })).errors.length, 1);
});

test('rule 1: other pending orders reserve stock', () => {
  const s = baseState();
  s.sales.push(sale('s1', { items: [{ productId: 'p1', qty: 2, price: 1500 }] }));
  const j = Acc.buildJournal(s);
  assert.equal(R.checkSaleStock(s, j, sale('x', { items: [{ productId: 'p1', qty: 2, price: 1 }] })).errors.length, 1);
  assert.equal(R.checkSaleStock(s, j, sale('x', { items: [{ productId: 'p1', qty: 1, price: 1 }] })).errors.length, 0);
});

test('rule 1: editing an order counts its own quantity back', () => {
  const s = baseState();
  s.sales.push(sale('s1', { status: 'delivered', items: [{ productId: 'p1', qty: 3, price: 1500 }] }));
  const j = Acc.buildJournal(s);
  assert.equal(j.inventory.products.p1.available, 0);
  const before = s.sales[0];
  assert.equal(R.checkSaleStock(s, j, { ...before, notes: 'x' }, before).errors.length, 0);
  assert.equal(R.checkSaleStock(s, j, { ...before, items: [{ productId: 'p1', qty: 4, price: 1500 }] }, before).errors.length, 1);
  // pending → shipped لنفس الطلب بعد الحجز
  s.sales[0] = sale('s1', { items: [{ productId: 'p1', qty: 3, price: 1500 }] });
  const j2 = Acc.buildJournal(s);
  assert.equal(R.checkSaleStock(s, j2, { ...s.sales[0], status: 'shipped' }, s.sales[0]).errors.length, 0);
});

test('rule 1: pending pre-order allowed only when a shipment is on the way', () => {
  const s = baseState();
  s.shipments.push({ id: 'sh', supplierId: 'sa1', currency: 'SAR', rate: 13, orderDate: '2026-01-05', status: 'transit', items: [{ productId: 'p2', qty: 5, unitCost: 10 }], costs: [] });
  const j = Acc.buildJournal(s);
  const r = R.checkSaleStock(s, j, sale('x', { items: [{ productId: 'p2', qty: 2, price: 900 }] }));
  assert.equal(r.errors.length, 0);
  assert.equal(r.preorder, true);
  assert.equal(R.checkSaleStock(s, j, sale('x', { items: [{ productId: 'p2', qty: 6, price: 900 }] })).errors.length, 1);
  // لا يخرج مع الشحن قبل وصول البضاعة
  assert.equal(R.checkSaleStock(s, j, sale('x', { status: 'shipped', items: [{ productId: 'p2', qty: 2, price: 900 }] })).errors.length, 1);
  // الطلبات المسبقة تتقاسم نفس الشحنة
  s.sales.push(sale('s1', { items: [{ productId: 'p2', qty: 4, price: 900 }] }));
  const j2 = Acc.buildJournal(s);
  assert.equal(R.checkSaleStock(s, j2, sale('x', { items: [{ productId: 'p2', qty: 2, price: 900 }] })).errors.length, 1);
  assert.equal(R.checkSaleStock(s, j2, sale('x', { items: [{ productId: 'p2', qty: 1, price: 900 }] })).errors.length, 0);
});

test('rule 1: stock-out adjustments and decants cannot exceed available', () => {
  const j = Acc.buildJournal(baseState());
  assert.equal(R.checkStockOut(j, 'p1', 3), null);
  assert.equal(R.checkStockOut(j, 'p1', 4).available, 3);
});

test('rule 2: invoice numbers never repeat', () => {
  const s = baseState();
  s.sales.push(sale('s1', { no: 5 }), sale('s2', { no: 6 }), sale('s3', { no: 9 }));
  assert.equal(R.nextFreeInvoiceNo(s), 7);
  assert.equal(R.maxInvoiceNo(s), 9);
  assert.equal(R.invoiceNoTaken(s, 6, 'new').id, 's2');
  assert.equal(R.invoiceNoTaken(s, 6, 's2'), null);
});

test('rule 3: tracking number cannot be used on two invoices', () => {
  const s = baseState();
  s.sales.push(sale('s1', { trackingNo: 'BST 123' }));
  assert.equal(R.trackingTaken(s, 'bst123', 'new').id, 's1');
  assert.equal(R.trackingTaken(s, 'BST123', 's1'), null);
  assert.equal(R.trackingTaken(s, '', 'new'), null);
  assert.equal(R.trackingTaken(s, 'BST124', 'new'), null);
});

test('rule 4: same product twice on one invoice', () => {
  const same = R.mergeLines([{ productId: 'p1', qty: 1, price: 100 }, { productId: 'p2', qty: 1, price: 50 }, { productId: 'p1', qty: 2, price: 100 }]);
  assert.equal(same.merged, true);
  assert.deepEqual(same.items.map((i) => [i.productId, i.qty]), [['p1', 3], ['p2', 1]]);
  const diff = R.mergeLines([{ productId: 'p1', qty: 1, price: 100 }, { productId: 'p1', qty: 1, price: 90 }]);
  assert.deepEqual(diff.conflicts, ['p1']);
  assert.equal(R.mergeLines([{ productId: 'p1', qty: 1, price: 1 }]).merged, false);
});

test('rule 6: discount cannot exceed item total', () => {
  assert.equal(R.discountError(sale('x', { discount: 1500 })), null);
  assert.equal(R.discountError(sale('x', { discount: 1501 })).gross, 1500);
});

test('rule 7: dates', () => {
  const s = baseState();
  assert.equal(R.beforeStart(s, '2025-12-31'), true);
  assert.equal(R.beforeStart(s, '2026-01-01'), false);
  assert.ok(R.saleDateError(sale('x', { status: 'returned', returnDate: '2026-01-09' })));
  assert.equal(R.saleDateError(sale('x', { status: 'returned', returnDate: '2026-01-10' })), null);
  const sh = { orderDate: '2026-02-01', status: 'received', receivedDate: '2026-01-30', costs: [] };
  assert.ok(R.shipmentDateError(sh));
  assert.equal(R.shipmentDateError({ ...sh, receivedDate: '2026-02-03' }), null);
  assert.ok(R.shipmentDateError({ ...sh, receivedDate: '2026-02-03', dueDate: '2026-01-15' }));
  assert.ok(R.shipmentDateError({ ...sh, receivedDate: '2026-02-03', costs: [{ label: 'شحن', date: '2026-01-20', amount: 1 }] }));
  s.expenses.push({ id: 'e', date: '2026-01-03', amount: 1 });
  assert.equal(R.earliestDocDate(s), '2026-01-01');
});

test('rule 8: reconciled invoices are locked except notes and customer details', () => {
  const s = baseState();
  const x = sale('s1', { status: 'delivered', trackingNo: 'B1' });
  s.sales.push(x);
  assert.deepEqual(R.lockedSaleChanges(s, x, { ...x, courierFee: 60 }), []);
  s.reconciliations.push({ id: 'r', lines: [{ saleId: 's1' }] });
  assert.equal(R.isReconciled(s, 's1'), true);
  assert.deepEqual(R.lockedSaleChanges(s, x, { ...x, notes: 'تم', channel: 'tiktok', campaignId: 'c' }), []);
  assert.deepEqual(R.lockedSaleChanges(s, x, { ...x, courierFee: 60, status: 'returned' }), ['الحالة', 'تكلفة الشحن']);
  assert.deepEqual(R.lockedSaleChanges(s, x, { ...x, items: [{ productId: 'p1', qty: 1, price: 1400 }] }), ['الأصناف والأسعار']);
});

test('rule 9: warn when a cash account would go negative', () => {
  const s = baseState();
  const ok = R.withDoc(s, 'expenses', { id: 'e1', date: '2026-01-05', category: '5300', amount: 900, accountId: 'cash' });
  assert.deepEqual(R.negativeCash(s, ok), []);
  const bad = R.withDoc(s, 'expenses', { id: 'e1', date: '2026-01-05', category: '5300', amount: 1200, accountId: 'cash' });
  const neg = R.negativeCash(s, bad);
  assert.equal(neg.length, 1);
  assert.equal(neg[0].after, -200);
  // تحويل من البنك الفاضي
  assert.equal(R.negativeCash(s, R.withDoc(s, 'transfers', { id: 't', date: '2026-01-05', fromId: 'bank', toId: 'cash', amount: 10, fee: 0 }))[0].id, 'bank');
  // الحساب السالب أصلًا: التحذير فقط لو هيزيد
  const s2 = bad;
  assert.deepEqual(R.negativeCash(s2, R.withDoc(s2, 'expenses', { id: 'e2', date: '2026-01-06', category: '5300', amount: 0, accountId: 'bank' })), []);
  assert.equal(R.negativeCash(s2, R.withDoc(s2, 'expenses', { id: 'e2', date: '2026-01-06', category: '5300', amount: 5, accountId: 'cash' })).length, 1);
});

test('rule 10: partner shares', () => {
  const partners = [{ id: 'a', share: 60 }, { id: 'b', share: 30 }];
  assert.equal(R.sharesTotal(partners), 90);
  assert.equal(R.sharesTotal(partners, { id: 'c', share: 10 }), 100);
  assert.equal(R.sharesTotal(partners, { id: 'b', share: 45 }), 105);
  assert.equal(R.sharesTotal([{ id: 'a', share: 33.33 }, { id: 'b', share: 33.33 }, { id: 'c', share: 33.34 }]), 100);
});
