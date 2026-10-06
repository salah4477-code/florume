// يبني نسخة من ملف HTML واحد فيه البرنامج كله (CSS و JS مضمنين)،
// تُفتح بالضغط عليها مرتين بدون خادم. شغّل `npm run build` قبله.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_, p) => `<style>${readFileSync(join(dist, p), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g, (_, p) => {
  // نمنع إغلاق وسم السكربت مبكراً لو ظهر النص داخل الكود
  const js = readFileSync(join(dist, p), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('بقيت روابط لملفات خارجية في النسخة المجمعة');

const out = join(root, 'release', 'nile-academy.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`✓ ${out} (${Math.round(html.length / 1024)} KB)`);
