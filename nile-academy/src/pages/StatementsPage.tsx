import { useMemo, type ReactNode } from 'react';
import { coa, company } from '../content';
import { balanceSheet, incomeStatement, sortEntries, type StatementSection } from '../engine/ledger';
import { formatDate, formatMoney } from '../lib/format';
import { AsOfPicker, EmptyBooks, useAsOf } from '../components/AsOfPicker';
import { Term } from '../components/Term';

const amt = (n: number) => formatMoney(n, { currency: false, parens: true });

export function StatementsPage() {
  const { completed, upTo, setUpTo, entries } = useAsOf();
  const bs = useMemo(() => balanceSheet(entries, coa), [entries]);
  const is = useMemo(() => incomeStatement(entries, coa), [entries]);
  const sorted = sortEntries(entries);
  const first = sorted[0];
  const last = sorted.at(-1);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">القوائم المالية</h1>
          <p className="text-stone-600 dark:text-stone-400">
            تُبنى مباشرة من القيود المرحّلة. قوائم إدارية غير مقفلة؛ تظهر نتيجة الفترة ضمن حقوق الملكية.
          </p>
        </div>
        <AsOfPicker completed={completed} upTo={upTo} onChange={setUpTo} />
      </header>

      {entries.length === 0 || !first || !last ? (
        <EmptyBooks />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Statement
            title="قائمة المركز المالي"
            sub={`في ${formatDate(last.date)}`}
            termId="term:financial-statements"
            footer={
              <Badge ok={bs.balanced}>
                {bs.balanced ? 'الأصول = الالتزامات + حقوق الملكية ✓' : 'القائمة غير متوازنة'}
              </Badge>
            }
          >
            <SectionRows title="الأصول غير المتداولة" s={bs.nonCurrentAssets} />
            <SectionRows title="الأصول المتداولة" s={bs.currentAssets} />
            <TotalRow label="إجمالي الأصول" value={bs.totalAssets} strong />
            <Spacer />
            <SectionRows title="حقوق الملكية" s={bs.equity} hideTotal />
            <Row label="صافي ربح (خسارة) الفترة" value={bs.periodProfit} />
            <TotalRow label="إجمالي حقوق الملكية" value={bs.totalEquity} />
            {bs.nonCurrentLiabilities.lines.length > 0 && <SectionRows title="الالتزامات غير المتداولة" s={bs.nonCurrentLiabilities} />}
            <SectionRows title="الالتزامات المتداولة" s={bs.currentLiabilities} />
            <TotalRow label="إجمالي الالتزامات" value={bs.totalLiabilities} />
            <TotalRow label="إجمالي حقوق الملكية والالتزامات" value={bs.totalEquityAndLiabilities} strong />
          </Statement>

          <Statement title={is.oci.length > 0 ? "قائمة الدخل والدخل الشامل" : "قائمة الدخل"} sub={`عن الفترة من ${formatDate(first.date)} حتى ${formatDate(last.date)}`} termId="term:income">
            <Row label="إيرادات المبيعات" value={is.revenue.total} />
            <Row label="تكلفة المبيعات" value={-is.costOfSales.total} />
            <TotalRow label="مجمل الربح" value={is.grossProfit} />
            {is.revenue.total > 0 && (
              <Row label="نسبة مجمل الربح" text={`${((is.grossProfit / is.revenue.total) * 100).toFixed(1)}%`} muted />
            )}
            <Spacer />
            <SectionRows title="مصروفات البيع والتوزيع" s={is.selling} negate />
            <SectionRows title="المصروفات العمومية والإدارية" s={is.admin} negate />
            {is.otherIncome.lines.length > 0 && <SectionRows title="إيرادات أخرى" s={is.otherIncome} />}
            {is.financeCosts.lines.length > 0 && (
              <>
                <TotalRow label="نتيجة النشاط" value={is.operatingProfit} />
                <SectionRows title="التكاليف التمويلية" s={is.financeCosts} negate />
              </>
            )}
            <TotalRow label="صافي ربح (خسارة) الفترة قبل الضرائب" value={is.netProfit} strong />
            {is.oci.length > 0 && (
              <>
                <Spacer />
                <tr>
                  <td colSpan={2} className="pt-3 pb-1 font-semibold text-stone-900 dark:text-white">
                    <Term id="term:other-comprehensive-income" label="الدخل الشامل الآخر" />
                  </td>
                </tr>
                {is.oci.map((l) => (
                  <Row key={l.code} label={`${l.name} (بنود لا يُعاد تبويبها للأرباح أو الخسائر)`} value={l.amount} indent />
                ))}
                <TotalRow label="إجمالي الدخل الشامل للفترة" value={is.totalComprehensiveIncome} strong />
              </>
            )}
            <tr>
              <td colSpan={2} className="pt-3 text-xs text-stone-500">
                ضريبة الدخل والضريبة المؤجلة تُعالج في الجزء السادس. الأرقام بالجنيه المصري، والأرقام بين قوسين سالبة.
              </td>
            </tr>
          </Statement>
        </div>
      )}
      <p className="text-xs text-stone-500">
        {company.name} ({company.legalForm}) · القوائم الكاملة وفق المعيار المصري رقم 1 تشمل أيضاً قائمة التغير في حقوق الملكية وقائمة التدفقات النقدية والإيضاحات (الجزء السادس).
      </p>
    </div>
  );
}

function Statement({ title, sub, termId, children, footer }: { title: string; sub: string; termId: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-stone-200 p-4 text-center dark:border-stone-800">
        <div className="text-sm text-stone-500">{company.name}</div>
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">
          <Term id={termId} label={title} />
        </h2>
        <div className="text-sm text-stone-500">{sub}</div>
      </header>
      <div className="overflow-x-auto p-2 sm:p-4">
        <table className="w-full min-w-[20rem] text-sm">
          <thead className="sr-only">
            <tr>
              <th>البند</th>
              <th>المبلغ (ج.م)</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer && <footer className="border-t border-stone-200 p-3 text-center dark:border-stone-800">{footer}</footer>}
    </section>
  );
}

function SectionRows({ title, s, negate, hideTotal }: { title: string; s: StatementSection; negate?: boolean; hideTotal?: boolean }) {
  return (
    <>
      <tr>
        <td colSpan={2} className="pt-3 pb-1 font-semibold text-stone-900 dark:text-white">
          {title}
        </td>
      </tr>
      {s.lines.length === 0 && <Row label="لا يوجد" text="—" muted />}
      {s.lines.map((l) => (
        <Row key={l.code} label={l.name} value={negate ? -l.amount : l.amount} indent />
      ))}
      {!hideTotal && s.lines.length > 1 && <TotalRow label={`إجمالي ${title}`} value={negate ? -s.total : s.total} />}
    </>
  );
}

function Row({ label, value, text, indent, muted }: { label: string; value?: number; text?: string; indent?: boolean; muted?: boolean }) {
  return (
    <tr className={muted ? 'text-stone-500' : ''}>
      <td className={`py-1 ${indent ? 'ps-4' : ''}`}>{label}</td>
      <td className="num py-1 text-end whitespace-nowrap">{text ?? amt(value ?? 0)}</td>
    </tr>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={strong ? 'font-bold text-stone-900 dark:text-white' : 'font-semibold'}>
      <td className="border-t border-stone-300 py-1.5 dark:border-stone-700">{label}</td>
      <td className={`num border-t border-stone-300 py-1.5 text-end whitespace-nowrap dark:border-stone-700 ${strong ? 'border-b-4 border-double' : ''}`}>
        {amt(value)}
      </td>
    </tr>
  );
}

function Spacer() {
  return (
    <tr aria-hidden="true">
      <td colSpan={2} className="h-3" />
    </tr>
  );
}

function Badge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-semibold ${
        ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
      }`}
    >
      {children}
    </span>
  );
}
