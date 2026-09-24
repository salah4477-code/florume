/* Florume — التخزين، الأدوات المشتركة، عناصر الواجهة، والبيانات التجريبية */
(function () {
  'use strict';
  const STORAGE_KEY = 'florume.v1';

  const CURRENCIES = { EGP: 'جنيه مصري', SAR: 'ريال سعودي', AED: 'درهم إماراتي', USD: 'دولار أمريكي' };
  const COUNTRIES = { SA: 'السعودية', AE: 'الإمارات', EG: 'مصر', other: 'أخرى' };
  const CHANNELS = { instagram: 'إنستجرام', facebook: 'فيسبوك', whatsapp: 'واتساب', tiktok: 'تيك توك', website: 'الموقع', store: 'مباشر', other: 'أخرى' };
  const STATUSES = { pending: 'قيد التجهيز', shipped: 'مع شركة الشحن', delivered: 'تم التسليم', returned: 'مرتجع', cancelled: 'ملغي' };
  const SHIP_STATUSES = { ordered: 'تم الطلب', transit: 'في الطريق', received: 'تم الاستلام', cancelled: 'ملغاة' };
  const ACCOUNT_TYPES = { cash: 'نقدي', bank: 'بنك', wallet: 'محفظة إلكترونية' };
  const GENDERS = { men: 'رجالي', women: 'حريمي', unisex: 'للجنسين' };

  const emptyState = () => ({
    version: 1,
    demo: false,
    settings: { businessName: 'Florume', startDate: today().slice(0, 8) + '01', rates: { SAR: 13.2, AED: 13.5, USD: 49.5 }, invoicePrefix: 'FL-', nextInvoiceNo: 1001, lowStock: 3 },
    accounts: [
      { id: uid(), name: 'الخزينة (نقدي)', type: 'cash', opening: 0 },
      { id: uid(), name: 'حساب البنك', type: 'bank', opening: 0 },
      { id: uid(), name: 'فودافون كاش', type: 'wallet', opening: 0 },
      { id: uid(), name: 'إنستاباي', type: 'wallet', opening: 0 },
    ],
    couriers: [{ id: uid(), name: 'بوسطة' }, { id: uid(), name: 'أرامكس' }],
    suppliers: [], products: [], customers: [], shipments: [], supplierPayments: [],
    sales: [], settlements: [], expenses: [], transfers: [], equity: [], adjustments: [],
  });

  // ---------- أدوات ----------
  function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function today() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n) || 0;
  const fmt = (n, d = 2) => { const v = Math.round(num(n) * 100) / 100; return v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? d : 0, maximumFractionDigits: d }); };
  const money = (n) => `${fmt(n)} <span class="cur">ج.م</span>`;
  const pct = (n) => `${fmt(num(n) * 100, 1)}%`;
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  // ---------- التخزين ----------
  const DB = {
    state: null,
    _journal: null,
    load() {
      let raw = null;
      try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* تخزين غير متاح */ }
      if (raw) { try { this.state = migrate(JSON.parse(raw)); return 'stored'; } catch (e) { /* ملف تالف */ } }
      this.state = demoState();
      return 'demo';
    },
    save() {
      this._journal = null;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); return true; }
      catch (e) { UI.toast('تعذّر الحفظ في المتصفح — صدّر نسخة احتياطية الآن', 'bad'); return false; }
    },
    get journal() { return this._journal || (this._journal = Acc.buildJournal(this.state)); },
    replace(state) { this.state = migrate(state); this.save(); },
    find(list, id) { return (this.state[list] || []).find((x) => x.id === id); },
    upsert(list, obj) {
      const arr = this.state[list];
      const i = arr.findIndex((x) => x.id === obj.id);
      if (i >= 0) arr[i] = obj; else arr.push(obj);
      this.save();
    },
    remove(list, id) { this.state[list] = this.state[list].filter((x) => x.id !== id); this.save(); },
  };

  function migrate(s) {
    const base = emptyState();
    const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}), rates: { ...base.settings.rates, ...((s.settings || {}).rates || {}) } } };
    Object.keys(base).forEach((k) => { if (Array.isArray(base[k]) && !Array.isArray(out[k])) out[k] = []; });
    return out;
  }

  // ---------- عناصر الواجهة ----------
  const UI = {
    toast(msg, kind = 'good') {
      const el = document.createElement('div');
      el.className = `toast toast-${kind}`;
      el.setAttribute('role', 'status');
      el.textContent = msg;
      document.getElementById('toasts').appendChild(el);
      setTimeout(() => el.classList.add('out'), 2600);
      setTimeout(() => el.remove(), 3000);
    },
    modal({ title, body, submit = 'حفظ', wide = false, onSubmit, onOpen, footer, tools }) {
      const wrap = document.getElementById('modal');
      wrap.innerHTML = `
        <div class="modal-backdrop" data-close></div>
        <form class="modal-card ${wide ? 'wide' : ''}" id="modal-form" novalidate>
          <header class="modal-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="إغلاق">✕</button></header>
          <div class="modal-body">${body}</div>
          <footer class="modal-foot">${tools ? '<button type="button" class="btn" data-modal-print>طباعة</button><button type="button" class="btn" data-modal-excel>تصدير Excel</button>' : ''}${footer != null ? footer : `${onSubmit ? `<button class="btn btn-primary" type="submit">${submit}</button>` : ''}<button class="btn" type="button" data-close>${onSubmit ? 'إلغاء' : 'إغلاق'}</button>`}</footer>
        </form>`;
      wrap.hidden = false;
      document.body.classList.add('no-scroll');
      const form = wrap.querySelector('form');
      wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', UI.close));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!onSubmit) return UI.close();
        const bad = [...form.querySelectorAll('[required]')].find((i) => !String(i.value).trim());
        if (bad) { bad.focus(); bad.classList.add('invalid'); UI.toast('أكمل الحقول المطلوبة المعلّمة بـ *', 'bad'); return; }
        const res = onSubmit(form, new FormData(form));
        if (res !== false) UI.close();
      });
      if (tools) {
        const target = () => form.querySelector(tools.target || '.modal-body');
        const meta = () => ({ business: DB.state.settings.businessName, subtitle: tools.subtitle || '' });
        form.querySelector('[data-modal-print]').addEventListener('click', () => FX.printDoc({ ...meta(), title: tools.title, subtitle: tools.subtitle, html: FX.cleanForPrint(target()), invoice: tools.invoice }));
        form.querySelector('[data-modal-excel]').addEventListener('click', () => FX.exportExcel(`${tools.file || 'florume'}-${today()}.xlsx`, FX.collectSheets(form.querySelector('.modal-body'), tools.title), meta()));
      }
      if (onOpen) onOpen(form);
      const first = form.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea');
      if (first) setTimeout(() => first.focus(), 30);
      return form;
    },
    close() { const w = document.getElementById('modal'); w.hidden = true; w.innerHTML = ''; document.body.classList.remove('no-scroll'); },
    confirm(message, onYes, yes = 'نعم، احذف') {
      UI.modal({ title: 'تأكيد', body: `<p class="confirm-text">${message}</p>`, footer: `<button class="btn btn-danger" type="button" id="confirm-yes">${yes}</button><button class="btn" type="button" data-close>تراجع</button>`,
        onOpen: (f) => f.querySelector('#confirm-yes').addEventListener('click', () => { UI.close(); onYes(); }) });
    },
    field(label, input, opts = {}) { return `<label class="field ${opts.cls || ''}"><span>${label}${opts.req ? ' <b class="req">*</b>' : ''}</span>${input}${opts.hint ? `<small>${opts.hint}</small>` : ''}</label>`; },
    input(name, value = '', attrs = '') { return `<input id="f-${name}" name="${name}" value="${esc(value)}" ${attrs}>`; },
    select(name, options, value, attrs = '') {
      const opts = Array.isArray(options) ? options : Object.entries(options).map(([v, l]) => ({ v, l }));
      return `<select id="f-${name}" name="${name}" ${attrs}>${opts.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(value) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
    },
    pill(text, kind = '') { return `<span class="pill pill-${kind}">${esc(text)}</span>`; },
    empty(text, action = '') { return `<div class="empty"><p>${text}</p>${action}</div>`; },
    // ملف للحفظ: عبر صلاحية الحفظ أو التنزيل المباشر، وإن لم يتاحا نعرض المحتوى للنسخ
    async offerFile(filename, content) {
      const res = await FX.saveFile(filename, content);
      if (res !== null) return;
      UI.modal({ title: `نسخ ${esc(filename)}`, wide: true,
        body: `<p class="muted">انسخ المحتوى واحفظه في ملف باسم <code>${esc(filename)}</code>.</p><textarea id="f-export" class="export-box" readonly>${esc(content)}</textarea>`,
        footer: `<button class="btn btn-primary" type="button" id="copy-btn">نسخ</button><button class="btn" type="button" data-close>إغلاق</button>`,
        onOpen: (f) => f.querySelector('#copy-btn').addEventListener('click', () => {
          const ta = f.querySelector('textarea');
          const fallback = () => { ta.focus(); ta.select(); UI.toast('تم تحديد النص — اضغط Ctrl+C'); };
          try { navigator.clipboard.writeText(content).then(() => UI.toast('تم النسخ'), fallback); } catch (e) { fallback(); }
        }) });
    },
  };

  // ---------- بيانات تجريبية ----------
  function demoState() {
    const s = emptyState();
    s.demo = true;
    s.settings.startDate = '2026-06-01';
    const [cash, bank, voda, insta] = s.accounts;
    cash.opening = 20000; bank.opening = 340000; voda.opening = 3000;
    const [bosta, aramex] = s.couriers;
    const riyadh = { id: uid(), name: 'مؤسسة عبق الشرق للعطور', country: 'SA', currency: 'SAR', phone: '+966 50 000 0000', notes: 'الرياض — حي العليا' };
    const dubai = { id: uid(), name: 'دار المسك للتجارة', country: 'AE', currency: 'AED', phone: '+971 4 000 0000', notes: 'دبي — ديرة' };
    s.suppliers.push(riyadh, dubai);
    const P = (sku, brand, name, sizeMl, gender, price) => ({ id: uid(), sku, brand, name, sizeMl, gender, price, minStock: 6 });
    const products = [
      P('LT-KH100', 'لطافة', 'خمرة', 100, 'unisex', 1450),
      P('LT-AS100', 'لطافة', 'أسد', 100, 'men', 1250),
      P('AR-CDN105', 'أرماف', 'كلوب دي نوي إنتنس', 105, 'men', 2100),
      P('RS-HW100', 'الرصاصي', 'هوكس', 100, 'men', 1850),
      P('AJ-EV75', 'أجمل', 'إيفوك', 75, 'women', 2350),
      P('AO-KL100', 'العربية للعود', 'كلمات', 100, 'unisex', 3400),
      P('SW-SH100', 'سويس أربيان', 'شعور', 100, 'unisex', 1650),
      P('LT-YR100', 'لطافة', 'يارا', 100, 'women', 1150),
    ];
    s.products.push(...products);
    const byId = (i) => products[i].id;
    s.shipments.push({
      id: uid(), ref: 'SA-2606', supplierId: riyadh.id, currency: 'SAR', rate: 13.1, orderDate: '2026-06-03', status: 'received', receivedDate: '2026-06-12',
      items: [{ productId: byId(0), qty: 60, unitCost: 55 }, { productId: byId(1), qty: 48, unitCost: 45 }, { productId: byId(5), qty: 24, unitCost: 150 }, { productId: byId(7), qty: 48, unitCost: 40 }],
      costs: [{ label: 'شحن جوي من الرياض', amount: 11500, accountId: bank.id }, { label: 'جمارك وتخليص', amount: 9800, accountId: bank.id }], notes: '',
    });
    s.shipments.push({
      id: uid(), ref: 'AE-2607', supplierId: dubai.id, currency: 'AED', rate: 13.4, orderDate: '2026-07-02', status: 'received', receivedDate: '2026-07-10',
      items: [{ productId: byId(2), qty: 36, unitCost: 85 }, { productId: byId(3), qty: 36, unitCost: 75 }, { productId: byId(4), qty: 24, unitCost: 95 }, { productId: byId(6), qty: 36, unitCost: 65 }],
      costs: [{ label: 'شحن من دبي', amount: 9200, accountId: bank.id }, { label: 'جمارك وتخليص', amount: 8100, accountId: bank.id }], notes: '',
    });
    s.shipments.push({
      id: uid(), ref: 'SA-2609', supplierId: riyadh.id, currency: 'SAR', rate: 13.25, orderDate: '2026-09-15', status: 'transit',
      items: [{ productId: byId(0), qty: 24, unitCost: 55 }, { productId: byId(7), qty: 24, unitCost: 40 }],
      costs: [{ label: 'شحن جوي من الرياض', amount: 3900, accountId: bank.id }], notes: 'متوقع الوصول آخر الشهر',
    });
    s.supplierPayments.push(
      { id: uid(), date: '2026-06-02', supplierId: riyadh.id, amount: 8000, rate: 13.1, accountId: bank.id, fee: 150, notes: 'دفعة مقدمة' },
      { id: uid(), date: '2026-07-05', supplierId: riyadh.id, amount: 2980, rate: 13.3, accountId: bank.id, fee: 100, notes: 'تسوية شحنة يونيو' },
      { id: uid(), date: '2026-07-01', supplierId: dubai.id, amount: 10380, rate: 13.4, accountId: bank.id, fee: 150, notes: 'دفع كامل قبل الشحن' },
      { id: uid(), date: '2026-09-14', supplierId: riyadh.id, amount: 1500, rate: 13.25, accountId: bank.id, fee: 100, notes: 'دفعة مقدمة شحنة سبتمبر' },
    );
    const names = [['محمد سمير', 'القاهرة'], ['سارة عادل', 'الجيزة'], ['أحمد فتحي', 'الإسكندرية'], ['منة الله خالد', 'المنصورة'], ['عمر حسن', 'القاهرة'], ['نورهان إبراهيم', 'طنطا'], ['يوسف مجدي', 'الجيزة'], ['هدى مصطفى', 'أسيوط'], ['كريم وليد', 'القاهرة'], ['آية محمود', 'الإسماعيلية'], ['مصطفى رضا', 'الزقازيق'], ['ريم أشرف', 'القاهرة']];
    names.forEach(([name, city], i) => s.customers.push({ id: uid(), name, city, phone: `010${String(12345670 + i * 1117).slice(0, 8)}`, address: '' }));
    // مولد أرقام ثابت حتى تكون البيانات التجريبية متطابقة في كل مرة
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const channels = ['instagram', 'instagram', 'facebook', 'whatsapp', 'tiktok', 'website'];
    const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    let date = '2026-06-14';
    for (let i = 0; date < '2026-09-23'; i++) {
      date = rnd() < 0.55 ? date : addDays(date, 1 + Math.floor(rnd() * 2));
      const julyOnly = date < '2026-07-11';
      const pool = julyOnly ? [0, 1, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
      const lines = [{ p: pick(pool), q: 1 }];
      if (rnd() < 0.25) { const p2 = pick(pool); if (p2 !== lines[0].p) lines.push({ p: p2, q: 1 }); }
      const items = lines.map((l) => ({ productId: products[l.p].id, qty: l.q, price: products[l.p].price }));
      const r = rnd();
      const status = date > '2026-09-19' ? (r < 0.5 ? 'pending' : 'shipped') : r < 0.1 ? 'returned' : r < 0.14 ? 'cancelled' : 'delivered';
      const prepaid = rnd() < 0.3;
      s.sales.push({
        id: uid(), no: s.settings.nextInvoiceNo++, date, customerId: pick(s.customers).id, channel: pick(channels),
        items, discount: rnd() < 0.3 ? 100 : 0, shippingCharged: rnd() < 0.5 ? 70 : 0,
        courierId: rnd() < 0.7 ? bosta.id : aramex.id, courierFee: 65, payment: prepaid ? pick([voda.id, insta.id]) : 'cod',
        status, returnDate: status === 'returned' ? addDays(date, 4) : '', returnFee: status === 'returned' ? 35 : 0, notes: '',
      });
    }
    // تسويات شهرية مع شركات الشحن تقريبًا بقيمة المستحق
    const settleMonth = (month, day) => {
      const cut = `${month}-${day}`;
      const bal = Acc.courierBalances(s, Acc.buildJournal(s), cut);
      s.couriers.forEach((c) => { const amt = Math.floor((bal[c.id] || 0) * 0.95); if (amt > 0) s.settlements.push({ id: uid(), date: cut, courierId: c.id, accountId: bank.id, amount: amt, notes: 'تسوية تحصيل COD' }); });
    };
    [['2026-06', '30'], ['2026-07', '15'], ['2026-07', '31'], ['2026-08', '15'], ['2026-08', '31'], ['2026-09', '15']].forEach(([m, d]) => settleMonth(m, d));
    const X = (date, category, amount, accountId, notes) => s.expenses.push({ id: uid(), date, category, amount, accountId, notes });
    ['06', '07', '08', '09'].forEach((m) => {
      X(`2026-${m}-05`, '5300', m === '06' ? 5000 : 7000, bank.id, 'إعلانات ميتا');
      X(`2026-${m}-07`, '5400', 2200, cash.id, 'علب هدايا وأكياس وفقاعات');
      X(`2026-${m}-28`, '5500', 5000, bank.id, 'مرتب مسؤول الطلبات');
      X(`2026-${m}-10`, '5950', 450, voda.id, 'اشتراك المتجر الإلكتروني');
    });
    X('2026-08-15', '5300', 3500, bank.id, 'تعاون مع مؤثرة');
    s.transfers.push({ id: uid(), date: '2026-08-02', fromId: voda.id, toId: bank.id, amount: 12000, fee: 60, notes: 'تفريغ المحفظة' });
    s.transfers.push({ id: uid(), date: '2026-09-02', fromId: insta.id, toId: bank.id, amount: 15000, fee: 0, notes: '' });
    s.equity.push({ id: uid(), date: '2026-08-30', type: 'drawing', amount: 8000, accountId: bank.id, notes: 'مسحوبات الشريك' });
    s.adjustments.push({ id: uid(), date: '2026-07-15', productId: byId(2), qty: -1, reason: 'tester', notes: 'زجاجة تستر للتصوير' });
    s.adjustments.push({ id: uid(), date: '2026-08-20', productId: byId(0), qty: -1, reason: 'damage', notes: 'انكسرت أثناء التغليف' });
    return s;
  }

  window.F = { STORAGE_KEY, CURRENCIES, COUNTRIES, CHANNELS, STATUSES, SHIP_STATUSES, ACCOUNT_TYPES, GENDERS, DB, UI, uid, today, esc, num, fmt, money, pct, inFrame, emptyState, demoState };
})();
