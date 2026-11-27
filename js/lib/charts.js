// Gráficos SVG hechos a mano (sin librerías): barras, barras agrupadas, donut y línea.
// Colores por CSS (variables del club); cada marca lleva <title> para el tooltip al pasar el ratón o tocar.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nice = (v) => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

/** Colores fijos por categoría (orden fijo, nunca reciclado). */
export const CAT = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];

function legend(items) {
  return `<div class="chart-legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`;
}

/** Barras agrupadas: labels × series [{ name, color, values }]. Con una sola serie no hay leyenda. */
export function bars({ labels, series, title = '', height = 180, unit = '', width = 320 }) {
  const W = width, H = height, L = 26, B = 22, T = 10;
  const max = nice(Math.max(1, ...series.flatMap((s) => s.values)));
  const gw = (W - L) / Math.max(1, labels.length);
  const bw = Math.max(3, Math.min(26, (gw - 6) / series.length - 2));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
    ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 4}" y="${y(t) + 3}" text-anchor="end">${Math.round(t * 10) / 10}</text>`).join('')}
    ${labels.map((lab, i) => {
      const x0 = L + i * gw + (gw - series.length * (bw + 2)) / 2;
      return series.map((s, k) => { const v = s.values[i] || 0; const h = Math.max(0, (H - T - B) - (y(v) - T));
        return `<g class="mk"><title>${esc(lab)} · ${esc(s.name)}: ${v}${unit}</title><rect x="${x0 + k * (bw + 2)}" y="${y(v)}" width="${bw}" height="${h}" rx="${Math.min(4, bw / 2)}" style="fill:${s.color}"/>
          <rect class="hit" x="${x0 + k * (bw + 2) - 1}" y="${T}" width="${bw + 2}" height="${H - T - B}"/></g>`; }).join('')
        + `<text class="ax" x="${L + i * gw + gw / 2}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`;
    }).join('')}
    <line class="base" x1="${L}" x2="${W}" y1="${H - B}" y2="${H - B}"/>
  </svg>${series.length > 1 ? legend(series.map((s) => ({ label: s.name, color: s.color }))) : ''}</figure>`;
}

/** Donut: data [{ label, value, color }] con el total en el centro. */
export function donut({ data, title = '', center = '' }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 42, r = 28, C = 50;
  let a = -Math.PI / 2;
  const arcs = total ? data.filter((d) => d.value).map((d) => {
    const frac = d.value / total;
    const a2 = a + frac * Math.PI * 2 - (frac < 1 ? 0.02 : 0);
    const large = a2 - a > Math.PI ? 1 : 0;
    const p = (ang, rad) => `${C + rad * Math.cos(ang)} ${C + rad * Math.sin(ang)}`;
    const path = frac >= 1 ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} L ${C - 0.01} ${C - r} A ${r} ${r} 0 1 0 ${C} ${C - r} Z`
      : `M ${p(a, R)} A ${R} ${R} 0 ${large} 1 ${p(a2, R)} L ${p(a2, r)} A ${r} ${r} 0 ${large} 0 ${p(a, r)} Z`;
    a += frac * Math.PI * 2;
    return `<path d="${path}" style="fill:${d.color}"><title>${esc(d.label)}: ${d.value} (${Math.round(frac * 100)}%)</title></path>`;
  }).join('') : `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" class="empty-ring" stroke-width="${R - r}"/>`;
  return `<figure class="chart donut"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(title)}">${arcs}
    <text x="50" y="50" class="d-val" text-anchor="middle">${esc(center || total)}</text><text x="50" y="62" class="d-lab" text-anchor="middle">${esc(title)}</text></svg>
    ${legend(data.map((d) => ({ label: `${d.label} ${d.value}`, color: d.color })))}</figure>`;
}

/** Línea: labels × series [{ name, color, values }] (null = sin dato). */
export function line({ labels, series, title = '', height = 170, max: forced, unit = '', width = 320 }) {
  const W = width, H = height, L = 26, B = 22, T = 10, Rg = 8;
  const max = forced || nice(Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null))));
  const x = (i) => L + (labels.length < 2 ? (W - L - Rg) / 2 : (i * (W - L - Rg)) / (labels.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const step = Math.ceil(labels.length / 10);
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
    ${[0, max / 2, max].map((t) => `<line class="grid" x1="${L}" x2="${W - Rg}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 4}" y="${y(t) + 3}" text-anchor="end">${Math.round(t * 10) / 10}</text>`).join('')}
    ${labels.map((lab, i) => (i % step ? '' : `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`)).join('')}
    ${series.map((s) => {
      const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v), v, labels[i]]));
      const segs = []; let cur = [];
      for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
      if (cur.length) segs.push(cur);
      return segs.map((sg) => `<polyline points="${sg.map((p) => p.slice(0, 2).join(',')).join(' ')}" style="stroke:${s.color}" class="ln"/>`).join('')
        + pts.filter(Boolean).map((p) => `<g class="mk"><title>${esc(p[3])} · ${esc(s.name)}: ${p[2]}${unit}</title><circle cx="${p[0]}" cy="${p[1]}" r="3.2" style="fill:${s.color}"/><circle class="hit" cx="${p[0]}" cy="${p[1]}" r="9"/></g>`).join('');
    }).join('')}
    <line class="base" x1="${L}" x2="${W - Rg}" y1="${H - B}" y2="${H - B}"/>
  </svg>${series.length > 1 ? legend(series.map((s) => ({ label: s.name, color: s.color }))) : ''}</figure>`;
}
