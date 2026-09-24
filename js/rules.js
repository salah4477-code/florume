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

  // =====================================================================
  // فحص سلامة البيانات: يراجع كل البيانات المسجلة على نفس القواعد ويرجع المشاكل بدون ما يغيّر حاجة
  // =====================================================================
  const dmy = (d) => (d ? String(d).split('-').reverse().join('/') : '—');
  function audit(state, journal) {
    const prefix = (state.settings || {}).invoicePrefix || '';
    const inv = (x) => `${prefix}${x && x.no != null ? x.no : ''}`;
    const products = state.products || [];
    const pname = (id) => { const p = products.find((x) => x.id === id); return p ? `${p.brand ? p.brand + ' — ' : ''}${p.name}${p.sizeMl ? ' ' + p.sizeMl + 'مل' : ''}` : 'منتج محذوف'; };
    const saleAct = (x) => ({ action: 'viewSale', id: x.id });
    const checks = [];
    const check = (id, label, fn) => { const issues = []; fn((text, level = 'error', act = {}) => issues.push({ text, level, ...act })); checks.push({ id, label, issues, ok: !issues.some((i) => i.level === 'error') }); };
    const sales = state.sales || [];

    check('books', 'توازن الدفاتر', (add) => {
      const tb = Acc.trialBalance(state, journal);
      if (!tb.balanced) add(`ميزان المراجعة مش متزن: المدين ${tb.totals.dr} والدائن ${tb.totals.cr}`);
      const bs = Acc.balanceSheet(state, journal, '9999-12-31');
      if (!bs.balanced) add(`الميزانية مش متزنة: الأصول ${bs.totalAssets} والخصوم وحقوق الملكية ${Acc.round2(bs.totalLiabilities + bs.totalEquity)}`);
      const book = Acc.ledger(state, journal, '1300').closing;
      const calc = Acc.round2(Object.values(journal.inventory.products).reduce((a, p) => a + p.value, 0));
      if (Math.abs(book - calc) > 1) add(`قيمة المخزون في الدفاتر ${book} مختلفة عن قيمته المحسوبة من الأصناف ${calc}`);
    });

    // لكل منتج: أول مستند كسر الرصيد (السبب)، وعدد المستندات اللي بعده اتأثرت بيه
    check('stock', 'البيع والصرف في حدود الرصيد', (add) => {
      const byProduct = new Map();
      journal.inventory.warnings.forEach((w) => {
        const g = byProduct.get(w.productId) || { first: w, docs: new Set() };
        g.docs.add(w.src.id);
        byProduct.set(w.productId, g);
      });
      byProduct.forEach(({ first: w, docs }, productId) => {
        const x = w.src.type === 'sale' ? sales.find((y) => y.id === w.src.id) : null;
        const doc = x ? `${Acc.isPromo(x) ? 'فاتورة الدعاية' : 'الفاتورة'} ${inv(x)}` : w.src.type === 'decant' ? 'عملية تقسيم / فك بوكس' : `تسوية مخزون (${Acc.ADJ_REASONS[((state.adjustments || []).find((a) => a.id === w.src.id) || {}).reason] || ''})`;
        const more = docs.size - 1;
        add(`«${pname(productId)}»: ${doc} يوم ${dmy(w.date)} صرفت أكتر من الرصيد اللي كان موجود${more ? ` — ومن بعدها ${more} مستند كمان على نفس المنتج طالع بالسالب بسببها` : ''}. راجع كارت الصنف`, 'error', x ? saleAct(x) : { action: 'productMoves', id: productId });
      });
    });

    check('invoiceNo', 'أرقام الفواتير مش متكررة', (add) => {
      const by = {};
      sales.forEach((x) => (by[x.no] = by[x.no] || []).push(x));
      Object.entries(by).forEach(([no, list]) => { if (list.length > 1) add(`رقم ${prefix}${no} مستخدم في ${list.length} فواتير (${list.map((x) => dmy(x.date)).join('، ')})`, 'error', saleAct(list[1])); });
      const max = maxInvoiceNo(state);
      if (num((state.settings || {}).nextInvoiceNo) <= max) add(`«رقم الفاتورة التالية» في الإعدادات (${state.settings.nextInvoiceNo}) مش أكبر من آخر رقم مستخدم (${max})`, 'error', { action: 'goto', id: 'settings' });
    });

    check('tracking', 'أرقام البوالص مش متكررة', (add) => {
      const by = {};
      sales.forEach((x) => { const k = cleanRef(x.trackingNo); if (k) (by[k] = by[k] || []).push(x); });
      Object.entries(by).forEach(([k, list]) => { if (list.length > 1) add(`البوليصة ${k} متسجلة على ${list.map(inv).join(' و')}`, 'error', saleAct(list[1])); });
    });

    check('lines', 'مفيش منتج متكرر في نفس الفاتورة', (add) => {
      sales.forEach((x) => {
        const seen = new Set();
        (x.items || []).forEach((it) => { if (seen.has(it.productId)) add(`«${pname(it.productId)}» متكرر في أكتر من سطر في الفاتورة ${inv(x)}`, 'error', saleAct(x)); seen.add(it.productId); });
      });
    });

    check('numbers', 'مفيش أرقام سالبة أو صفر في مكان غلط', (add) => {
      sales.forEach((x) => {
        if ((x.items || []).some((it) => num(it.qty) <= 0 || num(it.price) < 0)) add(`الفاتورة ${inv(x)} فيها كمية صفر أو سعر سالب`, 'error', saleAct(x));
        ['discount', 'shippingCharged', 'courierFee', 'returnFee'].forEach((k) => { if (num(x[k]) < 0) add(`الفاتورة ${inv(x)} فيها قيمة سالبة (${{ discount: 'الخصم', shippingCharged: 'الشحن المحصل', courierFee: 'تكلفة الشحن', returnFee: 'مصاريف المرتجع' }[k]})`, 'error', saleAct(x)); });
      });
      (state.expenses || []).forEach((e) => { if (!(num(e.amount) > 0)) add(`مصروف يوم ${dmy(e.date)} مبلغه ${num(e.amount)}`, 'error', { action: 'editExpense', id: e.id }); });
      (state.transfers || []).forEach((t) => { if (!(num(t.amount) > 0) || num(t.fee) < 0) add(`تحويل يوم ${dmy(t.date)} مبلغه أو عمولته غلط`, 'error', { action: 'editDoc', id: `transfers:${t.id}` }); });
      (state.supplierPayments || []).forEach((p) => { if (!(num(p.amount) > 0) || !(num(p.rate) > 0) || num(p.fee) < 0) add(`دفعة مورد يوم ${dmy(p.date)} مبلغها أو سعر صرفها أو عمولتها غلط`, 'error', { action: 'editPayment', id: p.id }); });
      (state.equity || []).forEach((e) => { if (!(num(e.amount) > 0)) add(`${e.type === 'drawing' ? 'مسحوبات' : 'رأس مال'} يوم ${dmy(e.date)} مبلغها ${num(e.amount)}`, 'error', { action: 'editDoc', id: `equity:${e.id}` }); });
      (state.settlements || []).forEach((t) => { if (!num(t.amount)) add(`تحصيل من شركة شحن يوم ${dmy(t.date)} مبلغه صفر`, 'note', { action: 'editDoc', id: `settlements:${t.id}` }); });
      (state.shipments || []).forEach((sh) => {
        if (!(num(sh.rate) > 0)) add(`الشحنة ${sh.ref || ''} سعر صرفها صفر`, 'error', { action: 'editShipment', id: sh.id });
        if ((sh.items || []).some((it) => num(it.qty) <= 0 || num(it.unitCost) < 0) || (sh.costs || []).some((c) => num(c.amount) < 0)) add(`الشحنة ${sh.ref || ''} فيها كمية أو سعر أو مصروف سالب`, 'error', { action: 'editShipment', id: sh.id });
      });
      products.forEach((p) => { if (num(p.price) < 0) add(`«${pname(p.id)}» سعر بيعه سالب`, 'error', { action: 'editProduct', id: p.id }); });
    });

    check('discount', 'الخصم مش أكبر من قيمة الفاتورة', (add) => {
      sales.forEach((x) => { const e = discountError(x); if (e) add(`الفاتورة ${inv(x)} خصمها ${e.discount} وقيمة أصنافها ${Acc.round2(e.gross)}`, 'error', saleAct(x)); });
    });

    check('dates', 'التواريخ منطقية', (add) => {
      const start = (state.settings || {}).startDate;
      const first = earliestDocDate(state);
      if (start && first && first < start) add(`فيه مستندات قبل تاريخ بداية الحسابات ${dmy(start)} (أقدمها ${dmy(first)}) — الأرصدة الافتتاحية متسجلة بعدها`, 'error', { action: 'goto', id: 'settings' });
      sales.forEach((x) => { const e = saleDateError(x); if (e) add(`الفاتورة ${inv(x)}: ${e}`, 'error', saleAct(x)); });
      (state.shipments || []).forEach((sh) => { const e = shipmentDateError(sh); if (e) add(`الشحنة ${sh.ref || ''}: ${e}`, 'error', { action: 'editShipment', id: sh.id }); });
    });

    // فترات كان فيها رصيد الحساب بالسالب
    check('cash', 'الخزائن والبنوك ما نزلتش تحت الصفر', (add) => {
      const accounts = state.accounts || [];
      const days = {};
      journal.entries.forEach((e) => e.lines.forEach((l) => {
        const [base, id] = String(l.acc).split(':');
        if (base !== '1100' || !id) return;
        (days[id] = days[id] || {})[e.date] = (days[id][e.date] || 0) + l.dr - l.cr;
      }));
      accounts.forEach((a) => {
        let bal = 0, from = null, low = 0, shown = 0;
        const dates = Object.keys(days[a.id] || {}).sort();
        const flush = (to) => { if (from && shown < 3) add(`«${a.name}» كان رصيده بالسالب من ${dmy(from)}${to ? ' لحد ' + dmy(to) : ' ولسه'} (أقل رصيد ${Acc.round2(low)})`, 'error', { action: 'goTreasury', id: a.id }); shown++; from = null; low = 0; };
        dates.forEach((d) => {
          bal += days[a.id][d];
          if (bal < -EPS) { if (!from) from = d; low = Math.min(low, bal); } else if (from) flush(d);
        });
        if (from) flush(null);
      });
    });

    check('partners', 'نسب الشركاء', (add) => {
      if (!(state.partners || []).length) return;
      const t = sharesTotal(state.partners);
      if (Math.abs(t - 100) > 0.001) add(`مجموع نسب الشركاء ${t}٪ مش 100٪`, 'error', { action: 'goto', id: 'partners' });
    });

    check('links', 'المستندات مربوطة ببيانات موجودة', (add) => {
      const has = (list, id) => (state[list] || []).some((x) => x.id === id);
      sales.forEach((x) => {
        if ((x.items || []).some((it) => !products.some((p) => p.id === it.productId))) add(`الفاتورة ${inv(x)} فيها منتج محذوف`, 'error', saleAct(x));
        if (!Acc.isPromo(x) && x.payment === 'cod' && Acc.BOOKED.has(x.status) && !has('couriers', x.courierId)) add(`الفاتورة ${inv(x)} دفع عند الاستلام ومن غير شركة شحن — التحصيل مش هيتحسب على حد`, 'error', saleAct(x));
        if (x.payment && x.payment !== 'cod' && !has('accounts', x.payment)) add(`الفاتورة ${inv(x)} مدفوعة على حساب محذوف`, 'error', saleAct(x));
      });
      (state.reconciliations || []).forEach((r) => { const miss = (r.lines || []).filter((l) => !sales.some((x) => x.id === l.saleId)).length; if (miss) add(`تسوية ${dmy(r.date)} فيها ${miss} فاتورة اتحذفت`, 'note', { action: 'goto', id: 'reconcile' }); });
    });

    check('notes', 'بيانات ناقصة (ملاحظات)', (add) => {
      const shipped = new Set((state.shipments || []).flatMap((sh) => (sh.items || []).map((it) => it.productId)));
      products.forEach((p) => { if (shipped.has(p.id) && !Acc.unitWeight(p, products)) add(`«${pname(p.id)}» ملوش وزن ولا حجم — توزيع الشحن بالحجم مش هيبقى دقيق`, 'note', { action: 'editProduct', id: p.id }); });
      const noPhone = (state.customers || []).filter((c) => !String(c.phone || '').replace(/\D/g, ''));
      if (noPhone.length) add(`${noPhone.length} عميل من غير رقم موبايل (مش هيوصلهم واتساب): ${noPhone.slice(0, 5).map((c) => c.name).join('، ')}${noPhone.length > 5 ? '…' : ''}`, 'note', { action: 'goto', id: 'customers' });
      const noTrack = sales.filter((x) => !Acc.isPromo(x) && x.payment === 'cod' && Acc.BOOKED.has(x.status) && !cleanRef(x.trackingNo) && !isReconciled(state, x.id));
      if (noTrack.length) add(`${noTrack.length} طلب عند الاستلام من غير رقم بوليصة ولسه ما اتسوّاش — المطابقة هتعتمد على رقم الفاتورة بس`, 'note', noTrack[0] ? saleAct(noTrack[0]) : {});
    });

    const errors = checks.reduce((a, c) => a + c.issues.filter((i) => i.level === 'error').length, 0);
    const notes = checks.reduce((a, c) => a + c.issues.filter((i) => i.level === 'note').length, 0);
    return { checks, errors, notes, passed: checks.filter((c) => c.ok).length };
  }

  const api = { audit, cleanRef, incomingQty, checkSaleStock, checkStockOut, maxInvoiceNo, invoiceNoTaken, nextFreeInvoiceNo, trackingTaken, mergeLines, discountError, beforeStart, saleDateError, shipmentDateError, earliestDocDate, isReconciled, lockedSaleChanges, negativeCash, withDoc, sharesTotal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RULES = api;
})(typeof window !== 'undefined' ? window : globalThis);
