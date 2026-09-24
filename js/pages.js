/* Florume — الشاشات */
(function () {
  'use strict';
  const { DB, UI, esc, fmt, money, pct, num, today, uid, CURRENCIES, COUNTRIES, CHANNELS, STATUSES, SHIP_STATUSES, ACCOUNT_TYPES, GENDERS } = F;
  const S = () => DB.state;
  const J = () => DB.journal;
  const main = () => document.getElementById('main');
  const money0 = (n) => `${fmt(Math.round(num(n)))} <span class="cur">ج.م</span>`;

  // ---------- الفترة المحاسبية ----------
  const monthEnd = (ym) => `${ym}-${String(new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate()).padStart(2, '0')}`;
  function presetRange(p) {
    const t = today(), ym = t.slice(0, 7);
    const prev = (() => { let [y, m] = ym.split('-').map(Number); m -= 1; if (!m) { m = 12; y -= 1; } return `${y}-${String(m).padStart(2, '0')}`; })();
    switch (p) {
      case 'month': return { from: `${ym}-01`, to: monthEnd(ym) };
      case 'lastMonth': return { from: `${prev}-01`, to: monthEnd(prev) };
      case 'quarter': { const d = new Date(t); d.setMonth(d.getMonth() - 2); return { from: d.toISOString().slice(0, 7) + '-01', to: monthEnd(ym) }; }
      case 'year': return { from: `${t.slice(0, 4)}-01-01`, to: `${t.slice(0, 4)}-12-31` };
      default: return { from: '', to: '' };
    }
  }
  let period = { preset: 'month', ...presetRange('month') };
  try { const saved = JSON.parse(localStorage.getItem('florume.period') || 'null'); if (saved && saved.preset) period = saved.preset === 'custom' ? saved : { preset: saved.preset, ...presetRange(saved.preset) }; } catch (e) { /* لا شيء */ }
  const PRESETS = { month: 'هذا الشهر', lastMonth: 'الشهر السابق', quarter: 'آخر ٣ شهور', year: 'هذا العام', all: 'كل الفترات', custom: 'فترة مخصصة' };
  function periodBar() {
    return `<div class="period" role="group" aria-label="الفترة">
      ${UI.select('period', PRESETS, period.preset, 'data-change="period"')}
      <input type="date" id="f-from" value="${period.from}" data-change="periodFrom" aria-label="من">
      <span class="muted">إلى</span>
      <input type="date" id="f-to" value="${period.to}" data-change="periodTo" aria-label="إلى">
    </div>`;
  }
  const inPeriod = (d) => (!period.from || d >= period.from) && (!period.to || d <= period.to);

  // ---------- أسماء ومساعدات ----------
  const productLabel = (p) => (p ? `${p.brand ? p.brand + ' — ' : ''}${p.name}${p.sizeMl ? ` ${p.sizeMl}مل` : ''}` : '—');
  const productById = (id) => DB.find('products', id);
  const nameOf = (list, id) => (DB.find(list, id) || {}).name || '—';
  const invoiceNo = (sale) => `${S().settings.invoicePrefix || ''}${sale.no || ''}`;
  const accountOptions = () => S().accounts.map((a) => ({ v: a.id, l: a.name }));
  const productOptions = () => [{ v: '', l: 'اختر المنتج…' }, ...S().products.map((p) => ({ v: p.id, l: productLabel(p) }))];
  const statusKind = { pending: 'warn', shipped: 'info', delivered: 'good', returned: 'bad', cancelled: 'mute', ordered: 'warn', transit: 'info', received: 'good' };
  const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '—');
  const table = (head, rows, opts = {}) => `<div class="table-wrap"><table class="${opts.cls || ''}"><thead><tr>${head.map((h) => `<th${/^#|num:/.test(h) ? ' class="num"' : h === '' ? ' class="act"' : ''}>${h.replace(/^(#|num:)/, '')}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="empty-row">${opts.empty || 'لا توجد بيانات بعد'}</td></tr>`}</tbody>${opts.foot ? `<tfoot>${opts.foot}</tfoot>` : ''}</table></div>`;
  const td = (v, cls = '') => `<td class="${cls}">${v}</td>`;
  const tdn = (v) => `<td class="num">${v}</td>`;
  const actions = (...btns) => `<td class="row-actions">${btns.join('')}</td>`;
  const btn = (label, action, id, cls = '') => `<button type="button" class="link-btn ${cls}" data-action="${action}" data-id="${id}">${label}</button>`;
  const header = (title, sub, buttons = '') => `<header class="page-head"><div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="page-actions">${buttons}</div></header>`;
  const kpi = (label, value, note = '', tone = '') => `<div class="kpi ${tone}"><span class="kpi-label">${label}</span><strong class="kpi-value">${value}</strong>${note ? `<span class="kpi-note">${note}</span>` : ''}</div>`;
  const used = (id, checks) => checks.some(([list, fn]) => S()[list].some((x) => fn(x, id)));
  const PARTY_LISTS = { supplier: 'suppliers', courier: 'couriers', partner: 'partners' };
  const partyName = (party) => nameOf(PARTY_LISTS[party.type] || 'couriers', party.id);
  const campaignOptions = (blank = 'بدون حملة') => [{ v: '', l: blank }, ...S().campaigns.map((c) => ({ v: c.id, l: `${c.name} (${CHANNELS[c.platform] || ''})` }))];
  const isPromo = (x) => Acc.isPromo(x);

  // ---------- قواعد الحفظ ----------
  const fail = (msg) => { UI.toast(msg, 'bad'); return false; };
  const dateOk = (d, label = 'التاريخ') => {
    if (!d) return fail(`أدخل ${label}`);
    if (RULES.beforeStart(S(), d)) return fail(`${label} ${fmtDate(d)} قبل تاريخ بداية الحسابات ${fmtDate(S().settings.startDate)} — غيّر بداية الحسابات من الإعدادات لو محتاج`);
    return true;
  };
  const stockMsg = (errs, status) => 'المخزون مش كفاية — ' + errs.map((e) => `${productLabel(productById(e.productId))}: المطلوب ${fmt(e.need)} والمتاح ${fmt(e.available)}${e.incoming ? (status && status !== 'pending' ? ` (فيه ${fmt(e.incoming)} جاي في شحنة — استلمها الأول قبل ما الطلب يخرج)` : ` (وفيه ${fmt(e.incoming)} جاي في شحنة، تقدر تسجله «قيد التجهيز» كطلب مسبق)`) : ''}`).join(' · ');
  // تحذير الخزينة بالسالب: أول ضغطة حفظ تعرض التحذير، والتانية تأكيد
  function cashOk(f, next) {
    const neg = RULES.negativeCash(S(), next);
    if (!neg.length) return true;
    const sig = neg.map((n) => `${n.id}:${n.after}`).join('|');
    if (f.dataset.cashOk === sig) return true;
    f.dataset.cashOk = sig;
    let box = f.querySelector('#cash-warn');
    if (!box) { f.querySelector('.modal-body').insertAdjacentHTML('afterbegin', '<div class="imp-box warn" id="cash-warn" role="alert"></div>'); box = f.querySelector('#cash-warn'); }
    box.innerHTML = `<b>تنبيه: رصيد ${neg.map((n) => `«${esc(n.name)}» هيبقى ${fmt(n.after)} ج.م`).join(' و')} بعد الحفظ.</b><br>لو الفلوس دخلت الحساب فعلًا ولسه ما اتسجلتش، اضغط «حفظ» تاني للتأكيد.`;
    box.scrollIntoView({ block: 'nearest' });
    UI.toast('الرصيد هيبقى بالسالب — راجع التنبيه واضغط حفظ تاني للتأكيد', 'bad');
    return false;
  }

  // ---------- رسم بياني بسيط بالأعمدة ----------
  function barChart(series, key, label) {
    const W = 560, H = 210, padL = 8, padR = 56, padT = 14, padB = 30;
    const vals = series.map((s) => s[key]);
    const maxV = Math.max(0, ...vals), minV = Math.min(0, ...vals);
    const nice = (v) => { if (!v) return 0; const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v)))); return Math.sign(v) * Math.ceil(Math.abs(v) / p) * p; };
    const top = nice(maxV) || 1, bottom = nice(minV);
    const y = (v) => padT + ((top - v) / (top - bottom)) * (H - padT - padB);
    const bw = (W - padL - padR) / series.length;
    const ticks = bottom < 0 ? (-bottom / (top - bottom) > 0.15 ? [top, 0, bottom] : [top, 0]) : [top, top / 2, 0];
    const col = (i) => series.length - 1 - i; // من اليمين لليسار
    const monthName = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('ar-EG', { month: 'short' });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">
      ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'axis' : 'grid'}"/><text x="${W - padR + 6}" y="${y(t) + 4}" class="tick" text-anchor="start">${t ? fmt(t / 1000, 1) + 'k' : '0'}</text>`).join('')}
      ${series.map((s, i) => {
        const v = s[key]; const x = padL + col(i) * bw + bw * 0.22; const w = bw * 0.56;
        const y0 = y(Math.max(v, 0)), h = Math.max(Math.abs(y(v) - y(0)), v ? 1.5 : 0);
        const cx = padL + col(i) * bw + bw / 2;
        return `<g class="bar-g" data-tip="${esc(monthName(s.month))} ${s.month.slice(0, 4)}: ${fmt(v)} ج.م">
          <rect x="${padL + col(i) * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" class="hit"/>
          <rect x="${x}" y="${y0}" width="${w}" height="${h}" rx="3" class="bar ${v < 0 ? 'neg' : ''} ${i === series.length - 1 ? 'last' : ''}"/>
          <text x="${cx}" y="${H - 10}" class="tick" text-anchor="middle">${esc(monthName(s.month))}</text></g>`;
      }).join('')}
    </svg>`;
  }

  // =====================================================================
  // لوحة التحكم
  // =====================================================================
  function dashboard() {
    const s = S(), j = J();
    const is = Acc.incomeStatement(s, j, period.from, period.to);
    const bs = Acc.balanceSheet(s, j, today());
    const sales = s.sales.filter((x) => inPeriod(x.date));
    const booked = sales.filter((x) => Acc.BOOKED.has(x.status) && !isPromo(x));
    const alertList = OPS.alerts(s, j, today(), s.settings.alerts);
    const returned = booked.filter((x) => x.status === 'returned').length;
    const courierBal = Object.values(Acc.courierBalances(s, j)).reduce((a, b) => a + b, 0);
    const supBal = Object.values(j.suppliers.balances).reduce((a, b) => a + b.egp, 0);
    const invValue = Object.values(j.inventory.products).reduce((a, b) => a + b.value, 0);
    const git = (bs.assets.find((a) => a.name === 'بضاعة في الطريق') || {}).amount || 0;
    const series = Acc.monthlySeries(s, j, 6, today().slice(0, 7));
    const low = s.products.map((p) => ({ p, st: j.inventory.products[p.id] })).filter((x) => x.st.available <= num(x.p.minStock ?? s.settings.lowStock)).slice(0, 6);
    const top = Acc.productPerformance(s, j, period.from, period.to).slice(0, 5);
    const pending = s.sales.filter((x) => x.status === 'pending' || x.status === 'shipped').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
    const aov = booked.length - returned ? is.netSales / (booked.length - returned) : 0;
    return `
      ${header('لوحة التحكم', `${esc(s.settings.businessName)} — ملخص ${PRESETS[period.preset]}`, periodBar())}
      <section class="kpis">
        ${kpi('صافي المبيعات', money0(is.netSales), `${booked.length - returned} طلب · متوسط الطلب ${fmt(aov, 0)} ج.م`)}
        ${kpi('مجمل الربح', money0(is.grossProfit), `هامش ${pct(is.grossMargin)}`)}
        ${kpi('المصروفات التشغيلية', money0(is.totalOpex), 'شحن وإعلانات وتغليف ورواتب')}
        ${kpi('صافي الربح', money0(is.netProfit), `هامش صافي ${pct(is.netMargin)}`, is.netProfit < 0 ? 'bad' : 'good')}
        ${kpi('نسبة المرتجع', pct(booked.length ? returned / booked.length : 0), `${returned} من ${booked.length} طلب`, booked.length && returned / booked.length > 0.15 ? 'bad' : '')}
      </section>
      <section class="position">
        <h2 class="section-title">المركز المالي اليوم</h2>
        <div class="pos-grid">
          <div><span>النقدية في كل الخزائن</span><b>${money0(bs.totalCash)}</b></div>
          <div><span>مستحق من شركات الشحن</span><b>${money0(courierBal)}</b></div>
          <div><span>المخزون بالتكلفة</span><b>${money0(invValue)}</b></div>
          <div><span>بضاعة في الطريق</span><b>${money0(git)}</b></div>
          <div><span>${supBal >= 0 ? 'مستحق للموردين' : 'دفعات مقدمة للموردين'}</span><b>${money0(Math.abs(supBal))}</b></div>
          <div class="strong"><span>حقوق الملكية</span><b>${money0(bs.totalEquity)}</b></div>
        </div>
      </section>
      <section class="grid-2">
        <div class="panel"><h2 class="section-title">صافي المبيعات — آخر ٦ شهور</h2>${barChart(series, 'netSales', 'صافي المبيعات الشهرية')}</div>
        <div class="panel"><h2 class="section-title">صافي الربح — آخر ٦ شهور</h2>${barChart(series, 'netProfit', 'صافي الربح الشهري')}</div>
      </section>
      ${alertList.length ? `<section class="panel alerts-panel"><h2 class="section-title">تنبيهات تحتاج متابعة <a class="link-btn" href="#alerts">عرض الكل (${alertList.length})</a></h2>${alertItems(alertList.slice(0, 5))}</section>` : ''}
      <section class="grid-3">
        <div class="panel"><h2 class="section-title">طلبات مفتوحة</h2>
          ${pending.length ? `<ul class="list">${pending.map((x) => `<li><button class="link-btn" data-action="viewSale" data-id="${x.id}">${esc(invoiceNo(x))}</button><span>${esc(nameOf('customers', x.customerId))}</span>${UI.pill(STATUSES[x.status], statusKind[x.status])}</li>`).join('')}</ul>` : UI.empty('لا توجد طلبات مفتوحة')}
        </div>
        <div class="panel"><h2 class="section-title">نواقص المخزون</h2>
          ${low.length ? `<ul class="list">${low.map((x) => `<li><span>${esc(productLabel(x.p))}</span><b class="${x.st.available <= 0 ? 'bad-text' : 'warn-text'}">${fmt(x.st.available)} متاح</b></li>`).join('')}</ul>` : UI.empty('كل المنتجات فوق حد الطلب')}
        </div>
        <div class="panel"><h2 class="section-title">الأكثر ربحًا في الفترة</h2>
          ${top.length ? `<ul class="list">${top.map((r) => `<li><span>${esc(productLabel(productById(r.productId)))}</span><b>${fmt(r.profit, 0)} ج.م</b></li>`).join('')}</ul>` : UI.empty('لا مبيعات في هذه الفترة')}
        </div>
      </section>`;
  }

  // =====================================================================
  // المبيعات
  // =====================================================================
  let saleFilter = { q: '', status: '', channel: '', kind: '' };
  function sales() {
    const s = S(), j = J();
    const q = saleFilter.q.trim().toLowerCase();
    const list = s.sales.filter((x) => inPeriod(x.date) && (!saleFilter.status || x.status === saleFilter.status) && (!saleFilter.channel || x.channel === saleFilter.channel)
      && (!saleFilter.kind || (saleFilter.kind === 'promo') === isPromo(x))
      && (!q || `${invoiceNo(x)} ${x.trackingNo || ''} ${nameOf('customers', x.customerId)} ${(DB.find('customers', x.customerId) || {}).phone || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.no - a.no));
    let tot = { total: 0, cogs: 0, profit: 0, promo: 0, promoCount: 0 };
    const rows = list.map((x) => {
      const p = Acc.saleProfit(x, j);
      const promo = isPromo(x);
      if (promo) { tot.promo += p.promoCost || 0; tot.promoCount++; }
      else {
        if (Acc.BOOKED.has(x.status) && x.status !== 'returned') { tot.total += p.total; tot.cogs += p.cogs; }
        tot.profit += p.profit;
      }
      return `<tr class="${promo ? 'promo-row' : ''}">
        ${td(`<button class="link-btn strong" data-action="viewSale" data-id="${x.id}">${esc(invoiceNo(x))}</button>${promo ? ' ' + UI.pill('دعاية', 'promo') : ''}${x.preorder && x.status === 'pending' ? ' ' + UI.pill('طلب مسبق', 'info') : ''}`)}${td(fmtDate(x.date))}
        ${td(esc(nameOf('customers', x.customerId)))}${td(CHANNELS[x.channel] || '—')}
        ${tdn(promo ? '—' : fmt(p.total))}${tdn(fmt(p.cogs))}${tdn(promo ? `<span class="muted">دعاية ${fmt(p.promoCost || 0)}</span>` : `<span class="${p.profit < 0 ? 'bad-text' : ''}">${fmt(p.profit)}</span>`)}
        ${td(promo ? 'بدون مقابل' : x.payment === 'cod' ? 'عند الاستلام' : esc(nameOf('accounts', x.payment)))}
        ${td(UI.select('st-' + x.id, STATUSES, x.status, `class="status-select s-${x.status}" data-change="saleStatus" data-id="${x.id}" aria-label="الحالة"`))}
        ${actions(waButton(x), btn('تعديل', 'editSale', x.id), btn('حذف', 'delSale', x.id, 'danger'))}</tr>`;
    });
    return `
      ${header('المبيعات والطلبات', 'كل طلب يُسجَّل كإيراد عند خروجه مع شركة الشحن، وتُحسب تكلفته بمتوسط تكلفة المخزون.', `${periodBar()}<button class="btn" data-action="newPromo">+ فاتورة دعاية</button><button class="btn btn-primary" data-action="newSale">+ طلب جديد</button>`)}
      <div class="filters">
        <input type="search" id="f-q" placeholder="بحث برقم الفاتورة أو البوليصة أو العميل أو الموبايل" value="${esc(saleFilter.q)}" data-input="saleQ">
        ${UI.select('fkind', { '': 'كل الفواتير', sale: 'فواتير بيع', promo: 'فواتير دعاية' }, saleFilter.kind, 'data-change="saleKindFilter" aria-label="نوع الفاتورة"')}
        ${UI.select('fstatus', { '': 'كل الحالات', ...STATUSES }, saleFilter.status, 'data-change="saleStatusFilter" aria-label="الحالة"')}
        ${UI.select('fchannel', { '': 'كل القنوات', ...CHANNELS }, saleFilter.channel, 'data-change="saleChannelFilter" aria-label="القناة"')}
      </div>
      ${table(['الفاتورة', 'التاريخ', 'العميل', 'القناة', '#الإجمالي', '#التكلفة', '#الربح', 'الدفع', 'الحالة', ''], rows, {
        empty: 'لا توجد طلبات في هذه الفترة',
        foot: rows.length ? `<tr><td colspan="4">إجمالي البيع (${rows.length - tot.promoCount} طلب)</td>${tdn(fmt(tot.total))}${tdn(fmt(tot.cogs))}${tdn(fmt(tot.profit))}<td colspan="3"></td></tr>${tot.promoCount ? `<tr><td colspan="4">فواتير دعاية (${tot.promoCount}) — محملة على مصروف الإعلانات</td><td></td><td></td>${tdn(fmt(tot.promo))}<td colspan="3"></td></tr>` : ''}` : '',
      })}`;
  }

  function saleLineRow(it = {}) {
    const st = it.productId ? J().inventory.products[it.productId] : null;
    return `<tr class="line">
      <td>${UI.select('l-product', productOptions(), it.productId || '', 'class="l-product" aria-label="المنتج"')}<small class="l-stock muted">${st ? `متاح: ${fmt(st.available)}` : ''}</small></td>
      <td><input class="l-qty" type="number" min="1" step="1" value="${it.qty || 1}" aria-label="الكمية"></td>
      <td class="col-price"><input class="l-price" type="number" min="0" step="0.01" value="${it.price ?? ''}" aria-label="السعر"></td>
      <td class="col-cost num l-unitcost">0</td>
      <td class="num l-total">0</td>
      <td><button type="button" class="icon-btn" data-line-remove aria-label="حذف السطر">✕</button></td></tr>`;
  }

  // خانة مسح الباركود: قارئ باركود USB (يكتب الكود ثم Enter) أو كاميرا الموبايل لو المتصفح يدعمها
  const scanBox = (placeholder = 'امسح الباركود أو اكتب كود المنتج ثم Enter') => `<div class="scan-row"><input class="scan-input" id="f-scan" placeholder="${placeholder}" autocomplete="off" aria-label="مسح الباركود"><button type="button" class="btn btn-small scan-cam">كاميرا</button></div><video class="scan-video" playsinline muted hidden></video>`;
  function attachScanner(f, onCode) {
    const input = f.querySelector('.scan-input');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = input.value.trim(); input.value = ''; if (v) onCode(v); } });
    const cam = f.querySelector('.scan-cam'), video = f.querySelector('.scan-video');
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) { cam.hidden = true; return; }
    let stream = null, timer = null;
    const stop = () => { clearInterval(timer); timer = null; if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; video.hidden = true; cam.textContent = 'كاميرا'; };
    cam.addEventListener('click', async () => {
      if (stream) return stop();
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        const det = new window.BarcodeDetector({ formats: formats.length ? formats : undefined });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream; video.hidden = false; await video.play(); cam.textContent = 'إيقاف الكاميرا';
        let last = '', lastAt = 0;
        timer = setInterval(async () => {
          try { const codes = await det.detect(video); const v = codes[0] && codes[0].rawValue; if (v && (v !== last || Date.now() - lastAt > 1500)) { last = v; lastAt = Date.now(); onCode(v); } } catch (e) { /* إطار غير جاهز */ }
        }, 300);
      } catch (e) { stop(); UI.toast('تعذر تشغيل الكاميرا — استخدم قارئ الباركود أو اكتب الكود', 'bad'); }
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(f)) { stop(); obs.disconnect(); } });
    obs.observe(document.getElementById('modal'), { childList: true });
  }

  function saleForm(sale, kind) {
    const s = S();
    const isNew = !sale;
    sale = sale || { id: uid(), kind: kind === 'promo' ? 'promo' : 'sale', date: today(), channel: 'instagram', status: 'pending', payment: 'cod', courierId: (s.couriers[0] || {}).id, courierFee: 0, shippingCharged: 0, discount: 0, items: [{ qty: 1 }], returnFee: 0, campaignId: '', trackingNo: '' };
    const custOpts = [{ v: '', l: 'اختر العميل…' }, { v: '__new', l: '+ عميل جديد' }, ...s.customers.map((c) => ({ v: c.id, l: `${c.name}${c.phone ? ' — ' + c.phone : ''}` }))];
    const locked = !isNew && RULES.isReconciled(s, sale.id);
    const body = `
      ${locked ? '<div class="imp-box warn"><b>الفاتورة دي دخلت في تسوية كشف شركة الشحن.</b> تقدر تعدّل العميل والقناة والحملة والملاحظات بس. لتعديل الباقي احذف التسوية الأول من شاشة «تسوية شركات الشحن».</div>' : ''}
      <div class="form-grid">
        ${UI.field('نوع الفاتورة', UI.select('kind', { sale: 'فاتورة بيع', promo: 'فاتورة دعاية (قطع مجانية)' }, isPromo(sale) ? 'promo' : 'sale'))}
        ${UI.field('التاريخ', UI.input('date', sale.date, 'type="date" required'), { req: true })}
        ${UI.field('العميل / المستلم', UI.select('customerId', custOpts, sale.customerId || ''), {})}
        ${UI.field('القناة', UI.select('channel', CHANNELS, sale.channel))}
        ${UI.field('الحالة', UI.select('status', STATUSES, sale.status))}
        ${UI.field('الحملة الإعلانية', UI.select('campaignId', campaignOptions(), sale.campaignId || ''), { hint: 'الطلب جه من أنهي حملة؟' })}
      </div>
      <p class="promo-note" hidden>فاتورة الدعاية تُخرج القطع من المخزون بتكلفتها، ولا تُحسب مبيعات. التكلفة ومصاريف شحنها تروح على <b>مصروف الإعلانات والتسويق</b>${s.campaigns.length ? ' (ولو ربطتها بحملة تدخل في إنفاق الحملة)' : ''}.</p>
      <div class="form-grid new-customer" hidden>
        ${UI.field('اسم العميل', UI.input('cName', ''), { req: true })}
        ${UI.field('الموبايل', UI.input('cPhone', '', 'inputmode="tel"'))}
        ${UI.field('المحافظة / المدينة', UI.input('cCity', ''))}
        ${UI.field('العنوان', UI.input('cAddress', ''))}
      </div>
      ${scanBox()}
      <div class="table-wrap"><table class="lines"><thead><tr><th>المنتج</th><th>الكمية</th><th class="col-price">سعر البيع</th><th class="col-cost num">تكلفة الوحدة</th><th class="num">الإجمالي</th><th></th></tr></thead>
        <tbody id="lines">${sale.items.map(saleLineRow).join('')}</tbody></table></div>
      <button type="button" class="btn btn-small" id="add-line">+ إضافة صنف</button>
      <div class="form-grid">
        ${UI.field('خصم (ج.م)', UI.input('discount', sale.discount || 0, 'type="number" min="0" step="0.01"'), { cls: 'sale-only' })}
        ${UI.field('شحن محصل من العميل', UI.input('shippingCharged', sale.shippingCharged || 0, 'type="number" min="0" step="0.01"'), { cls: 'sale-only' })}
        ${UI.field('طريقة الدفع', UI.select('payment', [{ v: 'cod', l: 'الدفع عند الاستلام (مع شركة الشحن)' }, ...accountOptions().map((a) => ({ v: a.v, l: 'مدفوع مقدمًا — ' + a.l }))], sale.payment), { cls: 'sale-only' })}
        ${UI.field('شركة الشحن', UI.select('courierId', [{ v: '', l: '—' }, ...s.couriers.map((c) => ({ v: c.id, l: c.name }))], sale.courierId || ''))}
        ${UI.field('رقم البوليصة', UI.input('trackingNo', sale.trackingNo || '', 'dir="ltr" autocomplete="off"'), { hint: 'يُستخدم في مطابقة كشف شركة الشحن' })}
        ${UI.field('تكلفة الشحن علينا', UI.input('courierFee', sale.courierFee || 0, 'type="number" min="0" step="0.01"'), { hint: 'تخصمها شركة الشحن من التحصيل' })}
      </div>
      <div class="form-grid return-fields" hidden>
        ${UI.field('تاريخ المرتجع', UI.input('returnDate', sale.returnDate || today(), 'type="date"'))}
        ${UI.field('مصاريف المرتجع', UI.input('returnFee', sale.returnFee || 0, 'type="number" min="0" step="0.01"'))}
      </div>
      ${UI.field('ملاحظات', `<textarea id="f-notes" name="notes" rows="2">${esc(sale.notes || '')}</textarea>`)}
      <div class="summary" id="sale-summary"></div>`;
    UI.modal({
      title: isNew ? (isPromo(sale) ? 'فاتورة دعاية جديدة' : 'طلب جديد') : `تعديل ${isPromo(sale) ? 'فاتورة الدعاية' : 'الطلب'} ${esc(invoiceNo(sale))}`, body, wide: true,
      onOpen(f) {
        const lines = f.querySelector('#lines');
        const promoMode = () => f.kind.value === 'promo';
        const recalc = () => {
          const promo = promoMode();
          let gross = 0, cost = 0;
          lines.querySelectorAll('.line').forEach((r) => {
            const pid = r.querySelector('.l-product').value; const q = num(r.querySelector('.l-qty').value); const pr = num(r.querySelector('.l-price').value);
            const st = pid && J().inventory.products[pid];
            const unit = st ? st.avgCost : 0;
            gross += q * pr; cost += q * unit;
            r.querySelector('.l-unitcost').textContent = fmt(unit);
            r.querySelector('.l-total').textContent = fmt(promo ? q * unit : q * pr);
            r.querySelector('.l-stock').textContent = st ? `متاح: ${fmt(st.available)} · تكلفة ${fmt(st.avgCost, 0)}` : '';
          });
          const fee = num(f.courierFee.value);
          if (promo) {
            f.querySelector('#sale-summary').innerHTML = `<div><span>تكلفة القطع</span><b>${fmt(cost)}</b></div><div><span>شحن علينا</span><b>${fmt(fee)}</b></div><div class="strong"><span>يُحمَّل على مصروف الدعاية</span><b>${fmt(cost + fee)} ج.م</b></div><div><span>المطلوب من المستلم</span><b>0</b></div>`;
            return;
          }
          const disc = num(f.discount.value), ship = num(f.shippingCharged.value);
          const total = gross - disc + ship;
          const profit = total - cost - fee;
          f.querySelector('#sale-summary').innerHTML = `<div><span>إجمالي الأصناف</span><b>${fmt(gross)}</b></div><div><span>الخصم</span><b>${fmt(disc)}</b></div><div><span>شحن محصل</span><b>${fmt(ship)}</b></div><div class="strong"><span>المطلوب من العميل</span><b>${fmt(total)} ج.م</b></div><div><span>التكلفة المتوقعة</span><b>${fmt(cost)}</b></div><div class="${profit < 0 ? 'bad-text' : 'good-text'}"><span>الربح المتوقع</span><b>${fmt(profit)}</b></div>`;
        };
        const addProduct = (p) => {
          const rows = [...lines.querySelectorAll('.line')];
          const same = rows.find((r) => r.querySelector('.l-product').value === p.id);
          if (same) { const q = same.querySelector('.l-qty'); q.value = num(q.value) + 1; }
          else {
            let row = rows.find((r) => !r.querySelector('.l-product').value);
            if (!row) { lines.insertAdjacentHTML('beforeend', saleLineRow({ qty: 1 })); row = lines.lastElementChild; }
            row.querySelector('.l-product').value = p.id;
            row.querySelector('.l-price').value = p.price || '';
          }
          recalc();
          UI.toast(`+1 ${productLabel(p)}`);
        };
        attachScanner(f, (code) => { const p = OPS.findByCode(S().products, code); if (p) addProduct(p); else UI.toast(`مفيش منتج بالكود «${code}»`, 'bad'); });
        f.querySelector('#add-line').addEventListener('click', () => { lines.insertAdjacentHTML('beforeend', saleLineRow({ qty: 1 })); recalc(); });
        lines.addEventListener('click', (e) => { if (e.target.closest('[data-line-remove]') && lines.children.length > 1) { e.target.closest('tr').remove(); recalc(); } });
        lines.addEventListener('change', (e) => {
          if (e.target.classList.contains('l-product')) { const p = productById(e.target.value); const pr = e.target.closest('tr').querySelector('.l-price'); if (p && !num(pr.value)) pr.value = p.price || ''; }
          recalc();
        });
        f.addEventListener('input', recalc);
        const toggle = () => {
          const promo = promoMode();
          f.classList.toggle('promo-mode', promo);
          f.querySelector('.promo-note').hidden = !promo;
          f.querySelectorAll('.sale-only').forEach((el) => (el.hidden = promo));
          f.querySelector('.new-customer').hidden = f.customerId.value !== '__new';
          f.querySelector('#f-cName').required = f.customerId.value === '__new';
          f.querySelector('.return-fields').hidden = f.status.value !== 'returned';
          recalc();
        };
        f.customerId.addEventListener('change', toggle); f.status.addEventListener('change', toggle); f.kind.addEventListener('change', toggle);
        toggle();
      },
      onSubmit(f, fd) {
        const promo = fd.get('kind') === 'promo';
        const lines = [...f.querySelectorAll('#lines .line')].map((r) => ({ productId: r.querySelector('.l-product').value, qty: num(r.querySelector('.l-qty').value), price: promo ? 0 : num(r.querySelector('.l-price').value) })).filter((l) => l.productId && l.qty > 0);
        if (!lines.length) return fail('أضف صنفًا واحدًا على الأقل');
        const merged = RULES.mergeLines(lines);
        if (merged.conflicts.length) return fail(`${merged.conflicts.map((id) => productLabel(productById(id))).join('، ')} متكرر في أكتر من سطر بأسعار مختلفة — خليه سطر واحد`);
        const status = fd.get('status');
        const obj = { ...sale, kind: promo ? 'promo' : 'sale', date: fd.get('date'), customerId: fd.get('customerId'), channel: fd.get('channel'), status, items: merged.items, campaignId: fd.get('campaignId'), trackingNo: fd.get('trackingNo').trim(),
          discount: promo ? 0 : num(fd.get('discount')), shippingCharged: promo ? 0 : num(fd.get('shippingCharged')), payment: promo ? 'cod' : fd.get('payment'),
          courierId: fd.get('courierId'), courierFee: num(fd.get('courierFee')), returnDate: status === 'returned' ? fd.get('returnDate') : '', returnFee: status === 'returned' ? num(fd.get('returnFee')) : 0, notes: fd.get('notes') };
        if (!dateOk(obj.date, 'تاريخ الفاتورة')) return false;
        const dErr = RULES.saleDateError(obj);
        if (dErr) return fail(dErr);
        const disc = RULES.discountError(obj);
        if (disc) return fail(`الخصم ${fmt(disc.discount)} أكبر من قيمة الأصناف ${fmt(disc.gross)}`);
        const dupTrack = RULES.trackingTaken(S(), obj.trackingNo, obj.id);
        if (dupTrack) return fail(`رقم البوليصة ${obj.trackingNo} مسجل قبل كده على فاتورة ${invoiceNo(dupTrack)}`);
        const lockedChanges = RULES.lockedSaleChanges(S(), isNew ? null : sale, obj);
        if (lockedChanges.length) return fail(`الفاتورة داخلة في تسوية كشف شركة الشحن — مينفعش تغيّر: ${lockedChanges.join('، ')}`);
        const stock = RULES.checkSaleStock(S(), J(), obj, isNew ? null : sale);
        if (stock.errors.length) return fail(stockMsg(stock.errors, obj.status));
        obj.preorder = stock.preorder;
        if (isNew) obj.no = RULES.nextFreeInvoiceNo(S());
        if (!cashOk(f, RULES.withDoc(S(), 'sales', obj))) return false;
        if (obj.customerId === '__new') {
          const c = { id: uid(), name: fd.get('cName').trim(), phone: fd.get('cPhone').trim(), city: fd.get('cCity').trim(), address: fd.get('cAddress').trim() };
          S().customers.push(c); obj.customerId = c.id;
        }
        if (isNew) S().settings.nextInvoiceNo = obj.no + 1;
        if (merged.merged) UI.toast('المنتج المتكرر اتجمع في سطر واحد');
        if (stock.preorder) UI.toast('اتسجل كطلب مسبق — البضاعة جاية في شحنة في الطريق');
        DB.upsert('sales', obj);
        UI.toast(isNew ? `تم تسجيل ${promo ? 'فاتورة الدعاية' : 'الطلب'} ${invoiceNo(obj)}` : 'تم حفظ التعديلات');
        render();
      },
    });
  }

  // تكلفة كل سطر: الفعلية لو الفاتورة خرجت، والمتوسط الحالي لو لسه قيد التجهيز
  const lineCosts = (sale) => {
    const booked = J().inventory.saleCogs[sale.id];
    return sale.items.map((it, i) => (booked && booked[i] != null ? booked[i] : num(it.qty) * ((J().inventory.products[it.productId] || {}).avgCost || 0)));
  };

  // نص الفاتورة لواتساب
  function waText(sale) {
    const s = S(), c = DB.find('customers', sale.customerId) || {};
    const t = Acc.saleTotals(sale);
    const lines = [`مرحبًا ${c.name || ''} 👋`];
    if (isPromo(sale)) {
      lines.push(`هدية من ${s.settings.businessName} 🎁`, '');
      sale.items.forEach((it) => lines.push(`• ${productLabel(productById(it.productId))} × ${fmt(it.qty)}`));
    } else {
      lines.push(`فاتورة ${invoiceNo(sale)} من ${s.settings.businessName}`, `التاريخ: ${fmtDate(sale.date)}`, '');
      sale.items.forEach((it) => lines.push(`• ${productLabel(productById(it.productId))} × ${fmt(it.qty)} = ${fmt(it.qty * it.price)} ج.م`));
      lines.push('', `إجمالي الأصناف: ${fmt(t.gross)} ج.م`);
      if (t.discount) lines.push(`الخصم: -${fmt(t.discount)} ج.م`);
      if (t.shipping) lines.push(`الشحن: ${fmt(t.shipping)} ج.م`);
      lines.push(`*المطلوب: ${fmt(t.total)} ج.م*${sale.payment === 'cod' ? ' (الدفع عند الاستلام)' : ' (مدفوع مقدمًا ✅)'}`);
    }
    if (sale.courierId) lines.push('', `الشحن مع ${nameOf('couriers', sale.courierId)}${sale.trackingNo ? ' — رقم البوليصة ' + sale.trackingNo : ''}`);
    if (s.settings.waFooter) lines.push('', s.settings.waFooter);
    return lines.join('\n');
  }
  function waButton(sale, cls = 'link-btn') {
    const c = DB.find('customers', sale.customerId) || {};
    if (!OPS.waPhone(c.phone)) return '';
    return `<a class="${cls}" href="${esc(OPS.waLink(c.phone, waText(sale)))}" target="_blank" rel="noopener" title="إرسال الفاتورة على واتساب">واتساب</a>`;
  }

  function viewSale(sale) {
    const s = S();
    const c = DB.find('customers', sale.customerId) || {};
    const p = Acc.saleProfit(sale, J());
    const promo = isPromo(sale);
    const costs = lineCosts(sale);
    const promoTotal = costs.reduce((a, x) => a + x, 0);
    const itemsTable = promo
      ? table(['الصنف', '#الكمية', '#تكلفة الوحدة', '#الإجمالي بالتكلفة'], sale.items.map((it, i) => `<tr>${td(esc(productLabel(productById(it.productId))))}${tdn(fmt(it.qty))}${tdn(fmt(it.qty ? costs[i] / it.qty : 0))}${tdn(fmt(costs[i]))}</tr>`), {
        foot: `<tr><td colspan="3">قيمة القطع بالتكلفة</td>${tdn(fmt(promoTotal))}</tr>${num(sale.courierFee) ? `<tr><td colspan="3">مصاريف الشحن علينا</td>${tdn(fmt(sale.courierFee))}</tr>` : ''}<tr class="grand"><td colspan="3">المطلوب من المستلم</td>${tdn('0 ج.م — هدية دعائية')}</tr>`,
      })
      : table(['الصنف', '#الكمية', '#السعر', '#الإجمالي'], sale.items.map((it) => `<tr>${td(esc(productLabel(productById(it.productId))))}${tdn(fmt(it.qty))}${tdn(fmt(it.price))}${tdn(fmt(it.qty * it.price))}</tr>`), {
        foot: `<tr><td colspan="3">إجمالي الأصناف</td>${tdn(fmt(p.gross))}</tr>${p.discount ? `<tr><td colspan="3">خصم</td>${tdn('-' + fmt(p.discount))}</tr>` : ''}${p.shipping ? `<tr><td colspan="3">مصاريف الشحن</td>${tdn(fmt(p.shipping))}</tr>` : ''}<tr class="grand"><td colspan="3">المطلوب</td>${tdn(fmt(p.total) + ' ج.م')}</tr>`,
      });
    const title = `${promo ? 'فاتورة دعاية' : 'فاتورة'} ${invoiceNo(sale)}`;
    const body = `
      <article class="invoice">
        <header class="inv-head"><div><div class="brand-mark">${esc(s.settings.businessName)}</div><small class="muted">${esc(s.settings.businessPhone || '')}</small></div>
          <div class="inv-meta"><b>${esc(title)}</b><span>${fmtDate(sale.date)}</span>${UI.pill(STATUSES[sale.status], statusKind[sale.status])}</div></header>
        <div class="inv-party"><span class="muted">${promo ? 'المستلم' : 'العميل'}</span><b>${esc(c.name || '—')}</b><span>${esc(c.phone || '')}</span><span>${esc([c.city, c.address].filter(Boolean).join(' — '))}</span></div>
        ${itemsTable}
        <p class="muted">${promo ? 'قطع مجانية لأغراض الدعاية — بدون مقابل' : `الدفع: ${sale.payment === 'cod' ? 'عند الاستلام' : 'مدفوع مقدمًا — ' + esc(nameOf('accounts', sale.payment))}`} · الشحن: ${esc(nameOf('couriers', sale.courierId))}${sale.trackingNo ? ` · بوليصة <span class="mono">${esc(sale.trackingNo)}</span>` : ''}</p>
        ${sale.notes ? `<p>${esc(sale.notes)}</p>` : ''}
      </article>
      <div class="internal"><span>داخلي — لا يظهر للعميل:</span> ${promo
        ? `يُحمَّل على مصروف الإعلانات <b class="bad-text">${fmt(Acc.BOOKED.has(sale.status) ? p.promoCost : promoTotal + num(sale.courierFee))} ج.م</b>${Acc.BOOKED.has(sale.status) ? '' : ' (تقديري — يتسجل لما تخرج الفاتورة مع الشحن)'}`
        : `التكلفة ${fmt(p.cogs)} · شحن علينا ${fmt(sale.courierFee)} · الربح <b class="${p.profit < 0 ? 'bad-text' : 'good-text'}">${fmt(p.profit)} ج.م</b>`}${sale.campaignId ? ` · الحملة: ${esc(nameOf('campaigns', sale.campaignId))}` : ''}</div>`;
    UI.modal({ title: esc(title), body, wide: true,
      tools: { title, target: '.invoice', invoice: true, file: `invoice-${invoiceNo(sale)}` },
      footer: `${waButton(sale, 'btn btn-wa') || '<span class="muted small-note">سجّل موبايل العميل لإرسال الفاتورة على واتساب</span>'}<button type="button" class="btn" id="edit-btn">تعديل</button><button type="button" class="btn" data-close>إغلاق</button>`,
      onOpen(f) {
        f.querySelector('#edit-btn').addEventListener('click', () => saleForm(sale));
      } });
  }

  // =====================================================================
  // شحنات الاستيراد
  // =====================================================================
  function shipments() {
    const s = S();
    const rows = [...s.shipments].sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1)).map((sh) => {
      const c = Acc.shipmentCosting(sh);
      return `<tr>${td(`<button class="link-btn strong" data-action="editShipment" data-id="${sh.id}">${esc(sh.ref || '—')}</button>`)}${td(esc(nameOf('suppliers', sh.supplierId)))}${td(fmtDate(sh.orderDate))}
        ${tdn(`${fmt(c.goodsForeign)} <span class="cur">${sh.currency}</span>`)}${tdn(fmt(c.rate, 4))}${tdn(fmt(c.goodsEGP))}${tdn(fmt(c.extras))}${tdn(`<b>${fmt(c.landedTotal)}</b>`)}${tdn(fmt(c.totalQty))}
        ${td(UI.pill(SHIP_STATUSES[sh.status], statusKind[sh.status]))}
        ${actions(sh.status !== 'received' && sh.status !== 'cancelled' ? btn('استلام', 'receiveShipment', sh.id) : '', btn('تكلفة الوحدة', 'landedShipment', sh.id), btn('حذف', 'delShipment', sh.id, 'danger'))}</tr>`;
    });
    return `${header('شحنات الاستيراد', 'سعر الصرف ومصاريف الشحن والجمارك تتوزع على الأصناف بنسبة قيمتها لتعطيك تكلفة الوحدة الحقيقية بالجنيه.', '<button class="btn btn-primary" data-action="newShipment">+ شحنة جديدة</button>')}
      ${table(['المرجع', 'المورد', 'تاريخ الطلب', '#قيمة البضاعة', '#سعر الصرف', '#القيمة بالجنيه', '#مصاريف إضافية', '#التكلفة الكلية', '#القطع', 'الحالة', ''], rows, { empty: 'لم تسجل أي شحنة بعد. ابدأ بإضافة مورد ثم شحنة.' })}`;
  }

  function shipLineRow(it = {}) {
    return `<tr class="line"><td>${UI.select('l-product', productOptions(), it.productId || '', 'class="l-product" aria-label="المنتج"')}</td>
      <td><input class="l-qty" type="number" min="1" step="1" value="${it.qty || 1}" aria-label="الكمية"></td>
      <td><input class="l-cost" type="number" min="0" step="0.01" value="${it.unitCost ?? ''}" aria-label="سعر الوحدة"></td>
      <td class="num l-egp">0</td><td class="num l-landed">0</td>
      <td><button type="button" class="icon-btn" data-line-remove aria-label="حذف السطر">✕</button></td></tr>`;
  }
  function costRow(c = {}) {
    return `<tr class="cost"><td><input class="c-label" value="${esc(c.label || '')}" placeholder="شحن وجمارك" aria-label="البند"></td>
      <td><input class="c-amount" type="number" min="0" step="0.01" value="${c.amount ?? ''}" aria-label="المبلغ بالجنيه"></td>
      <td>${UI.select('c-basis', Acc.COST_BASES, c.basis || 'weight', 'class="c-basis" aria-label="يتوزع حسب"')}</td>
      <td>${UI.select('c-account', accountOptions(), c.accountId || (S().accounts[0] || {}).id, 'class="c-account" aria-label="دُفع من"')}</td>
      <td><input class="c-date" type="date" value="${c.date || ''}" aria-label="تاريخ الدفع"></td>
      <td><button type="button" class="icon-btn" data-line-remove aria-label="حذف السطر">✕</button></td></tr>`;
  }

  function shipmentForm(sh) {
    const s = S();
    if (!s.suppliers.length) { UI.toast('أضف موردًا أولًا من شاشة الموردين', 'bad'); location.hash = 'suppliers'; return; }
    const isNew = !sh;
    const sup0 = s.suppliers[0];
    sh = sh || { id: uid(), ref: '', supplierId: sup0.id, currency: sup0.currency, rate: s.settings.rates[sup0.currency] || 1, orderDate: today(), status: 'ordered', receivedDate: '', items: [{ qty: 1 }], costs: [{ label: 'شحن وجمارك', basis: 'weight' }], notes: '' };
    const body = `
      <div class="form-grid">
        ${UI.field('رقم / مرجع الشحنة', UI.input('ref', sh.ref, 'placeholder="مثال: SA-2610"'))}
        ${UI.field('المورد', UI.select('supplierId', s.suppliers.map((x) => ({ v: x.id, l: `${x.name} (${COUNTRIES[x.country] || ''})` })), sh.supplierId), { req: true })}
        ${UI.field('عملة الفاتورة', UI.select('currency', CURRENCIES, sh.currency))}
        ${UI.field('سعر الصرف (جنيه لكل وحدة)', UI.input('rate', sh.rate, 'type="number" min="0" step="0.0001" required'), { req: true, hint: 'السعر الذي حوّلت به فعليًا' })}
        ${UI.field('تاريخ الطلب', UI.input('orderDate', sh.orderDate, 'type="date" required'), { req: true })}
        ${UI.field('الحالة', UI.select('status', SHIP_STATUSES, sh.status))}
        ${UI.field('تاريخ الاستلام', UI.input('receivedDate', sh.receivedDate || today(), 'type="date"'), { cls: 'recv-field' })}
        ${UI.field('ميعاد سداد المورد', UI.input('dueDate', sh.dueDate || '', 'type="date"'), { hint: 'هيظهرلك تنبيه قبل الميعاد لو لسه عليك رصيد' })}
      </div>
      <h3 class="sub-title">الأصناف (بسعر المورد)</h3>
      <div class="table-wrap"><table class="lines"><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة <span class="cur-label"></span></th><th class="num">بالجنيه</th><th class="num">تكلفة الوحدة الواصلة</th><th></th></tr></thead>
        <tbody id="lines">${sh.items.map(shipLineRow).join('')}</tbody></table></div>
      <button type="button" class="btn btn-small" id="add-line">+ إضافة صنف</button>
      <h3 class="sub-title">مصاريف الشحن والجمارك بالجنيه</h3>
      <p class="muted">لو بتدفع الشحن والجمارك مع بعض، سجّلهم في سطر واحد. «الوزن / الحجم» بيدي القطعة الكبيرة نصيب أكبر: بياخد وزن الشحن من المنتج، ولو مش متسجل ياخد حجمه بالمللي، والبوكس بيتحسب بمجموع قطعه.</p>
      <div class="table-wrap"><table class="lines"><thead><tr><th>البند</th><th>المبلغ</th><th>يتوزع حسب</th><th>دُفع من</th><th>تاريخ الدفع</th><th></th></tr></thead>
        <tbody id="costs">${sh.costs.map(costRow).join('')}</tbody></table></div>
      <button type="button" class="btn btn-small" id="add-cost">+ إضافة مصروف</button>
      <div class="imp-box warn" id="weight-warn" hidden></div>
      ${UI.field('ملاحظات', `<textarea id="f-notes" name="notes" rows="2">${esc(sh.notes || '')}</textarea>`)}
      <div class="summary" id="ship-summary"></div>`;
    const read = (f) => ({
      ...sh, ref: f.ref.value.trim(), supplierId: f.supplierId.value, currency: f.currency.value, rate: num(f.rate.value), orderDate: f.orderDate.value, status: f.status.value,
      receivedDate: f.status.value === 'received' ? f.receivedDate.value : '', dueDate: f.dueDate.value, notes: f.notes.value,
      items: [...f.querySelectorAll('#lines .line')].map((r) => ({ productId: r.querySelector('.l-product').value, qty: num(r.querySelector('.l-qty').value), unitCost: num(r.querySelector('.l-cost').value) })).filter((l) => l.productId && l.qty > 0),
      costs: [...f.querySelectorAll('#costs .cost')].map((r) => ({ label: r.querySelector('.c-label').value.trim() || 'شحن وجمارك', amount: num(r.querySelector('.c-amount').value), basis: r.querySelector('.c-basis').value, accountId: r.querySelector('.c-account').value, date: r.querySelector('.c-date').value })).filter((c) => c.amount > 0),
    });
    UI.modal({
      title: isNew ? 'شحنة استيراد جديدة' : `تعديل الشحنة ${esc(sh.ref)}`, body, wide: true,
      onOpen(f) {
        const lines = f.querySelector('#lines'), costs = f.querySelector('#costs');
        const recalc = () => {
          const draft = read(f);
          const allRows = [...lines.querySelectorAll('.line')];
          const c = Acc.shipmentCosting({ ...draft, items: allRows.map((r) => ({ productId: r.querySelector('.l-product').value, qty: num(r.querySelector('.l-qty').value), unitCost: num(r.querySelector('.l-cost').value) })) }, S().products);
          const ww = f.querySelector('#weight-warn');
          const byWeight = c.costs.some((x) => x.basis === 'weight');
          ww.hidden = !(byWeight && c.missingWeight.filter(Boolean).length);
          if (!ww.hidden) ww.innerHTML = `<b>${c.missingWeight.filter(Boolean).map((id) => esc(productLabel(productById(id)))).join('، ')}</b> ملوش وزن شحن ولا حجم بالمللي، فالمصاريف اتوزعت مؤقتًا بعدد القطع. سجّل الوزن أو الحجم في المنتج عشان التوزيع يبقى بالحجم.`;
          allRows.forEach((r, i) => { r.querySelector('.l-egp').textContent = fmt(c.lines[i].egp); r.querySelector('.l-landed').textContent = fmt(c.lines[i].landedUnit); });
          f.querySelector('.cur-label').textContent = `(${draft.currency})`;
          f.querySelector('.recv-field').hidden = draft.status !== 'received';
          f.querySelector('#ship-summary').innerHTML = `<div><span>قيمة البضاعة</span><b>${fmt(c.goodsForeign)} ${draft.currency}</b></div><div><span>بالجنيه</span><b>${fmt(c.goodsEGP)}</b></div><div><span>مصاريف إضافية</span><b>${fmt(c.extras)}</b></div><div class="strong"><span>التكلفة الكلية الواصلة</span><b>${fmt(c.landedTotal)} ج.م</b></div><div><span>عدد القطع</span><b>${fmt(c.totalQty)}</b></div><div><span>نسبة المصاريف للبضاعة</span><b>${pct(c.goodsEGP ? c.extras / c.goodsEGP : 0)}</b></div>`;
        };
        f.querySelector('#add-line').addEventListener('click', () => { lines.insertAdjacentHTML('beforeend', shipLineRow({ qty: 1 })); recalc(); });
        f.querySelector('#add-cost').addEventListener('click', () => { costs.insertAdjacentHTML('beforeend', costRow({})); recalc(); });
        f.addEventListener('click', (e) => { const b = e.target.closest('[data-line-remove]'); if (b) { const tr = b.closest('tr'); if (tr.classList.contains('cost') || lines.children.length > 1) { tr.remove(); recalc(); } } });
        f.supplierId.addEventListener('change', () => { const sp = DB.find('suppliers', f.supplierId.value); if (sp) { f.currency.value = sp.currency; f.rate.value = S().settings.rates[sp.currency] || 1; } recalc(); });
        f.currency.addEventListener('change', () => { f.rate.value = f.currency.value === 'EGP' ? 1 : S().settings.rates[f.currency.value] || f.rate.value; recalc(); });
        f.addEventListener('input', recalc); f.addEventListener('change', recalc);
        recalc();
      },
      onSubmit(f) {
        const obj = read(f);
        if (!obj.items.length) { UI.toast('أضف صنفًا واحدًا على الأقل', 'bad'); return false; }
        if (!(obj.rate > 0)) return fail('سعر الصرف لازم يكون أكبر من صفر');
        if (!dateOk(obj.orderDate, 'تاريخ الطلب')) return false;
        const shErr = RULES.shipmentDateError(obj);
        if (shErr) return fail(shErr);
        if (!cashOk(f, RULES.withDoc(S(), 'shipments', obj))) return false;
        DB.upsert('shipments', obj);
        UI.toast(isNew ? 'تم تسجيل الشحنة' : 'تم حفظ الشحنة');
        render();
      },
    });
  }

  function landedView(sh) {
    const c = Acc.shipmentCosting(sh, S().products);
    const costHeads = c.costs.map((x) => `#${x.label || 'مصاريف'} للقطعة`);
    const basisNote = c.costs.map((x) => `«${esc(x.label || 'مصاريف')}» ${fmt(x.amount)} ج.م اتوزع حسب ${Acc.COST_BASES[x.applied]}${x.applied !== x.basis ? ` (بدل ${Acc.COST_BASES[x.basis]} لأن فيه صنف ملوش وزن ولا حجم)` : ''}`).join(' · ');
    UI.modal({ title: `تكلفة الوحدة — شحنة ${esc(sh.ref)}`, wide: true, tools: { title: `تكلفة الوحدة الواصلة — شحنة ${sh.ref || ''}`, subtitle: `${nameOf('suppliers', sh.supplierId)} · سعر الصرف ${sh.rate}`, file: `landed-${sh.ref || 'shipment'}` },
      body: `${basisNote ? `<p class="muted">${basisNote}</p>` : ''}${table(['المنتج', '#الكمية', '#وزن/حجم القطعة', `#سعر المورد (${sh.currency})`, '#بالجنيه', ...costHeads, '#تكلفة الوحدة الواصلة', '#سعر البيع', '#الهامش المتوقع'], c.lines.map((l) => {
        const p = productById(l.productId) || {};
        return `<tr>${td(esc(productLabel(p)))}${tdn(fmt(l.qty))}${tdn(l.unitWeight ? fmt(l.unitWeight) : '—')}${tdn(fmt(l.unitCost))}${tdn(fmt(l.qty ? l.egp / l.qty : 0))}${l.parts.map((x) => tdn(fmt(l.qty ? x / l.qty : 0))).join('')}${tdn(`<b>${fmt(l.landedUnit)}</b>`)}${tdn(fmt(p.price))}${tdn(p.price ? pct((p.price - l.landedUnit) / p.price) : '—')}</tr>`;
      }), { foot: `<tr><td>الإجمالي</td>${tdn(fmt(c.totalQty))}${tdn(c.totalWeight ? fmt(c.totalWeight) : '')}${tdn(fmt(c.goodsForeign))}${tdn(fmt(c.goodsEGP))}${c.costs.map((x) => tdn(fmt(x.amount))).join('')}${tdn(fmt(c.landedTotal))}<td colspan="2"></td></tr>` })}
        <p class="muted">أعمدة المصاريف والبضاعة بالجنيه للقطعة الواحدة، وصف الإجمالي بإجمالي الشحنة.</p>` });
  }

  // =====================================================================
  // المنتجات والمخزون
  // =====================================================================
  function products() {
    const s = S(), inv = J().inventory.products;
    let totals = { value: 0, retail: 0 };
    const rows = s.products.map((p) => {
      const st = inv[p.id];
      totals.value += st.value; totals.retail += st.qty * num(p.price);
      const low = st.available <= num(p.minStock ?? s.settings.lowStock);
      const margin = p.price && st.avgCost ? (p.price - st.avgCost) / p.price : null;
      return `<tr>${td(`${esc(p.sku || '')}${p.barcode && p.barcode !== p.sku ? `<br><small class="muted">${esc(p.barcode)}</small>` : ''}`, 'mono')}${td(`<b>${esc(p.brand || '')}</b> ${esc(p.name)}${p.decantOf ? ' ' + UI.pill('ديكانت', 'info') : ''}`)}${td(p.sizeMl ? p.sizeMl + ' مل' : '—')}${td(GENDERS[p.gender] || '—')}
        ${tdn(fmt(p.price))}${tdn(fmt(st.qty))}${tdn(st.reserved ? fmt(st.reserved) : '—')}${tdn(`<span class="${st.available <= 0 ? 'bad-text' : low ? 'warn-text' : ''}">${fmt(st.available)}</span>`)}
        ${tdn(fmt(st.avgCost))}${tdn(fmt(st.value))}${tdn(margin == null ? '—' : pct(margin))}
        ${td(st.available <= 0 ? UI.pill('نفد', 'bad') : low ? UI.pill('اطلب الآن', 'warn') : UI.pill('متوفر', 'good'))}
        ${actions(btn('حركة', 'productMoves', p.id), btn('تعديل', 'editProduct', p.id), btn('حذف', 'delProduct', p.id, 'danger'))}</tr>`;
    });
    const adj = [...s.adjustments].sort((a, b) => (a.date < b.date ? 1 : -1)).map((a) => `<tr>${td(fmtDate(a.date))}${td(esc(productLabel(productById(a.productId))))}${td(Acc.ADJ_REASONS[a.reason] || a.reason)}${tdn(fmt(a.qty))}${tdn(fmt(J().inventory.adjCost[a.id] || 0))}${td(esc(a.notes || ''))}${actions(btn('حذف', 'delAdjustment', a.id, 'danger'))}</tr>`);
    const dec = [...s.decants].sort((a, b) => (a.date < b.date ? 1 : -1)).map((d) => {
      const c = J().inventory.decantCost[d.id] || { total: 0, costPerMl: 0 };
      return `<tr>${td(fmtDate(d.date))}${td(`${d.kind === 'unbox' ? UI.pill('فك بوكس', 'info') + ' ' : ''}${esc(productLabel(productById(d.sourceProductId)))}`)}${tdn(fmt(d.sourceQty))}${td(d.outputs.map((o) => `${esc(productLabel(productById(o.productId)))} × ${fmt(o.qty)}`).join('<br>'))}${tdn(fmt(d.materialsCost))}${tdn(fmt(c.total))}${tdn(d.kind === 'unbox' ? '—' : fmt(c.costPerMl))}${actions(btn('التفاصيل', 'viewDecant', d.id), btn('حذف', 'delDecant', d.id, 'danger'))}</tr>`;
    });
    return `${header('المنتجات والمخزون', 'الرصيد والتكلفة تُحسب تلقائيًا من الشحنات المستلمة والمبيعات والمرتجعات بطريقة المتوسط المرجح.', '<button class="btn" data-action="newDecant">تقسيم عبوة (ديكانت)</button><button class="btn" data-action="unbox">فك بوكس</button><button class="btn" data-action="barcodeLabels">طباعة باركود</button><button class="btn" data-action="stockCount">جرد بالباركود</button><button class="btn" data-action="newAdjustment">تسوية مخزون</button><button class="btn btn-primary" data-action="newProduct">+ منتج جديد</button>')}
      <section class="kpis kpis-3">${kpi('قيمة المخزون بالتكلفة', money0(totals.value))}${kpi('قيمته بسعر البيع', money0(totals.retail))}${kpi('ربح متوقع في المخزون', money0(totals.retail - totals.value), totals.retail ? `هامش ${pct((totals.retail - totals.value) / totals.retail)}` : '')}</section>
      ${table(['الكود', 'المنتج', 'الحجم', 'الفئة', '#سعر البيع', '#الرصيد', '#محجوز', '#متاح', '#متوسط التكلفة', '#قيمة المخزون', '#الهامش', 'الحالة', ''], rows, { empty: 'لا توجد منتجات بعد' })}
      <h2 class="section-title">تسويات المخزون (افتتاحي، تالف، تسترات، هدايا، فروق جرد)</h2>
      ${table(['التاريخ', 'المنتج', 'السبب', '#الكمية', '#التكلفة', 'ملاحظات', ''], adj, { empty: 'لا توجد تسويات' })}
      <h2 class="section-title">تقسيم العبوات (ديكانت) وفك البوكسات</h2>
      ${table(['التاريخ', 'العبوة / البوكس', '#العدد', 'الناتج', '#تكلفة العبوات الفاضية', '#التكلفة الكلية', '#تكلفة المللي', ''], dec, { empty: 'لم تقسم أي عبوة بعد' })}`;
  }

  function productForm(p) {
    const isNew = !p;
    p = p || { id: uid(), sku: '', brand: '', name: '', sizeMl: 100, gender: 'unisex', price: '', minStock: S().settings.lowStock };
    UI.modal({ title: isNew ? 'منتج جديد' : 'تعديل المنتج',
      body: `<div class="form-grid">
        ${UI.field('الماركة', UI.input('brand', p.brand, 'placeholder="لطافة، أرماف، الرصاصي…"'))}
        ${UI.field('اسم العطر', UI.input('name', p.name, 'required'), { req: true })}
        ${UI.field('الحجم (مل)', UI.input('sizeMl', p.sizeMl, 'type="number" min="0"'))}
        ${UI.field('وزن الشحن (جرام)', UI.input('weightG', p.weightG || '', 'type="number" min="0" step="1"'), { hint: p.boxItems && p.boxItems.length ? `بوكس: لو فاضي يتحسب بمجموع قطعه (${fmt(Acc.unitWeight({ ...p, weightG: 0, sizeMl: 0 }, S().products))})` : 'لتوزيع مصاريف الشحن. لو فاضي يتحسب بالمللي' })}
        ${UI.field('الفئة', UI.select('gender', GENDERS, p.gender))}
        ${UI.field('كود المنتج (SKU)', UI.input('sku', p.sku, 'dir="ltr"'))}
        ${UI.field('الباركود', UI.input('barcode', p.barcode || '', 'dir="ltr" autocomplete="off"'), { hint: 'امسحه بالقارئ هنا، أو سيبه فاضي ويتعمل تلقائي عند الطباعة' })}
        ${UI.field('سعر البيع (ج.م)', UI.input('price', p.price, 'type="number" min="0" step="0.01" required'), { req: true })}
        ${UI.field('حد إعادة الطلب', UI.input('minStock', p.minStock, 'type="number" min="0"'), { hint: 'ينبهك عندما يقل المتاح عن هذا الرقم' })}
      </div>`,
      onSubmit(f, fd) {
        const barcode = fd.get('barcode').trim();
        if (barcode && !OPS.validBarcode(barcode)) { UI.toast('الباركود لازم يكون حروف وأرقام إنجليزي بس', 'bad'); return false; }
        const dup = barcode && S().products.find((x) => x.id !== p.id && (x.barcode || '').toUpperCase() === barcode.toUpperCase());
        if (dup) { UI.toast(`الباركود ده مستخدم لـ ${productLabel(dup)}`, 'bad'); return false; }
        DB.upsert('products', { ...p, brand: fd.get('brand').trim(), name: fd.get('name').trim(), sizeMl: num(fd.get('sizeMl')), weightG: num(fd.get('weightG')), gender: fd.get('gender'), sku: fd.get('sku').trim(), barcode, price: num(fd.get('price')), minStock: num(fd.get('minStock')) });
        UI.toast('تم حفظ المنتج'); render();
      } });
  }

  function adjustmentForm() {
    if (!S().products.length) { UI.toast('أضف منتجًا أولًا', 'bad'); return; }
    UI.modal({ title: 'تسوية مخزون',
      body: `<div class="form-grid">
        ${UI.field('التاريخ', UI.input('date', today(), 'type="date" required'), { req: true })}
        ${UI.field('المنتج', UI.select('productId', productOptions(), '', 'required'), { req: true })}
        ${UI.field('السبب', UI.select('reason', Acc.ADJ_REASONS, 'opening'))}
        ${UI.field('الكمية', UI.input('qty', '', 'type="number" step="1" required'), { req: true, hint: 'موجب للإضافة، سالب للخصم (مثال: -1)' })}
        ${UI.field('تكلفة الوحدة (للإضافة فقط)', UI.input('unitCost', '', 'type="number" min="0" step="0.01"'), { hint: 'اتركها فارغة لاستخدام متوسط التكلفة الحالي' })}
        ${UI.field('ملاحظات', UI.input('notes', ''))}
      </div>`,
      onSubmit(f, fd) {
        let qty = num(fd.get('qty'));
        const reason = fd.get('reason');
        if (!qty) { UI.toast('أدخل الكمية', 'bad'); return false; }
        if (['damage', 'tester', 'gift', 'promo'].includes(reason) && qty > 0) qty = -qty;
        if (reason === 'opening' && (qty < 0 || fd.get('unitCost') === '')) { UI.toast('المخزون الافتتاحي يحتاج كمية موجبة وتكلفة وحدة', 'bad'); return false; }
        if (!dateOk(fd.get('date'))) return false;
        const out = qty < 0 && RULES.checkStockOut(J(), fd.get('productId'), -qty);
        if (out) return fail(stockMsg([out]));
        DB.upsert('adjustments', { id: uid(), date: fd.get('date'), productId: fd.get('productId'), qty, unitCost: qty > 0 && fd.get('unitCost') !== '' ? num(fd.get('unitCost')) : null, reason, notes: fd.get('notes') });
        UI.toast('تم تسجيل التسوية'); render();
      } });
  }

  function productMoves(p) {
    const labels = { in: 'وارد', sale: 'بيع', return: 'مرتجع', outAdj: 'تسوية بالخصم', decantOut: 'تفريغ / فك', decantIn: 'وارد من تقسيم / فك' };
    const rows = J().inventory.movements.filter((m) => m.productId === p.id).map((m) => {
      let ref = '';
      if (m.src.type === 'shipment') ref = 'شحنة ' + ((DB.find('shipments', m.src.id) || {}).ref || '');
      else if (m.src.type === 'sale') { const x = DB.find('sales', m.src.id) || {}; ref = `${isPromo(x) ? 'فاتورة دعاية' : 'فاتورة'} ${invoiceNo(x)}`; }
      else if (m.src.type === 'decant') { const d = DB.find('decants', m.src.id) || {}; ref = `${d.kind === 'unbox' ? 'فك بوكس' : 'تقسيم عبوة'} ${productLabel(productById(d.sourceProductId))}`; }
      else ref = Acc.ADJ_REASONS[(DB.find('adjustments', m.src.id) || {}).reason] || 'تسوية';
      const sign = m.kind === 'in' || m.kind === 'return' || m.kind === 'decantIn' ? 1 : -1;
      return `<tr>${td(fmtDate(m.date))}${td(labels[m.kind])}${td(esc(ref))}${tdn(fmt(sign * m.qty))}${tdn(fmt(m.qty ? m.cost / m.qty : 0))}${tdn(fmt(m.balanceQty))}${tdn(fmt(m.balanceValue))}${tdn(fmt(m.balanceQty ? m.balanceValue / m.balanceQty : 0))}</tr>`;
    });
    UI.modal({ title: `كارت صنف — ${esc(productLabel(p))}`, wide: true, tools: { title: `كارت صنف — ${productLabel(p)}`, file: `stock-card-${p.sku || p.id}` }, body: table(['التاريخ', 'الحركة', 'المستند', '#الكمية', '#تكلفة الوحدة', '#الرصيد', '#القيمة', '#متوسط التكلفة'], rows, { empty: 'لا توجد حركة على هذا الصنف' }) });
  }

  // =====================================================================
  // الموردين
  // =====================================================================
  function suppliers() {
    const s = S(), sup = J().suppliers.balances;
    const rows = s.suppliers.map((x) => {
      const b = sup[x.id] || { foreign: 0, egp: 0 };
      const state = b.foreign > 0.005 ? UI.pill('مستحق له', 'warn') : b.foreign < -0.005 ? UI.pill('دفعة مقدمة', 'info') : UI.pill('مسدد', 'good');
      return `<tr>${td(`<b>${esc(x.name)}</b>`)}${td(COUNTRIES[x.country] || '—')}${td(x.currency)}${td(esc(x.phone || ''), 'mono')}
        ${tdn(`${fmt(Math.abs(b.foreign))} <span class="cur">${x.currency}</span>`)}${tdn(fmt(Math.abs(b.egp)))}${td(state)}
        ${actions(btn('دفعة', 'newPayment', x.id), btn('كشف حساب', 'supplierStatement', x.id), btn('تعديل', 'editSupplier', x.id), btn('حذف', 'delSupplier', x.id, 'danger'))}</tr>`;
    });
    const pays = [...s.supplierPayments].sort((a, b) => (a.date < b.date ? 1 : -1)).map((p) => {
      const sp = DB.find('suppliers', p.supplierId) || {};
      const fxv = J().suppliers.fx[p.id] || 0;
      return `<tr>${td(fmtDate(p.date))}${td(esc(sp.name || '—'))}${tdn(`${fmt(p.amount)} <span class="cur">${sp.currency || ''}</span>`)}${tdn(fmt(p.rate, 4))}${tdn(fmt(num(p.amount) * num(p.rate)))}${tdn(fmt(p.fee))}${td(esc(nameOf('accounts', p.accountId)))}
        ${tdn(fxv ? `<span class="${fxv > 0 ? 'bad-text' : 'good-text'}">${fxv > 0 ? 'خسارة' : 'ربح'} ${fmt(Math.abs(fxv))}</span>` : '—')}${td(esc(p.notes || ''))}${actions(btn('تعديل', 'editPayment', p.id), btn('حذف', 'delPayment', p.id, 'danger'))}</tr>`;
    });
    return `${header('الموردين', 'رصيد كل مورد يُتابع بعملته (ريال / درهم)، وفروق سعر الصرف بين وقت الشراء ووقت الدفع تُسجَّل تلقائيًا كربح أو خسارة.', '<button class="btn" data-action="newPayment">دفعة لمورد</button><button class="btn btn-primary" data-action="newSupplier">+ مورد جديد</button>')}
      ${table(['المورد', 'الدولة', 'العملة', 'الهاتف', '#الرصيد بالعملة', '#الرصيد الدفتري (ج.م)', 'الحالة', ''], rows, { empty: 'لا يوجد موردون بعد' })}
      <h2 class="section-title">الدفعات للموردين</h2>
      ${table(['التاريخ', 'المورد', '#المبلغ', '#سعر الصرف', '#بالجنيه', '#عمولة التحويل', 'من حساب', '#فرق العملة', 'ملاحظات', ''], pays, { empty: 'لا توجد دفعات' })}`;
  }

  function supplierForm(x) {
    const isNew = !x;
    x = x || { id: uid(), name: '', country: 'SA', currency: 'SAR', phone: '', notes: '' };
    UI.modal({ title: isNew ? 'مورد جديد' : 'تعديل المورد',
      body: `<div class="form-grid">
        ${UI.field('اسم المورد', UI.input('name', x.name, 'required'), { req: true })}
        ${UI.field('الدولة', UI.select('country', COUNTRIES, x.country))}
        ${UI.field('عملة التعامل', UI.select('currency', CURRENCIES, x.currency))}
        ${UI.field('الهاتف / واتساب', UI.input('phone', x.phone, 'inputmode="tel"'))}
        ${UI.field('ملاحظات / العنوان', UI.input('notes', x.notes), { cls: 'span-2' })}
      </div>`,
      onOpen(f) { f.country.addEventListener('change', () => { f.currency.value = { SA: 'SAR', AE: 'AED', EG: 'EGP' }[f.country.value] || 'USD'; }); },
      onSubmit(f, fd) { DB.upsert('suppliers', { ...x, name: fd.get('name').trim(), country: fd.get('country'), currency: fd.get('currency'), phone: fd.get('phone').trim(), notes: fd.get('notes') }); UI.toast('تم حفظ المورد'); render(); } });
  }

  function paymentForm(p, supplierId) {
    const s = S();
    if (!s.suppliers.length) { UI.toast('أضف موردًا أولًا', 'bad'); return; }
    const isNew = !p;
    const sp0 = DB.find('suppliers', supplierId) || s.suppliers[0];
    p = p || { id: uid(), date: today(), supplierId: sp0.id, amount: '', rate: s.settings.rates[sp0.currency] || 1, accountId: (s.accounts.find((a) => a.type === 'bank') || s.accounts[0] || {}).id, fee: 0, notes: '' };
    UI.modal({ title: isNew ? 'دفعة لمورد' : 'تعديل الدفعة',
      body: `<div class="form-grid">
        ${UI.field('التاريخ', UI.input('date', p.date, 'type="date" required'), { req: true })}
        ${UI.field('المورد', UI.select('supplierId', s.suppliers.map((x) => ({ v: x.id, l: `${x.name} (${x.currency})` })), p.supplierId))}
        ${UI.field('المبلغ بعملة المورد', UI.input('amount', p.amount, 'type="number" min="0" step="0.01" required'), { req: true })}
        ${UI.field('سعر الصرف الفعلي', UI.input('rate', p.rate, 'type="number" min="0" step="0.0001" required'), { req: true })}
        ${UI.field('دُفع من', UI.select('accountId', accountOptions(), p.accountId))}
        ${UI.field('عمولة التحويل (ج.م)', UI.input('fee', p.fee, 'type="number" min="0" step="0.01"'))}
        ${UI.field('ملاحظات', UI.input('notes', p.notes), { cls: 'span-2' })}
      </div><div class="summary" id="pay-sum"></div>`,
      onOpen(f) {
        const upd = () => { f.querySelector('#pay-sum').innerHTML = `<div class="strong"><span>إجمالي الخصم من الحساب</span><b>${fmt(num(f.amount.value) * num(f.rate.value) + num(f.fee.value))} ج.م</b></div>`; };
        f.supplierId.addEventListener('change', () => { const sp = DB.find('suppliers', f.supplierId.value); if (sp) f.rate.value = sp.currency === 'EGP' ? 1 : S().settings.rates[sp.currency] || f.rate.value; upd(); });
        f.addEventListener('input', upd); upd();
      },
      onSubmit(f, fd) {
        const obj = { ...p, date: fd.get('date'), supplierId: fd.get('supplierId'), amount: num(fd.get('amount')), rate: num(fd.get('rate')), accountId: fd.get('accountId'), fee: num(fd.get('fee')), notes: fd.get('notes') };
        if (!(obj.amount > 0)) return fail('المبلغ لازم يكون أكبر من صفر');
        if (!(obj.rate > 0)) return fail('سعر الصرف لازم يكون أكبر من صفر');
        if (!dateOk(obj.date) || !cashOk(f, RULES.withDoc(S(), 'supplierPayments', obj))) return false;
        DB.upsert('supplierPayments', obj); UI.toast('تم تسجيل الدفعة'); render();
      } });
  }

  function supplierStatement(x) {
    const lines = J().suppliers.lines.filter((l) => l.supplierId === x.id);
    const rows = lines.map((l) => {
      const doc = l.ref.type === 'shipment' ? `شحنة ${esc((DB.find('shipments', l.ref.id) || {}).ref || '')}` : `دفعة ${esc((DB.find('supplierPayments', l.ref.id) || {}).notes || '')}`;
      return `<tr>${td(fmtDate(l.date))}${td(doc)}${tdn(l.foreign > 0 ? fmt(l.foreign) : '')}${tdn(l.foreign < 0 ? fmt(-l.foreign) : '')}${tdn(fmt(l.rate, 4))}${tdn(l.fx ? `<span class="${l.fx > 0 ? 'bad-text' : 'good-text'}">${fmt(l.fx)}</span>` : '—')}${tdn(fmt(l.balanceForeign))}${tdn(fmt(l.balanceEGP))}</tr>`;
    });
    UI.modal({ title: `كشف حساب — ${esc(x.name)}`, wide: true, tools: { title: `كشف حساب المورد — ${x.name}`, subtitle: `العملة: ${x.currency}`, file: `supplier-statement` },
      body: `<p class="muted">الرصيد الموجب = مستحق للمورد، السالب = دفعة مقدمة لديه. العمود "فرق العملة": موجب خسارة، سالب ربح.</p>${table(['التاريخ', 'المستند', `#مشتريات (${x.currency})`, `#مدفوعات (${x.currency})`, '#سعر الصرف', '#فرق العملة', `#الرصيد (${x.currency})`, '#الرصيد (ج.م)'], rows, { empty: 'لا توجد حركات' })}` });
  }

  // =====================================================================
  // العملاء
  // =====================================================================
  let custQ = '';
  function customers() {
    const s = S(), j = J();
    const stats = {};
    s.sales.forEach((x) => {
      const st = (stats[x.customerId] = stats[x.customerId] || { orders: 0, total: 0, profit: 0, returns: 0, last: '' });
      if (!Acc.BOOKED.has(x.status) || isPromo(x)) return;
      const p = Acc.saleProfit(x, j);
      st.orders++; if (x.status === 'returned') st.returns++; else st.total += p.total;
      st.profit += p.profit; if (x.date > st.last) st.last = x.date;
    });
    const q = custQ.trim().toLowerCase();
    const rows = s.customers.filter((c) => !q || `${c.name} ${c.phone} ${c.city}`.toLowerCase().includes(q)).map((c) => ({ c, st: stats[c.id] || { orders: 0, total: 0, profit: 0, returns: 0, last: '' } }))
      .sort((a, b) => b.st.total - a.st.total).map(({ c, st }) => `<tr>${td(`<b>${esc(c.name)}</b>`)}${td(esc(c.phone || ''), 'mono')}${td(esc(c.city || ''))}${tdn(st.orders)}${tdn(st.returns ? `<span class="bad-text">${st.returns}</span>` : '0')}${tdn(fmt(st.total))}${tdn(fmt(st.profit))}${td(fmtDate(st.last))}${actions(btn('تعديل', 'editCustomer', c.id), btn('حذف', 'delCustomer', c.id, 'danger'))}</tr>`);
    return `${header('العملاء', 'مرتبون حسب إجمالي المشتريات.', '<button class="btn btn-primary" data-action="newCustomer">+ عميل جديد</button>')}
      <div class="filters"><input type="search" id="f-cq" placeholder="بحث بالاسم أو الموبايل أو المدينة" value="${esc(custQ)}" data-input="custQ"></div>
      ${table(['العميل', 'الموبايل', 'المدينة', '#الطلبات', '#المرتجعات', '#إجمالي المشتريات', '#الربح منه', 'آخر طلب', ''], rows, { empty: 'لا يوجد عملاء' })}`;
  }
  function customerForm(c) {
    const isNew = !c;
    c = c || { id: uid(), name: '', phone: '', city: '', address: '' };
    UI.modal({ title: isNew ? 'عميل جديد' : 'تعديل العميل',
      body: `<div class="form-grid">${UI.field('الاسم', UI.input('name', c.name, 'required'), { req: true })}${UI.field('الموبايل', UI.input('phone', c.phone, 'inputmode="tel"'))}${UI.field('المحافظة / المدينة', UI.input('city', c.city))}${UI.field('العنوان', UI.input('address', c.address))}</div>`,
      onSubmit(f, fd) { DB.upsert('customers', { ...c, name: fd.get('name').trim(), phone: fd.get('phone').trim(), city: fd.get('city').trim(), address: fd.get('address').trim() }); UI.toast('تم حفظ العميل'); render(); } });
  }

  // =====================================================================
  // الخزينة
  // =====================================================================
  let treasuryAcc = null;
  function treasury() {
    const s = S(), j = J();
    const cb = Acc.cashBalances(s, j);
    const couriers = Acc.courierBalances(s, j);
    if (!treasuryAcc || !s.accounts.some((a) => a.id === treasuryAcc)) treasuryAcc = (s.accounts[0] || {}).id;
    const led = treasuryAcc ? Acc.ledger(s, j, Acc.cashCode(treasuryAcc), period.from, period.to) : { rows: [], opening: 0, closing: 0 };
    const docs = [
      ...s.transfers.map((t) => ({ date: t.date, kind: 'تحويل', desc: `${nameOf('accounts', t.fromId)} ← ${nameOf('accounts', t.toId)}`, amount: t.amount, extra: t.fee ? `عمولة ${fmt(t.fee)}` : '', list: 'transfers', id: t.id })),
      ...s.settlements.map((t) => ({ date: t.date, kind: t.amount >= 0 ? 'تحصيل شحن' : 'سداد لشركة شحن', desc: `${nameOf('couriers', t.courierId)} → ${nameOf('accounts', t.accountId)}`, amount: t.amount, extra: t.notes || '', list: 'settlements', id: t.id })),
      ...s.equity.map((t) => ({ date: t.date, kind: t.type === 'drawing' ? 'مسحوبات' : 'رأس مال', desc: `${nameOf('accounts', t.accountId)}${t.partnerId ? ' — ' + nameOf('partners', t.partnerId) : ''}`, amount: t.amount, extra: t.notes || '', list: 'equity', id: t.id })),
    ].filter((d) => inPeriod(d.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
    return `${header('الخزينة والبنوك', 'أرصدة الخزائن والمحافظ، التحصيل من شركات الشحن، التحويلات، ورأس المال.', `${periodBar()}<button class="btn" data-action="newEquity">رأس مال / مسحوبات</button><button class="btn" data-action="newTransfer">تحويل بين الحسابات</button><button class="btn btn-primary" data-action="newSettlement">تحصيل من شركة شحن</button>`)}
      <section class="acc-cards">
        ${cb.map((a) => `<button class="acc-card ${a.id === treasuryAcc ? 'active' : ''}" data-action="pickAccount" data-id="${a.id}"><span>${esc(ACCOUNT_TYPES[a.type] || '')}</span><b>${esc(a.name)}</b><strong class="${a.balance < 0 ? 'bad-text' : ''}">${money(a.balance)}</strong></button>`).join('')}
        ${s.couriers.map((c) => `<div class="acc-card courier"><span>${couriers[c.id] >= 0 ? 'مستحق لنا لدى' : 'مستحق علينا لـ'}</span><b>${esc(c.name)}</b><strong>${money(Math.abs(couriers[c.id] || 0))}</strong></div>`).join('')}
      </section>
      <h2 class="section-title">حركة ${esc(nameOf('accounts', treasuryAcc))} — ${PRESETS[period.preset]}</h2>
      ${table(['التاريخ', 'البيان', '#وارد', '#منصرف', '#الرصيد'], led.rows.map((r) => `<tr>${td(fmtDate(r.date))}${td(esc(r.desc))}${tdn(r.dr ? fmt(r.dr) : '')}${tdn(r.cr ? fmt(r.cr) : '')}${tdn(fmt(r.balance))}</tr>`), {
        empty: 'لا توجد حركة في هذه الفترة',
        foot: `<tr><td colspan="4">رصيد أول الفترة ${fmt(led.opening)} · رصيد آخر الفترة</td>${tdn(`<b>${fmt(led.closing)}</b>`)}</tr>`,
      })}
      <h2 class="section-title">التحويلات والتحصيلات ورأس المال</h2>
      ${table(['التاريخ', 'النوع', 'البيان', '#المبلغ', 'ملاحظات', ''], docs.map((d) => `<tr>${td(fmtDate(d.date))}${td(d.kind)}${td(esc(d.desc))}${tdn(fmt(Math.abs(d.amount)))}${td(esc(d.extra))}${actions(btn('تعديل', 'editDoc', `${d.list}:${d.id}`), btn('حذف', 'delDoc', `${d.list}:${d.id}`, 'danger'))}</tr>`), { empty: 'لا توجد مستندات في هذه الفترة' })}`;
  }

  function transferForm(t) {
    const s = S(); const isNew = !t;
    t = t || { id: uid(), date: today(), fromId: (s.accounts[0] || {}).id, toId: (s.accounts[1] || {}).id, amount: '', fee: 0, notes: '' };
    UI.modal({ title: 'تحويل بين الحسابات',
      body: `<div class="form-grid">${UI.field('التاريخ', UI.input('date', t.date, 'type="date" required'), { req: true })}${UI.field('من', UI.select('fromId', accountOptions(), t.fromId))}${UI.field('إلى', UI.select('toId', accountOptions(), t.toId))}${UI.field('المبلغ', UI.input('amount', t.amount, 'type="number" min="0" step="0.01" required'), { req: true })}${UI.field('عمولة التحويل', UI.input('fee', t.fee, 'type="number" min="0" step="0.01"'))}${UI.field('ملاحظات', UI.input('notes', t.notes))}</div>`,
      onSubmit(f, fd) {
        if (fd.get('fromId') === fd.get('toId')) return fail('اختر حسابين مختلفين');
        const obj = { ...t, date: fd.get('date'), fromId: fd.get('fromId'), toId: fd.get('toId'), amount: num(fd.get('amount')), fee: num(fd.get('fee')), notes: fd.get('notes') };
        if (!(obj.amount > 0)) return fail('المبلغ لازم يكون أكبر من صفر');
        if (!dateOk(obj.date) || !cashOk(f, RULES.withDoc(S(), 'transfers', obj))) return false;
        DB.upsert('transfers', obj); UI.toast(isNew ? 'تم التحويل' : 'تم الحفظ'); render();
      } });
  }
  function settlementForm(t) {
    const s = S(); const isNew = !t;
    if (!s.couriers.length) { UI.toast('أضف شركة شحن من الإعدادات', 'bad'); return; }
    const bal = Acc.courierBalances(s, J());
    t = t || { id: uid(), date: today(), courierId: s.couriers[0].id, accountId: (s.accounts.find((a) => a.type === 'bank') || s.accounts[0] || {}).id, amount: '', notes: '' };
    UI.modal({ title: 'تحصيل / سداد مع شركة شحن',
      body: `<div class="form-grid">${UI.field('التاريخ', UI.input('date', t.date, 'type="date" required'), { req: true })}${UI.field('شركة الشحن', UI.select('courierId', s.couriers.map((c) => ({ v: c.id, l: `${c.name} (الرصيد ${fmt(bal[c.id] || 0)})` })), t.courierId))}${UI.field('إلى حساب', UI.select('accountId', accountOptions(), t.accountId))}${UI.field('المبلغ المستلم', UI.input('amount', t.amount, 'type="number" step="0.01" required'), { req: true, hint: 'صافي التحويل بعد خصم مصاريف الشحن. رقم سالب لو أنت اللي دفعت لهم' })}${UI.field('ملاحظات', UI.input('notes', t.notes), { cls: 'span-2' })}</div>`,
      onSubmit(f, fd) {
        const obj = { ...t, date: fd.get('date'), courierId: fd.get('courierId'), accountId: fd.get('accountId'), amount: num(fd.get('amount')), notes: fd.get('notes') };
        if (!obj.amount) return fail('أدخل المبلغ');
        if (!dateOk(obj.date) || !cashOk(f, RULES.withDoc(S(), 'settlements', obj))) return false;
        DB.upsert('settlements', obj); UI.toast(isNew ? 'تم تسجيل التحصيل' : 'تم الحفظ'); render();
      } });
  }
  function equityForm(t) {
    const s = S(); const isNew = !t;
    t = t || { id: uid(), date: today(), type: 'capital', amount: '', accountId: (s.accounts[0] || {}).id, notes: '', partnerId: '' };
    const partnerField = s.partners.length ? UI.field('الشريك', UI.select('partnerId', [{ v: '', l: 'بدون شريك (المالك)' }, ...s.partners.map((p) => ({ v: p.id, l: p.name }))], t.partnerId || ''), { hint: 'مسحوبات الشريك تتخصم من حسابه الجاري' }) : '';
    UI.modal({ title: 'رأس مال / مسحوبات',
      body: `<div class="form-grid">${UI.field('التاريخ', UI.input('date', t.date, 'type="date" required'), { req: true })}${UI.field('النوع', UI.select('type', { capital: 'إضافة رأس مال', drawing: 'مسحوبات' }, t.type))}${partnerField}${UI.field('المبلغ', UI.input('amount', t.amount, 'type="number" min="0" step="0.01" required'), { req: true })}${UI.field('الحساب', UI.select('accountId', accountOptions(), t.accountId))}${UI.field('ملاحظات', UI.input('notes', t.notes), { cls: 'span-2' })}</div>`,
      onSubmit(f, fd) {
        const obj = { ...t, date: fd.get('date'), type: fd.get('type'), amount: num(fd.get('amount')), accountId: fd.get('accountId'), partnerId: fd.get('partnerId') || '', notes: fd.get('notes') };
        if (!(obj.amount > 0)) return fail('المبلغ لازم يكون أكبر من صفر');
        if (!dateOk(obj.date) || !cashOk(f, RULES.withDoc(S(), 'equity', obj))) return false;
        DB.upsert('equity', obj); UI.toast(isNew ? 'تم التسجيل' : 'تم الحفظ'); render();
      } });
  }

  // =====================================================================
  // المصروفات
  // =====================================================================
  function expenses() {
    const s = S();
    const list = s.expenses.filter((e) => inPeriod(e.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
    const byCat = {};
    list.forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + num(e.amount)));
    const total = list.reduce((a, e) => a + num(e.amount), 0);
    const max = Math.max(1, ...Object.values(byCat));
    return `${header('المصروفات', 'الإعلانات والتغليف والرواتب وغيرها. مصاريف شحن الطلبات تُسجل تلقائيًا من الطلب نفسه.', `${periodBar()}<button class="btn btn-primary" data-action="newExpense">+ مصروف</button>`)}
      <section class="grid-2 exp-top">
        <div class="panel"><h2 class="section-title">حسب البند <span class="muted">— الإجمالي ${money(total)}</span></h2>
          ${Object.keys(byCat).length ? `<ul class="hbars">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<li><span>${esc(Acc.COA_MAP[c] ? Acc.COA_MAP[c].name : c)}</span><div class="hbar"><i style="width:${(v / max) * 100}%"></i></div><b>${fmt(v)}</b></li>`).join('')}</ul>` : UI.empty('لا مصروفات في هذه الفترة')}
        </div>
      </section>
      ${table(['التاريخ', 'البند', 'البيان', 'من حساب', '#المبلغ', ''], list.map((e) => `<tr>${td(fmtDate(e.date))}${td(esc((Acc.COA_MAP[e.category] || {}).name || e.category))}${td(`${esc(e.notes || '')}${e.campaignId ? ' ' + UI.pill(nameOf('campaigns', e.campaignId), 'info') : ''}`)}${td(esc(nameOf('accounts', e.accountId)))}${tdn(fmt(e.amount))}${actions(btn('تعديل', 'editExpense', e.id), btn('حذف', 'delExpense', e.id, 'danger'))}</tr>`), { empty: 'لا توجد مصروفات في هذه الفترة' })}`;
  }
  function expenseForm(e) {
    const s = S(); const isNew = !e;
    e = e || { id: uid(), date: today(), category: '5300', amount: '', accountId: (s.accounts[0] || {}).id, notes: '', campaignId: '' };
    UI.modal({ title: isNew ? 'مصروف جديد' : 'تعديل المصروف',
      body: `<div class="form-grid">${UI.field('التاريخ', UI.input('date', e.date, 'type="date" required'), { req: true })}${UI.field('البند', UI.select('category', Acc.EXPENSE_CATEGORIES.map((c) => ({ v: c, l: Acc.COA_MAP[c].name })), e.category))}${UI.field('المبلغ', UI.input('amount', e.amount, 'type="number" min="0" step="0.01" required'), { req: true })}${UI.field('دُفع من', UI.select('accountId', accountOptions(), e.accountId))}${UI.field('الحملة الإعلانية', UI.select('campaignId', campaignOptions('غير مرتبط بحملة'), e.campaignId || ''), { cls: 'camp-field', hint: 'يدخل في إنفاق الحملة وحساب العائد' })}${UI.field('البيان', UI.input('notes', e.notes, 'placeholder="إعلانات ميتا، علب، مرتب…"'), { cls: 'span-2' })}</div>`,
      onOpen(f) { const t = () => { f.querySelector('.camp-field').hidden = f.category.value !== '5300'; }; f.category.addEventListener('change', t); t(); },
      onSubmit(f, fd) {
        const obj = { ...e, date: fd.get('date'), category: fd.get('category'), amount: num(fd.get('amount')), accountId: fd.get('accountId'), campaignId: fd.get('category') === '5300' ? fd.get('campaignId') : '', notes: fd.get('notes') };
        if (!(obj.amount > 0)) return fail('المبلغ لازم يكون أكبر من صفر');
        if (!dateOk(obj.date) || !cashOk(f, RULES.withDoc(S(), 'expenses', obj))) return false;
        DB.upsert('expenses', obj); UI.toast('تم حفظ المصروف'); render();
      } });
  }

  // =====================================================================
  // التقارير
  // =====================================================================
  const REPORTS = { income: 'قائمة الدخل', balance: 'الميزانية', trial: 'ميزان المراجعة', journal: 'دفتر اليومية', ledger: 'دفتر الأستاذ', productsPerf: 'ربحية المنتجات', channels: 'أداء القنوات' };
  let report = 'income', ledgerAcc = '1300';
  function reports() {
    const tabs = `<nav class="tabs" role="tablist">${Object.entries(REPORTS).map(([k, l]) => `<button role="tab" aria-selected="${k === report}" class="tab ${k === report ? 'active' : ''}" data-action="pickReport" data-id="${k}">${l}</button>`).join('')}</nav>`;
    return `${header('التقارير المالية', 'كل التقارير مبنية على قيود يومية مزدوجة تُولَّد تلقائيًا من المستندات.', periodBar())}${tabs}<section class="report">${reportBody()}</section>`;
  }
  function reportBody() {
    const s = S(), j = J(), to = period.to || today();
    const line = (label, v, cls = '') => `<tr class="${cls}"><td>${label}</td>${tdn(fmt(v))}</tr>`;
    if (report === 'income') {
      const r = Acc.incomeStatement(s, j, period.from, period.to);
      return `<div class="statement"><h2>قائمة الدخل <small class="muted">${period.from ? fmtDate(period.from) + ' — ' + fmtDate(period.to) : 'كل الفترات'}</small></h2>
        <div class="table-wrap"><table class="fin"><tbody>
        ${line('إجمالي المبيعات', r.grossSales)}${line('(-) خصومات', -r.discounts, 'sub')}${line('(-) مردودات', -r.returns, 'sub')}${line('(+) إيراد الشحن من العملاء', r.shippingIncome, 'sub')}
        ${line('صافي المبيعات', r.netSales, 'total')}${line('(-) تكلفة البضاعة المباعة', -r.cogs)}${line(`مجمل الربح <small>(${pct(r.grossMargin)})</small>`, r.grossProfit, 'total')}
        <tr class="head"><td colspan="2">المصروفات التشغيلية</td></tr>${r.opex.map((o) => line(o.name, -o.amount, 'sub')).join('') || '<tr class="sub"><td colspan="2">لا يوجد</td></tr>'}
        ${line('إجمالي المصروفات التشغيلية', -r.totalOpex)}${line('ربح التشغيل', r.operatingProfit, 'total')}
        ${r.fxGain ? line('(+) أرباح فروق العملة', r.fxGain, 'sub') : ''}${r.fxLoss ? line('(-) خسائر فروق العملة', -r.fxLoss, 'sub') : ''}${r.otherIncome ? line('(+) إيرادات أخرى', r.otherIncome, 'sub') : ''}
        ${line(`صافي الربح <small>(${pct(r.netMargin)})</small>`, r.netProfit, 'grand' + (r.netProfit < 0 ? ' neg' : ''))}
        </tbody></table></div></div>`;
    }
    if (report === 'balance') {
      const b = Acc.balanceSheet(s, j, to);
      const block = (title, rows, total) => `<div class="table-wrap"><table class="fin"><tbody><tr class="head"><td colspan="2">${title}</td></tr>${rows.map((r) => line(esc(r.name), r.amount, 'sub')).join('') || '<tr class="sub"><td colspan="2">لا يوجد</td></tr>'}${line('الإجمالي', total, 'total')}</tbody></table></div>`;
      return `<div class="statement"><h2>الميزانية العمومية <small class="muted">في ${fmtDate(to)}</small> ${b.balanced ? UI.pill('متوازنة', 'good') : UI.pill('غير متوازنة', 'bad')}</h2>
        <div class="grid-2">${block('الأصول', b.assets, b.totalAssets)}<div>${block('الالتزامات', b.liabilities, b.totalLiabilities)}${block('حقوق الملكية', b.equity, b.totalEquity)}
        <div class="table-wrap"><table class="fin"><tbody>${line('إجمالي الالتزامات وحقوق الملكية', b.totalLiabilities + b.totalEquity, 'grand')}</tbody></table></div></div></div></div>`;
    }
    if (report === 'trial') {
      const t = Acc.trialBalance(s, j, to);
      return `<h2>ميزان المراجعة <small class="muted">حتى ${fmtDate(to)}</small> ${t.balanced ? UI.pill('متوازن', 'good') : UI.pill('غير متوازن', 'bad')}</h2>
        ${table(['الكود', 'الحساب', '#مدين', '#دائن', '#رصيد مدين', '#رصيد دائن'], t.rows.map((r) => `<tr>${td(r.acc.split(':')[0], 'mono')}${td(esc(r.name))}${tdn(fmt(r.dr))}${tdn(fmt(r.cr))}${tdn(r.balDr ? fmt(r.balDr) : '')}${tdn(r.balCr ? fmt(r.balCr) : '')}</tr>`), { foot: `<tr><td colspan="2">الإجمالي</td>${tdn(fmt(t.totals.dr))}${tdn(fmt(t.totals.cr))}${tdn(fmt(t.totals.balDr))}${tdn(fmt(t.totals.balCr))}</tr>` })}`;
    }
    if (report === 'journal') {
      const entries = j.entries.filter((e) => inPeriod(e.date)).slice(-400).reverse();
      return `<h2>دفتر اليومية <small class="muted">${entries.length} قيد${entries.length === 400 ? ' (آخر ٤٠٠)' : ''}</small></h2>
        <div class="journal">${entries.map((e) => `<div class="je"><div class="je-head"><span class="mono">#${e.no}</span><span>${fmtDate(e.date)}</span><b>${esc(e.desc)}</b></div>
          <div class="table-wrap"><table class="je-lines"><tbody>${e.lines.map((l) => `<tr><td class="${l.cr ? 'cr-acc' : ''}">${l.cr ? 'إلى ' : 'من '}${esc(Acc.accountName(l.acc, s))}${l.party ? ` <small class="muted">(${esc(partyName(l.party))})</small>` : ''}</td>${tdn(l.dr ? fmt(l.dr) : '')}${tdn(l.cr ? fmt(l.cr) : '')}</tr>`).join('')}</tbody></table></div></div>`).join('') || UI.empty('لا توجد قيود في هذه الفترة')}</div>`;
    }
    if (report === 'ledger') {
      const opts = [...Acc.COA.filter((a) => a.code !== '1100').map((a) => ({ v: a.code, l: `${a.code} — ${a.name}` })), ...s.accounts.map((a) => ({ v: Acc.cashCode(a.id), l: `1100 — ${a.name}` }))];
      const led = Acc.ledger(s, j, ledgerAcc, period.from, period.to);
      return `<h2>دفتر الأستاذ</h2><div class="filters">${UI.select('ledgerAcc', opts, ledgerAcc, 'data-change="ledgerAcc" aria-label="الحساب"')}</div>
        ${table(['التاريخ', 'القيد', 'البيان', '#مدين', '#دائن', '#الرصيد'], led.rows.map((r) => `<tr>${td(fmtDate(r.date))}${td('#' + r.no, 'mono')}${td(esc(r.desc))}${tdn(r.dr ? fmt(r.dr) : '')}${tdn(r.cr ? fmt(r.cr) : '')}${tdn(fmt(r.balance))}</tr>`), { empty: 'لا توجد حركة', foot: `<tr><td colspan="5">رصيد أول الفترة ${fmt(led.opening)} · رصيد آخر الفترة (مدين + / دائن −)</td>${tdn(`<b>${fmt(led.closing)}</b>`)}</tr>` })}`;
    }
    if (report === 'productsPerf') {
      const rows = Acc.productPerformance(s, j, period.from, period.to);
      return `<h2>ربحية المنتجات</h2>${table(['المنتج', '#المباع', '#المرتجع', '#دعاية مجانية', '#صافي الإيراد', '#التكلفة', '#مجمل الربح', '#الهامش'], rows.map((r) => `<tr>${td(esc(productLabel(productById(r.productId))))}${tdn(fmt(r.qty))}${tdn(r.returnedQty ? fmt(r.returnedQty) : '—')}${tdn(r.promoQty ? `${fmt(r.promoQty)} <small class="muted">(${fmt(r.promoCost)})</small>` : '—')}${tdn(fmt(r.revenue))}${tdn(fmt(r.cogs))}${tdn(fmt(r.profit))}${tdn(pct(r.margin))}</tr>`), { empty: 'لا مبيعات في هذه الفترة' })}
        <p class="muted">الإيراد هنا بعد توزيع الخصم على الأصناف، ولا يشمل إيراد الشحن.</p>`;
    }
    const rows = Acc.channelPerformance(s, j, period.from, period.to);
    return `<h2>أداء قنوات البيع</h2>${table(['القناة', '#الطلبات', '#المرتجع', '#نسبة المرتجع', '#المبيعات (شامل الشحن)', '#الربح بعد الشحن'], rows.map((r) => `<tr>${td(CHANNELS[r.channel] || r.channel)}${tdn(r.orders)}${tdn(r.returned)}${tdn(pct(r.orders ? r.returned / r.orders : 0))}${tdn(fmt(r.revenue))}${tdn(fmt(r.profit))}</tr>`), { empty: 'لا مبيعات في هذه الفترة' })}
      <p class="muted">الربح هنا = قيمة الطلب − تكلفة البضاعة − مصاريف الشحن والمرتجع، قبل الإعلانات والمصروفات العامة.</p>`;
  }

  // =====================================================================
  // الإعدادات
  // =====================================================================
  function settings() {
    const s = S(), st = s.settings;
    return `${header('الإعدادات والنسخ الاحتياطي', 'بياناتك محفوظة في هذا المتصفح فقط. صدّر نسخة احتياطية بانتظام.')}
      <form class="panel settings-form" id="settings-form">
        <h2 class="section-title">بيانات النشاط</h2>
        <div class="form-grid">
          ${UI.field('اسم المتجر', UI.input('businessName', st.businessName))}
          ${UI.field('هاتف / صفحة المتجر (يظهر في الفاتورة)', UI.input('businessPhone', st.businessPhone || ''))}
          ${UI.field('تاريخ بداية الحسابات', UI.input('startDate', st.startDate, 'type="date"'), { hint: 'تاريخ الأرصدة الافتتاحية' })}
          ${UI.field('بادئة رقم الفاتورة', UI.input('invoicePrefix', st.invoicePrefix))}
          ${UI.field('رقم الفاتورة التالية', UI.input('nextInvoiceNo', st.nextInvoiceNo, 'type="number" min="1"'))}
          ${UI.field('حد إعادة الطلب الافتراضي', UI.input('lowStock', st.lowStock, 'type="number" min="0"'))}
        </div>
        <h2 class="section-title">أسعار الصرف الافتراضية (جنيه لكل وحدة)</h2>
        <div class="form-grid">
          ${UI.field('الريال السعودي SAR', UI.input('rate_SAR', st.rates.SAR, 'type="number" step="0.0001" min="0"'))}
          ${UI.field('الدرهم الإماراتي AED', UI.input('rate_AED', st.rates.AED, 'type="number" step="0.0001" min="0"'))}
          ${UI.field('الدولار الأمريكي USD', UI.input('rate_USD', st.rates.USD, 'type="number" step="0.0001" min="0"'))}
        </div>
        <h2 class="section-title">التنبيهات (بعد كام يوم ينبهك)</h2>
        <div class="form-grid">
          ${UI.field('طلب قيد التجهيز', UI.input('al_pendingDays', st.alerts.pendingDays, 'type="number" min="1"'))}
          ${UI.field('طلب مع شركة الشحن ولسه ما اتسلمش', UI.input('al_shippedDays', st.alerts.shippedDays, 'type="number" min="1"'))}
          ${UI.field('طلب اتسلم وفلوسه ما اتسوتش', UI.input('al_settleDays', st.alerts.settleDays, 'type="number" min="1"'))}
          ${UI.field('قبل ميعاد سداد المورد', UI.input('al_dueDays', st.alerts.dueDays, 'type="number" min="0"'))}
          ${UI.field('منتج ما اتباعش (ركود)', UI.input('al_stagnantDays', st.alerts.stagnantDays, 'type="number" min="7"'))}
        </div>
        <h2 class="section-title">واتساب</h2>
        <div class="form-grid">
          ${UI.field('سطر في آخر رسالة الفاتورة', UI.input('waFooter', st.waFooter || ''), { cls: 'span-2', hint: 'مثال: شكرًا لطلبك — تابعنا على إنستجرام' })}
        </div>
        <button class="btn btn-primary" type="submit">حفظ الإعدادات</button>
      </form>
      <section class="grid-2">
        <div class="panel"><h2 class="section-title">الخزائن والحسابات</h2>
          ${table(['الحساب', 'النوع', '#رصيد افتتاحي', ''], s.accounts.map((a) => `<tr>${td(esc(a.name))}${td(ACCOUNT_TYPES[a.type] || '')}${tdn(fmt(a.opening))}${actions(btn('تعديل', 'editAccount', a.id), btn('حذف', 'delAccount', a.id, 'danger'))}</tr>`))}
          <button class="btn btn-small" data-action="newAccount">+ حساب</button></div>
        <div class="panel"><h2 class="section-title">شركات الشحن</h2>
          ${table(['الشركة', ''], s.couriers.map((c) => `<tr>${td(esc(c.name))}${actions(btn('تعديل', 'editCourier', c.id), btn('حذف', 'delCourier', c.id, 'danger'))}</tr>`))}
          <button class="btn btn-small" data-action="newCourier">+ شركة شحن</button></div>
      </section>
      <section class="panel">
        <h2 class="section-title">استيراد من Excel</h2>
        <p class="muted">ارفع ملف Excel (xlsx) أو CSV فيه مبيعات أو منتجات ومخزون أو مصروفات، زي ملف التصدير من Florume ERP. هتشوف معاينة كاملة قبل ما أي حاجة تتحفظ.</p>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="importExcel">رفع ملف Excel</button>
          <button class="btn" data-action="importTemplate">تنزيل نموذج فاضي</button>
          ${lastImport() ? `<button class="btn btn-danger" data-action="undoImport">تراجع عن آخر استيراد (${esc(lastImport().label)})</button>` : ''}
        </div>
        <h2 class="section-title">فحص سلامة البيانات</h2>
        <p class="muted">بيراجع كل بياناتك على قواعد النظام (الرصيد، تكرار الأرقام، التواريخ، الخزائن، توازن الدفاتر) ويطلعلك أي مشكلة. افحص بعد أي استيراد أو استرجاع نسخة.</p>
        <div class="btn-row"><a class="btn" href="#health">افتح فحص البيانات</a></div>
        <h2 class="section-title">النسخ الاحتياطي</h2>
        <p class="muted">النسخة الاحتياطية ملف JSON فيه كل بياناتك. احفظه على جهازك أو Google Drive أسبوعيًا على الأقل.</p>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="exportBackup">تصدير نسخة احتياطية</button>
          <label class="btn file-btn">استيراد من ملف<input type="file" id="f-import" accept=".json,application/json" data-change="importFile" hidden></label>
          <button class="btn" data-action="pasteBackup">استيراد بلصق النص</button>
        </div>
        <h2 class="section-title danger-title">منطقة الخطر</h2>
        <div class="btn-row">
          <button class="btn" data-action="loadDemo">تحميل البيانات التجريبية</button>
          <button class="btn btn-danger" data-action="resetAll">مسح كل البيانات والبدء من جديد</button>
        </div>
      </section>`;
  }
  function accountForm(a) {
    const isNew = !a; a = a || { id: uid(), name: '', type: 'cash', opening: 0 };
    UI.modal({ title: isNew ? 'حساب جديد' : 'تعديل الحساب',
      body: `<div class="form-grid">${UI.field('اسم الحساب', UI.input('name', a.name, 'required placeholder="بنك مصر، محفظة أورانج كاش…"'), { req: true })}${UI.field('النوع', UI.select('type', ACCOUNT_TYPES, a.type))}${UI.field('الرصيد الافتتاحي', UI.input('opening', a.opening, 'type="number" step="0.01"'), { hint: 'الرصيد في تاريخ بداية الحسابات' })}</div>`,
      onSubmit(f, fd) { DB.upsert('accounts', { ...a, name: fd.get('name').trim(), type: fd.get('type'), opening: num(fd.get('opening')) }); UI.toast('تم حفظ الحساب'); render(); } });
  }
  function courierForm(c) {
    const isNew = !c; c = c || { id: uid(), name: '' };
    UI.modal({ title: isNew ? 'شركة شحن جديدة' : 'تعديل شركة الشحن', body: UI.field('الاسم', UI.input('name', c.name, 'required'), { req: true }),
      onSubmit(f, fd) { DB.upsert('couriers', { ...c, name: fd.get('name').trim() }); UI.toast('تم الحفظ'); render(); } });
  }
  function importState(text) {
    try {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.sales) || !data.settings) throw new Error('bad');
      DB.replace(data); UI.toast('تم استيراد النسخة الاحتياطية — افتح «فحص سلامة البيانات» للتأكد'); render();
    } catch (e) { UI.toast('الملف ليس نسخة احتياطية صالحة من Florume', 'bad'); }
  }

  // =====================================================================
  // التنبيهات
  // =====================================================================
  const ALERT_TYPES = { pending: 'طلبات متأخرة في التجهيز', shipped: 'طلبات متأخرة مع شركة الشحن', settle: 'تحصيل متأخر من شركات الشحن', due: 'مستحقات موردين', stagnant: 'منتجات راكدة', low: 'نواقص المخزون', negative: 'أخطاء رصيد' };
  const alertList = () => OPS.alerts(S(), J(), today(), S().settings.alerts);
  const alertItems = (list) => `<ul class="alert-list">${list.map((a) => `<li class="al-${a.level}"><i aria-hidden="true"></i><div><b>${esc(a.title)}</b><small class="muted">${esc(a.detail)}</small></div>${a.action ? `<button type="button" class="link-btn" data-action="${a.action}" data-id="${esc(a.id || '')}">عرض</button>` : ''}</li>`).join('')}</ul>`;
  let alertFilter = '';
  function alertsPage() {
    const list = alertList();
    const counts = {};
    list.forEach((a) => (counts[a.type] = (counts[a.type] || 0) + 1));
    const shown = list.filter((a) => !alertFilter || a.type === alertFilter);
    const c = S().settings.alerts;
    return `${header('التنبيهات', `بتتحدث تلقائيًا كل ما تفتح البرنامج. الحدود: تجهيز ${c.pendingDays} يوم · مع الشحن ${c.shippedDays} يوم · تحصيل ${c.settleDays} يوم · سداد قبلها ${c.dueDays} أيام · ركود ${c.stagnantDays} يوم (غيّرها من الإعدادات).`)}
      <nav class="tabs" role="tablist"><button role="tab" class="tab ${!alertFilter ? 'active' : ''}" aria-selected="${!alertFilter}" data-action="pickAlert" data-id="">الكل (${list.length})</button>${Object.entries(ALERT_TYPES).filter(([k]) => counts[k]).map(([k, l]) => `<button role="tab" class="tab ${alertFilter === k ? 'active' : ''}" aria-selected="${alertFilter === k}" data-action="pickAlert" data-id="${k}">${l} (${counts[k]})</button>`).join('')}</nav>
      <section class="panel">${shown.length ? alertItems(shown) : UI.empty('مفيش تنبيهات — كل حاجة تمام 👌')}</section>`;
  }

  // =====================================================================
  // فحص سلامة البيانات
  // =====================================================================
  let lastAudit = null;
  function healthPage() {
    const r = RULES.audit(S(), J());
    lastAudit = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const bad = r.checks.filter((c) => c.issues.length);
    const good = r.checks.filter((c) => !c.issues.length);
    const rows = bad.flatMap((c) => c.issues.map((i) => `<tr class="${i.level === 'error' ? 'row-bad' : ''}">${td(esc(c.label))}${td(i.level === 'error' ? UI.pill('خطأ', 'bad') : UI.pill('ملاحظة', 'warn'))}${td(esc(i.text))}${actions(i.action ? `<button type="button" class="link-btn" data-action="${i.action}" data-id="${esc(i.id || '')}">عرض</button>` : '')}</tr>`));
    return `${header('فحص سلامة البيانات', 'بيراجع كل البيانات المسجلة على قواعد النظام، ويطلعلك أي حاجة محتاجة تتصلح. الفحص مش بيغيّر أي حاجة في بياناتك.', '<button class="btn btn-primary" data-action="runAudit">إعادة الفحص</button>')}
      <section class="kpis kpis-3">
        ${kpi('فحوصات سليمة', `${r.passed} من ${r.checks.length}`, `آخر فحص ${lastAudit}`, r.passed === r.checks.length ? 'good' : '')}
        ${kpi('أخطاء لازم تتصلح', fmt(r.errors), r.errors ? 'اضغط «عرض» جنب كل خطأ' : 'مفيش أخطاء', r.errors ? 'bad' : 'good')}
        ${kpi('ملاحظات', fmt(r.notes), 'بيانات ناقصة مش بتأثر على الحسابات')}
      </section>
      ${rows.length ? table(['الفحص', 'النوع', 'المشكلة', ''], rows) : `<section class="panel">${UI.empty('بياناتك سليمة 100٪ 👌')}</section>`}
      <section class="panel"><h2 class="section-title">فحوصات سليمة</h2>
        ${good.length ? `<ul class="check-list">${good.map((c) => `<li>✔ ${esc(c.label)}</li>`).join('')}</ul>` : UI.empty('كل الفحوصات فيها ملاحظات')}
      </section>
      <p class="muted">افحص بعد أي استيراد من Excel أو استرجاع نسخة احتياطية، وآخر كل شهر قبل مراجعة التقارير.</p>`;
  }

  // =====================================================================
  // الحملات الإعلانية
  // =====================================================================
  function campaignsPage() {
    const s = S(), j = J();
    const rows = Acc.campaignPerformance(s, j, period.from, period.to);
    const tot = rows.reduce((t, r) => ({ spend: t.spend + r.spend, revenue: t.revenue + r.revenue, gp: t.gp + r.grossProfit, kept: t.kept + r.orders - r.returned, orders: t.orders + r.orders }), { spend: 0, revenue: 0, gp: 0, kept: 0, orders: 0 });
    const unSpend = s.expenses.filter((e) => e.category === '5300' && !e.campaignId && inPeriod(e.date)).reduce((a, e) => a + num(e.amount), 0);
    const unPromo = s.sales.filter((x) => isPromo(x) && !x.campaignId && Acc.BOOKED.has(x.status) && inPeriod(x.date)).reduce((a, x) => a + (Acc.saleProfit(x, j).promoCost || 0), 0);
    const unOrders = s.sales.filter((x) => !isPromo(x) && !x.campaignId && Acc.BOOKED.has(x.status) && inPeriod(x.date)).length;
    const roasCls = (v) => (v == null ? '' : v >= 3 ? 'good-text' : v < 1.5 ? 'bad-text' : 'warn-text');
    const body = rows.map((r) => {
      const c = DB.find('campaigns', r.id) || {};
      const used = r.budget ? r.spend / r.budget : null;
      return `<tr>${td(`<b>${esc(r.name)}</b>${c.startDate ? `<br><small class="muted">${fmtDate(c.startDate)} — ${fmtDate(c.endDate)}</small>` : ''}`)}${td(CHANNELS[r.platform] || '—')}
        ${tdn(r.budget ? fmt(r.budget) : '—')}${tdn(`${fmt(r.spend)}${used != null ? `<br><small class="${used > 1 ? 'bad-text' : 'muted'}">${pct(used)} من الميزانية</small>` : ''}${r.promoCost ? `<br><small class="muted">منها دعاية ${fmt(r.promoCost)}</small>` : ''}`)}
        ${tdn(`${r.orders}${r.pending ? ` <small class="muted">+${r.pending} قيد التجهيز</small>` : ''}`)}${tdn(r.returned ? `<span class="bad-text">${r.returned}</span> <small class="muted">(${pct(r.returnRate)})</small>` : '0')}
        ${tdn(fmt(r.revenue))}${tdn(fmt(r.grossProfit))}${tdn(`<b class="${r.netProfit < 0 ? 'bad-text' : 'good-text'}">${fmt(r.netProfit)}</b>`)}
        ${tdn(r.cpa == null ? '—' : fmt(r.cpa, 0))}${tdn(r.roas == null ? '—' : `<b class="${roasCls(r.roas)}">${fmt(r.roas, 2)}x</b>`)}
        ${actions(btn('تعديل', 'editCampaign', r.id), btn('حذف', 'delCampaign', r.id, 'danger'))}</tr>`;
    });
    const roas = tot.spend ? tot.revenue / tot.spend : null;
    return `${header('الحملات الإعلانية', 'اربط الطلبات ومصروفات الإعلانات وفواتير الدعاية بالحملة، وشوف تكلفة الطلب الواحد (CPA) والعائد على الإعلان (ROAS) وصافي ربح كل حملة.', `${periodBar()}<button class="btn btn-primary" data-action="newCampaign">+ حملة جديدة</button>`)}
      <section class="kpis">
        ${kpi('إنفاق الحملات', money0(tot.spend), 'إعلانات + قطع دعاية')}
        ${kpi('مبيعات الحملات', money0(tot.revenue), `${tot.orders} طلب`)}
        ${kpi('العائد على الإعلان ROAS', roas == null ? '—' : `${fmt(roas, 2)}x`, 'كل جنيه إعلان جاب كام مبيعات', roas != null && roas < 1.5 ? 'bad' : '')}
        ${kpi('تكلفة الطلب CPA', tot.kept ? money0(tot.spend / tot.kept) : '—', 'بعد استبعاد المرتجع')}
        ${kpi('صافي ربح الحملات', money0(tot.gp - tot.spend), 'بعد البضاعة والشحن والإعلان', tot.gp - tot.spend < 0 ? 'bad' : 'good')}
      </section>
      ${table(['الحملة', 'المنصة', '#الميزانية', '#الإنفاق', '#الطلبات', '#المرتجع', '#المبيعات', '#الربح قبل الإعلان', '#صافي الربح', '#CPA', '#ROAS', ''], body, { empty: 'لا توجد حملات بعد — أضف حملة واربط بيها الطلبات ومصروفات الإعلانات' })}
      <p class="muted">غير مربوط بحملة في الفترة: ${fmt(unSpend)} ج.م مصروفات إعلانات${unPromo ? ` + ${fmt(unPromo)} ج.م قطع دعاية` : ''} · ${unOrders} طلب. الربح قبل الإعلان = قيمة الطلب − تكلفة البضاعة − مصاريف الشحن والمرتجع.</p>`;
  }
  function campaignForm(c) {
    const isNew = !c;
    c = c || { id: uid(), name: '', platform: 'facebook', startDate: today(), endDate: '', budget: '', notes: '' };
    UI.modal({ title: isNew ? 'حملة جديدة' : 'تعديل الحملة',
      body: `<div class="form-grid">${UI.field('اسم الحملة', UI.input('name', c.name, 'required placeholder="عروض رمضان، إطلاق عطر…"'), { req: true })}${UI.field('المنصة', UI.select('platform', CHANNELS, c.platform))}${UI.field('من', UI.input('startDate', c.startDate, 'type="date"'))}${UI.field('إلى', UI.input('endDate', c.endDate, 'type="date"'))}${UI.field('الميزانية (ج.م)', UI.input('budget', c.budget, 'type="number" min="0" step="0.01"'))}${UI.field('ملاحظات', UI.input('notes', c.notes))}</div>`,
      onSubmit(f, fd) {
        if (fd.get('startDate') && fd.get('endDate') && fd.get('endDate') < fd.get('startDate')) return fail('نهاية الحملة قبل بدايتها');
        DB.upsert('campaigns', { ...c, name: fd.get('name').trim(), platform: fd.get('platform'), startDate: fd.get('startDate'), endDate: fd.get('endDate'), budget: num(fd.get('budget')), notes: fd.get('notes') }); UI.toast('تم حفظ الحملة'); render(); } });
  }

  // =====================================================================
  // تسوية كشف حساب شركة الشحن
  // =====================================================================
  let reconCourier = null;
  function reconcilePage() {
    const s = S(), j = J();
    if (!reconCourier || !s.couriers.some((c) => c.id === reconCourier)) reconCourier = (s.couriers[0] || {}).id;
    const un = OPS.unsettledByCourier(s, today());
    const bal = Acc.courierBalances(s, j);
    const cards = s.couriers.map((c) => {
      const u = un[c.id] || { count: 0, net: 0, days: 0 };
      return `<button class="acc-card ${c.id === reconCourier ? 'active' : ''}" data-action="pickCourier" data-id="${c.id}"><span>${esc(c.name)}</span><b>${u.count} طلب لسه ما اتسوّاش</b><strong>${money(u.net)}</strong><small class="${u.days >= s.settings.alerts.settleDays ? 'bad-text' : 'muted'}">${u.count ? `أقدم طلب من ${u.days} يوم` : 'كله متسوّي'} · الرصيد الدفتري ${fmt(bal[c.id] || 0)}</small></button>`;
    }).join('');
    const pend = (un[reconCourier] || { sales: [] }).sales.map((id) => DB.find('sales', id)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const hist = [...s.reconciliations].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => `<tr>${td(fmtDate(r.date))}${td(esc(nameOf('couriers', r.courierId)))}${td(esc(r.fileName || ''))}${tdn(r.lines.length)}${tdn(fmt(r.net))}${td(r.settlementId && DB.find('settlements', r.settlementId) ? UI.pill('تم تسجيل التحصيل', 'good') : UI.pill('بدون تحصيل', 'mute'))}${actions(btn('التفاصيل', 'viewReconciliation', r.id), btn('حذف', 'delReconciliation', r.id, 'danger'))}</tr>`);
    return `${header('تسوية شركات الشحن', 'ارفع كشف الحساب اللي بتبعته شركة الشحن (Excel أو CSV)، والنظام يطابقه مع طلباتك برقم البوليصة أو رقم الفاتورة ويطلعلك الفروق.', '<button class="btn" data-action="statementTemplate">نموذج كشف</button><button class="btn btn-primary" data-action="uploadStatement">رفع كشف حساب</button>')}
      <section class="acc-cards">${cards || UI.empty('أضف شركة شحن من الإعدادات')}</section>
      <h2 class="section-title">طلبات اتسلمت مع ${esc(nameOf('couriers', reconCourier))} ولسه ما دخلتش في أي كشف</h2>
      ${table(['الفاتورة', 'التاريخ', 'البوليصة', 'العميل', 'الحالة', '#المحصل المتوقع', '#مصاريف الشحن', '#الصافي المتوقع', '#من كام يوم'], pend.map((x) => { const e = OPS.expectedFor(x); const age = OPS.daysBetween(x.date, today()); return `<tr>${td(`<button class="link-btn strong" data-action="viewSale" data-id="${x.id}">${esc(invoiceNo(x))}</button>`)}${td(fmtDate(x.date))}${td(esc(x.trackingNo || '—'), 'mono')}${td(esc(nameOf('customers', x.customerId)))}${td(UI.pill(STATUSES[x.status], statusKind[x.status]))}${tdn(fmt(e.cod))}${tdn(fmt(e.fee))}${tdn(fmt(e.net))}${tdn(`<span class="${age >= S().settings.alerts.settleDays ? 'bad-text' : ''}">${age}</span>`)}</tr>`; }), { empty: 'كل الطلبات المسلّمة اتسوّت 👌' })}
      <h2 class="section-title">الكشوف اللي اتسوّت</h2>
      ${table(['التاريخ', 'شركة الشحن', 'الملف', '#عدد الطلبات', '#الصافي', 'التحصيل', ''], hist, { empty: 'لم ترفع أي كشف بعد' })}`;
  }
  function pickStatementFile() {
    if (!S().couriers.length) { UI.toast('أضف شركة شحن من الإعدادات', 'bad'); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xlsx,.csv,.txt'; input.hidden = true;
    input.addEventListener('change', async () => {
      const file = input.files[0]; input.remove();
      if (!file) return;
      try {
        const parsed = OPS.parseStatement(await IMP.readWorkbook(file));
        if (!parsed || !parsed.rows.length) { UI.toast('مش لاقي عمود «رقم البوليصة» أو «رقم الطلب» ومعاه «المبلغ المحصل» أو «مصاريف الشحن» في الملف', 'bad'); return; }
        reconcilePreview(file.name, parsed);
      } catch (err) { UI.toast(err.message || 'تعذرت قراءة الملف', 'bad'); }
    });
    document.body.appendChild(input);
    input.click();
  }
  function reconcilePreview(fileName, parsed) {
    const s = S();
    const opts = { courierId: reconCourier || s.couriers[0].id, updateFees: true, updateStatus: true, settle: true, accountId: (s.accounts.find((a) => a.type === 'bank') || s.accounts[0] || {}).id, date: today(), amount: null };
    let res;
    const run = () => { res = OPS.reconcile(S(), opts.courierId, parsed.rows, S().settings.invoicePrefix); if (opts.amount == null) opts.amount = res.totals.statementNet; };
    run();
    const saleCell = (id) => { const x = DB.find('sales', id); return x ? `<button type="button" class="link-btn strong" data-action="viewSale" data-id="${x.id}">${esc(invoiceNo(x))}</button>` : '—'; };
    const view = () => {
      const t = res.totals;
      const bad = res.matched.filter((m) => m.issues.length), ok = res.matched.filter((m) => !m.issues.length);
      const mrow = (m) => `<tr class="${m.issues.length ? 'row-warn' : ''}">${td(esc(m.ref), 'mono')}${td(saleCell(m.saleId))}${td(esc(m.status || '—'))}${tdn(fmt(m.cod))}${tdn(fmt(m.expected.cod))}${tdn(fmt(m.fee))}${tdn(fmt(m.expected.fee))}${td(m.issues.map((i) => `<span class="bad-text">${esc(i)}</span>`).join('<br>') || UI.pill('مطابق', 'good'))}</tr>`;
      const head = ['البوليصة / الرقم', 'الفاتورة', 'الحالة في الكشف', '#المحصل', '#المتوقع', '#مصاريف الكشف', '#مصاريفنا', 'الملاحظة'];
      return `
        <p class="muted">الملف: <b>${esc(fileName)}</b> — ورقة «${esc(parsed.sheet)}» — ${parsed.rows.length} سطر</p>
        <div class="form-grid">${UI.field('شركة الشحن', UI.select('rcCourier', s.couriers.map((c) => ({ v: c.id, l: c.name })), opts.courierId, 'data-rc="courierId"'))}</div>
        <div class="summary">
          <div><span>إجمالي المحصل في الكشف</span><b>${fmt(t.statementCod)}</b></div>
          <div><span>مصاريف الشحن في الكشف</span><b>${fmt(t.statementFee)}</b></div>
          <div class="strong"><span>صافي الكشف (المفروض يتحول لك)</span><b>${fmt(t.statementNet)} ج.م</b></div>
          <div><span>الصافي المتوقع حسب طلباتك</span><b>${fmt(t.expectedNet)}</b></div>
          <div class="${t.codDiff < -0.5 ? 'bad-text' : ''}"><span>فرق التحصيل</span><b>${fmt(t.codDiff)}</b></div>
          <div class="${t.feeDiff > 0.5 ? 'bad-text' : ''}"><span>فرق المصاريف</span><b>${fmt(t.feeDiff)}</b></div>
        </div>
        ${bad.length ? `<h3 class="sub-title bad-text">طلبات فيها فروق (${bad.length})</h3>${table(head, bad.map(mrow))}` : '<p class="good-text"><b>كل الطلبات اللي في الكشف مطابقة ✔</b></p>'}
        ${res.unmatched.length ? `<h3 class="sub-title bad-text">سطور في الكشف مش لاقي لها طلب (${res.unmatched.length})</h3>${table(['البوليصة / الرقم', 'الحالة', '#المحصل', '#المصاريف'], res.unmatched.map((r) => `<tr>${td(esc(r.ref), 'mono')}${td(esc(r.status || '—'))}${tdn(fmt(r.cod))}${tdn(fmt(r.fee))}</tr>`))}<p class="muted">سجّل رقم البوليصة في الطلب (تعديل الطلب ← رقم البوليصة) وارفع الكشف تاني.</p>` : ''}
        ${res.missing.length ? `<h3 class="sub-title warn-text">طلبات اتسلمت ومش موجودة في الكشف (${res.missing.length}) — صافي ${fmt(t.missingNet)} ج.م</h3>${table(['الفاتورة', 'التاريخ', 'الحالة', '#الصافي المتوقع'], res.missing.map((m) => { const x = DB.find('sales', m.saleId); return `<tr>${td(saleCell(m.saleId))}${td(fmtDate(m.date))}${td(UI.pill(STATUSES[x.status], statusKind[x.status]))}${tdn(fmt(m.expected.net))}</tr>`; }))}` : ''}
        ${ok.length ? `<details class="imp-box"><summary>${ok.length} طلب مطابق (اضغط للتفاصيل)</summary>${table(head, ok.map(mrow))}</details>` : ''}
        ${res.duplicates.length ? `<div class="imp-box warn"><b>${res.duplicates.length} سطر مكرر في الكشف لنفس الطلب — اتحسب مرة واحدة.</b></div>` : ''}
        <h3 class="sub-title">عند الحفظ</h3>
        <label class="check"><input type="checkbox" data-rc="updateFees" ${opts.updateFees ? 'checked' : ''}> عدّل مصاريف الشحن والمرتجع في الطلبات حسب الكشف</label>
        <label class="check"><input type="checkbox" data-rc="updateStatus" ${opts.updateStatus ? 'checked' : ''}> عدّل حالة الطلبات (تم التسليم / مرتجع) حسب الكشف</label>
        <label class="check"><input type="checkbox" data-rc="settle" ${opts.settle ? 'checked' : ''}> سجّل التحصيل في الخزينة</label>
        <div class="form-grid" ${opts.settle ? '' : 'hidden'}>
          ${UI.field('المبلغ اللي وصلك فعلًا', UI.input('rcAmount', opts.amount, 'type="number" step="0.01" data-rc="amount"'), { hint: 'صافي التحويل من شركة الشحن' })}
          ${UI.field('إلى حساب', UI.select('rcAccount', accountOptions(), opts.accountId, 'data-rc="accountId"'))}
          ${UI.field('تاريخ التحويل', UI.input('rcDate', opts.date, 'type="date" data-rc="date"'))}
        </div>`;
    };
    UI.modal({ title: 'مطابقة كشف شركة الشحن', wide: true, submit: 'حفظ التسوية', body: `<div id="rc-view">${view()}</div>`,
      onOpen(f) {
        const box = f.querySelector('#rc-view');
        box.addEventListener('change', (e) => {
          const k = e.target.dataset.rc;
          if (!k) return;
          opts[k] = e.target.type === 'checkbox' ? e.target.checked : k === 'amount' ? num(e.target.value) : e.target.value;
          if (k === 'courierId') { opts.amount = null; run(); }
          if (k !== 'amount' && k !== 'date' && k !== 'accountId') box.innerHTML = view();
        });
      },
      onSubmit() {
        const fresh = res.matched.filter((m) => !m.alreadyReconciled);
        if (!fresh.length && !opts.settle) { UI.toast('مفيش طلبات جديدة في الكشف', 'bad'); return false; }
        if (!dateOk(opts.date || today(), 'تاريخ التسوية')) return false;
        let changed = 0;
        fresh.forEach((m) => {
          const sale = DB.find('sales', m.saleId);
          const upd = { ...sale };
          if (opts.updateStatus && m.statementStatus && m.statementStatus !== sale.status && sale.status !== 'cancelled') {
            upd.status = m.statementStatus;
            if (m.statementStatus === 'returned' && !upd.returnDate) upd.returnDate = m.date || today();
          }
          if (opts.updateFees && Math.abs(m.feeDiff) > 0.5) {
            if (upd.status === 'returned') { const base = Math.min(num(upd.courierFee), m.fee); upd.courierFee = base; upd.returnFee = Acc.round2(m.fee - base); }
            else upd.courierFee = m.fee;
          }
          if (JSON.stringify(upd) !== JSON.stringify(sale)) { Object.assign(sale, upd); changed++; }
        });
        const rec = { id: uid(), date: opts.date || today(), courierId: opts.courierId, fileName, net: res.totals.statementNet,
          lines: fresh.map((m) => ({ saleId: m.saleId, ref: m.ref, cod: m.cod, fee: m.fee, status: m.status })), unmatched: res.unmatched.map((r) => ({ ref: r.ref, cod: r.cod, fee: r.fee, status: r.status })) };
        if (opts.settle && num(opts.amount)) {
          const st = { id: uid(), date: opts.date || today(), courierId: opts.courierId, accountId: opts.accountId, amount: num(opts.amount), notes: `تسوية كشف ${fileName}` };
          S().settlements.push(st); rec.settlementId = st.id;
        }
        S().reconciliations.push(rec);
        DB.save();
        reconCourier = opts.courierId;
        UI.toast(`تمت تسوية ${fresh.length} طلب${changed ? ` وتعديل ${changed}` : ''}${rec.settlementId ? ' وتسجيل التحصيل' : ''}`);
        render();
      } });
  }
  function viewReconciliation(r) {
    UI.modal({ title: `كشف ${esc(nameOf('couriers', r.courierId))} — ${fmtDate(r.date)}`, wide: true, tools: { title: `تسوية ${nameOf('couriers', r.courierId)}`, subtitle: `${r.fileName || ''} — ${fmtDate(r.date)}`, file: 'courier-reconciliation' },
      body: `${table(['الفاتورة', 'البوليصة / الرقم', 'الحالة', '#المحصل', '#المصاريف', '#الصافي'], r.lines.map((l) => { const x = DB.find('sales', l.saleId) || {}; return `<tr>${td(esc(invoiceNo(x)))}${td(esc(l.ref || x.trackingNo || ''), 'mono')}${td(esc(l.status || ''))}${tdn(l.cod != null ? fmt(l.cod) : '—')}${tdn(l.fee != null ? fmt(l.fee) : '—')}${tdn(l.cod != null ? fmt(num(l.cod) - num(l.fee)) : '—')}</tr>`; }), { foot: `<tr><td colspan="5">صافي الكشف</td>${tdn(fmt(r.net))}</tr>` })}
        ${(r.unmatched || []).length ? `<h3 class="sub-title">سطور ما اتطابقتش</h3>${table(['البوليصة / الرقم', 'الحالة', '#المحصل', '#المصاريف'], r.unmatched.map((u) => `<tr>${td(esc(u.ref), 'mono')}${td(esc(u.status || ''))}${tdn(fmt(u.cod))}${tdn(fmt(u.fee))}</tr>`))}` : ''}` });
  }

  // =====================================================================
  // الشركاء وتوزيع الأرباح
  // =====================================================================
  function partnersPage() {
    const s = S(), j = J();
    const acc = Acc.partnerAccounts(s, j);
    const shares = s.partners.reduce((a, p) => a + num(p.share), 0);
    const rows = acc.map((r) => `<tr>${td(`<b>${esc(r.name)}</b>`)}${tdn(pct(r.share / 100))}${tdn(fmt(r.capital))}${tdn(fmt(r.distributed))}${tdn(fmt(r.drawn))}${tdn(`<b class="${r.balance < 0 ? 'bad-text' : ''}">${fmt(r.balance)}</b>`)}${actions(btn('مسحوبات', 'partnerDrawing', r.id), btn('كشف حساب', 'partnerStatement', r.id), btn('تعديل', 'editPartner', r.id), btn('حذف', 'delPartner', r.id, 'danger'))}</tr>`);
    const dist = [...s.distributions].sort((a, b) => (a.date < b.date ? 1 : -1)).map((d) => `<tr>${td(fmtDate(d.date))}${td(`${fmtDate(d.from)} — ${fmtDate(d.to)}`)}${tdn(d.profit != null ? fmt(d.profit) : '—')}${tdn(d.retainPct ? pct(d.retainPct / 100) : '—')}${td(d.allocations.map((a) => `${esc(nameOf('partners', a.partnerId))}: ${fmt(a.amount)}`).join('<br>'))}${tdn(`<b>${fmt(d.allocations.reduce((x, a) => x + num(a.amount), 0))}</b>`)}${actions(btn('حذف', 'delDistribution', d.id, 'danger'))}</tr>`);
    return `${header('الشركاء وتوزيع الأرباح', 'نسبة كل شريك، رأس ماله، وحسابه الجاري: نصيبه من الأرباح الموزعة ناقص مسحوباته.', '<button class="btn" data-action="newPartner">+ شريك</button><button class="btn btn-primary" data-action="newDistribution">توزيع أرباح</button>')}
      ${s.partners.length && Math.abs(shares - 100) > 0.01 ? `<div class="imp-box warn"><b>مجموع نسب الشركاء ${fmt(shares)}٪ مش 100٪</b> — التوزيع هيتم بنسبة كل شريك من المجموع.</div>` : ''}
      ${table(['الشريك', '#النسبة', '#رأس المال', '#أرباح موزعة', '#مسحوبات', '#رصيد الجاري', ''], rows, { empty: 'أضف الشركاء ونسبة كل واحد', foot: rows.length ? `<tr><td>الإجمالي</td>${tdn(pct(shares / 100))}${tdn(fmt(acc.reduce((a, r) => a + r.capital, 0)))}${tdn(fmt(acc.reduce((a, r) => a + r.distributed, 0)))}${tdn(fmt(acc.reduce((a, r) => a + r.drawn, 0)))}${tdn(fmt(acc.reduce((a, r) => a + r.balance, 0)))}<td></td></tr>` : '' })}
      <p class="muted">رصيد الجاري الموجب = أرباح مستحقة للشريك لسه ما سحبهاش. رأس المال بيتسجل من الخزينة ← «رأس مال / مسحوبات» مع اختيار الشريك.</p>
      <h2 class="section-title">توزيعات الأرباح</h2>
      ${table(['تاريخ التوزيع', 'الفترة', '#صافي ربح الفترة', '#محتجز', 'نصيب الشركاء', '#الإجمالي', ''], dist, { empty: 'لم توزع أرباح بعد' })}`;
  }
  function partnerForm(p) {
    const isNew = !p;
    const left = 100 - S().partners.filter((x) => !p || x.id !== p.id).reduce((a, x) => a + num(x.share), 0);
    p = p || { id: uid(), name: '', share: Math.max(0, left), notes: '' };
    UI.modal({ title: isNew ? 'شريك جديد' : 'تعديل الشريك',
      body: `<div class="form-grid">${UI.field('اسم الشريك', UI.input('name', p.name, 'required'), { req: true })}${UI.field('نسبته من الأرباح ٪', UI.input('share', p.share, 'type="number" min="0" max="100" step="0.01" required'), { req: true, hint: `المتبقي من 100٪: ${fmt(left)}٪` })}${UI.field('ملاحظات', UI.input('notes', p.notes), { cls: 'span-2' })}</div>`,
      onSubmit(f, fd) {
        const obj = { ...p, name: fd.get('name').trim(), share: num(fd.get('share')), notes: fd.get('notes') };
        if (!(obj.share > 0)) return fail('نسبة الشريك لازم تكون أكبر من صفر');
        const total = RULES.sharesTotal(S().partners, obj);
        if (total > 100.001) return fail(`مجموع نسب الشركاء هيبقى ${fmt(total)}٪ — لازم ما يزيدش عن 100٪. قلّل نسبة شريك تاني الأول`);
        DB.upsert('partners', obj); UI.toast(total < 99.999 ? `تم الحفظ — المجموع ${fmt(total)}٪، كمّل للـ 100٪ قبل توزيع الأرباح` : 'تم حفظ الشريك'); render();
      } });
  }
  function distributionForm() {
    const s = S();
    if (!s.partners.length) { UI.toast('أضف الشركاء الأول', 'bad'); return; }
    const pm = presetRange('lastMonth');
    const last = [...s.distributions].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const st = { from: pm.from, to: pm.to, retain: last ? num(last.retainPct) : 0 };
    let plan;
    const view = () => {
      plan = Acc.distributionPlan(S(), J(), st.from, st.to, st.retain);
      return `<div class="summary">
          <div><span>صافي ربح الفترة</span><b class="${plan.netProfit < 0 ? 'bad-text' : ''}">${fmt(plan.netProfit)}</b></div>
          <div><span>محتجز في النشاط</span><b>${fmt(plan.retained)}</b></div>
          ${plan.already ? `<div><span>اتوزع قبل كده من نفس الفترة</span><b>${fmt(plan.already)}</b></div>` : ''}
          <div class="strong"><span>المتاح للتوزيع</span><b>${fmt(plan.distributable)} ج.م</b></div></div>
        ${table(['الشريك', '#النسبة', '#نصيبه'], plan.allocations.map((a) => `<tr>${td(esc(nameOf('partners', a.partnerId)))}${tdn(pct(a.share / 100))}${tdn(`<b>${fmt(a.amount)}</b>`)}</tr>`))}
        ${plan.netProfit <= 0 ? '<p class="bad-text">مفيش ربح في الفترة دي للتوزيع.</p>' : ''}
        <p class="muted">التوزيع بيضيف نصيب كل شريك لحسابه الجاري، ولما يسحب فلوسه سجّلها «مسحوبات» باسمه.</p>`;
    };
    UI.modal({ title: 'توزيع أرباح على الشركاء', wide: true, submit: 'اعتماد التوزيع',
      body: `<div class="form-grid">${UI.field('من', UI.input('from', st.from, 'type="date" required'), { req: true })}${UI.field('إلى', UI.input('to', st.to, 'type="date" required'), { req: true })}${UI.field('نسبة محتجزة في النشاط ٪', UI.input('retain', st.retain, 'type="number" min="0" max="100" step="1"'), { hint: 'جزء من الربح يفضل للتوسع وشراء بضاعة' })}${UI.field('تاريخ التوزيع', UI.input('date', st.to, 'type="date" required'), { req: true })}${UI.field('ملاحظات', UI.input('notes', ''), { cls: 'span-2' })}</div><div id="dist-view">${view()}</div>`,
      onOpen(f) { f.addEventListener('change', (e) => { if (!['from', 'to', 'retain'].includes(e.target.name)) return; st.from = f.from.value; st.to = f.to.value; st.retain = num(f.retain.value); if (e.target.name === 'to') f.date.value = st.to; f.querySelector('#dist-view').innerHTML = view(); }); },
      onSubmit(f, fd) {
        const shares = RULES.sharesTotal(S().partners);
        if (Math.abs(shares - 100) > 0.001) return fail(`مجموع نسب الشركاء ${fmt(shares)}٪ — لازم يبقى 100٪ بالظبط قبل التوزيع`);
        if (st.to < st.from) return fail('نهاية الفترة قبل بدايتها');
        if (!dateOk(fd.get('date'), 'تاريخ التوزيع')) return false;
        if (plan.distributable <= 0) { UI.toast('مفيش مبلغ متاح للتوزيع', 'bad'); return false; }
        DB.upsert('distributions', { id: uid(), date: fd.get('date'), from: st.from, to: st.to, retainPct: st.retain, profit: plan.netProfit, allocations: plan.allocations.map((a) => ({ partnerId: a.partnerId, amount: a.amount })), notes: fd.get('notes') });
        UI.toast(`تم توزيع ${fmt(plan.distributable)} ج.م`); render();
      } });
  }
  function partnerStatement(p) {
    const rows = [];
    let bal = 0;
    J().entries.forEach((e) => e.lines.forEach((l) => {
      if (!l.party || l.party.type !== 'partner' || l.party.id !== p.id || l.acc !== '3500') return;
      bal += l.cr - l.dr;
      rows.push(`<tr>${td(fmtDate(e.date))}${td(esc(e.desc))}${tdn(l.cr ? fmt(l.cr) : '')}${tdn(l.dr ? fmt(l.dr) : '')}${tdn(fmt(bal))}</tr>`);
    }));
    const cap = Acc.partnerAccounts(S(), J()).find((x) => x.id === p.id) || { capital: 0 };
    UI.modal({ title: `الحساب الجاري — ${esc(p.name)}`, wide: true, tools: { title: `الحساب الجاري للشريك — ${p.name}`, subtitle: `النسبة ${fmt(p.share)}٪ · رأس المال ${fmt(cap.capital)}`, file: 'partner-statement' },
      body: `<p class="muted">النسبة ${fmt(p.share)}٪ · رأس المال ${fmt(cap.capital)} ج.م</p>${table(['التاريخ', 'البيان', '#له (أرباح)', '#عليه (مسحوبات)', '#الرصيد'], rows, { empty: 'لا توجد حركة' })}` });
  }

  // =====================================================================
  // تقسيم العبوات (ديكانت)
  // =====================================================================
  function decantForm() {
    const s = S(), inv = J().inventory.products;
    const sources = s.products.filter((p) => !p.decantOf && num(p.sizeMl) > 0);
    if (!sources.length) { UI.toast('سجّل حجم العبوة (مل) في المنتج الأول', 'bad'); return; }
    const first = sources.find((p) => (inv[p.id] || {}).qty > 0) || sources[0];
    const outRow = (o = {}) => `<tr class="line"><td><input class="o-size" type="number" min="1" step="1" value="${o.size || ''}" aria-label="الحجم مل"></td><td><input class="o-qty" type="number" min="1" step="1" value="${o.qty || ''}" aria-label="عدد العبوات"></td><td><input class="o-price" type="number" min="0" step="0.01" value="${o.price ?? ''}" aria-label="سعر البيع"></td><td class="num o-ml">0</td><td class="num o-cost">0</td><td class="o-prod muted"></td><td><button type="button" class="icon-btn" data-line-remove aria-label="حذف السطر">✕</button></td></tr>`;
    const existing = (srcId, size) => S().products.find((p) => p.decantOf === srcId && num(p.sizeMl) === num(size));
    UI.modal({ title: 'تقسيم عبوة إلى ديكانت', wide: true, submit: 'تسجيل التقسيم',
      body: `<div class="form-grid">
          ${UI.field('التاريخ', UI.input('date', today(), 'type="date" required'), { req: true })}
          ${UI.field('العبوة الأصلية', UI.select('sourceProductId', sources.map((p) => ({ v: p.id, l: `${productLabel(p)} — متاح ${fmt((inv[p.id] || {}).available || 0)}` })), first.id))}
          ${UI.field('عدد العبوات اللي هتتفتح', UI.input('sourceQty', 1, 'type="number" min="1" step="1" required'), { req: true })}
          ${UI.field('تكلفة العبوات الفاضية والستيكرات', UI.input('materialsCost', 0, 'type="number" min="0" step="0.01"'))}
          ${UI.field('دُفعت من', UI.select('accountId', accountOptions(), (s.accounts[0] || {}).id))}
          ${UI.field('ملاحظات', UI.input('notes', ''))}
        </div>
        <p class="muted" id="src-info"></p>
        <h3 class="sub-title">العبوات الناتجة</h3>
        <div class="table-wrap"><table class="lines"><thead><tr><th>الحجم (مل)</th><th>العدد</th><th>سعر بيع العبوة</th><th class="num">مللي</th><th class="num">تكلفة العبوة</th><th>المنتج</th><th></th></tr></thead><tbody id="outs">${outRow({ size: 5 })}${outRow({ size: 10 })}</tbody></table></div>
        <button type="button" class="btn btn-small" id="add-out">+ حجم تاني</button>
        <div class="summary" id="dec-sum"></div>`,
      onOpen(f) {
        const outs = f.querySelector('#outs');
        const recalc = () => {
          const src = productById(f.sourceProductId.value), st = inv[src.id] || { avgCost: 0, available: 0 };
          const q = num(f.sourceQty.value), srcMl = q * num(src.sizeMl), srcCost = q * st.avgCost, mat = num(f.materialsCost.value);
          const rows = [...outs.querySelectorAll('.line')];
          const ml = rows.reduce((a, r) => a + num(r.querySelector('.o-size').value) * num(r.querySelector('.o-qty').value), 0);
          const perMl = ml ? (srcCost + mat) / ml : 0;
          rows.forEach((r) => {
            const size = num(r.querySelector('.o-size').value), n = num(r.querySelector('.o-qty').value);
            r.querySelector('.o-ml').textContent = fmt(size * n);
            r.querySelector('.o-cost').textContent = fmt(size * perMl);
            const ex = size && existing(src.id, size);
            r.querySelector('.o-prod').textContent = !size ? '' : ex ? productLabel(ex) : 'منتج جديد هيتعمل';
            const pr = r.querySelector('.o-price');
            if (ex && pr.value === '') pr.value = ex.price || '';
            if (!ex && size && pr.value === '' && src.price && src.sizeMl) pr.placeholder = fmt(Math.ceil((src.price / src.sizeMl) * size * 1.6 / 5) * 5);
          });
          f.querySelector('#src-info').textContent = `متوسط تكلفة العبوة ${fmt(st.avgCost)} ج.م · ${fmt(src.sizeMl)} مل · تكلفة المللي قبل العبوات ${fmt(src.sizeMl ? st.avgCost / src.sizeMl : 0)} ج.م`;
          f.querySelector('#dec-sum').innerHTML = `<div><span>مللي العبوة الأصلية</span><b>${fmt(srcMl)}</b></div><div class="${ml > srcMl ? 'bad-text' : ''}"><span>مللي الديكانت</span><b>${fmt(ml)}</b></div><div><span>فاقد / متبقي</span><b>${fmt(srcMl - ml)} مل</b></div><div><span>تكلفة العطر + العبوات</span><b>${fmt(srcCost + mat)}</b></div><div class="strong"><span>تكلفة المللي الفعلية</span><b>${fmt(perMl)} ج.م</b></div>`;
        };
        f.querySelector('#add-out').addEventListener('click', () => { outs.insertAdjacentHTML('beforeend', outRow({})); recalc(); });
        outs.addEventListener('click', (e) => { if (e.target.closest('[data-line-remove]') && outs.children.length > 1) { e.target.closest('tr').remove(); recalc(); } });
        f.addEventListener('input', recalc); f.addEventListener('change', recalc);
        recalc();
      },
      onSubmit(f, fd) {
        const src = productById(fd.get('sourceProductId'));
        const q = num(fd.get('sourceQty'));
        const rows = [...f.querySelectorAll('#outs .line')].map((r) => ({ size: num(r.querySelector('.o-size').value), qty: num(r.querySelector('.o-qty').value), price: r.querySelector('.o-price').value === '' ? num(r.querySelector('.o-price').placeholder.replace(/,/g, '')) : num(r.querySelector('.o-price').value) })).filter((r) => r.size > 0 && r.qty > 0);
        if (!rows.length) { UI.toast('أضف حجم وعدد العبوات الناتجة', 'bad'); return false; }
        const ml = rows.reduce((a, r) => a + r.size * r.qty, 0);
        if (ml > q * num(src.sizeMl) + 0.01) { UI.toast(`مجموع الديكانت ${fmt(ml)} مل أكبر من العبوة الأصلية ${fmt(q * num(src.sizeMl))} مل`, 'bad'); return false; }
        if (num(fd.get('materialsCost')) && !fd.get('accountId')) { UI.toast('اختر الحساب اللي اتدفعت منه العبوات', 'bad'); return false; }
        if (!dateOk(fd.get('date'))) return false;
        const out = RULES.checkStockOut(J(), src.id, q);
        if (out) return fail(stockMsg([out]));
        if (!cashOk(f, RULES.withDoc(S(), 'decants', { id: '__check', date: fd.get('date'), sourceProductId: src.id, sourceQty: q, outputs: [], materialsCost: num(fd.get('materialsCost')), accountId: fd.get('accountId') }))) return false;
        const outputs = rows.map((r) => {
          let p = existing(src.id, r.size);
          if (!p) {
            p = { id: uid(), sku: src.sku ? `${src.sku}-D${r.size}` : '', brand: src.brand, name: `${src.name} (ديكانت)`, sizeMl: r.size, gender: src.gender, price: r.price, minStock: S().settings.lowStock, decantOf: src.id };
            S().products.push(p);
          }
          return { productId: p.id, qty: r.qty };
        });
        DB.upsert('decants', { id: uid(), date: fd.get('date'), sourceProductId: src.id, sourceQty: q, outputs, materialsCost: num(fd.get('materialsCost')), accountId: fd.get('accountId'), notes: fd.get('notes') });
        UI.toast(`تم تقسيم ${q} عبوة إلى ${rows.reduce((a, r) => a + r.qty, 0)} ديكانت`); render();
      } });
  }
  // فك بوكس: البوكس يخرج من المخزون وقطعه تدخل، وتكلفته تتوزع على القطع بنسبة سعر بيعها
  function unboxForm() {
    const s = S(), inv = J().inventory.products;
    const stocked = s.products.filter((p) => (inv[p.id] || {}).available > 0);
    if (!stocked.length) { UI.toast('مفيش منتجات في المخزون', 'bad'); return; }
    const boxes = [...stocked.filter((p) => p.boxItems && p.boxItems.length), ...stocked.filter((p) => !(p.boxItems && p.boxItems.length))];
    const pieceRow = (it = {}) => `<tr class="line"><td>${UI.select('u-product', productOptions(), it.productId || '', 'class="u-product" aria-label="القطعة"')}</td><td><input class="u-qty" type="number" min="1" step="1" value="${it.qty || 1}" aria-label="العدد في البوكس"></td><td class="num u-price">0</td><td class="num u-cost">0</td><td><button type="button" class="icon-btn" data-line-remove aria-label="حذف السطر">✕</button></td></tr>`;
    const rowsFor = (box) => (box.boxItems && box.boxItems.length ? box.boxItems : [{}, {}, {}]).map(pieceRow).join('');
    UI.modal({ title: 'فك بوكس إلى قطع', wide: true, submit: 'فك البوكس',
      body: `<p class="muted">استخدمها لما تحتاج تبيع قطع البوكس لوحدها. البوكس بيخرج من المخزون، وكل قطعة بتدخل بتكلفتها: تكلفة البوكس بتتوزع على القطع بنسبة سعر بيع كل قطعة.</p>
        <div class="form-grid">
          ${UI.field('التاريخ', UI.input('date', today(), 'type="date" required'), { req: true })}
          ${UI.field('البوكس', UI.select('sourceProductId', boxes.map((p) => ({ v: p.id, l: `${productLabel(p)} — متاح ${fmt(inv[p.id].available)}` })), boxes[0].id))}
          ${UI.field('عدد البوكسات', UI.input('sourceQty', 1, 'type="number" min="1" step="1" required'), { req: true })}
          ${UI.field('ملاحظات', UI.input('notes', ''))}
        </div>
        <h3 class="sub-title">قطع البوكس الواحد</h3>
        <div class="table-wrap"><table class="lines"><thead><tr><th>القطعة (منتج)</th><th>العدد في البوكس</th><th class="num">سعر البيع</th><th class="num">تكلفة القطعة</th><th></th></tr></thead><tbody id="pieces">${rowsFor(boxes[0])}</tbody></table></div>
        <button type="button" class="btn btn-small" id="add-piece">+ قطعة</button>
        <label class="check"><input type="checkbox" name="remember" checked> احفظ القطع دي للبوكس ده (عشان المرة الجاية، ووزن شحن البوكس يتحسب بمجموعها)</label>
        <p class="muted">لو القطعة مش موجودة كمنتج، أضفها الأول من «+ منتج جديد» بسعر بيعها.</p>
        <div class="summary" id="ub-sum"></div>`,
      onOpen(f) {
        const body = f.querySelector('#pieces');
        const recalc = () => {
          const box = productById(f.sourceProductId.value), st = inv[box.id] || { avgCost: 0 };
          const rows = [...body.querySelectorAll('.line')].map((r) => ({ r, p: productById(r.querySelector('.u-product').value), q: num(r.querySelector('.u-qty').value) }));
          const totPrice = rows.reduce((a, x) => a + (x.p ? num(x.p.price) * x.q : 0), 0);
          const totQty = rows.reduce((a, x) => a + (x.p ? x.q : 0), 0);
          rows.forEach((x) => {
            x.r.querySelector('.u-price').textContent = x.p ? fmt(x.p.price) : '—';
            const unit = !x.p ? 0 : totPrice > 0 ? (st.avgCost * num(x.p.price)) / totPrice : totQty ? st.avgCost / totQty : 0;
            x.r.querySelector('.u-cost').textContent = fmt(unit);
          });
          f.querySelector('#ub-sum').innerHTML = `<div><span>تكلفة البوكس الواحد</span><b>${fmt(st.avgCost)}</b></div><div><span>قطع في البوكس</span><b>${fmt(totQty)}</b></div><div class="strong"><span>قطع هتدخل المخزون</span><b>${fmt(totQty * num(f.sourceQty.value))}</b></div><div><span>سعر بيع القطع مجمعة</span><b>${fmt(totPrice)}</b></div><div><span>سعر بيع البوكس</span><b>${fmt(box.price)}</b></div>`;
        };
        f.sourceProductId.addEventListener('change', () => { body.innerHTML = rowsFor(productById(f.sourceProductId.value)); recalc(); });
        f.querySelector('#add-piece').addEventListener('click', () => { body.insertAdjacentHTML('beforeend', pieceRow()); recalc(); });
        body.addEventListener('click', (e) => { if (e.target.closest('[data-line-remove]') && body.children.length > 1) { e.target.closest('tr').remove(); recalc(); } });
        f.addEventListener('input', recalc); f.addEventListener('change', recalc);
        recalc();
      },
      onSubmit(f, fd) {
        const box = productById(fd.get('sourceProductId'));
        const n = num(fd.get('sourceQty'));
        const pieces = [...f.querySelectorAll('#pieces .line')].map((r) => ({ productId: r.querySelector('.u-product').value, qty: num(r.querySelector('.u-qty').value) })).filter((x) => x.productId && x.qty > 0);
        if (!pieces.length) return fail('اختار قطع البوكس');
        if (pieces.some((x) => x.productId === box.id)) return fail('القطعة مينفعش تبقى نفس البوكس');
        const merged = RULES.mergeLines(pieces.map((x) => ({ ...x, price: 0 }))).items.map(({ productId, qty }) => ({ productId, qty }));
        if (!dateOk(fd.get('date'))) return false;
        const out = RULES.checkStockOut(J(), box.id, n);
        if (out) return fail(stockMsg([out]));
        if (fd.get('remember')) box.boxItems = merged;
        DB.upsert('decants', { id: uid(), kind: 'unbox', date: fd.get('date'), sourceProductId: box.id, sourceQty: n, outputs: merged.map((x) => ({ productId: x.productId, qty: x.qty * n })), materialsCost: 0, accountId: '', notes: fd.get('notes') });
        UI.toast(`تم فك ${n} بوكس إلى ${merged.reduce((a, x) => a + x.qty, 0) * n} قطعة`); render();
      } });
  }

  function viewDecant(d) {
    const c = J().inventory.decantCost[d.id] || { lines: [], sourceCost: 0, materials: 0, total: 0, costPerMl: 0 };
    const ub = d.kind === 'unbox';
    UI.modal({ title: `${ub ? 'فك' : 'تقسيم'} ${esc(productLabel(productById(d.sourceProductId)))}`, wide: true, tools: { title: `${ub ? 'فك بوكس' : 'تقسيم عبوة'} — ${productLabel(productById(d.sourceProductId))}`, subtitle: fmtDate(d.date), file: ub ? 'unbox' : 'decant' },
      body: `<div class="summary">${ub ? `<div class="strong"><span>تكلفة ${fmt(d.sourceQty)} بوكس</span><b>${fmt(c.total)}</b></div><div><span>التوزيع</span><b>بنسبة سعر بيع القطع</b></div>` : `<div><span>تكلفة العطر (${fmt(d.sourceQty)} عبوة)</span><b>${fmt(c.sourceCost)}</b></div><div><span>العبوات الفاضية</span><b>${fmt(c.materials)}</b></div><div class="strong"><span>الإجمالي</span><b>${fmt(c.total)}</b></div><div><span>تكلفة المللي</span><b>${fmt(c.costPerMl)}</b></div>`}</div>
        ${table(['المنتج', '#العدد', '#تكلفة العبوة', '#الإجمالي', '#سعر البيع', '#الهامش'], d.outputs.map((o, i) => { const p = productById(o.productId) || {}; const unit = o.qty ? (c.lines[i] || 0) / o.qty : 0; return `<tr>${td(esc(productLabel(p)))}${tdn(fmt(o.qty))}${tdn(fmt(unit))}${tdn(fmt(c.lines[i] || 0))}${tdn(fmt(p.price))}${tdn(p.price ? pct((p.price - unit) / p.price) : '—')}</tr>`; }))}
        ${d.notes ? `<p class="muted">${esc(d.notes)}</p>` : ''}` });
  }

  // =====================================================================
  // الباركود: طباعة الملصقات والجرد
  // =====================================================================
  function barcodeLabels() {
    const s = S(), inv = J().inventory.products;
    if (!s.products.length) { UI.toast('أضف منتجات الأول', 'bad'); return; }
    UI.modal({ title: 'طباعة ملصقات باركود', wide: true, submit: 'طباعة',
      body: `<p class="muted">حدد المنتجات وعدد الملصقات. المنتجات اللي ملهاش كود إنجليزي هيتعملها باركود تلقائي ويتحفظ فيها.</p>
        <div class="btn-row"><label class="check"><input type="checkbox" name="showPrice" checked> اطبع السعر</label><button type="button" class="btn btn-small" id="lbl-stock">عدد = الرصيد</button><button type="button" class="btn btn-small" id="lbl-one">عدد = 1</button><button type="button" class="btn btn-small" id="lbl-none">إلغاء الكل</button></div>
        ${table(['المنتج', 'الكود', '#الرصيد', 'عدد الملصقات'], s.products.map((p) => `<tr>${td(esc(productLabel(p)))}${td(esc(OPS.productCode(p) || 'تلقائي'), 'mono')}${tdn(fmt((inv[p.id] || {}).qty || 0))}<td><input class="lbl-n" type="number" min="0" max="500" step="1" value="0" data-pid="${p.id}" data-stock="${Math.max(0, Math.round((inv[p.id] || {}).qty || 0))}" aria-label="عدد الملصقات"></td></tr>`))}`,
      onOpen(f) {
        const set = (fn) => f.querySelectorAll('.lbl-n').forEach((i) => (i.value = fn(i)));
        f.querySelector('#lbl-stock').addEventListener('click', () => set((i) => i.dataset.stock));
        f.querySelector('#lbl-one').addEventListener('click', () => set(() => 1));
        f.querySelector('#lbl-none').addEventListener('click', () => set(() => 0));
      },
      onSubmit(f, fd) {
        const picks = [...f.querySelectorAll('.lbl-n')].map((i) => ({ p: productById(i.dataset.pid), n: Math.min(500, Math.max(0, Math.round(num(i.value)))) })).filter((x) => x.n > 0);
        if (!picks.length) { UI.toast('حدد عدد الملصقات لمنتج واحد على الأقل', 'bad'); return false; }
        let assigned = 0;
        picks.forEach(({ p }) => { if (!OPS.productCode(p)) { p.barcode = OPS.autoBarcode(S().products); assigned++; } });
        if (assigned) DB.save();
        const showPrice = fd.get('showPrice');
        const label = (p) => `<div class="label"><small>${esc(S().settings.businessName)}</small><b>${esc(productLabel(p))}</b>${OPS.barcodeSvg(OPS.productCode(p))}<span class="code">${esc(OPS.productCode(p))}</span>${showPrice && p.price ? `<b class="price">${fmt(p.price)} ج.م</b>` : ''}</div>`;
        const css = '<style>.labels{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}.label{border:1px dashed #bbb;border-radius:2mm;padding:2mm;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1px;page-break-inside:avoid;font-size:9px}.label b{font-size:10px;line-height:1.3}.label .barcode{width:100%;height:13mm}.label .code{font-family:Consolas,monospace;direction:ltr;font-size:9px;letter-spacing:1px}.label .price{font-size:12px}</style>';
        FX.printDoc({ business: S().settings.businessName, title: 'ملصقات باركود', subtitle: `${picks.reduce((a, x) => a + x.n, 0)} ملصق`, html: `${css}<div class="labels">${picks.map(({ p, n }) => label(p).repeat(n)).join('')}</div>` });
        if (assigned) { UI.toast(`اتعمل باركود تلقائي لـ ${assigned} منتج`); render(); }
      } });
  }
  function stockCount() {
    const s = S();
    if (!s.products.length) { UI.toast('أضف منتجات الأول', 'bad'); return; }
    const counts = new Map();
    const view = (full) => {
      const inv = J().inventory.products;
      const list = full ? S().products.map((p) => p.id) : [...counts.keys()];
      const rows = list.map((id) => { const p = productById(id); const sys = (inv[id] || {}).qty || 0; const c = counts.get(id) || 0; const d = c - sys; return `<tr>${td(esc(productLabel(p)))}${tdn(fmt(sys))}<td><input class="cnt-n" type="number" min="0" step="1" value="${c}" data-pid="${id}" aria-label="العدد الفعلي"></td>${tdn(`<b class="${d < 0 ? 'bad-text' : d > 0 ? 'good-text' : ''}">${d > 0 ? '+' : ''}${fmt(d)}</b>`)}</tr>`; });
      return table(['المنتج', '#رصيد النظام', 'العدد الفعلي', '#الفرق'], rows, { empty: 'ابدأ امسح المنتجات — كل مسحة بتزود قطعة' });
    };
    UI.modal({ title: 'جرد بالباركود', wide: true, submit: 'حفظ الفروق كتسويات',
      body: `<div class="form-grid">${UI.field('تاريخ الجرد', UI.input('date', today(), 'type="date" required'), { req: true })}${UI.field('نوع الجرد', `<label class="check"><input type="checkbox" name="full" id="f-full"> جرد كامل: اللي ما اتمسحش رصيده صفر</label>`)}</div>
        ${scanBox('امسح باركود كل قطعة (أو اكتب الكود ثم Enter)')}
        <div id="cnt-view">${view(false)}</div>`,
      onOpen(f) {
        const box = f.querySelector('#cnt-view');
        const redraw = () => (box.innerHTML = view(f.full.checked));
        attachScanner(f, (code) => { const p = OPS.findByCode(S().products, code); if (!p) { UI.toast(`مفيش منتج بالكود «${code}»`, 'bad'); return; } counts.set(p.id, (counts.get(p.id) || 0) + 1); redraw(); UI.toast(`${productLabel(p)}: ${counts.get(p.id)}`); });
        box.addEventListener('change', (e) => { if (e.target.classList.contains('cnt-n')) { counts.set(e.target.dataset.pid, Math.max(0, num(e.target.value))); redraw(); } });
        f.full.addEventListener('change', redraw);
      },
      onSubmit(f, fd) {
        const inv = J().inventory.products;
        const ids = fd.get('full') ? S().products.map((p) => p.id) : [...counts.keys()];
        const adjs = ids.map((id) => ({ id, d: Acc.round2((counts.get(id) || 0) - ((inv[id] || {}).qty || 0)) })).filter((x) => Math.abs(x.d) > 0.001);
        if (!ids.length) { UI.toast('امسح منتج واحد على الأقل', 'bad'); return false; }
        if (!dateOk(fd.get('date'), 'تاريخ الجرد')) return false;
        if (!adjs.length) { UI.toast('الجرد مطابق — مفيش فروق 👌'); return; }
        adjs.forEach((x) => S().adjustments.push({ id: uid(), date: fd.get('date'), productId: x.id, qty: x.d, unitCost: null, reason: 'count', notes: 'جرد بالباركود' }));
        DB.save();
        UI.toast(`تم تسجيل ${adjs.length} فرق جرد`); render();
      } });
  }

  // =====================================================================
  // الأحداث
  // =====================================================================
  const del = (list, id, label, guard) => {
    if (guard && guard()) { UI.toast(`لا يمكن حذف ${label} لأنه مستخدم في مستندات أخرى`, 'bad'); return; }
    UI.confirm(`هل تريد حذف ${label}؟ لا يمكن التراجع.`, () => { DB.remove(list, id); UI.toast('تم الحذف'); render(); });
  };
  // =====================================================================
  // الاستيراد من Excel
  // =====================================================================
  const PREIMPORT_KEY = 'florume.preimport';
  function lastImport() { try { return JSON.parse(localStorage.getItem(PREIMPORT_KEY) || 'null'); } catch (e) { return null; } }
  function pickImportFile() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xlsx,.csv,.txt'; input.hidden = true;
    input.addEventListener('change', async () => {
      const file = input.files[0]; input.remove();
      if (!file) return;
      try {
        const sheets = await IMP.readWorkbook(file);
        importPreview(file.name, sheets);
      } catch (err) { UI.toast(err.message || 'تعذرت قراءة الملف', 'bad'); }
    });
    document.body.appendChild(input);
    input.click();
  }
  function importPreview(fileName, sheets) {
    const clearDemo = !!S().demo;
    const emptyBase = F.emptyState();
    const baseState = () => (opts.clearDemo ? emptyBase : S());
    const opts = { clearDemo, ...IMP.defaultMappings(sheets, clearDemo ? emptyBase : S()) };
    let base = baseState();
    let plan = IMP.planImport(sheets, base, opts, uid);
    const payOptions = (st) => [
      ...st.couriers.map((c) => ({ v: `cod:${c.id}`, l: `عند الاستلام — ${c.name}` })),
      ...st.accounts.map((a) => ({ v: a.id, l: `مدفوع مقدمًا — ${a.name}` })),
    ];
    const view = () => {
      const t = plan.totals;
      const newProducts = plan.products.filter((p) => p.isNew);
      const productName = (id) => (plan.products.find((p) => p.id === id) || {}).name || (DB.find('products', id) || {}).name || '—';
      const custName = (id) => (plan.customers.find((c) => c.id === id) || base.customers.find((c) => c.id === id) || {}).name || '—';
      const payLabel = (sale) => (sale.payment === 'cod' ? `عند الاستلام — ${(base.couriers.find((c) => c.id === sale.courierId) || {}).name || ''}` : (base.accounts.find((a) => a.id === sale.payment) || {}).name || '—');
      const nothing = !plan.sales.length && !plan.promos.length && !newProducts.length && !plan.expenses.length && !plan.opening.length;
      return `
        <p class="muted">الملف: <b>${esc(fileName)}</b></p>
        <ul class="imp-sheets">
          ${plan.found.map((f) => `<li>${UI.pill('تمت القراءة', 'good')} <b>${esc(f.name)}</b> — ${f.label} (${f.rows} سطر)</li>`).join('')}
          ${plan.ignored.map((f) => `<li>${UI.pill('اتتخطت', 'mute')} <b>${esc(f.name)}</b> — ${esc(f.reason)}</li>`).join('')}
        </ul>
        <div class="form-grid">
          ${UI.field('حالة الطلبات المستوردة', UI.select('impStatus', { delivered: 'تم التسليم', shipped: 'مع شركة الشحن' }, opts.status, 'data-imp="status"'))}
          ${UI.field('تاريخ المخزون الافتتاحي', UI.input('impOpening', opts.openingDate, 'type="date" data-imp="openingDate"'), { hint: 'قبل أول عملية في الملف' })}
          ${S().demo ? UI.field('البيانات التجريبية', `<label class="check"><input type="checkbox" id="f-impClear" data-imp="clearDemo" ${opts.clearDemo ? 'checked' : ''}> امسحها واستورد على نظام فاضي</label>`) : ''}
        </div>
        ${Object.keys(opts.salesPay).length || Object.keys(opts.expensePay).length ? `<h3 class="sub-title">طريقة الدفع في الملف ← في النظام</h3><div class="form-grid">${Object.keys(opts.salesPay).map((k, i) => UI.field(`«${esc(k)}» في المبيعات`, UI.select('impPay' + i, payOptions(base), opts.salesPay[k], `data-imp-pay="${esc(k)}"`))).join('')}
          ${Object.keys(opts.expensePay).map((k, i) => UI.field(`«${esc(k)}» في المصروفات`, UI.select('impExp' + i, [{ v: 'skip', l: 'تخطي هذه السطور' }, ...base.accounts.map((a) => ({ v: a.id, l: a.name }))], opts.expensePay[k], `data-imp-exp="${esc(k)}"`))).join('')}</div>` : ''}
        <div class="summary imp-summary">
          <div><span>منتجات جديدة</span><b>${newProducts.length}</b></div>
          <div><span>مخزون افتتاحي</span><b>${fmt(t.openingQty)} قطعة · ${fmt(t.openingValue)} ج.م</b></div>
          <div><span>عملاء جدد</span><b>${plan.customers.length}</b></div>
          <div class="strong"><span>طلبات (${t.lines} سطر)</span><b>${plan.sales.length} · ${fmt(t.revenue)} ج.م</b></div>
          <div><span>عينات دعاية من المخزون</span><b>${fmt(t.promoQty)} قطعة</b></div>
          <div><span>مصروفات</span><b>${plan.expenses.length} · ${fmt(t.expenses)} ج.م</b></div>
        </div>
        ${plan.errors.length ? `<div class="imp-box bad"><b>${plan.errors.length} سطر فيه خطأ ولن يُستورد:</b><ul>${plan.errors.map((e) => `<li>${esc(e.sheet)} — سطر ${e.row}: ${esc(e.reason)}</li>`).join('')}</ul></div>` : ''}
        ${plan.warnings.length ? `<div class="imp-box warn"><b>تنبيهات:</b><ul>${plan.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
        ${plan.skipped.length ? `<details class="imp-box"><summary>${plan.skipped.length} سطر سيتم تخطيه (اضغط للتفاصيل)</summary><ul>${plan.skipped.map((e) => `<li>${esc(e.sheet)} — سطر ${e.row}: ${esc(e.reason)}</li>`).join('')}</ul></details>` : ''}
        ${plan.sales.length ? `<h3 class="sub-title">الطلبات</h3>${table(['التاريخ', 'العميل', 'الأصناف', '#الإجمالي', 'الدفع'], plan.sales.map((x) => `<tr>${td(fmtDate(x.date))}${td(esc(custName(x.customerId)))}${td(x.items.map((it) => `${esc(productName(it.productId))} × ${fmt(it.qty)}`).join('<br>'))}${tdn(fmt(x.items.reduce((a, it) => a + it.qty * it.price, 0)))}${td(esc(payLabel(x)))}</tr>`))}` : ''}
        ${newProducts.length ? `<h3 class="sub-title">المنتجات والمخزون الافتتاحي</h3>${table(['الكود', 'المنتج', '#الرصيد في الملف', '#خرج في الملف', '#مخزون افتتاحي', '#التكلفة', '#سعر البيع'], newProducts.map((p) => `<tr>${td(esc(p.sku), 'mono')}${td(esc(p.name))}${tdn(fmt(p.currentQty || 0))}${tdn(fmt(p.soldQty))}${tdn(fmt((p.currentQty || 0) + p.soldQty))}${tdn(fmt(p.cost))}${tdn(fmt(p.price))}</tr>`))}` : ''}
        ${plan.expenses.length ? `<h3 class="sub-title">المصروفات</h3>${table(['التاريخ', 'البند', 'البيان', '#المبلغ'], plan.expenses.map((e) => `<tr>${td(fmtDate(e.date))}${td(esc(Acc.COA_MAP[e.category].name))}${td(esc(e.notes))}${tdn(fmt(e.amount))}</tr>`))}` : ''}
        ${nothing ? UI.empty('لا يوجد شيء جديد للاستيراد في هذا الملف') : '<p class="muted">سيتم حفظ نسخة من بياناتك الحالية قبل الاستيراد، وتقدر ترجع لها من الإعدادات ← «تراجع عن آخر استيراد».</p>'}`;
    };
    UI.modal({
      title: 'معاينة الاستيراد', wide: true, submit: 'استيراد',
      body: `<div id="imp-view">${view()}</div>`,
      onOpen(f) {
        const box = f.querySelector('#imp-view');
        const replan = () => { base = baseState(); plan = IMP.planImport(sheets, base, opts, uid); box.innerHTML = view(); };
        box.addEventListener('change', (e) => {
          const el = e.target;
          if (el.dataset.imp === 'clearDemo') {
            opts.clearDemo = el.checked;
            Object.assign(opts, IMP.defaultMappings(sheets, baseState()), { status: opts.status, openingDate: opts.openingDate });
          } else if (el.dataset.imp) opts[el.dataset.imp] = el.value;
          else if (el.dataset.impPay != null) opts.salesPay[el.dataset.impPay] = el.value;
          else if (el.dataset.impExp != null) opts.expensePay[el.dataset.impExp] = el.value;
          replan();
        });
      },
      onSubmit() {
        if (!plan.sales.length && !plan.promos.length && !plan.opening.length && !plan.expenses.length && !plan.products.some((p) => p.isNew)) { UI.toast('لا يوجد شيء جديد للاستيراد', 'bad'); return false; }
        try { localStorage.setItem(PREIMPORT_KEY, JSON.stringify({ label: `${fileName} — ${fmtDate(today())}`, state: S() })); }
        catch (e) { UI.toast('تعذر حفظ نسخة قبل الاستيراد — صدّر نسخة احتياطية أولًا', 'bad'); return false; }
        DB.replace(IMP.applyImport(base, plan));
        renderBrand();
        UI.toast(`تم استيراد ${plan.sales.length} طلب و${plan.products.filter((p) => p.isNew).length} منتج و${plan.expenses.length} مصروف — افتح «فحص سلامة البيانات» للتأكد`);
        render();
      },
    });
  }

  const ACTIONS = {
    newSale: () => saleForm(), newPromo: () => saleForm(null, 'promo'), editSale: (id) => saleForm(DB.find('sales', id)), viewSale: (id) => viewSale(DB.find('sales', id)),
    delSale: (id) => (RULES.isReconciled(S(), id) ? fail('الفاتورة داخلة في تسوية كشف شركة الشحن — احذف التسوية الأول') : del('sales', id, 'هذا الطلب')),
    newShipment: () => shipmentForm(), editShipment: (id) => shipmentForm(DB.find('shipments', id)), landedShipment: (id) => landedView(DB.find('shipments', id)),
    delShipment: (id) => del('shipments', id, 'هذه الشحنة'),
    receiveShipment: (id) => {
      const sh = DB.find('shipments', id);
      UI.modal({ title: `استلام شحنة ${esc(sh.ref)}`, submit: 'تأكيد الاستلام', body: UI.field('تاريخ الاستلام', UI.input('receivedDate', today(), 'type="date" required'), { req: true, hint: 'تدخل الكميات المخزن بتكلفتها الواصلة في هذا التاريخ' }),
        onSubmit(f, fd) {
          const obj = { ...sh, status: 'received', receivedDate: fd.get('receivedDate') };
          const err = RULES.shipmentDateError(obj);
          if (err) return fail(err);
          DB.upsert('shipments', obj); UI.toast('تم استلام الشحنة وإضافتها للمخزون'); render();
        } });
    },
    newProduct: () => productForm(), editProduct: (id) => productForm(DB.find('products', id)), productMoves: (id) => productMoves(DB.find('products', id)),
    delProduct: (id) => del('products', id, 'هذا المنتج', () => used(id, [['sales', (x, i) => x.items.some((l) => l.productId === i)], ['shipments', (x, i) => x.items.some((l) => l.productId === i)], ['adjustments', (x, i) => x.productId === i], ['decants', (x, i) => x.sourceProductId === i || x.outputs.some((o) => o.productId === i)]])),
    newDecant: decantForm, unbox: unboxForm, viewDecant: (id) => viewDecant(DB.find('decants', id)),
    delDecant: (id) => UI.confirm('هل تريد حذف العملية دي؟ العبوة أو البوكس الأصلي هيرجع للمخزون والقطع الناتجة هتتشال — لو اتباع منها حاجة هيظهر رصيد غير كافٍ.', () => { DB.remove('decants', id); UI.toast('تم الحذف'); render(); }),
    barcodeLabels, stockCount,
    newCampaign: () => campaignForm(), editCampaign: (id) => campaignForm(DB.find('campaigns', id)),
    delCampaign: (id) => del('campaigns', id, 'هذه الحملة', () => used(id, [['sales', (x, i) => x.campaignId === i], ['expenses', (x, i) => x.campaignId === i]])),
    pickCourier: (id) => { reconCourier = id; render(); },
    goReconcile: (id) => { if (id) reconCourier = id; location.hash = 'reconcile'; },
    uploadStatement: pickStatementFile,
    statementTemplate: () => FX.exportExcel('courier-statement-template.xlsx', [{ name: 'كشف الحساب', plain: true, header: ['رقم البوليصة', 'رقم الطلب', 'المبلغ المحصل', 'مصاريف الشحن', 'الحالة', 'التاريخ'], rows: [] }], { business: S().settings.businessName, subtitle: '' }),
    viewReconciliation: (id) => viewReconciliation(DB.find('reconciliations', id)),
    delReconciliation: (id) => UI.confirm('هل تريد حذف هذه التسوية؟ الطلبات هترجع «لسه ما اتسوتش». التحصيل المسجل في الخزينة مش هيتحذف — احذفه من شاشة الخزينة لو محتاج.', () => { DB.remove('reconciliations', id); UI.toast('تم الحذف'); render(); }),
    newPartner: () => partnerForm(), editPartner: (id) => partnerForm(DB.find('partners', id)), partnerStatement: (id) => partnerStatement(DB.find('partners', id)),
    delPartner: (id) => del('partners', id, 'هذا الشريك', () => used(id, [['equity', (x, i) => x.partnerId === i], ['distributions', (x, i) => x.allocations.some((a) => a.partnerId === i)]])),
    partnerDrawing: (id) => { equityForm(); const f = document.getElementById('modal-form'); if (f) { f.type.value = 'drawing'; if (f.partnerId) f.partnerId.value = id; } },
    newDistribution: distributionForm, delDistribution: (id) => del('distributions', id, 'هذا التوزيع'),
    pickAlert: (id) => { alertFilter = id; render(); },
    runAudit: () => { render(); UI.toast('تم الفحص'); },
    goto: (h) => { location.hash = h; },
    goTreasury: (id) => { treasuryAcc = id; period = { preset: 'all', from: '', to: '' }; savePeriod(); location.hash = 'treasury'; render(); },
    newAdjustment: adjustmentForm, delAdjustment: (id) => del('adjustments', id, 'هذه التسوية'),
    newSupplier: () => supplierForm(), editSupplier: (id) => supplierForm(DB.find('suppliers', id)), supplierStatement: (id) => supplierStatement(DB.find('suppliers', id)),
    delSupplier: (id) => del('suppliers', id, 'هذا المورد', () => used(id, [['shipments', (x, i) => x.supplierId === i], ['supplierPayments', (x, i) => x.supplierId === i]])),
    newPayment: (id) => paymentForm(null, id), editPayment: (id) => paymentForm(DB.find('supplierPayments', id)), delPayment: (id) => del('supplierPayments', id, 'هذه الدفعة'),
    newCustomer: () => customerForm(), editCustomer: (id) => customerForm(DB.find('customers', id)),
    delCustomer: (id) => del('customers', id, 'هذا العميل', () => used(id, [['sales', (x, i) => x.customerId === i]])),
    pickAccount: (id) => { treasuryAcc = id; render(); },
    newTransfer: () => transferForm(), newSettlement: () => settlementForm(), newEquity: () => equityForm(),
    editDoc: (key) => { const [list, id] = key.split(':'); const doc = DB.find(list, id); ({ transfers: transferForm, settlements: settlementForm, equity: equityForm })[list](doc); },
    delDoc: (key) => { const [list, id] = key.split(':'); del(list, id, 'هذا المستند'); },
    newExpense: () => expenseForm(), editExpense: (id) => expenseForm(DB.find('expenses', id)), delExpense: (id) => del('expenses', id, 'هذا المصروف'),
    pickReport: (id) => { report = id; render(); },
    printPage: () => { const x = pageExport(); FX.printDoc({ business: S().settings.businessName, title: x.title, subtitle: x.subtitle, html: FX.cleanForPrint(x.root) }); },
    excelPage: () => {
      const x = pageExport();
      let sheets = FX.collectSheets(x.root, x.title);
      if (x.key === 'reports' && report === 'journal') sheets = [journalSheet()];
      if (x.key === 'sales') sheets.push(salesDetailSheet());
      FX.exportExcel(`florume-${x.key === 'reports' ? report : x.key}-${today()}.xlsx`, sheets, { business: S().settings.businessName, subtitle: x.subtitle });
    },
    newAccount: () => accountForm(), editAccount: (id) => accountForm(DB.find('accounts', id)),
    delAccount: (id) => del('accounts', id, 'هذا الحساب', () => used(id, [['sales', (x, i) => x.payment === i], ['expenses', (x, i) => x.accountId === i], ['supplierPayments', (x, i) => x.accountId === i], ['settlements', (x, i) => x.accountId === i], ['equity', (x, i) => x.accountId === i], ['transfers', (x, i) => x.fromId === i || x.toId === i], ['shipments', (x, i) => (x.costs || []).some((c) => c.accountId === i)], ['decants', (x, i) => x.accountId === i]]) || num((DB.find('accounts', id) || {}).opening) !== 0),
    newCourier: () => courierForm(), editCourier: (id) => courierForm(DB.find('couriers', id)),
    delCourier: (id) => del('couriers', id, 'شركة الشحن', () => used(id, [['sales', (x, i) => x.courierId === i], ['settlements', (x, i) => x.courierId === i]])),
    importExcel: pickImportFile,
    importTemplate: () => FX.exportExcel('florume-import-template.xlsx', [
      { name: 'المبيعات', plain: true, header: ['orderNo', 'trackingNo', 'type', 'date', 'customerName', 'customerPhone', 'customerAddress', 'productName', 'qty', 'netTotal', 'cogs', 'profit', 'account'], rows: [] },
      { name: 'المخزون', plain: true, header: ['sku', 'name', 'qty', 'cost', 'price'], rows: [] },
      { name: 'المصاريف التشغيلية', plain: true, header: ['date', 'category', 'amount', 'payment', 'desc'], rows: [] },
    ], { business: S().settings.businessName, subtitle: '' }),
    undoImport: () => {
      const snap = lastImport();
      if (!snap) return;
      UI.confirm(`هيرجع النظام لحالته قبل استيراد «${esc(snap.label)}». أي تعديل عملته بعد الاستيراد هيتلغي كمان.`, () => {
        DB.replace(snap.state);
        try { localStorage.removeItem(PREIMPORT_KEY); } catch (e) { /* لا شيء */ }
        renderBrand(); UI.toast('تم التراجع عن الاستيراد'); render();
      }, 'تراجع');
    },
    exportBackup: () => UI.offerFile(`florume-backup-${today()}.json`, JSON.stringify(S(), null, 1), 'application/json'),
    pasteBackup: () => UI.modal({ title: 'استيراد نسخة احتياطية', submit: 'استيراد', body: `<p class="muted">سيتم استبدال كل البيانات الحالية بالنسخة التي تلصقها.</p><textarea id="f-paste" name="paste" class="export-box" required></textarea>`, onSubmit: (f, fd) => { importState(fd.get('paste')); } }),
    loadDemo: () => UI.confirm('سيتم استبدال بياناتك الحالية بالبيانات التجريبية. صدّر نسخة احتياطية أولًا إن احتجت.', () => { DB.replace(F.demoState()); UI.toast('تم تحميل البيانات التجريبية'); render(); }, 'تحميل'),
    resetAll: () => UI.confirm('سيتم مسح كل البيانات (المنتجات، الطلبات، الشحنات، الحسابات). تأكد أن لديك نسخة احتياطية.', () => { DB.replace(F.emptyState()); UI.toast('تم مسح البيانات — ابدأ بإضافة الموردين والمنتجات'); location.hash = 'settings'; render(); }, 'مسح الكل'),
    clearDemo: () => UI.confirm('سيتم مسح البيانات التجريبية والبدء بحسابات فارغة.', () => { DB.replace(F.emptyState()); UI.toast('جاهز لبياناتك — ابدأ من الإعدادات'); location.hash = 'settings'; render(); }, 'ابدأ ببياناتي'),
  };
  const CHANGES = {
    period: (el) => { period = el.value === 'custom' ? { ...period, preset: 'custom' } : { preset: el.value, ...presetRange(el.value) }; savePeriod(); render(); },
    periodFrom: (el) => { period = { ...period, preset: 'custom', from: el.value }; savePeriod(); render(); },
    periodTo: (el) => { period = { ...period, preset: 'custom', to: el.value }; savePeriod(); render(); },
    saleStatusFilter: (el) => { saleFilter.status = el.value; render(); },
    saleChannelFilter: (el) => { saleFilter.channel = el.value; render(); },
    saleKindFilter: (el) => { saleFilter.kind = el.value; render(); },
    ledgerAcc: (el) => { ledgerAcc = el.value; render(); },
    saleStatus: (el) => {
      const sale = DB.find('sales', el.dataset.id);
      const upd = { ...sale, status: el.value };
      if (el.value === 'returned' && !upd.returnDate) upd.returnDate = today() < sale.date ? sale.date : today();
      if (RULES.lockedSaleChanges(S(), sale, upd).length) { fail('الفاتورة داخلة في تسوية كشف شركة الشحن — الحالة مقفولة'); render(); return; }
      const stock = RULES.checkSaleStock(S(), J(), upd, sale);
      if (stock.errors.length) { fail(stockMsg(stock.errors, upd.status)); render(); return; }
      upd.preorder = stock.preorder;
      DB.upsert('sales', upd);
      UI.toast(el.value === 'returned' ? 'تم تسجيل المرتجع — عدّل الطلب لإضافة مصاريف المرتجع' : `الحالة: ${STATUSES[el.value]}`);
      render();
    },
    importFile: (el) => { const file = el.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => importState(r.result); r.readAsText(file); },
  };
  const INPUTS = {
    saleQ: (el) => { saleFilter.q = el.value; rerenderKeepFocus(el.id); },
    custQ: (el) => { custQ = el.value; rerenderKeepFocus(el.id); },
  };
  function savePeriod() { try { localStorage.setItem('florume.period', JSON.stringify(period)); } catch (e) { /* لا شيء */ } }
  function rerenderKeepFocus(id) {
    const el = document.getElementById(id); const pos = el ? el.selectionStart : 0;
    render();
    const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* لا شيء */ } }
  }

  // =====================================================================
  // التوجيه والرسم
  // =====================================================================
  const PAGES = {
    dashboard: { title: 'لوحة التحكم', render: dashboard, period: true },
    sales: { title: 'المبيعات والطلبات', render: sales, period: true },
    shipments: { title: 'شحنات الاستيراد', render: shipments },
    products: { title: 'المنتجات والمخزون', render: products },
    suppliers: { title: 'الموردين', render: suppliers },
    customers: { title: 'العملاء', render: customers },
    treasury: { title: 'الخزينة والبنوك', render: treasury, period: true },
    expenses: { title: 'المصروفات', render: expenses, period: true },
    campaigns: { title: 'الحملات الإعلانية', render: campaignsPage, period: true },
    reconcile: { title: 'تسوية شركات الشحن', render: reconcilePage },
    partners: { title: 'الشركاء وتوزيع الأرباح', render: partnersPage },
    alerts: { title: 'التنبيهات', render: alertsPage },
    health: { title: 'فحص سلامة البيانات', render: healthPage },
    reports: { title: 'التقارير', render: reports, period: true },
    settings: { title: 'الإعدادات', render: settings },
  };
  const currentPage = () => (PAGES[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard');
  const periodText = () => (period.from || period.to ? `الفترة: ${period.from ? fmtDate(period.from) : 'البداية'} — ${period.to ? fmtDate(period.to) : 'اليوم'}` : 'كل الفترات');
  // ما يُطبع ويُصدَّر من الشاشة الحالية
  function pageExport() {
    const key = currentPage();
    const isReport = key === 'reports';
    const title = isReport ? REPORTS[report] : PAGES[key].title;
    let subtitle = PAGES[key].period ? periodText() : `في ${fmtDate(today())}`;
    if (isReport && (report === 'balance' || report === 'trial')) subtitle = `حتى ${fmtDate(period.to || today())}`;
    if (key === 'sales' && (saleFilter.status || saleFilter.channel || saleFilter.q || saleFilter.kind)) subtitle += ` · مفلتر: ${[{ sale: 'فواتير بيع', promo: 'فواتير دعاية' }[saleFilter.kind], STATUSES[saleFilter.status], CHANNELS[saleFilter.channel], saleFilter.q].filter(Boolean).join('، ')}`;
    if (key === 'reconcile') subtitle += ` · ${nameOf('couriers', reconCourier)}`;
    if (key === 'treasury') subtitle += ` · حركة ${nameOf('accounts', treasuryAcc)}`;
    return { key, title, subtitle, root: isReport ? main().querySelector('.report') : main() };
  }
  function journalSheet() {
    const rows = J().entries.filter((e) => inPeriod(e.date)).flatMap((e) => e.lines.map((l) => ({ cells: [e.no, fmtDate(e.date), e.desc, Acc.accountName(l.acc, S()), l.party ? partyName(l.party) : '', l.dr || '', l.cr || ''] })));
    const tot = J().entries.filter((e) => inPeriod(e.date)).reduce((t, e) => { e.lines.forEach((l) => { t[0] += l.dr; t[1] += l.cr; }); return t; }, [0, 0]);
    rows.push({ cells: ['', '', 'الإجمالي', '', '', Acc.round2(tot[0]), Acc.round2(tot[1])], total: true });
    return { name: 'دفتر اليومية', header: ['رقم القيد', 'التاريخ', 'البيان', 'الحساب', 'الطرف', 'مدين', 'دائن'], rows };
  }
  function salesDetailSheet() {
    const rows = [];
    S().sales.filter((x) => inPeriod(x.date)).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((x) => {
      const c = DB.find('customers', x.customerId) || {};
      const costs = lineCosts(x);
      x.items.forEach((it, i) => rows.push({ cells: [invoiceNo(x), isPromo(x) ? 'دعاية' : 'بيع', fmtDate(x.date), c.name || '', c.phone || '', c.city || '', CHANNELS[x.channel] || '', STATUSES[x.status], x.trackingNo || '', x.campaignId ? nameOf('campaigns', x.campaignId) : '', productLabel(productById(it.productId)), it.qty, it.price, it.qty * it.price, Acc.round2(costs[i])] }));
    });
    return { name: 'تفاصيل الأصناف المباعة', header: ['الفاتورة', 'النوع', 'التاريخ', 'العميل', 'الموبايل', 'المدينة', 'القناة', 'الحالة', 'البوليصة', 'الحملة', 'الصنف', 'الكمية', 'السعر', 'الإجمالي', 'التكلفة'], rows };
  }
  function render() {
    const key = currentPage();
    document.querySelectorAll('.nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === '#' + key ? 'page' : 'false'));
    document.getElementById('demo-banner').hidden = !S().demo;
    const m = main();
    try { m.innerHTML = PAGES[key].render(); }
    catch (err) { console.error(err); m.innerHTML = UI.empty(`حدث خطأ أثناء عرض الصفحة: ${esc(err.message)}`); }
    const badge = document.getElementById('alert-badge');
    if (badge) { let n = 0; try { n = alertList().filter((a) => a.level !== 'info').length; } catch (e) { /* لا شيء */ } badge.hidden = !n; badge.textContent = n; }
    const pa = m.querySelector('.page-head .page-actions');
    if (pa) pa.insertAdjacentHTML('afterbegin', `<span class="doc-tools">${['sales', 'products', 'customers', 'expenses'].includes(key) ? '<button type="button" class="btn" data-action="importExcel">استيراد Excel</button>' : ''}<button type="button" class="btn" data-action="printPage">طباعة</button><button type="button" class="btn" data-action="excelPage">تصدير Excel</button></span>`);
    const sf = document.getElementById('settings-form');
    if (sf) sf.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!UI.numbersOk(sf)) return;
      const fd = new FormData(sf); const st = S().settings;
      const maxNo = RULES.maxInvoiceNo(S());
      if (num(fd.get('nextInvoiceNo')) <= maxNo) { fail(`رقم الفاتورة التالية لازم يكون أكبر من آخر رقم مستخدم (${maxNo}) عشان الأرقام ما تتكررش`); return; }
      const first = RULES.earliestDocDate(S());
      if (!fd.get('startDate')) { fail('أدخل تاريخ بداية الحسابات'); return; }
      if (first && fd.get('startDate') > first) { fail(`تاريخ بداية الحسابات لازم يكون في أو قبل أول مستند مسجل (${fmtDate(first)})`); return; }
      Object.assign(st, { businessName: fd.get('businessName').trim() || 'Florume', businessPhone: fd.get('businessPhone').trim(), startDate: fd.get('startDate'), invoicePrefix: fd.get('invoicePrefix'), nextInvoiceNo: num(fd.get('nextInvoiceNo')) || 1, lowStock: num(fd.get('lowStock')) });
      st.rates = { SAR: num(fd.get('rate_SAR')), AED: num(fd.get('rate_AED')), USD: num(fd.get('rate_USD')) };
      st.alerts = Object.fromEntries(Object.keys(OPS.ALERT_DEFAULTS).map((k) => [k, String(fd.get('al_' + k)).trim() === '' ? OPS.ALERT_DEFAULTS[k] : Math.max(0, num(fd.get('al_' + k)))]));
      st.waFooter = fd.get('waFooter').trim();
      DB.save(); UI.toast('تم حفظ الإعدادات'); renderBrand(); render();
    });
  }
  function renderBrand() { document.querySelectorAll('[data-brand]').forEach((el) => (el.textContent = S().settings.businessName)); }

  function boot() {
    DB.load();
    renderBrand();
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || !ACTIONS[el.dataset.action]) return;
      e.preventDefault();
      ACTIONS[el.dataset.action](el.dataset.id);
    });
    document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el); });
    document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && INPUTS[el.dataset.input]) INPUTS[el.dataset.input](el); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.getElementById('modal').hidden) UI.close(); });
    // تلميح الرسوم البيانية
    const tip = document.getElementById('tip');
    document.addEventListener('mouseover', (e) => { const g = e.target.closest('[data-tip]'); if (!g) { tip.hidden = true; return; } tip.textContent = g.dataset.tip; tip.hidden = false; });
    document.addEventListener('mousemove', (e) => { if (!tip.hidden) { tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY - 12 + 'px'; } });
    window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
    render();
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
