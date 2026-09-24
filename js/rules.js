/*
 * قواعد صحة البيانات — Florume
 * دوال نقية تتحقق من المستند قبل حفظه: رصيد المخزون، تكرار رقم الفاتورة والبوليصة والأصناف،
 * الخصم، التواريخ، الفواتير المقفولة بتسوية، رصيد الخزائن، ونسب الشركاء.
 */
(function (root) {
  'use strict';
  const Acc = root.Acc || (typeof require !== 'undefined' ? require('./accounting.js') : null);
  const EPS = 0.005;
  const num = (n) => Number(n) || 0;
  const AR = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
  const cleanRef = (s) => String(s == null ? '' : s).replace(/[٠-٩]/g, (d) => AR[d]).replace(/[#\s]/g, '').toUpperCase();

  const sumItems = (items) => {
    const out = {};
    (items || []).forEach((it) => { if (it.productId) out[it.productId] = (out[it.productId] || 0) + num(it.qty); });
    return out;
  };
  // حالات تسحب من المخزون: قيد التجهيز (حجز) أو خرجت مع الشحن
  const CONSUMES = new Set(['pending', 'shipped', 'delivered']);

  // كميات في شحنات لسه ما وصلتش (مطلوبة أو في الطريق)
  function incomingQty(state) {
    const out = {};
    (state.shipments || []).forEach((sh) => {
      if (sh.status !== 'ordered' && sh.status !== 'transit') return;
      (sh.items || []).forEach((it) => (out[it.productId] = (out[it.productId] || 0) + num(it.qty)));
    });
    return out;
  }

  // 1) ممنوع البيع بأكتر من المتاح. قيد التجهيز مسموح كطلب مسبق لو الناقص جاي في شحنة في الطريق
  function checkSaleStock(state, journal, sale, before) {
    const res = { errors: [], preorder: false, preorderItems: [] };
    if (!CONSUMES.has(sale.status)) return res;
    const need = sumItems(sale.items);
    const back = before && CONSUMES.has(before.status) ? sumItems(before.items) : {};
    const inc = incomingQty(state);
    Object.entries(need).forEach(([pid, qty]) => {
      const available = num((journal.inventory.products[pid] || {}).available) + (back[pid] || 0);
      if (qty <= available + EPS) return;
      const short = qty - Math.max(available, 0);
      const incoming = inc[pid] || 0;
      // الناقص في طلب مسبق = الكمية الناقصة بعد خصم ما حجزته الطلبات المسبقة الأخرى من الشحنة
      if (sale.status === 'pending' && qty - available <= incoming + EPS) { res.preorder = true; res.preorderItems.push({ productId: pid, short }); return; }
      res.errors.push({ productId: pid, need: qty, available: Math.max(0, available), incoming });
    });
    return res;
  }
  // خصم من المخزون بدون بيع (تالف، ديكانت…): ممنوع أكتر من المتاح
  function checkStockOut(journal, productId, qty) {
    const available = num((journal.inventory.products[productId] || {}).available);
    return qty <= available + EPS ? null : { productId, need: qty, available: Math.max(0, available) };
  }

  // 2) أرقام الفواتير
  const maxInvoiceNo = (state) => (state.sales || []).reduce((m, s) => Math.max(m, num(s.no)), 0);
  const invoiceNoTaken = (state, no, saleId) => (state.sales || []).find((s) => s.id !== saleId && num(s.no) === num(no)) || null;
  // أول رقم متاح بدءًا من الرقم التالي في الإعدادات
  function nextFreeInvoiceNo(state) {
    const used = new Set((state.sales || []).map((s) => num(s.no)));
    let n = Math.max(1, num(state.settings.nextInvoiceNo));
    while (used.has(n)) n++;
    return n;
  }

  // 3) رقم البوليصة لا يتكرر على فاتورتين
  function trackingTaken(state, trackingNo, saleId) {
    const k = cleanRef(trackingNo);
    if (!k) return null;
    return (state.sales || []).find((s) => s.id !== saleId && cleanRef(s.trackingNo) === k) || null;
  }

  // 4) نفس المنتج في أكتر من سطر: يتجمع لو بنفس السعر، وإلا خطأ
  function mergeLines(items) {
    const map = new Map();
    const conflicts = [];
    let merged = false;
    (items || []).forEach((it) => {
      const cur = map.get(it.productId);
      if (!cur) { map.set(it.productId, { ...it }); return; }
      if (Math.abs(num(cur.price) - num(it.price)) > EPS) { if (!conflicts.includes(it.productId)) conflicts.push(it.productId); return; }
      cur.qty = num(cur.qty) + num(it.qty);
      merged = true;
    });
    return { items: [...map.values()], merged, conflicts };
  }

  // 6) الخصم لا يزيد عن قيمة الأصناف
  function discountError(sale) {
    const gross = (sale.items || []).reduce((a, it) => a + num(it.qty) * num(it.price), 0);
    return num(sale.discount) > gross + EPS ? { gross, discount: num(sale.discount) } : null;
  }

  // 7) التواريخ
  const beforeStart = (state, date) => !!(date && state.settings.startDate && date < state.settings.startDate);
  function saleDateError(sale) {
    if (sale.status === 'returned' && sale.returnDate && sale.returnDate < sale.date) return 'تاريخ المرتجع قبل تاريخ البيع';
    return null;
  }
  function shipmentDateError(sh) {
    if (sh.status === 'received' && sh.receivedDate && sh.receivedDate < sh.orderDate) return 'تاريخ الاستلام قبل تاريخ الطلب';
    if (sh.dueDate && sh.dueDate < sh.orderDate) return 'ميعاد السداد قبل تاريخ الطلب';
    const bad = (sh.costs || []).find((c) => c.date && c.date < sh.orderDate);
    if (bad) return `تاريخ دفع «${bad.label || 'مصروف'}» قبل تاريخ طلب الشحنة`;
    return null;
  }
  // أقدم تاريخ مستند (لا يصح نقل بداية الحسابات بعده)
  function earliestDocDate(state) {
    const dates = [];
    const add = (d) => d && dates.push(d);
    (state.sales || []).forEach((x) => add(x.date));
    (state.shipments || []).forEach((x) => { add(x.orderDate); (x.costs || []).forEach((c) => add(c.date)); });
    ['supplierPayments', 'expenses', 'transfers', 'settlements', 'equity', 'adjustments', 'decants', 'distributions'].forEach((k) => (state[k] || []).forEach((x) => add(x.date)));
    return dates.sort()[0] || '';
  }

  // 8) الفواتير الداخلة في تسوية كشف شركة شحن مقفولة ماليًا
  const isReconciled = (state, saleId) => (state.reconciliations || []).some((r) => (r.lines || []).some((l) => l.saleId === saleId));
  const LOCKED = { date: 'التاريخ', kind: 'نوع الفاتورة', status: 'الحالة', items: 'الأصناف والأسعار', discount: 'الخصم', shippingCharged: 'الشحن المحصل', payment: 'طريقة الدفع', courierId: 'شركة الشحن', courierFee: 'تكلفة الشحن', returnFee: 'مصاريف المرتجع', returnDate: 'تاريخ المرتجع', trackingNo: 'رقم البوليصة' };
  function lockedSaleChanges(state, before, after) {
    if (!before || !isReconciled(state, before.id)) return [];
    const norm = (k, v) => (k === 'items' ? JSON.stringify((v || []).map((it) => [it.productId, num(it.qty), num(it.price)])) : ['discount', 'shippingCharged', 'courierFee', 'returnFee'].includes(k) ? num(v) : k === 'kind' ? v || 'sale' : v || '');
    return Object.keys(LOCKED).filter((k) => norm(k, before[k]) !== norm(k, after[k])).map((k) => LOCKED[k]);
  }

  // 9) الخزائن اللي هتبقى بالسالب (أو هتزيد سالب) بعد الحفظ
  function negativeCash(before, after) {
    const b = Object.fromEntries(Acc.cashBalances(before, Acc.buildJournal(before)).map((a) => [a.id, a.balance]));
    return Acc.cashBalances(after, Acc.buildJournal(after))
      .filter((a) => a.balance < -EPS && a.balance < (b[a.id] ?? 0) - EPS)
      .map((a) => ({ id: a.id, name: a.name, before: b[a.id] ?? 0, after: a.balance }));
  }
  // نسخة من البيانات بعد إضافة/تعديل مستند (للفحص قبل الحفظ)
  function withDoc(state, list, obj) {
    const arr = [...(state[list] || [])];
    const i = arr.findIndex((x) => x.id === obj.id);
    if (i >= 0) arr[i] = obj; else arr.push(obj);
    return { ...state, [list]: arr };
  }

  // 10) نسب الشركاء
  function sharesTotal(partners, override) {
    const list = (partners || []).filter((p) => !override || p.id !== override.id);
    if (override) list.push(override);
    return Math.round(list.reduce((a, p) => a + num(p.share), 0) * 100) / 100;
  }

  const api = { cleanRef, incomingQty, checkSaleStock, checkStockOut, maxInvoiceNo, invoiceNoTaken, nextFreeInvoiceNo, trackingTaken, mergeLines, discountError, beforeStart, saleDateError, shipmentDateError, earliestDocDate, isReconciled, lockedSaleChanges, negativeCash, withDoc, sharesTotal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RULES = api;
})(typeof window !== 'undefined' ? window : globalThis);
