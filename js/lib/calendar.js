// Calendario del club: fechas locales, colores de equipo, solapes de instalaciones y exportación .ics.
import { mondayOf, addDays } from './dates.js';

export const SHORT_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const SHARES = [[4, 'Completo'], [2, '1/2 campo'], [1, '1/4 campo']];
export const FACILITY_KINDS = [['campo', 'Campo'], ['vestuario', 'Vestuario'], ['otro', 'Otra']];
export const TEAM_PALETTE = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#ec4899', '#6366f1', '#84cc16', '#06b6d4', '#f43f5e'];

/** Date → 'aaaa-mm-dd' en hora local. */
export function iso(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
/** 'aaaa-mm-dd' → Date local a las 00:00 (null si no es válida). */
export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** 'HH:MM[:SS]' → minutos desde las 00:00. */
export function mins(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : null;
}
/** minutos → 'HH:MM' (sin pasar de 23:59). */
export function hhmm(n) {
  const v = Math.max(0, Math.min(1439, Math.round(n)));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}
export const short = (t) => (t ? String(t).slice(0, 5) : '');
export const shareName = (s) => (SHARES.find(([k]) => k === +s) || SHARES[0])[1];

/** Color de un equipo: el suyo o uno de la paleta según su posición en la temporada. */
export function teamColor(team, index = 0) {
  return team?.color || TEAM_PALETTE[Math.abs(index) % TEAM_PALETTE.length];
}

/** Rango que se pinta: semana (lunes a domingo) o mes (semanas completas). */
export function rangeOf(view, date) {
  if (view === 'mes') {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { from: mondayOf(first), to: addDays(mondayOf(last), 6) };
  }
  const from = mondayOf(date);
  return { from, to: addDays(from, 6) };
}

/** Fin de un partido: partes × minutos + 15 de descanso. */
export function matchEnd(time, team) {
  const s = mins(time);
  return s == null ? null : hhmm(s + (team?.periods || 2) * (team?.period_minutes || 45) + 15);
}

/**
 * Solapes: una instalación tiene 4 cuartos. Para cada reserva calcula la ocupación máxima
 * de su instalación durante su franja; si pasa de 4, está en conflicto.
 * bookings: [{ id, facility_id, date, start_time, end_time, share }]
 * Devuelve Map(id → { load, with: [ids de las reservas que coinciden] }).
 */
export function findConflicts(bookings) {
  const groups = new Map();
  for (const b of bookings) {
    const k = `${b.facility_id}|${b.date}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ ...b, s: mins(b.start_time), e: mins(b.end_time), share: +b.share || 4 });
  }
  const out = new Map();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const b of list) {
      const others = list.filter((o) => o.id !== b.id && o.s < b.e && b.s < o.e);
      if (!others.length) continue;
      // La ocupación máxima se alcanza al empezar alguna de las reservas que coinciden.
      const points = [b.s, ...others.map((o) => o.s).filter((p) => p > b.s && p < b.e)];
      let load = 0;
      for (const p of points) {
        load = Math.max(load, b.share + others.filter((o) => o.s <= p && p < o.e).reduce((n, o) => n + o.share, 0));
      }
      if (load > 4) out.set(b.id, { load, with: others.map((o) => o.id) });
    }
  }
  return out;
}

/** Solapes del horario base: cada franja como reserva en una semana ficticia. */
export function scheduleConflicts(teams) {
  const rows = [];
  for (const t of teams) {
    (t.schedule || []).forEach((s, i) => {
      if (s.facility_id) rows.push({ id: `${t.id}#${i}`, team: t, slot: s, facility_id: s.facility_id, date: String(s.day), start_time: s.start, end_time: s.end, share: s.share || 4 });
    });
  }
  const c = findConflicts(rows);
  return rows.filter((r) => c.has(r.id)).map((r) => ({ ...r, with: c.get(r.id).with.map((id) => rows.find((x) => x.id === id)) }));
}

// ---------------------------------------------------------------------
// Exportación .ics (Google Calendar, Outlook, Apple)
// ---------------------------------------------------------------------
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  // Líneas de 75 octetos como máximo (RFC 5545); se corta por caracteres para no partir letras.
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Madrid',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'
];

/**
 * events: [{ uid, date 'aaaa-mm-dd', start 'HH:MM'|null, end 'HH:MM'|null, summary, location, description }]
 * Sin hora → evento de día completo.
 */
export function buildICS(events, calName = 'Club Gestor') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const d8 = (s) => s.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Club Gestor//Calendario//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(calName)}`, 'X-WR-TIMEZONE:Europe/Madrid', ...VTIMEZONE];
  for (const ev of events) {
    lines.push('BEGIN:VEVENT', `UID:${ev.uid}@clubgestor`, `DTSTAMP:${stamp}`);
    if (ev.start) {
      const end = ev.end && mins(ev.end) > mins(ev.start) ? ev.end : hhmm(mins(ev.start) + 90);
      lines.push(`DTSTART;TZID=Europe/Madrid:${d8(ev.date)}T${ev.start.replace(':', '').slice(0, 4)}00`,
        `DTEND;TZID=Europe/Madrid:${d8(ev.date)}T${end.replace(':', '').slice(0, 4)}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d8(ev.date)}`, `DTEND;VALUE=DATE:${d8(iso(addDays(parseISO(ev.date), 1)))}`);
    }
    lines.push(`SUMMARY:${icsText(ev.summary)}`);
    if (ev.location) lines.push(`LOCATION:${icsText(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${icsText(ev.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
