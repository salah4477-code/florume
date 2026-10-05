import { useEffect, useState, type ReactNode } from 'react';
import { episodes, program } from '../content';
import { writeRaw } from '../lib/storage';
import { href, type Route } from '../router';
import { episodeRatio, useProgress } from '../store/progress';
import { ProgressBar } from './ProgressBar';

const THEME_KEY = 'nile-academy:theme';

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return [
    dark,
    () =>
      setDark((d) => {
        writeRaw(THEME_KEY, !d ? 'dark' : 'light');
        return !d;
      }),
  ];
}

const nav: { route: Route; label: string; match: Route['name'][] }[] = [
  { route: { name: 'home' }, label: 'البرنامج', match: ['home', 'episode'] },
  { route: { name: 'company' }, label: 'الشركة', match: ['company'] },
  { route: { name: 'books' }, label: 'دفاتر الشركة', match: ['books'] },
  { route: { name: 'statements' }, label: 'القوائم المالية', match: ['statements'] },
  { route: { name: 'glossary' }, label: 'المصطلحات', match: ['glossary'] },
];

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const [dark, toggle] = useTheme();
  const progress = useProgress();
  const overall = episodes.length ? episodes.reduce((s, e) => s + episodeRatio(progress.get(e.id)), 0) / episodes.length : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-2">
        تخطَّ إلى المحتوى
      </a>
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <a href={href({ name: 'home' })} className="flex shrink-0 items-center gap-2 font-bold text-stone-900 dark:text-white">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">ن</span>
            <span className="hidden sm:inline">{program.title}</span>
          </a>
          <nav aria-label="التنقل الرئيسي" className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 text-sm">
            {nav.map((n) => {
              const active = n.match.includes(route.name);
              return (
                <a
                  key={n.label}
                  href={href(n.route)}
                  aria-current={active ? 'page' : undefined}
                  className={`shrink-0 rounded-lg px-3 py-1.5 whitespace-nowrap ${
                    active
                      ? 'bg-brand-50 font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-200'
                      : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900'
                  }`}
                >
                  {n.label}
                </a>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={toggle}
            className="btn-ghost shrink-0 !px-2.5"
            aria-label={dark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
            title={dark ? 'الوضع النهاري' : 'الوضع الليلي'}
          >
            {dark ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
        </div>
        <ProgressBar value={overall} label="تقدمك في البرنامج" size="sm" />
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-500 dark:border-stone-800">
        <p>شركة «النيل للصناعات الغذائية» شركة خيالية لأغراض التعليم. المحتوى تعليمي ولا يغني عن الرجوع للنصوص الرسمية.</p>
        <p className="mt-1">البنود المعلّمة «يحتاج مراجعة» لم نتحقق منها من مصدر رسمي بعد.</p>
      </footer>
    </div>
  );
}
