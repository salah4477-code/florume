// مصطلح أو مرجع مربوط بالقاموس بمعرف ثابت (مثل term:depreciation أو eas:10)، وعليه تلميح بتعريف قصير.
// المعرّف يظهر في data-term علشان الدليل المرجعي المستقبلي يقدر يربط بيه.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { glossary } from '../content';
import { href } from '../router';
import { ReviewBadge } from './ReviewBadge';

const kindLabel: Record<string, string> = {
  term: 'مصطلح',
  eas: 'معيار مصري',
  ifrs: 'معيار دولي',
  law: 'قانون / قرار',
  org: 'جهة',
};

export function Term({ id, label, showEn }: { id: string; label?: string; showEn?: boolean }) {
  const item = glossary.get(id);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const tipId = useId();
  const hoverTimer = useRef<number | undefined>(undefined);

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const width = Math.min(320, window.innerWidth - 24);
    const center = b.left + b.width / 2;
    const left = Math.max(12, Math.min(center - width / 2, window.innerWidth - width - 12));
    const above = b.top > 220;
    setPos({ top: above ? b.top - 8 : b.bottom + 8, left, above });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'pointerdown' && (btn.current?.contains(e.target as Node) || pop.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    const reposition = () => place();
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, place]);

  if (!item) {
    // المرجع غير معرف (الاختبارات تمنع ده، لكن نعرض النص بأمان)
    return <span data-term={id}>{label ?? id}</span>;
  }

  const text = label ?? item.ar;
  let content: ReactNode = text;
  if (showEn && item.en) {
    content = (
      <>
        {text}{' '}
        <span className="text-[0.85em] font-normal text-stone-500 dark:text-stone-400">
          (<span dir="ltr">{item.en}</span>)
        </span>
      </>
    );
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        data-term={id}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => {
          window.clearTimeout(hoverTimer.current);
          hoverTimer.current = window.setTimeout(() => setOpen(true), 250);
        }}
        onMouseLeave={() => {
          window.clearTimeout(hoverTimer.current);
          hoverTimer.current = window.setTimeout(() => setOpen(false), 200);
        }}
        className="inline cursor-help rounded-sm border-b border-dotted border-brand-500 text-inherit decoration-0 hover:bg-brand-50 dark:border-brand-400 dark:hover:bg-brand-950"
      >
        {content}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            id={tipId}
            role="tooltip"
            dir="rtl"
            onMouseEnter={() => window.clearTimeout(hoverTimer.current)}
            onMouseLeave={() => {
              hoverTimer.current = window.setTimeout(() => setOpen(false), 200);
            }}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: Math.min(320, window.innerWidth - 24),
              transform: pos.above ? 'translateY(-100%)' : undefined,
            }}
            className="z-50 rounded-xl border border-stone-200 bg-white p-3 text-sm leading-7 shadow-xl dark:border-stone-700 dark:bg-stone-900"
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-100 px-2 text-xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                {kindLabel[item.kind] ?? item.kind}
              </span>
              {item.review && <ReviewBadge id={item.review} />}
            </div>
            <div className="font-semibold text-stone-900 dark:text-white">{item.ar}</div>
            {item.en && (
              <div dir="ltr" className="text-start text-xs text-stone-500 dark:text-stone-400">
                {item.en}
              </div>
            )}
            <p className="mt-1 text-stone-700 dark:text-stone-300">{item.short}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-stone-400">
              <code dir="ltr">{item.id}</code>
              <a href={href({ name: 'glossary', q: item.id })} className="text-brand-700 hover:underline dark:text-brand-300">
                في المصطلحات ←
              </a>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
