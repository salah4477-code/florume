import { createContext, useContext, type ReactNode } from 'react';
import { parseInline } from '../lib/inline';
import { Term } from './Term';
import { ReviewBadge } from './ReviewBadge';

/** النص ← المصطلحات التي تظهر فيه لأول مرة (يُعرض لها المقابل الإنجليزي) */
export const FirstTermsContext = createContext<Map<string, Set<string>> | null>(null);

export function RichText({ text }: { text: string }) {
  const first = useContext(FirstTermsContext)?.get(text);
  const nodes: ReactNode[] = parseInline(text).map((t, i) => {
    switch (t.type) {
      case 'text':
        return t.text;
      case 'bold':
        return <strong key={i}>{renderNested(t.text)}</strong>;
      case 'ref':
        return <Term key={i} id={t.id} label={t.label} showEn={first?.has(t.id) ?? false} />;
      case 'review':
        return <ReviewBadge key={i} id={t.id} />;
    }
  });
  return <>{nodes}</>;

  // المصطلحات داخل النص الغامق
  function renderNested(inner: string): ReactNode {
    return parseInline(inner).map((t, j) =>
      t.type === 'ref' ? (
        <Term key={j} id={t.id} label={t.label} showEn={first?.has(t.id) ?? false} />
      ) : t.type === 'review' ? (
        <ReviewBadge key={j} id={t.id} />
      ) : (
        t.text
      ),
    );
  }
}
