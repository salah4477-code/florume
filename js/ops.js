/*
 * أدوات التشغيل — Florume
 * دوال نقية (بدون واجهة): تسوية كشف حساب شركة الشحن مع الطلبات، التنبيهات اليومية،
 * رابط إرسال الفاتورة على واتساب، وترميز الباركود Code 128.
 */
(function (root) {
  'use strict';
  const Acc = root.Acc || (typeof require !== 'undefined' ? require('./accounting.js') : null);
  const IMP = root.IMP || (typeof require !== 'undefined' ? require('./importer.js') : null);
  const num = (n) => Number(n) || 0;
  const round2 = (n) => Math.round(num(n) * 100) / 100;
  const str = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const cleanRef = (s) => IMP.latinDigits(str(s)).replace(/[#\s]/g, '').toUpperCase();
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

  // =====================================================================
  // تسوية كشف حساب شركة الشحن
  // =====================================================================
  const STATEMENT_FIELDS = {
    ref: ['trackingno', 'tracking', 'awb', 'رقمالبوليصه', 'البوليصه', 'رقمالشحنه', 'orderno', 'order', 'reference', 'ref', 'رقمالطلب', 'رقمالفاتوره', 'الفاتوره', 'المرجع', 'businessreference'],
    cod: ['cod', 'codamount', 'collected', 'collectedamount', 'المحصل', 'المبلغالمحصل', 'التحصيل', 'قيمهالتحصيل', 'مبلغالتحصيل', 'المبلغ'],
    fee: ['fees', 'fee', 'shippingfee', 'shippingfees', 'deliveryfee', 'مصاريفالشحن', 'تكلفهالشحن', 'الرسوم', 'رسومالشحن', 'مصاريف'],
    status: ['status', 'state', 'الحاله', 'حالهالشحنه'],
    date: ['date', 'deliverydate', 'التاريخ', 'تاريخالتسليم'],
  };
  function mapStatementHeader(cells) {
    const keys = cells.map(IMP.normKey);
    const map = {};
    Object.entries(STATEMENT_FIELDS).forEach(([field, aliases]) => {
      // نفضّل ترتيب الأسماء المعرّفة: رقم البوليصة قبل رقم الطلب
      for (const alias of aliases) {
        const i = keys.findIndex((k, idx) => k === alias && !Object.values(map).includes(idx));
        if (i >= 0) { map[field] = i; break; }
      }
    });
    return map;
  }
  // يقرأ أوراق الملف ويرجع سطور الكشف: رقم البوليصة/الطلب، المحصل، المصاريف، الحالة
  function parseStatement(sheets) {
    for (const sh of sheets) {
      const rows = sh.rows || [];
      for (let h = 0; h < Math.min(rows.length, 10); h++) {
        const map = mapStatementHeader(rows[h] || []);
        if (map.ref == null || (map.cod == null && map.fee == null)) continue;
        const out = [];
        rows.slice(h + 1).forEach((cells, i) => {
          const ref = cleanRef(cells[map.ref]);
          if (!ref) return;
          const cod = map.cod != null ? IMP.toNumber(cells[map.cod]) : 0;
          const fee = map.fee != null ? IMP.toNumber(cells[map.fee]) : 0;
          const date = map.date != null ? IMP.toDate(cells[map.date]) : '';
          out.push({ row: h + i + 2, ref, cod: round2(Math.abs(num(cod))), fee: round2(Math.abs(num(fee))), status: map.status != null ? str(cells[map.status]) : '', date: date === 'invalid' ? '' : date });
        });
        return { sheet: sh.name, columns: Object.keys(map), rows: out };
      }
    }
    return null;
  }
  const statusFromText = (t) => (/مرتجع|رجع|رفض|return|reject|refus|cancel/i.test(t) ? 'returned' : /تسليم|تم التوصيل|سلم|deliver|complete|success/i.test(t) ? 'delivered' : '');

  // الطلبات اللي اتحسبت في تسوية سابقة
  function reconciledSales(state) {
    const set = new Map();
    (state.reconciliations || []).forEach((r) => (r.lines || []).forEach((l) => l.saleId && set.set(l.saleId, r)));
    return set;
  }
  // ما تتوقعه من شركة الشحن لكل طلب
  function expectedFor(sale) {
    const t = Acc.saleTotals(sale);
    const returned = sale.status === 'returned';
    const cod = sale.payment === 'cod' && !returned ? t.total : 0;
    const fee = round2(num(sale.courierFee) + (returned ? num(sale.returnFee) : 0));
    return { cod: round2(cod), fee, net: round2(cod - fee) };
  }

  function reconcile(state, courierId, rows, invoicePrefix) {
    const prefix = cleanRef(invoicePrefix || '');
    const index = new Map();
    const done = reconciledSales(state);
    (state.sales || []).forEach((sale) => {
      if (courierId && sale.courierId !== courierId) return;
      if (sale.trackingNo) index.set(cleanRef(sale.trackingNo), sale);
      if (sale.no != null) { index.set(`${prefix}${sale.no}`, sale); if (!index.has(String(sale.no))) index.set(String(sale.no), sale); }
    });
    const seen = new Set();
    const matched = [], unmatched = [], duplicates = [];
    rows.forEach((r) => {
      const sale = index.get(r.ref) || (prefix && r.ref.startsWith(prefix) ? index.get(r.ref.slice(prefix.length)) : null);
      if (!sale) { unmatched.push(r); return; }
      if (seen.has(sale.id)) { duplicates.push({ ...r, saleId: sale.id }); return; }
      seen.add(sale.id);
      const statementStatus = statusFromText(r.status);
      const exp = expectedFor(statementStatus === 'returned' ? { ...sale, status: 'returned' } : sale);
      const issues = [];
      const codDiff = round2(r.cod - exp.cod), feeDiff = round2(r.fee - exp.fee);
      if (Math.abs(codDiff) > 0.5) issues.push(codDiff < 0 ? 'محصل أقل من قيمة الطلب' : 'محصل أكتر من قيمة الطلب');
      if (Math.abs(feeDiff) > 0.5) issues.push(feeDiff > 0 ? 'مصاريف شحن أعلى من المسجلة' : 'مصاريف شحن أقل من المسجلة');
      if (statementStatus && statementStatus !== sale.status) issues.push(`الحالة في الكشف «${r.status}» والنظام «${sale.status}»`);
      if (!Acc.BOOKED.has(sale.status)) issues.push('الطلب لسه ما خرجش في النظام');
      if (done.has(sale.id)) issues.push('اتسوّى قبل كده في كشف سابق');
      matched.push({ ...r, saleId: sale.id, statementStatus, expected: exp, codDiff, feeDiff, issues, alreadyReconciled: done.has(sale.id) });
    });
    const maxDate = rows.reduce((m, r) => (r.date > m ? r.date : m), '');
    // طلبات اتسلمت أو رجعت (دفع عند الاستلام) ومش موجودة في الكشف ولا في كشف سابق
    const missing = (state.sales || []).filter((s) => (!courierId || s.courierId === courierId) && !Acc.isPromo(s) && s.payment === 'cod'
      && (s.status === 'delivered' || s.status === 'returned') && !seen.has(s.id) && !done.has(s.id) && (!maxDate || s.date <= maxDate))
      .map((s) => ({ saleId: s.id, date: s.date, expected: expectedFor(s) }));
    const sum = (list, f) => round2(list.reduce((a, x) => a + f(x), 0));
    const fresh = matched.filter((m) => !m.alreadyReconciled);
    const totals = {
      statementCod: sum(rows, (r) => r.cod), statementFee: sum(rows, (r) => r.fee), statementNet: sum(rows, (r) => r.cod - r.fee),
      expectedNet: sum(fresh, (m) => m.expected.net), matchedNet: sum(fresh, (m) => m.cod - m.fee),
      codDiff: sum(fresh, (m) => m.codDiff), feeDiff: sum(fresh, (m) => m.feeDiff),
      missingNet: sum(missing, (m) => m.expected.net), unmatchedNet: sum(unmatched, (r) => r.cod - r.fee),
      issues: matched.filter((m) => m.issues.length).length,
    };
    return { matched, unmatched, duplicates, missing, totals, maxDate };
  }

  // طلبات الدفع عند الاستلام اللي اتسلمت ولسه ما دخلتش في أي تسوية، لكل شركة شحن
  function unsettledByCourier(state, asOf) {
    const done = reconciledSales(state);
    const out = {};
    (state.sales || []).forEach((s) => {
      if (Acc.isPromo(s) || s.payment !== 'cod' || (s.status !== 'delivered' && s.status !== 'returned') || done.has(s.id)) return;
      const r = (out[s.courierId || ''] = out[s.courierId || ''] || { courierId: s.courierId || '', count: 0, net: 0, oldest: '', sales: [] });
      r.count += 1; r.net = round2(r.net + expectedFor(s).net); r.sales.push(s.id);
      if (!r.oldest || s.date < r.oldest) r.oldest = s.date;
    });
    Object.values(out).forEach((r) => (r.days = r.oldest && asOf ? daysBetween(r.oldest, asOf) : 0));
    return out;
  }

  // =====================================================================
  // التنبيهات
  // =====================================================================
  // المتبقي على كل شحنة بعملة المورد
  function shipmentOutstanding(state, journal) {
    const out = {};
    const bySup = {};
    (state.shipments || []).filter((sh) => sh.status !== 'cancelled').forEach((sh) => (bySup[sh.supplierId] = bySup[sh.supplierId] || []).push(sh));
    Object.entries(bySup).forEach(([supId, list]) => {
      let owed = Math.max(0, num((journal.suppliers.balances[supId] || {}).foreign));
      list.sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1)).forEach((sh) => {
        const goods = Acc.shipmentCosting(sh).goodsForeign;
        out[sh.id] = round2(Math.min(goods, owed));
        owed -= out[sh.id];
      });
    });
    return out;
  }

  const ALERT_DEFAULTS = { pendingDays: 2, shippedDays: 7, settleDays: 14, dueDays: 7, stagnantDays: 60 };
  function alerts(state, journal, today, cfg) {
    const c = { ...ALERT_DEFAULTS, ...(cfg || {}) };
    const list = [];
    const push = (a) => list.push(a);
    const productName = (id) => { const p = (state.products || []).find((x) => x.id === id); return p ? `${p.brand ? p.brand + ' ' : ''}${p.name}${p.sizeMl ? ' ' + p.sizeMl + 'مل' : ''}` : '—'; };
    const courierName = (id) => ((state.couriers || []).find((x) => x.id === id) || {}).name || 'بدون شركة شحن';
    const inv = (state.settings || {}).invoicePrefix || '';

    (state.sales || []).forEach((s) => {
      const age = daysBetween(s.date, today);
      if (s.status === 'pending' && age >= c.pendingDays) push({ type: 'pending', level: age >= c.pendingDays * 2 ? 'bad' : 'warn', days: age, title: `طلب ${inv}${s.no || ''} قيد التجهيز من ${age} يوم`, detail: 'لسه ما اتسلمش لشركة الشحن', action: 'viewSale', id: s.id });
      if (s.status === 'shipped' && age >= c.shippedDays) push({ type: 'shipped', level: age >= c.shippedDays * 2 ? 'bad' : 'warn', days: age, title: `طلب ${inv}${s.no || ''} مع ${courierName(s.courierId)} من ${age} يوم`, detail: 'ما اتسلمش ولا رجع — تابع مع شركة الشحن', action: 'viewSale', id: s.id });
    });

    Object.values(unsettledByCourier(state, today)).forEach((u) => {
      if (u.days < c.settleDays) return;
      push({ type: 'settle', level: u.days >= c.settleDays * 2 ? 'bad' : 'warn', days: u.days, title: `${u.count} طلب اتسلم مع ${courierName(u.courierId)} وفلوسه لسه ما اتسوتش`, detail: `صافي متوقع ${Math.round(u.net).toLocaleString('en-US')} ج.م — أقدم طلب من ${u.days} يوم`, action: 'goReconcile', id: u.courierId });
    });

    // مستحقات الموردين: الدفعات تسدد أقدم الشحنات أولًا، فالرصيد المتبقي يخص أحدث الشحنات
    Object.entries(shipmentOutstanding(state, journal)).forEach(([id, owed]) => {
      const sh = (state.shipments || []).find((x) => x.id === id);
      if (!sh.dueDate || owed <= 0.005) return;
      const left = daysBetween(today, sh.dueDate);
      if (left > c.dueDays) return;
      const sup = ((state.suppliers || []).find((x) => x.id === sh.supplierId) || {});
      push({ type: 'due', level: left < 0 ? 'bad' : 'warn', days: -left, title: left < 0 ? `ميعاد سداد شحنة ${sh.ref || ''} فات من ${-left} يوم` : left === 0 ? `ميعاد سداد شحنة ${sh.ref || ''} النهارده` : `ميعاد سداد شحنة ${sh.ref || ''} بعد ${left} يوم`, detail: `${sup.name || ''} — المتبقي عليها ${round2(owed).toLocaleString('en-US')} ${sup.currency || ''}`, action: 'supplierStatement', id: sh.supplierId });
    });

    // منتجات راكدة: عليها رصيد وما اتباعتش من مدة
    const lastSale = {}, firstIn = {};
    journal.inventory.movements.forEach((m) => {
      if (m.kind === 'sale') lastSale[m.productId] = m.date;
      if ((m.kind === 'in' || m.kind === 'decantIn') && !firstIn[m.productId]) firstIn[m.productId] = m.date;
    });
    (state.products || []).forEach((p) => {
      const st = journal.inventory.products[p.id];
      if (!st || st.qty <= 0) return;
      const since = lastSale[p.id] || firstIn[p.id];
      if (!since) return;
      const age = daysBetween(since, today);
      if (age < c.stagnantDays) return;
      push({ type: 'stagnant', level: 'info', days: age, title: `${productName(p.id)} راكد من ${age} يوم`, detail: `${lastSale[p.id] ? 'آخر بيع' : 'دخل المخزن'} ${since} — الرصيد ${st.qty} قطعة بقيمة ${Math.round(st.value).toLocaleString('en-US')} ج.م`, action: 'productMoves', id: p.id });
    });

    (state.products || []).forEach((p) => {
      const st = journal.inventory.products[p.id];
      if (!st) return;
      const min = num(p.minStock != null && p.minStock !== '' ? p.minStock : (state.settings || {}).lowStock);
      if (st.available <= min && (st.qty > 0 || firstIn[p.id])) push({ type: 'low', level: st.available <= 0 ? 'bad' : 'warn', days: 0, title: `${productName(p.id)}: ${st.available <= 0 ? 'نفد' : 'متاح ' + st.available + ' بس'}`, detail: `حد إعادة الطلب ${min}`, action: 'productMoves', id: p.id });
    });

    const shown = new Set();
    journal.inventory.warnings.forEach((w) => {
      if (shown.has(w.productId)) return;
      shown.add(w.productId);
      push({ type: 'negative', level: 'bad', days: 0, title: `رصيد ${productName(w.productId)} ما كانش يكفي يوم ${w.date}`, detail: 'فيه بيع أو تسوية أكتر من الرصيد — راجع كارت الصنف أو سجّل الوارد', action: 'productMoves', id: w.productId });
    });

    const rank = { bad: 0, warn: 1, info: 2 };
    return list.sort((a, b) => rank[a.level] - rank[b.level] || b.days - a.days);
  }

  // =====================================================================
  // واتساب
  // =====================================================================
  // رقم مصري أو دولي → صيغة wa.me (أرقام فقط بكود الدولة)
  function waPhone(phone) {
    let d = IMP.latinDigits(str(phone)).replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('01')) d = '2' + d; // 01xxxxxxxxx → 201xxxxxxxxx
    else if (d.length === 10 && d.startsWith('1')) d = '20' + d;
    return d.length >= 10 ? d : '';
  }
  const waLink = (phone, text) => `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;

  // =====================================================================
  // باركود Code 128 (مجموعة B: حروف وأرقام لاتينية)
  // =====================================================================
  const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
  const validBarcode = (text) => /^[\x20-\x7e]{1,40}$/.test(String(text || ''));
  // يرجع عرض الخطوط والمسافات بالتبادل (خط، مسافة، خط، …)
  function code128(text) {
    if (!validBarcode(text)) throw new Error('الباركود لازم يكون حروف وأرقام إنجليزي بس');
    const codes = [104, ...[...text].map((ch) => ch.charCodeAt(0) - 32)];
    const check = codes.reduce((s, c, i) => s + c * (i || 1), 0) % 103;
    return [...codes, check, 106].map((c) => C128[c]).join('').split('').map(Number);
  }
  function barcodeSvg(text, { height = 46, module = 1.6, quiet = 10 } = {}) {
    const widths = code128(text);
    const total = widths.reduce((a, b) => a + b, 0) + quiet * 2;
    let x = quiet, bars = '';
    widths.forEach((w, i) => { if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`; x += w; });
    return `<svg class="barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" width="${total * module}" height="${height}" preserveAspectRatio="none" role="img" aria-label="${text.replace(/[<>&"]/g, '')}"><rect width="${total}" height="${height}" fill="#fff"/><g fill="#000">${bars}</g></svg>`;
  }
  // يدور على المنتج بالباركود أو الكود SKU
  function findByCode(products, code) {
    const k = IMP.latinDigits(str(code)).toUpperCase();
    if (!k) return null;
    return (products || []).find((p) => str(p.barcode).toUpperCase() === k) || (products || []).find((p) => IMP.latinDigits(str(p.sku)).toUpperCase() === k) || null;
  }
  // باركود تلقائي للمنتجات اللي ملهاش كود إنجليزي
  function autoBarcode(products) {
    const used = new Set((products || []).map((p) => str(p.barcode).toUpperCase()));
    let n = 100001;
    while (used.has(`FL${n}`)) n++;
    return `FL${n}`;
  }
  const productCode = (p) => (validBarcode(str(p.barcode)) ? str(p.barcode) : validBarcode(str(p.sku)) ? str(p.sku) : '');

  const api = { STATEMENT_FIELDS, parseStatement, statusFromText, reconcile, expectedFor, reconciledSales, unsettledByCourier, shipmentOutstanding, ALERT_DEFAULTS, alerts, waPhone, waLink, C128, code128, barcodeSvg, validBarcode, findByCode, autoBarcode, productCode, daysBetween };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OPS = api;
})(typeof window !== 'undefined' ? window : globalThis);
