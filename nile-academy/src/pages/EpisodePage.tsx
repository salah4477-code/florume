import { useEffect, useMemo, useRef } from 'react';
import { episodeById, nextEpisode, prevEpisode, postedEntries } from '../content';
import { firstOccurrences } from '../lib/blocks';
import { collectRefs } from '../lib/inline';
import { href, navigate } from '../router';
import { SECTION_IDS, episodeRatio, useProgress, type SectionId } from '../store/progress';
import type { Episode } from '../types';
import { Blocks } from '../components/Blocks';
import { EntryExercise } from '../components/EntryExercise';
import { FirstTermsContext, RichText } from '../components/RichText';
import { JournalTable } from '../components/JournalTable';
import { ProgressBar } from '../components/ProgressBar';
import { Quiz } from '../components/Quiz';
import { ReviewBadge } from '../components/ReviewBadge';
import { Term } from '../components/Term';
import { NotFoundPage } from './NotFoundPage';

const sectionMeta: Record<SectionId, { title: string; short: string }> = {
  situation: { title: 'الموقف', short: 'الموقف' },
  explanation: { title: 'الشرح', short: 'الشرح' },
  rule: { title: 'القاعدة', short: 'القاعدة' },
  application: { title: 'التطبيق', short: 'التطبيق' },
  mistake: { title: 'غلطة شائعة', short: 'غلطة' },
  quiz: { title: 'اختبار', short: 'اختبار' },
};

export function EpisodePage({ id, section }: { id: string; section?: string }) {
  const ep = episodeById.get(id);
  if (!ep) return <NotFoundPage />;
  return <EpisodeView key={ep.id} ep={ep} section={SECTION_IDS.includes(section as SectionId) ? (section as SectionId) : 'situation'} />;
}

function EpisodeView({ ep, section }: { ep: Episode; section: SectionId }) {
  const progress = useProgress();
  const p = progress.get(ep.id);
  const idx = SECTION_IDS.indexOf(section);
  const top = useRef<HTMLDivElement>(null);
  const firstTerms = useMemo(() => firstOccurrences(ep, (s) => collectRefs(s).refs), [ep]);

  const { visit } = progress;
  useEffect(() => {
    visit(ep.id, section);
  }, [ep.id, section, visit]);

  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, [section]);

  const go = (s: SectionId) => navigate({ name: 'episode', id: ep.id, section: s });
  const next = nextEpisode(ep.id);
  const prev = prevEpisode(ep.id);
  const prevDone = !prev || !!progress.get(prev.id).completedAt;

  return (
    <FirstTermsContext.Provider value={firstTerms}>
      <article ref={top} className="scroll-mt-24">
        <header className="mb-5">
          <a href={href({ name: 'home' })} className="text-sm text-brand-700 hover:underline dark:text-brand-300">
            ← الجزء {ep.part}
          </a>
          <div className="mt-1 text-sm font-semibold text-stone-500">
            الحلقة {ep.number} · {ep.period} · حوالي {ep.minutes} دقيقة
          </div>
          <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl dark:text-white">{ep.title}</h1>
          <p className="text-stone-600 dark:text-stone-400">{ep.subtitle}</p>
          <div className="mt-3 max-w-md">
            <ProgressBar value={episodeRatio(p)} label="تقدمك في الحلقة" />
          </div>
        </header>

        {!prevDone && prev && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            لم تُنهِ الحلقة السابقة «{prev.title}» بعد. يمكنك المتابعة، لكن الأرقام في دفاتر الشركة تتراكم من حلقة إلى أخرى.
          </div>
        )}

        <nav aria-label="أقسام الحلقة" className="sticky top-[3.6rem] z-20 -mx-4 mb-6 border-b border-stone-200 bg-stone-50/95 px-4 py-2 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
          <ol className="flex gap-1 overflow-x-auto">
            {SECTION_IDS.map((s, i) => {
              const active = s === section;
              const seen = p.visited.includes(s);
              return (
                <li key={s} className="shrink-0">
                  <a
                    href={href({ name: 'episode', id: ep.id, section: s })}
                    aria-current={active ? 'step' : undefined}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap ${
                      active
                        ? 'bg-brand-600 font-semibold text-white dark:bg-brand-500 dark:text-stone-950'
                        : seen
                          ? 'text-brand-800 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950'
                          : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-900'
                    }`}
                  >
                    <span className="num text-xs opacity-80">{seen && !active ? '✓' : i + 1}</span>
                    {sectionMeta[s].short}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-xl font-bold text-stone-900 dark:text-white">
            {idx + 1}. {sectionMeta[section].title}
          </h2>

          {section === 'situation' && (
            <>
              <div className="card mb-5 p-4">
                <div className="mb-1 text-sm font-semibold text-stone-500">ستتعلم في هذه الحلقة</div>
                <ul className="list-disc space-y-1 ps-6 text-sm">
                  {ep.objectives.map((o) => (
                    <li key={o}>
                      <RichText text={o} />
                    </li>
                  ))}
                </ul>
              </div>
              <Blocks blocks={ep.situation} />
            </>
          )}

          {section === 'explanation' && <Blocks blocks={ep.explanation} />}

          {section === 'rule' && (
            <>
              {ep.rule.intro && <Blocks blocks={ep.rule.intro} />}
              <div className="space-y-4">
                {ep.rule.refs.map((r) => (
                  <section key={r.id} className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/30">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-stone-900 dark:text-white">
                        <Term id={r.id} label={r.title} />
                      </h3>
                      {r.review && <ReviewBadge id={r.review} />}
                    </div>
                    {r.counterpart && <div className="mt-1 text-sm text-violet-800 dark:text-violet-300">المقابل / المرجع: {r.counterpart}</div>}
                    <p className="mt-2">
                      <RichText text={r.text} />
                    </p>
                    <code dir="ltr" className="mt-2 block text-start text-xs text-stone-400">
                      {r.id}
                    </code>
                  </section>
                ))}
              </div>
            </>
          )}

          {section === 'application' && (
            <>
              {ep.application.intro && <Blocks blocks={ep.application.intro} />}
              {ep.application.entries.map((e, i) => (
                <JournalTable key={e.id} entry={e} index={i + 1} />
              ))}
              {ep.application.outro && <Blocks blocks={ep.application.outro} />}
            </>
          )}

          {section === 'mistake' && (
            <>
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 font-semibold text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {ep.mistake.title}
              </div>
              <Blocks blocks={ep.mistake.blocks} />
            </>
          )}

          {section === 'quiz' && (
            <>
              <Quiz questions={ep.quiz.questions} answers={p.answers} onAnswer={(q, o) => progress.answer(ep.id, q, o)} />
              <h3 className="mt-10 text-lg font-bold text-stone-900 dark:text-white">تمارين القيود</h3>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                اختر الحسابات من دليل الحسابات واكتب المبالغ. سيتحقق التطبيق من التوازن ومن صحة الحسابات والجوانب والمبالغ.
              </p>
              {ep.quiz.exercises.map((x, i) => (
                <EntryExercise key={x.id} exercise={x} number={i + 1} solved={!!p.exercises[x.id]} onSolved={() => progress.solveExercise(ep.id, x.id)} />
              ))}
              <CompletionPanel ep={ep} />
            </>
          )}

          <div className="mt-10 flex items-center justify-between gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
            {idx > 0 ? (
              <button type="button" className="btn-secondary" onClick={() => go(SECTION_IDS[idx - 1])}>
                → {sectionMeta[SECTION_IDS[idx - 1]].title}
              </button>
            ) : (
              <span />
            )}
            {idx < SECTION_IDS.length - 1 && (
              <button type="button" className="btn-primary" onClick={() => go(SECTION_IDS[idx + 1])}>
                {sectionMeta[SECTION_IDS[idx + 1]].title} ←
              </button>
            )}
            {idx === SECTION_IDS.length - 1 && next && p.completedAt && (
              <a className="btn-primary" href={href({ name: 'episode', id: next.id })}>
                الحلقة التالية ←
              </a>
            )}
          </div>
        </div>
      </article>
    </FirstTermsContext.Provider>
  );
}

function CompletionPanel({ ep }: { ep: Episode }) {
  const progress = useProgress();
  const p = progress.get(ep.id);
  const posted = postedEntries(ep);
  const answered = ep.quiz.questions.filter((q) => q.id in p.answers).length;

  return (
    <section className="mt-10 rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-900 dark:bg-brand-950/40">
      <h3 className="text-lg font-bold text-stone-900 dark:text-white">الخلاصة</h3>
      <ul className="mt-2 list-disc space-y-1 ps-6">
        {ep.takeaways.map((t) => (
          <li key={t}>
            <RichText text={t} />
          </li>
        ))}
      </ul>
      {p.completedAt ? (
        <div className="mt-4 space-y-3">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">
            أنهيت الحلقة ✓ وتم ترحيل {posted.length} قيود إلى دفاتر الشركة.
          </p>
          <div className="flex flex-wrap gap-2">
            <a className="btn-primary" href={href({ name: 'books' })}>
              افتح دفاتر الشركة
            </a>
            <a className="btn-secondary" href={href({ name: 'statements' })}>
              القوائم المالية
            </a>
            <button type="button" className="btn-ghost" onClick={() => progress.uncomplete(ep.id)}>
              إلغاء الترحيل
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {answered < ep.quiz.questions.length && (
            <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">
              أجبت عن {answered} من {ep.quiz.questions.length} أسئلة. يمكنك إنهاء الحلقة الآن أو بعد الإجابة عن الباقي.
            </p>
          )}
          <button type="button" className="btn-primary" onClick={() => progress.complete(ep.id)}>
            إنهاء الحلقة وترحيل قيودها ({posted.length}) إلى الدفاتر
          </button>
        </div>
      )}
    </section>
  );
}
