// Todas las lecturas y escrituras de datos pasarán por aquí (caché, autoguardado y cola sin conexión).
// En la v0.1.0 solo guarda el contexto activo (club > temporada > equipo).

const CTX_KEY = 'clubgestor:ctx';

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
