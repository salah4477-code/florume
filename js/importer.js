/*
 * Florume — الاستيراد من Excel / CSV
 * 1) readWorkbook: يقرأ ملف xlsx أو csv في المتصفح (بدون مكتبات) ويرجع أوراقًا من صفوف.
 * 2) planImport: دالة نقية تحوّل الأوراق إلى خطة (منتجات، مخزون افتتاحي، عملاء، طلبات، عينات، مصروفات)
 *    مع الأخطاء والتحذيرات، بدون أي تعديل على البيانات.
 * 3) applyImport: تطبق الخطة على نسخة من البيانات وترجعها.
 * الصيغة المدعومة هي صيغة تصدير Florume ERP (أعمدة orderNo, productName, netTotal … ) مع أسماء أعمدة عربية بديلة.
 */
(function (root) {
  'use strict';

  // ---------- قراءة الملفات (متصفح فقط) ----------
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('المتصفح لا يدعم فك ضغط الملفات — حدّث المتصفح أو احفظ الملف بصيغة CSV');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buffer) {
    const bytes = new Uint8Array(buffer);
    const dv = new DataView(buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('الملف ليس ملف Excel صالحًا (xlsx)');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const files = {};
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      const start = localOff + 30 + dv.getUint16(localOff + 26, true) + dv.getUint16(localOff + 28, true);
      files[name] = { method, data: bytes.subarray(start, start + compSize) };
      p += 46 + nameLen + extraLen + commentLen;
    }
    return {
      has: (name) => !!files[name],
      async text(name) {
        const f = files[name];
        if (!f) return null;
        const raw = f.method === 8 ? await inflateRaw(f.data) : f.data;
        return dec.decode(raw);
      },
    };
  }
  const tags = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  function textOf(node) {
    // نص الخلية مع تجاهل النطق الصوتي (rPh)
    return tags(node, 't').filter((t) => !t.parentNode || t.parentNode.localName !== 'rPh').map((t) => t.textContent).join('');
  }
  async function readXlsx(buffer) {
    const zip = await unzip(buffer);
    const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const wb = parse(await zip.text('xl/workbook.xml'));
    const relsText = await zip.text('xl/_rels/workbook.xml.rels');
    const rels = {};
    if (relsText) tags(parse(relsText), 'Relationship').forEach((r) => (rels[r.getAttribute('Id')] = r.getAttribute('Target')));
    const sstText = await zip.text('xl/sharedStrings.xml');
    const shared = sstText ? tags(parse(sstText), 'si').map(textOf) : [];
    const out = [];
    for (const sh of tags(wb, 'sheet')) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = rels[rid] || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const xmlText = await zip.text(target);
      const rows = [];
      if (xmlText) {
        tags(parse(xmlText), 'row').forEach((row) => {
          const r = Number(row.getAttribute('r')) - 1;
          const cells = [];
          let next = 0;
          tags(row, 'c').forEach((c) => {
            const ref = c.getAttribute('r');
            const ci = ref ? colIndex(ref) : next;
            next = ci + 1;
            const t = c.getAttribute('t');
            const v = tags(c, 'v')[0];
            let val = null;
            if (t === 's') val = v ? shared[Number(v.textContent)] : null;
            else if (t === 'inlineStr') val = textOf(c);
            else if (t === 'str' || t === 'e') val = v ? v.textContent : null;
            else if (t === 'b') val = v ? v.textContent === '1' : null;
            else if (v && v.textContent !== '') val = Number(v.textContent);
            cells[ci] = val;
          });
          rows[r >= 0 ? r : rows.length] = cells;
        });
      }
      out.push({ name: sh.getAttribute('name'), rows: Array.from(rows, (r) => r || []) });
    }
    return out;
  }
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const sep = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  async function readWorkbook(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt')) return [{ name: file.name.replace(/\.[^.]+$/, ''), rows: parseCsv(await file.text()) }];
    if (name.endsWith('.xls')) throw new Error('صيغة xls القديمة غير مدعومة — افتح الملف في Excel واحفظه بصيغة xlsx');
    return readXlsx(await file.arrayBuffer());
  }

  // ---------- أدوات التطبيع ----------
  const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
  const latinDigits = (s) => String(s == null ? '' : s).replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d]);
  const str = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const normName = (s) => latinDigits(str(s)).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '').replace(/\s*([+*()\-×x/،,])\s*/g, '$1').replace(/\s+/g, ' ');
  const normKey = (s) => normName(s).replace(/[\s_\-.]/g, '');
  const phoneKey = (s) => { let d = latinDigits(s).replace(/\D/g, ''); if (d.startsWith('0020')) d = d.slice(4); else if (d.startsWith('20') && d.length === 12) d = d.slice(2); if (d.length === 10 && d.startsWith('1')) d = '0' + d; return d; };
  const cleanRef = (s) => latinDigits(str(s)).replace(/[#\s]/g, '');
  function toNumber(v) {
    if (typeof v === 'number') return v;
    const s = latinDigits(str(v)).replace(/[,٬\s]|ج\.?م|EGP/gi, '').replace('٫', '.');
    if (s === '') return null;
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function toDate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    const s = latinDigits(str(v));
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) { // يوم/شهر/سنة (الصيغة المصرية)، إلا لو اليوم > 12 في الخانة الثانية
      let [dd, mm] = [Number(m[1]), Number(m[2])];
      if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd];
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return `${m[3]}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    return 'invalid';
  }

  // ---------- التعرف على الأوراق ----------
  const FIELDS = {
    sales: {
      orderNo: ['orderno', 'رقمالفاتوره', 'رقمالطلب', 'الفاتوره', 'م'],
      trackingNo: ['trackingno', 'tracking', 'رقمالبوليصه', 'البوليصه', 'رقمالشحنه'],
      type: ['type', 'النوع'],
      date: ['date', 'التاريخ'],
      customerName: ['customername', 'customer', 'العميل', 'اسمالعميل'],
      customerPhone: ['customerphone', 'phone', 'الموبايل', 'الهاتف', 'رقمالموبايل', 'التليفون'],
      customerAddress: ['customeraddress', 'address', 'العنوان'],
      productName: ['productname', 'product', 'المنتج', 'الصنف', 'اسمالمنتج'],
      qty: ['qty', 'quantity', 'الكميه', 'العدد'],
      netTotal: ['nettotal', 'total', 'الاجمالي', 'صافيالاجمالي', 'قيمهالبيع'],
      cogs: ['cogs', 'التكلفه'],
      profit: ['profit', 'الربح'],
      account: ['account', 'payment', 'طريقهالدفع', 'الحساب', 'الدفع'],
      channel: ['channel', 'القناه'],
    },
    stock: {
      sku: ['sku', 'code', 'الكود', 'كودالمنتج'],
      name: ['name', 'productname', 'الاسم', 'المنتج', 'اسمالمنتج'],
      qty: ['qty', 'quantity', 'الكميه', 'الرصيد'],
      cost: ['cost', 'unitcost', 'التكلفه', 'تكلفهالوحده'],
      price: ['price', 'saleprice', 'السعر', 'سعرالبيع'],
    },
    // تصدير طلبات Shopify و WooCommerce: سطر لكل صنف، وبيانات الطلب في أول سطر
    web: {
      orderNo: ['name', 'ordernumber', 'orderid', 'order', 'رقمالطلب'],
      date: ['createdat', 'orderdate', 'paidat', 'date'],
      productName: ['lineitemname', 'itemname', 'productname', 'itemtitle'],
      qty: ['lineitemquantity', 'quantity', 'qty', 'itemquantity'],
      price: ['lineitemprice', 'itemcost', 'itemprice', 'price'],
      sku: ['lineitemsku', 'sku', 'itemsku'],
      discount: ['discountamount', 'cartdiscountamount', 'orderdiscount', 'discounttotal', 'cartdiscount'],
      shipping: ['shipping', 'ordershippingamount', 'shippingtotal', 'ordershipping'],
      total: ['total', 'ordertotalamount', 'ordertotal'],
      financial: ['financialstatus'],
      status: ['orderstatus', 'status', 'fulfillmentstatus'],
      cancelled: ['cancelledat'],
      payMethod: ['paymentmethod', 'paymentmethodtitle', 'paymentgateway', 'gateway'],
      customerName: ['billingname', 'shippingname', 'customername'],
      firstName: ['billingfirstname', 'shippingfirstname', 'firstname'],
      lastName: ['billinglastname', 'shippinglastname', 'lastname'],
      phone: ['billingphone', 'shippingphone', 'phone', 'customerphone'],
      city: ['shippingprovince', 'shippingcity', 'billingprovince', 'billingcity', 'shippingstate', 'billingstate', 'city'],
      address: ['shippingaddress1', 'shippingstreet', 'billingaddress1', 'billingstreet', 'shippingaddress', 'billingaddress'],
    },
    expenses: {
      date: ['date', 'التاريخ'],
      category: ['category', 'البند', 'التصنيف', 'النوع'],
      amount: ['amount', 'المبلغ', 'القيمه'],
      payment: ['payment', 'account', 'طريقهالدفع', 'الحساب', 'دفعمن'],
      desc: ['desc', 'description', 'notes', 'البيان', 'الوصف', 'ملاحظات'],
    },
  };
  const REQUIRED = { web: ['orderNo', 'date', 'productName', 'qty', 'price'], sales: ['date', 'productName', 'qty', 'netTotal'], stock: ['name', 'qty'], expenses: ['date', 'amount'] };
  const KIND_LABEL = { web: 'طلبات المتجر الإلكتروني (Shopify / WooCommerce)', sales: 'مبيعات', stock: 'مخزون ومنتجات', expenses: 'مصروفات' };
  // أسماء المحافظات بالإنجليزي زي ما بتيجي من المتجر
  const GOV_EN = { cairo: 'القاهرة', giza: 'الجيزة', alexandria: 'الإسكندرية', qalyubia: 'القليوبية', qaliubiya: 'القليوبية', sharqia: 'الشرقية', sharkia: 'الشرقية', dakahlia: 'الدقهلية', gharbia: 'الغربية', monufia: 'المنوفية', menofia: 'المنوفية', beheira: 'البحيرة', kafrelsheikh: 'كفر الشيخ', damietta: 'دمياط', portsaid: 'بورسعيد', ismailia: 'الإسماعيلية', suez: 'السويس', faiyum: 'الفيوم', fayoum: 'الفيوم', benisuef: 'بني سويف', minya: 'المنيا', asyut: 'أسيوط', assiut: 'أسيوط', sohag: 'سوهاج', qena: 'قنا', luxor: 'الأقصر', aswan: 'أسوان', redsea: 'البحر الأحمر', newvalley: 'الوادي الجديد', matrouh: 'مطروح', northsinai: 'شمال سيناء', southsinai: 'جنوب سيناء' };
  const govFromText = (t) => { const k = normKey(t).replace(/governorate|محافظه/g, ''); return GOV_EN[k] || str(t); };
  const isCodText = (t) => /cod|cash on delivery|cashondelivery|الدفع عند الاستلام|عند الاستلام|كاش عند/i.test(str(t));
  // حالة طلب المتجر ← حالتنا (الملغي والمسترد بيتخطى)
  function webStatus(row, fallback) {
    const t = normKey(`${str(row.status)} ${str(row.financial)}`);
    if (str(row.cancelled) || /cancel|refund|void|failed|trash|ملغي/.test(t)) return 'skip';
    if (/completed|fulfilled|delivered|مكتمل/.test(t) && !/unfulfilled/.test(t)) return 'delivered';
    if (/processing|onhold|pending|unfulfilled|partial/.test(t)) return 'pending';
    return fallback || 'delivered';
  }

  function mapHeader(cells, kind) {
    const map = {};
    const keys = cells.map(normKey);
    // الأسماء بالترتيب: الأول هو المفضّل (مثلًا «Created at» قبل «Paid at»)
    Object.entries(FIELDS[kind]).forEach(([field, aliases]) => {
      for (const alias of aliases) {
        const i = keys.findIndex((k, idx) => k === alias && !Object.values(map).includes(idx));
        if (i >= 0) { map[field] = i; break; }
      }
    });
    return map;
  }
  function detectSheets(sheets) {
    const found = [], ignored = [];
    sheets.forEach((sh) => {
      const nonEmpty = sh.rows.filter((r) => r.some((v) => str(v) !== ''));
      if (!nonEmpty.length) { ignored.push({ name: sh.name, reason: 'الورقة فارغة' }); return; }
      let best = null;
      for (let h = 0; h < Math.min(sh.rows.length, 12) && !best; h++) {
        const cells = sh.rows[h] || [];
        for (const kind of ['web', 'sales', 'expenses', 'stock']) {
          const map = mapHeader(cells, kind);
          if (REQUIRED[kind].every((f) => map[f] != null)) { best = { kind, map, headerRow: h }; break; }
        }
      }
      if (!best) { ignored.push({ name: sh.name, reason: 'لم أتعرف على أعمدة هذه الورقة' }); return; }
      const rows = [];
      for (let r = best.headerRow + 1; r < sh.rows.length; r++) {
        const cells = sh.rows[r] || [];
        if (!cells.some((v) => str(v) !== '')) continue;
        const obj = { _row: r + 1 };
        Object.entries(best.map).forEach(([f, i]) => (obj[f] = cells[i]));
        rows.push(obj);
      }
      found.push({ name: sh.name, kind: best.kind, rows });
    });
    return { found, ignored };
  }

  // ---------- تصنيف المصروفات وطرق الدفع ----------
  const CATEGORY_RULES = [
    [/تسويق|اعلان|إعلان|دعايه|دعاية|ميتا|فيسبوك|انستا|تيك|marketing|ads/i, '5300'],
    [/تغليف|تعبئه|تعبئة|علب|اكياس|أكياس|packag/i, '5400'],
    [/شحن|مندوب|توصيل|shipping|courier/i, '5200'],
    [/راتب|رواتب|مرتب|عموله|عمولة|salary/i, '5500'],
    [/ايجار|إيجار|كهرباء|مياه|انترنت|إنترنت|rent/i, '5600'],
    [/بنك|تحويل|bank|fee/i, '5700'],
    [/اشتراك|برنامج|موقع|دومين|subscription|software/i, '5950'],
  ];
  const guessCategory = (s) => { const t = str(s); for (const [re, code] of CATEGORY_RULES) if (re.test(t)) return code; return '5990'; };
  const isStockPayment = (v) => /مخزون|stock|inventory/i.test(str(v));
  const isPromo = (row) => /promo|عين|دعاي|هدي|gift|sample/i.test(`${str(row.type)} ${str(row.account)}`);

  function guessAccount(value, accounts) {
    const v = normName(value);
    const byType = (t) => accounts.find((a) => a.type === t);
    const byName = (re) => accounts.find((a) => re.test(normName(a.name)));
    if (/فودافون|vodafone|voda/.test(v)) return (byName(/فودافون|vodafone/) || byType('wallet') || {}).id;
    if (/انستا|instapay|insta/.test(v)) return (byName(/انستا|insta/) || byType('wallet') || {}).id;
    if (/بنك|bank|تحويل|transfer/.test(v)) return (byType('bank') || {}).id;
    if (/نقد|كاش|cash|خزين/.test(v)) return (byType('cash') || {}).id;
    return null;
  }
  // الاقتراح المبدئي لربط قيم الدفع في الملف بحسابات النظام
  function defaultMappings(sheets, state) {
    const { found } = detectSheets(sheets);
    const accounts = state.accounts || [], couriers = state.couriers || [];
    const cod = couriers[0] ? `cod:${couriers[0].id}` : 'cod:';
    const salesPay = {}, expensePay = {};
    found.filter((s) => s.kind === 'sales').forEach((s) => s.rows.forEach((r) => {
      if (isPromo(r)) return;
      const key = str(r.account) || '(فارغ)';
      if (salesPay[key]) return;
      const acc = /ship|شحن|cod|استلام|courier/i.test(key) ? null : guessAccount(key, accounts);
      salesPay[key] = acc || cod;
    }));
    found.filter((s) => s.kind === 'expenses').forEach((s) => s.rows.forEach((r) => {
      const key = str(r.payment) || '(فارغ)';
      if (expensePay[key]) return;
      expensePay[key] = isStockPayment(key) ? 'skip' : guessAccount(key, accounts) || (accounts.find((a) => a.type === 'cash') || accounts[0] || {}).id || 'skip';
    }));
    const webProducts = {}, webNames = {};
    const products = state.products || [];
    found.filter((s) => s.kind === 'web').forEach((s) => {
      let last = null;
      s.rows.forEach((r) => {
        // بيانات الطلب في أول سطر ليه؛ السطور التانية لنفس الطلب بتاخد منه
        if (str(r.orderNo) && (!last || str(last.orderNo) !== str(r.orderNo))) last = r;
        else if (!str(r.orderNo)) Object.assign(r, { orderNo: last && last.orderNo });
        if (last && r !== last && str(r.orderNo) === str(last.orderNo) && !str(r.payMethod) && !str(r.financial)) { r.payMethod = last.payMethod; r.financial = last.financial; }
        const pay = str(r.payMethod) || str(r.financial) || (last && (str(last.payMethod) || str(last.financial))) || '(فارغ)';
        if (!salesPay[pay]) {
          const byName = accounts.find((a) => { const an = normName(a.name), pn = normName(pay); return an && pn && (an.includes(pn) || pn.includes(an)); });
          // أي طريقة مش «عند الاستلام» يبقى مدفوع مقدمًا: حساب بنفس الاسم، أو محفظة، أو بنك
          salesPay[pay] = isCodText(pay) || pay === '(فارغ)' ? cod : (byName || {}).id || guessAccount(pay, accounts) || (accounts.find((a) => a.type === 'wallet') || accounts.find((a) => a.type === 'bank') || {}).id || cod;
        }
        const key = webProductKey(r);
        if (!key || webProducts[key] != null) return;
        const sku = normKey(r.sku), nm = normName(r.productName);
        const hit = (sku && products.find((p) => normKey(p.sku) === sku)) || products.find((p) => normName(p.name) === nm || normName(`${p.brand || ''} ${p.name}`) === nm) || products.find((p) => nm.includes(normName(p.name)) && normName(p.name).length > 3);
        webProducts[key] = hit ? hit.id : 'new';
        webNames[key] = `${str(r.productName)}${str(r.sku) ? ' (' + str(r.sku) + ')' : ''}`;
      });
    });
    const dates = found.flatMap((s) => (s.kind === 'stock' ? [] : s.rows.map((r) => toDate(r.date)))).filter((d) => d && d !== 'invalid').sort();
    return { salesPay, expensePay, webProducts, webNames, status: 'delivered', openingDate: dates[0] || '' };
  }

  const webProductKey = (r) => (str(r.sku) ? 'sku:' + normKey(r.sku) : str(r.productName) ? 'name:' + normName(r.productName) : '');

  // ---------- الخطة ----------
  function planImport(sheets, state, opts, uid) {
    const makeId = uid || (() => Math.random().toString(36).slice(2, 10));
    const { found, ignored } = detectSheets(sheets);
    const errors = [], warnings = [], skipped = [];
    const today = new Date().toISOString().slice(0, 10);
    const openingDate = opts.openingDate || today;
    const existingRefs = new Set([...(state.sales || []), ...(state.adjustments || []), ...(state.expenses || [])].map((x) => x.importRef).filter(Boolean));

    // المنتجات
    const products = []; // {id, sku, name, price, cost, currentQty, soldQty, isNew, fromSales}
    const byNorm = new Map(), bySku = new Map();
    (state.products || []).forEach((p) => {
      const label = `${p.brand ? p.brand + ' ' : ''}${p.name}`;
      const entry = { id: p.id, sku: p.sku || '', name: p.name, price: p.price, cost: null, currentQty: null, soldQty: 0, isNew: false, existing: p };
      if (p.sku) bySku.set(normKey(p.sku), entry);
      byNorm.set(normName(p.name), entry); byNorm.set(normName(label), entry);
    });
    const registerFileProduct = (row, sheet) => {
      const name = str(row.name);
      if (!name) { errors.push({ sheet, row: row._row, reason: 'اسم المنتج فارغ' }); return; }
      const qty = toNumber(row.qty), cost = toNumber(row.cost), price = toNumber(row.price);
      if (qty == null || isNaN(qty) || qty < 0) { errors.push({ sheet, row: row._row, reason: `كمية غير صحيحة للمنتج «${name}»` }); return; }
      const sku = str(row.sku);
      let entry = (sku && bySku.get(normKey(sku))) || byNorm.get(normName(name));
      if (entry && !entry.isNew) {
        warnings.push(`المنتج «${name}» موجود بالفعل في النظام — لن يُضاف له مخزون افتتاحي من الملف`);
        entry.currentQty = qty; entry.cost = isNaN(cost) ? null : cost;
        return;
      }
      if (entry && entry.isNew) { warnings.push(`المنتج «${name}» مكرر في ورقة المخزون (سطر ${row._row}) — تم جمع الكميات`); entry.currentQty += qty; return; }
      entry = { id: makeId(), sku, name, price: isNaN(price) || price == null ? 0 : price, cost: isNaN(cost) || cost == null ? 0 : cost, currentQty: qty, soldQty: 0, isNew: true };
      products.push(entry);
      if (sku) bySku.set(normKey(sku), entry);
      byNorm.set(normName(name), entry);
      if (cost == null || isNaN(cost)) warnings.push(`المنتج «${name}» بدون تكلفة — سيُسجل مخزونه الافتتاحي بتكلفة صفر`);
    };
    found.filter((s) => s.kind === 'stock').forEach((s) => s.rows.forEach((r) => registerFileProduct(r, s.name)));

    // العملاء
    const customers = [];
    const custByPhone = new Map(), custByName = new Map();
    (state.customers || []).forEach((c) => { if (phoneKey(c.phone)) custByPhone.set(phoneKey(c.phone), c); custByName.set(normName(c.name), c); });
    const customerFor = (row) => {
      const name = str(row.customerName), phone = phoneKey(row.customerPhone);
      if (!name && !phone) return '';
      let c = (phone && custByPhone.get(phone)) || (!phone && custByName.get(normName(name)));
      if (!c) {
        c = { id: makeId(), name: name || phone, phone: phone || '', city: '', address: str(row.customerAddress) };
        const m = c.address.match(/[,،]\s*([^,،]+)$/);
        if (m) c.city = m[1].trim();
        customers.push(c);
        if (phone) custByPhone.set(phone, c);
        custByName.set(normName(c.name), c);
      }
      return c.id;
    };

    // المبيعات والعينات
    const groups = new Map();
    const promos = [];
    let fileCogs = 0, cogsGap = 0, cogsGapLines = 0;
    found.filter((s) => s.kind === 'sales').forEach((s) => s.rows.forEach((r) => {
      const where = { sheet: s.name, row: r._row };
      const date = toDate(r.date);
      const qty = toNumber(r.qty), total = toNumber(r.netTotal);
      const pname = str(r.productName);
      if (!date || date === 'invalid') { errors.push({ ...where, reason: `تاريخ غير صحيح «${str(r.date)}»` }); return; }
      if (!pname) { errors.push({ ...where, reason: 'اسم المنتج فارغ' }); return; }
      if (qty == null || isNaN(qty) || qty <= 0) { errors.push({ ...where, reason: `كمية غير صحيحة «${str(r.qty)}»` }); return; }
      if (total == null || isNaN(total) || total < 0) { errors.push({ ...where, reason: `مبلغ غير صحيح «${str(r.netTotal)}»` }); return; }
      let product = byNorm.get(normName(pname));
      const cogs = toNumber(r.cogs);
      if (!product) {
        product = { id: makeId(), sku: '', name: pname, price: total > 0 ? total / qty : 0, cost: cogs > 0 ? cogs / qty : 0, currentQty: 0, soldQty: 0, isNew: true, fromSales: true };
        products.push(product); byNorm.set(normName(pname), product);
        warnings.push(`المنتج «${pname}» غير موجود في ورقة المخزون — سيُضاف بتكلفة ${Math.round(product.cost)} ورصيد صفر بعد البيع`);
      }
      const ref = cleanRef(r.trackingNo);
      const promo = isPromo(r);
      const importRef = promo ? `erp:promo:${str(r.orderNo) || r._row}` : `erp:${ref || 'line:' + (str(r.orderNo) || r._row)}`;
      if (existingRefs.has(importRef)) { skipped.push({ ...where, reason: `مستورد من قبل (${ref || 'بند ' + str(r.orderNo)})` }); return; }
      product.soldQty += qty;
      if (cogs > 0 && product.cost != null) { fileCogs += cogs; const gap = cogs - qty * product.cost; if (Math.abs(gap) > 1) { cogsGap += gap; cogsGapLines++; } }
      if (promo) {
        promos.push({ id: makeId(), date, productId: product.id, qty: -qty, unitCost: null, reason: 'promo', notes: `عينة دعاية${str(r.customerName) ? ' — ' + str(r.customerName) : ''}${str(r.orderNo) ? ' (بند ' + str(r.orderNo) + ')' : ''}`, importRef });
        return;
      }
      const customerId = customerFor(r);
      const payKey = str(r.account) || '(فارغ)';
      const pay = opts.salesPay[payKey] || 'cod:';
      if (!groups.has(importRef)) {
        const isCod = pay.startsWith('cod:');
        groups.set(importRef, {
          id: makeId(), date, customerId, channel: 'other', status: opts.status || 'delivered',
          items: [], discount: 0, shippingCharged: 0, courierId: isCod ? pay.slice(4) : ((state.couriers || [])[0] || {}).id || '', courierFee: 0,
          payment: isCod ? 'cod' : pay, returnDate: '', returnFee: 0, trackingNo: ref,
          notes: `مستورد من الملف${ref ? ' — بوليصة ' + ref : ''} — بند ${str(r.orderNo) || r._row}`, importRef, _rows: [r._row],
        });
      } else {
        const g = groups.get(importRef);
        g._rows.push(r._row);
        g.notes = `مستورد من الملف${ref ? ' — بوليصة ' + ref : ''} — بنود ${g._rows.length}`;
        if (g.date !== date) warnings.push(`البوليصة ${ref} فيها أكثر من تاريخ — استخدمت ${g.date}`);
      }
      groups.get(importRef).items.push({ productId: product.id, qty, price: Math.round((total / qty) * 100) / 100 });
    }));
    // طلبات المتجر الإلكتروني
    const webOrders = new Map();
    found.filter((s) => s.kind === 'web').forEach((s) => {
      let head = null;
      s.rows.forEach((r) => {
        const where = { sheet: s.name, row: r._row };
        const no = str(r.orderNo) || (head && str(head.orderNo));
        if (str(r.orderNo) && (!head || str(head.orderNo) !== str(r.orderNo))) head = r;
        if (!no) { errors.push({ ...where, reason: 'رقم الطلب فاضي' }); return; }
        const order = head && str(head.orderNo) === no ? head : r;
        const status = webStatus(order, opts.status);
        const importRef = `web:${cleanRef(no)}`;
        if (status === 'skip') { if (!webOrders.has(importRef)) skipped.push({ ...where, reason: `طلب ${no} ملغي أو مسترد` }); webOrders.set(importRef, null); return; }
        if (existingRefs.has(importRef)) { if (!webOrders.has(importRef)) skipped.push({ ...where, reason: `طلب المتجر ${no} مستورد قبل كده` }); webOrders.set(importRef, null); return; }
        if (webOrders.get(importRef) === null) return;
        const qty = toNumber(r.qty), price = toNumber(r.price);
        if (!str(r.productName) && !str(r.sku)) return;
        if (qty == null || isNaN(qty) || qty <= 0) { errors.push({ ...where, reason: `كمية غير صحيحة «${str(r.qty)}»` }); return; }
        if (price == null || isNaN(price) || price < 0) { errors.push({ ...where, reason: `سعر غير صحيح «${str(r.price)}»` }); return; }
        let o = webOrders.get(importRef);
        if (!o) {
          const date = toDate(order.date);
          if (!date || date === 'invalid') { errors.push({ ...where, reason: `تاريخ غير صحيح «${str(order.date)}»` }); webOrders.set(importRef, null); return; }
          const name = str(order.customerName) || `${str(order.firstName)} ${str(order.lastName)}`.trim();
          const customerId = customerFor({ customerName: name, customerPhone: order.phone, customerAddress: str(order.address) });
          const cust = customers.find((c) => c.id === customerId);
          if (cust && !cust.city && str(order.city)) cust.city = govFromText(order.city);
          const payKey = str(order.payMethod) || str(order.financial) || '(فارغ)';
          const pay = opts.salesPay[payKey] || 'cod:';
          const isCod = String(pay).startsWith('cod:');
          o = { id: makeId(), date, customerId, channel: 'website', status, items: [], discount: Math.abs(toNumber(order.discount) || 0), shippingCharged: Math.abs(toNumber(order.shipping) || 0), fileTotal: toNumber(order.total),
            courierId: isCod ? String(pay).slice(4) : ((state.couriers || [])[0] || {}).id || '', courierFee: 0, payment: isCod ? 'cod' : pay, returnDate: '', returnFee: 0,
            notes: `طلب المتجر ${no}`, importRef, webOrderNo: no, _rows: [] };
          webOrders.set(importRef, o);
        }
        // المنتج: ربط بمنتج موجود أو منتج جديد بسعر السطر
        const key = webProductKey(r);
        const target = (opts.webProducts || {})[key];
        let productId = target && target !== 'new' ? target : null;
        if (!productId) {
          let p = byNorm.get(normName(r.productName)) || (str(r.sku) && bySku.get(normKey(r.sku)));
          if (!p) {
            p = { id: makeId(), sku: str(r.sku), name: str(r.productName) || str(r.sku), price, cost: 0, currentQty: 0, soldQty: 0, isNew: true, fromWeb: true };
            products.push(p); byNorm.set(normName(p.name), p); if (p.sku) bySku.set(normKey(p.sku), p);
            warnings.push(`منتج المتجر «${p.name}» مش موجود — هيتضاف من غير مخزون. اربطه بمنتج موجود أو سجّل له مخزون/شحنة`);
          }
          productId = p.id;
        }
        o._rows.push(r._row);
        o.items.push({ productId, qty, price });
      });
    });
    webOrders.forEach((o) => {
      if (!o) return;
      if (!o.items.length) return;
      const gross = o.items.reduce((a, it) => a + it.qty * it.price, 0);
      if (o.discount > gross) o.discount = gross;
      if (o.fileTotal != null && !isNaN(o.fileTotal) && Math.abs(gross - o.discount + o.shippingCharged - o.fileTotal) > 1) warnings.push(`طلب المتجر ${o.webOrderNo}: الإجمالي في الملف ${o.fileTotal} والمحسوب ${Math.round((gross - o.discount + o.shippingCharged) * 100) / 100} (ممكن ضرايب أو رسوم)`);
      delete o.fileTotal;
      groups.set(o.importRef, o);
    });
    const sales = [...groups.values()];
    if (cogsGapLines) warnings.push(`${cogsGapLines} سطر مبيعات تكلفتها في الملف تختلف عن تكلفة المنتج في ورقة المخزون (الفرق ${Math.round(cogsGap)} ج.م) — النظام يحسب التكلفة من تكلفة المخزون`);

    // المخزون الافتتاحي = الرصيد الحالي + ما خرج في الملف
    const opening = [];
    products.filter((p) => p.isNew && !p.fromWeb).forEach((p) => {
      const qty = (p.currentQty || 0) + p.soldQty;
      if (qty > 0) opening.push({ id: makeId(), date: openingDate, productId: p.id, qty, unitCost: p.cost || 0, reason: 'opening', notes: 'مخزون افتتاحي من ملف الاستيراد', importRef: `erp:opening:${p.sku || normKey(p.name)}` });
    });
    products.filter((p) => !p.isNew && p.soldQty > 0).forEach((p) => warnings.push(`«${p.name}» موجود مسبقًا وخرج منه ${p.soldQty} في الملف — تأكد أن رصيده في النظام يكفي`));
    const early = [...sales, ...promos].filter((x) => x.date < openingDate);
    if (early.length) warnings.push(`${early.length} عملية قبل تاريخ المخزون الافتتاحي (${openingDate}) — سيظهر رصيد غير كافٍ. اختر تاريخًا أقدم`);

    // المصروفات
    const expenses = [];
    found.filter((s) => s.kind === 'expenses').forEach((s) => s.rows.forEach((r) => {
      const where = { sheet: s.name, row: r._row };
      const date = toDate(r.date), amount = toNumber(r.amount);
      if (!date || date === 'invalid') { errors.push({ ...where, reason: `تاريخ غير صحيح «${str(r.date)}»` }); return; }
      if (amount == null || isNaN(amount) || amount <= 0) { errors.push({ ...where, reason: `مبلغ غير صحيح «${str(r.amount)}»` }); return; }
      const payKey = str(r.payment) || '(فارغ)';
      const acc = opts.expensePay[payKey];
      if (!acc || acc === 'skip') { skipped.push({ ...where, reason: isStockPayment(payKey) ? `مدفوع من المخزون — مسجل كعينة دعاية: ${str(r.desc).slice(0, 60)}` : `طريقة الدفع «${payKey}» اخترت تخطيها` }); return; }
      const importRef = `erp:exp:${date}:${amount}:${normKey(r.desc).slice(0, 40)}`;
      if (existingRefs.has(importRef)) { skipped.push({ ...where, reason: 'مستورد من قبل' }); return; }
      expenses.push({ id: makeId(), date, category: guessCategory(`${str(r.category)} ${str(r.desc)}`), amount, accountId: acc, notes: str(r.desc) || str(r.category), importRef });
    }));

    const totals = {
      revenue: sales.reduce((s, x) => s + x.items.reduce((a, it) => a + it.qty * it.price, 0), 0),
      lines: sales.reduce((s, x) => s + x.items.length, 0),
      openingQty: opening.reduce((s, a) => s + a.qty, 0),
      openingValue: opening.reduce((s, a) => s + a.qty * a.unitCost, 0),
      promoQty: promos.reduce((s, a) => s - a.qty, 0),
      expenses: expenses.reduce((s, e) => s + e.amount, 0),
      fileCogs,
    };
    return { found: found.map((f) => ({ name: f.name, kind: f.kind, label: KIND_LABEL[f.kind], rows: f.rows.length })), ignored, products, customers, sales, promos, opening, expenses, errors, warnings, skipped, totals, openingDate };
  }

  // ---------- التطبيق ----------
  function applyImport(state, plan) {
    const s = JSON.parse(JSON.stringify(state));
    plan.products.filter((p) => p.isNew).forEach((p) => s.products.push({ id: p.id, sku: p.sku, brand: '', name: p.name, sizeMl: '', gender: 'unisex', price: p.price, minStock: s.settings.lowStock }));
    s.customers.push(...plan.customers);
    s.adjustments.push(...plan.opening, ...plan.promos);
    [...plan.sales].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((sale) => {
      const { _rows, ...clean } = sale;
      s.sales.push({ ...clean, no: s.settings.nextInvoiceNo++ });
    });
    s.expenses.push(...plan.expenses);
    if (plan.openingDate && (!s.settings.startDate || s.settings.startDate > plan.openingDate)) s.settings.startDate = plan.openingDate;
    s.demo = false;
    return s;
  }

  const api = { readWorkbook, parseCsv, detectSheets, defaultMappings, planImport, applyImport, toDate, toNumber, phoneKey, normName, normKey, latinDigits };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IMP = api;
})(typeof window !== 'undefined' ? window : globalThis);
