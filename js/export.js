/* Florume — الطباعة والتصدير إلى Excel (xlsx حقيقي بدون مكتبات خارجية) */
(function () {
  'use strict';

  // ---------- ضغط ZIP بسيط (بدون ضغط، STORE) ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function zip(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const chunks = [], central = [];
    let offset = 0;
    files.forEach(({ name, content }) => {
      const nameBytes = enc.encode(name);
      const data = typeof content === 'string' ? enc.encode(content) : content;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
      chunks.push(new Uint8Array(local.buffer), nameBytes, data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true); cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
      cen.setUint16(28, nameBytes.length, true); cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), nameBytes);
      offset += 30 + nameBytes.length + data.length;
    });
    const cenSize = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // ---------- بناء ملف xlsx ----------
  const xml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const colName = (i) => { let s = ''; i += 1; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  // الأنماط: 0 عادي، 1 عنوان عمود، 2 رقم، 3 نص إجمالي، 4 رقم إجمالي، 5 عنوان الورقة، 6 نسبة، 7 نسبة إجمالي، 8 وصف رمادي
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF7D450C"/><name val="Arial"/></font><font><sz val="10"/><color rgb="FF6E6574"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5E8D8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFEBF1"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF9C8FA3"/></top><bottom style="thin"><color rgb="FF9C8FA3"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  // القيمة: رقم، أو {v: رقم, pct: true}، أو نص
  function cellXml(ref, value, total) {
    if (value && typeof value === 'object' && value.pct) return `<c r="${ref}" s="${total ? 7 : 6}"><v>${value.v}</v></c>`;
    if (typeof value === 'number' && isFinite(value)) return `<c r="${ref}" s="${total ? 4 : 2}"><v>${value}</v></c>`;
    if (value === '' || value == null) return total ? `<c r="${ref}" s="3"/>` : '';
    return `<c r="${ref}" t="inlineStr" s="${total ? 3 : 0}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }

  function sheetXml(sheet) {
    const width = Math.max(sheet.header.length, ...sheet.rows.map((r) => r.cells.length), 1);
    const widths = new Array(width).fill(8);
    const measure = (v, i) => { const len = typeof v === 'number' ? String(Math.round(v)).length + 5 : String(v && v.pct ? '00.0%' : v || '').length; widths[i] = Math.min(60, Math.max(widths[i], len + 2)); };
    sheet.header.forEach(measure); sheet.rows.forEach((r) => r.cells.forEach(measure));
    const rows = [];
    let r = 1;
    rows.push(`<row r="${r}">${cellXml('A' + r, sheet.title)}</row>`.replace('s="0"', 's="5"')); r++;
    if (sheet.subtitle) { rows.push(`<row r="${r}">${cellXml('A' + r, sheet.subtitle)}</row>`.replace('s="0"', 's="8"')); r++; }
    r++;
    const headerRow = r;
    if (sheet.header.length) { rows.push(`<row r="${r}">${sheet.header.map((h, i) => `<c r="${colName(i)}${r}" t="inlineStr" s="1"><is><t xml:space="preserve">${xml(h)}</t></is></c>`).join('')}</row>`); r++; }
    sheet.rows.forEach((row) => { rows.push(`<row r="${r}">${row.cells.map((v, i) => cellXml(colName(i) + r, v, row.total)).join('')}</row>`); r++; });
    const pane = sheet.header.length ? `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0">${pane}</sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData></worksheet>`;
  }

  function buildXlsx(sheets) {
    const used = new Set();
    const names = sheets.map((s, i) => {
      let base = String(s.name || `ورقة ${i + 1}`).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 28) || `ورقة ${i + 1}`;
      let n = base, k = 2;
      while (used.has(n.toLowerCase())) n = `${base.slice(0, 25)} ${k++}`;
      used.add(n.toLowerCase());
      return n;
    });
    const files = [
      { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', content: STYLES },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(s) })),
    ];
    return zip(files);
  }

  // ---------- قراءة الجداول المعروضة على الشاشة ----------
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  function cellValue(el) {
    const sel = el.querySelector('select');
    if (sel) return clean(sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '');
    const text = clean(el.textContent);
    const bare = text.replace(/ج\.م|SAR|AED|USD|EGP|,/g, '').replace(/\s+/g, '');
    if (/^-?\d+(\.\d+)?%$/.test(bare)) return { v: Number(bare.slice(0, -1)) / 100, pct: true };
    if (/^-?\d+(\.\d+)?$/.test(bare) && (el.classList.contains('num') || el.closest('.kpi-value, .pos-grid b, .acc-card strong, .summary b, .hbars b'))) return Number(bare);
    return text;
  }
  function expandRow(tr) {
    const out = [];
    [...tr.children].forEach((c) => { out.push(c.classList.contains('row-actions') || c.classList.contains('act') ? null : cellValue(c)); for (let i = 1; i < (c.colSpan || 1); i++) out.push(''); });
    return out;
  }
  const headText = (el) => clean(el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.textContent : el.textContent);
  function headingFor(table, fallback) {
    let node = table.closest('.table-wrap') || table;
    for (let el = node.previousElementSibling; el; el = el.previousElementSibling) {
      if (el.matches('h2, h3, .section-title')) return headText(el);
      if (el.matches('.table-wrap')) break;
    }
    const panel = table.closest('.panel, .statement');
    const h = panel && panel.querySelector('.section-title, h2');
    return h ? headText(h) : fallback;
  }
  function tableToSheet(table, fallback) {
    const headRow = table.tHead && table.tHead.rows[0];
    const header = headRow ? expandRow(headRow) : [];
    const bodyRows = [...table.tBodies].flatMap((b) => [...b.rows]).filter((tr) => !tr.querySelector('.empty-row'));
    let rows = bodyRows.map((tr) => ({ cells: expandRow(tr), total: tr.classList.contains('total') || tr.classList.contains('grand') || tr.classList.contains('head') }));
    if (table.tFoot) rows = rows.concat([...table.tFoot.rows].map((tr) => ({ cells: expandRow(tr), total: true })));
    // حذف أعمدة الأزرار والأعمدة الفارغة تمامًا
    const width = Math.max(header.length, ...rows.map((r) => r.cells.length), 0);
    const keep = [];
    for (let i = 0; i < width; i++) {
      const isAction = rows.some((r) => r.cells[i] === null);
      const empty = !clean(header[i]) && rows.every((r) => r.cells[i] == null || r.cells[i] === '');
      if (!isAction && !empty) keep.push(i);
    }
    const pick = (arr) => keep.map((i) => (arr[i] == null ? '' : arr[i]));
    return { name: headingFor(table, fallback), header: header.length ? pick(header) : [], rows: rows.map((r) => ({ ...r, cells: pick(r.cells) })) };
  }
  function collectSheets(root, title) {
    const sheets = [];
    const pairs = [];
    root.querySelectorAll('.kpi').forEach((k) => pairs.push({ cells: [clean(k.querySelector('.kpi-label').textContent), cellValue(k.querySelector('.kpi-value')), clean((k.querySelector('.kpi-note') || {}).textContent)] }));
    root.querySelectorAll('.pos-grid > div, .summary > div').forEach((d) => pairs.push({ cells: [clean(d.querySelector('span').textContent), cellValue(d.querySelector('b')), ''] }));
    root.querySelectorAll('.acc-card').forEach((d) => pairs.push({ cells: [clean(d.querySelector('b').textContent), cellValue(d.querySelector('strong')), clean(d.querySelector('span').textContent)] }));
    if (pairs.length) sheets.push({ name: 'ملخص', header: ['البند', 'القيمة', 'ملاحظة'], rows: pairs });
    root.querySelectorAll('.panel').forEach((p) => {
      const items = p.querySelectorAll('.list > li, .hbars > li');
      if (!items.length) return;
      const h = p.querySelector('.section-title');
      sheets.push({ name: (h && headText(h)) || title, header: [], rows: [...items].map((li) => ({ cells: [...li.children].filter((c) => !c.classList.contains('hbar')).map(cellValue) })) });
    });
    root.querySelectorAll('.inv-party').forEach((p) => sheets.push({ name: 'العميل', header: [], rows: [...p.children].map((c) => ({ cells: [clean(c.textContent)] })) }));
    // القوائم المالية (الميزانية مثلًا) تُجمع في ورقة واحدة
    const merged = new Map();
    root.querySelectorAll('table').forEach((t) => {
      if (t.closest('.je') || t.classList.contains('lines')) return;
      const st = t.closest('.statement');
      const sheet = tableToSheet(t, title);
      if (!st) { sheets.push(sheet); return; }
      if (!merged.has(st)) { const m = { name: title, header: sheet.header, rows: [] }; merged.set(st, m); sheets.push(m); }
      const m = merged.get(st);
      if (m.rows.length) m.rows.push({ cells: [''] });
      m.rows.push(...sheet.rows);
    });
    return sheets;
  }

  // ---------- الحفظ ----------
  async function saveFile(filename, data) {
    const c = window.claude;
    if (c && typeof c.use === 'function') {
      let dl = null;
      try { dl = await c.use('downloads'); } catch (e) { dl = null; }
      if (dl) {
        try { await dl.save({ filename, data }); F.UI.toast(`تم حفظ ${filename}`); return true; }
        catch (e) {
          const code = e && e.code;
          if (code === 'declined') return false;
          if (code === 'rate_limited') { F.UI.toast('هناك نافذة حفظ مفتوحة بالفعل', 'bad'); return false; }
        }
      }
    }
    if (!F.inFrame) {
      try {
        const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        F.UI.toast(`تم تنزيل ${filename}`);
        return true;
      } catch (e) { /* غير متاح */ }
    }
    return null;
  }

  async function exportExcel(filename, sheets, meta) {
    const list = sheets.filter((s) => s.rows.length || s.header.length);
    if (!list.length) { F.UI.toast('لا توجد بيانات للتصدير في هذه الشاشة', 'bad'); return; }
    list.forEach((s) => { s.title = s.title || `${meta.business} — ${s.name}`; s.subtitle = s.subtitle || meta.subtitle; });
    const res = await saveFile(filename, buildXlsx(list));
    if (res === null) F.UI.toast('حفظ الملفات غير متاح هنا — افتح ملف florume.html على جهازك', 'bad');
  }

  // ---------- الطباعة ----------
  const PRINT_CSS = `
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif; color: #1a141d; font-size: 11.5px; line-height: 1.5; background: #fff; }
    .doc-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #9c5712; padding-bottom: 8px; margin-bottom: 14px; gap: 12px; }
    .doc-head .biz { font-family: "Reem Kufi", "IBM Plex Sans Arabic", Tahoma, sans-serif; font-size: 20px; font-weight: 700; color: #7d450c; }
    .doc-head h1 { font-size: 16px; margin: 2px 0 0; }
    .doc-head .meta { text-align: left; color: #6e6574; font-size: 10.5px; }
    h1, h2, h3 { margin: 0; } h2, .section-title { font-size: 13px; margin: 14px 0 6px; color: #4a4150; }
    p { margin: 4px 0; }
    .muted, small { color: #6e6574; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    th, td { border: 1px solid #d9d2dd; padding: 4px 6px; text-align: right; vertical-align: middle; }
    th { background: #f1ece4; font-weight: 700; font-size: 10.5px; }
    thead { display: table-header-group; }
    tfoot td, tr.total td, tr.grand td { font-weight: 700; background: #f5f2f6; }
    tr.grand td { background: #f5e8d8; font-size: 12.5px; }
    tr.head td { font-weight: 700; background: #efebf1; }
    tr.sub td:first-child { padding-right: 18px; }
    .num { text-align: left; direction: ltr; unicode-bidi: plaintext; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .mono { font-family: Consolas, monospace; direction: ltr; unicode-bidi: plaintext; }
    .cur { color: #6e6574; font-size: .85em; }
    .pill { border: 1px solid #cfc6d3; border-radius: 10px; padding: 0 6px; font-size: 10px; white-space: nowrap; }
    .good-text { color: #1d7549; } .bad-text { color: #b3261e; } .warn-text { color: #9a6400; }
    .kpis, .pos-grid, .acc-cards, .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; margin-bottom: 10px; }
    .kpi, .pos-grid > div, .acc-card, .summary > div { border: 1px solid #d9d2dd; border-radius: 6px; padding: 6px 8px; display: flex; flex-direction: column; text-align: right; background: #fff; font: inherit; color: inherit; }
    .kpi-value, .pos-grid b, .acc-card strong, .summary b { font-size: 14px; font-weight: 700; direction: ltr; text-align: right; unicode-bidi: plaintext; }
    .kpi-label, .kpi-note, .pos-grid span, .acc-card span, .summary span { color: #6e6574; font-size: 10px; }
    .grid-2, .grid-3 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; } .grid-3 { grid-template-columns: repeat(3, 1fr); }
    .panel { border: 1px solid #d9d2dd; border-radius: 6px; padding: 8px; page-break-inside: avoid; }
    .list, .hbars { list-style: none; margin: 0; padding: 0; }
    .list li, .hbars li { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted #d9d2dd; padding: 3px 0; }
    .hbar { display: none; }
    .chart { width: 100%; height: auto; } .chart .grid { stroke: #ddd; stroke-dasharray: 3 3; } .chart .axis { stroke: #888; } .chart .tick { fill: #666; font-size: 10px; }
    .chart .bar { fill: #d6ac7c; } .chart .bar.last { fill: #9c5712; } .chart .bar.neg { fill: #b3261e; } .chart .hit { fill: transparent; }
    .je { border: 1px solid #d9d2dd; border-radius: 6px; padding: 4px 6px; margin-bottom: 6px; page-break-inside: avoid; }
    .je-head { display: flex; gap: 10px; font-size: 10.5px; } .je table td { border: 0; padding: 1px 6px; } .je .cr-acc { padding-right: 26px; }
    .statement { max-width: none; }
    .inv-head { display: flex; justify-content: space-between; border-bottom: 2px solid #9c5712; padding-bottom: 6px; margin-bottom: 10px; }
    .brand-mark { font-family: "Reem Kufi", Tahoma, sans-serif; font-size: 22px; font-weight: 700; color: #7d450c; }
    .inv-meta { display: flex; flex-direction: column; align-items: flex-end; } .inv-party { display: flex; flex-direction: column; margin-bottom: 10px; }
    .doc-invoice .doc-head { display: none; }
    .table-wrap { overflow: visible; }
    .empty { color: #6e6574; }`;

  function cleanForPrint(root) {
    const node = root.cloneNode(true);
    node.querySelectorAll('select').forEach((s) => { const span = document.createElement('span'); span.textContent = s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''; span.className = 'pill'; s.replaceWith(span); });
    node.querySelectorAll('button.link-btn:not([data-action])').forEach((b) => b.remove());
    node.querySelectorAll('button.link-btn[data-action^="view"], button.link-btn[data-action^="edit"]').forEach((b) => { const s = document.createElement('b'); s.textContent = b.textContent; b.replaceWith(s); });
    node.querySelectorAll('.page-head, .page-actions, .filters, .tabs, .period, .row-actions, th.act, .demo-banner, .internal, button, input, textarea, label.file-btn, .empty-row').forEach((el) => el.remove());
    node.querySelectorAll('[data-tip]').forEach((el) => el.removeAttribute('data-tip'));
    return node.innerHTML;
  }

  function printDoc({ title, subtitle, business, html, invoice }) {
    const stamp = new Date().toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
    const doc = (autoPrint) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${xml(business)} — ${xml(title)}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Reem+Kufi:wght@600;700&display=swap">
      <style>${PRINT_CSS}</style></head><body class="${invoice ? 'doc-invoice' : ''}">
      <header class="doc-head"><div><div class="biz">${xml(business)}</div><h1>${xml(title)}</h1>${subtitle ? `<div class="muted">${xml(subtitle)}</div>` : ''}</div><div class="meta">طُبع في ${xml(stamp)}</div></header>
      ${html}${autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)});</script>' : ''}</body></html>`;
    if (!F.inFrame) {
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;';
      frame.srcdoc = doc(false);
      frame.onload = () => { setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { F.UI.toast('تعذرت الطباعة', 'bad'); } setTimeout(() => frame.remove(), 60000); }, 300); };
      document.body.appendChild(frame);
      return;
    }
    // داخل صفحة Artifact لا تعمل نافذة الطباعة: نحفظ ملفًا جاهزًا يطبع نفسه عند فتحه
    const name = `${business}-${title}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '-').slice(0, 80) + '.html';
    saveFile(name, doc(true)).then((res) => {
      if (res) F.UI.toast('افتح الملف المحفوظ وستظهر نافذة الطباعة (يمكنك الحفظ PDF منها)');
      else if (res === null) F.UI.toast('الطباعة غير متاحة هنا — افتح ملف florume.html على جهازك', 'bad');
    });
  }

  window.FX = { buildXlsx, collectSheets, tableToSheet, exportExcel, printDoc, cleanForPrint, saveFile };
})();
