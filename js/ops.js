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
    const gone = Acc.REVERSED.has(sale.status);
    const pr = Acc.partialReturns(sale);
    // المرتجع الجزئي: المندوب بيحصّل تمن اللي العميل خده بس
    const cod = sale.payment === 'cod' && !gone ? Math.max(0, t.total - pr.value - num(sale.exchangeCredit)) : 0;
    const fee = round2(num(sale.courierFee) + (returned ? num(sale.returnFee) : 0) + pr.fees);
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

    const dueRec = dueRecurring(state, today);
    if (dueRec.length) push({ type: 'recurring', level: 'warn', days: 0, title: `${dueRec.length} مصروف ثابت ميعاده جه ولسه ما اتسجلش`, detail: dueRec.slice(0, 3).map((d) => `${d.notes || d.category} (${d.period})`).join('، '), action: 'goto', id: 'expenses' });

    const rank = { bad: 0, warn: 1, info: 2 };
    // جرد الخزينة الشهري: الحسابات اللي عليها حركة وآخر جرد ليها من أكتر من 35 يوم — في تنبيه واحد
    const start = (state.settings || {}).startDate || '';
    const due = (state.accounts || []).map((a) => {
      const last = (state.cashCounts || []).filter((k) => k.accountId === a.id).map((k) => k.date).sort().pop() || start;
      const age = last ? daysBetween(last, today) : 0;
      const active = journal.entries.some((e) => e.date > (last || '') && e.lines.some((l) => l.acc === Acc.cashCode(a.id)));
      return age >= 35 && active ? { a, age } : null;
    }).filter(Boolean);
    if (due.length) push({ type: 'cashCount', level: 'warn', days: Math.max(...due.map((d) => d.age)), title: due.length === 1 ? `جرد ${due[0].a.name}: آخر جرد من ${due[0].age} يوم` : `جرد الخزينة: ${due.length === 2 ? "حسابين محتاجين" : `${due.length} حسابات محتاجة`} جرد`, detail: due.length === 1 ? 'قارن الرصيد الحقيقي بالرصيد اللي في السيستم' : due.map((d) => d.a.name).join('، '), action: 'newCashCount', id: due[0].a.id });
    return list.sort((a, b) => rank[a.level] - rank[b.level] || b.days - a.days);
  }

  // =====================================================================
  // المصروفات الثابتة الشهرية: الشهور اللي فات ميعادها ولسه ما اتسجلتش
  // =====================================================================
  const lastDay = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  function dueRecurring(state, today) {
    const out = [];
    const nowYm = today.slice(0, 7);
    (state.recurring || []).forEach((r) => {
      if (r.active === false || !r.startMonth) return;
      const posted = new Set((state.expenses || []).filter((e) => e.recurringId === r.id).map((e) => e.period));
      let ym = r.startMonth;
      for (let guard = 0; ym <= nowYm && guard < 36; guard++) {
        const day = Math.min(Math.max(1, num(r.day) || 1), lastDay(ym));
        const date = `${ym}-${String(day).padStart(2, '0')}`;
        if (date <= today && !posted.has(ym)) out.push({ recurringId: r.id, period: ym, date, amount: num(r.amount), category: r.category, accountId: r.accountId, notes: r.notes || '' });
        const [y, m] = ym.split('-').map(Number);
        ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      }
    });
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
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

  // =====================================================================
  // المرتجع: الأسباب، العملاء اللي بيرفضوا، وتحليل نسبة المرتجع
  // =====================================================================
  const RETURN_REASONS = { refused: 'رفض الاستلام', noAnswer: 'مابيردش / مش موجود', address: 'العنوان غلط أو ناقص', changedMind: 'غيّر رأيه / طلب بالغلط', damaged: 'المنتج وصل فيه مشكلة', wrongItem: 'وصله صنف غلط', late: 'التوصيل اتأخر', other: 'سبب تاني' };
  // الأسباب اللي غلطها على العميل: بتتحسب عليه في التحذير
  const RISKY_REASONS = new Set(['refused', 'noAnswer', 'changedMind']);
  const phoneKey = (p) => { let d = IMP.latinDigits(str(p)).replace(/\D/g, ''); if (d.startsWith('0020')) d = d.slice(4); else if (d.startsWith('20') && d.length === 12) d = d.slice(2); if (d.length === 10 && d.startsWith('1')) d = '0' + d; return d.length >= 8 ? d : ''; };
  const isSale = (x) => x.kind !== 'promo';

  // تاريخ العميل (بالعميل نفسه أو أي عميل تاني بنفس الموبايل)
  function customerRisk(state, customerId, phone, excludeSaleId) {
    const customers = state.customers || [];
    const me = customers.find((c) => c.id === customerId);
    const key = phoneKey(phone || (me && me.phone));
    const ids = new Set([customerId, ...customers.filter((c) => key && phoneKey(c.phone) === key).map((c) => c.id)].filter(Boolean));
    const r = { orders: 0, delivered: 0, returned: 0, refused: 0, pending: 0, lastRefusal: '', reasons: {}, level: 'none' };
    (state.sales || []).forEach((x) => {
      if (!ids.has(x.customerId) || x.id === excludeSaleId || !isSale(x) || x.status === 'cancelled') return;
      r.orders += 1;
      if (x.status === 'delivered') r.delivered += 1;
      if (x.status === 'pending' || x.status === 'shipped') r.pending += 1;
      if (x.status === 'returned') {
        r.returned += 1;
        const why = x.returnReason || '';
        if (why) r.reasons[why] = (r.reasons[why] || 0) + 1;
        if (RISKY_REASONS.has(why)) { r.refused += 1; if ((x.returnDate || x.date) > r.lastRefusal) r.lastRefusal = x.returnDate || x.date; }
      }
    });
    // مرتين رفض أو أكتر، أو رفض من غير ولا طلب اتسلم = خطر. رفض واحد = انتبه
    r.level = r.refused >= 2 || (r.refused >= 1 && !r.delivered) ? 'high' : r.refused === 1 || r.returned >= 2 ? 'watch' : 'none';
    return r;
  }

  // نسبة المرتجع حسب المحافظة وشركة الشحن والسبب والقناة
  function returnAnalysis(state, from, to) {
    const custCity = new Map((state.customers || []).map((c) => [c.id, c.city || '']));
    const mk = () => ({ orders: 0, returned: 0, partial: 0, lost: 0, loss: 0 });
    const by = { gov: {}, courier: {}, channel: {}, reason: {} };
    const total = mk();
    const bump = (group, key, fn) => { const k = key || '—'; fn((by[group][k] = by[group][k] || mk())); };
    (state.sales || []).forEach((x) => {
      if (!isSale(x) || !Acc.BOOKED.has(x.status)) return;
      if ((from && x.date < from) || (to && x.date > to)) return;
      const returned = x.status === 'returned', lost = x.status === 'lost';
      const partial = !returned && (x.returns || []).length > 0;
      // الخسارة المباشرة للمرتجع: الشحن رايح وجاي من غير بيع
      const loss = returned ? num(x.courierFee) + num(x.returnFee) : partial ? (x.returns || []).reduce((a, r) => a + num(r.fee), 0) : 0;
      const apply = (r) => { r.orders += 1; if (returned) r.returned += 1; if (partial) r.partial += 1; if (lost) r.lost += 1; r.loss += loss; };
      apply(total);
      bump('gov', custCity.get(x.customerId), apply);
      bump('courier', x.courierId, apply);
      bump('channel', x.channel, apply);
      if (returned) bump('reason', x.returnReason || 'unknown', (r) => { r.returned += 1; r.loss += loss; });
      if (partial) (x.returns || []).forEach((rt) => bump('reason', rt.reason || 'unknown', (r) => { r.partial += 1; r.loss += num(rt.fee); }));
    });
    const rows = (group) => Object.entries(by[group]).map(([key, r]) => ({ key, ...r, loss: round2(r.loss), rate: r.orders ? r.returned / r.orders : 0 })).sort((a, b) => b.returned - a.returned || b.orders - a.orders);
    return { total: { ...total, loss: round2(total.loss), rate: total.orders ? total.returned / total.orders : 0 }, gov: rows('gov'), courier: rows('courier'), channel: rows('channel'), reason: rows('reason') };
  }

  const api = { RETURN_REASONS, RISKY_REASONS, phoneKey, customerRisk, returnAnalysis, dueRecurring, STATEMENT_FIELDS, parseStatement, statusFromText, reconcile, expectedFor, reconciledSales, unsettledByCourier, shipmentOutstanding, ALERT_DEFAULTS, alerts, waPhone, waLink, C128, code128, barcodeSvg, validBarcode, findByCode, autoBarcode, productCode, daysBetween };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OPS = api;
})(typeof window !== 'undefined' ? window : globalThis);
