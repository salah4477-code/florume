/*
 * السحابة والفريق والنسخ الاحتياطي — Florume
 * - لما النظام يتفتح كصفحة على claude.ai: البيانات بتتحفظ في قاعدة بيانات سحابية وتتزامن لحظيًا بين الأجهزة والفريق.
 * - الأدوار: المالك، مدير، مسؤول طلبات (من غير تكاليف وأرباح)، عرض بس.
 * - سجل التعديلات: مين عمل إيه وإمتى.
 * - لما يتفتح كملف على الجهاز: تذكير بالنسخة الاحتياطية، ونسخ تلقائي لفولدر تختاره (Chrome على الكمبيوتر).
 */
(function () {
  'use strict';
  const COL = 'florume';
  const LOCAL_AUDIT = 'florume.audit';
  const LAST_BACKUP = 'florume.lastBackup';
  const today = () => F.today();
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* لا شيء */ } };

  const C = {
    mode: 'local', // local | connecting | cloud
    status: '', // نص الحالة في الشريط العلوي
    role: 'owner',
    uid: null,
    db: null, user: null,
    remote: {}, // مستندات السحابة كما وصلت
    synced: null, // آخر نسخة متزامنة (بشكل المستندات)
    timer: null, busy: false, again: false, remoteDirty: false, readOnly: false,
    members: [], team: {},
    onChange: null, // يترسم من جديد لما تيجي بيانات من حد تاني
    pendingRender: false,
  };

  const setStatus = (s, kind) => { C.status = s; C.statusKind = kind || ''; const el = document.getElementById('sync-chip'); if (el) { el.textContent = s; el.dataset.kind = kind || ''; el.hidden = !s; } };

  // ---------- سجل التعديلات ----------
  let lastLocal = null;
  function logLocal(entries) {
    if (!entries.length) return;
    let arr = [];
    try { arr = JSON.parse(safeGet(LOCAL_AUDIT) || '[]'); } catch (e) { arr = []; }
    arr.push(...entries);
    safeSet(LOCAL_AUDIT, JSON.stringify(arr.slice(-500)));
  }
  async function logCloud(entries) {
    if (!entries.length || !C.db) return;
    const ref = C.db.collection('audit').doc(today());
    const body = {};
    entries.forEach((e) => (body[`${Date.now()}_${Math.random().toString(36).slice(2, 7)}`] = JSON.stringify(e)));
    try { await ref.update({ entries: body }); }
    catch (err) { try { const snap = await ref.get(); if (!snap.exists) await ref.set({ entries: body }); else await ref.update({ entries: body }); } catch (e) { /* السجل مش بيوقف الحفظ */ } }
  }
  async function readAudit(days = 14) {
    if (C.mode !== 'cloud') { try { return JSON.parse(safeGet(LOCAL_AUDIT) || '[]').reverse(); } catch (e) { return []; } }
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const id = d.toISOString().slice(0, 10);
      try { const snap = await C.db.collection('audit').doc(id).get(); if (snap.exists) Object.values((snap.data() || {}).entries || {}).forEach((v) => { try { out.push(JSON.parse(v)); } catch (e) { /* لا شيء */ } }); } catch (e) { /* لا شيء */ }
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  // ---------- الحفظ ----------
  // بيتنادي من DB.save: محلي يسجل التعديل، وسحابي يبعت التغييرات بعد لحظة
  function onSave() {
    const st = F.DB.state;
    if (C.mode !== 'cloud') {
      const enc = SYNC.encode(st);
      if (lastLocal && !st.demo) logLocal(SYNC.changesForLog(lastLocal, enc, st.settings.invoicePrefix).map((e) => ({ ...e, at: new Date().toISOString(), uid: 'local' })));
      lastLocal = enc;
      scheduleFolderBackup();
      return;
    }
    if (st.demo || C.readOnly) return;
    clearTimeout(C.timer);
    setStatus('بيحفظ…', 'busy');
    C.timer = setTimeout(flush, 400);
  }
  async function flush() {
    if (C.busy) { C.again = true; return; }
    C.busy = true;
    try {
      const next = SYNC.encode(F.DB.state);
      const changes = SYNC.diff(C.synced, next);
      const log = SYNC.changesForLog(C.synced, next, F.DB.state.settings.invoicePrefix).map((e) => ({ ...e, at: new Date().toISOString(), uid: C.uid }));
      for (const d of changes) {
        const ref = C.db.collection(COL).doc(d.docId);
        if (d.meta) { await ref.set(d.meta); C.synced.meta = d.meta; C.remote.meta = { ...d.meta }; continue; }
        const known = C.remote[d.docId] || (C.synced && C.synced[d.docId]);
        if (known) {
          try { await ref.update({ items: d.changes }); }
          catch (e) { if (e && e.code === 'invalid_argument') await ref.set({ kind: 'list', list: d.list, items: d.changes }); else throw e; }
        } else {
          // مستند جديد: قفل قصير عشان لو جهازين بيعملوه في نفس اللحظة
          try { await ref.acquire({ holder: C.uid || 'me', ttlMs: 5000 }); } catch (e) { /* القفل اختياري */ }
          const snap = await ref.get();
          if (snap.exists) await ref.update({ items: d.changes }); else await ref.set({ kind: 'list', list: d.list, items: d.changes });
        }
        // اللي اتكتب يتسجل في النسختين، عشان رجوع التعديل من السحابة مايتقرأش كأنه كل البيانات
        [C.synced, C.remote].forEach((m) => { const cur = (m[d.docId] = m[d.docId] || { kind: 'list', list: d.list, items: {} }); cur.items = { ...cur.items, ...d.changes }; });
      }
      logCloud(log);
      setStatus('☁ متزامن', 'ok');
    } catch (e) {
      const code = e && e.code;
      if (code === 'invalid_argument' || code === 'not_granted' || code === 'revoked') { C.readOnly = true; setStatus('عرض بس — التعديلات مش بتتحفظ', 'bad'); F.UI.toast('صلاحيتك عرض بس — التعديل مش هيتحفظ', 'bad'); }
      else if (code === 'quota_exceeded') { setStatus('المساحة السحابية اتملت', 'bad'); F.UI.toast('المساحة السحابية اتملت — كلمنا عشان نقسم البيانات', 'bad'); }
      else { setStatus('مش متزامن — هيحاول تاني', 'bad'); setTimeout(() => onSave(), 5000); }
    } finally {
      C.busy = false;
      if (C.again) { C.again = false; flush(); }
      else if (C.remoteDirty) { C.remoteDirty = false; applyRemote(); }
    }
  }

  // ---------- استلام تعديلات الآخرين ----------
  function applyRemote() {
    if (C.busy || C.timer && C.status === 'بيحفظ…') { C.remoteDirty = true; return; }
    const hasData = Object.keys(C.remote).some((k) => k !== 'meta');
    if (!hasData) return;
    const local = SYNC.encode(F.DB.state);
    if (!SYNC.diff(local, C.remote).length && !F.DB.state.demo) return;
    F.DB.state = F.migrateState(SYNC.decode(C.remote, F.DB.state));
    F.DB._journal = null;
    F.DB.saveLocal();
    C.synced = JSON.parse(JSON.stringify(C.remote));
    if (document.getElementById('modal').hidden) { if (C.onChange) C.onChange(); }
    else C.pendingRender = true;
  }

  // ---------- الاتصال ----------
  async function connect() {
    if (!window.claude || typeof window.claude.use !== 'function') { localMode(); return; }
    C.mode = 'connecting';
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db) { localMode(); return; }
    C.db = db; C.user = user;
    C.uid = user ? await user.id() : null;
    await resolveRole();
    setStatus('بيتصل…', 'busy');
    let snap;
    try { snap = await db.collection(COL).get(); }
    catch (e) { setStatus('السحابة مش متاحة — شغال على الجهاز', 'bad'); localMode(); return; }
    snap.docs.forEach((d) => (C.remote[d.id] = JSON.parse(JSON.stringify(d.data()))));
    C.mode = 'cloud';
    document.body.dataset.mode = 'cloud';
    const cloudHasData = Object.keys(C.remote).some((k) => k !== 'meta');
    if (cloudHasData) {
      // نحتفظ بنسخة من اللي كان على الجهاز قبل ما السحابة تحل محله
      if (!F.DB.state.demo && !safeGet('florume.preCloud')) safeSet('florume.preCloud', JSON.stringify(F.DB.state));
      C.synced = JSON.parse(JSON.stringify(C.remote));
      F.DB.state = F.migrateState(SYNC.decode(C.remote, F.DB.state));
      F.DB._journal = null; F.DB.saveLocal();
      setStatus('☁ متزامن', 'ok');
    } else {
      C.synced = {};
      if (!F.DB.state.demo) {
        if (C.role === 'owner') { setStatus('بيرفع بياناتك…', 'busy'); await flush(); F.UI.toast('بياناتك اترفعت على السحابة ☁'); }
        else setStatus('السحابة فاضية — المالك يرفع البيانات', 'bad');
      } else setStatus('☁ جاهز — ابدأ ببياناتك', 'ok');
    }
    // التعديلات الجاية من أي جهاز تاني
    db.collection(COL).onSnapshot((s) => {
      s.docChanges().forEach((ch) => { if (ch.type === 'removed') delete C.remote[ch.doc.id]; else C.remote[ch.doc.id] = JSON.parse(JSON.stringify(ch.doc.data())); });
      if (s.metadata.hasPendingWrites) return;
      applyRemote();
    }, () => setStatus('الاتصال بالسحابة وقف — اعمل تحديث للصفحة', 'bad'));
    // تسجيل وجود العضو (المالك بيشوف الفريق من هنا)
    if (C.uid) { try { const m = C.db.collection('members').doc(C.uid); const s0 = await m.get(); if (!s0.exists || (s0.data() || {}).seen !== today()) await m.set({ seen: today() }); } catch (e) { /* لا شيء */ } }
    if (C.onChange) C.onChange();
  }
  async function resolveRole() {
    const u = C.user;
    if (!u) { C.role = 'owner'; return; }
    if (await u.isOwner()) { C.role = 'owner'; }
    else {
      try { const t = await C.db.collection('roles').doc('team').get(); C.team = (t.exists && t.data().members) || {}; } catch (e) { C.team = {}; }
      C.role = (C.uid && C.team[C.uid]) || 'orders';
      const w = await u.can('data.write');
      if (w === false) { C.role = 'viewer'; C.readOnly = true; }
    }
    applyRole();
  }
  function applyRole() {
    document.body.dataset.role = C.role;
    document.querySelectorAll('.nav a').forEach((a) => (a.hidden = !SYNC.canSeePage(C.role, a.getAttribute('href').slice(1)) || (a.getAttribute('href') === '#audit' && !['owner', 'manager'].includes(C.role))));
  }
  async function loadMembers() {
    if (!C.db) return [];
    const snap = await C.db.collection('members').get();
    const ids = snap.docs.map((d) => d.id).filter((id) => id !== C.uid);
    const t = await C.db.collection('roles').doc('team').get();
    C.team = (t.exists && t.data().members) || {};
    const ps = C.user && ids.length ? await C.user.profiles(ids) : {};
    C.members = ids.map((id) => ({ id, name: (ps[id] && ps[id].name) || 'عضو', avatar: ps[id] && ps[id].avatarUrl, seen: (snap.docs.find((d) => d.id === id).data() || {}).seen, role: C.team[id] || 'orders' }));
    return C.members;
  }
  async function setRole(id, role) {
    const team = { ...C.team, [id]: role };
    await C.db.collection('roles').doc('team').set({ members: team });
    C.team = team;
  }
  async function names(ids) { if (!C.user || !ids.length) return {}; const ps = await C.user.profiles(ids); return Object.fromEntries(Object.entries(ps).map(([k, v]) => [k, v.name || 'عضو'])); }

  function localMode() {
    C.mode = 'local';
    document.body.dataset.mode = 'local';
    lastLocal = SYNC.encode(F.DB.state);
    setStatus('', '');
    restoreFolder();
    if (C.onChange) C.onChange();
  }

  // ---------- النسخ الاحتياطي على الجهاز ----------
  const backupAgeDays = () => { const t = safeGet(LAST_BACKUP); return t ? Math.floor((Date.now() - Date.parse(t)) / 86400000) : null; };
  const markBackup = () => safeSet(LAST_BACKUP, new Date().toISOString());
  const folderSupported = () => 'showDirectoryPicker' in window && !F.inFrame;
  let dirHandle = null, folderReady = false, folderTimer = null;
  const idb = (fn) => new Promise((resolve) => {
    try {
      const req = indexedDB.open('florume', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => { const tx = req.result.transaction('kv', 'readwrite'); const r = fn(tx.objectStore('kv')); tx.oncomplete = () => resolve(r && r.result); tx.onerror = () => resolve(null); };
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
  async function restoreFolder() {
    if (!folderSupported()) return;
    const h = await idb((s) => s.get('backupDir'));
    if (!h) return;
    dirHandle = h;
    try { folderReady = (await h.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { folderReady = false; }
  }
  async function chooseFolder() {
    if (!folderSupported()) { F.UI.toast('المتصفح ده مش بيدعم النسخ لفولدر — استخدم Chrome أو Edge على الكمبيوتر', 'bad'); return false; }
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await idb((s) => s.put(dirHandle, 'backupDir'));
      folderReady = true;
      await writeFolderBackup();
      return true;
    } catch (e) { return false; }
  }
  async function reenableFolder() {
    if (!dirHandle) return chooseFolder();
    try { folderReady = (await dirHandle.requestPermission({ mode: 'readwrite' })) === 'granted'; if (folderReady) await writeFolderBackup(); } catch (e) { folderReady = false; }
    return folderReady;
  }
  async function writeFolderBackup() {
    if (!dirHandle || !folderReady || F.DB.state.demo) return;
    try {
      const f = await dirHandle.getFileHandle(`florume-backup-${today()}.json`, { create: true });
      const w = await f.createWritable();
      await w.write(JSON.stringify(F.DB.state));
      await w.close();
      markBackup();
    } catch (e) { folderReady = false; }
  }
  function scheduleFolderBackup() { if (!folderReady) return; clearTimeout(folderTimer); folderTimer = setTimeout(writeFolderBackup, 5000); }

  window.CLOUD = Object.assign(C, { connect, onSave, readAudit, loadMembers, setRole, names, applyRole, backupAgeDays, markBackup, folderSupported, chooseFolder, reenableFolder, folderState: () => ({ supported: folderSupported(), chosen: !!dirHandle, ready: folderReady, name: dirHandle ? dirHandle.name : '' }) });
})();
