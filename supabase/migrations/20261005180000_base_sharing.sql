-- =====================================================================
-- Condivisione da parte degli utenti, link pubblici e community.
-- Da applicare DOPO 20261005160000_base_spaces_access.sql.
--
--  * Proprietari di uno spazio = titolare (owner_id) + membri "editor".
--    I proprietari gestiscono membri e link; i "viewer" leggono soltanto.
--  * Un membro vede lo spazio anche se l'app non gli è stata abilitata:
--    l'abilitazione serve per avere dati PROPRI nell'app.
--  * Link pubblico: spaces.link_token. Chi manda l'header `x-space-token`
--    con il token giusto (anche senza login) può leggere QUELLO spazio.
-- =====================================================================

alter table private.spaces add column if not exists link_token text unique;

-- Token del link condiviso, dall'header della richiesta HTTP (PostgREST).
create or replace function public.request_space_token()
returns text language sql stable set search_path = ''
as $$
  select nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-space-token', '');
$$;

create or replace function public.readable_space_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select s.id from private.spaces s
  where (auth.uid() is not null and s.owner_id = auth.uid() and public.has_app(s.app_slug))
     or (auth.uid() is not null and exists (
           select 1 from private.space_members m where m.space_id = s.id and m.email = public.current_email()))
     or (s.link_token is not null and s.link_token = public.request_space_token());
$$;

create or replace function public.writable_space_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select s.id from private.spaces s
  where (auth.uid() is not null and s.owner_id = auth.uid() and public.has_app(s.app_slug))
     or (auth.uid() is not null and exists (
           select 1 from private.space_members m
           where m.space_id = s.id and m.email = public.current_email() and m.role = 'editor'));
$$;

-- Proprietari (titolare + editor) e admin possono gestire la condivisione.
create or replace function private.can_manage(p_space uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (public.is_admin() or p_space in (select public.writable_space_ids()));
$$;

-- Profilo pubblico di una persona: nome e avatar da allowlist o account Google.
create or replace function private.person(p_email text, p_uid uuid default null)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'email', e.email,
    'name', coalesce(a.display_name, u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(e.email, '@', 1)),
    'avatar', u.raw_user_meta_data ->> 'avatar_url',
    'me', e.email = public.current_email()
  )
  from (select lower(coalesce((select x.email from auth.users x where x.id = p_uid), p_email)) as email) e
  left join lateral (select * from auth.users x where lower(x.email) = e.email limit 1) u on true
  left join private.allowed_emails a on a.email = e.email;
$$;

-- Dettagli dello spazio per chi può leggerlo (membro, titolare o link). null se non accessibile.
create or replace function public.space_info(p_space uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  s private.spaces;
  v_role text;
  v_manage boolean;
begin
  select * into s from private.spaces where id = p_space;
  if s.id is null or s.id not in (select public.readable_space_ids()) then
    return null;
  end if;
  v_role := case
    when auth.uid() is not null and s.owner_id = auth.uid() then 'owner'
    else coalesce((select m.role from private.space_members m
                   where m.space_id = s.id and m.email = public.current_email() and auth.uid() is not null), 'link')
  end;
  v_manage := private.can_manage(s.id);
  return jsonb_build_object(
    'id', s.id, 'app_slug', s.app_slug, 'kind', s.kind, 'name', s.name,
    'my_role', v_role, 'can_manage', v_manage,
    -- chi arriva dal link pubblico vede i nomi, non le email
    'owners', (select jsonb_agg(case when v_role = 'link' then o.p - 'email' else o.p end order by o.ord, o.p ->> 'name')
               from (select 0 as ord, private.person(null, s.owner_id) as p where s.owner_id is not null
                     union all
                     select 1, private.person(m.email) from private.space_members m
                     where m.space_id = s.id and m.role = 'editor') o),
    'viewer_count', (select count(*) from private.space_members m where m.space_id = s.id and m.role = 'viewer'),
    'members', case when v_manage then
                 (select coalesce(jsonb_agg(private.person(m.email) || jsonb_build_object('role', m.role) order by m.role desc, m.email), '[]'::jsonb)
                  from private.space_members m where m.space_id = s.id) end,
    'link_token', case when v_manage then s.link_token end
  );
end;
$$;

-- Condividi (p_role 'viewer' | 'editor') o togli (p_role null). Chiunque può togliere se stesso.
create or replace function public.space_share(p_space uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if not (private.can_manage(p_space) or (p_role is null and v_email = public.current_email() and auth.uid() is not null)) then
    raise exception 'Non puoi gestire la condivisione di questo spazio' using errcode = '42501';
  end if;
  if p_role is null then
    delete from private.space_members where space_id = p_space and email = v_email;
    return;
  end if;
  if p_role not in ('viewer', 'editor') then
    raise exception 'Permesso non valido';
  end if;
  if exists (select 1 from private.spaces s join auth.users u on u.id = s.owner_id
             where s.id = p_space and lower(u.email) = v_email) then
    raise exception 'È già il titolare di questo spazio';
  end if;
  if not exists (select 1 from private.allowed_emails where email = v_email) then
    raise exception 'Questa persona non è ancora abilitata: chiedi all''amministratore di aggiungerla';
  end if;
  insert into private.space_members (space_id, email, role) values (p_space, v_email, p_role)
  on conflict (space_id, email) do update set role = excluded.role;
end;
$$;

-- Attiva/disattiva il link pubblico (sola lettura). p_reset genera un nuovo token.
create or replace function public.space_set_link(p_space uuid, p_on boolean, p_reset boolean default false)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.can_manage(p_space) then
    raise exception 'Non puoi gestire la condivisione di questo spazio' using errcode = '42501';
  end if;
  update private.spaces
     set link_token = case
       when not p_on then null
       when p_reset or link_token is null then replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
       else link_token end
   where id = p_space
  returning link_token into v_token;
  return v_token;
end;
$$;

-- Spazi dell'utente in un'app: propri + condivisi con lui. Crea quello personale se l'app è abilitata.
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
  elsif v_has and public.is_admin() and not exists (select 1 from private.spaces s where s.app_slug = p_app and s.kind = 'shared') then
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

-- Community: le persone che hanno condiviso qualcosa con me, con i loro spazi.
create or replace function public.my_community()
returns jsonb language sql stable security definer set search_path = ''
as $$
  with shared as (
    select s.id, s.app_slug, s.kind, s.name, s.owner_id, m.role
    from private.space_members m
    join private.spaces s on s.id = m.space_id
    where auth.uid() is not null and m.email = public.current_email()
      and s.owner_id is not null and s.owner_id <> auth.uid()
  )
  select coalesce(jsonb_agg(f order by f ->> 'name'), '[]'::jsonb)
  from (
    select private.person(null, owner_id) || jsonb_build_object(
             'spaces', jsonb_agg(jsonb_build_object('id', id, 'app_slug', app_slug, 'kind', kind, 'name', name, 'role', role)
                                 order by app_slug, name)) as f
    from shared
    group by owner_id
  ) x;
$$;

-- Permessi di esecuzione
revoke execute on function private.can_manage(uuid) from public, anon, authenticated;
revoke execute on function private.person(text, uuid) from public, anon, authenticated;
revoke execute on function public.request_space_token() from public;
grant execute on function public.request_space_token() to anon, authenticated;
revoke execute on function public.readable_space_ids() from public;
grant execute on function public.readable_space_ids() to anon, authenticated;
revoke execute on function public.space_info(uuid) from public;
grant execute on function public.space_info(uuid) to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.space_share(uuid, text, text)', 'public.space_set_link(uuid, boolean, boolean)',
    'public.my_spaces(text, boolean)', 'public.my_community()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
