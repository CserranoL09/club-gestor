// Cliente único de Supabase. Si js/config.js sigue con valores de ejemplo, no se carga la librería.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

export const isConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL) &&
  !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('TU-');

let client = null;

export async function getClient() {
  if (!isConfigured) return null;
  if (client) return client;
  const { createClient } = await import(SUPABASE_JS_URL);
  client = createClient(SUPABASE_URL.replace(/\/$/, ''), SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Los enlaces de email (confirmar cuenta, enlace mágico, recuperar contraseña)
      // llegan con los datos en el #. La librería los lee y limpia la URL al arrancar.
      detectSessionInUrl: true,
      flowType: 'implicit',
      storageKey: 'clubgestor-auth'
    }
  });
  return client;
}

/** Cliente ya creado (después de initAuth). */
export function sb() {
  if (!client) throw new Error('Supabase no está listo.');
  return client;
}

// Estado de la conexión:
//  'sin-configurar' → js/config.js con valores de ejemplo
//  'error'          → Supabase no responde (sin internet, proyecto pausado o datos mal copiados)
//  'falta-sql'      → Supabase responde pero aún no se ha pegado supabase/instalar.sql
//  'ok'             → todo listo
export async function checkConnection() {
  if (!isConfigured) return 'sin-configurar';
  const base = SUPABASE_URL.replace(/\/$/, '');
  const headers = { apikey: SUPABASE_ANON_KEY };
  try {
    const health = await fetch(base + '/auth/v1/health', { headers });
    if (!health.ok) return 'error';
    // Sin sesión la tabla responde «sin permiso» (401/403) si existe y 404 si falta instalarla.
    const table = await fetch(base + '/rest/v1/clubs?select=id&limit=1', { headers });
    return table.status === 404 ? 'falta-sql' : 'ok';
  } catch {
    return 'error';
  }
}
