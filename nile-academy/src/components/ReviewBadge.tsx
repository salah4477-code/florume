// شارة "يحتاج مراجعة" لأي معلومة قانونية أو رقمية لم نتحقق منها من مصدر رسمي (مسجلة في VERIFY.md).

export function ReviewBadge({ id }: { id: string }) {
  return (
    <span
      data-review={id}
      title={`هذه المعلومة تحتاج مراجعة من مصدر رسمي (البند ${id} في ملف VERIFY.md)`}
      className="mx-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0 align-middle text-xs font-medium leading-6 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.75 11.5h-1.5V12h1.5v1.5zm0-3h-1.5V6h1.5v4.5z" />
      </svg>
      يحتاج مراجعة <span className="num opacity-70">{id}</span>
    </span>
  );
}
