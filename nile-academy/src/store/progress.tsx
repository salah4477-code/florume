// تقدم المستخدم: الأقسام التي زارها، وإجابات الاختبارات، والتمارين المحلولة، والحلقات المكتملة.
// يُحفظ في localStorage، والتطبيق يعمل بدونه لو التخزين غير متاح.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJSON, removeKey, writeJSON } from '../lib/storage';
import { episodes } from '../content';

export const SECTION_IDS = ['situation', 'explanation', 'rule', 'application', 'mistake', 'quiz'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface EpisodeProgress {
  visited: SectionId[];
  /** رقم الاختيار الذي اختاره المستخدم لكل سؤال */
  answers: Record<string, number>;
  /** التمارين التي حُلّت صحيحاً */
  exercises: Record<string, boolean>;
  completedAt?: string;
}

interface ProgressState {
  version: 1;
  episodes: Record<string, EpisodeProgress>;
}

const KEY = 'nile-academy:progress:v1';
const empty = (): ProgressState => ({ version: 1, episodes: {} });
const emptyEpisode = (): EpisodeProgress => ({ visited: [], answers: {}, exercises: {} });

function load(): ProgressState {
  const s = readJSON<ProgressState | null>(KEY, null);
  if (!s || s.version !== 1 || typeof s.episodes !== 'object' || s.episodes === null) return empty();
  return s;
}

interface ProgressApi {
  state: ProgressState;
  get(id: string): EpisodeProgress;
  visit(id: string, section: SectionId): void;
  answer(id: string, questionId: string, option: number): void;
  solveExercise(id: string, exerciseId: string): void;
  complete(id: string): void;
  uncomplete(id: string): void;
  reset(): void;
  completedIds: string[];
}

const Ctx = createContext<ProgressApi | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProgressState>(load);

  useEffect(() => writeJSON(KEY, state), [state]);

  const update = useCallback((id: string, fn: (p: EpisodeProgress) => EpisodeProgress) => {
    setState((s) => {
      const cur = s.episodes[id] ?? emptyEpisode();
      const next = fn(cur);
      // نفس الكائن = مفيش تغيير؛ نرجّع الحالة كما هي علشان منعملش إعادة رسم بلا داعٍ
      return next === cur ? s : { ...s, episodes: { ...s.episodes, [id]: next } };
    });
  }, []);

  const api = useMemo<ProgressApi>(
    () => ({
      state,
      get: (id) => state.episodes[id] ?? emptyEpisode(),
      visit: (id, section) =>
        update(id, (p) => (p.visited.includes(section) ? p : { ...p, visited: [...p.visited, section] })),
      answer: (id, q, option) =>
        update(id, (p) => (q in p.answers ? p : { ...p, answers: { ...p.answers, [q]: option } })),
      solveExercise: (id, x) => update(id, (p) => ({ ...p, exercises: { ...p.exercises, [x]: true } })),
      complete: (id) => update(id, (p) => ({ ...p, completedAt: p.completedAt ?? new Date().toISOString() })),
      uncomplete: (id) => update(id, (p) => ({ ...p, completedAt: undefined })),
      reset: () => {
        removeKey(KEY);
        setState(empty());
      },
      // بترتيب البرنامج، علشان القيود تترحّل بالترتيب الصحيح
      completedIds: episodes.filter((e) => state.episodes[e.id]?.completedAt).map((e) => e.id),
    }),
    [state, update],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useProgress(): ProgressApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProgress خارج ProgressProvider');
  return v;
}

/** نسبة تقدم الحلقة من 0 إلى 1: الأقسام الستة + الإنهاء */
export function episodeRatio(p: EpisodeProgress): number {
  const sections = SECTION_IDS.filter((s) => p.visited.includes(s)).length;
  return (sections + (p.completedAt ? 1 : 0)) / (SECTION_IDS.length + 1);
}
