const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');
const PLAN = require('../js/planning.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg || ''} expected ${b} got ${a}`);
function base() {
  return {
    settings: { startDate: '2026-01-01', rates: { SAR: 14 }, targetMargin: 30, leadDays: 14, safetyDays: 7, coverDays: 30, reorderAfterDays: 75, alerts: { settleDays: 14 } },
    accounts: [{ id: 'bank', name: 'البنك', opening: 20000 }],
    couriers: [{ id: 'bosta', name: 'بوسطة' }], suppliers: [{ id: 'sa', name: 'مورد', currency: 'SAR', leadDays: 10 }],
    products: [{ id: 'p1', name: 'عود', price: 1500, sizeMl: 100 }, { id: 'p2', name: 'مسك', price: 600, sizeMl: 100 }],
    customers: [{ id: 'c1', name: 'أحمد' }, { id: 'c2', name: 'منى' }, { id: 'c3', name: 'سارة' }],
    shipments: [{ id: 'sh', ref: 'SA-1', supplierId: 'sa', currency: 'SAR', rate: 13, orderDate: '2026-01-02', status: 'received', receivedDate: '2026-01-05', items: [{ productId: 'p1', qty: 40, unitCost: 50 }, { productId: 'p2', qty: 10, unitCost: 20 }], costs: [{ amount: 1300, basis: 'value', accountId: 'bank' }] }],
    supplierPayments: [], settlements: [], expenses: [], transfers: [], equity: [], adjustments: [], decants: [], recurring: [], reconciliations: [],
    sales: [],
  };
}
const sale = (id, date, extra) => ({ id, no: id, date, status: 'delivered', customerId: 'c1', items: [{ productId: 'p1', qty: 1, price: 1500 }], courierId: 'bosta', courierFee: 60, shippingCharged: 50, payment: 'cod', ...extra });

test('pricing: break-even and target price include per-order overheads', () => {
  const s = base();
  for (let i = 0; i < 8; i++) s.sales.push(sale('s' + i, `2026-03-${String(i + 1).padStart(2, '0')}`));
  s.sales.push(sale('r1', '2026-03-10', { status: 'returned', returnDate: '2026-03-14', returnFee: 30 }));
  s.sales.push(sale('r2', '2026-03-11', { status: 'returned', returnDate: '2026-03-15', returnFee: 30 }));
  s.expenses.push({ id: 'ad', date: '2026-03-01', category: '5300', amount: 1600, accountId: 'bank' });
  const j = Acc.buildJournal(s);
  const pr = PLAN.pricing(s, j, '2026-03-31');
  const oh = pr.overheads;
  near(oh.returnRate, 0.2);
  near(oh.cpa, 200); // 1600 ÷ 8 طلبات اتسلمت
  near(oh.returnLoss, 0.2 * (60 + 30));
  near(oh.perOrder, (60 - 50) + 200 + 18);
  // متوسط قيمة الطلب 1500 → المصاريف 228 = 15.2٪ من السعر
  near(oh.orderValue, 1500);
  near(oh.share, 228 / 1500);
  const p1 = pr.rows.find((r) => r.productId === 'p1');
  // تكلفة الوحدة: 50×13 = 650 + نصيبها من 1300 بالقيمة (26000 من 28600) = 650 + 29.55
  near(p1.avgCost, 679.55);
  // لو اشتريت النهارده بسعر 14: 50×14 + 29.55 = 729.55 (أعلى) → بيتحسب على الأعلى
  near(p1.repl.costNow, 729.55);
  assert.equal(p1.fxUp, true);
  near(p1.breakEven, 729.55 / (1 - 0.152));
  assert.equal(p1.targetPrice, Math.ceil((729.55 / (1 - 0.152 - 0.3)) / 5) * 5);
  near(p1.netMargin, (1500 - 729.55 - 1500 * 0.152) / 1500);
  assert.equal(p1.status, 'ok');
  // المسك بسعر 600: 291.82 + 600×15.2٪ = 383 ← كسبان بهامش 36٪
  const p2 = pr.rows.find((r) => r.productId === 'p2');
  near(p2.breakEven, 291.82 / (1 - 0.152));
  assert.equal(p2.status, 'ok');
  // لو نزلنا سعره لـ 330 يبقى تحت التعادل (344)
  s.products[1].price = 330;
  assert.equal(PLAN.pricing(s, j, '2026-03-31').rows.find((r) => r.productId === 'p2').status, 'loss');
});

test('reorder plan uses sales speed, lead time and incoming stock', () => {
  const s = base();
  for (let i = 0; i < 30; i++) s.sales.push(sale('s' + i, `2026-03-${String((i % 28) + 1).padStart(2, '0')}`));
  s.shipments.push({ id: 'sh2', supplierId: 'sa', currency: 'SAR', rate: 13, orderDate: '2026-03-25', status: 'transit', items: [{ productId: 'p2', qty: 5, unitCost: 20 }], costs: [] });
  const j = Acc.buildJournal(s);
  const plan = PLAN.reorderPlan(s, j, '2026-03-31', { windowDays: 60 });
  const p1 = plan.find((r) => r.productId === 'p1');
  near(p1.velocity, 0.5); // 30 قطعة في 60 يوم
  assert.equal(p1.available, 10);
  assert.equal(p1.lead, 10); // مدة توريد المورد
  assert.equal(p1.coverDays, 20);
  assert.equal(p1.status, 'soon'); // 20 يوم أكبر من 10+7 وأقل من 31
  assert.equal(p1.suggest, Math.ceil(0.5 * (10 + 7 + 30) - 10));
  const p2 = plan.find((r) => r.productId === 'p2');
  assert.equal(p2.status, 'idle');
  assert.equal(p2.incoming, 5);
});

test('cash forecast: courier collections in, supplier dues and recurring out', () => {
  const s = base();
  s.sales.push(sale('d1', '2026-03-25')); // اتسلم: يتحصل بعد 14 يوم
  s.shipments.push({ id: 'sh2', ref: 'SA-2', supplierId: 'sa', currency: 'SAR', rate: 13, orderDate: '2026-03-20', dueDate: '2026-04-10', status: 'transit', items: [{ productId: 'p1', qty: 10, unitCost: 50 }], costs: [] });
  s.recurring.push({ id: 'rent', category: '5600', amount: 3000, accountId: 'bank', day: 5, startMonth: '2026-04', notes: 'إيجار' });
  const j = Acc.buildJournal(s);
  const fc = PLAN.cashForecast(s, j, '2026-04-01', 4);
  const all = fc.weeks.flatMap((w) => w.items);
  near(all.find((i) => i.kind === 'courier').amount, 1550 - 60);
  assert.equal(all.find((i) => i.kind === 'courier').date, '2026-04-08');
  near(all.find((i) => i.kind === 'supplier').amount, -(500 * 14)); // المستحق للمورد بسعر النهارده
  assert.equal(all.find((i) => i.kind === 'recurring').date, '2026-04-05');
  near(fc.weeks[3].balance, fc.start + 1490 - 7000 - 3000);
});

test('customer segments and repeat rate', () => {
  const s = base();
  s.sales.push(sale('a1', '2026-01-10', { customerId: 'c1' }), sale('a2', '2026-03-01', { customerId: 'c1' }));
  s.sales.push(sale('b1', '2026-01-15', { customerId: 'c2' }));
  const j = Acc.buildJournal(s);
  const seg = PLAN.customerSegments(s, j, '2026-04-05');
  const by = Object.fromEntries(seg.rows.map((r) => [r.customerId, r]));
  assert.equal(by.c2.segment, 'due'); // آخر طلب من 80 يوم
  assert.equal(by.c1.segment, 'vip');
  assert.equal(by.c3.segment, 'none');
  near(seg.repeatRate, 0.5);
});
