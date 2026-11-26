// Jugadores: posiciones, pie, estados y lectura de listas pegadas («7 Pedro» o «7;Pedro;DEL;zurdo;2014»).

export const POSITIONS = [['POR', 'Portero'], ['DEF', 'Defensa central'], ['LAT', 'Lateral'], ['MC', 'Mediocentro'], ['EXT', 'Extremo'], ['DEL', 'Delantero']];
export const FEET = [['diestro', 'Diestro'], ['zurdo', 'Zurdo'], ['ambas', 'Ambas']];
export const STATUS = { D: ['Disponible', 'ok'], L: ['Lesionado', 'danger'], A: ['Ausente', 'warn'] };
export const NEXT_STATUS = { D: 'L', L: 'A', A: 'D' };

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** «portero», «pt», «gk» → 'POR'. Devuelve '' si no se reconoce. */
export function normPosition(v) {
  const s = strip(v).replace(/\./g, '');
  if (!s) return '';
  const map = [
    ['POR', /^(por|portero|pt|gk|arquero|guardameta)$/],
    ['DEF', /^(def|defensa|dfc|central|dc|cb|libero)$/],
    ['LAT', /^(lat|lateral|ld|li|carrilero|lb|rb)$/],
    ['MC', /^(mc|medio|mediocentro|mcd|mco|pivote|centrocampista|interior|cm|dm|am)$/],
    ['EXT', /^(ext|extremo|ed|ei|banda|winger|w)$/],
    ['DEL', /^(del|delantero|dc9|punta|ariete|st|fw|9)$/]
  ];
  return (map.find(([, re]) => re.test(s)) || [''])[0];
}

/** «derecho», «D», «izq» → 'diestro' | 'zurdo' | 'ambas' | null. */
export function normFoot(v) {
  const s = strip(v);
  if (!s) return null;
  if (/^(d|der|derecho|diestro|dch|r|right)$/.test(s)) return 'diestro';
  if (/^(i|izq|izquierdo|zurdo|z|l|left)$/.test(s)) return 'zurdo';
  if (/^(a|ambas|ambos|ambidiestro|amb|both)$/.test(s)) return 'ambas';
  return null;
}

/**
 * Lee una lista pegada. Separadores: «;», tabulador o «,»; también «7 Pedro López».
 * Devuelve [{ line, number, name, position, foot, birth_year, error, warn }].
 * taken = Map(dorsal → nombre) de los jugadores activos que ya están en el equipo.
 */
export function parseRoster(text, taken = new Map()) {
  const out = [];
  const seen = new Map();
  for (const [i, raw] of String(text || '').split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    let parts = line.includes(';') ? line.split(';') : line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : null;
    if (!parts) {
      const m = /^(\d{1,2})\s*[-.)·]?\s+(.+)$/.exec(line);
      parts = m ? [m[1], m[2]] : ['', line];
    }
    parts = parts.map((x) => x.trim());
    const [n, name = '', pos = '', foot = '', year = ''] = parts;
    const row = { line: i + 1, raw: line, number: null, name: name.replace(/\s+/g, ' ').slice(0, 80), position: normPosition(pos), foot: normFoot(foot), birth_year: null, error: '', warn: [] };
    if (n !== '') {
      if (/^\d{1,2}$/.test(n)) row.number = +n;
      else row.error = `Dorsal «${n}» no válido (0 a 99)`;
    }
    if (!row.name) row.error ||= 'Falta el nombre';
    if (pos && !row.position) row.warn.push(`posición «${pos}» no reconocida`);
    if (foot && !row.foot) row.warn.push(`pie «${foot}» no reconocido`);
    if (year) {
      if (/^\d{4}$/.test(year) && +year >= 1950 && +year <= 2100) row.birth_year = +year;
      else row.warn.push(`año «${year}» no válido`);
    }
    if (row.number != null && !row.error) {
      if (taken.has(row.number)) row.error = `El ${row.number} ya es de ${taken.get(row.number)}`;
      else if (seen.has(row.number)) row.error = `Dorsal ${row.number} repetido en la línea ${seen.get(row.number)}`;
      else seen.set(row.number, row.line);
    }
    out.push(row);
  }
  return out;
}

/** Primer dorsal libre a partir de 1. */
export function freeNumber(players) {
  const used = new Set(players.filter((p) => p.active && p.number != null).map((p) => p.number));
  for (let n = 1; n < 100; n++) if (!used.has(n)) return n;
  return null;
}
