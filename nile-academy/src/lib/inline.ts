// تحليل النص المضمّن في المحتوى:
//   **غامق**
//   {{term:depreciation|الإهلاك}}   مصطلح مربوط بالقاموس، والنص بعد | هو اللي يظهر
//   {{eas:10}}                      يظهر اسم البند من القاموس
//   {{review:V03}}                  شارة "يحتاج مراجعة" مربوطة ببند في VERIFY.md

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'ref'; id: string; label?: string }
  | { type: 'review'; id: string };

const pattern = /\{\{([^}|]+)(?:\|([^}]*))?\}\}|\*\*([^*]+)\*\*/g;

export function parseInline(src: string): InlineToken[] {
  const out: InlineToken[] = [];
  let last = 0;
  for (const m of src.matchAll(pattern)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: 'text', text: src.slice(last, idx) });
    if (m[3] !== undefined) {
      out.push({ type: 'bold', text: m[3] });
    } else {
      const id = m[1].trim();
      if (id.startsWith('review:')) out.push({ type: 'review', id: id.slice('review:'.length) });
      else out.push({ type: 'ref', id, label: m[2]?.trim() || undefined });
    }
    last = idx + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', text: src.slice(last) });
  return out;
}

/** كل المراجع المستخدمة داخل نص (للاختبارات) */
export function collectRefs(src: string): { refs: string[]; reviews: string[] } {
  const refs: string[] = [];
  const reviews: string[] = [];
  const walk = (text: string) => {
    for (const t of parseInline(text)) {
      if (t.type === 'ref') refs.push(t.id);
      if (t.type === 'review') reviews.push(t.id);
      if (t.type === 'bold') walk(t.text);
    }
  };
  walk(src);
  return { refs, reviews };
}
