import { company } from '../content';
import { formatDate } from '../lib/format';

export function CompanyPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">بطاقة الشركة</p>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{company.name}</h1>
        <p dir="ltr" className="text-start text-sm text-stone-500">{company.nameEn}</p>
        <p className="mt-3 max-w-3xl text-stone-700 dark:text-stone-300">{company.description}</p>
      </header>

      <section className="card p-5">
        <h2 className="mb-3 font-bold text-stone-900 dark:text-white">البيانات الأساسية</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {company.facts.map((f) => (
            <div key={f.label} className="border-b border-stone-100 pb-2 dark:border-stone-800">
              <dt className="text-xs text-stone-500">{f.label}</dt>
              <dd className="font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {company.related.map((r) => (
          <article key={r.name} className="card p-5">
            <div className="text-xs font-semibold text-brand-700 dark:text-brand-300">{r.relation}</div>
            <h3 className="font-bold text-stone-900 dark:text-white">{r.name}</h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{r.description}</p>
          </article>
        ))}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-bold text-stone-900 dark:text-white">الخط الزمني للجزء الأول</h2>
        <ol className="relative space-y-4 border-s-2 border-brand-200 ps-5 dark:border-brand-900">
          {company.timeline.map((t) => (
            <li key={t.date} className="relative">
              <span aria-hidden="true" className="absolute -start-[1.65rem] top-2 h-3 w-3 rounded-full bg-brand-500" />
              <div className="text-xs text-stone-500">{formatDate(`${t.date}-01`).replace(/^1 /, '')}</div>
              <div>{t.event}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
        <h2 className="mb-2 font-bold text-stone-900 dark:text-white">تبسيطات مقصودة في الجزء الأول</h2>
        <ul className="list-disc space-y-1 ps-6 text-sm">
          {company.simplifications.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
