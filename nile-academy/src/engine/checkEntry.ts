// التحقق من قيد يكتبه المستخدم في تمرين القيد ومقارنته بالحل الصحيح.

import type { ChartOfAccounts, EntryLine } from '../types';
import { accountMap, fromCents, toCents } from './ledger';
import { formatMoney } from '../lib/format';

export interface DraftLine {
  account: string;
  debit: string;
  credit: string;
}

export type IssueKind =
  | 'empty'
  | 'no-account'
  | 'both-sides'
  | 'no-amount'
  | 'invalid-amount'
  | 'unbalanced'
  | 'missing-account'
  | 'extra-account'
  | 'wrong-side'
  | 'wrong-amount';

export interface Issue {
  kind: IssueKind;
  message: string;
  /** رقم السطر (يبدأ من 0) لو الغلطة مرتبطة بسطر محدد */
  line?: number;
}

export interface CheckResult {
  ok: boolean;
  balanced: boolean;
  totalDebit: number;
  totalCredit: number;
  issues: Issue[];
}

/** يحوّل نص المبلغ لرقم، ويقبل الأرقام العربية والفواصل */
export function parseAmount(raw: string): number | null {
  const s = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٫]/g, '.')
    .replace(/[,٬\s]/g, '');
  if (s === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

/** يجمّع السطور حسب الحساب والجانب بالقروش */
function aggregate(lines: EntryLine[]): Map<string, { debit: number; credit: number }> {
  const m = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const cur = m.get(l.account) ?? { debit: 0, credit: 0 };
    cur.debit += toCents(l.debit);
    cur.credit += toCents(l.credit);
    m.set(l.account, cur);
  }
  return m;
}

export function checkEntry(draft: DraftLine[], solution: EntryLine[], coa: ChartOfAccounts): CheckResult {
  const accounts = accountMap(coa);
  const issues: Issue[] = [];
  const lines: EntryLine[] = [];

  const used = draft.filter((d) => d.account || d.debit.trim() || d.credit.trim());
  if (used.length === 0) {
    return {
      ok: false,
      balanced: false,
      totalDebit: 0,
      totalCredit: 0,
      issues: [{ kind: 'empty', message: 'القيد فارغ. اختر حساباً واكتب مبلغاً في المدين أو الدائن.' }],
    };
  }

  draft.forEach((d, i) => {
    if (!d.account && !d.debit.trim() && !d.credit.trim()) return;
    const debit = parseAmount(d.debit);
    const credit = parseAmount(d.credit);
    if (!d.account) issues.push({ kind: 'no-account', line: i, message: `السطر ${i + 1}: يجب اختيار حساب.` });
    if (debit === null || credit === null) {
      issues.push({ kind: 'invalid-amount', line: i, message: `السطر ${i + 1}: المبلغ مكتوب بصيغة غير صحيحة. اكتب أرقاماً فقط (مثلاً 150000).` });
      return;
    }
    if (debit > 0 && credit > 0) {
      issues.push({ kind: 'both-sides', line: i, message: `السطر ${i + 1}: السطر الواحد يكون مديناً أو دائناً، لا الاثنين معاً.` });
    }
    if (debit === 0 && credit === 0) {
      issues.push({ kind: 'no-amount', line: i, message: `السطر ${i + 1}: لا يوجد مبلغ. اكتب المبلغ في خانة المدين أو الدائن.` });
    }
    if (d.account) lines.push({ account: d.account, debit, credit });
  });

  let td = 0;
  let tc = 0;
  for (const l of lines) {
    td += toCents(l.debit);
    tc += toCents(l.credit);
  }
  const balanced = td === tc && td > 0;
  if (td !== tc) {
    issues.push({
      kind: 'unbalanced',
      message: `القيد غير متوازن: مجموع المدين ${formatMoney(fromCents(td))} ومجموع الدائن ${formatMoney(fromCents(tc))}، والفرق ${formatMoney(fromCents(Math.abs(td - tc)))}. في القيد المزدوج يجب أن يتساوى المجموعان.`,
    });
  }

  // لو في أخطاء شكلية نوقف هنا علشان الرسائل تكون واضحة
  const structural = issues.some((x) => x.kind !== 'unbalanced');
  if (!structural) {
    const got = aggregate(lines);
    const want = aggregate(solution);
    const name = (code: string) => accounts.get(code)?.name ?? code;

    for (const [code, w] of want) {
      const g = got.get(code);
      const wantSide = w.debit - w.credit > 0 ? 'debit' : 'credit';
      if (!g) {
        issues.push({
          kind: 'missing-account',
          message: `ينقص القيد حساب "${name(code)}". فكّر: ما البند الآخر الذي تأثر بالعملية؟`,
        });
        continue;
      }
      const net = g.debit - g.credit;
      const wantNet = w.debit - w.credit;
      const gotSide = net > 0 ? 'debit' : net < 0 ? 'credit' : null;
      if (gotSide && gotSide !== wantSide) {
        issues.push({
          kind: 'wrong-side',
          message: `حساب "${name(code)}" في الجانب الخطأ: يجب أن يكون ${wantSide === 'debit' ? 'مديناً' : 'دائناً'}. تذكّر: ${
            accounts.get(code)?.normal === 'debit'
              ? 'طبيعة هذا الحساب مدينة؛ يزيد بالمدين وينقص بالدائن'
              : 'طبيعة هذا الحساب دائنة؛ يزيد بالدائن وينقص بالمدين'
          }.`,
        });
      } else if (net !== wantNet) {
        issues.push({
          kind: 'wrong-amount',
          message: `مبلغ حساب "${name(code)}" غير صحيح: كتبت ${formatMoney(fromCents(Math.abs(net)))}. راجع الأرقام في نص التمرين.`,
        });
      }
    }
    for (const code of got.keys()) {
      if (!want.has(code)) {
        issues.push({
          kind: 'extra-account',
          message: `حساب "${name(code)}" لا مكان له في هذا القيد. هل أثرت العملية عليه فعلاً؟`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    balanced,
    totalDebit: fromCents(td),
    totalCredit: fromCents(tc),
    issues,
  };
}
