// تمرين القيد: يختار المستخدم الحسابات من دليل الحسابات ويكتب المبالغ، والتطبيق يتحقق ويشرح الأخطاء.

import { useMemo, useState } from 'react';
import type { EntryExercise as Exercise } from '../types';
import { coa } from '../content';
import { checkEntry, parseAmount, type CheckResult, type DraftLine } from '../engine/checkEntry';
import { formatDate, formatMoney } from '../lib/format';
import { RichText } from './RichText';
import { JournalTable } from './JournalTable';

const blank = (): DraftLine => ({ account: '', debit: '', credit: '' });

const groupedAccounts = [...coa.groups]
  .sort((a, b) => a.order - b.order)
  .map((g) => ({ group: g, accounts: coa.accounts.filter((a) => a.group === g.id) }))
  .filter((g) => g.accounts.length > 0);

export function EntryExercise({
  exercise,
  number,
  solved,
  onSolved,
}: {
  exercise: Exercise;
  number: number;
  solved: boolean;
  onSolved: () => void;
}) {
  const [lines, setLines] = useState<DraftLine[]>([blank(), blank()]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hints, setHints] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  const live = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const l of lines) {
      d += parseAmount(l.debit) ?? 0;
      c += parseAmount(l.credit) ?? 0;
    }
    return { d, c };
  }, [lines]);

  const set = (i: number, patch: Partial<DraftLine>) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setResult(null);
  };

  const check = () => {
    const r = checkEntry(lines, exercise.solution, coa);
    setResult(r);
    if (r.ok) onSolved();
  };

  const lineIssues = new Set(result?.issues.filter((x) => x.line !== undefined).map((x) => x.line));
  const hintList = exercise.hints ?? [];

  return (
    <section className="card my-6 p-4 sm:p-5" aria-labelledby={`${exercise.id}-title`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 id={`${exercise.id}-title`} className="font-bold text-stone-900 dark:text-white">
          تمرين قيد {number}
        </h4>
        <span className="text-xs text-stone-500">{formatDate(exercise.date)}</span>
        {solved && (
          <span className="rounded-full bg-emerald-100 px-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            تم الحل ✓
          </span>
        )}
      </div>
      <p className="mb-4">
        <RichText text={exercise.prompt} />
      </p>

      <div className="space-y-3">
        <div className="hidden grid-cols-[1fr_9rem_9rem_2.5rem] gap-2 px-1 text-xs font-semibold text-stone-500 sm:grid">
          <span>الحساب</span>
          <span className="text-end">مدين</span>
          <span className="text-end">دائن</span>
          <span />
        </div>
        {lines.map((l, i) => (
          <div
            key={i}
            className={`grid grid-cols-2 gap-2 rounded-xl p-2 sm:grid-cols-[1fr_9rem_9rem_2.5rem] sm:p-1 ${
              lineIssues.has(i) ? 'bg-red-50 ring-1 ring-red-300 dark:bg-red-950/40 dark:ring-red-800' : 'bg-stone-50 sm:bg-transparent dark:bg-stone-950/40 sm:dark:bg-transparent'
            }`}
          >
            <label className="col-span-2 sm:col-span-1">
              <span className="sr-only">حساب السطر {i + 1}</span>
              <select className="input" value={l.account} onChange={(e) => set(i, { account: e.target.value })}>
                <option value="">— اختر حساباً من الدليل —</option>
                {groupedAccounts.map(({ group, accounts }) => (
                  <optgroup key={group.id} label={group.name}>
                    {accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-stone-500 sm:sr-only">مدين</span>
              <input
                className="input num text-end"
                inputMode="decimal"
                placeholder="0"
                value={l.debit}
                onChange={(e) => set(i, { debit: e.target.value })}
                aria-label={`مدين السطر ${i + 1}`}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-stone-500 sm:sr-only">دائن</span>
              <input
                className="input num text-end"
                inputMode="decimal"
                placeholder="0"
                value={l.credit}
                onChange={(e) => set(i, { credit: e.target.value })}
                aria-label={`دائن السطر ${i + 1}`}
              />
            </label>
            <button
              type="button"
              className="btn-ghost col-span-2 !px-2 text-red-600 sm:col-span-1 dark:text-red-400"
              onClick={() => {
                setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [blank()]));
                setResult(null);
              }}
              aria-label={`حذف السطر ${i + 1}`}
              title="حذف السطر"
            >
              <span aria-hidden="true">✕</span>
              <span className="sm:hidden">حذف السطر</span>
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <button type="button" className="btn-secondary" onClick={() => setLines((ls) => [...ls, blank()])}>
          + إضافة سطر
        </button>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-stone-600 dark:text-stone-400">
          <span>
            مدين: <span className="font-semibold tabular-nums">{formatMoney(live.d)}</span>
          </span>
          <span>
            دائن: <span className="font-semibold tabular-nums">{formatMoney(live.c)}</span>
          </span>
          <span className={Math.round(live.d * 100) === Math.round(live.c * 100) ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>
            الفرق: <span className="font-semibold tabular-nums">{formatMoney(Math.abs(live.d - live.c))}</span>
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={check}>
          تحقق من القيد
        </button>
        {hints < hintList.length && (
          <button type="button" className="btn-secondary" onClick={() => setHints((h) => h + 1)}>
            تلميح ({hints + 1}/{hintList.length})
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => setShowSolution((s) => !s)}>
          {showSolution ? 'إخفاء الحل' : 'عرض الحل'}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setLines([blank(), blank()]);
            setResult(null);
          }}
        >
          مسح
        </button>
      </div>

      {hints > 0 && (
        <ul className="mt-3 list-disc space-y-1 rounded-xl bg-sky-50 p-3 ps-8 text-sm dark:bg-sky-950/40">
          {hintList.slice(0, hints).map((h, i) => (
            <li key={i}>
              <RichText text={h} />
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite">
        {result &&
          (result.ok ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
              <div className="font-semibold text-emerald-800 dark:text-emerald-300">إجابة صحيحة، والقيد متوازن ✓</div>
              {exercise.explanation && (
                <p className="mt-1">
                  <RichText text={exercise.explanation} />
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
              <div className="mb-1 font-semibold text-red-800 dark:text-red-300">
                {result.balanced ? 'القيد متوازن، لكن فيه أخطاء:' : 'راجع النقاط التالية:'}
              </div>
              <ul className="list-disc space-y-1 ps-6">
                {result.issues.map((x, i) => (
                  <li key={i}>{x.message}</li>
                ))}
              </ul>
            </div>
          ))}
      </div>

      {showSolution && (
        <div className="mt-4">
          <div className="text-sm font-semibold text-stone-600 dark:text-stone-400">الحل النموذجي:</div>
          <JournalTable
            compact
            entry={{ id: `${exercise.id}-solution`, date: exercise.date, description: 'الحل النموذجي', lines: exercise.solution, post: false }}
          />
          {exercise.explanation && (
            <p className="text-sm">
              <RichText text={exercise.explanation} />
            </p>
          )}
        </div>
      )}
    </section>
  );
}
