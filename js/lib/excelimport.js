// Importar desde la plantilla «Control competición TEMPORADA» (o desde un Excel exportado por la app, o un CSV).
// Solo detecta y limpia: no escribe nada. Devuelve lo encontrado para la vista previa.
import { MATERIAL, OBJECTIVES, STAFF, ROLES, newBlock } from './sessions.js';
import { ORIGINS } from './acta.js';
import { COLLECTIVE, INDIVIDUAL } from './post.js';
import { POSITIONS, FEET } from './players.js';

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------------------------------------------------------------- limpieza
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (v, max = 2000) => (v == null ? '' : String(v instanceof Date ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max));
/** Textos de ejemplo de la plantilla que no son datos. */
export function isPlaceholder(v) {
  const s = norm(v);
  return !s || /^jugador\s*\d*$/.test(s) || /^([a-z])\1\1$/.test(s) || s === 'dd/mm/aaaa' || /^hh:mm/.test(s) || s === 'local' || s === 'visitante'
    || s === '-' || s === 'contenidos' || s === 'aaa' || s.startsWith('detallar la actuacion') || /^\d-\s*$/.test(s) || s === 'observaciones.' || s === 'observaciones:';
}
const text = (v, max) => (isPlaceholder(v) ? '' : clean(v, max));
const int = (v, lo = 0, hi = 999) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; };
const dec = (v, lo = 0, hi = 999) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null; };
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Fecha de Excel (Date, número de serie o texto dd/mm/aaaa / aaaa-mm-dd) → 'aaaa-mm-dd' o null. */
export function toISO(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return isoOf(new Date(v.getTime() + 12 * 3600e3 - ((v.getHours() * 60 + v.getMinutes()) >= 12 * 60 ? 24 * 3600e3 : 0)));
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  const s = String(v ?? '').trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; const d = new Date(y, +m[2] - 1, +m[1]); return d.getMonth() === +m[2] - 1 && y > 1990 && y < 2100 ? isoOf(d) : null; }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? s.slice(0, 10) : null;
}
/** Hora: Date, fracción de día o 'hh:mm' → 'hh:mm' o null. */
export function toTime(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  if (typeof v === 'number' && v >= 0 && v < 1) { const mins = Math.round(v * 1440); return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`; }
  const m = /(\d{1,2})[:.h](\d{2})/.exec(String(v ?? ''));
  return m && +m[1] < 24 && +m[2] < 60 ? `${pad(+m[1])}:${m[2]}` : null;
}
const position = (v) => { const s = norm(v); if (!s) return ''; const p = POSITIONS.find(([k, l]) => norm(k) === s || norm(l) === s || norm(l).startsWith(s) || s.startsWith(norm(l).split(' ')[0])); return p ? p[0] : ''; };
const foot = (v) => { const s = norm(v); if (!s) return null; if (/^(d|diestro|derecho|derecha)/.test(s)) return 'diestro'; if (/^(z|zurdo|izquierdo|izquierda)/.test(s)) return 'zurdo'; if (/amb/.test(s)) return 'ambas'; return FEET.find(([k]) => k === s)?.[0] || null; };
const origin = (v) => { const s = norm(v); if (!s) return null; return ORIGINS.find((o) => s.startsWith(norm(o).slice(0, 4)) || (norm(o) === 'abp' && /abp|parad/.test(s))) || null; };
const mark = (v) => { const s = String(v ?? '').trim(); if (!s) return null; if (/^[✖✕✗xX×]/.test(s) || s.startsWith('✖')) return 'x'; const n = int(s, 1, 3); return n ?? null; };

const cell = (rows, r, c) => (rows[r] ? rows[r][c] ?? null : null);
const findSheet = (book, ...names) => book.find((s) => names.some((n) => norm(s.name).replace(/[^a-z]/g, '') === n)) || book.find((s) => names.some((n) => norm(s.name).replace(/[^a-z]/g, '').startsWith(n)));
const findRow = (rows, test, from = 0, col = null) => { for (let r = from; r < rows.length; r++) { const row = rows[r] || []; if ((col == null ? row : [row[col]]).some((v) => test(norm(v)))) return r; } return -1; };

// ---------------------------------------------------------------- jugadores
function addPlayer(map, number, name, extra = {}) {
  const nm = clean(name, 80);
  if (isPlaceholder(nm)) return null;
  const key = norm(nm);
  const prev = map.get(key);
  const p = { number: int(number, 0, 99), name: nm, position: '', foot: null, birth_year: null, ...prev, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) };
  if (prev?.number != null) p.number = prev.number;
  map.set(key, p);
  return p;
}

/** Tabla con cabecera (CSV o la hoja PLANTILLA exportada): Dorsal · Nombre · Posición · Pie · Año. */
function playersFromTable(rows, map) {
  const h = rows.findIndex((r) => (r || []).some((v) => /^(nombre|jugador)$/.test(norm(v))));
  if (h < 0 || h > 5) return 0;
  const idx = (re) => (rows[h] || []).findIndex((v) => re.test(norm(v)));
  const cN = idx(/^(dorsal|n|no|numero|n.)$/), cName = idx(/^(nombre|jugador)$/), cPos = idx(/^posici/), cFoot = idx(/^pie/), cYear = idx(/^(ano|año|nacimiento|year)/), cAct = idx(/^activo/);
  let n = 0;
  for (const r of rows.slice(h + 1)) {
    if (!r || cell([r], 0, cName) == null) continue;
    if (cAct >= 0 && /^no/.test(norm(r[cAct]))) continue;
    if (addPlayer(map, cN >= 0 ? r[cN] : null, r[cName], { position: cPos >= 0 ? position(r[cPos]) : '', foot: cFoot >= 0 ? foot(r[cFoot]) : null, birth_year: cYear >= 0 ? int(r[cYear], 1950, 2100) : null })) n++;
  }
  return n;
}

// ---------------------------------------------------------------- POSTPARTIDO
function postMatches(rows, map, warnings) {
  const rJ = findRow(rows, (s) => s === 'jornada', 0, 1);
  if (rJ < 0) return [];
  const rFirst = rJ + 6;                                              // primera fila de jugadores (fila 14)
  let rEnd = findRow(rows, (s) => s.startsWith('evaluacion colectiva'), rFirst, 0);
  if (rEnd < 0) rEnd = rows.length;
  const rCol = rEnd, rInd = findRow(rows, (s) => s.startsWith('evaluacion individual'), rFirst, 0), rCap = findRow(rows, (s) => s.startsWith('captacion'), rFirst, 0);
  const people = [];
  for (let r = rFirst; r < rEnd; r++) { const p = addPlayer(map, cell(rows, r, 0), cell(rows, r, 1)); if (p) people.push({ r, p }); }
  const width = Math.max(...rows.slice(rJ, rEnd).map((r) => (r || []).length));
  const out = [];
  for (let c = 2; c < width; c += 15) {
    if (norm(cell(rows, rJ + 4, c)) !== 'convocatoria') break;   // fin de las jornadas (columnas de totales)
    const date = toISO(cell(rows, rJ + 1, c));
    const local = text(cell(rows, rJ + 3, c), 80), visitor = text(cell(rows, rJ + 3, c + 9), 80);
    const players = people.map(({ r, p }) => {
      const v = (j) => cell(rows, r, c + j);
      const filled = Array.from({ length: 15 }, (_, j) => v(j)).some((x) => x != null && x !== '');
      if (!filled) return null;
      return {
        player: p, available: !/^n/.test(norm(v(0))), called: /^c/.test(norm(v(1))), starter: /^t/.test(norm(v(2))), minutes: int(v(3), 0, 200) ?? 0,
        gf: Object.fromEntries(ORIGINS.map((o, i) => [o, int(v(4 + i), 0, 20) ?? 0])), assists: int(v(8), 0, 20) ?? 0,
        gc: Object.fromEntries(ORIGINS.map((o, i) => [o, int(v(9 + i), 0, 30) ?? 0])), yellow: int(v(13), 0, 2) ?? 0, red: int(v(14), 0, 1) ?? 0
      };
    }).filter(Boolean);
    if (!date && !local && !visitor && !players.length) continue;
    const m = { source: 'POSTPARTIDO', matchday: int(cell(rows, rJ, c), 0, 99), date, local, visitor,
      gh: int(cell(rows, rJ + 3, c + 6), 0, 50), ga: int(cell(rows, rJ + 3, c + 8), 0, 50), players, collective: {}, indTexts: {}, scouting: [] };
    // Evaluación: cada fase o acción tiene su rótulo en la columna de la jornada y el texto debajo.
    const scan = (from, to, labels, put) => {
      if (from < 0) return;
      for (let r = from; r < (to < 0 ? rows.length : to); r++) for (let j = 0; j < 15; j++) {
        const lab = labels.find(([, l]) => norm(l).replace(/\s/g, '') === norm(cell(rows, r, c + j)).replace(/\s/g, ''));
        if (!lab) continue;
        let val = cell(rows, r + 1, c + j);
        if (val == null || isPlaceholder(val) || labels.some(([, l]) => norm(l) === norm(val))) val = cell(rows, r + 2, c + j);
        if (val != null && !isPlaceholder(val) && !labels.some(([, l]) => norm(l) === norm(val))) put(lab[0], String(val));
      }
    };
    scan(rCol, rInd, Object.values(COLLECTIVE).flatMap((d) => d.phases), (k, v) => {
      const sm = /^nota\s*([1-5])\s*(?:·\s*)?/i.exec(v.trim());
      m.collective[k] = { score: sm ? +sm[1] : null, text: clean(sm ? v.trim().slice(sm[0].length) : v, 2000) };
    });
    scan(rInd, rCap, [...INDIVIDUAL.attack.actions, ...INDIVIDUAL.defense.actions], (k, v) => { m.indTexts[k] = clean(v, 1500); });
    if (rCap >= 0) for (let r = rCap + 1; r < Math.min(rows.length, rCap + 12); r++) {
      const name = text(cell(rows, r, c + 2), 80);
      if (!name || norm(name) === 'jugador') continue;
      m.scouting.push({ number: int(cell(rows, r, c), 0, 99), name, position: position(cell(rows, r, c + 6)), foot: foot(cell(rows, r, c + 9)), level: int(cell(rows, r, c + 12), 1, 5), notes: text(cell(rows, r, c + 13), 1000) });
    }
    out.push(m);
  }
  if (out.some((m) => m.players.length && !m.date)) warnings.push('Hay jornadas sin fecha en POSTPARTIDO: se importan sin fecha.');
  return out;
}

// ---------------------------------------------------------------- PREPARTIDO (una jornada)
function preMatch(rows, map) {
  const rH = findRow(rows, (s) => s === 'jornada');
  if (rH < 0) return null;
  const head = rows[rH] || [];
  const at = (re) => head.findIndex((v) => re.test(norm(v)));
  const v = (re) => { const c = at(re); return c < 0 ? null : cell(rows, rH + 1, c); };
  const hourRaw = String(v(/^hora/) ?? '');
  const times = (hourRaw.match(/\d{1,2}[:.h]\d{2}/g) || []).map(toTime);
  const rA = findRow(rows, (s) => s.startsWith('alineacion'));
  const lineup = [];
  if (rA >= 0) for (let r = rA + 1; r < rA + 26 && r < rows.length; r++) {
    if (/^abp|^observ/.test(norm(cell(rows, r, 0)))) break;
    const p = addPlayer(map, cell(rows, r, 0), cell(rows, r, 1));
    if (p) lineup.push(p);
  }
  const label = (re) => { const r = findRow(rows, (s) => re.test(s), rH + 1, 0); if (r < 0) return ''; const own = String(cell(rows, r, 0) ?? '').replace(/^[^:]*:?\s*/, ''); const right = (rows[r] || []).slice(1).find((x) => x != null && !isPlaceholder(x)); return text(right ?? (own && !re.test(norm(own)) ? own : null) ?? cell(rows, r + 1, 0), 2000); };
  const plan = {};
  for (const [k, re] of [['attack', /^ataque$/], ['defense', /^defensa$/], ['rival', /^rival$/]]) {
    for (let r = 0; r < rows.length; r++) { const c = (rows[r] || []).findIndex((x) => re.test(norm(x))); if (c >= 0) { const t = text(cell(rows, r, c + 1), 2000); if (t) plan[k] = t; break; } }
  }
  const m = { source: 'PREPARTIDO', matchday: int(v(/^jornada/), 0, 99), date: toISO(v(/^fecha/)), time: times[0] || null, call_time: times[1] || null,
    venue: text(v(/^lugar/), 120), local: text(v(/local/), 80), visitor: text(v(/visitante/), 80), lineup, plan,
    abp_for: label(/^abp a favor/), abp_against: label(/^abp en contra/), pre_notes: label(/^observaciones/) };
  const real = m.date || m.venue || lineup.length || Object.keys(plan).length || m.abp_for || m.abp_against;
  return real ? m : null;
}

// ---------------------------------------------------------------- PARTIDO (una jornada)
function actaMatch(rows, map, isHomeGuess) {
  const rH = findRow(rows, (s) => s === 'jornada');
  if (rH < 0) return null;
  const head = rows[rH] || [];
  const at = (re) => head.findIndex((v) => re.test(norm(v)));
  const cRes = at(/^resultado/);
  const res = cRes < 0 ? [] : (rows[rH + 1] || []).slice(cRes, cRes + 4).filter((x) => x != null && x !== '').map((x) => int(x, 0, 50));
  const rT = findRow(rows, (s) => s === 'jugador', rH + 1, 1);
  const table = [];
  if (rT >= 0) for (let r = rT + 1; r < rT + 25 && r < rows.length; r++) {
    if (/^anotaciones|^observ/.test(norm(cell(rows, r, 0)))) break;
    const p = addPlayer(map, cell(rows, r, 0), cell(rows, r, 1));
    if (!p) continue;
    table.push({ player: p, goals: int(cell(rows, r, 6), 0, 20) ?? 0, assists: int(cell(rows, r, 7), 0, 20) ?? 0, yellow: int(cell(rows, r, 8), 0, 2) ?? 0, red: int(cell(rows, r, 9), 0, 1) ?? 0, minutes: int(cell(rows, r, 10), 0, 200) });
  }
  // Goles y tarjetas: Min · Res/Tipo · Jugador · Origen/Motivo
  const rE = findRow(rows, (s) => s.startsWith('res/tipo'));
  const events = [];
  if (rE >= 0) {
    const row = rows[rE] || [];
    const cMin = row.findIndex((x) => norm(x) === 'min'), cTipo = row.findIndex((x) => norm(x).startsWith('res/tipo')), cJug = row.findIndex((x, i) => i > cTipo && norm(x) === 'jugador'), cOri = row.findIndex((x) => norm(x).startsWith('origen'));
    let prev = [0, 0];
    for (let r = rE + 1; r < rE + 30 && r < rows.length; r++) {
      const tipo = norm(cell(rows, r, cTipo)); const who = cell(rows, r, cJug);
      if (/^anotaciones|^observ/.test(norm(cell(rows, r, 0)))) break;
      if (!tipo && who == null) continue;
      const minute = int(cell(rows, r, cMin), 0, 200);
      const sc = /^(\d+)\s*[-–]\s*(\d+)$/.exec(tipo);
      const ev = { minute, who: clean(who, 80), origin: origin(cell(rows, r, cOri)), note: '' };
      if (sc) {
        const now = [+sc[1], +sc[2]];
        const ours = isHomeGuess ? now[0] > prev[0] : now[1] > prev[1];
        events.push({ ...ev, type: ours ? 'goal' : 'goal_against' });
        prev = now;
      } else if (/amarill|^ta$/.test(tipo)) events.push({ ...ev, type: 'yellow', note: text(cell(rows, r, cOri), 200) });
      else if (/roja|^tr$/.test(tipo)) events.push({ ...ev, type: 'red', note: text(cell(rows, r, cOri), 200) });
      else if (/^gol/.test(tipo)) events.push({ ...ev, type: /rival|contra/.test(tipo) ? 'goal_against' : 'goal' });
    }
  }
  const after = (re) => { const r = findRow(rows, (s) => re.test(s), rH + 1, 0); if (r < 0) return ''; const right = (rows[r] || []).slice(1).find((x) => x != null && !isPlaceholder(x)); return text(right ?? cell(rows, r + 1, 0), 3000); };
  const m = { source: 'PARTIDO', matchday: int(cell(rows, rH + 1, at(/^jornada/)), 0, 99), date: toISO(cell(rows, rH + 1, at(/^fecha/))),
    local: text(cell(rows, rH + 1, at(/^local/)), 80), visitor: text(cell(rows, rH + 1, at(/^visitante/)), 80), gh: res[0] ?? null, ga: res[1] ?? null,
    table, events, annotations: after(/^anotaciones/), notes: after(/^observaciones/) };
  return m.date || table.length || events.length || m.local || m.visitor ? m : null;
}

// ---------------------------------------------------------------- SESIÓN
const BLOCK_HEADS = [[/^warm ?- ?up|^calentamiento/, 'warmup'], [/^tarea \d/, 'task'], [/^vuelta a la calma/, 'cooldown']];
function templateSession(rows, map) {
  const rD = findRow(rows, (s) => s.startsWith('datos generales'));
  if (rD < 0) return null;
  const h = rD + 1, v = (re) => { const c = (rows[h] || []).findIndex((x) => re.test(norm(x))); return c < 0 ? null : cell(rows, h + 1, c); };
  const date = toISO(v(/^fecha/));
  if (!date) return null;
  const s = { date, time: toTime(v(/^hora/)), duration_min: int(v(/^duracion/), 0, 600), number: int(v(/^sesion/), 0, 999), microcycle: int(v(/^microciclo/), 0, 99),
    period: text(v(/^periodo/), 40), staff: {}, objectives: {}, material: {}, attendance: [], blocks: [], notes: '' };
  // Cuerpo técnico y objetivos: rótulo y valor a su derecha
  const right = (r, c) => { for (let j = c + 1; j < c + 10; j++) { const x = cell(rows, r, j); if (x != null && x !== '') return x; } return null; };
  const STAFF_RE = { entrenador: /^entrenador:?$/, segundo: /^2.? ?entrenador/, preparador: /^preparador/, porteros: /^e\.? ?porteros|^entrenador de porteros/ };
  const OBJ_RE = { general: /^general/, condicional: /^condicional/, tectac: /^tec-?tac|^tecnico/, psicologico: /^psicol/ };
  for (let r = h; r < h + 10 && r < rows.length; r++) (rows[r] || []).forEach((x, c) => {
    const n = norm(x);
    for (const [k, re] of Object.entries(STAFF_RE)) if (re.test(n) && !s.staff[k]) { const t = text(right(r, c), 80); if (t) s.staff[k] = t; }
    for (const [k, re] of Object.entries(OBJ_RE)) if (re.test(n) && !s.objectives[k]) { const t = text(right(r, c), 600); if (t) s.objectives[k] = t; }
  });
  // Material: rótulo de la lista fija y la cantidad a su derecha
  const rM = findRow(rows, (x) => x.startsWith('material'), h);
  if (rM >= 0) for (let r = rM + 1; r < rM + 6; r++) (rows[r] || []).forEach((x, c) => {
    const n = norm(x).replace(/:$/, '');
    const m = MATERIAL.find((k) => norm(k) === n || norm(k).replace(/ \/ /, '/') === n.replace(/ \/ /, '/'));
    if (m) { const q = int(right(r, c), 0, 999); if (q != null || /x|si|✔/.test(norm(right(r, c)))) s.material[m] = q ?? ''; }
    if (n === 'otros') { const t = text(right(r, c), 200); if (t) s.material.otros = t; }
  });
  // Asistencia: dos columnas Dorsal · Jugador · Estado (D/L/A)
  const rAtt = findRow(rows, (x) => x.startsWith('dorsal - jugador'), h);
  if (rAtt >= 0) {
    const starts = (rows[rAtt] || []).map((x, c) => (norm(x).startsWith('dorsal - jugador') ? c : -1)).filter((c) => c >= 0);
    for (let r = rAtt + 1; r < rAtt + 15 && r < rows.length; r++) for (const c0 of starts) {
      const p = addPlayer(map, cell(rows, r, c0), cell(rows, r, c0 + 1));
      if (!p) continue;
      let st = null;
      for (let j = c0 + 2; j < c0 + 10; j++) { const x = String(cell(rows, r, j) ?? '').trim().toUpperCase(); if (/^[DLA]$/.test(x)) { st = x; break; } }
      if (st) s.attendance.push({ player: p, status: st });
    }
  }
  // Bloques
  for (let r = 0; r < rows.length; r++) {
    const kind = BLOCK_HEADS.find(([re]) => re.test(norm(cell(rows, r, 0))))?.[1];
    if (!kind) continue;
    const title = clean(String(cell(rows, r + 1, 0) ?? '').replace(/^\s*t[ií]tulo de la tarea:?\s*/i, ''), 80);
    const variants = [cell(rows, r + 11, 8), cell(rows, r + 13, 8)].map((x) => clean(String(x ?? '').replace(/^\s*\d\s*-\s*/, ''), 300)).filter(Boolean);
    const lines = (c) => [17, 18, 19, 20, 21].map((d) => text(cell(rows, r + d, c), 600)).filter(Boolean).join('\n');
    const b = newBlock(kind, title || (kind === 'warmup' ? 'Calentamiento' : kind === 'cooldown' ? 'Vuelta a la calma' : `Tarea ${s.blocks.filter((x) => x.kind === 'task').length + 1}`), {
      description: text(cell(rows, r + 3, 0), 3000), variants, obj_off: lines(0), obj_def: lines(8),
      roles: Object.fromEntries([['entrenador', 19], ['segundo', 21], ['preparador', 23], ['porteros', 25]].map(([k, d]) => [k, text(cell(rows, r + d, 20), 200)]).filter(([, x]) => x)),
      structure: { duration: dec(cell(rows, r + 25, 0), 0, 180) ?? (kind === 'task' ? 12 : 10), series: int(cell(rows, r + 25, 2), 1, 20) ?? 1, rest: dec(cell(rows, r + 25, 4), 0, 30) ?? 0,
        space: text(cell(rows, r + 24, 6), 40), players: text(cell(rows, r + 24, 10), 20), goalkeepers: text(cell(rows, r + 24, 13), 20) }
    });
    if (title || b.description || cell(rows, r + 25, 0) != null || kind !== 'task') s.blocks.push(b);
  }
  return s;
}

/** Hoja SESIÓN exportada por la app: una fila por sesión y bloque. */
function exportedSessions(rows) {
  const h = rows.findIndex((r) => (r || []).some((x) => norm(x) === 'bloque') && (r || []).some((x) => norm(x) === 'fecha'));
  if (h < 0) return [];
  const H = (rows[h] || []).map(norm);
  const at = (l) => H.indexOf(norm(l));
  const out = new Map();
  for (const r of rows.slice(h + 1)) {
    const date = toISO(r?.[at('fecha')]);
    if (!date) continue;
    const key = date + (toTime(r[at('hora')]) || '');
    if (!out.has(key)) {
      const mat = {};
      for (const part of String(r[at('material')] ?? '').split(/,\s*/)) {
        const mm = /^(.*?)\s*(\d+)?$/.exec(part.trim()); const name = MATERIAL.find((k) => norm(k) === norm(mm?.[1]));
        if (name) mat[name] = mm[2] ? +mm[2] : ''; else if (/^otros:/i.test(part)) mat.otros = clean(part.replace(/^otros:\s*/i, ''), 200);
      }
      out.set(key, { date, time: toTime(r[at('hora')]), duration_min: int(r[at('duración')], 0, 600), number: int(r[at('sesión')], 0, 999), microcycle: int(r[at('microciclo')], 0, 99),
        period: text(r[at('periodo')], 40), staff: Object.fromEntries(STAFF.map(([k, l]) => [k, text(r[at(l)], 80)]).filter(([, x]) => x)),
        objectives: Object.fromEntries(OBJECTIVES.map(([k, l]) => [k, text(r[at(`Obj. ${l}`)], 600)]).filter(([, x]) => x)), material: mat, attendance: [], blocks: [], notes: text(r[at('observaciones')], 4000) });
    }
    const s = out.get(key);
    const kindTxt = norm(r[at('tipo')]);
    if (!r[at('título')] && !kindTxt) continue;
    s.blocks.push(newBlock(kindTxt.startsWith('calent') ? 'warmup' : kindTxt.startsWith('vuelta') ? 'cooldown' : 'task', text(r[at('título')], 80), {
      description: text(r[at('desarrollo')], 3000), variants: String(r[at('variantes')] ?? '').split('\n').map((x) => clean(x.replace(/^\d+-\s*/, ''), 300)).filter(Boolean),
      obj_off: text(r[at('obj. ofensivos')], 600), obj_def: text(r[at('obj. defensivos')], 600),
      roles: Object.fromEntries(ROLES.map(([k, l]) => [k, text(r[at(l)], 200)]).filter(([, x]) => x)),
      structure: { duration: dec(r[at('duración (min)')], 0, 180) ?? 10, series: int(r[at('series')], 1, 20) ?? 1, rest: dec(r[at('rec. (min)')], 0, 30) ?? 0, space: text(r[at('espacio')], 40), players: text(r[at('nº jugadores')], 20), goalkeepers: text(r[at('porteros')], 20) }
    }));
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- PERIODIZACIÓN (contenidos)
function periodContents(rows, seasonStart) {
  const y0 = +String(seasonStart || '').slice(0, 4) || new Date().getFullYear();
  const m0 = +String(seasonStart || '').slice(5, 7) || 8;
  const out = [];
  // Formato de la app: fila «Lunes» con fechas en las columnas.
  const rL = findRow(rows, (s) => s === 'lunes', 0, 0);
  const rDia = findRow(rows, (s) => s === 'dia/mes');
  let mondays = [], first = -1, c0 = 1;
  if (rL >= 0 && (rows[rL] || []).slice(1).some((x) => x instanceof Date || toISO(x))) {
    mondays = (rows[rL] || []).map((x, c) => (c ? toISO(x) : null));
    first = findRow(rows, (s) => s === 'microciclo', rL, 0) + 1;
  } else if (rDia >= 0) {
    // Plantilla: meses en la fila DÍA/MES y números de día de lunes a domingo (una semana puede ocupar dos columnas).
    const col = rDia === -1 ? 1 : (rows[rDia] || []).findIndex((x) => norm(x) === 'dia/mes');
    c0 = col;
    let month = null;
    const width = Math.max(...rows.slice(rDia, rDia + 8).map((r) => (r || []).length));
    for (let c = col + 1; c < width; c++) {
      const mh = MONTHS_ES.indexOf(norm(cell(rows, rDia, c)));
      if (mh >= 0) month = mh;
      if (month == null) continue;
      let iso = null;
      for (let d = 0; d < 7 && !iso; d++) {
        const day = int(cell(rows, rDia + 1 + d, c), 1, 31);
        if (day == null) continue;
        const year = month + 1 >= m0 ? y0 : y0 + 1;
        const dt = new Date(year, month, day); dt.setDate(dt.getDate() - d);
        iso = isoOf(dt);
      }
      mondays[c] = iso;
    }
    first = findRow(rows, (s) => s === 'microciclo', rDia, col) + 1;
  } else return out;
  if (first <= 0) return out;
  let n = 0;
  for (let r = first; r < rows.length; r++) {
    const row = rows[r] || [];
    const label = row[c0 === 1 && rDia >= 0 ? c0 : 0] ?? row[0];
    const marks = {};
    row.forEach((x, c) => { if (c > c0 - (rDia >= 0 ? 0 : 1) && mondays[c]) { const v = mark(x); if (v != null) marks[mondays[c]] = v; } });
    if (label == null && !Object.keys(marks).length) continue;
    n++;
    const placeholder = isPlaceholder(label);
    out.push({ name: placeholder ? `Contenido ${n}` : clean(label, 60), placeholder, marks });
  }
  return out.filter((c) => !c.placeholder || Object.keys(c.marks).length);
}

// ======================================================================= detección
/**
 * book: [{ name, rows }] de readBook(). ctx: { team, season, players } (los que ya existen).
 * Devuelve { players, matches, sessions, contents, warnings, sheets }.
 */
export function detect(book, ctx) {
  const warnings = [];
  const map = new Map();
  const teamName = norm(ctx.team?.name);
  // Jugadores de tablas con cabecera (CSV o PLANTILLA)
  const plantilla = findSheet(book, 'plantilla') || (book.length === 1 ? book[0] : null);
  if (plantilla) playersFromTable(plantilla.rows, map);

  const shPost = findSheet(book, 'postpartido'), shPre = findSheet(book, 'prepartido'), shAct = findSheet(book, 'partido'), shSes = findSheet(book, 'sesion'), shPer = findSheet(book, 'periorizacion', 'periodizacion');
  const post = shPost ? postMatches(shPost.rows, map, warnings) : [];
  const pre = shPre ? preMatch(shPre.rows, map) : null;

  // Partidos: unir POSTPARTIDO, PREPARTIDO y PARTIDO por jornada (o fecha)
  const matches = post.map((m) => ({ ...m }));
  // Nuestro equipo: el de la app o el que pone la hoja POSTPARTIDO en «Equipo».
  const rEq = shPost ? findRow(shPost.rows, (x) => x === 'equipo', 0, 0) : -1;
  const sheetTeam = rEq >= 0 ? norm((shPost.rows[rEq] || []).slice(1).find((x) => x != null && x !== '')) : '';
  const ours = (x) => !!x && (x === teamName || x === sheetTeam);
  const sideOf = (m) => {
    const l = norm(m.local), v = norm(m.visitor);
    if (ours(l)) return { is_home: true, rival: m.visitor };
    if (ours(v)) return { is_home: false, rival: m.local };
    return { is_home: true, rival: m.visitor || m.local || '' };
  };
  const merge = (x) => {
    if (!x) return;
    const t = matches.find((m) => (x.matchday != null && m.matchday === x.matchday) || (x.date && m.date === x.date));
    if (t) { for (const [k, v] of Object.entries(x)) if (v != null && v !== '' && !(Array.isArray(v) && !v.length) && (t[k] == null || t[k] === '' || (Array.isArray(t[k]) && !t[k].length) || k === 'source')) t[k] = k === 'source' ? `${t.source} + ${v}` : v; }
    else matches.push({ players: [], collective: {}, indTexts: {}, scouting: [], ...x });
  };
  merge(pre);
  if (shAct) { const guess = pre ? sideOf(pre).is_home : true; merge(actaMatch(shAct.rows, map, guess)); }
  for (const m of matches) Object.assign(m, sideOf(m));

  // Sesiones
  let sessions = [];
  if (shSes) { sessions = exportedSessions(shSes.rows); if (!sessions.length) { const s = templateSession(shSes.rows, map); if (s) sessions = [s]; } }
  else if (book.length === 1) sessions = exportedSessions(book[0].rows);

  const contents = shPer ? periodContents(shPer.rows, ctx.season?.start_date) : [];
  if (contents.length && contents.every((c) => c.placeholder)) warnings.push('Los contenidos de la periodización no tienen nombre (la plantilla dice «CONTENIDOS»): se importarán como «Contenido 1, 2…».');

  // Jugadores: marcar los que ya existen (por nombre o, si no, por dorsal libre)
  const existing = ctx.players || [];
  const players = [...map.values()].map((p) => {
    const same = existing.find((e) => norm(e.name) === norm(p.name));
    return { ...p, existing: same || null, numberTaken: !same && p.number != null && existing.some((e) => e.active && e.number === p.number) };
  }).sort((a, b) => (a.number ?? 99) - (b.number ?? 99) || a.name.localeCompare(b.name, 'es'));
  if (!book.some((s) => s.rows.some((r) => (r || []).some((x) => x != null)))) warnings.push('El archivo está vacío.');
  return { players, matches: matches.sort((a, b) => (a.matchday ?? 99) - (b.matchday ?? 99) || String(a.date).localeCompare(String(b.date))), sessions, contents, warnings, sheets: book.map((s) => s.name) };
}

// ======================================================================= de lo detectado a filas de la base de datos
/** Partido detectado → campos de matches (squad, eventos, estadísticas y postpartido), con los id de jugadores ya creados. */
export function matchRow(m, idOf, team) {
  const squad = [], stats = {}, events = [], postPlayers = {};
  let seq = 0;
  const id = () => Math.random().toString(36).slice(2, 10);
  const byName = (name) => idOf(name);
  for (const r of m.players || []) {
    const pid = byName(r.player.name); if (!pid) continue;
    if (r.called) squad.push({ player_id: pid, called: true, starter: !!r.starter, number: r.player.number, name: r.player.name });
    if (!r.available) postPlayers[pid] = { ...(postPlayers[pid] || {}), available: false };
    if (r.called) stats[pid] = { goals: ORIGINS.reduce((s, o) => s + r.gf[o], 0), assists: r.assists, yellow: r.yellow, red: r.red, minutes: r.minutes, manual: { goals: true, assists: true, yellow: true, red: true, minutes: true } };
    for (const o of ORIGINS) for (let i = 0; i < r.gf[o]; i++) events.push({ id: id(), seq: seq++, type: 'goal', minute: null, player_id: pid, origin: o });
    for (let i = 0; i < r.yellow; i++) events.push({ id: id(), seq: seq++, type: 'yellow', minute: null, player_id: pid });
    for (let i = 0; i < r.red; i++) events.push({ id: id(), seq: seq++, type: 'red', minute: null, player_id: pid });
    if (ORIGINS.some((o) => r.gc[o])) postPlayers[pid] = { ...(postPlayers[pid] || {}), gc: Object.fromEntries(ORIGINS.map((o) => [o, r.gc[o]])) };
  }
  // Sin POSTPARTIDO: convocatoria del PREPARTIDO (los primeros de la alineación, titulares) y tabla del PARTIDO
  if (!squad.length && m.lineup?.length) {
    const nStart = team?.modality === 'f7' ? 7 : 11;
    m.lineup.forEach((p, i) => { const pid = byName(p.name); if (pid && !squad.some((s) => s.player_id === pid)) squad.push({ player_id: pid, called: true, starter: i < nStart && m.lineup.length >= nStart, number: p.number, name: p.name }); });
  }
  for (const r of m.table || []) {
    const pid = byName(r.player.name); if (!pid) continue;
    if (!squad.some((s) => s.player_id === pid)) squad.push({ player_id: pid, called: true, starter: false, number: r.player.number, name: r.player.name });
    if (!stats[pid]) stats[pid] = { goals: r.goals, assists: r.assists, yellow: r.yellow, red: r.red, minutes: r.minutes ?? 0, manual: { goals: true, assists: true, yellow: true, red: true, ...(r.minutes != null ? { minutes: true } : {}) } };
  }
  // Eventos del PARTIDO (con minuto) sustituyen a los deducidos del POSTPARTIDO
  if (m.events?.length) {
    events.length = 0;
    const find = (who) => { const n = norm(who).replace(/^\d+\.?\s*/, ''); const num = int(String(who).match(/^\d+/)?.[0], 0, 99); return byName(n) || (num != null ? (m.players || []).concat(m.table || []).map((x) => x.player).find((p) => p.number === num) && byName((m.players || []).concat(m.table || []).map((x) => x.player).find((p) => p.number === num).name) : null); };
    for (const e of m.events) events.push({ id: id(), seq: seq++, type: e.type, minute: e.minute, player_id: e.type === 'goal_against' ? null : find(e.who) || null, origin: e.origin, note: e.note || '' });
  }
  // Goles en contra: por origen, el máximo apuntado a un jugador; el resto, sin origen
  const gfTotal = events.filter((e) => e.type === 'goal').length;
  const [gh, ga] = [m.gh, m.ga];
  let goalsFor = gh != null && ga != null ? (m.is_home ? gh : ga) : null;
  let goalsAgainst = gh != null && ga != null ? (m.is_home ? ga : gh) : null;
  if (!m.events?.length) {
    const gcBy = Object.fromEntries(ORIGINS.map((o) => [o, Math.max(0, ...(m.players || []).map((r) => r.gc[o] || 0))]));
    let n = 0;
    for (const o of ORIGINS) for (let i = 0; i < gcBy[o]; i++, n++) events.push({ id: id(), seq: seq++, type: 'goal_against', minute: null, origin: o });
    for (; goalsAgainst != null && n < goalsAgainst; n++) events.push({ id: id(), seq: seq++, type: 'goal_against', minute: null, origin: null });
    if (goalsAgainst == null && (m.players || []).length) goalsAgainst = n;
  }
  if (goalsFor == null && (m.players || []).length) goalsFor = gfTotal;
  const post = {};
  if (Object.keys(postPlayers).length) post.players = postPlayers;
  if (Object.keys(m.collective || {}).length) post.collective = m.collective;
  if (Object.keys(m.indTexts || {}).length) post.individual = { texts: m.indTexts, scores: {} };
  if (m.scouting?.length) post.scouting = m.scouting;
  const row = { matchday: m.matchday, date: m.date, rival: clean(m.rival, 80), is_home: m.is_home !== false, squad, events, player_stats: stats, goals_for: goalsFor, goals_against: goalsAgainst };
  if (Object.keys(post).length) row.post = post;
  for (const k of ['time', 'call_time']) if (m[k]) row[k] = m[k];
  for (const k of ['venue', 'abp_for', 'abp_against', 'pre_notes', 'annotations', 'notes']) if (m[k]) row[k] = m[k];
  if (m.plan && Object.keys(m.plan).length) row.plan = m.plan;
  return row;
}

/** Sesión detectada → fila de sessions. */
export function sessionRow(s, idOf) {
  const attendance = {};
  for (const a of s.attendance || []) { const pid = idOf(a.player.name); if (pid) attendance[pid] = { status: a.status, tasks: {}, note: '' }; }
  return { date: s.date, time: s.time, duration_min: s.duration_min, number: s.number, microcycle: s.microcycle, period: s.period || '',
    staff: s.staff || {}, objectives: s.objectives || {}, material: s.material || {}, attendance, blocks: s.blocks || [], notes: s.notes || '' };
}

/** Contenidos detectados → contents de la periodización (marcas por índice de semana). */
export function contentsFor(list, startMonday, weeks) {
  const start = new Date(startMonday + 'T00:00:00');
  return list.map((c) => ({ name: c.name, area: '', marks: Object.fromEntries(Object.entries(c.marks).map(([iso, v]) => [Math.round((new Date(iso + 'T00:00:00') - start) / (7 * 864e5)), v]).filter(([w]) => w >= 0 && w < weeks)) }));
}
