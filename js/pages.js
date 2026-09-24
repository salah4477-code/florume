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
    const booked = sales.filter((x) => Acc.BOOKED.has(x.status));
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
  let saleFilter = { q: '', status: '', channel: '' };
  function sales() {
    const s = S(), j = J();
    const q = saleFilter.q.trim().toLowerCase();
    const list = s.sales.filter((x) => inPeriod(x.date) && (!saleFilter.status || x.status === saleFilter.status) && (!saleFilter.channel || x.channel === saleFilter.channel)
      && (!q || `${invoiceNo(x)} ${nameOf('customers', x.customerId)} ${(DB.find('customers', x.customerId) || {}).phone || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.no - a.no));
    let tot = { total: 0, cogs: 0, profit: 0 };
    const rows = list.map((x) => {
      const p = Acc.saleProfit(x, j);
      if (Acc.BOOKED.has(x.status) && x.status !== 'returned') { tot.total += p.total; tot.cogs += p.cogs; }
      tot.profit += p.profit;
      return `<tr>
        ${td(`<button class="link-btn strong" data-action="viewSale" data-id="${x.id}">${esc(invoiceNo(x))}</button>`)}${td(fmtDate(x.date))}
        ${td(esc(nameOf('customers', x.customerId)))}${td(CHANNELS[x.channel] || '—')}
        ${tdn(fmt(p.total))}${tdn(fmt(p.cogs))}${tdn(`<span class="${p.profit < 0 ? 'bad-text' : ''}">${fmt(p.profit)}</span>`)}
        ${td(x.payment === 'cod' ? 'عند الاستلام' : esc(nameOf('accounts', x.payment)))}
        ${td(UI.select('st-' + x.id, STATUSES, x.status, `class="status-select s-${x.status}" data-change="saleStatus" data-id="${x.id}" aria-label="الحالة"`))}
        ${actions(btn('تعديل', 'editSale', x.id), btn('حذف', 'delSale', x.id, 'danger'))}</tr>`;
    });
    return `
      ${header('المبيعات والطلبات', 'كل طلب يُسجَّل كإيراد عند خروجه مع شركة الشحن، وتُحسب تكلفته بمتوسط تكلفة المخزون.', `${periodBar()}<button class="btn btn-primary" data-action="newSale">+ طلب جديد</button>`)}
      <div class="filters">
        <input type="search" id="f-q" placeholder="بحث برقم الفاتورة أو العميل أو الموبايل" value="${esc(saleFilter.q)}" data-input="saleQ">
        ${UI.select('fstatus', { '': 'كل الحالات', ...STATUSES }, saleFilter.status, 'data-change="saleStatusFilter" aria-label="الحالة"')}
        ${UI.select('fchannel', { '': 'كل القنوات', ...CHANNELS }, saleFilter.channel, 'data-change="saleChannelFilter" aria-label="القناة"')}
      </div>
      ${table(['الفاتورة', 'التاريخ', 'العميل', 'القناة', '#الإجمالي', '#التكلفة', '#الربح', 'الدفع', 'الحالة', ''], rows, {
        empty: 'لا توجد طلبات في هذه الفترة',
        foot: rows.length ? `<tr><td colspan="4">الإجمالي (${rows.length} طلب)</td>${tdn(fmt(tot.total))}${tdn(fmt(tot.cogs))}${tdn(fmt(tot.profit))}<td colspan="3"></td></tr>` : '',
      })}`;
  }

  function saleLineRow(it = {}) {
    const st = it.productId ? J().inventory.products[it.productId] : null;
    return `<tr class="line">
      <td>${UI.select('l-product', productOptions(), it.productId || '', 'class="l-product" aria-label="المنتج"')}<small class="l-stock muted">${st ? `متاح: ${fmt(st.available)}` : ''}</small></td>
      <td><input class="l-qty" type="number" min="1" step="1" value="${it.qty || 1}" aria-label="الكمية"></td>
      <td><input class="l-price" type="number" min="0" step="0.01" value="${it.price ?? ''}" aria-label="السعر"></td>
      <td class="num l-total">0</td>
      <td><button type="button" class="icon-btn" data-line-remove aria-label="حذف السطر">✕</button></td></tr>`;
  }

  function saleForm(sale) {
    const s = S();
    const isNew = !sale;
    sale = sale || { id: uid(), date: today(), channel: 'instagram', status: 'pending', payment: 'cod', courierId: (s.couriers[0] || {}).id, courierFee: 0, shippingCharged: 0, discount: 0, items: [{ qty: 1 }], returnFee: 0 };
    const custOpts = [{ v: '', l: 'اختر العميل…' }, { v: '__new', l: '+ عميل جديد' }, ...s.customers.map((c) => ({ v: c.id, l: `${c.name}${c.phone ? ' — ' + c.phone : ''}` }))];
    const body = `
      <div class="form-grid">
        ${UI.field('التاريخ', UI.input('date', sale.date, 'type="date" required'), { req: true })}
        ${UI.field('العميل', UI.select('customerId', custOpts, sale.customerId || ''), {})}
        ${UI.field('القناة', UI.select('channel', CHANNELS, sale.channel))}
        ${UI.field('الحالة', UI.select('status', STATUSES, sale.status))}
      </div>
      <div class="form-grid new-customer" hidden>
        ${UI.field('اسم العميل', UI.input('cName', ''), { req: true })}
        ${UI.field('الموبايل', UI.input('cPhone', '', 'inputmode="tel"'))}
        ${UI.field('المحافظة / المدينة', UI.input('cCity', ''))}
        ${UI.field('العنوان', UI.input('cAddress', ''))}
      </div>
      <div class="table-wrap"><table class="lines"><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر البيع</th><th class="num">الإجمالي</th><th></th></tr></thead>
        <tbody id="lines">${sale.items.map(saleLineRow).join('')}</tbody></table></div>
      <button type="button" class="btn btn-small" id="add-line">+ إضافة صنف</button>
      <div class="form-grid">
        ${UI.field('خصم (ج.م)', UI.input('discount', sale.discount || 0, 'type="number" min="0" step="0.01"'))}
        ${UI.field('شحن محصل من العميل', UI.input('shippingCharged', sale.shippingCharged || 0, 'type="number" min="0" step="0.01"'))}
        ${UI.field('طريقة الدفع', UI.select('payment', [{ v: 'cod', l: 'الدفع عند الاستلام (مع شركة الشحن)' }, ...accountOptions().map((a) => ({ v: a.v, l: 'مدفوع مقدمًا — ' + a.l }))], sale.payment))}
        ${UI.field('شركة الشحن', UI.select('courierId', [{ v: '', l: '—' }, ...s.couriers.map((c) => ({ v: c.id, l: c.name }))], sale.courierId || ''))}
        ${UI.field('تكلفة الشحن علينا', UI.input('courierFee', sale.courierFee || 0, 'type="number" min="0" step="0.01"'), { hint: 'تخصمها شركة الشحن من التحصيل' })}
      </div>
      <div class="form-grid return-fields" hidden>
        ${UI.field('تاريخ المرتجع', UI.input('returnDate', sale.returnDate || today(), 'type="date"'))}
        ${UI.field('مصاريف المرتجع', UI.input('returnFee', sale.returnFee || 0, 'type="number" min="0" step="0.01"'))}
      </div>
      ${UI.field('ملاحظات', `<textarea id="f-notes" name="notes" rows="2">${esc(sale.notes || '')}</textarea>`)}
      <div class="summary" id="sale-summary"></div>`;
    UI.modal({
      title: isNew ? 'طلب جديد' : `تعديل الطلب ${esc(invoiceNo(sale))}`, body, wide: true,
      onOpen(f) {
        const lines = f.querySelector('#lines');
        const recalc = () => {
          let gross = 0, cost = 0;
          lines.querySelectorAll('.line').forEach((r) => {
            const pid = r.querySelector('.l-product').value; const q = num(r.querySelector('.l-qty').value); const pr = num(r.querySelector('.l-price').value);
            gross += q * pr; r.querySelector('.l-total').textContent = fmt(q * pr);
            const st = pid && J().inventory.products[pid];
            r.querySelector('.l-stock').textContent = st ? `متاح: ${fmt(st.available)} · تكلفة ${fmt(st.avgCost, 0)}` : '';
            if (st) cost += q * st.avgCost;
          });
          const disc = num(f.discount.value), ship = num(f.shippingCharged.value), fee = num(f.courierFee.value);
          const total = gross - disc + ship;
          const profit = total - cost - fee;
          f.querySelector('#sale-summary').innerHTML = `<div><span>إجمالي الأصناف</span><b>${fmt(gross)}</b></div><div><span>الخصم</span><b>${fmt(disc)}</b></div><div><span>شحن محصل</span><b>${fmt(ship)}</b></div><div class="strong"><span>المطلوب من العميل</span><b>${fmt(total)} ج.م</b></div><div><span>التكلفة المتوقعة</span><b>${fmt(cost)}</b></div><div class="${profit < 0 ? 'bad-text' : 'good-text'}"><span>الربح المتوقع</span><b>${fmt(profit)}</b></div>`;
        };
        f.querySelector('#add-line').addEventListener('click', () => { lines.insertAdjacentHTML('beforeend', saleLineRow({ qty: 1 })); recalc(); });
        lines.addEventListener('click', (e) => { if (e.target.closest('[data-line-remove]') && lines.children.length > 1) { e.target.closest('tr').remove(); recalc(); } });
        lines.addEventListener('change', (e) => {
          if (e.target.classList.contains('l-product')) { const p = productById(e.target.value); const pr = e.target.closest('tr').querySelector('.l-price'); if (p && !num(pr.value)) pr.value = p.price || ''; }
          recalc();
        });
        f.addEventListener('input', recalc);
        const toggle = () => {
          f.querySelector('.new-customer').hidden = f.customerId.value !== '__new';
          f.querySelector('#f-cName').required = f.customerId.value === '__new';
          f.querySelector('.return-fields').hidden = f.status.value !== 'returned';
        };
        f.customerId.addEventListener('change', toggle); f.status.addEventListener('change', toggle);
        toggle(); recalc();
      },
      onSubmit(f, fd) {
        const items = [...f.querySelectorAll('#lines .line')].map((r) => ({ productId: r.querySelector('.l-product').value, qty: num(r.querySelector('.l-qty').value), price: num(r.querySelector('.l-price').value) })).filter((l) => l.productId && l.qty > 0);
        if (!items.length) { UI.toast('أضف صنفًا واحدًا على الأقل', 'bad'); return false; }
        let customerId = fd.get('customerId');
        if (customerId === '__new') {
          const c = { id: uid(), name: fd.get('cName').trim(), phone: fd.get('cPhone').trim(), city: fd.get('cCity').trim(), address: fd.get('cAddress').trim() };
          S().customers.push(c); customerId = c.id;
        }
        const status = fd.get('status');
        const obj = { ...sale, date: fd.get('date'), customerId, channel: fd.get('channel'), status, items, discount: num(fd.get('discount')), shippingCharged: num(fd.get('shippingCharged')), payment: fd.get('payment'), courierId: fd.get('courierId'), courierFee: num(fd.get('courierFee')), returnDate: status === 'returned' ? fd.get('returnDate') : '', returnFee: status === 'returned' ? num(fd.get('returnFee')) : 0, notes: fd.get('notes') };
        if (isNew) obj.no = S().settings.nextInvoiceNo++;
        DB.upsert('sales', obj);
        UI.toast(isNew ? `تم تسجيل الطلب ${invoiceNo(obj)}` : 'تم حفظ التعديلات');
        render();
      },
    });
  }

  function viewSale(sale) {
    const s = S();
    const c = DB.find('customers', sale.customerId) || {};
    const p = Acc.saleProfit(sale, J());
    const body = `
      <article class="invoice">
        <header class="inv-head"><div><div class="brand-mark">${esc(s.settings.businessName)}</div><small class="muted">${esc(s.settings.businessPhone || '')}</small></div>
          <div class="inv-meta"><b>فاتورة ${esc(invoiceNo(sale))}</b><span>${fmtDate(sale.date)}</span>${UI.pill(STATUSES[sale.status], statusKind[sale.status])}</div></header>
        <div class="inv-party"><span class="muted">العميل</span><b>${esc(c.name || '—')}</b><span>${esc(c.phone || '')}</span><span>${esc([c.city, c.address].filter(Boolean).join(' — '))}</span></div>
        ${table(['الصنف', '#الكمية', '#السعر', '#الإجمالي'], sale.items.map((it) => `<tr>${td(esc(productLabel(productById(it.productId))))}${tdn(fmt(it.qty))}${tdn(fmt(it.price))}${tdn(fmt(it.qty * it.price))}</tr>`), {
          foot: `<tr><td colspan="3">إجمالي الأصناف</td>${tdn(fmt(p.gross))}</tr>${p.discount ? `<tr><td colspan="3">خصم</td>${tdn('-' + fmt(p.discount))}</tr>` : ''}${p.shipping ? `<tr><td colspan="3">مصاريف الشحن</td>${tdn(fmt(p.shipping))}</tr>` : ''}<tr class="grand"><td colspan="3">المطلوب</td>${tdn(fmt(p.total) + ' ج.م')}</tr>`,
        })}
        <p class="muted">الدفع: ${sale.payment === 'cod' ? 'عند الاستلام' : 'مدفوع مقدمًا — ' + esc(nameOf('accounts', sale.payment))} · الشحن: ${esc(nameOf('couriers', sale.courierId))}</p>
        ${sale.notes ? `<p>${esc(sale.notes)}</p>` : ''}
      </article>
      <div class="internal"><span>داخلي — لا يظهر للعميل:</span> التكلفة ${fmt(p.cogs)} · شحن علينا ${fmt(sale.courierFee)} · الربح <b class="${p.profit < 0 ? 'bad-text' : 'good-text'}">${fmt(p.profit)} ج.م</b></div>`;
    UI.modal({ title: `فاتورة ${esc(invoiceNo(sale))}`, body, wide: true,
      tools: { title: `فاتورة ${invoiceNo(sale)}`, target: '.invoice', invoice: true, file: `invoice-${invoiceNo(sale)}` },
      footer: `<button type="button" class="btn" id="edit-btn">تعديل</button><button type="button" class="btn" data-close>إغلاق</button>`,
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
    return `<tr class="cost"><td><input class="c-label" value="${esc(c.label || '')}" placeholder="شحن جوي، جمارك، تخليص…" aria-label="البند"></td>
      <td><input class="c-amount" type="number" min="0" step="0.01" value="${c.amount ?? ''}" aria-label="المبلغ بالجنيه"></td>
      <td>${UI.select('c-account', accountOptions(), c.accountId || (S().accounts[0] || {}).id, 'class="c-account" aria-label="دُفع من"')}</td>
      <td><input class="c-date" type="date" value="${c.date || ''}" aria-label="تاريخ الدفع"></td>
      <td><button type="button" class="icon-btn" data-line-remove aria-label="حذف السطر">✕</button></td></tr>`;
  }

  function shipmentForm(sh) {
    const s = S();
    if (!s.suppliers.length) { UI.toast('أضف موردًا أولًا من شاشة الموردين', 'bad'); location.hash = 'suppliers'; return; }
    const isNew = !sh;
    const sup0 = s.suppliers[0];
    sh = sh || { id: uid(), ref: '', supplierId: sup0.id, currency: sup0.currency, rate: s.settings.rates[sup0.currency] || 1, orderDate: today(), status: 'ordered', receivedDate: '', items: [{ qty: 1 }], costs: [], notes: '' };
    const body = `
      <div class="form-grid">
        ${UI.field('رقم / مرجع الشحنة', UI.input('ref', sh.ref, 'placeholder="مثال: SA-2610"'))}
        ${UI.field('المورد', UI.select('supplierId', s.suppliers.map((x) => ({ v: x.id, l: `${x.name} (${COUNTRIES[x.country] || ''})` })), sh.supplierId), { req: true })}
        ${UI.field('عملة الفاتورة', UI.select('currency', CURRENCIES, sh.currency))}
        ${UI.field('سعر الصرف (جنيه لكل وحدة)', UI.input('rate', sh.rate, 'type="number" min="0" step="0.0001" required'), { req: true, hint: 'السعر الذي حوّلت به فعليًا' })}
        ${UI.field('تاريخ الطلب', UI.input('orderDate', sh.orderDate, 'type="date" required'), { req: true })}
        ${UI.field('الحالة', UI.select('status', SHIP_STATUSES, sh.status))}
        ${UI.field('تاريخ الاستلام', UI.input('receivedDate', sh.receivedDate || today(), 'type="date"'), { cls: 'recv-field' })}
      </div>
      <h3 class="sub-title">الأصناف (بسعر المورد)</h3>
      <div class="table-wrap"><table class="lines"><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة <span class="cur-label"></span></th><th class="num">بالجنيه</th><th class="num">تكلفة الوحدة الواصلة</th><th></th></tr></thead>
        <tbody id="lines">${sh.items.map(shipLineRow).join('')}</tbody></table></div>
      <button type="button" class="btn btn-small" id="add-line">+ إضافة صنف</button>
      <h3 class="sub-title">مصاريف إضافية بالجنيه (شحن، جمارك، تخليص، عمولات)</h3>
      <div class="table-wrap"><table class="lines"><thead><tr><th>البند</th><th>المبلغ</th><th>دُفع من</th><th>تاريخ الدفع</th><th></th></tr></thead>
        <tbody id="costs">${sh.costs.map(costRow).join('')}</tbody></table></div>
      <button type="button" class="btn btn-small" id="add-cost">+ إضافة مصروف</button>
      ${UI.field('ملاحظات', `<textarea id="f-notes" name="notes" rows="2">${esc(sh.notes || '')}</textarea>`)}
      <div class="summary" id="ship-summary"></div>`;
    const read = (f) => ({
      ...sh, ref: f.ref.value.trim(), supplierId: f.supplierId.value, currency: f.currency.value, rate: num(f.rate.value), orderDate: f.orderDate.value, status: f.status.value,
      receivedDate: f.status.value === 'received' ? f.receivedDate.value : '', notes: f.notes.value,
      items: [...f.querySelectorAll('#lines .line')].map((r) => ({ productId: r.querySelector('.l-product').value, qty: num(r.querySelector('.l-qty').value), unitCost: num(r.querySelector('.l-cost').value) })).filter((l) => l.productId && l.qty > 0),
      costs: [...f.querySelectorAll('#costs .cost')].map((r) => ({ label: r.querySelector('.c-label').value.trim(), amount: num(r.querySelector('.c-amount').value), accountId: r.querySelector('.c-account').value, date: r.querySelector('.c-date').value })).filter((c) => c.amount > 0),
    });
    UI.modal({
      title: isNew ? 'شحنة استيراد جديدة' : `تعديل الشحنة ${esc(sh.ref)}`, body, wide: true,
      onOpen(f) {
        const lines = f.querySelector('#lines'), costs = f.querySelector('#costs');
        const recalc = () => {
          const draft = read(f);
          const allRows = [...lines.querySelectorAll('.line')];
          const c = Acc.shipmentCosting({ ...draft, items: allRows.map((r) => ({ productId: r.querySelector('.l-product').value, qty: num(r.querySelector('.l-qty').value), unitCost: num(r.querySelector('.l-cost').value) })) });
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
        if (!obj.rate) { UI.toast('أدخل سعر الصرف', 'bad'); return false; }
        DB.upsert('shipments', obj);
        UI.toast(isNew ? 'تم تسجيل الشحنة' : 'تم حفظ الشحنة');
        render();
      },
    });
  }

  function landedView(sh) {
    const c = Acc.shipmentCosting(sh);
    UI.modal({ title: `تكلفة الوحدة — شحنة ${esc(sh.ref)}`, wide: true, tools: { title: `تكلفة الوحدة الواصلة — شحنة ${sh.ref || ''}`, subtitle: `${nameOf('suppliers', sh.supplierId)} · سعر الصرف ${sh.rate}`, file: `landed-${sh.ref || 'shipment'}` },
      body: `${table(['المنتج', '#الكمية', `#سعر المورد (${sh.currency})`, '#بالجنيه', '#نصيبه من المصاريف', '#تكلفة الوحدة الواصلة', '#سعر البيع', '#الهامش المتوقع'], c.lines.map((l) => {
        const p = productById(l.productId) || {};
        return `<tr>${td(esc(productLabel(p)))}${tdn(fmt(l.qty))}${tdn(fmt(l.unitCost))}${tdn(fmt(l.egp))}${tdn(fmt(l.extras))}${tdn(`<b>${fmt(l.landedUnit)}</b>`)}${tdn(fmt(p.price))}${tdn(p.price ? pct((p.price - l.landedUnit) / p.price) : '—')}</tr>`;
      }), { foot: `<tr><td>الإجمالي</td>${tdn(fmt(c.totalQty))}${tdn(fmt(c.goodsForeign))}${tdn(fmt(c.goodsEGP))}${tdn(fmt(c.extras))}${tdn(fmt(c.landedTotal))}<td colspan="2"></td></tr>` })}` });
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
      return `<tr>${td(esc(p.sku || ''), 'mono')}${td(`<b>${esc(p.brand || '')}</b> ${esc(p.name)}`)}${td(p.sizeMl ? p.sizeMl + ' مل' : '—')}${td(GENDERS[p.gender] || '—')}
        ${tdn(fmt(p.price))}${tdn(fmt(st.qty))}${tdn(st.reserved ? fmt(st.reserved) : '—')}${tdn(`<span class="${st.available <= 0 ? 'bad-text' : low ? 'warn-text' : ''}">${fmt(st.available)}</span>`)}
        ${tdn(fmt(st.avgCost))}${tdn(fmt(st.value))}${tdn(margin == null ? '—' : pct(margin))}
        ${td(st.available <= 0 ? UI.pill('نفد', 'bad') : low ? UI.pill('اطلب الآن', 'warn') : UI.pill('متوفر', 'good'))}
        ${actions(btn('حركة', 'productMoves', p.id), btn('تعديل', 'editProduct', p.id), btn('حذف', 'delProduct', p.id, 'danger'))}</tr>`;
    });
    const adj = [...s.adjustments].sort((a, b) => (a.date < b.date ? 1 : -1)).map((a) => `<tr>${td(fmtDate(a.date))}${td(esc(productLabel(productById(a.productId))))}${td(Acc.ADJ_REASONS[a.reason] || a.reason)}${tdn(fmt(a.qty))}${tdn(fmt(J().inventory.adjCost[a.id] || 0))}${td(esc(a.notes || ''))}${actions(btn('حذف', 'delAdjustment', a.id, 'danger'))}</tr>`);
    return `${header('المنتجات والمخزون', 'الرصيد والتكلفة تُحسب تلقائيًا من الشحنات المستلمة والمبيعات والمرتجعات بطريقة المتوسط المرجح.', '<button class="btn" data-action="newAdjustment">تسوية مخزون</button><button class="btn btn-primary" data-action="newProduct">+ منتج جديد</button>')}
      <section class="kpis kpis-3">${kpi('قيمة المخزون بالتكلفة', money0(totals.value))}${kpi('قيمته بسعر البيع', money0(totals.retail))}${kpi('ربح متوقع في المخزون', money0(totals.retail - totals.value), totals.retail ? `هامش ${pct((totals.retail - totals.value) / totals.retail)}` : '')}</section>
      ${table(['الكود', 'المنتج', 'الحجم', 'الفئة', '#سعر البيع', '#الرصيد', '#محجوز', '#متاح', '#متوسط التكلفة', '#قيمة المخزون', '#الهامش', 'الحالة', ''], rows, { empty: 'لا توجد منتجات بعد' })}
      <h2 class="section-title">تسويات المخزون (افتتاحي، تالف، تسترات، هدايا، فروق جرد)</h2>
      ${table(['التاريخ', 'المنتج', 'السبب', '#الكمية', '#التكلفة', 'ملاحظات', ''], adj, { empty: 'لا توجد تسويات' })}`;
  }

  function productForm(p) {
    const isNew = !p;
    p = p || { id: uid(), sku: '', brand: '', name: '', sizeMl: 100, gender: 'unisex', price: '', minStock: S().settings.lowStock };
    UI.modal({ title: isNew ? 'منتج جديد' : 'تعديل المنتج',
      body: `<div class="form-grid">
        ${UI.field('الماركة', UI.input('brand', p.brand, 'placeholder="لطافة، أرماف، الرصاصي…"'))}
        ${UI.field('اسم العطر', UI.input('name', p.name, 'required'), { req: true })}
        ${UI.field('الحجم (مل)', UI.input('sizeMl', p.sizeMl, 'type="number" min="0"'))}
        ${UI.field('الفئة', UI.select('gender', GENDERS, p.gender))}
        ${UI.field('كود المنتج (SKU)', UI.input('sku', p.sku))}
        ${UI.field('سعر البيع (ج.م)', UI.input('price', p.price, 'type="number" min="0" step="0.01" required'), { req: true })}
        ${UI.field('حد إعادة الطلب', UI.input('minStock', p.minStock, 'type="number" min="0"'), { hint: 'ينبهك عندما يقل المتاح عن هذا الرقم' })}
      </div>`,
      onSubmit(f, fd) {
        DB.upsert('products', { ...p, brand: fd.get('brand').trim(), name: fd.get('name').trim(), sizeMl: num(fd.get('sizeMl')), gender: fd.get('gender'), sku: fd.get('sku').trim(), price: num(fd.get('price')), minStock: num(fd.get('minStock')) });
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
        if (['damage', 'tester', 'gift'].includes(reason) && qty > 0) qty = -qty;
        if (reason === 'opening' && (qty < 0 || fd.get('unitCost') === '')) { UI.toast('المخزون الافتتاحي يحتاج كمية موجبة وتكلفة وحدة', 'bad'); return false; }
        DB.upsert('adjustments', { id: uid(), date: fd.get('date'), productId: fd.get('productId'), qty, unitCost: qty > 0 && fd.get('unitCost') !== '' ? num(fd.get('unitCost')) : null, reason, notes: fd.get('notes') });
        UI.toast('تم تسجيل التسوية'); render();
      } });
  }

  function productMoves(p) {
    const labels = { in: 'وارد', sale: 'بيع', return: 'مرتجع', outAdj: 'تسوية بالخصم' };
    const rows = J().inventory.movements.filter((m) => m.productId === p.id).map((m) => {
      let ref = '';
      if (m.src.type === 'shipment') ref = 'شحنة ' + ((DB.find('shipments', m.src.id) || {}).ref || '');
      else if (m.src.type === 'sale') ref = 'فاتورة ' + invoiceNo(DB.find('sales', m.src.id) || {});
      else ref = Acc.ADJ_REASONS[(DB.find('adjustments', m.src.id) || {}).reason] || 'تسوية';
      const sign = m.kind === 'in' || m.kind === 'return' ? 1 : -1;
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
      onSubmit(f, fd) { DB.upsert('supplierPayments', { ...p, date: fd.get('date'), supplierId: fd.get('supplierId'), amount: num(fd.get('amount')), rate: num(fd.get('rate')), accountId: fd.get('accountId'), fee: num(fd.get('fee')), notes: fd.get('notes') }); UI.toast('تم تسجيل الدفعة'); render(); } });
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
      if (!Acc.BOOKED.has(x.status)) return;
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
      ...s.equity.map((t) => ({ date: t.date, kind: t.type === 'drawing' ? 'مسحوبات' : 'رأس مال', desc: nameOf('accounts', t.accountId), amount: t.amount, extra: t.notes || '', list: 'equity', id: t.id })),
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
      onSubmit(f, fd) { if (fd.get('fromId') === fd.get('toId')) { UI.toast('اختر حسابين مختلفين', 'bad'); return false; } DB.upsert('transfers', { ...t, date: fd.get('date'), fromId: fd.get('fromId'), toId: fd.get('toId'), amount: num(fd.get('amount')), fee: num(fd.get('fee')), notes: fd.get('notes') }); UI.toast(isNew ? 'تم التحويل' : 'تم الحفظ'); render(); } });
  }
  function settlementForm(t) {
    const s = S(); const isNew = !t;
    if (!s.couriers.length) { UI.toast('أضف شركة شحن من الإعدادات', 'bad'); return; }
    const bal = Acc.courierBalances(s, J());
    t = t || { id: uid(), date: today(), courierId: s.couriers[0].id, accountId: (s.accounts.find((a) => a.type === 'bank') || s.accounts[0] || {}).id, amount: '', notes: '' };
    UI.modal({ title: 'تحصيل / سداد مع شركة شحن',
      body: `<div class="form-grid">${UI.field('التاريخ', UI.input('date', t.date, 'type="date" required'), { req: true })}${UI.field('شركة الشحن', UI.select('courierId', s.couriers.map((c) => ({ v: c.id, l: `${c.name} (الرصيد ${fmt(bal[c.id] || 0)})` })), t.courierId))}${UI.field('إلى حساب', UI.select('accountId', accountOptions(), t.accountId))}${UI.field('المبلغ المستلم', UI.input('amount', t.amount, 'type="number" step="0.01" required'), { req: true, hint: 'صافي التحويل بعد خصم مصاريف الشحن. رقم سالب لو أنت اللي دفعت لهم' })}${UI.field('ملاحظات', UI.input('notes', t.notes), { cls: 'span-2' })}</div>`,
      onSubmit(f, fd) { DB.upsert('settlements', { ...t, date: fd.get('date'), courierId: fd.get('courierId'), accountId: fd.get('accountId'), amount: num(fd.get('amount')), notes: fd.get('notes') }); UI.toast(isNew ? 'تم تسجيل التحصيل' : 'تم الحفظ'); render(); } });
  }
  function equityForm(t) {
    const s = S(); const isNew = !t;
    t = t || { id: uid(), date: today(), type: 'capital', amount: '', accountId: (s.accounts[0] || {}).id, notes: '' };
    UI.modal({ title: 'رأس مال / مسحوبات',
      body: `<div class="form-grid">${UI.field('التاريخ', UI.input('date', t.date, 'type="date" required'), { req: true })}${UI.field('النوع', UI.select('type', { capital: 'إضافة رأس مال', drawing: 'مسحوبات شخصية' }, t.type))}${UI.field('المبلغ', UI.input('amount', t.amount, 'type="number" min="0" step="0.01" required'), { req: true })}${UI.field('الحساب', UI.select('accountId', accountOptions(), t.accountId))}${UI.field('ملاحظات', UI.input('notes', t.notes), { cls: 'span-2' })}</div>`,
      onSubmit(f, fd) { DB.upsert('equity', { ...t, date: fd.get('date'), type: fd.get('type'), amount: num(fd.get('amount')), accountId: fd.get('accountId'), notes: fd.get('notes') }); UI.toast(isNew ? 'تم التسجيل' : 'تم الحفظ'); render(); } });
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
      ${table(['التاريخ', 'البند', 'البيان', 'من حساب', '#المبلغ', ''], list.map((e) => `<tr>${td(fmtDate(e.date))}${td(esc((Acc.COA_MAP[e.category] || {}).name || e.category))}${td(esc(e.notes || ''))}${td(esc(nameOf('accounts', e.accountId)))}${tdn(fmt(e.amount))}${actions(btn('تعديل', 'editExpense', e.id), btn('حذف', 'delExpense', e.id, 'danger'))}</tr>`), { empty: 'لا توجد مصروفات في هذه الفترة' })}`;
  }
  function expenseForm(e) {
    const s = S(); const isNew = !e;
    e = e || { id: uid(), date: today(), category: '5300', amount: '', accountId: (s.accounts[0] || {}).id, notes: '' };
    UI.modal({ title: isNew ? 'مصروف جديد' : 'تعديل المصروف',
      body: `<div class="form-grid">${UI.field('التاريخ', UI.input('date', e.date, 'type="date" required'), { req: true })}${UI.field('البند', UI.select('category', Acc.EXPENSE_CATEGORIES.map((c) => ({ v: c, l: Acc.COA_MAP[c].name })), e.category))}${UI.field('المبلغ', UI.input('amount', e.amount, 'type="number" min="0" step="0.01" required'), { req: true })}${UI.field('دُفع من', UI.select('accountId', accountOptions(), e.accountId))}${UI.field('البيان', UI.input('notes', e.notes, 'placeholder="إعلانات ميتا، علب، مرتب…"'), { cls: 'span-2' })}</div>`,
      onSubmit(f, fd) { DB.upsert('expenses', { ...e, date: fd.get('date'), category: fd.get('category'), amount: num(fd.get('amount')), accountId: fd.get('accountId'), notes: fd.get('notes') }); UI.toast('تم حفظ المصروف'); render(); } });
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
          <div class="table-wrap"><table class="je-lines"><tbody>${e.lines.map((l) => `<tr><td class="${l.cr ? 'cr-acc' : ''}">${l.cr ? 'إلى ' : 'من '}${esc(Acc.accountName(l.acc, s))}${l.party ? ` <small class="muted">(${esc(nameOf(l.party.type === 'supplier' ? 'suppliers' : 'couriers', l.party.id))})</small>` : ''}</td>${tdn(l.dr ? fmt(l.dr) : '')}${tdn(l.cr ? fmt(l.cr) : '')}</tr>`).join('')}</tbody></table></div></div>`).join('') || UI.empty('لا توجد قيود في هذه الفترة')}</div>`;
    }
    if (report === 'ledger') {
      const opts = [...Acc.COA.filter((a) => a.code !== '1100').map((a) => ({ v: a.code, l: `${a.code} — ${a.name}` })), ...s.accounts.map((a) => ({ v: Acc.cashCode(a.id), l: `1100 — ${a.name}` }))];
      const led = Acc.ledger(s, j, ledgerAcc, period.from, period.to);
      return `<h2>دفتر الأستاذ</h2><div class="filters">${UI.select('ledgerAcc', opts, ledgerAcc, 'data-change="ledgerAcc" aria-label="الحساب"')}</div>
        ${table(['التاريخ', 'القيد', 'البيان', '#مدين', '#دائن', '#الرصيد'], led.rows.map((r) => `<tr>${td(fmtDate(r.date))}${td('#' + r.no, 'mono')}${td(esc(r.desc))}${tdn(r.dr ? fmt(r.dr) : '')}${tdn(r.cr ? fmt(r.cr) : '')}${tdn(fmt(r.balance))}</tr>`), { empty: 'لا توجد حركة', foot: `<tr><td colspan="5">رصيد أول الفترة ${fmt(led.opening)} · رصيد آخر الفترة (مدين + / دائن −)</td>${tdn(`<b>${fmt(led.closing)}</b>`)}</tr>` })}`;
    }
    if (report === 'productsPerf') {
      const rows = Acc.productPerformance(s, j, period.from, period.to);
      return `<h2>ربحية المنتجات</h2>${table(['المنتج', '#المباع', '#المرتجع', '#صافي الإيراد', '#التكلفة', '#مجمل الربح', '#الهامش'], rows.map((r) => `<tr>${td(esc(productLabel(productById(r.productId))))}${tdn(fmt(r.qty))}${tdn(r.returnedQty ? fmt(r.returnedQty) : '—')}${tdn(fmt(r.revenue))}${tdn(fmt(r.cogs))}${tdn(fmt(r.profit))}${tdn(pct(r.margin))}</tr>`), { empty: 'لا مبيعات في هذه الفترة' })}
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
      DB.replace(data); UI.toast('تم استيراد النسخة الاحتياطية'); render();
    } catch (e) { UI.toast('الملف ليس نسخة احتياطية صالحة من Florume', 'bad'); }
  }

  // =====================================================================
  // الأحداث
  // =====================================================================
  const del = (list, id, label, guard) => {
    if (guard && guard()) { UI.toast(`لا يمكن حذف ${label} لأنه مستخدم في مستندات أخرى`, 'bad'); return; }
    UI.confirm(`هل تريد حذف ${label}؟ لا يمكن التراجع.`, () => { DB.remove(list, id); UI.toast('تم الحذف'); render(); });
  };
  const ACTIONS = {
    newSale: () => saleForm(), editSale: (id) => saleForm(DB.find('sales', id)), viewSale: (id) => viewSale(DB.find('sales', id)),
    delSale: (id) => del('sales', id, 'هذا الطلب'),
    newShipment: () => shipmentForm(), editShipment: (id) => shipmentForm(DB.find('shipments', id)), landedShipment: (id) => landedView(DB.find('shipments', id)),
    delShipment: (id) => del('shipments', id, 'هذه الشحنة'),
    receiveShipment: (id) => {
      const sh = DB.find('shipments', id);
      UI.modal({ title: `استلام شحنة ${esc(sh.ref)}`, submit: 'تأكيد الاستلام', body: UI.field('تاريخ الاستلام', UI.input('receivedDate', today(), 'type="date" required'), { req: true, hint: 'تدخل الكميات المخزن بتكلفتها الواصلة في هذا التاريخ' }),
        onSubmit(f, fd) { DB.upsert('shipments', { ...sh, status: 'received', receivedDate: fd.get('receivedDate') }); UI.toast('تم استلام الشحنة وإضافتها للمخزون'); render(); } });
    },
    newProduct: () => productForm(), editProduct: (id) => productForm(DB.find('products', id)), productMoves: (id) => productMoves(DB.find('products', id)),
    delProduct: (id) => del('products', id, 'هذا المنتج', () => used(id, [['sales', (x, i) => x.items.some((l) => l.productId === i)], ['shipments', (x, i) => x.items.some((l) => l.productId === i)], ['adjustments', (x, i) => x.productId === i]])),
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
    delAccount: (id) => del('accounts', id, 'هذا الحساب', () => used(id, [['sales', (x, i) => x.payment === i], ['expenses', (x, i) => x.accountId === i], ['supplierPayments', (x, i) => x.accountId === i], ['settlements', (x, i) => x.accountId === i], ['equity', (x, i) => x.accountId === i], ['transfers', (x, i) => x.fromId === i || x.toId === i], ['shipments', (x, i) => (x.costs || []).some((c) => c.accountId === i)]]) || num((DB.find('accounts', id) || {}).opening) !== 0),
    newCourier: () => courierForm(), editCourier: (id) => courierForm(DB.find('couriers', id)),
    delCourier: (id) => del('couriers', id, 'شركة الشحن', () => used(id, [['sales', (x, i) => x.courierId === i], ['settlements', (x, i) => x.courierId === i]])),
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
    ledgerAcc: (el) => { ledgerAcc = el.value; render(); },
    saleStatus: (el) => {
      const sale = DB.find('sales', el.dataset.id);
      const upd = { ...sale, status: el.value };
      if (el.value === 'returned' && !upd.returnDate) upd.returnDate = today();
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
    if (key === 'sales' && (saleFilter.status || saleFilter.channel || saleFilter.q)) subtitle += ` · مفلتر: ${[STATUSES[saleFilter.status], CHANNELS[saleFilter.channel], saleFilter.q].filter(Boolean).join('، ')}`;
    if (key === 'treasury') subtitle += ` · حركة ${nameOf('accounts', treasuryAcc)}`;
    return { key, title, subtitle, root: isReport ? main().querySelector('.report') : main() };
  }
  function journalSheet() {
    const rows = J().entries.filter((e) => inPeriod(e.date)).flatMap((e) => e.lines.map((l) => ({ cells: [e.no, fmtDate(e.date), e.desc, Acc.accountName(l.acc, S()), l.party ? nameOf(l.party.type === 'supplier' ? 'suppliers' : 'couriers', l.party.id) : '', l.dr || '', l.cr || ''] })));
    const tot = J().entries.filter((e) => inPeriod(e.date)).reduce((t, e) => { e.lines.forEach((l) => { t[0] += l.dr; t[1] += l.cr; }); return t; }, [0, 0]);
    rows.push({ cells: ['', '', 'الإجمالي', '', '', Acc.round2(tot[0]), Acc.round2(tot[1])], total: true });
    return { name: 'دفتر اليومية', header: ['رقم القيد', 'التاريخ', 'البيان', 'الحساب', 'الطرف', 'مدين', 'دائن'], rows };
  }
  function salesDetailSheet() {
    const rows = [];
    S().sales.filter((x) => inPeriod(x.date)).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((x) => {
      const c = DB.find('customers', x.customerId) || {};
      x.items.forEach((it) => rows.push({ cells: [invoiceNo(x), fmtDate(x.date), c.name || '', c.phone || '', c.city || '', CHANNELS[x.channel] || '', STATUSES[x.status], productLabel(productById(it.productId)), it.qty, it.price, it.qty * it.price] }));
    });
    return { name: 'تفاصيل الأصناف المباعة', header: ['الفاتورة', 'التاريخ', 'العميل', 'الموبايل', 'المدينة', 'القناة', 'الحالة', 'الصنف', 'الكمية', 'السعر', 'الإجمالي'], rows };
  }
  function render() {
    const key = currentPage();
    document.querySelectorAll('.nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === '#' + key ? 'page' : 'false'));
    document.getElementById('demo-banner').hidden = !S().demo;
    const m = main();
    try { m.innerHTML = PAGES[key].render(); }
    catch (err) { console.error(err); m.innerHTML = UI.empty(`حدث خطأ أثناء عرض الصفحة: ${esc(err.message)}`); }
    const pa = m.querySelector('.page-head .page-actions');
    if (pa) pa.insertAdjacentHTML('afterbegin', '<span class="doc-tools"><button type="button" class="btn" data-action="printPage">طباعة</button><button type="button" class="btn" data-action="excelPage">تصدير Excel</button></span>');
    const sf = document.getElementById('settings-form');
    if (sf) sf.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(sf); const st = S().settings;
      Object.assign(st, { businessName: fd.get('businessName').trim() || 'Florume', businessPhone: fd.get('businessPhone').trim(), startDate: fd.get('startDate'), invoicePrefix: fd.get('invoicePrefix'), nextInvoiceNo: num(fd.get('nextInvoiceNo')) || 1, lowStock: num(fd.get('lowStock')) });
      st.rates = { SAR: num(fd.get('rate_SAR')), AED: num(fd.get('rate_AED')), USD: num(fd.get('rate_USD')) };
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
