// Exportar a Excel con SheetJS 0.18.5, que se carga solo al pulsar (cdnjs y, si falla, jsDelivr).
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
export async function exportSheet({ name, sheet = 'Hoja1', header, rows, widths }) {
  try {
    const XLSX = await loadXLSX();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = (widths || header.map((h) => Math.max(10, String(h).length + 2))).map((w) => ({ wch: w }));
    ws['!freeze'] = { xSplit: 1, ySplit: 1 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
    XLSX.writeFile(wb, fileName(name, 'xlsx'));
    return 'xlsx';
  } catch (err) {
    console.error(err);
    downloadCSV(name, header, rows);
    toast('No se ha podido preparar el Excel; se ha descargado en CSV (también se abre con Excel).', 'err', 6000);
    return 'csv';
  }
}

export function downloadCSV(name, header, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = fileName(name, 'csv');
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
