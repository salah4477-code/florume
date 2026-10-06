// تحميل كل ملفات المحتوى من مجلد content/ وقت البناء.
// إضافة حلقة جديدة = إضافة ملف JSON في content/parts/part-N/ وتسجيله في program.json.

import type { ChartOfAccounts, Company, Episode, GlossaryItem, JournalEntry, Program } from './types';
import programJson from '../content/program.json';
import coaJson from '../content/chart-of-accounts.json';
import glossaryJson from '../content/glossary.json';
import companyJson from '../content/company.json';

export const program = programJson as Program;
export const coa = coaJson as ChartOfAccounts;
export const company = companyJson as Company;
export const glossary = new Map((glossaryJson as GlossaryItem[]).map((g) => [g.id, g]));

const episodeModules = import.meta.glob<Episode>('../content/parts/*/*.json', { eager: true, import: 'default' });

/** المفتاح: المسار النسبي داخل content/ مثل parts/part-1/ep-01.json */
const episodesByFile = new Map<string, Episode>(
  Object.entries(episodeModules).map(([path, ep]) => [path.replace('../content/', ''), ep]),
);

/** الحلقات المتاحة بالترتيب (الجزء ثم رقم الحلقة) */
export const episodes: Episode[] = program.parts
  .filter((p) => p.status === 'available')
  .flatMap((p) =>
    p.episodes.map((ref) => {
      const ep = episodesByFile.get(ref.file);
      if (!ep) throw new Error(`ملف الحلقة ${ref.file} غير موجود`);
      return ep;
    }),
  );

export const episodeById = new Map(episodes.map((e) => [e.id, e]));

/** القيود التي تُرحَّل لدفاتر الشركة من حلقة */
export function postedEntries(ep: Episode): JournalEntry[] {
  return ep.application.entries.filter((e) => e.post !== false);
}

/** كل القيود حتى (وشاملة) الحلقات المحددة، بترتيب البرنامج */
export function entriesFor(completedIds: Iterable<string>): JournalEntry[] {
  const done = new Set(completedIds);
  return episodes.filter((e) => done.has(e.id)).flatMap(postedEntries);
}

export function findEntry(id: string): JournalEntry | undefined {
  for (const ep of episodes) {
    const e = ep.application.entries.find((x) => x.id === id);
    if (e) return e;
  }
  return undefined;
}

export function nextEpisode(id: string): Episode | undefined {
  const i = episodes.findIndex((e) => e.id === id);
  return i >= 0 ? episodes[i + 1] : undefined;
}

export function prevEpisode(id: string): Episode | undefined {
  const i = episodes.findIndex((e) => e.id === id);
  return i > 0 ? episodes[i - 1] : undefined;
}
