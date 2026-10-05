// تنسيق المبالغ والتواريخ للعرض.

const grouping = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** 1250000 ← "1,250,000 ج.م" */
export function formatMoney(n: number, opts: { currency?: boolean; parens?: boolean } = {}): string {
  const { currency = true, parens = false } = opts;
  const neg = n < 0;
  const body = grouping.format(Math.abs(n));
  const withSign = neg ? (parens ? `(${body})` : `-${body}`) : body;
  return currency ? `${withSign} ج.م` : withSign;
}

/** رقم بدون علامة العملة، والصفر يظهر شرطة (مناسب للجداول) */
export function formatAmountCell(n: number, opts: { parens?: boolean } = {}): string {
  if (n === 0) return '—';
  return formatMoney(n, { currency: false, parens: opts.parens ?? true });
}

const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** 2026-04-30 ← "30 أبريل 2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${months[m - 1]} ${y}`;
}
