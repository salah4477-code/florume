/*
 * التخطيط — Florume
 * دوال نقية: حاسبة التسعير (أقل سعر من غير خسارة وسعر الهامش المستهدف، والتكلفة لو اشتريت بسعر صرف النهارده)،
 * تخطيط إعادة الطلب بسرعة البيع ومدة التوريد، التدفق النقدي المتوقع للأسابيع الجاية، وتقسيم العملاء.
 */
(function (root) {
  'use strict';
  const Acc = root.Acc || (typeof require !== 'undefined' ? require('./accounting.js') : null);
  const OPS = root.OPS || (typeof require !== 'undefined' ? require('./ops.js') : null);
  const num = (n) => Number(n) || 0;
  const round2 = (n) => Math.round(num(n) * 100) / 100;
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const days = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const isSale = (x) => !Acc.isPromo(x) && Acc.BOOKED.has(x.status);

  // =====================================================================
  // مصاريف الطلب الواحد في آخر فترة (بتتوزع على القطع في حاسبة التسعير)
  // =====================================================================
  function orderOverheads(state, journal, today, windowDays = 90) {
    const from = addDays(today, -windowDays);
    const sales = (state.sales || []).filter((x) => isSale(x) && x.date >= from && x.date <= today);
    const n = sales.length;
    const kept = sales.filter((x) => !Acc.REVERSED.has(x.status));
    const returned = n - kept.length;
    const avg = (f, list = sales) => (list.length ? list.reduce((a, x) => a + f(x), 0) / list.length : 0);
    const courierFee = avg((x) => num(x.courierFee));
    const shipCharged = avg((x) => num(x.shippingCharged));
    const returnFee = avg((x) => num(x.returnFee), sales.filter((x) => x.status === 'returned'));
    const items = avg((x) => (x.items || []).reduce((a, it) => a + num(it.qty), 0));
    const orderValue = avg((x) => Acc.saleTotals(x).net);
    const payFee = avg((x) => (x.payment !== 'cod' ? num(x.payFee) : 0));
    const extras = avg((x) => { const p = Acc.saleProfit(x, journal); return num(p.commission) + num(p.samples); }, kept);
    // الإعلانات: مصروفات 5300 + قطع الدعاية في نفس الفترة على الطلبات اللي اتسلمت
    const ads = (state.expenses || []).filter((e) => e.category === '5300' && e.date >= from && e.date <= today).reduce((a, e) => a + num(e.amount), 0)
      + (state.sales || []).filter((x) => Acc.isPromo(x) && Acc.BOOKED.has(x.status) && x.date >= from && x.date <= today).reduce((a, x) => a + (Acc.saleProfit(x, journal).promoCost || 0), 0);
    const returnRate = n ? returned / n : 0;
    const cpa = kept.length ? ads / kept.length : 0;
    // تكلفة المرتجع المتوقعة على كل طلب: الشحن رايح + مصاريف المرتجع × نسبة المرتجع
    const returnLoss = returnRate * (courierFee + returnFee);
    const perOrder = Math.max(0, courierFee - shipCharged) + cpa + returnLoss + payFee + extras;
    // مصاريف الطلب كنسبة من قيمته: القطعة الأغلى بتشيل نصيب أكبر، والعينة الرخيصة نصيب أصغر
    const share = orderValue > 0 ? Math.min(0.9, perOrder / orderValue) : 0;
    return { orders: n, kept: kept.length, returnRate, courierFee: round2(courierFee), shipCharged: round2(shipCharged), returnFee: round2(returnFee), cpa: round2(cpa), returnLoss: round2(returnLoss), payFee: round2(payFee), extras: round2(extras), itemsPerOrder: items || 1, orderValue: round2(orderValue), perOrder: round2(perOrder), share };
  }

  // التكلفة لو اشتريت النهارده: سعر المورد في آخر شحنة × سعر الصرف الحالي + نصيب القطعة من المصاريف
  function replacementCost(state, productId) {
    const shipments = (state.shipments || []).filter((sh) => sh.status !== 'cancelled' && (sh.items || []).some((it) => it.productId === productId)).sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1));
    const sh = shipments[0];
    if (!sh) return null;
    const c = Acc.shipmentCosting(sh, state.products);
    const l = c.lines.find((x) => x.productId === productId);
    const rateNow = sh.currency === 'EGP' ? 1 : num(((state.settings || {}).rates || {})[sh.currency]) || c.rate;
    const extrasUnit = l.qty ? l.extras / l.qty : 0;
    return { shipmentRef: sh.ref, currency: sh.currency, unitForeign: l.unitCost, rateThen: c.rate, rateNow, costThen: round2(l.landedUnit), costNow: round2(l.unitCost * rateNow + extrasUnit) };
  }

  function pricing(state, journal, today, opts = {}) {
    const target = num(opts.targetMargin != null ? opts.targetMargin : (state.settings || {}).targetMargin || 30) / 100;
    const oh = orderOverheads(state, journal, today, opts.windowDays || 90);
    const rows = (state.products || []).map((p) => {
      const st = journal.inventory.products[p.id] || {};
      const repl = replacementCost(state, p.id);
      const cost = Math.max(num(st.avgCost), repl ? repl.costNow : 0);
      if (!cost) return null;
      // السعر P لازم يغطي: التكلفة + P × نسبة مصاريف الطلب (+ P × الهامش المستهدف)
      const breakEven = oh.share < 1 ? cost / (1 - oh.share) : Infinity;
      const targetPrice = oh.share + target < 1 ? cost / (1 - oh.share - target) : Infinity;
      const price = num(p.price);
      const overhead = price * oh.share;
      const netMargin = price ? (price - cost - overhead) / price : null;
      return { productId: p.id, price, avgCost: round2(st.avgCost), repl, cost: round2(cost), overhead: round2(overhead), breakEven: round2(breakEven), targetPrice: isFinite(targetPrice) ? round2(Math.ceil(targetPrice / 5) * 5) : null, netMargin, status: !price ? 'none' : price < breakEven ? 'loss' : netMargin < target ? 'low' : 'ok', fxUp: repl ? repl.costNow > repl.costThen + 0.5 : false };
    }).filter(Boolean);
    return { overheads: oh, target, rows };
  }

  // =====================================================================
  // إعادة الطلب: سرعة البيع × (مدة التوريد + أمان + مدة التغطية) − المتاح − الجاي
  // =====================================================================
  function reorderPlan(state, journal, today, cfg = {}) {
    const S = state.settings || {};
    const windowDays = cfg.windowDays || 60;
    const safety = num(cfg.safetyDays != null ? cfg.safetyDays : S.safetyDays != null ? S.safetyDays : 7);
    const cover = num(cfg.coverDays != null ? cfg.coverDays : S.coverDays != null ? S.coverDays : 30);
    const from = addDays(today, -windowDays);
    const sold = {}, firstIn = {};
    (state.sales || []).forEach((x) => {
      if (!isSale(x) || x.date < from || x.date > today || x.status === 'returned') return;
      const pr = Acc.partialReturns(x);
      (x.items || []).forEach((it, i) => (sold[it.productId] = (sold[it.productId] || 0) + num(it.qty) - pr.qtyBack[i]));
    });
    journal.inventory.movements.forEach((m) => { if ((m.kind === 'in' || m.kind === 'decantIn') && !firstIn[m.productId]) firstIn[m.productId] = m.date; });
    const incoming = {}, supplierOf = {};
    (state.shipments || []).forEach((sh) => {
      (sh.items || []).forEach((it) => { if (!supplierOf[it.productId] || sh.orderDate > supplierOf[it.productId].date) supplierOf[it.productId] = { id: sh.supplierId, date: sh.orderDate }; });
      if (sh.status === 'ordered' || sh.status === 'transit') (sh.items || []).forEach((it) => (incoming[it.productId] = (incoming[it.productId] || 0) + num(it.qty)));
    });
    return (state.products || []).map((p) => {
      const st = journal.inventory.products[p.id] || { available: 0 };
      // المنتج الجديد: السرعة على الأيام من أول ما دخل المخزن
      const activeDays = Math.max(7, Math.min(windowDays, firstIn[p.id] ? days(firstIn[p.id], today) + 1 : windowDays));
      const velocity = (sold[p.id] || 0) / activeDays;
      const sup = supplierOf[p.id] && (state.suppliers || []).find((x) => x.id === supplierOf[p.id].id);
      const lead = num(sup && sup.leadDays) || num(S.leadDays) || 14;
      const onHand = num(st.available);
      const pipe = incoming[p.id] || 0;
      const coverDays = velocity > 0 ? (onHand + pipe) / velocity : null;
      const suggest = velocity > 0 ? Math.max(0, Math.ceil(velocity * (lead + safety + cover) - onHand - pipe)) : 0;
      const status = velocity <= 0 ? 'idle' : coverDays < lead + safety ? 'now' : coverDays < lead + safety + 14 ? 'soon' : 'ok';
      return { productId: p.id, sold: sold[p.id] || 0, velocity: round2(velocity), perMonth: round2(velocity * 30), available: onHand, incoming: pipe, lead, coverDays: coverDays == null ? null : Math.floor(coverDays), runOut: coverDays == null ? '' : addDays(today, Math.floor(coverDays)), suggest, supplierId: sup ? sup.id : '', status };
    }).sort((a, b) => ({ now: 0, soon: 1, ok: 2, idle: 3 }[a.status] - { now: 0, soon: 1, ok: 2, idle: 3 }[b.status]) || (a.coverDays ?? 1e9) - (b.coverDays ?? 1e9));
  }

  // =====================================================================
  // التدفق النقدي المتوقع: أسبوع بأسبوع
  // =====================================================================
  function cashForecast(state, journal, today, weeks = 8) {
    const S = state.settings || {};
    const A = S.alerts || {};
    const settle = num(A.settleDays) || 14;
    const oh = orderOverheads(state, journal, today, 90);
    const keepRate = 1 - oh.returnRate;
    const start = round2(Acc.cashBalances(state, journal).reduce((a, x) => a + x.balance, 0));
    const buckets = Array.from({ length: weeks }, (_, i) => ({ from: addDays(today, i * 7), to: addDays(today, i * 7 + 6), inflow: 0, outflow: 0, items: [] }));
    const put = (date, amount, label, kind) => {
      if (!amount) return;
      const d = date < today ? today : date;
      const b = buckets.find((x) => d >= x.from && d <= x.to);
      if (!b) return;
      if (amount > 0) b.inflow += amount; else b.outflow -= amount;
      b.items.push({ date: d, amount: round2(amount), label, kind });
    };
    // 1) تحصيل من شركات الشحن: المسلّم ولسه ما اتسواش، والمشحون والقيد التجهيز (بعد خصم نسبة المرتجع المتوقعة)
    const done = OPS.reconciledSales(state);
    const courierName = (id) => ((state.couriers || []).find((c) => c.id === id) || {}).name || 'شركة الشحن';
    (state.sales || []).forEach((x) => {
      if (Acc.isPromo(x) || x.payment !== 'cod' || done.has(x.id)) return;
      const e = OPS.expectedFor(x);
      if (x.status === 'delivered') put(addDays(x.date, settle), e.net, `تحصيل ${courierName(x.courierId)}`, 'courier');
      else if (x.status === 'shipped') put(addDays(x.date, 4 + settle), round2(e.net * keepRate), `تحصيل متوقع — طلبات مع ${courierName(x.courierId)}`, 'courier');
      else if (x.status === 'pending') put(addDays(x.date, 6 + settle), round2(e.net * keepRate), 'تحصيل متوقع — طلبات قيد التجهيز', 'courier');
    });
    // 2) سداد الموردين حسب ميعاد السداد، بسعر الصرف الحالي
    const owed = OPS.shipmentOutstanding(state, journal);
    const noDue = [];
    (state.shipments || []).forEach((sh) => {
      const left = owed[sh.id] || 0;
      if (left <= 0.005) return;
      const rate = sh.currency === 'EGP' ? 1 : num((S.rates || {})[sh.currency]) || num(sh.rate);
      const egp = round2(left * rate);
      if (sh.dueDate) put(sh.dueDate, -egp, `سداد شحنة ${sh.ref || ''} (${round2(left)} ${sh.currency})`, 'supplier');
      else noDue.push({ ref: sh.ref, amount: egp });
    });
    // 3) المصروفات الثابتة: المستحق دلوقتي والشهور الجاية
    OPS.dueRecurring(state, today).forEach((d) => put(today, -num(d.amount), `${d.notes || 'مصروف ثابت'} (${d.period})`, 'recurring'));
    const endDate = buckets[buckets.length - 1].to;
    (state.recurring || []).forEach((r) => {
      if (r.active === false) return;
      for (let m = 0; m < 3; m++) {
        const base = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 + m, 1));
        const ym = base.toISOString().slice(0, 7);
        if (ym < r.startMonth) continue;
        const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
        const date = `${ym}-${String(Math.min(num(r.day) || 1, last)).padStart(2, '0')}`;
        const posted = (state.expenses || []).some((e) => e.recurringId === r.id && e.period === ym);
        if (date > today && date <= endDate && !posted) put(date, -num(r.amount), r.notes || 'مصروف ثابت', 'recurring');
      }
    });
    // 4) عمولات المؤثرين المستحقة: متوقع سدادها خلال أسبوعين
    let commission = 0;
    journal.entries.forEach((e) => e.lines.forEach((l) => { if (l.acc === '2200') commission += l.cr - l.dr; }));
    if (commission > 0.5) put(addDays(today, 14), -round2(commission), 'عمولات مؤثرين مستحقة', 'commission');
    let bal = start;
    buckets.forEach((b) => { b.inflow = round2(b.inflow); b.outflow = round2(b.outflow); bal = round2(bal + b.inflow - b.outflow); b.balance = bal; b.items.sort((x, y) => (x.date < y.date ? -1 : 1)); });
    return { start, weeks: buckets, noDue, lowest: Math.min(...buckets.map((b) => b.balance)), firstNegative: (buckets.find((b) => b.balance < 0) || {}).from || '' };
  }

  // =====================================================================
  // العملاء: جديد، متكرر، VIP، آن الأوان يطلب تاني، ما طلبش من مدة
  // =====================================================================
  const SEGMENTS = { vip: 'VIP', repeat: 'متكرر', new: 'جديد', due: 'آن الأوان يطلب تاني', sleeping: 'ما طلبش من مدة', none: 'من غير طلبات' };
  function customerSegments(state, journal, today, cfg = {}) {
    const after = num(cfg.reorderAfterDays || (state.settings || {}).reorderAfterDays || 75);
    const stats = {};
    (state.sales || []).forEach((x) => {
      if (!isSale(x) || Acc.REVERSED.has(x.status)) return;
      const r = (stats[x.customerId] = stats[x.customerId] || { orders: 0, spend: 0, profit: 0, first: x.date, last: x.date, lastSale: x });
      const p = Acc.saleProfit(x, journal);
      r.orders += 1; r.spend += p.keptTotal != null ? p.keptTotal : p.total; r.profit += p.profit;
      if (x.date < r.first) r.first = x.date;
      if (x.date >= r.last) { r.last = x.date; r.lastSale = x; }
    });
    const spends = Object.values(stats).map((r) => r.spend).sort((a, b) => a - b);
    const p90 = spends.length ? spends[Math.floor(spends.length * 0.9)] : Infinity;
    const rows = (state.customers || []).map((c) => {
      const r = stats[c.id];
      if (!r) return { customerId: c.id, orders: 0, spend: 0, segment: 'none', due: false };
      const since = days(r.last, today);
      const due = r.lastSale.status === 'delivered' && since >= after && since < after + 60;
      const segment = since >= after + 60 ? 'sleeping' : due ? 'due' : r.orders >= 2 && r.spend >= p90 ? 'vip' : r.orders >= 2 ? 'repeat' : 'new';
      return { customerId: c.id, orders: r.orders, spend: round2(r.spend), profit: round2(r.profit), first: r.first, last: r.last, since, segment, due, lastProductId: ((r.lastSale.items || [])[0] || {}).productId };
    });
    const buyers = rows.filter((r) => r.orders > 0);
    return { rows, counts: Object.fromEntries(Object.keys(SEGMENTS).map((k) => [k, rows.filter((r) => r.segment === k).length])), repeatRate: buyers.length ? buyers.filter((r) => r.orders >= 2).length / buyers.length : 0, avgOrders: buyers.length ? buyers.reduce((a, r) => a + r.orders, 0) / buyers.length : 0 };
  }

  const api = { orderOverheads, replacementCost, pricing, reorderPlan, cashForecast, customerSegments, SEGMENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PLAN = api;
})(typeof window !== 'undefined' ? window : globalThis);
