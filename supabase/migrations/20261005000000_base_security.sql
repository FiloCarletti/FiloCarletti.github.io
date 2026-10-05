-- =====================================================================
-- Base condivisa per tutte le mini-app (progetto Supabase unico).
-- Applicata il 2026-10-05. Le singole app aggiungono SOLO tabelle con il
-- proprio prefisso (<slug>_...) e riusano le funzioni qui sotto.
-- =====================================================================

-- Schema non esposto dalle API REST: qui stanno i dati di controllo.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Elenco delle email autorizzate ad usare le app.
create table if not exists private.allowed_emails (
  email      text primary key check (email = lower(email)),
  note       text,
  created_at timestamptz not null default now()
);
insert into private.allowed_emails (email, note)
values ('filocarletti123@gmail.com', 'proprietario')
on conflict do nothing;

-- true se l'utente loggato è nell'allowlist. Usata da TUTTE le policy RLS
-- e dal frontend (rpc 'is_allowed') per mostrare "non autorizzato".
create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.allowed_emails a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke execute on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

-- Trigger riutilizzabile per aggiornare updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Hook "Before User Created": blocca la registrazione di chi non è in allowlist.
-- Da attivare in Dashboard > Authentication > Hooks.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if exists (select 1 from private.allowed_emails where email = v_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'Registrazione non consentita.')
  );
end;
$$;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;

-- Hardening: le nuove tabelle/sequenze in public non sono accessibili ad anon.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- (follow-up "base_security_rls_allowlist") RLS attiva senza policy: la tabella
-- è leggibile solo dalle funzioni SECURITY DEFINER qui sopra.
alter table private.allowed_emails enable row level security;
revoke all on table private.allowed_emails from public, anon, authenticated;
comment on function public.is_allowed() is 'Intenzionalmente SECURITY DEFINER ed eseguibile da authenticated: restituisce solo se il chiamante e in allowlist.';
