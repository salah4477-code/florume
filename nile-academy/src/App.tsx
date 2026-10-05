import { useEffect } from 'react';
import { useRoute } from './router';
import { ProgressProvider } from './store/progress';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { CompanyPage } from './pages/CompanyPage';
import { EpisodePage } from './pages/EpisodePage';
import { BooksPage } from './pages/BooksPage';
import { StatementsPage } from './pages/StatementsPage';
import { GlossaryPage } from './pages/GlossaryPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  const route = useRoute();

  useEffect(() => {
    if (route.name !== 'episode') window.scrollTo({ top: 0 });
  }, [route.name]);

  let page;
  switch (route.name) {
    case 'home':
      page = <HomePage />;
      break;
    case 'company':
      page = <CompanyPage />;
      break;
    case 'episode':
      page = <EpisodePage id={route.id} section={route.section} />;
      break;
    case 'books':
      page = <BooksPage tab={route.tab} />;
      break;
    case 'statements':
      page = <StatementsPage />;
      break;
    case 'glossary':
      page = <GlossaryPage key={route.q} q={route.q} />;
      break;
    default:
      page = <NotFoundPage />;
  }

  return (
    <ProgressProvider>
      <Layout route={route}>{page}</Layout>
    </ProgressProvider>
  );
}
