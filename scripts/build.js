#!/usr/bin/env node
/*
 * يجمع التطبيق في ملف HTML واحد يعمل بدون إنترنت وبدون سيرفر:
 *   dist/florume.html  — افتحه بالضغط مرتين من أي جهاز
 * ومع --fragment يكتب أيضًا نسخة بدون وسوم html/head/body (للاستضافة داخل صفحات Artifacts).
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const js = ['js/accounting.js', 'js/export.js', 'js/importer.js', 'js/ops.js', 'js/planning.js', 'js/rules.js', 'js/sync.js', 'js/charts.js', 'js/core.js', 'js/cloud.js', 'js/pages.js'].map(read).join('\n');
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const between = (a, b) => html.slice(html.indexOf(a) + a.length, html.indexOf(b)).trim();
const head = between('<!--HEAD-START-->', '<!--HEAD-END-->').replace(/<link rel="stylesheet" href="css\/style.css">/, `<style>\n${css}\n</style>`);
const body = between('<!--BODY-START-->', '<!--BODY-END-->');
const title = html.match(/<title>.*?<\/title>/)[0];

const full = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${title}
${head}
</head>
<body>
${body}
<script>
${safeJs}
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/florume.html'), full);
console.log('dist/florume.html', (full.length / 1024).toFixed(0) + ' KB');

const fragIdx = process.argv.indexOf('--fragment');
if (fragIdx > -1) {
  const out = process.argv[fragIdx + 1] || path.join(root, 'dist/fragment.html');
  const frag = `${title}\n${head}\n${body}\n<script>\n${safeJs}\n</script>\n`;
  fs.writeFileSync(out, frag);
  console.log(out);
}
