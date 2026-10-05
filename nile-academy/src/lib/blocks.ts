import type { Block, Episode } from '../types';

/** كل النصوص داخل كتلة محتوى (لاستخراج المراجع والتحقق منها) */
export function blockStrings(b: Block): string[] {
  if (typeof b === 'string') return [b];
  switch (b.type) {
    case 'heading':
      return [b.text];
    case 'list':
      return b.items;
    case 'table':
      return [...b.headers, ...b.rows.flat(), ...(b.caption ? [b.caption] : [])];
    case 'callout':
      return [...(b.title ? [b.title] : []), ...(Array.isArray(b.text) ? b.text : [b.text])];
    case 'entry':
      return [];
  }
}

/** كل النصوص في حلقة كاملة */
export function episodeStrings(ep: Episode): string[] {
  const blocks: Block[] = [
    ...ep.situation,
    ...ep.explanation,
    ...(ep.rule.intro ?? []),
    ...(ep.application.intro ?? []),
    ...(ep.application.outro ?? []),
    ...ep.mistake.blocks,
  ];
  return [
    ...blocks.flatMap(blockStrings),
    ...ep.rule.refs.map((r) => r.text),
    ...ep.quiz.questions.flatMap((q) => [q.question, ...q.options.flatMap((o) => [o.text, o.explanation])]),
    ...ep.quiz.exercises.flatMap((x) => [x.prompt, ...(x.hints ?? []), x.explanation ?? '']),
    ...ep.objectives,
    ...ep.takeaways,
  ];
}

/**
 * النصوص بترتيب ظهورها على الشاشة، ومنها نحدد أول ظهور لكل مصطلح
 * علشان نعرض المقابل الإنجليزي بين قوسين مرة واحدة بس.
 */
function displayOrder(ep: Episode): string[] {
  return [
    ...ep.situation.flatMap(blockStrings),
    ...ep.explanation.flatMap(blockStrings),
    ...(ep.rule.intro ?? []).flatMap(blockStrings),
    ...ep.rule.refs.map((r) => r.text),
    ...(ep.application.intro ?? []).flatMap(blockStrings),
    ...(ep.application.outro ?? []).flatMap(blockStrings),
    ...ep.mistake.blocks.flatMap(blockStrings),
    ...ep.quiz.questions.flatMap((q) => [q.question, ...q.options.flatMap((o) => [o.text, o.explanation])]),
    ...ep.quiz.exercises.flatMap((x) => [x.prompt, ...(x.hints ?? []), x.explanation ?? '']),
  ];
}

/** خريطة: النص ← المصطلحات التي تظهر فيه لأول مرة في الحلقة */
export function firstOccurrences(ep: Episode, collect: (s: string) => string[]): Map<string, Set<string>> {
  const seen = new Set<string>();
  const out = new Map<string, Set<string>>();
  for (const s of displayOrder(ep)) {
    for (const id of collect(s)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const set = out.get(s) ?? new Set<string>();
      set.add(id);
      out.set(s, set);
    }
  }
  return out;
}
