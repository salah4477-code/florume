// قائمة المصطلحات والمراجع بمعرّفاتها الثابتة (نواة الدليل المرجعي المستقبلي).

import { useState } from 'react';
import { glossary } from '../content';
import { ReviewBadge } from '../components/ReviewBadge';

const kinds = [
  { id: 'all', label: 'الكل' },
  { id: 'term', label: 'مصطلحات' },
  { id: 'eas', label: 'معايير' },
  { id: 'law', label: 'قوانين وقرارات' },
  { id: 'org', label: 'جهات' },
] as const;

const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

export function GlossaryPage({ q: initial }: { q?: string }) {
  const [q, setQ] = useState(initial ?? '');
  const [kind, setKind] = useState<string>('all');
  const items = [...glossary.values()]
    .filter((g) => kind === 'all' || g.kind === kind || (kind === 'eas' && g.kind === 'ifrs'))
    .filter((g) => !q.trim() || [g.id, g.ar, g.en ?? '', g.short].some((s) => norm(s).includes(norm(q.trim()))))
    .sort((a, b) => a.ar.localeCompare(b.ar, 'ar'));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">المصطلحات والمراجع</h1>
        <p className="text-stone-600 dark:text-stone-400">كل مصطلح له معرّف ثابت يُستخدم لربطه من أي حلقة.</p>
      </header>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input className="input sm:max-w-sm" type="search" placeholder="ابحث بالعربية أو الإنجليزية أو المعرّف…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث في المصطلحات" />
        <div className="flex flex-wrap gap-1">
          {kinds.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              aria-pressed={kind === k.id}
              className={`rounded-full px-3 py-1 text-sm ${kind === k.id ? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-stone-950' : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300'}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-stone-500">{items.length} بنداً</p>
      <dl className="grid gap-3 md:grid-cols-2">
        {items.map((g) => (
          <div key={g.id} id={g.id} className="card p-4">
            <dt>
              <span className="font-bold text-stone-900 dark:text-white">{g.ar}</span>
              {g.review && <ReviewBadge id={g.review} />}
              {g.en && (
                <span dir="ltr" className="block text-start text-sm text-stone-500">
                  {g.en}
                </span>
              )}
            </dt>
            <dd className="mt-1 text-sm text-stone-700 dark:text-stone-300">{g.short}</dd>
            <dd className="mt-2">
              <code dir="ltr" className="rounded bg-stone-100 px-1.5 text-xs text-stone-500 dark:bg-stone-800">
                {g.id}
              </code>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
