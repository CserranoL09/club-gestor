// Copia de seguridad en JSON: descargar el club (o un partido o una sesión) y restaurarlo.
// Al restaurar se valida el formato, se generan id nuevos, se mantienen las relaciones y se sanea cada campo.
import { sb } from '../supabase.js';
import { S } from '../session.js';
import { APP_VERSION } from '../version.js';

export const FORMAT = 1;
const MAX_BYTES = 60 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMG_PATH = /^[0-9a-f-]{36}\/[\w./-]+\.(jpe?g|png|webp|gif)$/i;
/** Campos que identifican a otras personas: no salen en la copia. */
const PEOPLE = new Set(['created_by', 'updated_by', 'author_id', 'reviewed_by', 'user_id', 'class_id']);

// ======================================================================= saneo
const str = (max) => (v) => (v == null ? '' : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max));
const req = (max) => (v) => { const s = str(max)(v).trim(); if (!s) throw new Error('falta un nombre'); return s; };
const int = (lo, hi, nullable = true, def = null) => (v) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? (nullable ? null : def) : Math.min(hi, Math.max(lo, Math.round(n))); };
const bool = (def = false) => (v) => (typeof v === 'boolean' ? v : def);
const oneOf = (list, def) => (v) => (list.includes(v) ? v : def);
const date = (nullable = true) => (v) => { const s = String(v ?? '').slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00').getTime())) return s; if (nullable) return null; throw new Error('fecha no válida'); };
const time = (v) => { const m = /^(\d{2}):(\d{2})/.exec(String(v ?? '')); return m && +m[1] < 24 && +m[2] < 60 ? `${m[1]}:${m[2]}` : null; };
const color = (empty) => (v) => (/^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? v : empty);
const textArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.slice(0, 80)).slice(0, 50) : []);
const intArr = (v) => (Array.isArray(v) ? v.map(Number).filter(Number.isInteger).slice(0, 200) : []);
const json = (def) => (v) => (v != null && typeof v === 'object' ? cleanJSON(v) : def);
const ref = (v) => (typeof v === 'string' && UUID.test(v) ? v : null);
const path = (v) => (typeof v === 'string' && IMG_PATH.test(v) ? v : null);

/** JSON limpio: sin funciones, sin datos de personas, profundidad y tamaño de textos acotados. */
export function cleanJSON(v, depth = 0) {
  if (depth > 12) return null;
  if (Array.isArray(v)) return v.slice(0, 2000).map((x) => cleanJSON(x, depth + 1));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v).slice(0, 500)) if (!PEOPLE.has(k) && !k.startsWith('__')) out[String(k).slice(0, 80)] = cleanJSON(x, depth + 1);
    return out;
  }
  if (typeof v === 'string') return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, 10000);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v === null) return v;
  return null;
}

/** Columnas que se guardan de cada tabla y cómo se limpian. */
export const TABLES = {
  club: { name: req(120), short_name: str(20), primary_color: color('#22c55e'), secondary_color: color('#0ea5e9'), theme: oneOf(['dark', 'light'], 'dark'),
    font: oneOf(['saira', 'oswald', 'barlow'], 'saira'), home_layout: json({}), settings: json({}), city: str(120), address: str(200), founded_year: int(1850, 2100),
    website: str(200), email: str(200), phone: str(40), description: str(2000), crest_path: path },
  seasons: { name: req(40), start_date: date(false), end_date: date(false), is_current: bool(), archived: bool() },
  teams: { season_id: ref, name: req(80), category: str(60), modality: oneOf(['f11', 'f7'], 'f11'), periods: int(1, 4, false, 2), period_minutes: int(5, 60, false, 45),
    squad_max: int(7, 30, false, 18), archived: bool(), color: color(''), schedule: json([]) },
  players: { team_id: ref, number: int(0, 99), name: req(80), position: str(10), foot: oneOf(['diestro', 'zurdo', 'ambas'], null), birth_year: int(1950, 2100),
    status: oneOf(['D', 'L', 'A'], 'D'), active: bool(true) },
  sessions: { team_id: ref, date: date(false), time, duration_min: int(0, 600), period: str(40), microcycle: int(-999, 999), number: int(-9999, 9999),
    staff: json({}), objectives: json({}), material: json({}), attendance: json({}), blocks: json([]), notes: str(4000) },
  periodizations: { team_id: ref, season_id: ref, start_monday: date(false), end_date: date(false), legend: json([]), periods: json([]), macro: json([]), meso: json([]),
    micro_start: int(-99, 999, false, 1), micro_skip: intArr, contents: json([]), options: json({}) },
  macrocycles: { team_id: ref, season_id: ref, name: str(80), area: str(30), start_monday: date(false), weeks: int(1, 60, false, 36), phases: json([]), groups: json([]) },
  morphocycles: { team_id: ref, name: str(80), match_day: int(0, 6, false, 6), rows: json([]), is_default: bool() },
  matches: { team_id: ref, season_id: ref, matchday: int(0, 999), date: date(), time, call_time: time, venue: str(120), is_home: bool(true), rival: str(80), system: str(20),
    positions: json({}), plan: json({}), abp_for: str(4000), abp_against: str(4000), pre_notes: str(4000), squad: json([]), goals_for: int(0, 99), goals_against: int(0, 99),
    events: json([]), counters: json({}), annotations: str(4000), notes: str(4000), player_stats: json({}), post: json({}), report_done: bool() },
  task_library: { block: json({}), tags: textArr, title: str(120), status: oneOf(['propuesta', 'oficial', 'rechazada'], 'propuesta'), phase: str(30), categories: textArr,
    principle_id: ref, image_path: path, review_note: str(2000) },
  club_principles: { parent_id: ref, phase: oneOf(['ataque', 'defensa', 'trans_ofensiva', 'trans_defensiva', 'abp'], 'ataque'), stage: oneOf(['todas', 'base', 'rendimiento'], 'todas'),
    title: req(120), description: str(4000), image_path: path, sort: int(-9999, 99999, false, 0) },
  category_objectives: { category: req(60), objectives: json({}), notes: str(4000) },
  club_templates: { kind: oneOf(['sesion', 'morfociclo', 'macrociclo'], 'sesion'), stage: oneOf(['todas', 'base', 'rendimiento'], 'todas'), name: req(80), data: json({}), is_default: bool() },
  facilities: { name: req(60), kind: oneOf(['campo', 'vestuario', 'otro'], 'campo'), divisible: bool(true), notes: str(1000), sort: int(-9999, 99999, false, 0), active: bool(true) }
};
const LISTS = ['seasons', 'teams', 'players', 'sessions', 'task_library', 'periodizations', 'macrocycles', 'morphocycles', 'matches', 'club_principles', 'category_objectives', 'club_templates', 'facilities'];

/** Fila limpia (solo las columnas conocidas) conservando el id de la copia para las relaciones. */
function sanitize(table, row) {
  const out = { id: ref(row?.id) };
  for (const [k, fn] of Object.entries(TABLES[table])) out[k] = fn(row?.[k]);
  return out;
}

// ======================================================================= descargar
const strip = (row) => { const out = {}; for (const [k, v] of Object.entries(row || {})) if (!PEOPLE.has(k)) out[k] = typeof v === 'object' && v ? cleanJSON(v) : v; return out; };

/** Rutas de imágenes que usa la copia. */
export function imagePaths(b) {
  const set = new Set();
  const walk = (v) => { if (typeof v === 'string') { if (IMG_PATH.test(v)) set.add(v); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk([b.club?.crest_path, b.sessions, b.task_library, b.club_principles]);
  return [...set];
}

/** Lee todo el club (lo que el usuario puede ver). */
export async function collectClub(clubId = S.club.id) {
  const c = sb();
  const one = async (q) => { const { data, error } = await q; if (error) throw error; return data || []; };
  const club = (await one(c.from('clubs').select('*').eq('id', clubId)))[0];
  const seasons = await one(c.from('seasons').select('*').eq('club_id', clubId).order('start_date'));
  const teams = await one(c.from('teams').select('*').eq('club_id', clubId).order('name'));
  const ids = teams.map((t) => t.id);
  const byTeams = (t) => (ids.length ? one(c.from(t).select('*').in('team_id', ids)) : []);
  const [players, sessions, periodizations, macrocycles, morphocycles, matches, task_library, club_principles, category_objectives, club_templates, facilities] = await Promise.all([
    byTeams('players'), byTeams('sessions'), byTeams('periodizations'), byTeams('macrocycles'), byTeams('morphocycles'), byTeams('matches'),
    one(c.from('task_library').select('*').eq('club_id', clubId)), one(c.from('club_principles').select('*').eq('club_id', clubId)),
    one(c.from('category_objectives').select('*').eq('club_id', clubId)), one(c.from('club_templates').select('*').eq('club_id', clubId)),
    one(c.from('facilities').select('*').eq('club_id', clubId))
  ]);
  return { club: strip(club), seasons: seasons.map(strip), teams: teams.map(strip), players: players.map(strip), sessions: sessions.map(strip), task_library: task_library.map(strip),
    periodizations: periodizations.map(strip), macrocycles: macrocycles.map(strip), morphocycles: morphocycles.map(strip), matches: matches.map(strip),
    club_principles: club_principles.map(strip), category_objectives: category_objectives.map(strip), club_templates: club_templates.map(strip), facilities: facilities.map(strip) };
}

/** Copia completa. withImages: incluye las imágenes en base64. */
export async function buildBackup({ withImages = false, onProgress = () => {} } = {}) {
  const data = await collectClub();
  const backup = { app: 'ClubGestor', format: FORMAT, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), ...data };
  if (withImages) {
    const paths = imagePaths(backup);
    backup.images = {};
    let i = 0;
    for (const p of paths) {
      onProgress(++i, paths.length);
      const { data: blob } = await sb().storage.from('club-files').download(p);
      if (blob) backup.images[p] = { type: blob.type || 'image/jpeg', data: await toBase64(blob) };
    }
  }
  return backup;
}

const toBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
const fromBase64 = (b64, type) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };

export function downloadJSON(obj, name) {
  const text = JSON.stringify(obj);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const d = new Date();
  a.download = `${String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_')}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return text.length;
}

// ======================================================================= leer y validar
export async function readJSON(file) {
  if (file.size > MAX_BYTES) throw new Error(`El archivo pasa de ${MAX_BYTES / 1024 / 1024} MB.`);
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { throw new Error('No es un archivo JSON válido.'); }
  if (!obj || obj.app !== 'ClubGestor') throw new Error('No es una copia de Club Gestor.');
  if (obj.format !== FORMAT) throw new Error(`Formato ${esc0(obj.format)} no compatible (esta versión lee el ${FORMAT}).`);
  return obj;
}
const esc0 = (v) => String(v ?? '?').slice(0, 10);

/** Copia del club validada y saneada (lanza un error si no sirve). */
export function validateBackup(obj) {
  if (!obj.club || typeof obj.club !== 'object') throw new Error('A la copia le falta el club.');
  const b = { club: sanitize('club', obj.club), images: {} };
  for (const t of LISTS) {
    const list = obj[t] ?? [];
    if (!Array.isArray(list)) throw new Error(`«${t}» no es una lista.`);
    if (list.length > 20000) throw new Error(`Demasiados elementos en «${t}».`);
    b[t] = [];
    for (const row of list) { try { const r = sanitize(t, row); if (r.id) b[t].push(r); } catch { /* fila inválida: se descarta */ } }
  }
  // Relaciones: se descartan las filas que apuntan a algo que no está en la copia.
  const has = (t) => new Set(b[t].map((x) => x.id));
  const seasons = has('seasons');
  b.teams = b.teams.filter((t) => seasons.has(t.season_id));
  const teams = has('teams');
  for (const t of ['players', 'sessions', 'periodizations', 'macrocycles', 'morphocycles', 'matches']) b[t] = b[t].filter((r) => teams.has(r.team_id));
  for (const [k, v] of Object.entries(obj.images || {})) if (IMG_PATH.test(k) && v && typeof v.data === 'string' && /^image\/(jpeg|png|webp|gif)$/.test(v.type || 'image/jpeg')) b.images[k] = { type: v.type || 'image/jpeg', data: v.data };
  b.exportedAt = typeof obj.exportedAt === 'string' ? obj.exportedAt.slice(0, 30) : '';
  b.appVersion = String(obj.appVersion || '').slice(0, 20);
  return b;
}

/** Resumen para la pantalla: temporadas con sus equipos y recuentos. */
export function summary(b) {
  const count = (t, teamId) => b[t].filter((r) => r.team_id === teamId).length;
  return b.seasons.map((s) => ({ season: s, teams: b.teams.filter((t) => t.season_id === s.id).map((t) => ({ team: t, players: count('players', t.id), sessions: count('sessions', t.id), matches: count('matches', t.id) })) }));
}

// ======================================================================= restaurar
/** Cambia todos los id viejos por nuevos (también como claves de objetos) y las rutas de imágenes. */
function remap(v, map) {
  if (Array.isArray(v)) return v.map((x) => remap(x, map));
  if (v && typeof v === 'object') { const out = {}; for (const [k, x] of Object.entries(v)) out[map.get(k) ?? k] = remap(x, map); return out; }
  if (typeof v === 'string' && map.has(v)) return map.get(v);
  return v;
}
/** Imágenes: sube las incluidas en la copia; las que no vienen solo se conservan si son de este mismo club. */
async function restoreImages(b, clubId, map) {
  for (const p of imagePaths(b)) {
    const img = b.images[p];
    if (img) {
      const np = `${clubId}/restaurado/${crypto.randomUUID()}.${img.type === 'image/png' ? 'png' : 'jpg'}`;
      const { error } = await sb().storage.from('club-files').upload(np, fromBase64(img.data, img.type), { contentType: img.type, upsert: false });
      map.set(p, error ? null : np);
    } else if (!p.startsWith(clubId + '/')) map.set(p, null);
  }
}

async function insert(table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb().from(table).insert(rows.slice(i, i + 200));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
const newIds = (rows, map) => rows.forEach((r) => map.set(r.id, crypto.randomUUID()));
const withId = (r, map, extra = {}) => remap({ ...r, ...extra }, map);

/** Datos de un equipo de la copia (ya con id nuevos) para insertarlos en teamId / seasonId. */
async function insertTeamData(b, srcTeam, teamId, seasonId, map) {
  const of = (t) => b[t].filter((r) => r.team_id === srcTeam);
  for (const t of ['players', 'sessions', 'matches', 'macrocycles', 'morphocycles', 'periodizations']) newIds(of(t), map);
  map.set(srcTeam, teamId);
  await insert('players', of('players').map((r) => withId(r, map, { team_id: teamId })));
  await insert('sessions', of('sessions').map((r) => withId(r, map, { team_id: teamId })));
  await insert('matches', of('matches').map((r) => withId(r, map, { team_id: teamId, season_id: seasonId })));
  await insert('macrocycles', of('macrocycles').map((r) => withId(r, map, { team_id: teamId, season_id: seasonId })));
  await insert('morphocycles', of('morphocycles').map((r) => withId(r, map, { team_id: teamId })));
  await insert('periodizations', of('periodizations').slice(0, 1).map((r) => withId(r, map, { team_id: teamId, season_id: seasonId })));
}

/** Crea un club nuevo con toda la copia. Devuelve el id del club. */
export async function restoreAsNewClub(b, { name } = {}) {
  const c = sb();
  const map = new Map();
  const s0 = b.seasons.find((s) => s.is_current) || b.seasons[b.seasons.length - 1];
  const t0 = b.teams.find((t) => t.season_id === s0?.id);
  const { data: clubId, error } = await c.rpc('create_club', {
    p_name: (name || b.club.name).slice(0, 120), p_short_name: b.club.short_name, p_season_name: s0?.name || '2026/27', p_start_date: s0?.start_date || '2026-08-03',
    p_end_date: s0?.end_date || '2027-06-30', p_team_name: t0?.name || 'Primer equipo', p_category: t0?.category || '', p_modality: t0?.modality || 'f11',
    p_periods: t0?.periods || 2, p_period_minutes: t0?.period_minutes || 45
  });
  if (error) throw error;
  const [{ data: ns }, { data: nt }] = await Promise.all([c.from('seasons').select('id').eq('club_id', clubId).single(), c.from('teams').select('id').eq('club_id', clubId).single()]);
  if (s0) map.set(s0.id, ns.id);
  if (t0) map.set(t0.id, nt.id);
  await restoreImages(b, clubId, map);
  // Club: datos e identidad
  const { id: _c, ...club } = b.club;
  await c.from('clubs').update(remap({ ...club, name: (name || club.name).slice(0, 120) }, map)).eq('id', clubId);
  // Instalaciones y metodología del club
  for (const t of ['facilities', 'club_principles', 'task_library', 'category_objectives', 'club_templates']) newIds(b[t], map);
  await insert('facilities', b.facilities.map((r) => withId(r, map, { club_id: clubId })));
  const principles = b.club_principles.map((r) => withId(r, map, { club_id: clubId }));
  await insert('club_principles', principles.filter((r) => !r.parent_id));
  await insert('club_principles', principles.filter((r) => r.parent_id));
  await insert('task_library', b.task_library.map((r) => withId(r, map, { club_id: clubId, principle_id: map.get(r.principle_id) ?? null })));
  await insert('category_objectives', b.category_objectives.map((r) => withId(r, map, { club_id: clubId })));
  await insert('club_templates', b.club_templates.map((r) => withId(r, map, { club_id: clubId })));
  // Temporadas y equipos (la primera temporada y el primer equipo ya los creó create_club)
  for (const s of b.seasons) if (!map.has(s.id)) map.set(s.id, crypto.randomUUID());
  await insert('seasons', b.seasons.filter((s) => s !== s0).map((s) => withId(s, map, { club_id: clubId })));
  if (s0) await c.from('seasons').update(withId({ ...s0, id: undefined }, map)).eq('id', ns.id);
  for (const t of b.teams) if (!map.has(t.id)) map.set(t.id, crypto.randomUUID());
  await insert('teams', b.teams.filter((t) => t !== t0).map((t) => withId(t, map, { club_id: clubId, schedule: fixSchedule(t.schedule, map) })));
  if (t0) {
    await c.from('teams').update(withId({ ...t0, id: undefined, schedule: fixSchedule(t0.schedule, map) }, map)).eq('id', nt.id);
    if (b.morphocycles.some((m) => m.team_id === t0.id)) await c.from('morphocycles').delete().eq('team_id', nt.id);
  }
  for (const t of b.teams) await insertTeamData(b, t.id, map.get(t.id), map.get(t.season_id), map);
  return clubId;
}
/** El horario base solo conserva las instalaciones que existen en el club de destino. */
const fixSchedule = (sch, map) => (Array.isArray(sch) ? sch.map((x) => ({ ...x, facility_id: map.get(x.facility_id) || null })) : []);

/**
 * Sustituye los datos de un equipo de este club por los de un equipo de la copia
 * (plantilla, sesiones, partidos, macrociclos, morfociclos y periodización). El nombre del equipo se conserva.
 */
export async function replaceTeam(b, srcTeamId, target) {
  const c = sb();
  const src = b.teams.find((t) => t.id === srcTeamId);
  if (!src) throw new Error('Ese equipo no está en la copia.');
  const map = new Map();
  await restoreImages(b, S.club.id, map);
  for (const t of ['matches', 'sessions', 'macrocycles', 'morphocycles', 'players']) {
    const { error } = await c.from(t).delete().eq('team_id', target.id);
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  await c.from('periodizations').delete().eq('team_id', target.id).eq('season_id', target.season_id);
  const { error } = await c.from('teams').update({ category: src.category, modality: src.modality, periods: src.periods, period_minutes: src.period_minutes, squad_max: src.squad_max }).eq('id', target.id);
  if (error) throw error;
  map.set(src.season_id, target.season_id);
  await insertTeamData(b, src.id, target.id, target.season_id, map);
}

/**
 * Sustituye una temporada: cada equipo de la temporada de la copia va al equipo con el mismo nombre
 * de la temporada de destino (si no existe, se crea). Los demás equipos no se tocan.
 */
export async function replaceSeason(b, srcSeasonId, target) {
  const c = sb();
  const { data: existing, error } = await c.from('teams').select('id, name, season_id').eq('season_id', target.id);
  if (error) throw error;
  const done = [];
  for (const src of b.teams.filter((t) => t.season_id === srcSeasonId)) {
    let t = existing.find((x) => x.name.trim().toLowerCase() === src.name.trim().toLowerCase());
    if (!t) {
      const { data, error: e } = await c.from('teams').insert({ club_id: S.club.id, season_id: target.id, name: src.name, category: src.category, modality: src.modality, periods: src.periods, period_minutes: src.period_minutes, squad_max: src.squad_max, color: src.color }).select('id, name, season_id').single();
      if (e) throw e;
      t = data;
    }
    await replaceTeam(b, src.id, t);
    done.push(t.name);
  }
  return done;
}

// ======================================================================= un partido o una sesión
/** Un partido o una sesión para compartir con otro club: los jugadores van por nombre y dorsal. */
export function shareOne(kind, row, players, team) {
  const table = kind === 'match' ? 'matches' : 'sessions';
  const clean = sanitize(table, row);
  const people = players.filter((p) => JSON.stringify(row).includes(p.id)).map((p) => ({ id: p.id, number: p.number, name: p.name, position: p.position }));
  const { id, team_id, season_id, ...data } = clean;
  return { app: 'ClubGestor', format: FORMAT, kind, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), team: { name: team?.name || '', category: team?.category || '', modality: team?.modality || '' }, players: people, data };
}

/**
 * Importa un partido o una sesión compartidos en el equipo activo. Los jugadores se emparejan por nombre (o dorsal);
 * los que no están se quitan de la convocatoria, la asistencia y los eventos.
 * Devuelve { id, missing: [nombres] }.
 */
export async function importOne(obj, kind, team, players) {
  if (obj.kind !== kind) throw new Error(kind === 'match' ? 'Ese archivo no es un partido.' : 'Ese archivo no es una sesión.');
  const table = kind === 'match' ? 'matches' : 'sessions';
  const row = sanitize(table, obj.data || {});
  const map = new Map();
  const missing = [];
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  for (const p of Array.isArray(obj.players) ? obj.players : []) {
    if (!ref(p?.id)) continue;
    const hit = players.find((x) => norm(x.name) === norm(p.name)) || players.find((x) => x.active && p.number != null && x.number === p.number);
    if (hit) map.set(p.id, hit.id); else { map.set(p.id, null); missing.push(String(p.name || '').slice(0, 80)); }
  }
  const out = remap(row, map);
  delete out.id;
  // Quitar lo que apunta a jugadores que no existen aquí.
  if (kind === 'match') {
    out.squad = (out.squad || []).filter((s) => s?.player_id);
    out.events = (out.events || []).filter((e) => e?.type === 'goal_against' || e?.player_id).map((e) => ({ ...e, assist_id: e.assist_id || null, player_out_id: e.player_out_id || null }));
    for (const k of ['player_stats', 'positions']) out[k] = Object.fromEntries(Object.entries(out[k] || {}).filter(([id]) => id && id !== 'null'));
    if (out.post?.players) out.post.players = Object.fromEntries(Object.entries(out.post.players).filter(([id]) => id && id !== 'null'));
    if (out.post?.individual?.scores) out.post.individual.scores = Object.fromEntries(Object.entries(out.post.individual.scores).filter(([id]) => id && id !== 'null'));
    out.season_id = team.season_id;
  } else {
    out.attendance = Object.fromEntries(Object.entries(out.attendance || {}).filter(([id]) => id && id !== 'null'));
    out.blocks = (out.blocks || []).map((bl) => ({ ...bl, image_path: bl?.image_path && String(bl.image_path).startsWith(S.club.id + '/') ? bl.image_path : null }));
  }
  out.team_id = team.id;
  const { data, error } = await sb().from(table).insert(out).select('id').single();
  if (error) throw error;
  return { id: data.id, missing };
}
