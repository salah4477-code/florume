// محرك المحاسبة: ترحيل القيود، دفتر الأستاذ، ميزان المراجعة، والقوائم المالية.
// دوال صافية (pure) بدون أي اعتماد على React علشان تتختبر بسهولة.

import type { Account, AccountGroup, ChartOfAccounts, EntryLine, JournalEntry } from '../types';

/** نشتغل بالقروش داخلياً علشان نتجنب أخطاء الكسور العشرية */
export const toCents = (n: number | undefined): number => Math.round((n ?? 0) * 100);
export const fromCents = (c: number): number => c / 100;

export function entryTotals(lines: EntryLine[]): { debit: number; credit: number } {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    d += toCents(l.debit);
    c += toCents(l.credit);
  }
  return { debit: fromCents(d), credit: fromCents(c) };
}

export function isBalanced(lines: EntryLine[]): boolean {
  const t = entryTotals(lines);
  return toCents(t.debit) === toCents(t.credit) && toCents(t.debit) > 0;
}

export function accountMap(coa: ChartOfAccounts): Map<string, Account> {
  return new Map(coa.accounts.map((a) => [a.code, a]));
}

export interface LedgerLine {
  date: string;
  entryId: string;
  description: string;
  debit: number;
  credit: number;
  /** الرصيد المتحرك بإشارة الطبيعة العادية للحساب */
  balance: number;
}

export interface LedgerAccount {
  account: Account;
  lines: LedgerLine[];
  totalDebit: number;
  totalCredit: number;
  /** الرصيد بإشارة الطبيعة العادية: موجب = رصيد في جانبه الطبيعي */
  balance: number;
  /** الرصيد كمدين موجب / دائن سالب */
  netDebit: number;
}

/** ترتيب القيود زمنياً مع الحفاظ على ترتيب الإدخال لنفس التاريخ */
export function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date === b.e.date ? a.i - b.i : a.e.date < b.e.date ? -1 : 1))
    .map((x) => x.e);
}

export function buildLedger(entries: JournalEntry[], coa: ChartOfAccounts): Map<string, LedgerAccount> {
  const accounts = accountMap(coa);
  const ledger = new Map<string, LedgerAccount>();
  for (const entry of sortEntries(entries)) {
    for (const line of entry.lines) {
      const account = accounts.get(line.account);
      if (!account) throw new Error(`الحساب ${line.account} في القيد ${entry.id} غير موجود في دليل الحسابات`);
      let la = ledger.get(account.code);
      if (!la) {
        la = { account, lines: [], totalDebit: 0, totalCredit: 0, balance: 0, netDebit: 0 };
        ledger.set(account.code, la);
      }
      const d = toCents(line.debit);
      const c = toCents(line.credit);
      la.totalDebit = fromCents(toCents(la.totalDebit) + d);
      la.totalCredit = fromCents(toCents(la.totalCredit) + c);
      la.netDebit = fromCents(toCents(la.totalDebit) - toCents(la.totalCredit));
      la.balance = account.normal === 'debit' ? la.netDebit : -la.netDebit;
      la.lines.push({
        date: entry.date,
        entryId: entry.id,
        description: line.memo ?? entry.description,
        debit: fromCents(d),
        credit: fromCents(c),
        balance: la.balance,
      });
    }
  }
  return new Map([...ledger.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

/** ميزان المراجعة بالأرصدة */
export function trialBalance(entries: JournalEntry[], coa: ChartOfAccounts): TrialBalance {
  const ledger = buildLedger(entries, coa);
  const rows: TrialBalanceRow[] = [];
  let td = 0;
  let tc = 0;
  for (const la of ledger.values()) {
    const net = toCents(la.netDebit);
    if (net === 0) continue;
    const row = {
      code: la.account.code,
      name: la.account.name,
      debit: net > 0 ? fromCents(net) : 0,
      credit: net < 0 ? fromCents(-net) : 0,
    };
    td += toCents(row.debit);
    tc += toCents(row.credit);
    rows.push(row);
  }
  return { rows, totalDebit: fromCents(td), totalCredit: fromCents(tc), balanced: td === tc };
}

export interface StatementLine {
  code: string;
  name: string;
  /** المبلغ موجب في الاتجاه الطبيعي للمجموعة (والحساب المقابل يظهر سالب) */
  amount: number;
}

export interface StatementSection {
  group: AccountGroup;
  lines: StatementLine[];
  total: number;
}

function groupSections(
  ledger: Map<string, LedgerAccount>,
  coa: ChartOfAccounts,
  statement: AccountGroup['statement'],
): StatementSection[] {
  const groups = coa.groups.filter((g) => g.statement === statement).sort((a, b) => a.order - b.order);
  return groups.map((group) => {
    const groupNormal = group.type === 'asset' || group.type === 'expense' ? 1 : -1;
    const lines: StatementLine[] = [];
    let total = 0;
    for (const la of ledger.values()) {
      if (la.account.group !== group.id) continue;
      const cents = toCents(la.netDebit) * groupNormal;
      if (cents === 0) continue;
      total += cents;
      lines.push({ code: la.account.code, name: la.account.name, amount: fromCents(cents) });
    }
    return { group, lines, total: fromCents(total) };
  });
}

export interface IncomeStatement {
  revenue: StatementSection;
  costOfSales: StatementSection;
  grossProfit: number;
  selling: StatementSection;
  admin: StatementSection;
  otherIncome: StatementSection;
  operatingProfit: number;
  netProfit: number;
}

export function incomeStatement(entries: JournalEntry[], coa: ChartOfAccounts): IncomeStatement {
  const ledger = buildLedger(entries, coa);
  const sections = groupSections(ledger, coa, 'income-statement');
  const byId = (id: string) => {
    const s = sections.find((x) => x.group.id === id);
    if (!s) throw new Error(`مجموعة ${id} غير موجودة في دليل الحسابات`);
    return s;
  };
  const revenue = byId('revenue');
  const costOfSales = byId('cost-of-sales');
  const selling = byId('selling-expenses');
  const admin = byId('admin-expenses');
  const otherIncome = byId('other-income');
  const gp = toCents(revenue.total) - toCents(costOfSales.total);
  const op = gp - toCents(selling.total) - toCents(admin.total);
  const net = op + toCents(otherIncome.total);
  return {
    revenue,
    costOfSales,
    grossProfit: fromCents(gp),
    selling,
    admin,
    otherIncome,
    operatingProfit: fromCents(op),
    netProfit: fromCents(net),
  };
}

export interface BalanceSheet {
  nonCurrentAssets: StatementSection;
  currentAssets: StatementSection;
  totalAssets: number;
  equity: StatementSection;
  /** صافي ربح/خسارة الفترة غير المقفلة بعد */
  periodProfit: number;
  totalEquity: number;
  nonCurrentLiabilities: StatementSection;
  currentLiabilities: StatementSection;
  totalLiabilities: number;
  totalEquityAndLiabilities: number;
  balanced: boolean;
}

export function balanceSheet(entries: JournalEntry[], coa: ChartOfAccounts): BalanceSheet {
  const ledger = buildLedger(entries, coa);
  const sections = groupSections(ledger, coa, 'balance-sheet');
  const byId = (id: string) => {
    const s = sections.find((x) => x.group.id === id);
    if (!s) throw new Error(`مجموعة ${id} غير موجودة في دليل الحسابات`);
    return s;
  };
  const nca = byId('non-current-assets');
  const ca = byId('current-assets');
  const eq = byId('equity');
  const ncl = byId('non-current-liabilities');
  const cl = byId('current-liabilities');
  const profit = incomeStatement(entries, coa).netProfit;
  const totalAssets = toCents(nca.total) + toCents(ca.total);
  const totalEquity = toCents(eq.total) + toCents(profit);
  const totalLiabilities = toCents(ncl.total) + toCents(cl.total);
  return {
    nonCurrentAssets: nca,
    currentAssets: ca,
    totalAssets: fromCents(totalAssets),
    equity: eq,
    periodProfit: profit,
    totalEquity: fromCents(totalEquity),
    nonCurrentLiabilities: ncl,
    currentLiabilities: cl,
    totalLiabilities: fromCents(totalLiabilities),
    totalEquityAndLiabilities: fromCents(totalEquity + totalLiabilities),
    balanced: totalAssets === totalEquity + totalLiabilities,
  };
}
