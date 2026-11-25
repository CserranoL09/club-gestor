// Contexto activo, guardado automático, indicador de estado y cola sin conexión.
// Todas las escrituras de formularios pasan por autosaver().
import { sb } from './supabase.js';
import { ask, toast, errMsg } from './ui.js';

const CTX_KEY = 'clubgestor:ctx';
const QUEUE_KEY = 'clubgestor:queue';

// ---------------------------------------------------------------------
// Contexto (club > temporada > equipo)
// ---------------------------------------------------------------------
export function getCtx() {
  try { return JSON.parse(localStorage.getItem(CTX_KEY)) || {}; } catch { return {}; }
}
export function setCtx(patch) {
  const next = { ...getCtx(), ...patch };
  try { localStorage.setItem(CTX_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
  return next;
}
export function clearCtx() {
  try { localStorage.removeItem(CTX_KEY); } catch { /* sin almacenamiento */ }
}

// ---------------------------------------------------------------------
// Indicador «Guardando… / Guardado / Sin conexión»
// ---------------------------------------------------------------------
let inFlight = 0;
let hideTimer = null;
export function saveStatus(state) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  clearTimeout(hideTimer);
  const text = { saving: 'Guardando…', saved: '✓ Guardado', offline: '⚠ Sin conexión: se guardará al volver', error: '⚠ No se ha guardado' }[state] || '';
  el.textContent = text;
  el.className = 'save-status ' + (state || '');
  el.hidden = !text;
  if (state === 'saved') hideTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

const isNetworkError = (err) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(String(err?.message || err));

// ---------------------------------------------------------------------
// Cola sin conexión (localStorage)
// ---------------------------------------------------------------------
function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; }
}
function writeQueue(q) {
  try { q.length ? localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) : localStorage.removeItem(QUEUE_KEY); } catch { /* sin almacenamiento */ }
}
function enqueue(table, id, patch) {
  const q = readQueue();
  const item = q.find((x) => x.table === table && x.id === id);
  if (item) Object.assign(item.patch, patch); else q.push({ table, id, patch });
  writeQueue(q);
}
export function pendingCount() { return readQueue().length; }

let flushing = false;
/** Intenta enviar lo que quedó pendiente sin conexión. */
export async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  const q = readQueue();
  if (!q.length) return;
  flushing = true;
  saveStatus('saving');
  const left = [];
  for (const item of q) {
    try {
      const { data, error } = await sb().from(item.table).update(item.patch).eq('id', item.id).select('updated_at').maybeSingle();
      if (error) {
        if (isNetworkError(error)) left.push(item);
        else toast('No se ha podido guardar un cambio pendiente: ' + errMsg(error), 'err', 7000);
      } else if (data) {
        // Avisar a los formularios abiertos de la nueva versión de la fila.
        window.dispatchEvent(new CustomEvent('clubgestor:saved', { detail: { table: item.table, id: item.id, updated_at: data.updated_at } }));
      }
    } catch (err) {
      if (isNetworkError(err)) left.push(item);
    }
  }
  writeQueue(left);
  flushing = false;
  saveStatus(left.length ? 'offline' : 'saved');
  if (!left.length) window.dispatchEvent(new Event('clubgestor:synced'));
}
window.addEventListener('online', () => flushQueue());
setInterval(() => { if (readQueue().length) flushQueue(); }, 15000);

// ---------------------------------------------------------------------
// Guardado automático de una fila
// ---------------------------------------------------------------------
const savers = new Set();
window.addEventListener('beforeunload', (ev) => {
  const busy = inFlight > 0 || [...savers].some((s) => s.dirty());
  if (busy) { ev.preventDefault(); ev.returnValue = ''; }
});

/**
 * Guarda los cambios de una fila con 1 s de espera.
 * @param table      tabla de Supabase
 * @param id         id de la fila
 * @param updatedAt  updated_at que se leyó (para detectar cambios de otra persona)
 * @param onSaved    (fila guardada) => void
 * @param onReload   () => void  si hay conflicto y se elige «Recargar»
 */
export function autosaver({ table, id, updatedAt, delay = 1000, onSaved = () => {}, onReload = () => location.reload() }) {
  let pending = {};
  let version = updatedAt || null;
  let timer = null;
  let running = null;

  async function save() {
    timer = null;
    if (!Object.keys(pending).length) return;
    const patch = pending;
    pending = {};
    inFlight++;
    saveStatus('saving');
    try {
      let q = sb().from(table).update(patch).eq('id', id);
      if (version) q = q.eq('updated_at', version);
      const { data, error } = await q.select().maybeSingle();
      if (error) throw error;
      if (data) {
        version = data.updated_at;
        saveStatus('saved');
        onSaved(data);
        return;
      }
      // No se ha actualizado ninguna fila: o ha cambiado otra persona, o no hay permiso.
      const { data: cur } = await sb().from(table).select('updated_at').eq('id', id).maybeSingle();
      if (cur && version && cur.updated_at !== version) {
        saveStatus('error');
        const overwrite = await ask('Otra persona ha cambiado esto mientras lo editabas. Puedes recargar para ver su versión (perderás tu último cambio) o sobrescribirla con el tuyo.',
          { title: 'Cambios de otra persona', yes: 'Sobrescribir con lo mío', no: 'Recargar' });
        if (overwrite) {
          version = cur.updated_at;
          pending = { ...patch, ...pending };
          await save();
        } else onReload();
        return;
      }
      saveStatus('error');
      toast('No tienes permiso para cambiar esto.', 'err');
    } catch (err) {
      if (isNetworkError(err)) {
        enqueue(table, id, patch);
        saveStatus('offline');
      } else {
        saveStatus('error');
        toast(errMsg(err), 'err', 6000);
      }
    } finally {
      inFlight--;
    }
  }

  // Si la cola sin conexión guarda esta fila, se toma su nueva versión.
  const onQueued = (ev) => {
    const d = ev.detail;
    if (d.table === table && d.id === id) { version = d.updated_at; onSaved({ updated_at: d.updated_at }); }
  };
  window.addEventListener('clubgestor:saved', onQueued);

  const api = {
    /** Añade cambios y programa el guardado. */
    set(patch) {
      Object.assign(pending, patch);
      saveStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(() => { running = save(); }, delay);
    },
    /** Guarda ya lo pendiente (p. ej. al salir de la página). */
    async flush() {
      if (timer) { clearTimeout(timer); timer = null; running = save(); }
      await running;
    },
    dirty: () => !!timer || Object.keys(pending).length > 0,
    setVersion(v) { version = v; },
    detach() { window.removeEventListener('clubgestor:saved', onQueued); },
    dispose() { api.flush(); savers.delete(api); api.detach(); }
  };
  savers.add(api);
  return api;
}

/** Guarda lo pendiente de todos los formularios abiertos (se llama al cambiar de página). */
export async function flushAll() {
  const list = [...savers];
  savers.clear();
  await Promise.all(list.map((s) => s.flush()));
  list.forEach((s) => s.detach());
}
