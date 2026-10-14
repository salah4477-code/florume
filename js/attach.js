/*
 * مرفقات المستندات — Florume
 * صور وPDF (فاتورة المورد، صورة التحويل…) بتتحفظ كملفات عادية في فولدر «مرفقات» جوه فولدر النسخ الاحتياطي
 * اللي بتختاره من الإعدادات. المستند نفسه بيحفظ اسم الملف بس. الإرفاق اختياري في كل العمليات.
 * الجزء النقي (أسماء الملفات) مغطى بالاختبارات؛ الكتابة والقراءة من الفولدر في المتصفح بس (Chrome / Edge).
 */
(function (root) {
  'use strict';
  const SUBDIR = 'مرفقات';
  const TYPES = /^(image\/|application\/pdf$)/;
  // اسم ملف ينفع على ويندوز: من غير \ / : * ? " < > | ومن غير مسافات زيادة، وبطول معقول
  function cleanName(s) {
    return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 90) || 'مستند';
  }
  const extOf = (file) => {
    const m = String((file && file.name) || '').match(/\.([a-z0-9]{1,5})$/i);
    if (m) return m[1].toLowerCase();
    const t = (file && file.type) || '';
    return t === 'application/pdf' ? 'pdf' : t.startsWith('image/') ? t.slice(6).replace('jpeg', 'jpg') : 'bin';
  };
  // «مصروف 2026-10-14 إعلانات ميتا.jpg» — ولو الاسم موجود: «… (2).jpg»
  function fileName(base, ext, taken) {
    const b = cleanName(base);
    const has = (n) => (taken instanceof Set ? taken.has(n) : typeof taken === 'function' ? taken(n) : false);
    let name = `${b}.${ext}`;
    for (let i = 2; has(name); i++) name = `${b} (${i}).${ext}`;
    return name;
  }
  const accepted = (file) => !!file && (TYPES.test(file.type || '') || /\.(pdf|jpe?g|png|gif|webp|heic|heif)$/i.test(file.name || ''));
  const isImage = (a) => /^image\//.test(a.type || '') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(a.file || '');
  const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} ميجا` : `${Math.max(1, Math.round(n / 1024))} كيلو`);

  // ---------- الفولدر (في المتصفح) ----------
  async function dir(create) {
    const d = root.CLOUD && root.CLOUD.folderHandle && root.CLOUD.folderHandle();
    if (!d) return null;
    return d.getDirectoryHandle(SUBDIR, { create: !!create });
  }
  async function exists(sub, name) { try { await sub.getFileHandle(name); return true; } catch (e) { return false; } }
  // يحفظ الملف ويرجع بياناته اللي بتتسجل في المستند
  async function save(file, base) {
    const sub = await dir(true);
    if (!sub) throw new Error('اختار فولدر المرفقات الأول');
    const ext = extOf(file);
    let name = fileName(base, ext);
    for (let i = 2; await exists(sub, name); i++) name = `${cleanName(base)} (${i}).${ext}`;
    let h;
    try { h = await sub.getFileHandle(name, { create: true }); } catch (e) {
      // لو الجهاز رفض الاسم العربي: اسم إنجليزي بالتاريخ والوقت بدل ما الملف يضيع
      name = `document-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      h = await sub.getFileHandle(name, { create: true });
    }
    const w = await h.createWritable();
    await w.write(file); await w.close();
    return { file: name, name: file.name || name, type: file.type || '', size: file.size || 0, at: new Date().toISOString() };
  }
  async function read(name) {
    const sub = await dir(false).catch(() => null);
    if (!sub) return null;
    try { return await (await sub.getFileHandle(name)).getFile(); } catch (e) { return null; }
  }

  const api = { SUBDIR, cleanName, extOf, fileName, accepted, isImage, sizeText, save, read };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ATT = api;
})(typeof window !== 'undefined' ? window : globalThis);
