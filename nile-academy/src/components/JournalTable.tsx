// عرض قيد يومية بالشكل التقليدي: مدين | دائن | البيان

import type { JournalEntry } from '../types';
import { coa } from '../content';
import { accountMap, entryTotals, isBalanced } from '../engine/ledger';
import { formatAmountCell, formatDate } from '../lib/format';

const accounts = accountMap(coa);

export function JournalTable({ entry, index, compact }: { entry: JournalEntry; index?: number; compact?: boolean }) {
  const totals = entryTotals(entry.lines);
  const balanced = isBalanced(entry.lines);
  const debits = entry.lines.filter((l) => (l.debit ?? 0) > 0);
  const credits = entry.lines.filter((l) => (l.credit ?? 0) > 0);
  const multiDebit = debits.length > 1;
  const multiCredit = credits.length > 1;

  return (
    <div className={`my-4 overflow-hidden rounded-xl border ${entry.post === false ? 'border-dashed border-stone-300 dark:border-stone-700' : 'border-stone-200 dark:border-stone-800'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-400">
        <span>
          {index !== undefined && <span className="font-semibold">قيد رقم {index} · </span>}
          {formatDate(entry.date)}
        </span>
        <span className="flex items-center gap-2">
          {entry.post === false && <span className="rounded-full bg-stone-200 px-2 dark:bg-stone-800">توضيحي، لا يُرحَّل</span>}
          <span
            className={`rounded-full px-2 ${balanced ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'}`}
          >
            {balanced ? 'متوازن ✓' : 'غير متوازن'}
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-fin text-xs sm:text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-24 !text-end sm:w-32">مدين</th>
              <th scope="col" className="w-24 !text-end sm:w-32">دائن</th>
              <th scope="col">البيان</th>
            </tr>
          </thead>
          <tbody>
            {multiDebit && <SideHeader text="من مذكورين" />}
            {debits.map((l, i) => (
              <Line key={`d${i}`} code={l.account} amount={l.debit ?? 0} side="debit" prefix={multiDebit ? 'حـ/' : 'من حـ/'} />
            ))}
            {multiCredit && <SideHeader text="إلى مذكورين" indent />}
            {credits.map((l, i) => (
              <Line key={`c${i}`} code={l.account} amount={l.credit ?? 0} side="credit" prefix={multiCredit ? 'حـ/' : 'إلى حـ/'} />
            ))}
            <tr>
              <td colSpan={2} />
              <td className="text-stone-600 italic dark:text-stone-400">{entry.description}</td>
            </tr>
            <tr className="bg-stone-50 font-semibold dark:bg-stone-900/60">
              <td className="num text-end">{formatAmountCell(totals.debit)}</td>
              <td className="num text-end">{formatAmountCell(totals.credit)}</td>
              <td className="text-xs text-stone-500">المجموع (ج.م)</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!compact && entry.steps && entry.steps.length > 0 && (
        <details className="border-t border-stone-200 px-4 py-2 text-sm dark:border-stone-800">
          <summary className="cursor-pointer font-medium text-brand-700 dark:text-brand-300">خطوات التحليل</summary>
          <ol className="mt-2 list-decimal space-y-1 ps-6 text-stone-700 dark:text-stone-300">
            {entry.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function SideHeader({ text, indent }: { text: string; indent?: boolean }) {
  return (
    <tr>
      <td colSpan={2} />
      <td className={`text-stone-500 dark:text-stone-400 ${indent ? 'ps-8' : ''}`}>{text}</td>
    </tr>
  );
}

function Line({ code, amount, side, prefix }: { code: string; amount: number; side: 'debit' | 'credit'; prefix: string }) {
  const a = accounts.get(code);
  return (
    <tr>
      <td className="num text-end whitespace-nowrap">{side === 'debit' ? formatAmountCell(amount) : ''}</td>
      <td className="num text-end whitespace-nowrap">{side === 'credit' ? formatAmountCell(amount) : ''}</td>
      <td className={side === 'credit' ? 'ps-4 sm:ps-8' : ''}>
        <span className="text-stone-500 dark:text-stone-400">{prefix} </span>
        <span className="font-medium">{a?.name ?? code}</span>
        <span className="num mx-2 text-xs text-stone-400">{code}</span>
      </td>
    </tr>
  );
}
