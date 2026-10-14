const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

const state = () => ({
  settings: {}, accounts: [{ id: 'bank', name: 'البنك', type: 'bank', opening: 1000 }], couriers: [{ id: 'b', name: 'بوسطة' }],
  suppliers: [{ id: 'loc', name: 'تاجر', country: 'EG', currency: 'EGP' }], partners: [{ id: 'pa', name: 'شريك', share: 100 }], products: [{ id: 'p', name: 'عود', price: 500 }],
  expenses: [
    { id: 'e1', date: '2026-08-10', category: '5300', amount: 300, accountId: 'bank', notes: 'ميتا' },
    { id: 'e2', date: '2026-09-05', category: '5300', amount: 200, accountId: 'bank', notes: 'تيك توك' },
    { id: 'e3', date: '2026-09-20', category: '5300', amount: 50, courierId: 'b', accountId: '' },
    { id: 'e4', date: '2026-09-21', category: '5990', amount: 70, accountId: 'bank' },
  ],
  equity: [{ id: 'q', date: '2026-09-01', type: 'capital', amount: 2000, accountId: 'bank', partnerId: 'pa' }],
  shipments: [{ id: 'L', local: true, supplierId: 'loc', currency: 'EGP', rate: 1, orderDate: '2026-09-02', status: 'received', receivedDate: '2026-09-02', items: [{ productId: 'p', qty: 2, unitCost: 100 }], costs: [], payMode: 'credit' }],
});

test('an expense account statement: total, months, sources, opening outside the period', () => {
  const s = state(), j = Acc.buildJournal(s);
  const st = Acc.accountStatement(s, j, 'acc:5300', '2026-09-01', '2026-09-30');
  assert.equal(st.title, 'إعلانات وتسويق'); assert.ok(st.flow); assert.equal(st.credit, false);
  assert.equal(st.opening, 300, 'August is before the period');
  assert.equal(st.net, 250); assert.equal(st.rows.length, 2); assert.equal(st.closing, 550);
  assert.deepEqual(st.months.map((m) => [m.month, m.net]), [['2026-09', 250]]);
  assert.deepEqual(st.sources.map((x) => [x.label, x.net]), [['مصروف', 250]]);
  const all = Acc.accountStatement(s, j, 'acc:5300');
  assert.equal(all.net, 550); assert.equal(all.months.length, 2);
});

test('bank, courier, supplier and partner statements use the right balance side', () => {
  const s = state(), j = Acc.buildJournal(s);
  const bank = Acc.accountStatement(s, j, 'cash:bank', '2026-09-01', '2026-09-30');
  assert.equal(bank.opening, 1000 - 300); assert.equal(bank.totalDr, 2000); assert.equal(bank.totalCr, 270); assert.equal(bank.closing, 700 + 2000 - 270);
  assert.equal(bank.rows[bank.rows.length - 1].balance, bank.closing);
  assert.equal(Acc.accountStatement(s, j, 'courier:b').closing, -50);
  const sup = Acc.accountStatement(s, j, 'supplier:loc');
  assert.equal(sup.credit, true); assert.equal(sup.closing, 200, 'owed to the supplier shows positive (credit)');
  assert.equal(Acc.accountStatement(s, j, 'partner:pa').closing, 2000);
  assert.equal(Acc.accountStatement(s, j, 'acc:9999'), null);
});

test('the account list covers expenses, cash, couriers, suppliers, partners, revenue and the rest', () => {
  const list = Acc.statementAccounts(state());
  const groups = [...new Set(list.map((a) => a.group))];
  assert.deepEqual(groups, ['expense', 'cash', 'courier', 'supplier', 'partner', 'revenue', 'other']);
  assert.ok(list.some((a) => a.key === 'acc:5300')); assert.ok(list.some((a) => a.key === 'cash:bank'));
  assert.ok(!list.some((a) => a.key === 'acc:1100'), 'the cash parent is split per account');
});
