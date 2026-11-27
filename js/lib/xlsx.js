// Exportar e importar Excel con SheetJS 0.18.5, que se carga solo al pulsar (cdnjs y, si falla, jsDelivr).
// Si no se puede cargar, se descarga un CSV que Excel también abre.
import { toast } from '../ui.js';

const SOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];
let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX no disponible')));
    s.onerror = () => { s.remove(); reject(new Error('No se ha podido cargar ' + src)); };
    document.head.appendChild(s);
  });
}

export async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  if (!loading) {
    loading = (async () => {
      for (const src of SOURCES) {
        try { return await loadScript(src); } catch { /* probar el siguiente */ }
      }
      throw new Error('Sin SheetJS');
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

/** Nombre de archivo seguro con fecha. */
export function fileName(base, ext) {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${String(base).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_')}_${stamp}.${ext}`;
}

/**
 * Descarga una hoja: header = [títulos], rows = [[valores]].
 * widths opcional = [anchos en caracteres].
 */
export function exportSheet({ name, sheet = 'Hoja1', header, rows, widths }) {
  return exportBook(name, [{ name: sheet, rows: [header, ...rows], widths: widths || header.map((h) => Math.max(10, String(h).length + 2)), freeze: { x: 1, y: 1 } }]);
}

/**
 * Libro con varias hojas: [{ name, rows: [[...]], widths?, freeze?: {x, y}, merges?: ['A1:C1'] }].
 * Las fechas (Date) se guardan como fechas reales de Excel (dd/mm/aaaa). Si SheetJS no carga, CSV.
 */
export async function exportBook(name, sheets) {
  let XLSX;
  try { XLSX = await loadXLSX(); } catch (err) {
    console.error(err);
    downloadCSV(name, [], sheets.flatMap((sh, i) => [...(i ? [[]] : []), [`== ${sh.name} ==`], ...sh.rows]));
    toast('No se ha podido preparar el Excel; se ha descargado en CSV (también se abre con Excel).', 'err', 6000);
    return 'csv';
  }
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows.length ? sh.rows : [['']], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    // Fechas como número de serie de Excel (sin desfase por zona horaria) con formato dd/mm/aaaa.
    for (const k of Object.keys(ws)) {
      const c = ws[k];
      if (k[0] === '!' || c.t !== 'd' || !(c.v instanceof Date)) continue;
      ws[k] = { t: 'n', v: (Date.UTC(c.v.getFullYear(), c.v.getMonth(), c.v.getDate()) - Date.UTC(1899, 11, 30)) / 864e5, z: 'dd/mm/yyyy' };
    }
    if (sh.widths) ws['!cols'] = sh.widths.map((w) => ({ wch: w }));
    if (sh.merges?.length) ws['!merges'] = sh.merges.map((r) => XLSX.utils.decode_range(r));
    let nm = String(sh.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja';
    while (used.has(nm)) nm = nm.slice(0, 28) + ' ' + used.size;
    used.add(nm);
    XLSX.utils.book_append_sheet(wb, ws, nm);
  }
  let out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
  try { out = freezePanes(XLSX, out, sheets.map((s) => s.freeze)); } catch (err) { console.warn('Sin cabeceras fijas', err); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = fileName(name, 'xlsx');
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return 'xlsx';
}

/** Cabeceras fijas: SheetJS libre no las escribe, así que se añade el panel congelado a cada hoja del .xlsx. */
function freezePanes(XLSX, data, freezes) {
  if (!freezes.some((f) => f && (f.x || f.y))) return data;
  const zip = XLSX.CFB.read(new Uint8Array(data), { type: 'array' });
  freezes.forEach((f, i) => {
    if (!f || !(f.x || f.y)) return;
    const idx = zip.FullPaths.findIndex((p) => p.endsWith(`xl/worksheets/sheet${i + 1}.xml`));
    if (idx < 0) return;
    const entry = zip.FileIndex[idx];
    const cell = XLSX.utils.encode_cell({ c: f.x || 0, r: f.y || 0 });
    const pane = `<sheetViews><sheetView workbookViewId="0"><pane${f.x ? ` xSplit="${f.x}"` : ''}${f.y ? ` ySplit="${f.y}"` : ''} topLeftCell="${cell}" activePane="${f.x && f.y ? 'bottomRight' : f.y ? 'bottomLeft' : 'topRight'}" state="frozen"/></sheetView></sheetViews>`;
    let xml = new TextDecoder().decode(entry.content);
    xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '');
    xml = xml.replace(/(<dimension [^>]*\/>)/, `$1${pane}`);
    entry.content = new TextEncoder().encode(xml);
    entry.size = entry.content.length;
  });
  return XLSX.CFB.write(zip, { fileType: 'zip', type: 'array', compression: true });
}

/**
 * Lee un .xlsx/.xls/.ods o un CSV. Devuelve [{ name, rows }] con filas como matrices (celdas vacías = null).
 * Las fechas llegan como Date.
 */
export async function readBook(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'csv' || ext === 'txt' || file.type === 'text/csv') {
    return [{ name: file.name.replace(/\.[^.]+$/, ''), rows: parseCSV(await file.text()) }];
  }
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellFormula: false, cellHTML: false });
  return wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }) }));
}

/** CSV con ; o , (lo que más aparezca en la primera línea), comillas dobles y BOM. */
export function parseCSV(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map((r) => r.map((c) => (c.trim() === '' ? null : c.trim())));
}

export function downloadCSV(name, header, rows) {
  const all = header?.length ? [header, ...rows] : rows;
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '\uFEFF' + all.map((r) => r.map((v) => cell(v instanceof Date ? `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}` : v)).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = fileName(name, 'csv');
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
