const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg || ''} expected ${b} got ${a}`);
const products = [
  { id: 'p100', name: 'عطر 100 مل', sizeMl: 100, price: 1450 },
  { id: 'p10', name: 'عطر 10 مل', sizeMl: 10, price: 250 },
  { id: 'c50a', name: 'قطعة 50 مل أ', sizeMl: 50, price: 700 },
  { id: 'c50b', name: 'قطعة 50 مل ب', sizeMl: 50, price: 700 },
  { id: 'c50c', name: 'قطعة 50 مل ج', sizeMl: 50, price: 1100 },
  { id: 'box', name: 'بوكس 3×50', price: 2400, boxItems: [{ productId: 'c50a', qty: 1 }, { productId: 'c50b', qty: 1 }, { productId: 'c50c', qty: 1 }] },
];
const shipment = (costs) => ({ rate: 13, items: [{ productId: 'p100', qty: 10, unitCost: 55 }, { productId: 'p10', qty: 20, unitCost: 8 }, { productId: 'box', qty: 5, unitCost: 120 }], costs });

test('box shipping weight = sum of its pieces', () => {
  assert.equal(Acc.unitWeight(products[5], products), 150);
  assert.equal(Acc.unitWeight({ weightG: 380, sizeMl: 100 }, products), 380); // الوزن بالجرام له الأولوية
});

test('one combined shipping + customs line split by weight / size', () => {
  const c = Acc.shipmentCosting(shipment([{ label: 'شحن وجمارك', amount: 5000, basis: 'weight' }]), products);
  assert.equal(c.totalWeight, 1950); // 10×100 + 20×10 + 5×150
  near(c.lines[0].landedUnit, 715 + 256.41);
  near(c.lines[1].landedUnit, 104 + 25.64);
  near(c.lines[2].landedUnit, 1560 + 384.62);
  near(c.lines.reduce((a, l) => a + l.landedTotal, 0), 22030, 'nothing lost');
  assert.equal(c.costs[0].applied, 'weight');
});

test('separate lines with different bases (the worked example)', () => {
  const c = Acc.shipmentCosting(shipment([{ label: 'شحن', amount: 3000, basis: 'weight' }, { label: 'جمارك', amount: 2000, basis: 'value' }]), products);
  near(c.lines[0].landedUnit, 952.8);
  near(c.lines[1].landedUnit, 131.6);
  near(c.lines[2].landedUnit, 1973.98); // 1560 + 230.77 + 183.21
  near(c.lines[0].parts[0] / 10, 153.85);
  near(c.lines[0].parts[1] / 10, 83.97);
  near(c.landedTotal, 22030);
});

test('by quantity', () => {
  const c = Acc.shipmentCosting(shipment([{ amount: 3500, basis: 'qty' }]), products);
  near(c.lines[0].landedUnit, 715 + 100);
  near(c.lines[2].landedUnit, 1560 + 100);
});

test('old shipments without a basis keep the value split', () => {
  const c = Acc.shipmentCosting(shipment([{ amount: 5000 }]), products);
  near(c.lines[0].extras, (5000 * 7150) / 17030);
  assert.equal(c.costs[0].applied, 'value');
});

test('product without weight or size → weight line falls back to quantity', () => {
  const noSize = products.map((p) => (p.id === 'p10' ? { ...p, sizeMl: '' } : p));
  const c = Acc.shipmentCosting(shipment([{ amount: 3500, basis: 'weight' }]), noSize);
  assert.deepEqual(c.missingWeight, ['p10']);
  assert.equal(c.costs[0].applied, 'qty');
  near(c.lines[1].landedUnit, 104 + 100);
});

test('inventory uses the weight split and the books stay balanced', () => {
  const s = {
    settings: { startDate: '2026-01-01' }, accounts: [{ id: 'bank', name: 'بنك', opening: 100000 }], couriers: [], suppliers: [{ id: 'sa', name: 'مورد', currency: 'SAR' }], products, customers: [],
    shipments: [{ id: 'sh', supplierId: 'sa', currency: 'SAR', orderDate: '2026-01-02', status: 'received', receivedDate: '2026-01-05', ...shipment([{ label: 'شحن وجمارك', amount: 5000, basis: 'weight', accountId: 'bank' }]) }],
    supplierPayments: [], sales: [], settlements: [], expenses: [], transfers: [], equity: [], adjustments: [], decants: [],
  };
  let j = Acc.buildJournal(s);
  near(j.inventory.products.box.avgCost, 1944.62);
  // فك 2 بوكس: التكلفة تتوزع على القطع بنسبة سعر البيع 700 : 700 : 1100
  s.decants.push({ id: 'u1', kind: 'unbox', date: '2026-01-06', sourceProductId: 'box', sourceQty: 2, outputs: [{ productId: 'c50a', qty: 2 }, { productId: 'c50b', qty: 2 }, { productId: 'c50c', qty: 2 }], materialsCost: 0 });
  j = Acc.buildJournal(s);
  assert.equal(j.inventory.products.box.qty, 3);
  near(j.inventory.products.c50a.avgCost, 1944.62 * 700 / 2500);
  near(j.inventory.products.c50c.avgCost, 1944.62 * 1100 / 2500);
  near(j.inventory.decantCost.u1.total, 2 * 1944.62);
  assert.ok(Acc.trialBalance(s, j).balanced);
  assert.ok(Acc.balanceSheet(s, j, '2026-12-31').balanced);
  near(Acc.ledger(s, j, '1300').closing, Object.values(j.inventory.products).reduce((a, p) => a + p.value, 0));
});
