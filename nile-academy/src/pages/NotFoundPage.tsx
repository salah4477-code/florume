import { href } from '../router';

export function NotFoundPage() {
  return (
    <div className="card p-8 text-center">
      <p className="text-lg font-semibold">الصفحة غير موجودة</p>
      <a className="btn-primary mt-4" href={href({ name: 'home' })}>
        العودة للبرنامج
      </a>
    </div>
  );
}
