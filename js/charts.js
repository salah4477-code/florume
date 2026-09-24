/*
 * رسوم لوحة التحكم — Florume
 * SVG/HTML بسيط بدون مكتبات: خط مصغر (sparkline)، أعمدة شهرية، منحنى يومي بخط متتبع،
 * أشرطة أفقية، وشريط مكدّس لحالات الطلبات. الألوان من متغيرات CSS (--chart-*) فتتبدل مع الوضع الداكن.
 * كل قيمة لها تلميح عند المرور أو التركيز بلوحة المفاتيح، والقيم نفسها موجودة في الجداول والأرقام.
 */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n) || 0;
  const fmt = (n, d = 0) => (Math.round(num(n) * 10 ** d) / 10 ** d).toLocaleString('en-US', { maximumFractionDigits: d });
  const compact = (v) => { const a = Math.abs(v); return a >= 1e6 ? `${fmt(v / 1e6, 1)}M` : a >= 1e3 ? `${fmt(v / 1e3, a >= 1e4 ? 0 : 1)}k` : fmt(v); };
  const niceMax = (v) => { if (v <= 0) return 0; const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
  // عمود بنهاية مستديرة 4px ومربع عند خط الصفر
  const colPath = (x, y0, w, y1) => {
    const up = y1 < y0, h = Math.abs(y1 - y0), r = Math.min(4, h, w / 2);
    if (h < 0.5) return '';
    return up
      ? `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`
      : `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  };

  // خط مصغر لبطاقات المؤشرات: الخط باللون الخافت والنقطة الأخيرة (الفترة الحالية) باللون الأساسي
  function sparkline(values, label) {
    const v = values.map(num);
    if (v.length < 2) return '';
    const W = 120, H = 34, p = 4;
    const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
    // من اليمين لليسار: أحدث نقطة على الشمال
    const pts = v.map((y, i) => [W - p - (i * (W - 2 * p)) / (v.length - 1), H - p - ((y - min) / span) * (H - 2 * p)]);
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><polyline points="${pts.map((q) => q.map((n) => n.toFixed(1)).join(',')).join(' ')}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5"/></svg>`;
  }

  // أعمدة (شهرية): لون واحد، السالب تحت خط الصفر
  function columns(series, { key, label, name, unit = 'ج.م' }) {
    const W = 560, H = 220, padL = 24, padR = 46, padT = 22, padB = 28;
    const vals = series.map((s) => num(s[key]));
    const top = niceMax(Math.max(0, ...vals)) || 1;
    const bottom = -niceMax(-Math.min(0, ...vals));
    const y = (v) => padT + ((top - v) / (top - bottom)) * (H - padT - padB);
    const band = (W - padL - padR) / series.length;
    const bw = Math.min(24, band * 0.6);
    const ticks = bottom < 0 ? (y(bottom) - y(0) > 16 ? [top, 0, bottom] : [top, 0]) : [top, top / 2, 0];
    const col = (i) => series.length - 1 - i; // الأحدث على الشمال
    const lastIdx = series.length - 1;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">
      ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'axis' : 'grid'}"/><text x="${W - padR + 8}" y="${y(t) + 4}" class="tick">${t ? compact(t) : '0'}</text>`).join('')}
      ${series.map((s, i) => {
        const v = vals[i], cx = padL + col(i) * band + band / 2;
        const tip = `${s.label}: ${fmt(v)} ${unit}`;
        return `<g class="col-g" data-tip="${esc(tip)}" tabindex="0" role="img" aria-label="${esc(tip)}">
          <rect class="hit" x="${padL + col(i) * band}" y="${padT}" width="${band}" height="${H - padT - padB}"/>
          <path class="col ${i === lastIdx ? 'now' : ''}" d="${colPath(cx - bw / 2, y(0), bw, y(v))}"/>
          ${i === lastIdx && v ? `<text class="val" x="${cx}" y="${v >= 0 ? y(v) - 6 : y(v) + 14}" text-anchor="middle">${compact(v)}</text>` : ''}
          <text x="${cx}" y="${H - 8}" class="tick" text-anchor="middle">${esc(s.short)}</text></g>`;
      }).join('')}
    </svg>`;
  }

  // منحنى زمني بمساحة خفيفة وخط متتبع؛ النقاط: [{label, value, extra}]
  function area(points, { label, unit = 'ج.م' }) {
    const W = 760, H = 230, padL = 26, padR = 50, padT = 16, padB = 28;
    const n = points.length;
    if (!n) return '';
    const top = niceMax(Math.max(0, ...points.map((p) => num(p.value)))) || 1;
    const x = (i) => (n === 1 ? (W - padR + padL) / 2 : W - padR - (i * (W - padL - padR)) / (n - 1));
    const y = (v) => padT + ((top - v) / top) * (H - padT - padB);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(num(p.value)).toFixed(1)}`).join('');
    const fill = `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
    const every = Math.max(1, Math.ceil(n / 8));
    const data = points.map((p, i) => ({ x: +x(i).toFixed(1), y: +y(num(p.value)).toFixed(1), t: `${p.label}: ${fmt(p.value)} ${unit}${p.extra ? ' · ' + p.extra : ''}` }));
    return `<svg viewBox="0 0 ${W} ${H}" class="chart chart-line" role="img" tabindex="0" aria-label="${esc(label)} — استخدم الأسهم للتنقل" data-points="${esc(JSON.stringify(data))}">
      ${[top, top / 2, 0].map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'axis' : 'grid'}"/><text x="${W - padR + 8}" y="${y(t) + 4}" class="tick">${t ? compact(t) : '0'}</text>`).join('')}
      <path class="area" d="${fill}"/><path class="line" d="${line}"/>
      ${points.map((p, i) => (i % every === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 8}" class="tick" text-anchor="middle">${esc(p.short || p.label)}</text>` : '')).join('')}
      <line class="cross" x1="0" x2="0" y1="${padT}" y2="${H - padB}" visibility="hidden"/><circle class="cross-dot" r="4.5" cx="0" cy="0" visibility="hidden"/>
      <rect class="hit" x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}"/>
    </svg>`;
  }

  // الخط المتتبع: أقرب نقطة للمؤشر، وبالأسهم من لوحة المفاتيح
  function bindLines(root, tip) {
    root.querySelectorAll('svg.chart-line').forEach((svg) => {
      const data = JSON.parse(svg.dataset.points || '[]');
      if (!data.length) return;
      const cross = svg.querySelector('.cross'), dot = svg.querySelector('.cross-dot');
      let idx = -1;
      const show = (i, clientX, clientY) => {
        idx = Math.max(0, Math.min(data.length - 1, i));
        const d = data[idx];
        cross.setAttribute('x1', d.x); cross.setAttribute('x2', d.x); dot.setAttribute('cx', d.x); dot.setAttribute('cy', d.y);
        cross.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
        tip.textContent = d.t; tip.hidden = false;
        if (clientX == null) { const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal; clientX = r.left + (d.x / vb.width) * r.width; clientY = r.top + (d.y / vb.height) * r.height; }
        tip.style.left = clientX + 'px'; tip.style.top = clientY - 14 + 'px';
      };
      const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
      svg.addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
        const vx = ((e.clientX - r.left) / r.width) * vb.width;
        let best = 0;
        data.forEach((d, i) => { if (Math.abs(d.x - vx) < Math.abs(data[best].x - vx)) best = i; });
        show(best, e.clientX, r.top + (data[best].y / vb.height) * r.height);
      });
      svg.addEventListener('pointerleave', hide);
      svg.addEventListener('blur', hide);
      svg.addEventListener('focus', () => show(idx < 0 ? 0 : idx));
      // RTL: السهم الشمال يروح للأحدث
      svg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx + 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); show(idx - 1); } });
    });
  }

  // أشرطة أفقية للمقارنة: لون واحد، القيمة نص بلون الكتابة
  function hbars(rows, { unit = 'ج.م', empty = 'لا توجد بيانات' } = {}) {
    if (!rows.length) return `<div class="empty"><p>${empty}</p></div>`;
    const max = Math.max(...rows.map((r) => Math.abs(num(r.value)))) || 1;
    return `<ul class="hbars">${rows.map((r) => `<li data-tip="${esc(`${r.label}: ${fmt(r.value)} ${unit}${r.extra ? ' · ' + r.extra : ''}`)}" tabindex="0"><span>${esc(r.label)}</span><div class="hbar"><i class="${num(r.value) < 0 ? 'neg' : ''}" style="width:${Math.max(1.5, (Math.abs(num(r.value)) / max) * 100)}%"></i></div><b>${compact(r.value)}</b></li>`).join('')}</ul>`;
  }

  // شريط مكدّس لجزء من كل (حالات الطلبات) + مفتاح بالأعداد
  function stack(parts, { total, unit = 'طلب' }) {
    const sum = total || parts.reduce((a, p) => a + num(p.value), 0);
    if (!sum) return '<div class="empty"><p>لا توجد طلبات في هذه الفترة</p></div>';
    const shown = parts.filter((p) => num(p.value) > 0);
    return `<div class="stack" role="img" aria-label="${esc(shown.map((p) => `${p.label} ${p.value}`).join('، '))}">${shown.map((p) => `<i class="st-${p.key}" style="flex:${num(p.value)}" data-tip="${esc(`${p.label}: ${fmt(p.value)} ${unit} (${fmt((num(p.value) / sum) * 100, 1)}%)`)}" tabindex="0"></i>`).join('')}</div>
      <ul class="legend">${parts.map((p) => `<li><i class="st-${p.key}"></i><span>${esc(p.label)}</span><b>${fmt(p.value)}</b><small>${fmt((num(p.value) / sum) * 100, 0)}%</small></li>`).join('')}</ul>`;
  }

  window.CH = { sparkline, columns, area, bindLines, hbars, stack, compact };
})();
