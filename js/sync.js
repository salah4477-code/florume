/*
 * المزامنة — Florume
 * الجزء النقي (مغطى بالاختبارات): تقسيم البيانات على مستندات سحابية صغيرة (حزمة لكل قائمة وشهر)،
 * وحساب الفرق بين نسختين سجل بسجل، وإعادة بناء البيانات من المستندات.
 * كل سجل بيتحفظ نص JSON تحت رقمه، فالتعديل بيكتب السجل ده بس (دمج) ومايمسحش تعديل حد تاني في نفس الحزمة.
 */
(function (root) {
  'use strict';
  // القوائم اللي ليها تاريخ بتتقسم بالشهر، والمبيعات كمان على 8 حزم في الشهر
  const DATED = { sales: 'date', expenses: 'date', settlements: 'date', transfers: 'date', equity: 'date', adjustments: 'date', decants: 'date', distributions: 'date', supplierPayments: 'date', commissionPayments: 'date', reconciliations: 'date', shipments: 'orderDate' };
  const SPLIT = { sales: 8, customers: 8, products: 4 }; // لحد ~2000 طلب في الشهر من غير ما مستند يعدّي 256KB
  const LISTS = ['accounts', 'couriers', 'suppliers', 'products', 'customers', 'shipments', 'supplierPayments', 'sales', 'settlements', 'expenses', 'transfers', 'equity', 'adjustments', 'campaigns', 'partners', 'distributions', 'decants', 'reconciliations', 'coupons', 'commissionPayments', 'recurring'];
  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const cleanSeg = (s) => String(s || 'x').replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 60) || 'x';

  function docIdFor(list, rec) {
    const field = DATED[list];
    const month = field && /^\d{4}-\d{2}/.test(rec[field] || '') ? rec[field].slice(0, 7) : field ? 'nodate' : 'all';
    return `${list}.${month}.${hash(rec.id) % (SPLIT[list] || 1)}`;
  }

  // البيانات ← مستندات: {docId: {list, items: {recordId: json}}} + مستند الإعدادات
  function encode(state) {
    const docs = { meta: { kind: 'meta', settings: JSON.stringify(state.settings || {}), version: state.version || 1 } };
    LISTS.forEach((list) => (state[list] || []).forEach((rec, o) => {
      if (!rec || !rec.id) return;
      const id = docIdFor(list, rec);
      const d = (docs[id] = docs[id] || { kind: 'list', list, items: {} });
      d.items[cleanSeg(rec.id)] = JSON.stringify({ r: rec, o });
    }));
    return docs;
  }

  // الفرق سجل بسجل: كل مستند فيه إيه اتضاف/اتعدل (نص) وإيه اتمسح (null)
  function diff(prev, next) {
    const out = [];
    const ids = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
    ids.forEach((docId) => {
      const a = (prev || {})[docId], b = (next || {})[docId];
      if (docId === 'meta') { if (!a || !b || a.settings !== b.settings) out.push({ docId, meta: b }); return; }
      const changes = {};
      const ai = (a && a.items) || {}, bi = (b && b.items) || {};
      Object.keys(bi).forEach((k) => { if (ai[k] !== bi[k]) changes[k] = bi[k]; });
      Object.keys(ai).forEach((k) => { if (!(k in bi) && ai[k] != null) changes[k] = null; });
      if (Object.keys(changes).length) out.push({ docId, list: (b || a).list, changes, exists: !!a });
    });
    return out;
  }

  // المستندات ← البيانات (بترتيب الحفظ، والسجلات الممسوحة null بتتخطى)
  function decode(docs, base) {
    const out = { ...(base || {}) };
    const meta = docs.meta;
    if (meta && meta.settings) { try { out.settings = JSON.parse(meta.settings); } catch (e) { /* يفضل الموجود */ } }
    LISTS.forEach((list) => (out[list] = []));
    const tmp = {};
    Object.entries(docs).forEach(([id, d]) => {
      if (!d || d.kind !== 'list' || !LISTS.includes(d.list)) return;
      Object.values(d.items || {}).forEach((v) => {
        if (v == null) return;
        try { const x = JSON.parse(v); (tmp[d.list] = tmp[d.list] || []).push(x); } catch (e) { /* سجل تالف */ }
      });
    });
    Object.entries(tmp).forEach(([list, arr]) => (out[list] = arr.sort((a, b) => (a.o ?? 0) - (b.o ?? 0)).map((x) => x.r)));
    out.demo = false;
    return out;
  }

  // وصف تعديل لسجل التعديلات
  const LIST_LABEL = { sales: 'فاتورة', expenses: 'مصروف', products: 'منتج', customers: 'عميل', shipments: 'شحنة', supplierPayments: 'دفعة مورد', settlements: 'تحصيل شحن', transfers: 'تحويل', equity: 'رأس مال/مسحوبات', adjustments: 'تسوية مخزون', decants: 'تقسيم/بوكس', distributions: 'توزيع أرباح', reconciliations: 'تسوية شركة شحن', coupons: 'كود خصم', commissionPayments: 'سداد عمولة', recurring: 'مصروف ثابت', accounts: 'حساب', couriers: 'شركة شحن', suppliers: 'مورد', campaigns: 'حملة', partners: 'شريك' };
  function describe(list, rec, prefix) {
    if (!rec) return LIST_LABEL[list] || list;
    const name = list === 'sales' ? `${prefix || ''}${rec.no || ''}` : rec.name || rec.code || rec.ref || rec.notes || rec.date || '';
    return `${LIST_LABEL[list] || list} ${name}`.trim();
  }
  function changesForLog(prev, next, prefix) {
    const log = [];
    diff(prev, next).forEach((d) => {
      if (d.meta) { log.push({ list: 'settings', id: 'settings', action: 'edit', label: 'الإعدادات' }); return; }
      Object.entries(d.changes).forEach(([k, v]) => {
        const before = prev && prev[d.docId] && prev[d.docId].items && prev[d.docId].items[k];
        const recB = v ? JSON.parse(v).r : null, recA = before ? JSON.parse(before).r : null;
        log.push({ list: d.list, id: k, action: !recA ? 'add' : !recB ? 'delete' : 'edit', label: describe(d.list, recB || recA, prefix) });
      });
    });
    return log;
  }

  // الأدوار: المالك كل حاجة، المدير كل حاجة ماعدا الفريق، مسؤول الطلبات من غير تكاليف وأرباح، والعرض بس
  const ROLES = { owner: 'المالك', manager: 'مدير', orders: 'مسؤول طلبات', viewer: 'عرض بس' };
  const PAGES_BY_ROLE = {
    orders: ['sales', 'customers', 'products', 'alerts', 'reconcile'],
    viewer: null, manager: null, owner: null,
  };
  const canSeePage = (role, page) => !PAGES_BY_ROLE[role] || PAGES_BY_ROLE[role].includes(page);
  const canWrite = (role) => role !== 'viewer';
  const seesCosts = (role) => role !== 'orders';

  const api = { DATED, LISTS, hash, docIdFor, encode, diff, decode, describe, changesForLog, ROLES, canSeePage, canWrite, seesCosts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SYNC = api;
})(typeof window !== 'undefined' ? window : globalThis);
