export function ProgressBar({ value, label, size = 'md' }: { value: number; label: string; size?: 'sm' | 'md' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800 ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}
    >
      <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}
