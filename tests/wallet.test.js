const test = require('node:test');
const assert = require('node:assert/strict');
const OPS = require('../js/ops.js');
const Acc = require('../js/accounting.js');

// نفس أعمدة كشف «Transactions» (حركات المحفظة) من بوسطة، ببيانات تجريبية — الأحدث فوق
const HEAD = ['Transactions ID', 'Date', 'Category', 'Amount', 'Balance', 'Cashout ID', 'Cashout Date', 'Cashout Amount'];
const ROWS = [
  ['T9', 46295.46, 'Recharge balance', '12.00', '0.60'],
  ['WEDCOD30SEP26', 46295, 'Cash Out', -1000, '-11.40'],
  ['Transfer_Fees-30092026', 46295, 'Transfer Fees', -25, '988.60', 'WEDCOD30SEP26', 46295.23, '1000'],
  ['T7', 46294.64, 'Bundle Subscription', -2000, '1013.60'],
  ['T6', 46292.87, 'Bosta Fees Cycle', -11.4, '3013.60'],
  ['T5', 46292.87, 'Cash Collection Cycle', '1025.00', '3025.00'],
  ['WEDCOD23SEP26', 46288, 'Cash Out', -5000, '2000.00'],
  ['T4', 46288.2, 'Pickup Fees', -70, '7000.00', 'WEDCOD23SEP26'],
  ['T3', 46279.5, 'Packing Material', -1005, '7070.00'],
  ['T2', 46278.87, 'Bosta Fees Cycle', -0.0, '8075.00'],
  ['T1', 46278.87, 'Cash Collection Cycle', '8075.00', '8075.00'],
];
const sheets = () => [{ name: 'Transactions', rows: [HEAD, ...ROWS] }];

test('reads a Bosta wallet Transactions statement (not a shipment statement)', () => {
  assert.equal(OPS.parseStatement(sheets()), null, 'no tracking column — not an order statement');
  const w = OPS.parseWallet(sheets());
  assert.ok(w);
  assert.equal(w.rows.length, ROWS.length);
  assert.equal(w.balance, 0.6, 'newest row first');
  assert.equal(w.from, '2026-09-13'); assert.equal(w.to, '2026-09-30');
  const kinds = Object.fromEntries(w.rows.map((r) => [r.id, r.kind]));
  assert.equal(kinds.T9, 'recharge'); assert.equal(kinds.WEDCOD30SEP26, 'cashout'); assert.equal(kinds.T5, 'cycle'); assert.equal(kinds.T6, 'cycle');
  assert.equal(w.rows.find((r) => r.id === 'T4').acc, '5200');
  assert.equal(w.rows.find((r) => r.id === 'T3').acc, '5400');
  assert.equal(w.rows.find((r) => r.id === 'T7').acc, '5950');
  assert.equal(w.rows.find((r) => r.id === 'Transfer_Fees-30092026').acc, '5700');
  // كشف الطلبات ما يتقريش على إنه محفظة
  assert.equal(OPS.parseWallet([{ name: 'x', rows: [['Order Id', 'COD', 'Total Fees'], ['1', '10', '1']] }]), null);
});

test('plan: new charges, recharges, cash-outs; a cash-out recorded at the shipment net gets corrected', () => {
  const w = OPS.parseWallet(sheets());
  const state = { settlements: [{ id: 'old', courierId: 'b', amount: 7100, notes: 'تسوية كشف x.xlsx — WEDCOD23SEP26' }], expenses: [] };
  const p = OPS.walletPlan(state, 'b', w);
  assert.equal(p.totals.newCharges, 25 + 2000 + 70 + 1005);
  assert.deepEqual(p.groups.map((g) => g.acc), ['5950', '5400', '5200', '5700']);
  assert.equal(p.totals.newRecharges, 12);
  const co = Object.fromEntries(p.cashouts.map((c) => [c.id, c]));
  assert.equal(co.WEDCOD23SEP26.state, 'fix'); assert.equal(co.WEDCOD23SEP26.recorded, 7100); assert.equal(co.WEDCOD23SEP26.value, 5000);
  assert.equal(co.WEDCOD30SEP26.state, 'new');
  assert.equal(p.totals.cycleCod, 9100); assert.equal(p.totals.cycleFees, 11.4);
  // بعد التسجيل: مفيش تكرار
  p.charges.forEach((c) => state.expenses.push({ id: c.id, courierId: 'b', walletRef: c.id, amount: c.value }));
  state.settlements.push({ id: 'n', courierId: 'b', amount: 1000, batch: 'WEDCOD30SEP26' });
  const again = OPS.walletPlan(state, 'b', w);
  assert.equal(again.totals.newCharges, 0); assert.equal(again.groups.length, 0);
  assert.equal(again.cashouts.find((c) => c.id === 'WEDCOD30SEP26').state, 'same');
  // شركة شحن تانية = مش متسجل
  assert.equal(OPS.walletPlan(state, 'other', w).totals.newCharges, 3100);
});

test('batchSettlement matches by batch field or the batch inside the notes, per courier', () => {
  const s = { settlements: [{ id: 'a', courierId: 'b', notes: 'تسوية كشف — WEDCOD23SEP26' }, { id: 'c', courierId: 'b', batch: 'WEDCOD30SEP26' }] };
  assert.equal(OPS.batchSettlement(s, 'b', 'WEDCOD23SEP26').id, 'a');
  assert.equal(OPS.batchSettlement(s, 'b', 'wedcod30sep26').id, 'c');
  assert.equal(OPS.batchSettlement(s, 'x', 'WEDCOD23SEP26'), null);
  assert.equal(OPS.batchSettlement(s, 'b', 'WEDCOD2SEP26'), null, 'no partial match');
  assert.equal(OPS.batchSettlement(s, 'b', ''), null);
});

test('an expense deducted by the courier reduces the courier balance, not the cash, and is not a cash flow', () => {
  const state = {
    settings: {}, accounts: [{ id: 'bank', name: 'بنك', type: 'bank', opening: 0 }], couriers: [{ id: 'b', name: 'بوسطة' }],
    expenses: [{ id: 'e1', date: '2026-09-20', category: '5200', amount: 70, courierId: 'b', accountId: '' }, { id: 'e2', date: '2026-09-20', category: '5990', amount: 30, accountId: 'bank' }],
  };
  const j = Acc.buildJournal(state);
  assert.equal(Acc.courierBalances(state, j).b, -70);
  assert.equal(Acc.cashBalances(state, j).find((a) => a.id === 'bank').balance, -30);
  const cf = Acc.cashFlow(state, j, '2026-09-01', '2026-09-30');
  const total = cf.sections.reduce((t, s) => t + s.total, 0);
  assert.equal(total, -30);
  assert.equal(Acc.allExpenses(state, j).reduce((t, r) => t + r.amount, 0), 100, 'both show on the expenses page');
});
