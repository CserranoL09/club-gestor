-- =====================================================================
-- Club Gestor · Pruebas de seguridad
-- Pega este archivo en el SQL Editor de Supabase y pulsa Run.
-- Crea usuarios de prueba temporales, comprueba los permisos y los borra al terminar.
-- Resultado esperado: una tabla en la que TODAS las filas dicen «OK».
-- =====================================================================

drop table if exists pg_temp.cg_resultados;
create temp table cg_resultados (n int, prueba text, resultado text);

do $$
declare
  sfx   text := substr(md5(random()::text), 1, 8);
  u_a   uuid := gen_random_uuid();   -- alumno A, admin del club A
  u_b   uuid := gen_random_uuid();   -- alumno B, admin del club B
  u_e   uuid := gen_random_uuid();   -- entrenador del club A (solo equipo A2)
  u_p   uuid := gen_random_uuid();   -- preparador del club A
  u_t   uuid := gen_random_uuid();   -- profesor
  u_k   uuid := gen_random_uuid();   -- coordinación del club A (solo equipo A1)
  u_y   uuid := gen_random_uuid();   -- 2.º entrenador / delegado del equipo A1
  c_a uuid; c_b uuid; s_a uuid; t_a1 uuid; t_a2 uuid; t_b uuid;
  cls uuid; code text; tok text; tok_p text; cmt uuid; ses uuid;
  n_ int; ok_ boolean; cnt int; s_new uuid; tok_k text; tok_y text; m_a1 uuid; ok_name_dummy text;
  names text[] := '{}'; oks boolean[] := '{}';
begin
  -- Usuarios de prueba (como si se hubieran registrado)
  insert into auth.users (id, email, raw_user_meta_data) values
    (u_a, 'a-' || sfx || '@prueba.clubgestor', '{"full_name":"Alumno A"}'),
    (u_b, 'b-' || sfx || '@prueba.clubgestor', '{"full_name":"Alumno B"}'),
    (u_e, 'e-' || sfx || '@prueba.clubgestor', '{"full_name":"Entrenador E"}'),
    (u_p, 'p-' || sfx || '@prueba.clubgestor', '{"full_name":"Preparador P"}'),
    (u_t, 't-' || sfx || '@prueba.clubgestor', '{"full_name":"Profesor T"}'),
    (u_k, 'k-' || sfx || '@prueba.clubgestor', '{"full_name":"Coordinadora K"}'),
    (u_y, 'y-' || sfx || '@prueba.clubgestor', '{"full_name":"Delegado Y"}');

  -- ---------- Alumno A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  c_a := public.create_club('Club A ' || sfx, 'CLA', '2026/27', '2026-08-03', '2027-06-30', 'Infantil A', 'Infantil', 'f7', 2, 35);
  select count(*) into cnt from public.clubs;
  names := names || 'El alumno A crea su club y solo ve ese club'::text; oks := oks || (cnt = 1);
  select count(*) into cnt from public.morphocycles m join public.teams t on t.id = m.team_id where t.club_id = c_a and m.is_default;
  names := names || 'Al crear el club se crea el morfociclo estándar'::text; oks := oks || (cnt = 1);

  select id into s_a from public.seasons where club_id = c_a;
  select id into t_a1 from public.teams where club_id = c_a;
  insert into public.teams (club_id, season_id, name, modality) values (c_a, s_a, 'Infantil B', 'f7') returning id into t_a2;
  names := names || 'El admin crea un segundo equipo'::text; oks := oks || (t_a2 is not null);

  insert into public.players (team_id, number, name) values (t_a1, 7, 'Pedro');
  names := names || 'El admin añade jugadores'::text; oks := oks || true;

  begin
    insert into public.players (team_id, number, name) values (t_a1, 7, 'Repetido');
    ok_ := false;
  exception when unique_violation then ok_ := true;
  end;
  names := names || 'No se puede repetir dorsal en el mismo equipo'::text; oks := oks || ok_;

  insert into public.invitations (club_id, role, team_ids) values (c_a, 'entrenador', array[t_a2]) returning token into tok;
  insert into public.invitations (club_id, role) values (c_a, 'preparador') returning token into tok_p;

  begin
    delete from public.club_members where club_id = c_a and user_id = u_a;
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'El último admin no puede salir del club'::text; oks := oks || ok_;

  -- ---------- Alumno B ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  c_b := public.create_club('Club B ' || sfx);
  select id into t_b from public.teams where club_id = c_b;

  select count(*) into cnt from public.clubs where id = c_a;
  names := names || 'B no ve el club de A'::text; oks := oks || (cnt = 0);
  select count(*) into cnt from public.players where team_id = t_a1;
  names := names || 'B no ve los jugadores de A'::text; oks := oks || (cnt = 0);

  update public.clubs set name = 'Hackeado' where id = c_a;
  get diagnostics n_ = row_count;
  names := names || 'B no puede cambiar el club de A'::text; oks := oks || (n_ = 0);

  begin
    insert into public.players (team_id, number, name) values (t_a1, 9, 'Intruso');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'B no puede añadir jugadores al equipo de A'::text; oks := oks || ok_;

  begin
    insert into public.classes (name) values ('Clase falsa');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Quien no es profesor no puede crear clases'::text; oks := oks || ok_;

  names := names || 'B no puede ver archivos del club de A'::text; oks := oks || not public.can_read_club(public.storage_club(c_a || '/crest.png'));

  -- ---------- Entrenador E (invitado solo al equipo A2) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  perform public.accept_invitation(tok);
  select count(*) into cnt from public.club_members where club_id = c_a and user_id = u_e and role = 'entrenador';
  names := names || 'E acepta la invitación y entra como entrenador'::text; oks := oks || (cnt = 1);

  begin
    perform public.accept_invitation(tok);
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Una invitación no se puede usar dos veces'::text; oks := oks || ok_;

  insert into public.matches (team_id, season_id, matchday, rival) values (t_a2, s_a, 1, 'Rival');
  names := names || 'E crea partidos en su equipo (A2)'::text; oks := oks || true;

  begin
    insert into public.matches (team_id, season_id, matchday, rival) values (t_a1, s_a, 1, 'Rival');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'E no puede crear partidos en un equipo que no es suyo (A1)'::text; oks := oks || ok_;

  update public.clubs set name = 'Cambio' where id = c_a;
  get diagnostics n_ = row_count;
  names := names || 'E no puede cambiar la configuración del club'::text; oks := oks || (n_ = 0);

  update public.club_members set role = 'admin' where club_id = c_a and user_id = u_e;
  get diagnostics n_ = row_count;
  names := names || 'E no puede subirse a administrador'::text; oks := oks || (n_ = 0);

  begin
    perform public.copy_season(s_a, '2027/28', '2027-08-02', '2028-06-30', true, false);
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'E no puede crear una temporada nueva'::text; oks := oks || ok_;

  -- A copia la temporada: equipos, plantilla y asignaciones de E
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  s_new := public.copy_season(s_a, '2027/28', '2027-08-02', '2028-06-30', true, true);
  select count(*) into cnt from public.teams where season_id = s_new;
  names := names || 'Nueva temporada: se copian los equipos'::text; oks := oks || (cnt = 2);
  select count(*) into cnt from public.players p join public.teams t on t.id = p.team_id where t.season_id = s_new;
  names := names || 'Nueva temporada: se copia la plantilla'::text; oks := oks || (cnt = 1);
  select cardinality(team_ids) into cnt from public.club_members where club_id = c_a and user_id = u_e;
  names := names || 'Nueva temporada: el entrenador conserva su equipo en la copia'::text; oks := oks || (cnt = 2);
  select count(*) into cnt from public.seasons where club_id = c_a and is_current;
  names := names || 'Nueva temporada: solo una temporada actual'::text; oks := oks || (cnt = 1);

  -- ---------- Preparador P ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_p, 'role', 'authenticated')::text, true);
  perform public.accept_invitation(tok_p);
  insert into public.sessions (team_id, date) values (t_a1, '2026-09-01') returning id into ses;
  names := names || 'El preparador crea sesiones'::text; oks := oks || (ses is not null);

  begin
    insert into public.matches (team_id, season_id, matchday) values (t_a1, s_a, 2);
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'El preparador no puede crear partidos'::text; oks := oks || ok_;

  update public.players set name = 'Cambio' where team_id = t_a1;
  get diagnostics n_ = row_count;
  names := names || 'El preparador no puede editar la plantilla'::text; oks := oks || (n_ = 0);

  delete from public.sessions where id = ses;
  get diagnostics n_ = row_count;
  names := names || 'El preparador no puede borrar sesiones'::text; oks := oks || (n_ = 0);

  -- ---------- Profesor T ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_t, 'role', 'authenticated')::text, true);
  update public.profiles set is_teacher = true where id = u_t;
  insert into public.classes (name) values ('Curso de entrenador') returning id, join_code into cls, code;
  names := names || 'El profesor crea una clase con código de 6 caracteres'::text; oks := oks || (length(code) = 6);

  select count(*) into cnt from public.clubs where id = c_a;
  names := names || 'Antes de unirse, el profesor no ve el club de A'::text; oks := oks || (cnt = 0);

  -- A une su club a la clase
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  perform public.join_class(code, c_a);

  perform set_config('request.jwt.claims', json_build_object('sub', u_t, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.players where team_id = t_a1;
  names := names || 'El profesor ve los datos del club de su alumno'::text; oks := oks || (cnt = 1);
  select count(*) into cnt from public.clubs where id = c_b;
  names := names || 'El profesor no ve clubes que no están en su clase'::text; oks := oks || (cnt = 0);

  update public.players set name = 'Cambio' where team_id = t_a1;
  get diagnostics n_ = row_count;
  names := names || 'El profesor no puede editar datos del alumno'::text; oks := oks || (n_ = 0);

  begin
    insert into public.sessions (team_id, date) values (t_a1, '2026-09-02');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'El profesor no puede crear sesiones en el club del alumno'::text; oks := oks || ok_;

  insert into public.comments (club_id, entity, section, text) values (c_a, 'club', 'general', 'Buen trabajo') returning id into cmt;
  names := names || 'El profesor deja comentarios'::text; oks := oks || (cmt is not null);

  -- A marca el comentario como resuelto, pero no puede cambiar su texto
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  update public.comments set resolved = true where id = cmt;
  get diagnostics n_ = row_count;
  names := names || 'El alumno marca el comentario como resuelto'::text; oks := oks || (n_ = 1);
  begin
    update public.comments set text = 'Cambiado' where id = cmt;
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'El alumno no puede cambiar el texto del profesor'::text; oks := oks || ok_;

  -- ---------- Perfiles de club (v0.5.0) ----------
  -- A (Dirección) prepara: comentario en el equipo A1, un partido en A1 e invitaciones
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  insert into public.comments (club_id, team_id, entity, section, text) values (c_a, t_a1, 'team', 'general', 'Nota para A1');
  insert into public.matches (team_id, season_id, matchday, rival) values (t_a1, s_a, 3, 'Rival A1') returning id into m_a1;
  insert into public.invitations (club_id, role, team_ids) values (c_a, 'coordinador', array[t_a1]) returning token into tok_k;
  insert into public.invitations (club_id, role, team_ids, specialty) values (c_a, 'ayudante', array[t_a1], 'Delegado') returning token into tok_y;

  -- E (entrenador de A2) solo ve su equipo
  perform set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.players where team_id = t_a1;
  names := names || 'Entrenador: no ve los jugadores de otro equipo del club'::text; oks := oks || (cnt = 0);
  select count(*) into cnt from public.comments where team_id = t_a1;
  names := names || 'Entrenador: no ve los comentarios de otro equipo'::text; oks := oks || (cnt = 0);
  select count(*) into cnt from public.teams where club_id = c_a;
  names := names || 'Entrenador: sí ve la lista de equipos del club'::text; oks := oks || (cnt >= 2);

  -- Con «los entrenadores pueden ver los demás equipos»
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  update public.clubs set settings = '{"coaches_see_all": true}' where id = c_a;
  perform set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.players where team_id = t_a1;
  names := names || 'Ajuste del club activado: el entrenador ve los demás equipos'::text; oks := oks || (cnt = 1);
  update public.players set name = 'Cambio' where team_id = t_a1;
  get diagnostics n_ = row_count;
  names := names || 'Ajuste del club activado: verlos no permite editarlos'::text; oks := oks || (n_ = 0);
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  update public.clubs set settings = '{}' where id = c_a;

  -- K (Coordinación de A1)
  perform set_config('request.jwt.claims', json_build_object('sub', u_k, 'role', 'authenticated')::text, true);
  perform public.accept_invitation(tok_k);
  select count(*) into cnt from public.players where team_id = t_a1;
  names := names || 'Coordinación: ve los jugadores de su equipo'::text; oks := oks || (cnt = 1);
  select count(*) into cnt from public.matches where team_id = t_a2;
  names := names || 'Coordinación: no ve equipos que no coordina'::text; oks := oks || (cnt = 0);
  update public.players set name = 'Cambio' where team_id = t_a1;
  get diagnostics n_ = row_count;
  names := names || 'Coordinación: no edita el trabajo del entrenador'::text; oks := oks || (n_ = 0);
  insert into public.comments (club_id, team_id, entity, section, text) values (c_a, t_a1, 'team', 'general', 'Comentario de coordinación');
  names := names || 'Coordinación: comenta en su equipo'::text; oks := oks || true;
  begin
    insert into public.comments (club_id, team_id, entity, section, text) values (c_a, t_a2, 'team', 'general', 'No debería');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Coordinación: no comenta en equipos que no coordina'::text; oks := oks || ok_;
  insert into public.invitations (club_id, role, team_ids) values (c_a, 'entrenador', array[t_a1]);
  names := names || 'Coordinación: invita a un entrenador a su equipo'::text; oks := oks || true;
  begin
    insert into public.invitations (club_id, role, team_ids) values (c_a, 'entrenador', array[t_a2]);
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Coordinación: no invita a equipos que no coordina'::text; oks := oks || ok_;
  begin
    insert into public.invitations (club_id, role) values (c_a, 'admin');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Coordinación: no puede invitar a la Dirección'::text; oks := oks || ok_;
  select count(*) into cnt from public.invitations where club_id = c_a;
  names := names || 'Coordinación: solo ve sus invitaciones'::text; oks := oks || (cnt = 1);
  update public.clubs set name = 'Cambio' where id = c_a;
  get diagnostics n_ = row_count;
  names := names || 'Coordinación: no cambia la configuración del club'::text; oks := oks || (n_ = 0);

  -- Y (2.º entrenador / delegado de A1)
  perform set_config('request.jwt.claims', json_build_object('sub', u_y, 'role', 'authenticated')::text, true);
  perform public.accept_invitation(tok_y);
  select specialty into ok_name_dummy from public.club_members where club_id = c_a and user_id = u_y;
  names := names || 'Delegado: se guarda su especialidad'::text; oks := oks || (ok_name_dummy = 'Delegado');
  insert into public.sessions (team_id, date) values (t_a1, '2026-09-03');
  names := names || 'Delegado: crea sesiones de su equipo'::text; oks := oks || true;
  update public.matches set notes = 'Acta' where id = m_a1;
  get diagnostics n_ = row_count;
  names := names || 'Delegado: rellena el acta del partido'::text; oks := oks || (n_ = 1);
  begin
    insert into public.matches (team_id, season_id, matchday) values (t_a1, s_a, 9);
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Delegado: no crea partidos'::text; oks := oks || ok_;
  select count(*) into cnt from public.players where team_id = t_a2;
  names := names || 'Delegado: no ve otros equipos'::text; oks := oks || (cnt = 0);

  -- El profesor sigue viendo todo el club de su alumno
  perform set_config('request.jwt.claims', json_build_object('sub', u_t, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.comments where club_id = c_a and team_id = t_a1;
  names := names || 'Profesor: ve los comentarios de todos los equipos'::text; oks := oks || (cnt = 2);

  -- ---------- Sin sesión ----------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin
    select count(*) into cnt from public.clubs;
    ok_ := false;
  exception when insufficient_privilege then ok_ := true;
  end;
  names := names || 'Sin iniciar sesión no se puede leer nada'::text; oks := oks || ok_;

  -- ---------- Limpieza ----------
  execute 'reset role';
  delete from public.clubs where id in (c_a, c_b);
  delete from auth.users where id in (u_a, u_b, u_e, u_p, u_t, u_k, u_y);

  for i in 1 .. array_length(names, 1) loop
    insert into cg_resultados values (i, names[i], case when oks[i] then 'OK' else 'FALLO' end);
  end loop;
end $$;

select n as "Nº", prueba as "Prueba", resultado as "Resultado" from cg_resultados order by n;
