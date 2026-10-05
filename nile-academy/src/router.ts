// توجيه بسيط بالـ hash علشان التطبيق يشتغل على أي استضافة ثابتة من غير إعدادات سيرفر.

import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'company' }
  | { name: 'episode'; id: string; section?: string }
  | { name: 'books'; tab?: string }
  | { name: 'statements' }
  | { name: 'glossary'; q?: string }
  | { name: 'not-found' };

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  switch (parts[0]) {
    case undefined:
      return { name: 'home' };
    case 'company':
      return { name: 'company' };
    case 'episode':
      return parts[1] ? { name: 'episode', id: parts[1], section: parts[2] } : { name: 'not-found' };
    case 'books':
      return { name: 'books', tab: parts[1] };
    case 'statements':
      return { name: 'statements' };
    case 'glossary':
      return { name: 'glossary', q: params.get('q') ?? undefined };
    default:
      return { name: 'not-found' };
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'company':
      return '#/company';
    case 'episode':
      return `#/episode/${r.id}${r.section ? `/${r.section}` : ''}`;
    case 'books':
      return `#/books${r.tab ? `/${r.tab}` : ''}`;
    case 'statements':
      return '#/statements';
    case 'glossary':
      return `#/glossary${r.q ? `?q=${encodeURIComponent(r.q)}` : ''}`;
    case 'not-found':
      return '#/';
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(r: Route): void {
  window.location.hash = href(r);
}
