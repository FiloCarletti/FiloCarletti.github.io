-- =====================================================================
-- La condivisione la gestiscono SOLO i proprietari degli spazi (titolare + editor),
-- anche per l'admin: l'admin gestisce utenti e app abilitate, non i dati altrui.
-- Chiunque può creare spazi condivisi nelle app a cui ha accesso.
-- Da applicare DOPO 20261005180000_base_sharing.sql.
-- =====================================================================

create or replace function private.can_manage(p_space uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and p_space in (select public.writable_space_ids());
$$;

-- Le funzioni admin sugli spazi non servono più.
drop function if exists public.admin_set_member(uuid, text, text);
drop function if exists public.admin_create_space(text, text);
drop function if exists public.admin_rename_space(uuid, text);
drop function if exists public.admin_delete_space(uuid);

-- Panoramica admin: solo utenti e app abilitate.
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
      from private.allowed_emails a), '[]'::jsonb)
  );
end;
$$;

-- Nuovo spazio condiviso (es. "Casa", "Conto comune") in un'app a cui si ha accesso.
create or replace function public.space_create(p_app text, p_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.has_app(p_app) then
    raise exception 'Non hai accesso a questa app' using errcode = '42501';
  end if;
  insert into private.spaces (app_slug, kind, name, owner_id) values (p_app, 'shared', trim(p_name), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.space_rename(p_space uuid, p_name text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_manage(p_space) then
    raise exception 'Non puoi gestire questo spazio' using errcode = '42501';
  end if;
  update private.spaces set name = trim(p_name) where id = p_space and kind = 'shared';
end;
$$;

-- Solo il titolare, solo spazi condivisi e solo se vuoti (vincolo di chiave esterna).
create or replace function public.space_delete(p_space uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from private.spaces where id = p_space and owner_id = auth.uid() and kind = 'shared') then
    raise exception 'Solo il titolare può eliminare uno spazio condiviso' using errcode = '42501';
  end if;
  delete from private.spaces where id = p_space;
exception when foreign_key_violation then
  raise exception 'Lo spazio contiene ancora dati: svuotalo prima di eliminarlo';
end;
$$;

-- I miei spazi gestibili (di cui sono titolare o editor), con i dettagli di condivisione.
create or replace function public.my_shares()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(public.space_info(s.id) order by s.app_slug, (s.kind = 'personal') desc, s.name), '[]'::jsonb)
  from private.spaces s
  where auth.uid() is not null and s.id in (select public.writable_space_ids());
$$;

-- Nelle app solo-condivise, il primo accesso crea uno spazio "Condiviso" a chi non ne ha ancora.
create or replace function public.my_spaces(p_app text, p_personal boolean default true)
returns table (space_id uuid, space_name text, space_kind text, my_role text, owner_name text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public.current_email();
  v_has boolean := public.has_app(p_app);
begin
  if v_uid is null or not (v_has or exists (
       select 1 from private.space_members m join private.spaces s on s.id = m.space_id
       where s.app_slug = p_app and m.email = v_email)) then
    raise exception 'Non hai accesso a questa app' using errcode = '42501';
  end if;

  if v_has and p_personal then
    insert into private.spaces (app_slug, kind, name, owner_id)
    values (p_app, 'personal', 'Personale', v_uid)
    on conflict do nothing;
  elsif v_has and not exists (
      select 1 from private.spaces s
      where s.app_slug = p_app
        and (s.owner_id = v_uid or exists (select 1 from private.space_members m where m.space_id = s.id and m.email = v_email))) then
    insert into private.spaces (app_slug, kind, name, owner_id) values (p_app, 'shared', 'Condiviso', v_uid);
  end if;

  insert into private.app_opens as o (user_id, app_slug) values (v_uid, p_app)
  on conflict (user_id, app_slug) do update set last_opened_at = now(), open_count = o.open_count + 1;

  return query
    select s.id, s.name, s.kind,
           case when s.owner_id = v_uid then 'owner' else m.role end,
           (private.person(null, s.owner_id) ->> 'name')
    from private.spaces s
    left join private.space_members m on m.space_id = s.id and m.email = v_email
    where s.app_slug = p_app and ((s.owner_id = v_uid and v_has) or m.email is not null)
    order by (s.kind = 'personal' and s.owner_id = v_uid) desc, (s.owner_id = v_uid) desc, s.kind desc, s.name;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.space_create(text, text)', 'public.space_rename(uuid, text)', 'public.space_delete(uuid)',
    'public.my_shares()', 'public.admin_overview()', 'public.my_spaces(text, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
