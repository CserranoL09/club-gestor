// Pantalla de acceso provisional. El acceso real (Supabase Auth) llega con el Prompt 3.
import { isConfigured } from '../supabase.js';

export async function render(el) {
  el.innerHTML = `
    <div class="auth card">
      <h1>Entrar</h1>
      <p class="hint">${isConfigured
        ? 'Supabase está configurado. El acceso con cuentas se activa en el Prompt 3.'
        : 'Todavía no hay base de datos conectada. Puedes explorar la app en modo de prueba.'}</p>
      <form id="loginForm" novalidate>
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="email" disabled>
        <label for="pass">Contraseña</label>
        <input id="pass" type="password" autocomplete="current-password" disabled>
        <button class="btn primary" type="button" disabled>Entrar</button>
        <a class="btn" href="#/inicio">Seguir en modo de prueba</a>
      </form>
    </div>`;
}
