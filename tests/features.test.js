const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');
const OPS = require('../js/ops.js');

function baseState() {
  return {
    settings: { startDate: '2026-01-01', invoicePrefix: 'FL-' },
    accounts: [{ id: 'cash', name: 'الخزينة', opening: 100000 }, { id: 'bank', name: 'البنك', opening: 0 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }, { id: 'aramex', name: 'أرامكس' }],
    suppliers: [{ id: 'sa1', name: 'مورد الرياض', currency: 'SAR' }],
    products: [{ id: 'p1', name: 'عود', price: 1500, sizeMl: 100, sku: 'OUD-100' }, { id: 'p2', name: 'مسك', price: 900, sizeMl: 100 }],
    customers: [{ id: 'c1', name: 'أحمد', phone: '01012345678' }],
    shipments: [], supplierPayments: [], sales: [], settlements: [], expenses: [], transfers: [], equity: [], adjustments: [],
    campaigns: [], partners: [], distributions: [], decants: [], reconciliations: [],
  };
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg || ''} expected ${b} got ${a}`);
const balanced = (s, j) => {
  j.entries.forEach((e) => {
    const dr = e.lines.reduce((a, l) => a + l.dr, 0), cr = e.lines.reduce((a, l) => a + l.cr, 0);
    assert.ok(Math.abs(dr - cr) < 0.02, `entry ${e.desc} unbalanced ${dr} ${cr}`);
  });
  assert.ok(Acc.trialBalance(s, j).balanced, 'trial balance');
  assert.ok(Acc.balanceSheet(s, j, '2026-12-31').balanced, 'balance sheet');
};

test('promo invoice: stock out at cost, booked as advertising, no revenue', () => {
  const s = baseState();
  s.adjustments.push({ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 5, unitCost: 600, reason: 'opening' });
  s.sales.push({ id: 'pr1', no: 7, kind: 'promo', date: '2026-01-10', status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 2, price: 0 }], courierId: 'bosta', courierFee: 50, payment: 'cod' });
  const j = Acc.buildJournal(s);
  assert.equal(j.inventory.products.p1.qty, 3);
  const is = Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31');
  near(is.grossSales, 0);
  near(is.cogs, 0);
  near(is.opex.find((o) => o.code === '5300').amount, 1250); // 2 × 600 + شحن 50
  near(is.netProfit, -1250);
  const p = Acc.saleProfit(s.sales[0], j);
  near(p.promoCost, 1250);
  near(Acc.courierBalances(s, j).bosta, -50);
  assert.equal(Acc.channelPerformance(s, j).length, 0);
  const perf = Acc.productPerformance(s, j);
  assert.equal(perf[0].promoQty, 2);
  assert.equal(perf[0].qty, 0);
  balanced(s, j);
});

test('returned promo invoice puts the pieces back and keeps only shipping cost', () => {
  const s = baseState();
  s.adjustments.push({ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 5, unitCost: 600, reason: 'opening' });
  s.sales.push({ id: 'pr1', no: 7, kind: 'promo', date: '2026-01-10', status: 'returned', returnDate: '2026-01-15', returnFee: 30, items: [{ productId: 'p1', qty: 1, price: 0 }], courierId: 'bosta', courierFee: 50, payment: 'cod' });
  const j = Acc.buildJournal(s);
  assert.equal(j.inventory.products.p1.qty, 5);
  const is = Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31');
  near(is.opex.find((o) => o.code === '5300').amount, 80);
  near(Acc.saleProfit(s.sales[0], j).promoCost, 80);
  balanced(s, j);
});

test('decant splits bottle cost by ml plus vial cost', () => {
  const s = baseState();
  s.adjustments.push({ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 2, unitCost: 1000, reason: 'opening' });
  s.products.push({ id: 'd5', name: 'عود ديكانت', sizeMl: 5, decantOf: 'p1' }, { id: 'd10', name: 'عود ديكانت', sizeMl: 10, decantOf: 'p1' });
  s.decants.push({ id: 'dc1', date: '2026-01-05', sourceProductId: 'p1', sourceQty: 1, outputs: [{ productId: 'd5', qty: 6 }, { productId: 'd10', qty: 7 }], materialsCost: 100, accountId: 'cash' });
  s.sales.push({ id: 's1', no: 1, date: '2026-01-06', status: 'delivered', items: [{ productId: 'd10', qty: 1, price: 250 }], courierId: 'bosta', courierFee: 0, payment: 'cash' });
  const j = Acc.buildJournal(s);
  const dc = j.inventory.decantCost.dc1;
  near(dc.sourceCost, 1000);
  near(dc.total, 1100);
  near(dc.costPerMl, 11); // 1100 / (30 + 70) مل
  near(dc.lines[0], 330);
  near(dc.lines[1], 770);
  assert.equal(j.inventory.products.p1.qty, 1);
  assert.equal(j.inventory.products.d5.qty, 6);
  near(j.inventory.saleCogs.s1[0], 110);
  near(j.inventory.products.d10.value, 660);
  // المخزون في الدفاتر = المخزون المحسوب
  const invBook = Acc.ledger(s, j, '1300').closing;
  const invCalc = Object.values(j.inventory.products).reduce((a, p) => a + p.value, 0);
  near(invBook, invCalc);
  balanced(s, j);
});

test('partners: capital, profit distribution and drawings through current accounts', () => {
  const s = baseState();
  s.partners.push({ id: 'pa', name: 'سالم', share: 60 }, { id: 'pb', name: 'منى', share: 40 });
  s.equity.push({ id: 'e1', date: '2026-01-01', type: 'capital', amount: 30000, accountId: 'bank', partnerId: 'pa' });
  s.adjustments.push({ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 5, unitCost: 500, reason: 'opening' });
  s.sales.push({ id: 's1', no: 1, date: '2026-01-10', status: 'delivered', items: [{ productId: 'p1', qty: 2, price: 1500 }], courierId: 'bosta', courierFee: 0, payment: 'cash' });
  let j = Acc.buildJournal(s);
  const plan = Acc.distributionPlan(s, j, '2026-01-01', '2026-01-31', 10);
  near(plan.netProfit, 2000);
  near(plan.retained, 200);
  near(plan.distributable, 1800);
  near(plan.allocations[0].amount, 1080);
  near(plan.allocations[1].amount, 720);
  s.distributions.push({ id: 'd1', date: '2026-01-31', from: '2026-01-01', to: '2026-01-31', allocations: plan.allocations });
  s.equity.push({ id: 'e2', date: '2026-02-02', type: 'drawing', amount: 500, accountId: 'cash', partnerId: 'pb' });
  j = Acc.buildJournal(s);
  const acc = Acc.partnerAccounts(s, j);
  near(acc[0].capital, 30000);
  near(acc[0].balance, 1080);
  near(acc[1].balance, 220);
  // التوزيع لا يغير صافي الربح في قائمة الدخل
  near(Acc.incomeStatement(s, j, '2026-01-01', '2026-01-31').netProfit, 2000);
  // نفس الفترة لا تتوزع مرتين
  near(Acc.distributionPlan(s, j, '2026-01-01', '2026-01-31', 10).distributable, 0);
  balanced(s, j);
});

test('campaign performance: spend, CPA and ROAS', () => {
  const s = baseState();
  s.campaigns.push({ id: 'cm1', name: 'رمضان', platform: 'facebook', budget: 5000 });
  s.adjustments.push({ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 10, unitCost: 500, reason: 'opening' });
  s.expenses.push({ id: 'x1', date: '2026-01-02', category: '5300', amount: 1000, accountId: 'bank', campaignId: 'cm1' });
  s.sales.push({ id: 's1', no: 1, date: '2026-01-05', status: 'delivered', campaignId: 'cm1', items: [{ productId: 'p1', qty: 1, price: 1500 }], courierId: 'bosta', courierFee: 50, payment: 'cod' });
  s.sales.push({ id: 's2', no: 2, date: '2026-01-06', status: 'delivered', campaignId: 'cm1', items: [{ productId: 'p1', qty: 1, price: 1500 }], courierId: 'bosta', courierFee: 50, payment: 'cod' });
  s.sales.push({ id: 's3', no: 3, date: '2026-01-06', status: 'returned', campaignId: 'cm1', items: [{ productId: 'p1', qty: 1, price: 1500 }], courierId: 'bosta', courierFee: 50, returnFee: 25, payment: 'cod' });
  s.sales.push({ id: 'pr', no: 4, kind: 'promo', date: '2026-01-03', status: 'delivered', campaignId: 'cm1', items: [{ productId: 'p1', qty: 1, price: 0 }], courierId: 'bosta', courierFee: 0, payment: 'cod' });
  const j = Acc.buildJournal(s);
  const [r] = Acc.campaignPerformance(s, j);
  near(r.spend, 1500); // 1000 إعلانات + قطعة دعاية بتكلفة 500
  assert.equal(r.orders, 3);
  assert.equal(r.returned, 1);
  near(r.revenue, 3000);
  near(r.grossProfit, 2 * (1500 - 500 - 50) - 75);
  near(r.cpa, 750);
  near(r.roas, 2);
  near(r.netProfit, 1825 - 1500);
});

test('courier statement reconciliation finds differences and missing orders', () => {
  const s = baseState();
  s.adjustments.push({ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 10, unitCost: 500, reason: 'opening' });
  const sale = (id, no, extra) => ({ id, no, date: '2026-01-05', status: 'delivered', items: [{ productId: 'p1', qty: 1, price: 1000 }], courierId: 'bosta', courierFee: 50, payment: 'cod', ...extra });
  s.sales.push(sale('s1', 1, { trackingNo: 'BST111' }), sale('s2', 2, { trackingNo: 'BST222' }), sale('s3', 3, {}), sale('s4', 4, { status: 'returned', returnFee: 20 }), sale('s5', 5, {}));
  const sheets = [{ name: 'كشف', rows: [
    ['كشف حساب بوسطة'],
    ['رقم البوليصة', 'المبلغ المحصل', 'مصاريف الشحن', 'الحالة'],
    ['BST111', '1,000', 50, 'تم التسليم'],
    ['bst222', 1000, 65, 'تم التسليم'],
    ['FL-3', 900, 50, 'تم التسليم'],
    ['FL-4', 0, 70, 'مرتجع'],
    ['XYZ', 300, 40, 'تم التسليم'],
  ] }];
  const st = OPS.parseStatement(sheets);
  assert.equal(st.rows.length, 5);
  const r = OPS.reconcile(s, 'bosta', st.rows, 'FL-');
  assert.equal(r.matched.length, 4);
  assert.equal(r.unmatched.length, 1);
  const byId = Object.fromEntries(r.matched.map((m) => [m.saleId, m]));
  assert.equal(byId.s1.issues.length, 0);
  near(byId.s2.feeDiff, 15);
  near(byId.s3.codDiff, -100);
  assert.equal(byId.s4.issues.length, 0); // مرتجع: 50 شحن + 20 مرتجع
  assert.deepEqual(r.missing.map((m) => m.saleId), ['s5']);
  near(r.totals.statementNet, 950 + 935 + 850 - 70 + 260);
  // بعد حفظ التسوية لا يظهر الطلب كمستحق
  s.reconciliations.push({ id: 'r1', courierId: 'bosta', lines: r.matched.map((m) => ({ saleId: m.saleId })) });
  const un = OPS.unsettledByCourier(s, '2026-01-31');
  assert.equal(un.bosta.count, 1);
  near(un.bosta.net, 950);
});

test('bosta cash-cycle export: total fees, online payments and matching by customer phone', () => {
  const s = baseState();
  s.adjustments.push({ id: 'a1', date: '2026-01-01', productId: 'p1', qty: 10, unitCost: 500, reason: 'opening' });
  s.customers.push({ id: 'c2', name: 'منى', phone: '01060626278' });
  const sale = (id, no, extra) => ({ id, no, date: '2026-09-15', status: 'shipped', items: [{ productId: 'p1', qty: 1, price: 1000 }], courierId: 'bosta', courierFee: 40, payment: 'cod', ...extra });
  s.sales.push(
    sale('s1', 1, { trackingNo: '9487283740' }),
    sale('s2', 2, { customerId: 'c2', date: '2026-09-01', items: [{ productId: 'p1', qty: 1, price: 900 }] }),
    sale('s3', 3, { customerId: 'c2' }),
    sale('s4', 4, { customerId: 'c1', status: 'shipped' }),
  );
  const head = ['Order Id', 'Order Status', 'Order Reference', 'Customer Phone', 'Completed At', 'COD', 'Online Payment Amount', 'Shipping Fees', 'VAT', 'Total Fees', 'Net Value'];
  const sheets = [{ name: 'Cash Cycles', rows: [head,
    ['9487283740', 'DELIVERED', 'N/A', '+201229879769', 46282.7, 1000, 0, '110.00', '0.70', 5.7, 994.3],
    ['4536951434', 'DELIVERED', 'N/A', '+201060626278', 46285.6, 1000, 0, '107.00', '5.53', 45.03, 954.97],
    ['8331985527', 'DELIVERED', 'N/A', '+201012345678', 46285.9, 0, 1000, '110.00', '2.80', 22.8, 977.2],
    ['7777777777', 'RETURNED', 'N/A', '+201555555555', 46285.9, 0, 0, '92.00', '1.40', 11.4, -11.4],
  ] }];
  const st = OPS.parseStatement(sheets);
  assert.equal(st.rows.length, 4);
  // «Total Fees» مش «Shipping Fees»، والدفع الأونلاين محسوب مع التحصيل
  assert.deepEqual(st.rows.map((r) => [r.ref, r.cod, r.fee]), [['9487283740', 1000, 5.7], ['4536951434', 1000, 45.03], ['8331985527', 1000, 22.8], ['7777777777', 0, 11.4]]);
  assert.equal(st.rows[1].date, '2026-09-20'); // 14:24 ما تبقاش اليوم اللي بعده
  assert.equal(st.rows[1].phone, '01060626278');
  const r = OPS.reconcile(s, 'bosta', st.rows, 'FL-');
  const byRef = Object.fromEntries(r.matched.map((m) => [m.ref, m]));
  assert.equal(byRef['9487283740'].saleId, 's1');
  assert.equal(byRef['9487283740'].matchedBy, 'ref');
  // نفس التليفون عنده طلبين: يختار اللي مبلغه زي المحصل
  assert.equal(byRef['4536951434'].saleId, 's3');
  assert.equal(byRef['4536951434'].matchedBy, 'phone');
  near(byRef['4536951434'].feeDiff, 5.03);
  assert.equal(byRef['8331985527'].saleId, 's4');
  assert.deepEqual(r.unmatched.map((u) => u.ref), ['7777777777']);
  near(r.totals.statementNet, 994.3 + 954.97 + 977.2 - 11.4);
});

test('courier fee calculator matches bosta cash-cycle rows', () => {
  const calc = { enabled: true, shippingFree: true };
  // كل سطر من كشف بوسطة: [التحصيل، القيمة المعلنة، فتح الشحنة، إجمالي المستحقات في الكشف]
  [[850, 850, false, 5.7], [2350, 2350, false, 17.39], [8000, 8000, false, 91.2], [3700, 2000, true, 38.76],
    [4250, 2000, true, 45.03], [4070, 2000, true, 42.98], [3900, 1500, true, 38.19], [0, 1200, false, 6.84]]
    .forEach(([cod, value, open, total]) => near(OPS.courierFeeCalc(calc, { shipping: 107, cod, value, open }).total, total, `cod ${cod}`));
  const r = OPS.courierFeeCalc(calc, { cod: 4250, value: 2000, open: true });
  assert.deepEqual([r.insurance, r.collection, r.open, r.vat], [10, 22.5, 7, 5.53]);
  // من غير باقة: سعر الشحن بيدخل وعليه ضريبة
  near(OPS.courierFeeCalc({ shippingFree: false }, { shipping: 100, cod: 1000, value: 1000 }).total, (100 + 5) * 1.14);
  // أقصى قيمة معلنة
  near(OPS.courierFeeCalc({ shippingFree: true, declaredMax: 2000 }, { cod: 4250, value: 4250, open: true }).total, 45.03);
});

test('alerts: late orders, supplier due dates, stagnant stock', () => {
  const s = baseState();
  s.shipments.push({ id: 'sh1', ref: 'SA-1', supplierId: 'sa1', currency: 'SAR', rate: 13, orderDate: '2026-01-01', dueDate: '2026-03-05', status: 'received', receivedDate: '2026-01-03', items: [{ productId: 'p1', qty: 10, unitCost: 100 }, { productId: 'p2', qty: 10, unitCost: 50 }], costs: [] });
  s.sales.push({ id: 's1', no: 1, date: '2026-02-25', status: 'shipped', items: [{ productId: 'p1', qty: 1, price: 1500 }], courierId: 'bosta', payment: 'cod' });
  s.sales.push({ id: 's2', no: 2, date: '2026-02-27', status: 'pending', items: [{ productId: 'p1', qty: 1, price: 1500 }], courierId: 'bosta', payment: 'cod' });
  const j = Acc.buildJournal(s);
  const list = OPS.alerts(s, j, '2026-03-04', {});
  const types = list.map((a) => a.type);
  assert.ok(types.includes('shipped'));
  assert.ok(types.includes('pending'));
  assert.ok(types.includes('due'));
  const stagnant = list.filter((a) => a.type === 'stagnant').map((a) => a.id);
  assert.deepEqual(stagnant, ['p2']);
});

test('whatsapp phone normalisation', () => {
  assert.equal(OPS.waPhone('010 1234 5678'), '201012345678');
  assert.equal(OPS.waPhone('+20 101 234 5678'), '201012345678');
  assert.equal(OPS.waPhone('٠١٠١٢٣٤٥٦٧٨'), '201012345678');
  assert.equal(OPS.waPhone('00966500000000'), '966500000000');
  assert.equal(OPS.waPhone('123'), '');
});

test('code 128 table and encoding', () => {
  assert.equal(OPS.C128.length, 107);
  assert.equal(new Set(OPS.C128).size, 107);
  OPS.C128.slice(0, 106).forEach((p) => assert.equal(p.split('').reduce((a, b) => a + +b, 0), 11));
  // "PJJ123C": (104 + 48 + 42×2 + 42×3 + 17×4 + 18×5 + 19×6 + 35×7) mod 103 = 55
  const w = OPS.code128('PJJ123C');
  const symbols = [];
  for (let i = 0; i + 6 <= w.length - 7; i += 6) symbols.push(OPS.C128.indexOf(w.slice(i, i + 6).join('')));
  assert.equal(symbols[0], 104);
  assert.equal(symbols[symbols.length - 1], 55);
  assert.throws(() => OPS.code128('عود'));
  assert.equal(OPS.findByCode([{ id: 'x', sku: 'oud-100' }], 'OUD-100').id, 'x');
});

test('supplier due alert only for the shipment still unpaid (payments settle oldest first)', () => {
  const s = baseState();
  s.shipments.push({ id: 'old', ref: 'OLD', supplierId: 'sa1', currency: 'SAR', rate: 13, orderDate: '2026-01-01', dueDate: '2026-01-20', status: 'ordered', items: [{ productId: 'p1', qty: 10, unitCost: 100 }], costs: [] });
  s.shipments.push({ id: 'new', ref: 'NEW', supplierId: 'sa1', currency: 'SAR', rate: 13, orderDate: '2026-02-01', dueDate: '2026-03-06', status: 'ordered', items: [{ productId: 'p2', qty: 10, unitCost: 50 }], costs: [] });
  s.supplierPayments.push({ id: 'pay', supplierId: 'sa1', date: '2026-01-15', amount: 1200, rate: 13, accountId: 'bank', fee: 0 });
  const j = Acc.buildJournal(s);
  assert.deepEqual(OPS.shipmentOutstanding(s, j), { new: 300, old: 0 });
  const due = OPS.alerts(s, j, '2026-03-04', {}).filter((a) => a.type === 'due');
  assert.equal(due.length, 1);
  assert.match(due[0].title, /NEW/);
});

test('recurring monthly expenses: due months that are not posted yet', () => {
  const s = baseState();
  s.recurring = [{ id: 'rent', category: '5600', amount: 5000, accountId: 'bank', day: 31, startMonth: '2026-01', notes: 'إيجار' }, { id: 'off', active: false, amount: 1, startMonth: '2026-01' }];
  s.expenses.push({ id: 'e1', date: '2026-01-31', category: '5600', amount: 5000, accountId: 'bank', recurringId: 'rent', period: '2026-01' });
  const due = OPS.dueRecurring(s, '2026-03-15');
  assert.deepEqual(due.map((d) => d.date), ['2026-02-28']); // فبراير آخره 28، ومارس لسه ما جاش يوم 31
  assert.equal(OPS.dueRecurring(s, '2026-03-31').length, 2);
});
