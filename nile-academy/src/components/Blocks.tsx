import type { Block } from '../types';
import { findEntry } from '../content';
import { RichText } from './RichText';
import { JournalTable } from './JournalTable';

const calloutStyles: Record<string, string> = {
  info: 'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/50',
  warning: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50',
  success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/50',
  law: 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/50',
};

export function BlockView({ block }: { block: Block }) {
  if (typeof block === 'string') {
    return (
      <p>
        <RichText text={block} />
      </p>
    );
  }
  switch (block.type) {
    case 'heading':
      return (
        <h3 className="mt-6 mb-2 text-lg font-bold text-stone-900 dark:text-white">
          <RichText text={block.text} />
        </h3>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag className={`my-3 space-y-2 ps-6 ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-brand-500`}>
          {block.items.map((item, i) => (
            <li key={i}>
              <RichText text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <figure className="my-4">
          {block.caption && <figcaption className="mb-2 text-sm font-semibold text-stone-600 dark:text-stone-400">{block.caption}</figcaption>}
          <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800">
            <table className="table-fin">
              <thead>
                <tr>
                  {block.headers.map((h, i) => (
                    <th key={i} scope="col">
                      <RichText text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className={/^[\d,().%\s−-]+$/.test(cell) ? 'num text-end whitespace-nowrap' : ''}>
                        <RichText text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      );
    case 'callout': {
      const texts = Array.isArray(block.text) ? block.text : [block.text];
      return (
        <aside className={`my-4 rounded-xl border p-4 ${calloutStyles[block.tone]}`}>
          {block.title && <div className="mb-1 font-semibold text-stone-900 dark:text-white">{block.title}</div>}
          {texts.map((t, i) => (
            <p key={i} className="my-1">
              <RichText text={t} />
            </p>
          ))}
        </aside>
      );
    }
    case 'entry': {
      const e = findEntry(block.entryId);
      return e ? <JournalTable entry={e} /> : null;
    }
  }
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="prose-ar">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}
