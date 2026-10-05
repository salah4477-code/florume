import { company, episodes, program } from '../content';
import { href } from '../router';
import { episodeRatio, useProgress } from '../store/progress';
import { ProgressBar } from '../components/ProgressBar';

export function HomePage() {
  const progress = useProgress();
  const completed = progress.completedIds.length;
  const next = episodes.find((e) => !progress.get(e.id).completedAt) ?? episodes[0];
  const answered = episodes.flatMap((e) => e.quiz.questions.filter((q) => q.id in progress.get(e.id).answers).map((q) => ({ e, q })));
  const correct = answered.filter(({ e, q }) => q.options[progress.get(e.id).answers[q.id]]?.correct).length;

  return (
    <div className="space-y-8">
      <section className="card overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">برنامج تفاعلي في المحاسبة المالية والمعايير والقوانين المصرية</p>
            <h1 className="mt-2 text-2xl leading-tight font-bold text-stone-900 sm:text-3xl dark:text-white">
              تعلّم المحاسبة من داخل شركة حقيقية الحجم: {company.name}
            </h1>
            <p className="mt-3 text-stone-600 dark:text-stone-400">
              ستتابع شركة مساهمة مصرية من يوم تأسيسها: تسجّل قيودها، وتبني دفاترها، وتقرأ قوائمها المالية. كل حلقة تبدأ بموقف حدث في الشركة، ثم الشرح، ثم القاعدة من المعيار أو القانون، ثم التطبيق والاختبار.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a className="btn-primary" href={href({ name: 'episode', id: next.id })}>
                {completed === 0 ? 'ابدأ الحلقة الأولى' : `تابع: الحلقة ${next.number}`}
              </a>
              <a className="btn-secondary" href={href({ name: 'company' })}>
                تعرّف على الشركة
              </a>
            </div>
          </div>
          <div className="space-y-4 rounded-2xl bg-stone-50 p-4 dark:bg-stone-950/60">
            <Stat label="الحلقات المكتملة" value={`${completed} / ${episodes.length}`} />
            <ProgressBar value={completed / Math.max(1, episodes.length)} label="الحلقات المكتملة" />
            <Stat label="إجابات صحيحة في الاختبارات" value={answered.length ? `${correct} / ${answered.length}` : '—'} />
            <Stat
              label="تمارين القيد المحلولة"
              value={`${episodes.reduce((s, e) => s + Object.keys(progress.get(e.id).exercises).length, 0)} / ${episodes.reduce((s, e) => s + e.quiz.exercises.length, 0)}`}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="parts-title">
        <h2 id="parts-title" className="mb-4 text-xl font-bold text-stone-900 dark:text-white">
          أجزاء البرنامج
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {program.parts.map((part) => {
            const available = part.status === 'available';
            return (
              <article key={part.number} className={`card p-5 ${available ? '' : 'opacity-80'}`}>
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-stone-500">الجزء {part.number}</div>
                    <h3 className="text-lg font-bold text-stone-900 dark:text-white">{part.title}</h3>
                  </div>
                  {available ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      متاح
                    </span>
                  ) : (
                    <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                      قريباً
                    </span>
                  )}
                </header>
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{part.description}</p>
                {available ? (
                  <ol className="mt-4 space-y-2">
                    {part.episodes.map((ref) => {
                      const p = progress.get(ref.id);
                      const ratio = episodeRatio(p);
                      return (
                        <li key={ref.id}>
                          <a
                            href={href({ name: 'episode', id: ref.id })}
                            className="flex items-center gap-3 rounded-xl border border-stone-200 p-3 hover:border-brand-400 hover:bg-brand-50/40 dark:border-stone-800 dark:hover:bg-brand-950/30"
                          >
                            <span
                              aria-hidden="true"
                              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                                p.completedAt ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                              }`}
                            >
                              {p.completedAt ? '✓' : ref.number}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-stone-900 dark:text-stone-100">{ref.title}</span>
                              <ProgressBar value={ratio} label={`تقدم الحلقة ${ref.number}`} size="sm" />
                            </span>
                            {p.completedAt && <span className="sr-only">مكتملة</span>}
                          </a>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {part.topics.map((t) => (
                      <li key={t} className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs text-stone-600 dark:border-stone-700 dark:text-stone-400">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="text-center text-sm">
        <button
          type="button"
          className="btn-ghost text-red-700 dark:text-red-400"
          onClick={() => {
            if (window.confirm('هل تريد مسح كل تقدمك ونتائج الاختبارات؟ لا يمكن التراجع.')) progress.reset();
          }}
        >
          إعادة ضبط التقدم
        </button>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-stone-600 dark:text-stone-400">{label}</span>
      <span className="num text-lg font-bold text-stone-900 dark:text-white">{value}</span>
    </div>
  );
}
