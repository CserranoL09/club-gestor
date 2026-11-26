// Página inicial del club: orden, módulos ocultos, nombres propios y tarjetas resumen.
// Se guarda en clubs.home_layout = { order:[clave], hidden:[clave], labels:{clave:texto}, widgets:[clave] }.
import { MODULES } from '../modules/list.js';

export const WIDGETS = [
  { key: 'partido', icon: '📅', name: 'Próximo partido' },
  { key: 'sesiones', icon: '⚽', name: 'Última y próxima sesión' },
  { key: 'microciclo', icon: '🗓', name: 'Microciclo actual' },
  { key: 'lesionados', icon: '🩹', name: 'Jugadores lesionados' },
  { key: 'asistencia', icon: '✅', name: 'Asistencia (últimas 4 semanas)' },
  { key: 'comentarios', icon: '💬', name: 'Comentarios pendientes' }
];

const MODULE_KEYS = MODULES.map((m) => m.key);
const WIDGET_KEYS = WIDGETS.map((w) => w.key);

/** Completa y limpia lo guardado para que siempre tenga todas las claves válidas. */
export function normalizeLayout(raw) {
  const l = raw && typeof raw === 'object' ? raw : {};
  const known = (list, keys) => (Array.isArray(list) ? list : []).filter((k, i, a) => keys.includes(k) && a.indexOf(k) === i);
  const order = known(l.order, MODULE_KEYS);
  MODULE_KEYS.forEach((k) => { if (!order.includes(k)) order.push(k); });
  const labels = {};
  if (l.labels && typeof l.labels === 'object') {
    for (const k of MODULE_KEYS) {
      const v = String(l.labels[k] ?? '').trim().slice(0, 30);
      if (v) labels[k] = v;
    }
  }
  return {
    order,
    hidden: known(l.hidden, MODULE_KEYS),
    labels,
    widgets: Array.isArray(l.widgets) ? known(l.widgets, WIDGET_KEYS) : [...WIDGET_KEYS]
  };
}

/** Módulos en el orden del club, con su nombre propio y si están ocultos. */
export function orderedModules(layout) {
  const l = normalizeLayout(layout);
  return l.order.map((k) => {
    const m = MODULES.find((x) => x.key === k);
    return { ...m, label: l.labels[k] || m.name, hidden: l.hidden.includes(k) };
  });
}

/** Nombre que el club le ha dado a un módulo. */
export function moduleLabel(layout, key) {
  const l = normalizeLayout(layout);
  return l.labels[key] || MODULES.find((m) => m.key === key)?.name || '';
}
