// Cliente único de Supabase. Si js/config.js sigue con valores de ejemplo, no se carga la librería.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL) &&
  !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('TU-');

let client = null;

export async function getClient() {
  if (!isConfigured) return null;
  if (client) return client;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return client;
}

// Comprueba que el servidor responde (sin depender de que existan tablas).
export async function checkConnection() {
  if (!isConfigured) return 'sin-configurar';
  try {
    const res = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/health', {
      headers: { apikey: SUPABASE_ANON_KEY }
    });
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}
