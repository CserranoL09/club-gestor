// Partidos: estado, local/visitante, sistemas tácticos y lectura del calendario pegado.

export const SYSTEMS = {
  f11: {
    '1-4-3-3': [[50, 92], [15, 72], [38, 75], [62, 75], [85, 72], [30, 50], [50, 54], [70, 50], [20, 24], [50, 20], [80, 24]],
    '1-4-4-2': [[50, 92], [15, 72], [38, 75], [62, 75], [85, 72], [15, 48], [38, 52], [62, 52], [85, 48], [38, 22], [62, 22]],
    '1-4-2-3-1': [[50, 92], [15, 72], [38, 75], [62, 75], [85, 72], [38, 57], [62, 57], [20, 37], [50, 36], [80, 37], [50, 17]],
    '1-3-5-2': [[50, 92], [28, 74], [50, 76], [72, 74], [10, 48], [30, 52], [50, 55], [70, 52], [90, 48], [38, 22], [62, 22]],
    '1-5-3-2': [[50, 92], [10, 68], [30, 74], [50, 76], [70, 74], [90, 68], [30, 50], [50, 52], [70, 50], [38, 24], [62, 24]]
  },
  f7: {
    '1-3-3': [[50, 90], [22, 68], [50, 72], [78, 68], [22, 32], [50, 28], [78, 32]],
    '1-2-3-1': [[50, 90], [33, 70], [67, 70], [18, 46], [50, 50], [82, 46], [50, 22]],
    '1-3-2-1': [[50, 90], [22, 70], [50, 73], [78, 70], [35, 46], [65, 46], [50, 22]]
  }
};
export const starters = (modality) => (modality === 'f7' ? 7 : 11);
export const squadMax = (team) => team?.squad_max || (team?.modality === 'f7' ? 14 : 18);

/** Estado: pendiente, convocado, jugado o con informe. */
export function matchStatus(m) {
  if (m.report_done) return ['informe', 'Con informe', 'ok'];
  if (m.goals_for != null && m.goals_against != null) return ['jugado', 'Jugado', 'info'];
  if ((m.squad || []).some((p) => p.called !== false)) return ['convocado', 'Convocado', 'warn'];
  return ['pendiente', 'Pendiente', ''];
}
/** [local, visitante] con el nombre del equipo puesto solo según is_home. */
export const sides = (m, teamName) => (m.is_home ? [teamName, m.rival || 'Rival'] : [m.rival || 'Rival', teamName]);
/** Resultado en orden local-visitante. */
export function score(m) {
  if (m.goals_for == null || m.goals_against == null) return '';
  return m.is_home ? `${m.goals_for} – ${m.goals_against}` : `${m.goals_against} – ${m.goals_for}`;
}

/**
 * Calendario pegado: «jornada;fecha;rival;casa|fuera[;hora]». Fecha dd/mm/aaaa o aaaa-mm-dd.
 * Devuelve [{ line, matchday, date, rival, is_home, time, error }].
 */
export function parseFixtures(text) {
  const out = [];
  for (const [i, raw] of String(text || '').split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const parts = (line.includes(';') ? line.split(';') : line.split('\t')).map((x) => x.trim());
    const [j, f, rival = '', where = '', hour = ''] = parts;
    const row = { line: i + 1, raw: line, matchday: null, date: null, rival: rival.slice(0, 80), is_home: true, time: null, error: '' };
    if (j && !/^\d{1,3}$/.test(j)) row.error = `Jornada «${j}» no válida`;
    else if (j) row.matchday = +j;
    let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(f || '');
    if (m) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      const d = new Date(y, +m[2] - 1, +m[1]);
      if (d.getMonth() === +m[2] - 1) row.date = `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    } else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f || ''))) row.date = f;
    if (!row.date) row.error ||= `Fecha «${f || ''}» no válida (dd/mm/aaaa)`;
    if (!row.rival) row.error ||= 'Falta el rival';
    const w = where.toLowerCase();
    if (/^(fuera|visitante|f|v|away)$/.test(w)) row.is_home = false;
    else if (w && !/^(casa|local|c|l|home)$/.test(w)) row.error ||= `«${where}»: escribe casa o fuera`;
    if (hour) {
      if (/^\d{1,2}[:.]\d{2}$/.test(hour)) row.time = hour.replace('.', ':').padStart(5, '0');
      else row.error ||= `Hora «${hour}» no válida`;
    }
    out.push(row);
  }
  return out;
}
