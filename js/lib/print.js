// Vistas de impresión: cada módulo arma un documento limpio (solo lectura) que se mete en #printRoot
// y se imprime con window.print(). Fondo blanco, A4 vertical o apaisado, escudo y colores del club.
import { esc, toast } from '../ui.js';
import { S } from '../session.js';
import { fmt } from './dates.js';

export const PDF_TIP = 'Para guardar en PDF: en Chrome, en «Destino» elige «Guardar como PDF»; en Safari, Archivo → Exportar como PDF (en iPhone o iPad, Compartir → Imprimir y luego Compartir en la vista previa).';

/** Botón estándar. Si hay varias opciones, un menú desplegable con una por línea. */
export function printButton(options = null, cls = 'btn') {
  if (!options) return `<button class="${cls}" type="button" data-print title="${esc(PDF_TIP)}">🖨 Imprimir / Guardar PDF</button>`;
  return `<details class="print-menu">
    <summary class="${cls}" title="${esc(PDF_TIP)}">🖨 Imprimir / Guardar PDF</summary>
    <div class="print-menu-list">${options.map(([k, l]) => `<button type="button" class="btn small" data-print="${esc(k)}">${esc(l)}</button>`).join('')}
      <p class="hint">${esc(PDF_TIP)}</p></div>
  </details>`;
}

/** Engancha los botones [data-print] de un contenedor: fn(opción) devuelve { title, html, landscape }. */
export function wirePrint(root, build) {
  root.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', async () => {
    b.closest('details')?.removeAttribute('open');
    const doc = await build(b.dataset.print || '');
    if (doc) printDoc(doc);
  }));
}

/** Cabecera común: escudo, club, equipo y título del documento. */
export function printHead({ title, sub = '', team = S.team, right = '' }) {
  const club = S.club || {};
  const crest = S.crestUrl
    ? `<img class="pr-crest" src="${esc(S.crestUrl)}" alt="">`
    : `<span class="pr-crest pr-crest-txt">${esc((club.short_name || club.name || 'CG').slice(0, 3).toUpperCase())}</span>`;
  return `<header class="pr-head">
    ${crest}
    <div class="pr-club"><strong>${esc(club.name || '')}</strong><span>${esc([team?.name, team?.category, S.season?.name].filter(Boolean).join(' · '))}</span></div>
    <div class="pr-doc-title"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}${right}</div>
  </header>`;
}

/** Pie: aplicación y fecha de impresión. */
export const printFoot = () => `<footer class="pr-foot">${esc(S.club?.name || '')} · Club Gestor · impreso el ${fmt(new Date())}</footer>`;

/** Texto de usuario con saltos de línea. */
export const txt = (s) => (s ? esc(s).replace(/\n/g, '<br>') : '<span class="pr-empty">—</span>');
/** Rejilla etiqueta/valor estilo Excel: pares [etiqueta, html]. */
export const kv = (pairs, cols = 4) => `<table class="pr-kv" style="--cols:${cols}"><tbody>${chunk(pairs.filter(Boolean), cols).map((row) => `<tr>${row.map(([l, v]) => `<th>${esc(l)}</th><td>${v === '' || v == null ? '—' : v}</td>`).join('')}${'<th></th><td></td>'.repeat(cols - row.length)}</tr>`).join('')}</tbody></table>`;
/** Título de bloque con la barra del color del club. */
export const bar = (title, extra = '') => `<h2 class="pr-bar">${esc(title)}${extra ? `<span>${extra}</span>` : ''}</h2>`;
export function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

let cleanup = null;
/** Pinta el documento en #printRoot y abre el diálogo de impresión. */
export async function printDoc({ title, html, landscape = false }) {
  cleanup?.();
  const root = document.createElement('div');
  root.id = 'printRoot';
  root.className = `pr-doc${landscape ? ' land' : ''}`;
  root.innerHTML = html + printFoot();
  document.body.appendChild(root);
  const page = document.createElement('style');
  page.id = 'printPage';
  page.textContent = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: ${landscape ? '8mm' : '10mm'}; }`;
  document.head.appendChild(page);
  document.body.classList.add('printing');
  const oldTitle = document.title;
  document.title = (title || oldTitle).replace(/[\\/:*?"<>|]+/g, '-');   // nombre del PDF
  cleanup = () => {
    root.remove(); page.remove();
    document.body.classList.remove('printing');
    document.title = oldTitle;
    window.removeEventListener('afterprint', cleanup);
    cleanup = null;
  };
  window.addEventListener('afterprint', cleanup);
  toast(PDF_TIP, 'ok', 7000);
  // Espera a las imágenes (tareas de la sesión, escudo) con un máximo de 4 s.
  const imgs = [...root.querySelectorAll('img')].filter((i) => !i.complete);
  await Promise.race([
    Promise.all(imgs.map((i) => new Promise((r) => { i.onload = r; i.onerror = r; }))),
    new Promise((r) => setTimeout(r, 4000))
  ]);
  await new Promise((r) => setTimeout(r, 150));
  window.print();
}

/** Copia de solo lectura de la pantalla actual (sin botones, filtros ni comentarios). */
export function screenCopy(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll('.no-print, .print-only, #thread, .page-head .actions, script, dialog').forEach((n) => n.remove());
  c.querySelector('.page-head')?.remove();
  return c.innerHTML;
}
