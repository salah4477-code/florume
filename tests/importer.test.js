const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');
const IMP = require('../js/importer.js');

// ملف بصيغة تصدير Florume ERP ببيانات وهمية
const sheets = () => [
  { name: 'المبيعات', rows: [
    ['orderNo', 'trackingNo', 'type', 'date', 'customerName', 'customerPhone', 'customerAddress', 'productName', 'qty', 'netTotal', 'cogs', 'profit', 'account'],
    ['1', '111#', 'sale', '2026-07-30', 'عميل أ', '01000000001', 'شارع 1 - مدينة نصر, القاهره', 'عطر ألف', 1, 2000, 1000, 1000, 'shipping'],
    ['2', '222#', 'sale', '2026-08-02', 'عميل ب', '01000000002', 'الدقي, الجيزه', 'عطر ألف', 1, 1900, 1000, 900, 'bank'],
    ['3', '222#', 'sale', '2026-08-02', 'عميل ب', '01000000002', 'الدقي, الجيزه', 'بوكس باء', 2, 6000, 3000, 3000, 'bank'],
    ['4', null, 'promo', '2026-08-03', 'مؤثرة', null, 'القاهرة', 'بوكس باء', 1, 0, 1500, 0, 'عينات دعاية'],
    ['5', '333#', 'sale', '03/08/2026', 'عميل أ', '٠١٠٠٠٠٠٠٠٠١', '', 'عطر ألف', 1, 2000, 1000, 1000, 'shipping'],
  ] },
  { name: 'المرتجعات', rows: [[null]] },
  { name: 'المخزون', rows: [
    ['sku', 'name', 'qty', 'cost', 'price'],
    ['A-1', 'عطر ألف', 5, 1000, 2000],
    ['B-1', 'بوكس باء', 2, 1500, 3000],
  ] },
  { name: 'المصاريف التشغيلية', rows: [
    ['date', 'category', 'amount', 'payment', 'desc'],
    ['2026-08-03', 'تسويق وإعلانات', 1500, 'مخزون', 'عينة دعاية (فاتورة #4) - بوكس باء'],
    ['2026-08-05', 'تغليف', 300, 'cash', 'علب'],
  ] },
];

function baseState() {
  return {
    settings: { startDate: '2026-09-01', nextInvoiceNo: 1, lowStock: 3 },
    accounts: [{ id: 'cash', name: 'الخزينة', type: 'cash', opening: 0 }, { id: 'bank', name: 'البنك', type: 'bank', opening: 0 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }],
    suppliers: [], products: [], customers: [], shipments: [], supplierPayments: [], sales: [], settlements: [], expenses: [], transfers: [], equity: [], adjustments: [],
  };
}
let n = 0;
const uid = () => 'id' + n++;

test('detects sheets and ignores empty ones', () => {
  const { found, ignored } = IMP.detectSheets(sheets());
  assert.deepEqual(found.map((f) => f.kind), ['sales', 'stock', 'expenses']);
  assert.equal(ignored[0].name, 'المرتجعات');
});

test('default mappings: shipping → COD, bank → bank account, stock-paid expenses skipped', () => {
  const m = IMP.defaultMappings(sheets(), baseState());
  assert.equal(m.salesPay.shipping, 'cod:bosta');
  assert.equal(m.salesPay.bank, 'bank');
  assert.equal(m.expensePay['مخزون'], 'skip');
  assert.equal(m.expensePay.cash, 'cash');
  assert.equal(m.openingDate, '2026-07-30');
});

test('plan groups lines by tracking number, dedupes customers by phone, turns promos into stock deductions', () => {
  const st = baseState();
  const plan = IMP.planImport(sheets(), st, IMP.defaultMappings(sheets(), st), uid);
  assert.equal(plan.sales.length, 3);
  const two = plan.sales.find((s) => s.importRef === 'erp:222');
  assert.equal(two.items.length, 2);
  assert.equal(two.payment, 'bank');
  assert.equal(two.items[1].price, 3000);
  assert.equal(plan.customers.length, 2); // «عميل أ» مرتين بنفس الموبايل (أرقام عربية)
  assert.equal(plan.promos.length, 1);
  assert.equal(plan.promos[0].reason, 'promo');
  assert.equal(plan.expenses.length, 1);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.errors.length, 0);
  // مخزون افتتاحي = الرصيد الحالي + ما خرج
  const a = plan.opening.find((o) => o.importRef === 'erp:opening:A-1');
  const b = plan.opening.find((o) => o.importRef === 'erp:opening:B-1');
  assert.equal(a.qty, 5 + 3);
  assert.equal(b.qty, 2 + 2 + 1);
});

test('applied import reproduces the file: stock, revenue, cost and promo expense', () => {
  const st = baseState();
  const plan = IMP.planImport(sheets(), st, IMP.defaultMappings(sheets(), st), uid);
  const s = IMP.applyImport(st, plan);
  const j = Acc.buildJournal(s);
  const pA = s.products.find((p) => p.sku === 'A-1'), pB = s.products.find((p) => p.sku === 'B-1');
  assert.equal(j.inventory.products[pA.id].qty, 5);
  assert.equal(j.inventory.products[pB.id].qty, 2);
  const is = Acc.incomeStatement(s, j, '', '');
  assert.equal(is.netSales, 2000 + 1900 + 6000 + 2000);
  assert.equal(is.cogs, 1000 * 3 + 1500 * 2);
  assert.equal(is.opex.find((o) => o.code === '5300').amount, 1500);
  assert.equal(is.opex.find((o) => o.code === '5400').amount, 300);
  assert.ok(Acc.trialBalance(s, j).balanced);
  assert.ok(Acc.balanceSheet(s, j, '2026-12-31').balanced);
  assert.equal(s.settings.startDate, '2026-07-30');
  assert.deepEqual(s.sales.map((x) => x.no), [1, 2, 3]);
});

test('importing the same file twice adds nothing', () => {
  const st = baseState();
  const s = IMP.applyImport(st, IMP.planImport(sheets(), st, IMP.defaultMappings(sheets(), st), uid));
  const again = IMP.planImport(sheets(), s, IMP.defaultMappings(sheets(), s), uid);
  assert.equal(again.sales.length, 0);
  assert.equal(again.promos.length, 0);
  assert.equal(again.opening.length, 0);
  assert.equal(again.expenses.length, 0);
  assert.equal(again.products.filter((p) => p.isNew).length, 0);
});

test('bad rows are reported, not imported', () => {
  const sh = sheets();
  sh[0].rows.push(['6', '444#', 'sale', 'امبارح', 'عميل ج', '01000000003', '', 'عطر ألف', 1, 2000, 1000, 1000, 'shipping']);
  sh[0].rows.push(['7', '555#', 'sale', '2026-08-09', 'عميل ج', '01000000003', '', 'عطر ألف', 0, 2000, 1000, 1000, 'shipping']);
  const st = baseState();
  const plan = IMP.planImport(sh, st, IMP.defaultMappings(sh, st), uid);
  assert.equal(plan.errors.length, 2);
  assert.equal(plan.sales.length, 3);
});

test('date and number parsing', () => {
  assert.equal(IMP.toDate('2026-7-3'), '2026-07-03');
  assert.equal(IMP.toDate('03/08/2026'), '2026-08-03');
  assert.equal(IMP.toDate('٠٣/٠٨/٢٠٢٦'), '2026-08-03');
  assert.equal(IMP.toDate(46233), '2026-07-30');
  assert.equal(IMP.toNumber('1,250 ج.م'), 1250);
  assert.equal(IMP.phoneKey('+20 100 000 0001'), '01000000001');
});

test('CSV parsing handles quotes and semicolons', () => {
  const rows = IMP.parseCsv('﻿name;qty\n"عطر ""خاص""";3\n');
  assert.deepEqual(rows, [['name', 'qty'], ['عطر "خاص"', '3']]);
});
