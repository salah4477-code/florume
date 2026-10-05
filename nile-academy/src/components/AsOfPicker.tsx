// اختيار "الدفاتر بعد الحلقة رقم..." علشان المستخدم يشوف تطور الأرصدة حلقة بحلقة.

import { useState } from 'react';
import { entriesFor, episodeById, episodes } from '../content';
import { href } from '../router';
import { useProgress } from '../store/progress';
import type { JournalEntry } from '../types';

export function useAsOf(): {
  completed: string[];
  upTo: string | undefined;
  setUpTo: (id: string) => void;
  entries: JournalEntry[];
} {
  const { completedIds } = useProgress();
  const [chosen, setChosen] = useState<string | undefined>();
  const upTo = chosen && completedIds.includes(chosen) ? chosen : completedIds[completedIds.length - 1];
  const included = upTo ? completedIds.slice(0, completedIds.indexOf(upTo) + 1) : [];
  return { completed: completedIds, upTo, setUpTo: setChosen, entries: entriesFor(included) };
}

export function AsOfPicker({ completed, upTo, onChange }: { completed: string[]; upTo?: string; onChange: (id: string) => void }) {
  if (completed.length === 0) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-stone-600 dark:text-stone-400">عرض الدفاتر بعد:</span>
      <select className="input !w-auto" value={upTo} onChange={(e) => onChange(e.target.value)}>
        {completed.map((id) => {
          const ep = episodeById.get(id)!;
          return (
            <option key={id} value={id}>
              الجزء {ep.part} - الحلقة {ep.number}: {ep.title}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function EmptyBooks() {
  return (
    <div className="card p-8 text-center">
      <p className="text-lg font-semibold text-stone-900 dark:text-white">الدفاتر فارغة حتى الآن</p>
      <p className="mt-2 text-stone-600 dark:text-stone-400">
        القيود تُرحَّل هنا تلقائياً عندما تُنهي كل حلقة. ابدأ بالحلقة الأولى، وفي نهاية قسم «اختبار» اضغط «إنهاء الحلقة».
      </p>
      <a className="btn-primary mt-4" href={href({ name: 'episode', id: episodes[0].id })}>
        ابدأ الحلقة الأولى
      </a>
    </div>
  );
}
