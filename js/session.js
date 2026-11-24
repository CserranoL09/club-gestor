// Sesión del usuario: cuenta, perfil, clubes, temporada y equipo activos, y permisos.
// Los permisos de aquí solo deciden qué se muestra; la seguridad real la da RLS en Supabase.
import { getClient, isConfigured } from './supabase.js';
import { getCtx, setCtx, clearCtx } from './store.js';

export const ROLE_LABEL = {
  admin: 'Administrador',
  entrenador: 'Entrenador',
  preparador: 'Preparador físico',
  porteros: 'Entrenador de porteros'
};
export const ROLES = Object.keys(ROLE_LABEL);

export const S = {
  ready: false,
  user: null,          // cuenta de Supabase Auth
  profile: null,       // { full_name, is_teacher, email }
  memberships: [],     // [{ role, team_ids, club }]
  member: null,        // membresía del club activo
  club: null,
  seasons: [],
  teams: [],           // equipos del club (todas las temporadas)
  season: null,
  team: null,
  crestUrl: '',
  authNotice: '',      // mensaje que llega en un enlace de email caducado, etc.
  recovery: false      // se ha abierto un enlace de «recuperar contraseña»
};

const bus = new EventTarget();
/** Avisa cuando cambia la sesión o el contexto (club, temporada, equipo). */
export function onChange(fn) { bus.addEventListener('change', fn); }
function emit() { bus.dispatchEvent(new Event('change')); }

let sb = null;
const PENDING_INVITE = 'clubgestor:pendingInvite';

/** Dirección a la que vuelven los enlaces de los emails. */
export function appBaseUrl() {
  return location.origin + location.pathname;
}

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
export async function initAuth() {
  if (!isConfigured) { S.ready = true; return; }

  // Leer el # antes de que lo limpie la librería.
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hash.get('type') === 'recovery') S.recovery = true;
  if (hash.get('error') || hash.get('error_code')) {
    S.authNotice = authLinkError(hash.get('error_code'), hash.get('error_description'));
    history.replaceState(null, '', location.pathname + location.search + '#/login');
  }

  sb = await getClient();
  const { data } = await sb.auth.getSession();
  S.user = data.session?.user || null;
  if (S.user) await loadUserData();

  sb.auth.onAuthStateChange((event, session) => {
    // No llamar a Supabase dentro de este callback: se hace en el siguiente ciclo.
    setTimeout(async () => {
      if (event === 'PASSWORD_RECOVERY') S.recovery = true;
      const uid = session?.user?.id || null;
      if (uid === (S.user?.id || null)) {
        if (session?.user) S.user = session.user;
        if (event === 'PASSWORD_RECOVERY') emit();
        return;
      }
      S.user = session?.user || null;
      if (S.user) await loadUserData(); else resetData();
      emit();
    }, 0);
  });
  S.ready = true;
}

function authLinkError(code, desc) {
  if (code === 'otp_expired') return 'El enlace del email ha caducado o ya se ha usado. Pide uno nuevo.';
  if (code === 'access_denied') return 'No se ha podido entrar con ese enlace. Pide uno nuevo.';
  return 'No se ha podido usar el enlace del email' + (desc ? ': ' + desc.replace(/\+/g, ' ') : '.');
}

function resetData() {
  Object.assign(S, { profile: null, memberships: [], member: null, club: null, seasons: [], teams: [], season: null, team: null, crestUrl: '' });
}

// ---------------------------------------------------------------------
// Datos del usuario y del club activo
// ---------------------------------------------------------------------
export async function loadUserData() {
  const uid = S.user.id;
  const [prof, mems] = await Promise.all([
    sb.from('profiles').select('id, full_name, is_teacher, email').eq('id', uid).maybeSingle(),
    sb.from('club_members').select('role, team_ids, club:clubs(*)').eq('user_id', uid)
  ]);
  if (prof.error) throw prof.error;
  if (mems.error) throw mems.error;
  S.profile = prof.data || { id: uid, full_name: '', is_teacher: false, email: S.user.email };
  S.memberships = (mems.data || []).filter((m) => m.club)
    .sort((a, b) => a.club.name.localeCompare(b.club.name, 'es'));

  const wanted = getCtx().clubId;
  const first = S.memberships.find((m) => m.club.id === wanted) || S.memberships[0];
  if (first) await selectClub(first.club.id, { silent: true });
  else { Object.assign(S, { member: null, club: null, seasons: [], teams: [], season: null, team: null, crestUrl: '' }); }
}

export async function selectClub(clubId, { silent = false } = {}) {
  const m = S.memberships.find((x) => x.club.id === clubId);
  if (!m) return;
  S.member = m;
  S.club = m.club;
  const [seasons, teams] = await Promise.all([
    sb.from('seasons').select('*').eq('club_id', clubId).order('start_date', { ascending: false }),
    sb.from('teams').select('*').eq('club_id', clubId).eq('archived', false).order('name')
  ]);
  if (seasons.error) throw seasons.error;
  if (teams.error) throw teams.error;
  S.seasons = (seasons.data || []).filter((s) => !s.archived);
  S.teams = teams.data || [];

  const ctx = getCtx();
  const sameClub = ctx.clubId === clubId;
  S.season = (sameClub && S.seasons.find((s) => s.id === ctx.seasonId))
    || S.seasons.find((s) => s.is_current) || S.seasons[0] || null;
  pickTeam(sameClub ? ctx.teamId : null);

  S.crestUrl = '';
  if (S.club.crest_path) {
    const { data } = await sb.storage.from('club-files').createSignedUrl(S.club.crest_path, 3600);
    S.crestUrl = data?.signedUrl || '';
  }
  saveCtx();
  if (!silent) emit();
}

function pickTeam(wantedId) {
  const list = teamsOfSeason();
  const mine = list.filter((t) => isMyTeam(t.id));
  S.team = list.find((t) => t.id === wantedId) || mine[0] || list[0] || null;
}

export function teamsOfSeason() {
  return S.season ? S.teams.filter((t) => t.season_id === S.season.id) : [];
}

export function selectSeason(seasonId) {
  S.season = S.seasons.find((s) => s.id === seasonId) || S.season;
  pickTeam(null);
  saveCtx();
  emit();
}

export function selectTeam(teamId) {
  S.team = S.teams.find((t) => t.id === teamId) || S.team;
  saveCtx();
  emit();
}

function saveCtx() {
  setCtx({ clubId: S.club?.id || null, seasonId: S.season?.id || null, teamId: S.team?.id || null });
}

/** Volver a leer todo (después de crear un club, aceptar una invitación, etc.). */
export async function refresh(clubId) {
  if (clubId) setCtx({ clubId, seasonId: null, teamId: null });
  await loadUserData();
  emit();
}

export async function signOut() {
  try { await sb?.auth.signOut(); } catch { /* sin conexión: se cierra igualmente en este navegador */ }
  S.user = null;
  resetData();
  clearCtx();
  emit();
}

// ---------------------------------------------------------------------
// Invitación pendiente (si se abre el enlace sin haber entrado)
// ---------------------------------------------------------------------
export function setPendingInvite(token) {
  try { localStorage.setItem(PENDING_INVITE, token); } catch { /* sin almacenamiento */ }
}
export function takePendingInvite() {
  try {
    const t = localStorage.getItem(PENDING_INVITE);
    localStorage.removeItem(PENDING_INVITE);
    return t;
  } catch { return null; }
}

// ---------------------------------------------------------------------
// Permisos (para la interfaz)
// ---------------------------------------------------------------------
export function isAdmin() { return S.member?.role === 'admin'; }
export function isTeacher() { return !!S.profile?.is_teacher; }

function hasTeam(teamId, roles) {
  const m = S.member;
  if (!m || !teamId || !roles.includes(m.role)) return false;
  return !m.team_ids?.length || m.team_ids.includes(teamId);
}
export function isMyTeam(teamId) { return isAdmin() || hasTeam(teamId, ['entrenador', 'preparador', 'porteros']); }
export function canEditTeam(teamId = S.team?.id) { return isAdmin() || hasTeam(teamId, ['entrenador']); }
export function canPlanTeam(teamId = S.team?.id) { return canEditTeam(teamId) || hasTeam(teamId, ['preparador', 'porteros']); }

/** ¿Puede el usuario hacer esto? Devuelve { ok, reason } para explicarlo en la interfaz. */
export function permission(kind) {
  if (!isConfigured) return { ok: true, reason: '' };
  if (!S.member) return { ok: false, reason: 'Todavía no perteneces a ningún club.' };
  const team = S.team?.name ? ` (${S.team.name})` : '';
  switch (kind) {
    case 'admin':
      return isAdmin() ? { ok: true, reason: '' }
        : { ok: false, reason: 'Solo el administrador del club puede cambiar esto.' };
    case 'edit':
      return canEditTeam() ? { ok: true, reason: '' }
        : { ok: false, reason: `Solo el administrador o el entrenador de este equipo${team} pueden editar esto.` };
    case 'plan':
      return canPlanTeam() ? { ok: true, reason: '' }
        : { ok: false, reason: `Solo el cuerpo técnico de este equipo${team} puede editar esto.` };
    default:
      return { ok: true, reason: '' };
  }
}

export function roleLabel(role = S.member?.role) { return ROLE_LABEL[role] || ''; }
