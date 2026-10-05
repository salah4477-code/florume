// أسئلة الاختيار من متعدد: الإجابة الأولى هي المحسوبة، ويظهر شرح الصحيح والخطأ.

import type { QuizQuestion } from '../types';
import { RichText } from './RichText';

export function Quiz({
  questions,
  answers,
  onAnswer,
}: {
  questions: QuizQuestion[];
  answers: Record<string, number>;
  onAnswer: (questionId: string, option: number) => void;
}) {
  const answered = questions.filter((q) => q.id in answers);
  const correct = answered.filter((q) => q.options[answers[q.id]]?.correct).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-stone-100 px-3 py-1 dark:bg-stone-800">
          أجبت عن {answered.length} من {questions.length}
        </span>
        {answered.length > 0 && (
          <span className="rounded-full bg-brand-100 px-3 py-1 text-brand-800 dark:bg-brand-900 dark:text-brand-200">
            النتيجة: {correct} / {answered.length}
          </span>
        )}
      </div>
      <ol className="space-y-6">
        {questions.map((q, qi) => {
          const chosen = answers[q.id];
          const done = chosen !== undefined;
          return (
            <li key={q.id} className="card p-4 sm:p-5">
              <fieldset>
                <legend className="mb-3 font-semibold text-stone-900 dark:text-white">
                  <span className="text-brand-600 dark:text-brand-400">س{qi + 1}. </span>
                  <RichText text={q.question} />
                </legend>
                <div className="space-y-2">
                  {q.options.map((o, oi) => {
                    const isChosen = chosen === oi;
                    let style = 'border-stone-200 hover:border-brand-400 hover:bg-brand-50/50 dark:border-stone-700 dark:hover:bg-brand-950/30';
                    if (done) {
                      if (o.correct) style = 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40';
                      else if (isChosen) style = 'border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/40';
                      else style = 'border-stone-200 opacity-70 dark:border-stone-800';
                    }
                    return (
                      <label
                        key={oi}
                        className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${style} ${done ? 'cursor-default' : ''}`}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          className="mt-1.5 accent-brand-600"
                          checked={isChosen}
                          disabled={done}
                          onChange={() => onAnswer(q.id, oi)}
                        />
                        <span className="flex-1">
                          <RichText text={o.text} />
                          {done && (isChosen || o.correct) && (
                            <span className="mt-1 block text-sm text-stone-600 dark:text-stone-400">
                              <span className="font-semibold">
                                {o.correct ? (isChosen ? '✓ إجابة صحيحة: ' : '✓ الإجابة الصحيحة: ') : '✗ إجابة خاطئة: '}
                              </span>
                              <RichText text={o.explanation} />
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {done && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-brand-700 dark:text-brand-300">لماذا الخيارات الأخرى خاطئة؟</summary>
                    <ul className="mt-2 list-disc space-y-1 ps-6 text-stone-600 dark:text-stone-400">
                      {q.options.map((o, oi) =>
                        !o.correct && oi !== chosen ? (
                          <li key={oi}>
                            <span className="font-medium">
                              <RichText text={o.text} />
                            </span>
                            : <RichText text={o.explanation} />
                          </li>
                        ) : null,
                      )}
                    </ul>
                  </details>
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
