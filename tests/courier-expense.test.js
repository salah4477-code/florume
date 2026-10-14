const test = require('node:test');
const assert = require('node:assert/strict');
const Acc = require('../js/accounting.js');

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
