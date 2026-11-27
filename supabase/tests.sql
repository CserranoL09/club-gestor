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
  n_ int; ok_ boolean; cnt int; s_new uuid; tok_k text; tok_y text; m_a1 uuid; ok_name_dummy text; t_new uuid; tok_t text; c_root uuid; pr uuid; tk uuid; tpl uuid; t_tpl uuid; st text; fac uuid; vest uuid; mon date; bk uuid; ses_g uuid; m_g uuid; pl uuid; js jsonb; ses_l uuid; mc uuid;
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

  -- ---------- Panel del profesor (Prompt 17) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_t, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.class_overview(cls) where club_id = c_a;
  names := names || 'Panel del profesor: ve el resumen del club de su alumno'::text; oks := oks || (cnt = 1);
  select count(*) into cnt from public.class_overview(cls) where club_id = c_b;
  names := names || 'Panel del profesor: no salen clubes de fuera de la clase'::text; oks := oks || (cnt = 0);
  update public.clubs set name = 'Cambiado' where id = c_a;
  get diagnostics n_ = row_count;
  names := names || 'El profesor no puede cambiar el club del alumno'::text; oks := oks || (n_ = 0);
  update public.matches set rival = 'Cambiado' where team_id = t_a1;
  get diagnostics n_ = row_count;
  update public.sessions set notes = 'Cambiado' where team_id = t_a1;
  get diagnostics cnt = row_count;
  names := names || 'El profesor no puede editar partidos ni sesiones del alumno'::text; oks := oks || (n_ = 0 and cnt = 0);
  delete from public.players where team_id = t_a1;
  get diagnostics n_ = row_count;
  names := names || 'El profesor no puede borrar datos del alumno'::text; oks := oks || (n_ = 0);
  begin
    insert into public.club_members (club_id, user_id, role) values (c_a, u_t, 'admin');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'El profesor no puede hacerse miembro del club del alumno'::text; oks := oks || ok_;
  -- Otra persona no ve el resumen de la clase ni cambia su código
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.class_overview(cls);
  names := names || 'Panel del profesor: nadie más ve el resumen de la clase'::text; oks := oks || (cnt = 0);
  begin
    perform public.regenerate_join_code(cls);
    ok_ := false;
  exception when others then ok_ := true;
  end;
  update public.classes set name = 'Robada' where id = cls;
  get diagnostics n_ = row_count;
  names := names || 'Nadie más renombra la clase ni cambia su código'::text; oks := oks || (ok_ and n_ = 0);

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

  -- ---------- Comentarios de supervisión (v0.7.0) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_k, 'role', 'authenticated')::text, true);
  insert into public.comments (club_id, team_id, entity, section, text) values (c_a, t_a1, 'sesiones', 'general', 'Revisad la carga del martes') returning id into c_root;
  perform set_config('request.jwt.claims', json_build_object('sub', u_y, 'role', 'authenticated')::text, true);
  insert into public.comments (club_id, team_id, entity, section, parent_id, text) values (c_a, t_a1, 'sesiones', 'general', c_root, 'Hecho, bajamos el volumen');
  names := names || 'Cuerpo técnico: responde a la Coordinación'::text; oks := oks || true;
  update public.comments set resolved = true where id = c_root;
  get diagnostics n_ = row_count;
  names := names || 'Cuerpo técnico: marca el comentario como resuelto'::text; oks := oks || (n_ = 1);
  begin
    update public.comments set text = 'Cambiado' where id = c_root;
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Cuerpo técnico: no cambia el texto de la Coordinación'::text; oks := oks || ok_;
  perform set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.comments where entity = 'sesiones' and team_id = t_a1;
  names := names || 'Otro equipo: no ve la conversación'::text; oks := oks || (cnt = 0);

  -- ---------- Alta rápida de equipos e invitaciones por equipo (v0.6.0) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  t_new := public.create_team(c_a, s_a, 'Alevín C', 'Alevín', 'f7');
  select count(*) into cnt from public.teams where id = t_new and squad_max = 14 and period_minutes = 35;
  names := names || 'Crear equipo F7: valores de su modalidad'::text; oks := oks || (cnt = 1);
  select count(*) into cnt from public.morphocycles where team_id = t_new and is_default;
  names := names || 'Crear equipo: con morfociclo estándar'::text; oks := oks || (cnt = 1);
  insert into public.invitations (club_id, role, team_ids, specialty) values (c_a, 'entrenador', array[t_new], 'UEFA B') returning token into tok_t;
  perform set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  select team_names into ok_name_dummy from public.get_invitation(tok_t);
  names := names || 'La invitación muestra su equipo'::text; oks := oks || (ok_name_dummy = 'Alevín C');
  begin
    perform public.create_team(c_a, s_a, 'Equipo pirata', '', 'f11');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Un entrenador no puede crear equipos'::text; oks := oks || ok_;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
    perform public.create_team(c_a, s_a, 'Equipo pirata', '', 'f11');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Otro club no puede crear equipos en el tuyo'::text; oks := oks || ok_;

  -- ---------- Metodología del club (v0.8.0) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  insert into public.club_principles (club_id, phase, title) values (c_a, 'ataque', 'Conservación') returning id into pr;
  insert into public.club_principles (club_id, parent_id, phase, title) values (c_a, pr, 'ataque', 'Superioridad por dentro');
  names := names || 'Dirección: crea principios y subprincipios'::text; oks := oks || true;
  begin
    insert into public.club_principles (club_id, parent_id, phase, title) values (c_a, pr, 'defensa', 'Mal colgado');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Un subprincipio no puede colgar de otra fase'::text; oks := oks || ok_;

  perform set_config('request.jwt.claims', json_build_object('sub', u_k, 'role', 'authenticated')::text, true);
  insert into public.category_objectives (club_id, category, objectives) values (c_a, 'Infantil', '{"tecnico":["Pase"]}');
  names := names || 'Coordinación: define objetivos por categoría'::text; oks := oks || true;

  perform set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.club_principles where club_id = c_a;
  names := names || 'Entrenador: consulta el modelo de juego'::text; oks := oks || (cnt = 2);
  begin
    insert into public.club_principles (club_id, phase, title) values (c_a, 'defensa', 'Pirata');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Entrenador: no edita el modelo de juego'::text; oks := oks || ok_;
  update public.category_objectives set notes = 'x' where club_id = c_a;
  get diagnostics n_ = row_count;
  names := names || 'Entrenador: no edita los objetivos'::text; oks := oks || (n_ = 0);
  insert into public.task_library (club_id, title, status, block) values (c_a, 'Rondo 4x2', 'oficial', '{}') returning id, status into tk, st;
  names := names || 'Entrenador: su tarea entra como propuesta'::text; oks := oks || (st = 'propuesta');
  update public.task_library set title = 'Rondo 4x2 + 1' where id = tk;
  get diagnostics n_ = row_count;
  names := names || 'Entrenador: edita su propuesta'::text; oks := oks || (n_ = 1);
  begin
    update public.task_library set status = 'oficial' where id = tk;
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Entrenador: no puede aprobar su tarea'::text; oks := oks || ok_;

  perform set_config('request.jwt.claims', json_build_object('sub', u_k, 'role', 'authenticated')::text, true);
  update public.task_library set status = 'oficial', review_note = 'Muy buena' where id = tk;
  select count(*) into cnt from public.task_library where id = tk and status = 'oficial' and reviewed_by = u_k;
  names := names || 'Coordinación: aprueba la tarea'::text; oks := oks || (cnt = 1);

  perform set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  begin
    update public.task_library set title = 'Cambio' where id = tk;
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Entrenador: no cambia una tarea ya oficial'::text; oks := oks || ok_;
  delete from public.task_library where id = tk;
  get diagnostics n_ = row_count;
  names := names || 'Entrenador: no borra una tarea oficial'::text; oks := oks || (n_ = 0);
  begin
    perform public.apply_template(gen_random_uuid(), s_a);
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Entrenador: no aplica plantillas'::text; oks := oks || ok_;

  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  insert into public.club_templates (club_id, kind, stage, name, data, is_default)
  values (c_a, 'morfociclo', 'base', 'Morfociclo base del club', jsonb_build_object('match_day', 5, 'rows', '[{"label":"Principios","values":{"lun":"Recuperación"}}]'::jsonb), true) returning id into tpl;
  insert into public.club_templates (club_id, kind, stage, name, data, is_default)
  values (c_a, 'macrociclo', 'base', 'Porteros base', '{"weeks":30,"groups":[{"name":"Técnica","items":[{"name":"Blocajes","marks":{}}]}]}', true);
  t_tpl := public.create_team(c_a, s_a, 'Infantil T', 'Infantil', 'f11');
  select count(*) into cnt from public.morphocycles where team_id = t_tpl and name = 'Morfociclo base del club' and match_day = 5;
  names := names || 'Nuevo equipo de fútbol base: con el morfociclo del club'::text; oks := oks || (cnt = 1);
  select count(*) into cnt from public.macrocycles where team_id = t_tpl and name = 'Porteros base';
  names := names || 'Nuevo equipo de fútbol base: con el macrociclo modelo'::text; oks := oks || (cnt = 1);
  t_tpl := public.create_team(c_a, s_a, 'Juvenil T', 'Juvenil', 'f11');
  select count(*) into cnt from public.morphocycles where team_id = t_tpl and name = 'Morfociclo estándar';
  names := names || 'Equipo de rendimiento: no recibe la plantilla de base'::text; oks := oks || (cnt = 1);
  select public.apply_template(tpl, s_a) into cnt;
  names := names || 'Dirección: aplica la plantilla a los equipos de su etapa'::text; oks := oks || (cnt >= 1);

  -- ---------- R5 · Instalaciones, reservas y horario base ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  insert into public.facilities (club_id, name, kind) values (c_a, 'Campo 1', 'campo') returning id into fac;
  insert into public.facilities (club_id, name, kind) values (c_a, 'Vestuario 1', 'vestuario') returning id into vest;
  names := names || 'Dirección: crea instalaciones'::text; oks := oks || (fac is not null and vest is not null);
  mon := date_trunc('week', date '2026-10-14')::date;
  perform public.set_team_schedule(t_a1, jsonb_build_array(
    jsonb_build_object('day', 0, 'start', '18:00', 'end', '19:30', 'facility_id', fac, 'share', 2),
    jsonb_build_object('day', 2, 'start', '18:00', 'end', '19:30')), '#22c55e');
  select count(*) into cnt from public.teams where id = t_a1 and color = '#22c55e' and jsonb_array_length(schedule) = 2;
  names := names || 'Dirección: guarda el horario base y el color del equipo'::text; oks := oks || (cnt = 1);
  insert into public.matches (team_id, season_id, date, time, rival) values (t_a1, s_a, mon + 2, '11:00', 'Rival R5') returning id into m_g;
  select public.generate_week_sessions(s_a, mon + 3) into cnt;
  names := names || 'Horario: genera las sesiones de la semana (no el día de partido)'::text; oks := oks || (cnt = 1);
  select public.generate_week_sessions(s_a, mon) into cnt;
  names := names || 'Horario: no duplica sesiones al generar otra vez'::text; oks := oks || (cnt = 0);
  select s.id into ses_g from public.sessions s where s.team_id = t_a1 and s.date = mon and s.time = '18:00';
  select count(*) into cnt from public.bookings where session_id = ses_g and facility_id = fac and share = 2 and start_time = '18:00' and end_time = '19:30';
  names := names || 'Horario: la sesión generada reserva su medio campo'::text; oks := oks || (cnt = 1);
  update public.sessions set time = '17:00', duration_min = 60 where id = ses_g;
  select count(*) into cnt from public.bookings where session_id = ses_g and start_time = '17:00' and end_time = '18:00';
  names := names || 'La reserva sigue a la sesión cuando cambia la hora'::text; oks := oks || (cnt = 1);
  insert into public.bookings (facility_id, match_id, share, date, start_time, end_time) values (vest, m_g, 1, mon, '00:00', '00:01') returning id into bk;
  select count(*) into cnt from public.bookings where id = bk and share = 4 and date = mon + 2 and start_time = '10:30' and end_time = '12:25' and team_id = t_a1;
  names := names || 'Reserva de partido: vestuario entero y franja del partido'::text; oks := oks || (cnt = 1);

  perform set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  begin
    insert into public.facilities (club_id, name) values (c_a, 'Campo pirata');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Entrenador: no crea instalaciones'::text; oks := oks || ok_;
  select count(*) into cnt from public.bookings where club_id = c_a;
  names := names || 'Entrenador: ve la ocupación de todo el club'::text; oks := oks || (cnt = 2);
  insert into public.bookings (facility_id, team_id, share, date, start_time, end_time) values (fac, t_a2, 2, mon, '18:00', '19:00') returning id into bk;
  names := names || 'Entrenador: reserva para su equipo'::text; oks := oks || (bk is not null);
  begin
    insert into public.bookings (facility_id, team_id, date, start_time, end_time) values (fac, t_a1, mon, '20:00', '21:00');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Entrenador: no reserva para otro equipo'::text; oks := oks || ok_;
  begin
    perform public.set_team_schedule(t_a1, '[]'::jsonb);
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Entrenador: no cambia el horario de otro equipo'::text; oks := oks || ok_;
  select public.generate_week_sessions(s_a, mon + 7) into cnt;
  names := names || 'Entrenador: generar no crea sesiones de otros equipos'::text; oks := oks || (cnt = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', u_k, 'role', 'authenticated')::text, true);
  perform public.set_team_schedule(t_a1, (select schedule from public.teams where id = t_a1), '#0ea5e9');
  select count(*) into cnt from public.teams where id = t_a1 and color = '#0ea5e9';
  names := names || 'Coordinación: ajusta el horario de su equipo'::text; oks := oks || (cnt = 1);

  -- ---------- Sesiones: preparador y porteros con edición limitada ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  insert into public.sessions (team_id, date, objectives, blocks) values (t_a1, current_date,
    '{"general":"Conservar","condicional":""}',
    jsonb_build_array(jsonb_build_object('id', 'b1', 'kind', 'task', 'title', 'Rondo', 'author_id', u_a, 'roles', '{}'::jsonb)))
    returning id into ses_l;
  perform set_config('request.jwt.claims', json_build_object('sub', u_p, 'role', 'authenticated')::text, true);
  update public.sessions set objectives = objectives || '{"condicional":"Fuerza reactiva"}' where id = ses_l;
  select count(*) into cnt from public.sessions where id = ses_l and objectives ->> 'condicional' = 'Fuerza reactiva';
  names := names || 'Sesión: el preparador cambia el objetivo condicional'::text; oks := oks || (cnt = 1);
  update public.sessions set blocks = jsonb_set(blocks, '{0,roles}', '{"preparador":"Control de cargas"}') where id = ses_l;
  select count(*) into cnt from public.sessions where id = ses_l and blocks -> 0 -> 'roles' ->> 'preparador' = 'Control de cargas';
  names := names || 'Sesión: el preparador escribe su rol en una tarea'::text; oks := oks || (cnt = 1);
  update public.sessions set blocks = blocks || jsonb_build_array(jsonb_build_object('id', 'b2', 'kind', 'task', 'title', 'Circuito', 'author_id', u_p)) where id = ses_l;
  update public.sessions set blocks = jsonb_set(blocks, '{1,title}', '"Circuito de fuerza"') where id = ses_l;
  select count(*) into cnt from public.sessions where id = ses_l and blocks -> 1 ->> 'title' = 'Circuito de fuerza';
  names := names || 'Sesión: el preparador crea y edita su propia tarea'::text; oks := oks || (cnt = 1);
  begin
    update public.sessions set objectives = objectives || '{"general":"Otro"}' where id = ses_l;
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Sesión: el preparador no cambia el objetivo general'::text; oks := oks || ok_;
  begin
    update public.sessions set blocks = jsonb_set(blocks, '{0,title}', '"Cambiado"') where id = ses_l;
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Sesión: el preparador no cambia las tareas de otros'::text; oks := oks || ok_;
  begin
    update public.sessions set notes = 'x' where id = ses_l;
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Sesión: el preparador no cambia observaciones ni asistencia'::text; oks := oks || ok_;
  perform set_config('request.jwt.claims', json_build_object('sub', u_y, 'role', 'authenticated')::text, true);
  update public.sessions set notes = 'Revisado por el delegado' where id = ses_l;
  select count(*) into cnt from public.sessions where id = ses_l and notes = 'Revisado por el delegado';
  names := names || 'Sesión: el 2.º entrenador edita toda la ficha'::text; oks := oks || (cnt = 1);

  -- ---------- Macrociclos: edición según el área ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_p, 'role', 'authenticated')::text, true);
  insert into public.macrocycles (team_id, season_id, name, area, start_monday) values (t_a1, s_a, 'Fuerza', 'condicional', '2026-08-03') returning id into mc;
  update public.macrocycles set name = 'Fuerza y prevención' where id = mc;
  select count(*) into cnt from public.macrocycles where id = mc and name = 'Fuerza y prevención';
  names := names || 'Macrociclo: el preparador crea y edita el condicional'::text; oks := oks || (cnt = 1);
  begin
    insert into public.macrocycles (team_id, season_id, name, area, start_monday) values (t_a1, s_a, 'Porteros', 'porteros', '2026-08-03');
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Macrociclo: el preparador no crea el de porteros'::text; oks := oks || ok_;
  begin
    update public.macrocycles set area = 'general' where id = mc;
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Macrociclo: el preparador no cambia el área'::text; oks := oks || ok_;
  perform set_config('request.jwt.claims', json_build_object('sub', u_y, 'role', 'authenticated')::text, true);
  update public.macrocycles set weeks = 40 where id = mc;
  select count(*) into cnt from public.macrocycles where id = mc and weeks = 40;
  names := names || 'Macrociclo: el 2.º entrenador edita cualquiera'::text; oks := oks || (cnt = 1);

  -- ---------- Plantilla: datos de un jugador antes de borrarlo ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  select id into pl from public.players where team_id = t_a1 and number = 7;
  js := public.player_usage(pl);
  names := names || 'Plantilla: jugador sin datos (se puede borrar)'::text; oks := oks || ((js ->> 'sessions')::int = 0 and (js ->> 'matches')::int = 0);
  insert into public.sessions (team_id, date, attendance) values (t_a1, current_date, jsonb_build_object(pl::text, jsonb_build_object('status', 'D')));
  update public.matches set squad = jsonb_build_array(jsonb_build_object('player_id', pl, 'called', true)) where id = m_g;
  js := public.player_usage(pl);
  names := names || 'Plantilla: detecta asistencia y convocatorias del jugador'::text; oks := oks || ((js ->> 'sessions')::int = 1 and (js ->> 'matches')::int = 1);
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  begin
    js := public.player_usage(pl);
    ok_ := false;
  exception when others then ok_ := true;
  end;
  names := names || 'Plantilla: otro club no consulta tus jugadores'::text; oks := oks || ok_;

  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.facilities where club_id = c_a;
  select cnt + count(*) into cnt from public.bookings where club_id = c_a;
  names := names || 'Otro club: no ve instalaciones ni reservas'::text; oks := oks || (cnt = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.club_principles where club_id = c_a;
  names := names || 'Otro club: no ve tu metodología'::text; oks := oks || (cnt = 0);

  -- ---------- Auditoría (v0.23.0) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  begin
    perform public.club_template_for(c_a, 'morfociclo', '');
    ok_ := false;
  exception when insufficient_privilege then ok_ := true;
  end;
  names := names || 'Auditoría: nadie lee plantillas de otro club con su id'::text; oks := oks || ok_;
  begin
    perform public.match_slot(m_g);
    ok_ := false;
  exception when insufficient_privilege then ok_ := true;
  end;
  names := names || 'Auditoría: nadie consulta la hora de un partido ajeno con su id'::text; oks := oks || ok_;

  -- Códigos de clase: los intentos fallidos se limitan
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  for i in 1 .. 10 loop perform public.join_class('ZZZZZ' || i, c_b); end loop;
  begin
    perform public.join_class('ZZZZZZ', c_b);
    ok_ := false;
  exception when others then ok_ := sqlerrm like 'Demasiados%';
  end;
  names := names || 'Auditoría: los códigos de clase no se pueden probar sin límite'::text; oks := oks || ok_;
  -- Datos guardados en bloque con la forma correcta
  begin
    insert into public.sessions (team_id, date, blocks) values (t_b, current_date, '{"no":"lista"}'::jsonb);
    ok_ := false;
  exception when check_violation then ok_ := true;
  end;
  names := names || 'Auditoría: no se guardan datos con forma incorrecta'::text; oks := oks || ok_;

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
