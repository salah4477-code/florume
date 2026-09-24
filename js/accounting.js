/*
 * محرك المحاسبة — Florume
 * دوال نقية (بدون واجهة) تحسب: تكلفة المخزون بالمتوسط المرجح، تكلفة الشحنات الواصلة (Landed Cost)،
 * أرصدة الموردين بالعملة الأجنبية وفروق العملة، والقيود اليومية المزدوجة وكل التقارير المالية.
 * القيود لا تُخزَّن؛ تُولَّد من المستندات في كل مرة، فأي تعديل على مستند ينعكس فورًا وبدون تعارض.
 */
(function (root) {
  'use strict';

  const EPS = 0.005;
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const num = (n) => Number(n) || 0;

  // ---------- دليل الحسابات ----------
  const COA = [
    { code: '1100', name: 'النقدية والبنوك والمحافظ', type: 'asset' },
    { code: '1200', name: 'مستحقات لدى شركات الشحن', type: 'asset' },
    { code: '1300', name: 'المخزون', type: 'asset' },
    { code: '1310', name: 'بضاعة في الطريق', type: 'asset' },
    { code: '2100', name: 'الموردين', type: 'liability' },
    { code: '3100', name: 'رأس المال', type: 'equity' },
    { code: '3200', name: 'المسحوبات الشخصية', type: 'equity' },
    { code: '3400', name: 'أرباح موزعة على الشركاء', type: 'equity' },
    { code: '3500', name: 'جاري الشركاء', type: 'equity' },
    { code: '4100', name: 'المبيعات', type: 'revenue' },
    { code: '4110', name: 'خصومات المبيعات', type: 'revenue', contra: true },
    { code: '4120', name: 'مردودات المبيعات', type: 'revenue', contra: true },
    { code: '4200', name: 'إيراد الشحن المحصل من العملاء', type: 'revenue' },
    { code: '4300', name: 'أرباح فروق العملة', type: 'revenue', other: true },
    { code: '4900', name: 'إيرادات أخرى', type: 'revenue', other: true },
    { code: '5100', name: 'تكلفة البضاعة المباعة', type: 'expense', cogs: true },
    { code: '5200', name: 'مصاريف شحن الطلبات', type: 'expense' },
    { code: '5210', name: 'مصاريف المرتجعات', type: 'expense' },
    { code: '5300', name: 'إعلانات وتسويق', type: 'expense' },
    { code: '5400', name: 'تغليف وتعبئة', type: 'expense' },
    { code: '5500', name: 'رواتب وعمولات', type: 'expense' },
    { code: '5600', name: 'إيجار ومرافق', type: 'expense' },
    { code: '5700', name: 'عمولات بنكية وتحويلات', type: 'expense' },
    { code: '5800', name: 'عجز وتوالف المخزون', type: 'expense' },
    { code: '5810', name: 'تسترات وعينات وهدايا', type: 'expense' },
    { code: '5900', name: 'خسائر فروق العملة', type: 'expense', other: true },
    { code: '5950', name: 'اشتراكات وبرامج', type: 'expense' },
    { code: '5990', name: 'مصروفات أخرى', type: 'expense' },
  ];
  const COA_MAP = Object.fromEntries(COA.map((a) => [a.code, a]));

  // التصنيفات المتاحة في شاشة المصروفات
  const EXPENSE_CATEGORIES = ['5300', '5400', '5200', '5500', '5600', '5700', '5950', '5990'];

  // حالات الطلب التي تُحسب فيها المبيعات
  const BOOKED = new Set(['shipped', 'delivered', 'returned']);
  // فاتورة دعاية: قطع مجانية تخرج من المخزون بتكلفتها وتُحمَّل على مصروف الإعلانات
  const isPromo = (sale) => !!sale && sale.kind === 'promo';

  const isDebitNature = (code) => {
    const a = COA_MAP[baseCode(code)];
    if (!a) return true;
    if (a.contra) return true;
    if (a.code === '3200' || a.code === '3400') return true;
    return a.type === 'asset' || a.type === 'expense';
  };
  const baseCode = (code) => String(code).split(':')[0];
  const cashCode = (accountId) => '1100:' + accountId;

  const byDateThen = (priority) => (a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (priority[a.kind] || 0) - (priority[b.kind] || 0) || a.seq - b.seq;

  // ---------- حسابات الطلب ----------
  function saleTotals(sale) {
    const gross = round2((sale.items || []).reduce((s, it) => s + num(it.qty) * num(it.price), 0));
    const discount = round2(num(sale.discount));
    const shipping = round2(num(sale.shippingCharged));
    const net = round2(gross - discount);
    return { gross, discount, net, shipping, total: round2(net + shipping) };
  }

  // ---------- تكلفة الشحنة الواصلة ----------
  function shipmentCosting(shipment) {
    const rate = num(shipment.rate) || 1;
    const lines = (shipment.items || []).map((it) => {
      const foreign = num(it.qty) * num(it.unitCost);
      return { productId: it.productId, qty: num(it.qty), unitCost: num(it.unitCost), foreign, egp: foreign * rate };
    });
    const goodsForeign = round2(lines.reduce((s, l) => s + l.foreign, 0));
    const goodsEGP = round2(lines.reduce((s, l) => s + l.egp, 0));
    const extras = round2((shipment.costs || []).reduce((s, c) => s + num(c.amount), 0));
    const totalQty = lines.reduce((s, l) => s + l.qty, 0);
    lines.forEach((l) => {
      // توزيع المصاريف بنسبة القيمة، وإن كانت القيمة صفرًا فبنسبة الكمية
      const share = goodsEGP > 0 ? l.egp / goodsEGP : totalQty > 0 ? l.qty / totalQty : 0;
      l.extras = extras * share;
      l.landedTotal = l.egp + l.extras;
      l.landedUnit = l.qty > 0 ? l.landedTotal / l.qty : 0;
    });
    return { rate, lines, goodsForeign, goodsEGP, extras, landedTotal: round2(goodsEGP + extras), totalQty };
  }

  // ---------- إعادة تشغيل المخزون بالمتوسط المرجح ----------
  function computeInventory(state, asOf) {
    const events = [];
    let seq = 0;
    (state.shipments || []).forEach((sh) => {
      if (sh.status !== 'received') return;
      const date = sh.receivedDate || sh.orderDate;
      shipmentCosting(sh).lines.forEach((l, i) =>
        events.push({ kind: 'in', date, seq: seq++, productId: l.productId, qty: l.qty, cost: l.landedTotal, src: { type: 'shipment', id: sh.id, line: i } })
      );
    });
    (state.adjustments || []).forEach((adj) => {
      const qty = num(adj.qty);
      if (qty > 0) events.push({ kind: 'in', date: adj.date, seq: seq++, productId: adj.productId, qty, cost: adj.unitCost != null && adj.unitCost !== '' ? qty * num(adj.unitCost) : null, src: { type: 'adjustment', id: adj.id } });
      else if (qty < 0) events.push({ kind: 'outAdj', date: adj.date, seq: seq++, productId: adj.productId, qty: -qty, src: { type: 'adjustment', id: adj.id } });
    });
    (state.decants || []).forEach((d) => {
      if (d.sourceProductId && num(d.sourceQty) > 0) events.push({ kind: 'decant', date: d.date, seq: seq++, productId: d.sourceProductId, qty: num(d.sourceQty), decant: d, src: { type: 'decant', id: d.id } });
    });
    (state.sales || []).forEach((sale) => {
      if (!BOOKED.has(sale.status)) return;
      (sale.items || []).forEach((it, i) => events.push({ kind: 'sale', date: sale.date, seq: seq++, productId: it.productId, qty: num(it.qty), src: { type: 'sale', id: sale.id, line: i } }));
      if (sale.status === 'returned') {
        (sale.items || []).forEach((it, i) => events.push({ kind: 'return', date: sale.returnDate || sale.date, seq: seq++, productId: it.productId, qty: num(it.qty), src: { type: 'sale', id: sale.id, line: i } }));
      }
    });
    events.sort(byDateThen({ in: 0, return: 1, decant: 2, sale: 3, outAdj: 4 }));
    const sizeOf = (pid) => num(((state.products || []).find((p) => p.id === pid) || {}).sizeMl);

    const stock = {}; // productId -> {qty, value, lastCost}
    const saleCogs = {}; // saleId -> [cogs per line]
    const adjCost = {}; // adjustmentId -> total cost
    const decantCost = {}; // decantId -> {sourceCost, materials, total, lines}
    const movements = []; // لكل منتج
    const warnings = [];
    const get = (pid) => (stock[pid] = stock[pid] || { qty: 0, value: 0, lastCost: 0 });

    for (const ev of events) {
      if (asOf && ev.date > asOf) break;
      const s = get(ev.productId);
      const avg = s.qty > EPS ? s.value / s.qty : s.lastCost;
      let cost;
      if (ev.kind === 'decant') {
        // تفريغ الزجاجة الأصلية ثم توزيع تكلفتها + تكلفة العبوات على العبوات الصغيرة بنسبة المللي
        if (s.qty + EPS < ev.qty) warnings.push({ productId: ev.productId, date: ev.date, src: ev.src, message: 'رصيد غير كافٍ' });
        const sourceCost = ev.qty * avg;
        s.qty -= ev.qty; s.value -= sourceCost;
        if (Math.abs(s.qty) < EPS) { s.qty = 0; s.value = 0; }
        movements.push({ ...ev, kind: 'decantOut', cost: round2(sourceCost), balanceQty: s.qty, balanceValue: round2(s.value) });
        const outs = (ev.decant.outputs || []).filter((o) => o.productId && num(o.qty) > 0);
        const materials = num(ev.decant.materialsCost);
        const total = sourceCost + materials;
        const totalMl = outs.reduce((a, o) => a + num(o.qty) * sizeOf(o.productId), 0);
        const totalQty = outs.reduce((a, o) => a + num(o.qty), 0);
        const lines = outs.map((o) => {
          const share = totalMl > 0 ? (num(o.qty) * sizeOf(o.productId)) / totalMl : totalQty > 0 ? num(o.qty) / totalQty : 0;
          const c = total * share;
          const t = get(o.productId);
          t.qty += num(o.qty); t.value += c; t.lastCost = c / num(o.qty);
          movements.push({ kind: 'decantIn', date: ev.date, seq: ev.seq, productId: o.productId, qty: num(o.qty), src: ev.src, cost: round2(c), balanceQty: t.qty, balanceValue: round2(t.value) });
          return c;
        });
        decantCost[ev.src.id] = { sourceCost: round2(sourceCost), materials: round2(materials), total: round2(total), lines: lines.map(round2), costPerMl: totalMl > 0 ? total / totalMl : 0 };
        continue;
      }
      if (ev.kind === 'in') {
        cost = ev.cost == null ? ev.qty * avg : ev.cost;
        s.qty += ev.qty; s.value += cost;
        if (ev.qty > 0) s.lastCost = cost / ev.qty;
        if (ev.src.type === 'adjustment') adjCost[ev.src.id] = cost;
      } else if (ev.kind === 'return') {
        cost = (saleCogs[ev.src.id] || [])[ev.src.line] || ev.qty * avg;
        s.qty += ev.qty; s.value += cost;
      } else {
        if (s.qty + EPS < ev.qty) warnings.push({ productId: ev.productId, date: ev.date, src: ev.src, message: 'رصيد غير كافٍ' });
        cost = ev.qty * avg;
        s.qty -= ev.qty; s.value -= cost;
        if (Math.abs(s.qty) < EPS) { s.qty = 0; s.value = 0; }
        if (ev.kind === 'sale') (saleCogs[ev.src.id] = saleCogs[ev.src.id] || [])[ev.src.line] = cost;
        else adjCost[ev.src.id] = cost;
      }
      movements.push({ ...ev, cost: round2(cost), balanceQty: s.qty, balanceValue: round2(s.value) });
    }
    // الكميات المحجوزة: طلبات قيد التجهيز
    const reserved = {};
    (state.sales || []).forEach((sale) => {
      if (sale.status !== 'pending') return;
      (sale.items || []).forEach((it) => (reserved[it.productId] = (reserved[it.productId] || 0) + num(it.qty)));
    });
    const products = {};
    (state.products || []).forEach((p) => {
      const s = stock[p.id] || { qty: 0, value: 0, lastCost: 0 };
      const qty = round2(s.qty);
      products[p.id] = {
        qty, value: round2(s.value), avgCost: qty > EPS ? s.value / qty : s.lastCost,
        reserved: reserved[p.id] || 0, available: round2(qty - (reserved[p.id] || 0)),
      };
    });
    return { products, saleCogs, adjCost, decantCost, movements, warnings };
  }

  // ---------- أرصدة الموردين بالعملة الأجنبية وفروق العملة ----------
  function computeSuppliers(state, asOf) {
    const events = [];
    let seq = 0;
    (state.shipments || []).forEach((sh) => {
      if (sh.status === 'cancelled') return;
      const c = shipmentCosting(sh);
      if (c.goodsForeign) events.push({ kind: 'purchase', date: sh.orderDate, seq: seq++, supplierId: sh.supplierId, foreign: c.goodsForeign, rate: c.rate, ref: { type: 'shipment', id: sh.id } });
    });
    (state.supplierPayments || []).forEach((p) =>
      events.push({ kind: 'payment', date: p.date, seq: seq++, supplierId: p.supplierId, foreign: -num(p.amount), rate: num(p.rate) || 1, ref: { type: 'supplierPayment', id: p.id } })
    );
    events.sort(byDateThen({ purchase: 0, payment: 1 }));

    const balances = {}; // supplierId -> {foreign, egp}
    const fx = {}; // ref id -> adj (موجب = خسارة: نحتاج دائن إضافي للمورد)
    const lines = [];
    for (const ev of events) {
      if (asOf && ev.date > asOf) break;
      const b = (balances[ev.supplierId] = balances[ev.supplierId] || { foreign: 0, egp: 0 });
      const x = ev.foreign;
      const before = b.egp;
      if (Math.abs(b.foreign) < EPS || Math.sign(x) === Math.sign(b.foreign)) {
        b.foreign += x; b.egp += x * ev.rate;
      } else {
        const closing = Math.sign(x) * Math.min(Math.abs(x), Math.abs(b.foreign));
        const avg = b.egp / b.foreign;
        b.foreign += closing; b.egp += closing * avg;
        const rest = x - closing;
        if (Math.abs(rest) > EPS) { b.foreign += rest; b.egp += rest * ev.rate; }
        if (Math.abs(b.foreign) < EPS) { b.foreign = 0; b.egp = 0; }
      }
      const adj = round2(b.egp - (before + x * ev.rate));
      fx[ev.ref.id] = adj;
      lines.push({ ...ev, egp: round2(x * ev.rate), fx: adj, balanceForeign: round2(b.foreign), balanceEGP: round2(b.egp) });
    }
    Object.values(balances).forEach((b) => { b.foreign = round2(b.foreign); b.egp = round2(b.egp); });
    return { balances, fx, lines };
  }

  // ---------- توليد القيود اليومية ----------
  function buildJournal(state) {
    const inv = computeInventory(state);
    const sup = computeSuppliers(state);
    const S = state.settings || {};
    const entries = [];
    const name = (list, id) => ((state[list] || []).find((x) => x.id === id) || {}).name || '';
    const productName = (id) => {
      const p = (state.products || []).find((x) => x.id === id);
      return p ? `${p.brand ? p.brand + ' ' : ''}${p.name}` : '';
    };
    const add = (date, source, ref, desc, lines) => {
      const clean = lines
        .map((l) => ({ ...l, dr: round2(l.dr), cr: round2(l.cr) }))
        .filter((l) => Math.abs(l.dr) > EPS || Math.abs(l.cr) > EPS)
        .map((l) => (l.dr < 0 || l.cr < 0 ? { ...l, dr: Math.max(l.dr, 0) + Math.max(-l.cr, 0), cr: Math.max(l.cr, 0) + Math.max(-l.dr, 0) } : l));
      if (!clean.length) return;
      entries.push({ date, source, ref, desc, lines: clean });
    };
    const fxLines = (adj, party) =>
      adj > 0 ? [{ acc: '5900', dr: adj, cr: 0 }, { acc: '2100', dr: 0, cr: adj, party }]
      : adj < 0 ? [{ acc: '2100', dr: -adj, cr: 0, party }, { acc: '4300', dr: 0, cr: -adj }] : [];

    // أرصدة افتتاحية للخزائن
    (state.accounts || []).forEach((a) => {
      if (num(a.opening)) add(S.startDate || '2000-01-01', 'opening', { type: 'account', id: a.id }, `رصيد افتتاحي — ${a.name}`, [
        { acc: cashCode(a.id), dr: num(a.opening), cr: 0 }, { acc: '3100', dr: 0, cr: num(a.opening) },
      ]);
    });

    // رأس المال والمسحوبات
    // مسحوبات الشريك تُخصم من حسابه الجاري، والمسحوبات بدون شريك تبقى مسحوبات شخصية
    (state.equity || []).forEach((e) => {
      const amt = num(e.amount);
      const partner = e.partnerId ? { type: 'partner', id: e.partnerId } : undefined;
      const who = e.partnerId ? ` — ${name('partners', e.partnerId)}` : '';
      if (e.type === 'drawing') add(e.date, 'equity', { type: 'equity', id: e.id }, `مسحوبات${partner ? ' من جاري الشريك' : ' شخصية'}${who}${e.notes ? ' — ' + e.notes : ''}`, [
        { acc: partner ? '3500' : '3200', dr: amt, cr: 0, party: partner }, { acc: cashCode(e.accountId), dr: 0, cr: amt },
      ]);
      else add(e.date, 'equity', { type: 'equity', id: e.id }, `إضافة رأس مال${who}${e.notes ? ' — ' + e.notes : ''}`, [
        { acc: cashCode(e.accountId), dr: amt, cr: 0 }, { acc: '3100', dr: 0, cr: amt, party: partner },
      ]);
    });

    // توزيع الأرباح على الشركاء
    (state.distributions || []).forEach((d) => {
      const allocs = (d.allocations || []).filter((a) => num(a.amount));
      const total = allocs.reduce((a, x) => a + num(x.amount), 0);
      add(d.date, 'distribution', { type: 'distribution', id: d.id }, `توزيع أرباح ${d.from ? d.from + ' — ' + d.to : ''}${d.notes ? ' — ' + d.notes : ''}`, [
        { acc: '3400', dr: total, cr: 0 },
        ...allocs.map((a) => ({ acc: '3500', dr: 0, cr: num(a.amount), party: { type: 'partner', id: a.partnerId } })),
      ]);
    });

    // الشحنات
    (state.shipments || []).forEach((sh) => {
      if (sh.status === 'cancelled') return;
      const c = shipmentCosting(sh);
      const party = { type: 'supplier', id: sh.supplierId };
      const ref = { type: 'shipment', id: sh.id };
      const label = `شحنة ${sh.ref || ''} — ${name('suppliers', sh.supplierId)}`;
      add(sh.orderDate, 'shipment', ref, `${label} (${c.goodsForeign} ${sh.currency} × ${c.rate})`, [
        { acc: '1310', dr: c.goodsEGP, cr: 0 }, { acc: '2100', dr: 0, cr: c.goodsEGP, party }, ...fxLines(sup.fx[sh.id] || 0, party),
      ]);
      (sh.costs || []).forEach((cost) => {
        add(cost.date || sh.orderDate, 'shipment', ref, `${label} — ${cost.label || 'مصاريف'}`, [
          { acc: '1310', dr: num(cost.amount), cr: 0 }, { acc: cashCode(cost.accountId), dr: 0, cr: num(cost.amount) },
        ]);
      });
      if (sh.status === 'received') add(sh.receivedDate || sh.orderDate, 'shipment', ref, `استلام ${label} في المخزن`, [
        { acc: '1300', dr: c.landedTotal, cr: 0 }, { acc: '1310', dr: 0, cr: c.landedTotal },
      ]);
    });

    // دفعات الموردين
    (state.supplierPayments || []).forEach((p) => {
      const party = { type: 'supplier', id: p.supplierId };
      const egp = num(p.amount) * (num(p.rate) || 1);
      const fee = num(p.fee);
      add(p.date, 'supplierPayment', { type: 'supplierPayment', id: p.id }, `دفعة للمورد ${name('suppliers', p.supplierId)} (${num(p.amount)} × ${num(p.rate) || 1})`, [
        { acc: '2100', dr: egp, cr: 0, party }, { acc: '5700', dr: fee, cr: 0 },
        { acc: cashCode(p.accountId), dr: 0, cr: egp + fee }, ...fxLines(sup.fx[p.id] || 0, party),
      ]);
    });

    // المبيعات
    (state.sales || []).forEach((sale) => {
      if (!BOOKED.has(sale.status)) return;
      const t = saleTotals(sale);
      const ref = { type: 'sale', id: sale.id };
      const courier = { type: 'courier', id: sale.courierId };
      const prepaid = sale.payment && sale.payment !== 'cod';
      const debitAcc = prepaid ? cashCode(sale.payment) : '1200';
      const cogs = round2((inv.saleCogs[sale.id] || []).reduce((s, c) => s + (c || 0), 0));
      const cust = name('customers', sale.customerId);
      if (isPromo(sale)) {
        add(sale.date, 'sale', ref, `فاتورة دعاية ${sale.no || ''} — ${cust}`, [
          { acc: '5300', dr: cogs + num(sale.courierFee), cr: 0 }, { acc: '1300', dr: 0, cr: cogs },
          { acc: '1200', dr: 0, cr: num(sale.courierFee), party: courier },
        ]);
        if (sale.status === 'returned') add(sale.returnDate || sale.date, 'saleReturn', ref, `رجوع قطع فاتورة الدعاية ${sale.no || ''} — ${cust}`, [
          { acc: '1300', dr: cogs, cr: 0 }, { acc: '5300', dr: num(sale.returnFee) - cogs, cr: 0 },
          { acc: '1200', dr: 0, cr: num(sale.returnFee), party: courier },
        ]);
        return;
      }
      add(sale.date, 'sale', ref, `فاتورة ${sale.no || ''} — ${cust}`, [
        { acc: debitAcc, dr: t.total, cr: 0, party: prepaid ? undefined : courier },
        { acc: '4110', dr: t.discount, cr: 0 },
        { acc: '4100', dr: 0, cr: t.gross }, { acc: '4200', dr: 0, cr: t.shipping },
        { acc: '5100', dr: cogs, cr: 0 }, { acc: '1300', dr: 0, cr: cogs },
        { acc: '5200', dr: num(sale.courierFee), cr: 0 }, { acc: '1200', dr: 0, cr: num(sale.courierFee), party: courier },
      ]);
      if (sale.status === 'returned') {
        add(sale.returnDate || sale.date, 'saleReturn', ref, `مرتجع فاتورة ${sale.no || ''} — ${cust}`, [
          { acc: '4120', dr: t.net, cr: 0 }, { acc: '4200', dr: t.shipping, cr: 0 },
          { acc: debitAcc, dr: 0, cr: t.total, party: prepaid ? undefined : courier },
          { acc: '1300', dr: cogs, cr: 0 }, { acc: '5100', dr: 0, cr: cogs },
          { acc: '5210', dr: num(sale.returnFee), cr: 0 }, { acc: '1200', dr: 0, cr: num(sale.returnFee), party: courier },
        ]);
      }
    });

    // تسويات شركات الشحن (تحصيل صافي الدفع عند الاستلام)
    (state.settlements || []).forEach((st) => {
      const amt = num(st.amount);
      const courier = { type: 'courier', id: st.courierId };
      add(st.date, 'settlement', { type: 'settlement', id: st.id }, `${amt >= 0 ? 'تحصيل من' : 'سداد إلى'} ${name('couriers', st.courierId)}`, [
        { acc: cashCode(st.accountId), dr: amt, cr: 0 }, { acc: '1200', dr: 0, cr: amt, party: courier },
      ]);
    });

    // المصروفات
    (state.expenses || []).forEach((e) => {
      add(e.date, 'expense', { type: 'expense', id: e.id }, `${(COA_MAP[e.category] || {}).name || 'مصروف'}${e.notes ? ' — ' + e.notes : ''}`, [
        { acc: e.category || '5990', dr: num(e.amount), cr: 0 }, { acc: cashCode(e.accountId), dr: 0, cr: num(e.amount) },
      ]);
    });

    // التحويلات بين الخزائن
    (state.transfers || []).forEach((t) => {
      add(t.date, 'transfer', { type: 'transfer', id: t.id }, `تحويل من ${name('accounts', t.fromId)} إلى ${name('accounts', t.toId)}`, [
        { acc: cashCode(t.toId), dr: num(t.amount), cr: 0 }, { acc: '5700', dr: num(t.fee), cr: 0 },
        { acc: cashCode(t.fromId), dr: 0, cr: num(t.amount) + num(t.fee) },
      ]);
    });

    // تسويات المخزون
    (state.adjustments || []).forEach((adj) => {
      const cost = round2(inv.adjCost[adj.id] || 0);
      const ref = { type: 'adjustment', id: adj.id };
      const pn = productName(adj.productId);
      if (num(adj.qty) > 0) {
        const credit = adj.reason === 'opening' ? '3100' : '4900';
        add(adj.date, 'adjustment', ref, `${adj.reason === 'opening' ? 'مخزون افتتاحي' : 'زيادة جرد'} — ${pn}`, [
          { acc: '1300', dr: cost, cr: 0 }, { acc: credit, dr: 0, cr: cost },
        ]);
      } else if (num(adj.qty) < 0) {
        const debit = adj.reason === 'promo' ? '5300' : adj.reason === 'tester' || adj.reason === 'gift' ? '5810' : '5800';
        add(adj.date, 'adjustment', ref, `${ADJ_REASONS[adj.reason] || 'تسوية'} — ${pn}`, [
          { acc: debit, dr: cost, cr: 0 }, { acc: '1300', dr: 0, cr: cost },
        ]);
      }
    });

    // تقسيم العبوات (ديكانت): تحويل داخل المخزون + تكلفة العبوات الفاضية
    (state.decants || []).forEach((d) => {
      const c = inv.decantCost[d.id];
      if (!c) return;
      add(d.date, 'decant', { type: 'decant', id: d.id }, `تقسيم ${num(d.sourceQty)} عبوة ${productName(d.sourceProductId)} إلى ديكانت`, [
        { acc: '1300', dr: c.total, cr: 0 }, { acc: '1300', dr: 0, cr: c.sourceCost },
        ...(c.materials ? [{ acc: cashCode(d.accountId), dr: 0, cr: c.materials }] : []),
      ]);
    });

    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    entries.forEach((e, i) => (e.no = i + 1));
    return { entries, inventory: inv, suppliers: sup };
  }

  const ADJ_REASONS = { opening: 'مخزون افتتاحي', count: 'فرق جرد', damage: 'تالف/مكسور', tester: 'تستر', gift: 'هدية/عينة', promo: 'عينة دعاية', other: 'أخرى' };

  // ---------- التقارير ----------
  const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

  function accountName(code, state) {
    const [base, sub] = String(code).split(':');
    if (base === '1100' && sub) {
      const a = (state.accounts || []).find((x) => x.id === sub);
      return a ? a.name : 'خزينة محذوفة';
    }
    return (COA_MAP[base] || {}).name || code;
  }

  function balances(entries, from, to) {
    const map = {};
    entries.forEach((e) => {
      if (!inRange(e.date, from, to)) return;
      e.lines.forEach((l) => {
        const m = (map[l.acc] = map[l.acc] || { dr: 0, cr: 0 });
        m.dr += l.dr; m.cr += l.cr;
      });
    });
    return map;
  }

  function trialBalance(state, journal, to) {
    const map = balances(journal.entries, null, to);
    const rows = Object.keys(map).sort().map((acc) => {
      const net = map[acc].dr - map[acc].cr;
      return { acc, name: accountName(acc, state), dr: round2(map[acc].dr), cr: round2(map[acc].cr), balDr: net > 0 ? round2(net) : 0, balCr: net < 0 ? round2(-net) : 0 };
    });
    const totals = rows.reduce((t, r) => ({ dr: t.dr + r.dr, cr: t.cr + r.cr, balDr: t.balDr + r.balDr, balCr: t.balCr + r.balCr }), { dr: 0, cr: 0, balDr: 0, balCr: 0 });
    Object.keys(totals).forEach((k) => (totals[k] = round2(totals[k])));
    return { rows, totals, balanced: Math.abs(totals.dr - totals.cr) < 0.05 };
  }

  function incomeStatement(state, journal, from, to) {
    const map = balances(journal.entries, from, to);
    const bal = (code) => { const m = map[code]; return m ? round2(isDebitNature(code) ? m.dr - m.cr : m.cr - m.dr) : 0; };
    const grossSales = bal('4100');
    const discounts = bal('4110');
    const returns = bal('4120');
    const shippingIncome = bal('4200');
    const netSales = round2(grossSales - discounts - returns + shippingIncome);
    const cogs = bal('5100');
    const grossProfit = round2(netSales - cogs);
    const opex = COA.filter((a) => a.type === 'expense' && !a.cogs && !a.other).map((a) => ({ code: a.code, name: a.name, amount: bal(a.code) })).filter((r) => Math.abs(r.amount) > EPS);
    const totalOpex = round2(opex.reduce((s, r) => s + r.amount, 0));
    const operatingProfit = round2(grossProfit - totalOpex);
    const fxGain = bal('4300'), otherIncome = bal('4900'), fxLoss = bal('5900');
    const netProfit = round2(operatingProfit + fxGain + otherIncome - fxLoss);
    return { grossSales, discounts, returns, shippingIncome, netSales, cogs, grossProfit, opex, totalOpex, operatingProfit, fxGain, otherIncome, fxLoss, netProfit, grossMargin: netSales ? grossProfit / netSales : 0, netMargin: netSales ? netProfit / netSales : 0 };
  }

  function balanceSheet(state, journal, asOf) {
    const map = balances(journal.entries, null, asOf);
    const net = (code) => { const m = map[code]; return m ? round2(m.dr - m.cr) : 0; };
    const cash = (state.accounts || []).map((a) => ({ name: a.name, amount: net(cashCode(a.id)) }));
    Object.keys(map).forEach((k) => { if (k.startsWith('1100:') && !(state.accounts || []).some((a) => cashCode(a.id) === k)) cash.push({ name: accountName(k, state), amount: net(k) }); });
    const totalCash = round2(cash.reduce((s, r) => s + r.amount, 0));
    const suppliers = net('2100'); // موجب = دفعات مقدمة، سالب = مستحق للموردين
    const assets = [
      ...cash.map((c) => ({ name: c.name, amount: c.amount, group: 'cash' })),
      { name: 'مستحقات لدى شركات الشحن', amount: net('1200') },
      { name: 'المخزون', amount: net('1300') },
      { name: 'بضاعة في الطريق', amount: net('1310') },
    ];
    if (suppliers > 0) assets.push({ name: 'دفعات مقدمة للموردين', amount: suppliers });
    const liabilities = suppliers < 0 ? [{ name: 'مستحق للموردين', amount: -suppliers }] : [];
    let earnings = 0;
    Object.keys(map).forEach((k) => {
      const a = COA_MAP[baseCode(k)];
      if (a && (a.type === 'revenue' || a.type === 'expense')) earnings += map[k].cr - map[k].dr;
    });
    const equity = [
      { name: 'رأس المال', amount: round2(-net('3100')) },
      { name: 'المسحوبات الشخصية', amount: round2(net('3200') ? -net('3200') : 0) },
      { name: 'الأرباح المحتجزة (صافي الربح المتراكم)', amount: round2(earnings) },
    ];
    if (net('3400')) equity.push({ name: 'أرباح موزعة على الشركاء', amount: round2(-net('3400')) });
    if (net('3500')) equity.push({ name: 'جاري الشركاء', amount: round2(-net('3500')) });
    const totalAssets = round2(assets.reduce((s, r) => s + r.amount, 0));
    const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.amount, 0));
    const totalEquity = round2(equity.reduce((s, r) => s + r.amount, 0));
    return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, totalCash, balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.05 };
  }

  function ledger(state, journal, acc, from, to, party) {
    let opening = 0;
    const rows = [];
    const match = (l) => (acc.includes(':') ? l.acc === acc : baseCode(l.acc) === acc) && (!party || (l.party && l.party.type === party.type && l.party.id === party.id));
    journal.entries.forEach((e) => {
      e.lines.forEach((l) => {
        if (!match(l)) return;
        if (from && e.date < from) { opening += l.dr - l.cr; return; }
        if (to && e.date > to) return;
        rows.push({ date: e.date, no: e.no, desc: e.desc, source: e.source, ref: e.ref, dr: l.dr, cr: l.cr });
      });
    });
    let bal = opening;
    rows.forEach((r) => { bal += r.dr - r.cr; r.balance = round2(bal); });
    return { opening: round2(opening), rows, closing: round2(bal) };
  }

  function cashBalances(state, journal, asOf) {
    const map = balances(journal.entries, null, asOf);
    return (state.accounts || []).map((a) => { const m = map[cashCode(a.id)] || { dr: 0, cr: 0 }; return { ...a, balance: round2(m.dr - m.cr) }; });
  }

  function courierBalances(state, journal, asOf) {
    const out = {};
    journal.entries.forEach((e) => {
      if (asOf && e.date > asOf) return;
      e.lines.forEach((l) => {
        if (l.acc !== '1200' || !l.party) return;
        out[l.party.id] = round2((out[l.party.id] || 0) + l.dr - l.cr);
      });
    });
    return out;
  }

  function saleProfit(sale, journal) {
    const t = saleTotals(sale);
    const cogs = round2((journal.inventory.saleCogs[sale.id] || []).reduce((s, c) => s + (c || 0), 0));
    if (!BOOKED.has(sale.status)) return { ...t, cogs: 0, profit: 0 };
    if (isPromo(sale)) {
      const cost = sale.status === 'returned' ? num(sale.courierFee) + num(sale.returnFee) : cogs + num(sale.courierFee);
      return { ...t, cogs, profit: round2(-cost), promoCost: round2(cost) };
    }
    if (sale.status === 'returned') return { ...t, cogs, profit: round2(-num(sale.courierFee) - num(sale.returnFee)) };
    return { ...t, cogs, profit: round2(t.total - cogs - num(sale.courierFee)) };
  }

  function productPerformance(state, journal, from, to) {
    const rows = {};
    (state.sales || []).forEach((sale) => {
      if (!BOOKED.has(sale.status) || !inRange(sale.date, from, to)) return;
      const t = saleTotals(sale);
      const cogsLines = journal.inventory.saleCogs[sale.id] || [];
      const returned = sale.status === 'returned';
      (sale.items || []).forEach((it, i) => {
        const r = (rows[it.productId] = rows[it.productId] || { productId: it.productId, qty: 0, returnedQty: 0, promoQty: 0, promoCost: 0, revenue: 0, cogs: 0 });
        if (isPromo(sale)) { if (!returned) { r.promoQty += num(it.qty); r.promoCost += cogsLines[i] || 0; } return; }
        const lineGross = num(it.qty) * num(it.price);
        const lineNet = t.gross ? lineGross - (t.discount * lineGross) / t.gross : lineGross;
        if (returned) { r.returnedQty += num(it.qty); return; }
        r.qty += num(it.qty); r.revenue += lineNet; r.cogs += cogsLines[i] || 0;
      });
    });
    return Object.values(rows).map((r) => ({ ...r, promoCost: round2(r.promoCost), revenue: round2(r.revenue), cogs: round2(r.cogs), profit: round2(r.revenue - r.cogs), margin: r.revenue ? (r.revenue - r.cogs) / r.revenue : 0 })).sort((a, b) => b.profit - a.profit);
  }

  function channelPerformance(state, journal, from, to) {
    const rows = {};
    (state.sales || []).forEach((sale) => {
      if (!BOOKED.has(sale.status) || isPromo(sale) || !inRange(sale.date, from, to)) return;
      const r = (rows[sale.channel || 'other'] = rows[sale.channel || 'other'] || { channel: sale.channel || 'other', orders: 0, returned: 0, revenue: 0, profit: 0 });
      const p = saleProfit(sale, journal);
      r.orders += 1;
      if (sale.status === 'returned') r.returned += 1; else r.revenue += p.total;
      r.profit += p.profit;
    });
    return Object.values(rows).map((r) => ({ ...r, revenue: round2(r.revenue), profit: round2(r.profit) })).sort((a, b) => b.revenue - a.revenue);
  }

  function monthlySeries(state, journal, months, endMonth) {
    const out = [];
    let [y, m] = endMonth.split('-').map(Number);
    for (let i = 0; i < months; i++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      out.unshift(key);
      m -= 1; if (m === 0) { m = 12; y -= 1; }
    }
    return out.map((key) => {
      const last = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
      const is = incomeStatement(state, journal, `${key}-01`, `${key}-${String(last).padStart(2, '0')}`);
      return { month: key, netSales: is.netSales, grossProfit: is.grossProfit, netProfit: is.netProfit };
    });
  }

  // ---------- ربحية الحملات الإعلانية ----------
  // الإنفاق = مصروفات الإعلان المربوطة بالحملة + تكلفة فواتير الدعاية المربوطة بها
  function campaignPerformance(state, journal, from, to) {
    const blank = (c) => ({ id: c.id, name: c.name, platform: c.platform, budget: num(c.budget), spend: 0, adSpend: 0, promoCost: 0, orders: 0, delivered: 0, returned: 0, pending: 0, revenue: 0, grossProfit: 0 });
    const rows = {};
    (state.campaigns || []).forEach((c) => (rows[c.id] = blank(c)));
    const row = (id) => rows[id] || (rows[id] = blank({ id, name: 'حملة محذوفة', platform: 'other' }));
    (state.expenses || []).forEach((e) => {
      if (!e.campaignId || !inRange(e.date, from, to)) return;
      const r = row(e.campaignId); r.adSpend += num(e.amount);
    });
    (state.sales || []).forEach((sale) => {
      if (!sale.campaignId || !inRange(sale.date, from, to)) return;
      const r = row(sale.campaignId);
      if (isPromo(sale)) { if (BOOKED.has(sale.status)) r.promoCost += saleProfit(sale, journal).promoCost || 0; return; }
      if (sale.status === 'pending') { r.pending += 1; return; }
      if (!BOOKED.has(sale.status)) return;
      const p = saleProfit(sale, journal);
      r.orders += 1;
      if (sale.status === 'returned') r.returned += 1; else { r.revenue += p.total; if (sale.status === 'delivered') r.delivered += 1; }
      r.grossProfit += p.profit;
    });
    return Object.values(rows).map((r) => {
      const spend = round2(r.adSpend + r.promoCost);
      const kept = r.orders - r.returned;
      return {
        ...r, spend, adSpend: round2(r.adSpend), promoCost: round2(r.promoCost), revenue: round2(r.revenue), grossProfit: round2(r.grossProfit),
        netProfit: round2(r.grossProfit - spend), cpa: kept > 0 ? spend / kept : null, roas: spend > 0 ? r.revenue / spend : null,
        returnRate: r.orders ? r.returned / r.orders : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);
  }

  // ---------- الشركاء ----------
  function partnerAccounts(state, journal, asOf) {
    const out = {};
    (state.partners || []).forEach((p) => (out[p.id] = { id: p.id, name: p.name, share: num(p.share), capital: 0, distributed: 0, drawn: 0, balance: 0 }));
    journal.entries.forEach((e) => {
      if (asOf && e.date > asOf) return;
      e.lines.forEach((l) => {
        if (!l.party || l.party.type !== 'partner' || !out[l.party.id]) return;
        const r = out[l.party.id];
        if (l.acc === '3100') r.capital += l.cr - l.dr;
        if (l.acc === '3500') { r.distributed += l.cr; r.drawn += l.dr; }
      });
    });
    return Object.values(out).map((r) => ({ ...r, capital: round2(r.capital), distributed: round2(r.distributed), drawn: round2(r.drawn), balance: round2(r.distributed - r.drawn) }));
  }

  // حصة كل شريك من صافي ربح فترة، بعد نسبة محتجزة للنشاط وخصم ما وُزِّع من نفس الفترة قبل ذلك
  function distributionPlan(state, journal, from, to, retainPct) {
    const is = incomeStatement(state, journal, from, to);
    const already = round2((state.distributions || []).filter((d) => d.from === from && d.to === to)
      .reduce((a, d) => a + (d.allocations || []).reduce((x, y) => x + num(y.amount), 0), 0));
    const retained = round2(Math.max(is.netProfit, 0) * num(retainPct) / 100);
    const distributable = round2(Math.max(0, is.netProfit - retained - already));
    const partners = (state.partners || []).filter((p) => num(p.share) > 0);
    const shares = partners.reduce((a, p) => a + num(p.share), 0);
    let left = distributable;
    const allocations = partners.map((p, i) => {
      const amount = i === partners.length - 1 ? round2(left) : round2(distributable * num(p.share) / (shares || 1));
      left -= amount;
      return { partnerId: p.id, share: num(p.share), amount };
    });
    return { netProfit: is.netProfit, retained, already, distributable, shares: round2(shares), allocations };
  }

  const api = {
    COA, COA_MAP, EXPENSE_CATEGORIES, ADJ_REASONS, BOOKED, round2, cashCode, accountName, isPromo,
    saleTotals, shipmentCosting, computeInventory, computeSuppliers, buildJournal,
    trialBalance, incomeStatement, balanceSheet, ledger, cashBalances, courierBalances,
    saleProfit, productPerformance, channelPerformance, monthlySeries,
    campaignPerformance, partnerAccounts, distributionPlan,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Acc = api;
})(typeof window !== 'undefined' ? window : globalThis);
