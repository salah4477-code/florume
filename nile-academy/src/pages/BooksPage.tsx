import { useMemo, useState } from 'react';
import { coa, episodes } from '../content';
import { buildLedger, sortEntries, trialBalance } from '../engine/ledger';
import { formatAmountCell, formatDate, formatMoney } from '../lib/format';
import { href } from '../router';
import { AsOfPicker, EmptyBooks, useAsOf } from '../components/AsOfPicker';
import { JournalTable } from '../components/JournalTable';
import { Term } from '../components/Term';

const tabs = [
  { id: 'journal', label: 'دفتر اليومية', term: 'term:general-journal' },
  { id: 'ledger', label: 'دفتر الأستاذ', term: 'term:general-ledger' },
  { id: 'trial-balance', label: 'ميزان المراجعة', term: 'term:trial-balance' },
  { id: 'accounts', label: 'دليل الحسابات', term: 'term:chart-of-accounts' },
] as const;

export function BooksPage({ tab }: { tab?: string }) {
  const active = tabs.find((t) => t.id === tab)?.id ?? 'journal';
  const { completed, upTo, setUpTo, entries } = useAsOf();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">دفاتر الشركة</h1>
          <p className="text-stone-600 dark:text-stone-400">تتحدث تلقائياً بقيود كل حلقة تُنهيها.</p>
        </div>
        <AsOfPicker completed={completed} upTo={upTo} onChange={setUpTo} />
      </header>

      <div role="tablist" aria-label="الدفاتر" className="flex gap-1 overflow-x-auto border-b border-stone-200 dark:border-stone-800">
        {tabs.map((t) => (
          <a
            key={t.id}
            role="tab"
            aria-selected={t.id === active}
            href={href({ name: 'books', tab: t.id })}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
              t.id === active
                ? 'border-brand-600 font-semibold text-brand-800 dark:border-brand-400 dark:text-brand-200'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      <div role="tabpanel">
        {active === 'accounts' ? (
          <ChartView />
        ) : entries.length === 0 ? (
          <EmptyBooks />
        ) : active === 'journal' ? (
          <JournalView entries={entries} />
        ) : active === 'ledger' ? (
          <LedgerView entries={entries} />
        ) : (
          <TrialBalanceView entries={entries} />
        )}
      </div>
    </div>
  );
}

type Entries = ReturnType<typeof useAsOf>['entries'];

function JournalView({ entries }: { entries: Entries }) {
  const sorted = sortEntries(entries);
  const episodeOf = (id: string) => episodes.find((e) => e.application.entries.some((x) => x.id === id));
  let lastEp: string | undefined;
  return (
    <div>
      <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">
        <Term id="term:general-journal" label="دفتر اليومية" />: {sorted.length} قيداً بالترتيب الزمني.
      </p>
      {sorted.map((e, i) => {
        const ep = episodeOf(e.id);
        const header = ep && ep.id !== lastEp;
        lastEp = ep?.id;
        return (
          <div key={e.id}>
            {header && ep && (
              <h2 className="mt-6 text-sm font-semibold text-brand-700 dark:text-brand-300">
                الحلقة {ep.number}: {ep.title}
              </h2>
            )}
            <JournalTable entry={e} index={i + 1} compact />
          </div>
        );
      })}
    </div>
  );
}

function LedgerView({ entries }: { entries: Entries }) {
  const ledger = useMemo(() => buildLedger(entries, coa), [entries]);
  const codes = [...ledger.keys()];
  const [code, setCode] = useState(codes.includes('1250') ? '1250' : codes[0]);
  const current = ledger.get(code) ?? ledger.get(codes[0])!;

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <div>
        <label className="md:hidden">
          <span className="mb-1 block text-sm text-stone-600">الحساب</span>
          <select className="input" value={current.account.code} onChange={(e) => setCode(e.target.value)}>
            {[...ledger.values()].map((la) => (
              <option key={la.account.code} value={la.account.code}>
                {la.account.code} - {la.account.name}
              </option>
            ))}
          </select>
        </label>
        <ul className="hidden max-h-[70vh] space-y-0.5 overflow-y-auto md:block">
          {[...ledger.values()].map((la) => (
            <li key={la.account.code}>
              <button
                type="button"
                onClick={() => setCode(la.account.code)}
                aria-pressed={la.account.code === current.account.code}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-start text-sm ${
                  la.account.code === current.account.code
                    ? 'bg-brand-50 font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-200'
                    : 'hover:bg-stone-100 dark:hover:bg-stone-900'
                }`}
              >
                <span className="truncate">
                  <span className="num mx-1 text-xs text-stone-400">{la.account.code}</span>
                  {la.account.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200 p-4 dark:border-stone-800">
          <div>
            <h2 className="font-bold text-stone-900 dark:text-white">
              حـ/ {current.account.name} <span className="num text-sm text-stone-400">{current.account.code}</span>
            </h2>
            <p className="text-xs text-stone-500">
              {current.account.nameEn} · الطبيعة: {current.account.normal === 'debit' ? 'مدينة' : 'دائنة'}
              {current.account.contra ? ' (حساب مقابل)' : ''}
            </p>
          </div>
          <div className="text-sm">
            الرصيد: <span className="font-bold tabular-nums">{formatMoney(Math.abs(current.netDebit))}</span>{' '}
            <span className="text-stone-500">{current.netDebit > 0 ? 'مدين' : current.netDebit < 0 ? 'دائن' : ''}</span>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="table-fin min-w-[36rem]">
            <thead>
              <tr>
                <th scope="col">التاريخ</th>
                <th scope="col">البيان</th>
                <th scope="col" className="!text-end">مدين</th>
                <th scope="col" className="!text-end">دائن</th>
                <th scope="col" className="!text-end">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {current.lines.map((l, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap text-stone-500">{formatDate(l.date)}</td>
                  <td>{l.description}</td>
                  <td className="num text-end">{l.debit ? formatAmountCell(l.debit) : ''}</td>
                  <td className="num text-end">{l.credit ? formatAmountCell(l.credit) : ''}</td>
                  <td className="num text-end whitespace-nowrap">
                    {formatAmountCell(Math.abs(l.balance), { parens: false })}{' '}
                    <span className="text-xs text-stone-400">
                      {l.balance === 0 ? '' : (l.balance > 0) === (current.account.normal === 'debit') ? 'مدين' : 'دائن'}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-stone-50 font-semibold dark:bg-stone-900/60">
                <td colSpan={2}>المجموع</td>
                <td className="num text-end">{formatAmountCell(current.totalDebit)}</td>
                <td className="num text-end">{formatAmountCell(current.totalCredit)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TrialBalanceView({ entries }: { entries: Entries }) {
  const tb = useMemo(() => trialBalance(entries, coa), [entries]);
  const last = sortEntries(entries).at(-1);
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 p-4 dark:border-stone-800">
        <div>
          <h2 className="font-bold text-stone-900 dark:text-white">ميزان المراجعة بالأرصدة</h2>
          {last && <p className="text-xs text-stone-500">في {formatDate(last.date)}</p>}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            tb.balanced ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {tb.balanced ? 'متوازن ✓' : 'غير متوازن!'}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="table-fin min-w-[30rem]">
          <thead>
            <tr>
              <th scope="col">الكود</th>
              <th scope="col">الحساب</th>
              <th scope="col" className="!text-end">أرصدة مدينة</th>
              <th scope="col" className="!text-end">أرصدة دائنة</th>
            </tr>
          </thead>
          <tbody>
            {tb.rows.map((r) => (
              <tr key={r.code}>
                <td className="num text-stone-500">{r.code}</td>
                <td>{r.name}</td>
                <td className="num text-end">{r.debit ? formatAmountCell(r.debit) : ''}</td>
                <td className="num text-end">{r.credit ? formatAmountCell(r.credit) : ''}</td>
              </tr>
            ))}
            <tr className="bg-stone-50 font-bold dark:bg-stone-900/60">
              <td colSpan={2}>المجموع (ج.م)</td>
              <td className="num text-end">{formatAmountCell(tb.totalDebit)}</td>
              <td className="num text-end">{formatAmountCell(tb.totalCredit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChartView() {
  const groups = [...coa.groups].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        <Term id="term:chart-of-accounts" label="دليل الحسابات" /> المعتمد في شركة النيل. الرقم الأول يحدد نوع الحساب.
      </p>
      {groups.map((g) => (
        <section key={g.id} className="card overflow-hidden">
          <h2 className="border-b border-stone-200 bg-stone-50 px-4 py-2 font-semibold dark:border-stone-800 dark:bg-stone-900/60">
            {g.name} <span className="text-xs font-normal text-stone-500" dir="ltr">({g.nameEn})</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="table-fin min-w-[30rem]">
              <tbody>
                {coa.accounts
                  .filter((a) => a.group === g.id)
                  .map((a) => (
                    <tr key={a.code}>
                      <td className="num w-16 text-stone-500">{a.code}</td>
                      <td>
                        <div className="font-medium">
                          {a.name}
                          {a.contra && <span className="ms-2 rounded bg-stone-100 px-1.5 text-xs dark:bg-stone-800">حساب مقابل</span>}
                        </div>
                        {a.description && <div className="text-xs text-stone-500">{a.description}</div>}
                      </td>
                      <td className="text-xs text-stone-500" dir="ltr">{a.nameEn}</td>
                      <td className="text-xs whitespace-nowrap text-stone-500">{a.normal === 'debit' ? 'طبيعته مدينة' : 'طبيعته دائنة'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
