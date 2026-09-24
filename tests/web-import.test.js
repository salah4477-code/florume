const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');
const IMP = require('../js/importer.js');

function state() {
  return {
    settings: { startDate: '2026-01-01', nextInvoiceNo: 100, lowStock: 3 },
    accounts: [{ id: 'cash', name: 'الخزينة', type: 'cash', opening: 0 }, { id: 'paymob', name: 'Paymob', type: 'wallet', opening: 0 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }],
    suppliers: [], customers: [{ id: 'old', name: 'منى', phone: '01011111111', city: 'الجيزة' }],
    products: [{ id: 'kh', sku: 'LT-KH100', brand: 'لطافة', name: 'خمرة', sizeMl: 100, price: 1450 }, { id: 'yr', sku: '', brand: 'لطافة', name: 'يارا', sizeMl: 100, price: 1150 }],
    shipments: [], supplierPayments: [], sales: [], settlements: [], expenses: [], transfers: [], equity: [],
    adjustments: [{ id: 'o', date: '2026-01-01', productId: 'kh', qty: 20, unitCost: 700, reason: 'opening' }, { id: 'o2', date: '2026-01-01', productId: 'yr', qty: 20, unitCost: 500, reason: 'opening' }],
  };
}
let n = 0;
const uid = () => 'w' + n++;

const shopify = () => [{ name: 'orders_export', rows: [
  ['Name', 'Email', 'Financial Status', 'Paid at', 'Fulfillment Status', 'Currency', 'Subtotal', 'Shipping', 'Taxes', 'Total', 'Discount Code', 'Discount Amount', 'Created at', 'Lineitem quantity', 'Lineitem name', 'Lineitem price', 'Lineitem sku', 'Billing Name', 'Billing Phone', 'Shipping Address1', 'Shipping City', 'Shipping Province', 'Payment Method', 'Cancelled at'],
  ['#1001', 'a@x.com', 'pending', '', 'fulfilled', 'EGP', 2600, 60, 0, 2560, 'MARWA10', 100, '2026-09-20 14:33:12 +0300', 1, 'Lattafa Khamrah 100ml', 1450, 'LT-KH100', 'Ahmed Ali', '+201012345678', '12 Tahrir St', 'Dokki', 'Giza', 'Cash on Delivery (COD)', ''],
  ['#1001', '', '', '', '', '', '', '', '', '', '', '', '2026-09-20 14:33:12 +0300', 1, 'Lattafa Yara 100ml', 1150, '', '', '', '', '', '', '', ''],
  ['#1002', 'b@x.com', 'paid', '2026-09-21', 'unfulfilled', 'EGP', 1450, 0, 0, 1450, '', 0, '2026-09-21 10:00:00 +0300', 1, 'Lattafa Khamrah 100ml', 1450, 'LT-KH100', 'منى', '01011111111', '', '', 'Giza', 'Paymob', ''],
  ['#1003', 'c@x.com', 'refunded', '', '', 'EGP', 900, 0, 0, 900, '', 0, '2026-09-22 10:00:00 +0300', 1, 'New Oud 50ml', 900, 'NEW-50', 'X', '010', '', '', 'Cairo', 'Paymob', '2026-09-22'],
  ['#1004', 'd@x.com', 'pending', '', '', 'EGP', 900, 50, 0, 950, '', 0, '2026-09-22 11:00:00 +0300', 1, 'New Oud 50ml', 900, 'NEW-50', 'Sara', '01099999999', '', '', 'Alexandria', 'Cash on Delivery (COD)', ''],
] }];

test('Shopify export: detected, grouped per order, COD vs paid, cancelled skipped', () => {
  const sheets = shopify();
  const s = state();
  const opts = { ...IMP.defaultMappings(sheets, s), openingDate: '2026-01-01' };
  assert.equal(opts.webProducts['sku:ltkh100'], 'kh');
  assert.equal(opts.webProducts['name:lattafa yara 100ml'], 'new'); // مفيش كود — محتاج ربط يدوي
  assert.equal(opts.salesPay['Cash on Delivery (COD)'], 'cod:bosta');
  assert.equal(opts.salesPay.Paymob, 'paymob');
  opts.webProducts['name:lattafa yara 100ml'] = 'yr'; // المستخدم ربطها في المعاينة
  const plan = IMP.planImport(sheets, s, opts, uid);
  assert.equal(plan.found[0].kind, 'web');
  assert.equal(plan.sales.length, 3);
  const o1 = plan.sales.find((x) => x.webOrderNo === '#1001');
  assert.equal(o1.items.length, 2);
  assert.deepEqual(o1.items.map((it) => it.productId), ['kh', 'yr']);
  assert.equal(o1.discount, 100);
  assert.equal(o1.shippingCharged, 60);
  assert.equal(o1.payment, 'cod');
  assert.equal(o1.status, 'delivered');
  assert.equal(o1.channel, 'website');
  const newCust = plan.customers.find((c) => c.name === 'Ahmed Ali');
  assert.equal(newCust.city, 'الجيزة'); // Giza ← الجيزة
  const o2 = plan.sales.find((x) => x.webOrderNo === '#1002');
  assert.equal(o2.payment, 'paymob');
  assert.equal(o2.status, 'pending');
  assert.equal(o2.customerId, 'old'); // نفس الموبايل
  assert.ok(plan.skipped.some((x) => /#1003/.test(x.reason)));
  const newProd = plan.products.find((p) => p.fromWeb);
  assert.equal(newProd.name, 'New Oud 50ml');
  assert.equal(plan.opening.length, 0); // منتج المتجر الجديد من غير مخزون افتتاحي
  // التطبيق والدفاتر
  const after = IMP.applyImport(s, plan);
  const j = Acc.buildJournal(after);
  assert.ok(Acc.trialBalance(after, j).balanced);
  // الاستيراد مرة تانية مش بيكرر
  const again = IMP.planImport(sheets, after, opts, uid);
  assert.equal(again.sales.length, 0);
});

test('WooCommerce export', () => {
  const sheets = [{ name: 'woo', rows: [
    ['Order Number', 'Order Status', 'Order Date', 'Billing First Name', 'Billing Last Name', 'Billing Phone', 'Billing City', 'Payment Method Title', 'Cart Discount Amount', 'Order Shipping Amount', 'Order Total Amount', 'SKU', 'Item Name', 'Quantity', 'Item Cost'],
    ['5001', 'completed', '2026-09-18 12:00', 'Omar', 'Hassan', '01022222222', 'Cairo', 'الدفع عند الاستلام', 0, 55, 2955, 'LT-KH100', 'خمرة', 2, 1450],
    ['5002', 'processing', '2026-09-19 12:00', 'Laila', 'M', '01033333333', 'Alexandria', 'Paymob', 150, 0, 1000, '', 'يارا 100 مل', 1, 1150],
  ] }];
  const s = state();
  const opts = { ...IMP.defaultMappings(sheets, s), openingDate: '2026-01-01' };
  const plan = IMP.planImport(sheets, s, opts, uid);
  assert.equal(plan.found[0].kind, 'web');
  const a = plan.sales.find((x) => x.webOrderNo === '5001');
  assert.equal(a.status, 'delivered');
  assert.equal(a.items[0].qty, 2);
  assert.equal(a.payment, 'cod');
  const b = plan.sales.find((x) => x.webOrderNo === '5002');
  assert.equal(b.status, 'pending');
  assert.equal(b.discount, 150);
  assert.equal(b.payment, 'paymob');
  assert.equal(plan.customers.find((c) => c.name === 'Omar Hassan').city, 'القاهرة');
});
