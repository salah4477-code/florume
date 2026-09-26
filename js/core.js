/* Florume — التخزين، الأدوات المشتركة، عناصر الواجهة، والبيانات التجريبية */
(function () {
  'use strict';
  const STORAGE_KEY = 'florume.v1';

  const CURRENCIES = { EGP: 'جنيه مصري', SAR: 'ريال سعودي', AED: 'درهم إماراتي', USD: 'دولار أمريكي' };
  const COUNTRIES = { SA: 'السعودية', AE: 'الإمارات', EG: 'مصر', other: 'أخرى' };
  const CHANNELS = { instagram: 'إنستجرام', facebook: 'فيسبوك', whatsapp: 'واتساب', tiktok: 'تيك توك', website: 'الموقع', store: 'مباشر', other: 'أخرى' };
  const STATUSES = { pending: 'قيد التجهيز', shipped: 'مع شركة الشحن', delivered: 'تم التسليم', returned: 'مرتجع', lost: 'ضاع مع الشحن', cancelled: 'ملغي' };
  const GOVERNORATES = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية', 'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء'];
  const SHIP_STATUSES = { ordered: 'تم الطلب', transit: 'في الطريق', received: 'تم الاستلام', cancelled: 'ملغاة' };
  const ACCOUNT_TYPES = { cash: 'نقدي', bank: 'بنك', wallet: 'محفظة إلكترونية' };
  const GENDERS = { men: 'رجالي', women: 'حريمي', unisex: 'للجنسين' };

  const emptyState = () => ({
    version: 1,
    demo: false,
    settings: { businessName: 'Florume', startDate: today().slice(0, 8) + '01', rates: { SAR: 13.2, AED: 13.5, USD: 49.5 }, invoicePrefix: 'FL-', nextInvoiceNo: 1001, lowStock: 3,
      alerts: { pendingDays: 2, shippedDays: 7, settleDays: 14, dueDays: 7, stagnantDays: 60 }, waFooter: 'شكرًا لطلبك من متجرنا 🌸',
      sampleProductId: '', sampleQty: 1, targetMargin: 30, leadDays: 14, safetyDays: 7, coverDays: 30, reorderAfterDays: 75,
      waReorder: 'أهلًا {name} 🌸 عطرك {product} قرب يخلص؟ نورتنا المرة اللي فاتت، وعندنا ليك عرض خاص على الطلب الجاي 💛' },
    accounts: [
      { id: uid(), name: 'الخزينة (نقدي)', type: 'cash', opening: 0 },
      { id: uid(), name: 'حساب البنك', type: 'bank', opening: 0 },
      { id: uid(), name: 'فودافون كاش', type: 'wallet', opening: 0 },
      { id: uid(), name: 'إنستاباي', type: 'wallet', opening: 0 },
    ],
    couriers: [{ id: uid(), name: 'بوسطة' }, { id: uid(), name: 'أرامكس' }],
    suppliers: [], products: [], customers: [], shipments: [], supplierPayments: [],
    sales: [], settlements: [], expenses: [], transfers: [], equity: [], adjustments: [],
    campaigns: [], partners: [], distributions: [], decants: [], reconciliations: [],
    coupons: [], commissionPayments: [], recurring: [], formation: [], cashCounts: [],
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
      if (raw) { try { this.state = migrate(JSON.parse(raw)); this.commit(); return 'stored'; } catch (e) { /* ملف تالف */ } }
      this.state = demoState();
      this.commit();
      return 'demo';
    },
    // آخر نسخة اتحفظت فعلًا: منها بنعرف الحفظ الجاي فيه تعديل ولا حذف، وليها بنرجع لو الباسورد اتلغى
    commit(text) { this._committed = text || JSON.stringify(this.state); this._lockOn = !!(window.LOCK && LOCK.enabled(this.state.settings && this.state.settings.lock)); },
    save() {
      if (Gate.check(this)) return true;
      this._journal = null;
      const ok = this.saveLocal();
      if (window.CLOUD) window.CLOUD.onSave();
      return ok;
    },
    // نسخة الجهاز (بتفضل موجودة حتى في وضع السحابة عشان الفتح يبقى سريع)
    saveLocal() {
      const text = JSON.stringify(this.state);
      this.commit(text);
      try { localStorage.setItem(STORAGE_KEY, text); return true; }
      catch (e) { if (!(window.CLOUD && window.CLOUD.mode === 'cloud')) UI.toast('تعذّر الحفظ في المتصفح — صدّر نسخة احتياطية الآن', 'bad'); return false; }
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


  // ---------- قفل التعديل والحذف بالباسورد ----------
  // أي حفظ فيه تعديل أو حذف لسجل موجود (أو تغيير في الإعدادات) بيستنى الباسورد؛ الإضافة الجديدة لأ.
  // الزراير المعروفة (تعديل/حذف/تغيير الحالة) بتسأل قبل ما تفتح، والحفظ نفسه شبكة أمان لأي مسار تاني.
  const Gate = {
    op: false, // عملية اتسمحت بالباسورد ولسه شغالة (لحد ما نافذتها تتقفل)
    graceUntil: 0,
    pending: false,
    tries: {},
    on() { return !!DB._lockOn; },
    allowed() { return !this.on() || this.op || Date.now() < this.graceUntil; },
    endOpSoon() { setTimeout(() => { if (document.getElementById('modal').hidden) this.op = false; }, 0); },
    // تشغيل عملية محمية: يسأل الأول، وبعدين يشغلها
    guard(fn, reason, onCancel) {
      if (this.allowed()) { const was = this.op; this.op = true; try { fn(); } finally { if (!was) this.endOpSoon(); } return; }
      UI.askPassword(reason).then((ok) => { if (!ok) { if (onCancel) onCancel(); return; } this.op = true; try { fn(); } finally { this.endOpSoon(); } });
    },
    check(db) {
      if (this.pending) { this.dirty = true; return true; }
      if (this.allowed() || !window.LOCK || !window.SYNC || !db._committed) return false;
      const prev = JSON.parse(db._committed);
      const changes = LOCK.guardedChanges(prev, db.state, SYNC);
      if (!changes.length) return false;
      this.pending = true;
      const what = changes.slice(0, 3).map((c) => `${{ edit: 'تعديل', delete: 'حذف' }[c.action] || 'تعديل'} ${c.label}`).join('، ') + (changes.length > 3 ? ` و${changes.length - 3} غيرهم` : '');
      UI.askPassword(`التغيير ده محتاج الباسورد: ${what}`).then((ok) => {
        this.pending = false; this.dirty = false;
        if (ok) { this.op = true; db.save(); this.endOpSoon(); return; }
        db.state = migrate(prev); db._journal = null;
        UI.toast('التعديل اتلغى — البيانات رجعت زي ما كانت', 'bad');
        if (db.onRevert) db.onRevert();
      });
      return true;
    },
  };

  function migrate(s) {
    const base = emptyState();
    const st = s.settings || {};
    const out = { ...base, ...s, settings: { ...base.settings, ...st, rates: { ...base.settings.rates, ...(st.rates || {}) }, alerts: { ...base.settings.alerts, ...(st.alerts || {}) } } };
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
        if (!UI.numbersOk(form)) return;
        const res = onSubmit(form, new FormData(form));
        if (res !== false) UI.close();
      });
      if (tools) {
        const target = () => form.querySelector(tools.target || '.modal-body');
        const meta = () => ({ business: DB.state.settings.businessName, subtitle: tools.subtitle || '' });
        form.querySelector('[data-modal-print]').addEventListener('click', () => FX.printDoc({ ...meta(), title: tools.title, subtitle: tools.subtitle, html: FX.cleanForPrint(target()), invoice: tools.invoice }));
        form.querySelector('[data-modal-excel]').addEventListener('click', () => FX.exportExcel(`${tools.file || 'florume'}-${today()}.xlsx`, FX.collectSheets(form.querySelector('.modal-body'), tools.title), meta()));
      }
      UI.labelTables(form);
      if (onOpen) onOpen(form);
      const first = form.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea');
      // أول خانة تاخد التركيز، إلا لو المستخدم لحق وكتب في خانة تانية (مانسحبش منه التركيز)
      if (first) setTimeout(() => { if (!form.contains(document.activeElement)) first.focus(); }, 30);
      return form;
    },
    // لا أرقام سالبة ولا خارج الحدود: نطبق min/max بنفسنا لأن الفورم novalidate
    numbersOk(root) {
      const bad = [...root.querySelectorAll('input[type="number"]')].find((i) => {
        if (i.disabled || i.value === '' || i.closest('[hidden]') || i.offsetParent === null) return false;
        const v = Number(i.value);
        return !isFinite(v) || (i.min !== '' && v < Number(i.min)) || (i.max !== '' && v > Number(i.max));
      });
      if (!bad) return true;
      const v = Number(bad.value);
      bad.focus(); bad.classList.add('invalid');
      const label = (bad.closest('label') && bad.closest('label').querySelector('span') || {}).textContent || bad.getAttribute('aria-label') || 'الرقم';
      UI.toast(!isFinite(v) ? `«${label.replace('*', '').trim()}» لازم يكون رقم` : bad.min !== '' && v < Number(bad.min) ? `«${label.replace('*', '').trim()}» مينفعش يكون أقل من ${bad.min}` : `«${label.replace('*', '').trim()}» مينفعش يكون أكبر من ${bad.max}`, 'bad');
      bad.addEventListener('input', () => bad.classList.remove('invalid'), { once: true });
      return false;
    },
    close() {
      const w = document.getElementById('modal'); w.hidden = true; w.innerHTML = ''; document.body.classList.remove('no-scroll');
      Gate.endOpSoon();
      // تعديلات وصلت من جهاز تاني والنافذة مفتوحة: نرسم بعد ما تتقفل
      if (window.CLOUD && window.CLOUD.pendingRender) { window.CLOUD.pendingRender = false; if (window.CLOUD.onChange) window.CLOUD.onChange(); }
    },
    confirm(message, onYes, yes = 'نعم، احذف') {
      UI.modal({ title: 'تأكيد', body: `<p class="confirm-text">${message}</p>`, footer: `<button class="btn btn-danger" type="button" id="confirm-yes">${yes}</button><button class="btn" type="button" data-close>تراجع</button>`,
        onOpen: (f) => f.querySelector('#confirm-yes').addEventListener('click', () => { UI.close(); onYes(); }) });
    },
    // على الموبايل الجداول بتتعرض كروت: كل خانة بتاخد اسم عمودها، وأول خانة عنوان الكارت
    labelTables(root) {
      (root || document).querySelectorAll('table.data-table').forEach((t) => {
        const heads = [...t.querySelectorAll('thead th')].map((th) => ({ label: th.textContent.trim(), num: th.classList.contains('num') }));
        t.querySelectorAll('tbody tr').forEach((tr) => {
          let col = 0, titled = false;
          [...tr.children].forEach((cell) => {
            const h = heads[col] || {};
            if (cell.colSpan >= heads.length) cell.classList.add('c-full');
            else if (h.label) cell.dataset.label = h.label;
            if (!titled && col === 0 && h.label && !h.num && !cell.classList.contains('c-full')) { cell.classList.add('c-title'); titled = true; }
            col += cell.colSpan || 1;
          });
        });
      });
    },
    // نافذة الباسورد: فوق أي نافذة مفتوحة، وبترجع true لو الباسورد صح
    askPassword(reason) {
      return new Promise((resolve) => {
        const lock = DB.state.settings.lock;
        const old = document.getElementById('lock-layer'); if (old) old.remove();
        const layer = document.createElement('div');
        layer.id = 'lock-layer'; layer.className = 'lock-layer';
        layer.innerHTML = `<div class="modal-backdrop"></div>
          <form class="modal-card lock-card" novalidate autocomplete="off" role="dialog" aria-modal="true" aria-labelledby="lock-title">
            <header class="modal-head"><h2 id="lock-title">🔒 محتاج الباسورد</h2></header>
            <div class="modal-body">
              <p class="lock-reason">${esc(reason || 'العملية دي محتاجة الباسورد')}</p>
              <label class="field lock-pw"><span>الباسورد</span><input id="lock-input" type="password" autocomplete="off" dir="auto"></label>
              <label class="field lock-rc" hidden><span>كود الاسترجاع</span><input id="lock-code" autocomplete="off" dir="ltr" placeholder="XXXX-XXXX-XXXX"><small>الكود اللي ظهرلك لما عملت الباسورد. لو صح، الباسورد هيتشال وتعمل واحد جديد من الإعدادات.</small></label>
              <p class="lock-err" role="alert" hidden></p>
              <button type="button" class="link-btn lock-forgot">نسيت الباسورد؟</button>
            </div>
            <footer class="modal-foot"><button class="btn btn-primary" type="submit">تأكيد</button><button class="btn" type="button" data-lock-cancel>إلغاء</button></footer>
          </form>`;
        document.body.appendChild(layer);
        const f = layer.querySelector('form'), pw = f.querySelector('#lock-input'), rc = f.querySelector('#lock-code'), err = f.querySelector('.lock-err');
        let recovery = false;
        const done = (ok) => { layer.remove(); document.removeEventListener('keydown', onKey, true); resolve(ok); };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); } };
        document.addEventListener('keydown', onKey, true);
        const show = (msg) => { err.textContent = msg; err.hidden = !msg; };
        f.querySelector('[data-lock-cancel]').addEventListener('click', () => done(false));
        f.querySelector('.lock-forgot').addEventListener('click', (e) => { recovery = true; f.querySelector('.lock-pw').hidden = true; f.querySelector('.lock-rc').hidden = false; e.target.hidden = true; show(''); rc.focus(); });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const now = Date.now(), t = Gate.tries;
          if (now < (t.until || 0)) { show(`محاولات غلط كتير — استنى ${Math.ceil((t.until - now) / 1000)} ثانية`); return; }
          const ok = recovery ? LOCK.verifyRecovery(lock, rc.value) : LOCK.verify(lock, pw.value);
          Gate.tries = LOCK.throttle(t, now, ok);
          if (!ok) { show(recovery ? 'الكود مش صح' : 'الباسورد غلط'); (recovery ? rc : pw).select(); if (window.CLOUD && CLOUD.logDenied) CLOUD.logDenied(reason); return; }
          if (recovery) {
            // الكود صح: نشيل الباسورد (ده نفسه تعديل مسموح بالكود)
            Gate.op = true; delete DB.state.settings.lock; DB.save(); Gate.endOpSoon();
            UI.toast('الباسورد اتشال — اعمل واحد جديد من الإعدادات');
          } else if (num(lock.graceMin) > 0) Gate.graceUntil = now + num(lock.graceMin) * 60000;
          done(true);
        });
        setTimeout(() => pw.focus(), 30);
      });
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
      costs: [{ label: 'شحن وجمارك', amount: 21300, basis: 'weight', accountId: bank.id }], notes: '',
    });
    // بوكس هدايا من 3 قطع 30 مل — بيتباع كبوكس، والقطع متسجلة لو احتجت تفكه
    const piece = (sku, name, price) => ({ id: uid(), sku, brand: 'أرماف', name, sizeMl: 30, gender: 'unisex', price, minStock: 0 });
    const pieces = [piece('AR-GS-1', 'كلوب دي نوي 30مل (من البوكس)', 650), piece('AR-GS-2', 'أوديسي 30مل (من البوكس)', 550), piece('AR-GS-3', 'تاج 30مل (من البوكس)', 600)];
    const giftBox = { id: uid(), sku: 'AR-GS3', brand: 'أرماف', name: 'بوكس هدايا 3×30 مل', sizeMl: '', gender: 'unisex', price: 1650, minStock: 3, boxItems: pieces.map((x) => ({ productId: x.id, qty: 1 })) };
    s.products.push(giftBox, ...pieces);
    s.shipments.push({
      id: uid(), ref: 'AE-2607', supplierId: dubai.id, currency: 'AED', rate: 13.4, orderDate: '2026-07-02', status: 'received', receivedDate: '2026-07-10',
      items: [{ productId: byId(2), qty: 36, unitCost: 85 }, { productId: byId(3), qty: 36, unitCost: 75 }, { productId: byId(4), qty: 24, unitCost: 95 }, { productId: byId(6), qty: 36, unitCost: 65 }, { productId: giftBox.id, qty: 10, unitCost: 70 }],
      costs: [{ label: 'شحن وجمارك', amount: 18400, basis: 'weight', accountId: bank.id }], notes: '',
    });
    s.shipments.push({
      id: uid(), ref: 'SA-2609', supplierId: riyadh.id, currency: 'SAR', rate: 13.25, orderDate: '2026-09-15', status: 'transit',
      items: [{ productId: byId(0), qty: 24, unitCost: 55 }, { productId: byId(7), qty: 24, unitCost: 40 }],
      costs: [{ label: 'شحن وجمارك', amount: 3900, basis: 'weight', accountId: bank.id }], notes: 'متوقع الوصول آخر الشهر',
    });
    s.supplierPayments.push(
      { id: uid(), date: '2026-06-02', supplierId: riyadh.id, amount: 8000, rate: 13.1, accountId: bank.id, fee: 150, notes: 'دفعة مقدمة' },
      { id: uid(), date: '2026-07-05', supplierId: riyadh.id, amount: 2980, rate: 13.3, accountId: bank.id, fee: 100, notes: 'تسوية شحنة يونيو' },
      { id: uid(), date: '2026-07-01', supplierId: dubai.id, amount: 11080, rate: 13.4, accountId: bank.id, fee: 150, notes: 'دفع كامل قبل الشحن' },
      { id: uid(), date: '2026-09-14', supplierId: riyadh.id, amount: 1500, rate: 13.25, accountId: bank.id, fee: 100, notes: 'دفعة مقدمة شحنة سبتمبر' },
    );
    const P2 = (sku, brand, name, sizeMl, gender, price, decantOf) => ({ id: uid(), sku, brand, name, sizeMl, gender, price, minStock: 10, decantOf });
    const decant5 = P2('AO-KL100-D5', 'العربية للعود', 'كلمات (ديكانت)', 5, 'unisex', 260, products[5].id);
    const decant10 = P2('AO-KL100-D10', 'العربية للعود', 'كلمات (ديكانت)', 10, 'unisex', 450, products[5].id);
    s.products.push(decant5, decant10);
    const camp = (name, platform, startDate, endDate, budget) => ({ id: uid(), name, platform, startDate, endDate, budget, notes: '' });
    const campaigns = [camp('إطلاق لطافة — صيف', 'instagram', '2026-06-15', '2026-07-31', 12000), camp('فيديوهات تيك توك', 'tiktok', '2026-07-15', '2026-09-30', 9000), camp('عروض الفيسبوك', 'facebook', '2026-08-01', '2026-09-30', 8000)];
    s.campaigns.push(...campaigns);
    const pa = { id: uid(), name: 'الشريك الأول', share: 60, notes: 'مدير التشغيل' }, pb = { id: uid(), name: 'الشريك الثاني', share: 40, notes: 'ممول' };
    s.partners.push(pa, pb);
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
    // ربط الطلبات بالحملات حسب القناة والتاريخ، وأرقام بوليصة لطلبات بوسطة
    s.sales.forEach((sale, i) => {
      const c = campaigns.find((x) => x.platform === sale.channel && sale.date >= x.startDate && sale.date <= x.endDate);
      if (c && i % 3 !== 0) sale.campaignId = c.id;
      if (sale.courierId === bosta.id && sale.status !== 'pending') sale.trackingNo = `BST${String(40210 + sale.no).padStart(7, '0')}`;
    });
    // أسعار الشحن حسب المحافظة، وعمولة فودافون كاش
    bosta.defaultRate = { fee: 65, returnFee: 35, charge: 70 };
    bosta.rates = { 'القاهرة': { fee: 55, returnFee: 30, charge: 60 }, 'الجيزة': { fee: 55, returnFee: 30, charge: 60 }, 'أسيوط': { fee: 80, returnFee: 45, charge: 90 } };
    aramex.defaultRate = { fee: 70, returnFee: 40, charge: 75 };
    voda.feePct = 1;
    // كود خصم لمؤثرة: 10٪ خصم وعمولة 10٪ من صافي الطلب
    const marwa = { id: uid(), code: 'MARWA10', influencer: 'مروة (بلوجر عطور)', phone: '01099887766', type: 'percent', value: 10, commissionType: 'percent', commission: 10, campaignId: campaigns[0].id, validTo: '', maxUses: '', active: true };
    s.coupons.push(marwa);
    s.sales.filter((x) => x.channel === 'instagram' && x.date >= '2026-06-20' && x.date <= '2026-07-31' && x.status !== 'cancelled').slice(0, 6).forEach((x) => {
      const gross = x.items.reduce((a, it) => a + it.qty * it.price, 0);
      x.couponId = marwa.id; x.campaignId = campaigns[0].id; x.discount = Math.round(gross * 0.1); x.commission = Math.round((gross - x.discount) * 0.1);
    });
    s.sales.forEach((x) => { if (x.payment === voda.id) x.payFee = Math.round((x.items.reduce((a, it) => a + it.qty * it.price, 0) - x.discount + x.shippingCharged) * 0.01 * 100) / 100; });
    // مرتجع جزئي: العميلة رجّعت صنف من طلب فيه صنفين
    const two = s.sales.find((x) => x.status === 'delivered' && x.payment === 'cod' && x.items.length === 2 && x.date >= '2026-07-01' && !x.couponId);
    if (two) two.returns = [{ id: uid(), date: addDays(two.date, 3), items: [{ line: 1, qty: 1 }], fee: 35, note: 'الريحة ما عجبتهاش' }];
    // شحنة ضاعت مع أرامكس واتعوضنا عنها
    const lostOne = s.sales.find((x) => x.courierId === aramex.id && x.status === 'delivered' && x.payment === 'cod' && x.date >= '2026-08-01' && x.items.length === 1);
    if (lostOne) Object.assign(lostOne, { status: 'lost', lostDate: addDays(lostOne.date, 9), compensation: 600, notes: 'الشحنة ضاعت في مخزن أرامكس' });
    // تقسيم زجاجة كلمات إلى ديكانت
    s.decants.push({ id: uid(), date: '2026-08-10', sourceProductId: products[5].id, sourceQty: 1, outputs: [{ productId: decant5.id, qty: 8 }, { productId: decant10.id, qty: 6 }], materialsCost: 180, accountId: cash.id, notes: 'عبوات 5 و10 مل مع ستيكر' });
    s.sales.push({
      id: uid(), no: s.settings.nextInvoiceNo++, date: '2026-08-12', customerId: s.customers[0].id, channel: 'tiktok', items: [{ productId: decant10.id, qty: 2, price: 450 }, { productId: decant5.id, qty: 1, price: 260 }],
      discount: 0, shippingCharged: 70, courierId: bosta.id, courierFee: 65, payment: 'cod', status: 'delivered', returnDate: '', returnFee: 0, notes: '', campaignId: campaigns[1].id,
    });
    // فك بوكس واحد عشان عميلة عايزة قطعة واحدة منه
    s.decants.push({ id: uid(), kind: 'unbox', date: '2026-08-25', sourceProductId: giftBox.id, sourceQty: 1, outputs: giftBox.boxItems.map((x) => ({ productId: x.productId, qty: x.qty })), materialsCost: 0, accountId: '', notes: 'عميلة طلبت كلوب دي نوي 30 مل بس' });
    // فواتير دعاية: قطع مجانية لمؤثرين
    const influencer = { id: uid(), name: 'مروة (بلوجر عطور)', city: 'القاهرة', phone: '01099887766', address: '' };
    s.customers.push(influencer);
    s.sales.push({
      id: uid(), no: s.settings.nextInvoiceNo++, kind: 'promo', date: '2026-08-14', customerId: influencer.id, channel: 'instagram', items: [{ productId: products[4].id, qty: 1, price: 0 }, { productId: products[2].id, qty: 1, price: 0 }],
      discount: 0, shippingCharged: 0, courierId: bosta.id, courierFee: 65, payment: 'cod', status: 'delivered', returnDate: '', returnFee: 0, notes: 'تعاون — ريفيو على إنستجرام', campaignId: null,
    });
    // تسويات شهرية مع شركات الشحن تقريبًا بقيمة المستحق
    const settleMonth = (month, day) => {
      const cut = `${month}-${day}`;
      const bal = Acc.courierBalances(s, Acc.buildJournal(s), cut);
      const done = new Set(s.reconciliations.flatMap((r) => r.lines.map((l) => l.saleId)));
      s.couriers.forEach((c) => {
        const amt = Math.floor((bal[c.id] || 0) * 0.95);
        if (amt <= 0) return;
        const st = { id: uid(), date: cut, courierId: c.id, accountId: bank.id, amount: amt, notes: 'تسوية تحصيل COD' };
        s.settlements.push(st);
        const lines = s.sales.filter((x) => x.courierId === c.id && x.payment === 'cod' && x.kind !== 'promo' && (x.status === 'delivered' || x.status === 'returned') && x.date <= addDays(cut, -5) && !done.has(x.id)).map((x) => ({ saleId: x.id }));
        s.reconciliations.push({ id: uid(), date: cut, courierId: c.id, fileName: 'كشف شهري', lines, net: amt, settlementId: st.id });
      });
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
    X('2026-07-20', '5300', 1500, voda.id, 'إعلانات تيك توك');
    X('2026-08-20', '5300', 1500, voda.id, 'إعلانات تيك توك');
    // المرتبات والاشتراك مصروفات ثابتة شهرية (اشتراك سبتمبر لسه ما اتسجلش)
    const salary = { id: uid(), category: '5500', amount: 5000, accountId: bank.id, day: 28, startMonth: '2026-06', notes: 'مرتب مسؤول الطلبات', active: true };
    const subscription = { id: uid(), category: '5950', amount: 450, accountId: voda.id, day: 10, startMonth: '2026-06', notes: 'اشتراك المتجر الإلكتروني', active: true };
    s.recurring.push(salary, subscription);
    // مصروفات التأسيس قبل بداية الشغل (رأس مال، مش بتدخل في الأرباح)
    s.formation.push({ id: uid(), date: '2026-06-01', kind: 'website', amount: 4500, notes: 'دومين واستضافة سنة وقالب المتجر' }, { id: uid(), date: '2026-06-01', kind: 'photos', amount: 1800, notes: 'تصوير المنتجات', accountId: bank.id });
    s.expenses = s.expenses.filter((e) => !(e.category === '5950' && e.date === '2026-09-10'));
    s.expenses.forEach((e) => { const r = e.category === '5500' ? salary : e.category === '5950' ? subscription : null; if (r) { e.recurringId = r.id; e.period = e.date.slice(0, 7); } });
    // ربط مصروفات الإعلانات بالحملات
    s.expenses.forEach((e) => {
      if (e.category !== '5300') return;
      const meta = campaigns.filter((x) => x.platform !== 'tiktok');
      const c = e.notes === 'تعاون مع مؤثرة' ? campaigns[0] : (/تيك/.test(e.notes) ? [campaigns[1]] : meta).find((x) => e.date >= x.startDate && e.date <= x.endDate);
      if (c) e.campaignId = c.id;
    });
    s.transfers.push({ id: uid(), date: '2026-08-02', fromId: voda.id, toId: bank.id, amount: 12000, fee: 60, notes: 'تفريغ المحفظة' });
    s.transfers.push({ id: uid(), date: '2026-09-02', fromId: insta.id, toId: bank.id, amount: 15000, fee: 0, notes: '' });
    s.equity.push({ id: uid(), date: '2026-08-30', type: 'drawing', amount: 8000, accountId: bank.id, notes: 'مسحوبات شخصية' });
    s.shipments[0].dueDate = '2026-07-05';
    s.shipments[2].dueDate = '2026-09-28';
    s.adjustments.push({ id: uid(), date: '2026-07-15', productId: byId(2), qty: -1, reason: 'tester', notes: 'زجاجة تستر للتصوير' });
    s.adjustments.push({ id: uid(), date: '2026-08-20', productId: byId(0), qty: -1, reason: 'damage', notes: 'انكسرت أثناء التغليف' });
    // عينة ديكانت هدية مع أول طلبين بعد التقسيم، وسداد جزء من عمولة المؤثرة
    s.sales.filter((x) => x.date > '2026-08-12' && x.status === 'delivered' && !x.kind).slice(0, 2).forEach((x) => (x.samples = [{ productId: decant5.id, qty: 1 }]));
    s.commissionPayments.push({ id: uid(), date: '2026-08-03', couponId: s.coupons[0].id, amount: 500, accountId: insta.id, notes: 'عمولة يوليو' });
    // توزيع أرباح يوليو على الشريكين (مع حجز ٢٠٪ في النشاط) ومسحوبات من الحساب الجاري
    const plan = Acc.distributionPlan(s, Acc.buildJournal(s), '2026-07-01', '2026-07-31', 20);
    if (plan.distributable > 0) s.distributions.push({ id: uid(), date: '2026-08-05', from: '2026-07-01', to: '2026-07-31', retainPct: 20, profit: plan.netProfit, allocations: plan.allocations, notes: 'أرباح يوليو' });
    s.equity.push({ id: uid(), date: '2026-08-10', type: 'drawing', amount: 3000, accountId: bank.id, partnerId: pa.id, notes: 'من أرباح يوليو' });
    s.equity.push({ id: uid(), date: '2026-08-12', type: 'drawing', amount: 2000, accountId: voda.id, partnerId: pb.id, notes: 'من أرباح يوليو' });
    // أسباب المرتجع (بالترتيب عشان الأرقام التجريبية تفضل ثابتة)
    const why = ['refused', 'noAnswer', 'address', 'refused', 'damaged', 'changedMind', 'noAnswer', 'late'];
    s.sales.filter((x) => x.status === 'returned').forEach((x, i) => (x.returnReason = why[i % why.length]));
    // جرد آخر أغسطس: الخزينة ناقصة 150 (فكة)، وفودافون كاش مظبوط
    const probe = (acc) => { const k = { id: uid(), date: '2026-08-31', accountId: acc.id, actual: 0 }; return { k, book: Acc.buildJournal({ ...s, cashCounts: [...s.cashCounts, k] }).cashCounts[k.id].book }; };
    const pc = probe(cash), pv = probe(voda);
    s.cashCounts.push({ ...pc.k, actual: Acc.round2(pc.book - 150), notes: 'فرق فكة' }, { ...pv.k, actual: pv.book });
    return s;
  }

  window.F = { migrateState: migrate, Gate, STORAGE_KEY, GOVERNORATES, CURRENCIES, COUNTRIES, CHANNELS, STATUSES, SHIP_STATUSES, ACCOUNT_TYPES, GENDERS, DB, UI, uid, today, esc, num, fmt, money, pct, inFrame, emptyState, demoState };
})();
