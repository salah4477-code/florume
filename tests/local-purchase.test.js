const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

const base = (sh) => ({
  settings: {}, accounts: [{ id: 'cash', name: 'الخزينة', type: 'cash', opening: 10000 }, { id: 'bank', name: 'البنك', type: 'bank', opening: 0 }],
  suppliers: [{ id: 'loc', name: 'تاجر العتبة', country: 'EG', currency: 'EGP' }], partners: [{ id: 'pa', name: 'شريك', share: 50 }],
  products: [{ id: 'p1', name: 'عود', price: 900 }, { id: 'p2', name: 'مسك', price: 400 }],
  shipments: [{ id: 'L1', local: true, ref: 'ف-15', supplierId: 'loc', currency: 'EGP', rate: 1, orderDate: '2026-10-05', status: 'received', receivedDate: '2026-10-05',
    items: [{ productId: 'p1', qty: 4, unitCost: 500 }, { productId: 'p2', qty: 10, unitCost: 100 }], costs: [{ label: 'نقل', amount: 60, basis: 'qty', accountId: 'cash' }], ...sh }],
});
const run = (sh) => { const s = base(sh); const j = Acc.buildJournal(s); return { s, j, cash: Object.fromEntries(Acc.cashBalances(s, j).map((a) => [a.id, a.balance])), tb: Acc.trialBalance(s, j).balanced, bs: Acc.balanceSheet(s, j).balanced }; };

test('local purchase paid from an account: stock in at landed cost, cash out, supplier closed', () => {
  const r = run({ payMode: 'account', payAccountId: 'bank' });
  assert.ok(r.tb && r.bs);
  assert.equal(r.cash.bank, -3000); assert.equal(r.cash.cash, 10000 - 60);
  const inv = Acc.computeInventory(r.s);
  assert.equal(inv.products.p1.qty, 4); assert.equal(inv.products.p2.qty, 10);
  assert.equal(Acc.round2(inv.products.p1.value + inv.products.p2.value), 3060, 'landed = goods + transport');
  assert.equal(r.j.suppliers.balances.loc.egp, 0, 'paid on the spot');
  const st = r.j.suppliers.lines.filter((l) => l.supplierId === 'loc');
  assert.deepEqual(st.map((l) => [l.kind, l.foreign]), [['purchase', 3000], ['payment', -3000]]);
  const cf = Acc.cashFlow(r.s, r.j, '2026-10-01', '2026-10-31');
  assert.equal(cf.sections.find((x) => x.key === 'goods').total, -3060);
});

test('local purchase from my pocket = capital increase (owner or partner), no cash moves', () => {
  const r = run({ payMode: 'capital', costs: [] });
  assert.ok(r.tb && r.bs);
  assert.equal(r.cash.bank, 0); assert.equal(r.cash.cash, 10000);
  const eq = Acc.equityChanges(r.s, r.j, '2026-10-01', '2026-10-31');
  assert.equal(eq.added.capital, 3000);
  assert.equal(Acc.foundingCapital(r.s, r.j).added, 3000);
  assert.equal(Acc.cashFlow(r.s, r.j, '2026-10-01', '2026-10-31').sections.reduce((t, x) => t + x.total, 0), 0);
  const p = run({ payMode: 'capital', payPartnerId: 'pa', costs: [] });
  assert.equal(Acc.partnerAccounts(p.s, p.j).find((x) => x.id === 'pa').capital, 3000);
});

test('local purchase on credit: supplier owed; no supplier needed when paid', () => {
  const r = run({ payMode: 'credit', costs: [] });
  assert.ok(r.tb && r.bs);
  assert.equal(r.j.suppliers.balances.loc.egp, 3000);
  assert.equal(r.cash.cash, 10000);
  const n = run({ supplierId: '', payMode: 'account', payAccountId: 'cash', costs: [] });
  assert.ok(n.tb && n.bs);
  assert.equal(n.cash.cash, 7000);
  assert.equal(Object.keys(n.j.suppliers.balances).length, 0);
  assert.equal(Acc.computeInventory(n.s).products.p1.qty, 4);
});
