const test = require('node:test');
const assert = require('node:assert/strict');
const OPS = require('../js/ops.js');

// نفس أعمدة كشف «Cash Cycles» من بوسطة، ببيانات تجريبية
const HEAD = ['Business ID', 'Business Name', 'Order Id', 'Order Type', 'Package size', 'Order Status', 'Order Reference', 'Package Description', 'Customer Name', 'Customer Phone', 'Completed At', 'Confirmed At', 'Pickup City', 'Dropoff City', 'COD', 'Online Payment Amount', 'Shipping Fees', 'Insurance Fees', 'Collection Fees', 'Next Day Transfer Fees', '0 COD Discount', 'Promotion Discount', 'POS Fees', 'COD Fees', 'Fulfillment Fees', 'VAT', 'Bosta Credits', 'Opening Package Fees', 'Testing Package Fees', 'Flex Ship Fees', 'Flex Ship Amount', 'Bundle Discount', 'Total Fees', 'Net Value', 'Payment Status', 'Paid At', 'Cash-out ID'];
const row = (o) => HEAD.map((h) => (h in o ? o[h] : '0'));
const sheet = (rows) => [{ name: 'Cash Cycles', rows: [HEAD, ...rows.map(row)] }];
const R = (id, status, phone, cod, total, net, extra) => ({ 'Order Id': id, 'Order Status': status, 'Order Reference': 'N/A', 'Customer Phone': phone, 'Completed At': '46236.70', COD: String(cod), 'Shipping Fees': '110.00', 'Bundle Discount': '110', 'Total Fees': String(total), 'Net Value': String(net), 'Paid At': '46246', 'Cash-out ID': 'WEDCOD23SEP26', ...extra });

test('reads a Bosta Cash Cycles statement: Order Id, Total Fees (not Shipping Fees), Net, dates, phone, cash-out', () => {
  const p = OPS.parseStatement(sheet([R('9487283740', 'DELIVERED', '+201229870000', 850, 5.7, 844.3), R('1807079548', 'RETURNED', '+201098390000', 0, 16.53, -16.53)]));
  assert.ok(p, 'statement recognised');
  const [a, b] = p.rows;
  assert.equal(a.ref, '9487283740');
  assert.equal(a.cod, 850); assert.equal(a.fee, 5.7, 'Total Fees, not the 110 shipping before the bundle discount');
  assert.equal(a.net, 844.3); assert.equal(b.net, -16.53);
  assert.equal(a.date, '2026-08-02', '46236.70 = 2 Aug 4:52 PM, not rounded to the next day'); assert.equal(a.paidAt, '2026-08-12');
  assert.equal(a.status, 'DELIVERED'); assert.equal(a.phone, '+201229870000'); assert.equal(a.ref2, '', 'N/A reference ignored');
  assert.equal(p.paidAt, '2026-08-12'); assert.deepEqual(p.batches, ['WEDCOD23SEP26']);
});

const state = () => ({
  settings: { invoicePrefix: 'FL-' },
  customers: [{ id: 'c1', name: 'أ', phone: '01229870000' }, { id: 'c2', name: 'ب', phone: '01098390000' }, { id: 'c3', name: 'ج', phone: '01111770000' }, { id: 'c4', name: 'د', phone: '01000000004' }],
  sales: [
    { id: 's1', no: 1, date: '2026-07-30', status: 'shipped', customerId: 'c1', courierId: 'bosta', items: [{ productId: 'p', qty: 1, price: 850 }], payment: 'cod', courierFee: 5.7 }, // من غير رقم بوليصة
    { id: 's2', no: 2, date: '2026-07-31', status: 'shipped', customerId: 'c2', courierId: 'bosta', items: [{ productId: 'p', qty: 1, price: 900 }], payment: 'cod', courierFee: 10 },
    { id: 's3', no: 3, date: '2026-07-29', status: 'delivered', customerId: 'c3', courierId: 'bosta', trackingNo: '5400761980', items: [{ productId: 'p', qty: 1, price: 2350 }], payment: 'cod', courierFee: 17.39 },
    { id: 's4a', no: 4, date: '2026-07-20', status: 'shipped', customerId: 'c4', courierId: 'bosta', items: [{ productId: 'p', qty: 1, price: 500 }], payment: 'cod' },
    { id: 's4b', no: 5, date: '2026-07-20', status: 'shipped', customerId: 'c4', courierId: 'bosta', items: [{ productId: 'p', qty: 1, price: 500 }], payment: 'cod' },
  ],
  reconciliations: [],
});

test('matches by tracking number first, then by customer phone and amount', () => {
  const rows = OPS.parseStatement(sheet([
    R('9487283740', 'DELIVERED', '+201229870000', 850, 5.7, 844.3), // s1 بالموبايل والمبلغ
    R('5400761980', 'DELIVERED', '+201111770000', 2350, 17.39, 2332.61), // s3 برقم البوليصة
    R('1807079548', 'RETURNED', '+20 109 839 0000', 0, 16.53, -16.53), // s2 مرتجع بالموبايل
    R('7777777777', 'DELIVERED', '01000000004', 500, 10, 490), // عميل له طلبين بنفس المبلغ ونفس اليوم: مش هنخمن
    R('8888888888', 'DELIVERED', '01555555555', 300, 10, 290), // موبايل مش موجود
  ])).rows;
  const res = OPS.reconcile(state(), 'bosta', rows, 'FL-');
  const by = Object.fromEntries(res.matched.map((m) => [m.ref, m]));
  assert.equal(by['5400761980'].saleId, 's3'); assert.equal(by['5400761980'].via, 'ref');
  assert.equal(by['9487283740'].saleId, 's1'); assert.equal(by['9487283740'].via, 'phone');
  assert.equal(by['9487283740'].issues.filter((i) => /محصل/.test(i)).length, 0, 'amount matches');
  assert.equal(by['1807079548'].saleId, 's2'); assert.equal(by['1807079548'].statementStatus, 'returned');
  assert.equal(res.unmatched.length, 2);
  assert.match(res.unmatched.find((u) => u.ref === '7777777777').hint, /طلبات لنفس العميل/);
  assert.equal(res.totals.byPhone, 2);
  assert.equal(res.totals.statementNet, Math.round((844.3 + 2332.61 - 16.53 + 490 + 290) * 100) / 100, 'uses the Net Value column');
});

test('a sale with a different tracking number is never matched by phone', () => {
  const s = state(); s.sales[0].trackingNo = '1111111111';
  const rows = OPS.parseStatement(sheet([R('9487283740', 'DELIVERED', '+201229870000', 850, 5.7, 844.3)])).rows;
  const res = OPS.reconcile(s, 'bosta', rows, 'FL-');
  assert.equal(res.matched.length, 0);
});

test('Excel serial dates keep the day even when the time is after noon', () => {
  const IMP = require('../js/importer.js');
  assert.equal(IMP.toDate(46236.703245729164), '2026-08-02');
  assert.equal(IMP.toDate(46236.2), '2026-08-02');
  assert.equal(IMP.toDate(46246), '2026-08-12');
});

test('each cash-out is its own transfer with its date; unpaid lines wait for the next statement', () => {
  assert.equal(OPS.batchDate('WEDCOD23SEP26'), '2026-09-23');
  assert.equal(OPS.batchDate('WEDCOD30SEP26'), '2026-09-30');
  assert.equal(OPS.batchDate('N/A'), '');
  const rows = OPS.parseStatement(sheet([
    R('9487283740', 'DELIVERED', '+201229870000', 850, 5.7, 844.3, { 'Cash-out ID': 'WEDCOD23SEP26', 'Payment Status': 'Paid' }),
    R('5400761980', 'DELIVERED', '+201111770000', 2350, 17.39, 2332.61, { 'Cash-out ID': 'WEDCOD23SEP26', 'Payment Status': 'Paid' }),
    R('1807079548', 'RETURNED', '+201098390000', 0, 16.53, -16.53, { 'Cash-out ID': 'WEDCOD30SEP26', 'Payment Status': 'Paid' }),
    R('9999999999', 'RETURNED', '+201098390000', 0, 11.4, -11.4, { 'Cash-out ID': 'N/A', 'Payment Status': 'Not Paid' }),
  ])).rows;
  assert.equal(rows[3].pending, true); assert.equal(rows[3].batch, '');
  const tr = OPS.statementTransfers(rows);
  assert.deepEqual(tr.map((t) => [t.batch, t.date, t.net, t.count]), [['WEDCOD23SEP26', '2026-09-23', 3176.91, 2], ['WEDCOD30SEP26', '2026-09-30', -16.53, 1]]);
  const res = OPS.reconcile(state(), 'bosta', rows, 'FL-');
  assert.equal(res.totals.statementNet, Math.round((3176.91 - 16.53) * 100) / 100, 'unpaid line not counted as received');
  assert.equal(res.totals.pendingNet, -11.4);
  assert.equal(res.pending.length, 1);
  assert.ok(!res.matched.some((m) => m.ref === '9999999999'), 'unpaid line is not reconciled now');
  assert.ok(!res.unmatched.some((m) => m.ref === '9999999999'));
});
