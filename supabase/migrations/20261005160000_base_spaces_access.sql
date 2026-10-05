-- =====================================================================
-- Permessi per app e "spazi" di dati.
--
--  * private.allowed_emails  utenti autorizzati (+ is_admin, display_name)
--  * private.app_grants      quali app può aprire ogni utente (gli admin le vedono tutte)
--  * private.spaces          contenitori di dati di un'app:
--                              - personal: uno per utente e app, creato al primo accesso
--                              - shared:   creato dall'admin, con membri
--  * private.space_members   chi altro vede uno spazio: viewer (lettura) / editor (scrittura)
--  * private.app_opens       ultima apertura di ogni app (barra "recenti" in dashboard)
--
-- Ogni tabella di un'app ha `space_id` e usa le policy standard basate su
-- public.readable_space_ids() / public.writable_space_ids() (vedi CONVENTIONS.md).
-- Gli admin gestiscono utenti, app e spazi ma NON vedono automaticamente i dati
-- personali degli altri: per vederli devono aggiungersi come membri.
-- =====================================================================

alter table private.allowed_emails add column if not exists is_admin boolean not null default false;
alter table private.allowed_emails add column if not exists display_name text;
update private.allowed_emails set is_admin = true where note = 'proprietario';

create table private.app_grants (
  app_slug   text not null check (app_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  email      text not null references private.allowed_emails(email) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (app_slug, email)
);
create index on private.app_grants (email);

create table private.spaces (
  id         uuid primary key default gen_random_uuid(),
  app_slug   text not null check (app_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind       text not null check (kind in ('personal', 'shared')),
  name       text not null check (length(trim(name)) > 0),
  owner_id   uuid references auth.users(id) on delete cascade, -- titolare (personale) o creatore (condiviso)
  created_at timestamptz not null default now()
);
create unique index spaces_personal_key on private.spaces (app_slug, owner_id) where kind = 'personal';
create index on private.spaces (app_slug);
create index on private.spaces (owner_id);

create table private.space_members (
  space_id   uuid not null references private.spaces(id) on delete cascade,
  email      text not null references private.allowed_emails(email) on delete cascade on update cascade,
  role       text not null check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (space_id, email)
);
create index on private.space_members (email);

create table private.app_opens (
  user_id        uuid not null references auth.users(id) on delete cascade,
  app_slug       text not null,
  last_opened_at timestamptz not null default now(),
  open_count     integer not null default 1,
  primary key (user_id, app_slug)
);

-- Tabelle di controllo: leggibili solo tramite le funzioni SECURITY DEFINER qui sotto.
alter table private.app_grants enable row level security;
alter table private.spaces enable row level security;
alter table private.space_members enable row level security;
alter table private.app_opens enable row level security;
revoke all on table private.app_grants, private.spaces, private.space_members, private.app_opens from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Funzioni usate dalle policy RLS
-- ---------------------------------------------------------------------

create or replace function public.current_email()
returns text language sql stable set search_path = ''
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.allowed_emails a where a.email = public.current_email() and a.is_admin);
$$;

-- L'utente può aprire l'app? (admin: tutte; altri: solo quelle concesse)
create or replace function public.has_app(p_app text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.allowed_emails a
    where a.email = public.current_email()
      and (a.is_admin or exists (select 1 from private.app_grants g where g.email = a.email and g.app_slug = p_app))
  );
$$;

-- Spazi leggibili: propri + quelli di cui si è membri, solo nelle app abilitate.
create or replace function public.readable_space_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select s.id from private.spaces s
  where (s.owner_id = auth.uid()
         or exists (select 1 from private.space_members m where m.space_id = s.id and m.email = public.current_email()))
    and public.has_app(s.app_slug);
$$;

-- Spazi scrivibili: propri + quelli in cui si è editor.
create or replace function public.writable_space_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select s.id from private.spaces s
  where (s.owner_id = auth.uid()
         or exists (select 1 from private.space_members m
                    where m.space_id = s.id and m.email = public.current_email() and m.role = 'editor'))
    and public.has_app(s.app_slug);
$$;

-- ---------------------------------------------------------------------
-- RPC per le app
-- ---------------------------------------------------------------------

-- Spazi visibili nell'app. Crea lo spazio personale al primo accesso (se p_personal)
-- e, per gli admin nelle app solo-condivise, uno spazio "Condiviso" se non esiste.
-- Registra anche l'apertura dell'app (per la dashboard).
create or replace function public.my_spaces(p_app text, p_personal boolean default true)
returns table (space_id uuid, space_name text, space_kind text, my_role text, owner_name text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public.current_email();
begin
  if v_uid is null or not public.has_app(p_app) then
    raise exception 'Non hai accesso a questa app' using errcode = '42501';
  end if;

  if p_personal then
    insert into private.spaces (app_slug, kind, name, owner_id)
    values (p_app, 'personal', 'Personale', v_uid)
    on conflict do nothing;
  elsif public.is_admin() and not exists (select 1 from private.spaces s where s.app_slug = p_app and s.kind = 'shared') then
    insert into private.spaces (app_slug, kind, name, owner_id) values (p_app, 'shared', 'Condiviso', v_uid);
  end if;

  insert into private.app_opens as o (user_id, app_slug) values (v_uid, p_app)
  on conflict (user_id, app_slug) do update set last_opened_at = now(), open_count = o.open_count + 1;

  return query
    select s.id, s.name, s.kind,
           case when s.owner_id = v_uid then 'owner' else m.role end,
           coalesce(a.display_name, split_part(u.email, '@', 1))::text
    from private.spaces s
    left join private.space_members m on m.space_id = s.id and m.email = v_email
    left join auth.users u on u.id = s.owner_id
    left join private.allowed_emails a on a.email = lower(u.email)
    where s.app_slug = p_app and (s.owner_id = v_uid or m.email is not null)
    order by (s.kind = 'personal' and s.owner_id = v_uid) desc, s.kind desc, s.name;
end;
$$;

-- App visibili all'utente + aperture recenti (per la dashboard).
create or replace function public.my_apps()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when not public.is_allowed() then null else jsonb_build_object(
    'admin', public.is_admin(),
    'grants', coalesce((select jsonb_agg(g.app_slug) from private.app_grants g where g.email = public.current_email()), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('slug', o.app_slug, 'at', o.last_opened_at, 'n', o.open_count) order by o.last_opened_at desc)
                        from private.app_opens o where o.user_id = auth.uid()), '[]'::jsonb)
  ) end;
$$;

-- ---------------------------------------------------------------------
-- RPC di amministrazione (solo admin)
-- ---------------------------------------------------------------------

create or replace function private.assert_admin()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un amministratore può farlo' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  return jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', a.email, 'display_name', a.display_name, 'is_admin', a.is_admin, 'note', a.note,
        'registered', exists (select 1 from auth.users u where lower(u.email) = a.email),
        'apps', coalesce((select jsonb_agg(g.app_slug order by g.app_slug) from private.app_grants g where g.email = a.email), '[]'::jsonb)
      ) order by a.is_admin desc, a.email)
      from private.allowed_emails a), '[]'::jsonb),
    'spaces', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'app_slug', s.app_slug, 'kind', s.kind, 'name', s.name,
        'owner_email', lower(u.email), 'mine', s.owner_id = auth.uid(),
        'members', coalesce((select jsonb_agg(jsonb_build_object('email', m.email, 'role', m.role) order by m.email)
                             from private.space_members m where m.space_id = s.id), '[]'::jsonb)
      ) order by s.app_slug, s.kind desc, s.name)
      from private.spaces s left join auth.users u on u.id = s.owner_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_upsert_user(p_email text, p_name text default null, p_admin boolean default false)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_email text := lower(trim(p_email));
begin
  perform private.assert_admin();
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email non valida'; end if;
  if v_email = public.current_email() and not p_admin then raise exception 'Non puoi togliere a te stesso il ruolo di admin'; end if;
  insert into private.allowed_emails (email, display_name, is_admin) values (v_email, nullif(trim(p_name), ''), p_admin)
  on conflict (email) do update set display_name = excluded.display_name, is_admin = excluded.is_admin;
end;
$$;

-- Toglie l'autorizzazione (e quindi accessi e condivisioni). Non cancella l'account né i suoi dati.
create or replace function public.admin_delete_user(p_email text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  if lower(p_email) = public.current_email() then raise exception 'Non puoi rimuovere te stesso'; end if;
  delete from private.allowed_emails where email = lower(p_email);
end;
$$;

create or replace function public.admin_set_grant(p_email text, p_app text, p_on boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  if p_on then
    insert into private.app_grants (app_slug, email) values (p_app, lower(p_email)) on conflict do nothing;
  else
    delete from private.app_grants where app_slug = p_app and email = lower(p_email);
  end if;
end;
$$;

create or replace function public.admin_create_space(p_app text, p_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.assert_admin();
  insert into private.spaces (app_slug, kind, name, owner_id) values (p_app, 'shared', trim(p_name), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_rename_space(p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  update private.spaces set name = trim(p_name) where id = p_id;
end;
$$;

-- Fallisce (vincolo di chiave esterna) se nello spazio ci sono ancora dati.
create or replace function public.admin_delete_space(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  delete from private.spaces where id = p_id;
exception when foreign_key_violation then
  raise exception 'Lo spazio contiene ancora dati: svuotalo prima di eliminarlo';
end;
$$;

-- p_role: 'viewer' | 'editor' | null (rimuove il membro)
create or replace function public.admin_set_member(p_space uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  if p_role is null then
    delete from private.space_members where space_id = p_space and email = lower(p_email);
  else
    insert into private.space_members (space_id, email, role) values (p_space, lower(p_email), p_role)
    on conflict (space_id, email) do update set role = excluded.role;
  end if;
end;
$$;

-- Permessi di esecuzione: solo utenti autenticati (le funzioni controllano poi allowlist/admin).
do $$
declare f text;
begin
  foreach f in array array[
    'public.current_email()', 'public.is_admin()', 'public.has_app(text)',
    'public.readable_space_ids()', 'public.writable_space_ids()',
    'public.my_spaces(text, boolean)', 'public.my_apps()', 'public.admin_overview()',
    'public.admin_upsert_user(text, text, boolean)', 'public.admin_delete_user(text)',
    'public.admin_set_grant(text, text, boolean)', 'public.admin_create_space(text, text)',
    'public.admin_rename_space(uuid, text)', 'public.admin_delete_space(uuid)',
    'public.admin_set_member(uuid, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function private.assert_admin() from public, anon, authenticated;
