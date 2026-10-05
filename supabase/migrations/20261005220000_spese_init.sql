-- Spese: movimenti (uscite negative, entrate positive) e categorie principali/secondarie, per spazio.
-- Da applicare DOPO le migrazioni base (spazi e condivisione).

-- Categorie: enum espandibile dall'utente, separato per spazio e per livello.
create table public.spese_categorie (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references private.spaces(id),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  livello     text not null default 'principale' check (livello in ('principale', 'secondaria')),
  nome        text not null check (length(trim(nome)) between 1 and 60),
  colore      text check (colore ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, space_id) -- per le chiavi esterne composte: un movimento usa solo categorie del suo spazio
);
create unique index spese_categorie_space_nome_key on public.spese_categorie (space_id, livello, lower(nome));
create index on public.spese_categorie (owner_id);

create table public.spese_movimenti (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references private.spaces(id),
  owner_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data               date not null,
  conto              text not null default '' check (length(conto) <= 80),
  categoria_id       uuid,
  sottocategoria_id  uuid,
  importo            numeric(12, 2) not null check (importo <> 0),
  valuta             text not null default 'EUR' check (valuta ~ '^[A-Z]{3}$'),
  descrizione        text not null default '' check (length(descrizione) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (categoria_id, space_id) references public.spese_categorie (id, space_id) on delete set null (categoria_id),
  foreign key (sottocategoria_id, space_id) references public.spese_categorie (id, space_id) on delete set null (sottocategoria_id)
);
create index on public.spese_movimenti (space_id, data desc);
create index on public.spese_movimenti (owner_id);
create index on public.spese_movimenti (categoria_id, space_id);
create index on public.spese_movimenti (sottocategoria_id, space_id);

-- RLS standard per spazi (vedi CONVENTIONS.md).
do $$
declare t text;
begin
  foreach t in array array['spese_categorie', 'spese_movimenti'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon', t);
    execute format('create policy space_select on public.%I for select to anon, authenticated
      using (space_id in (select public.readable_space_ids()))', t);
    execute format('create policy space_insert on public.%I for insert to authenticated
      with check (space_id in (select public.writable_space_ids()) and owner_id = (select auth.uid()))', t);
    execute format('create policy space_update on public.%I for update to authenticated
      using (space_id in (select public.writable_space_ids()))
      with check (space_id in (select public.writable_space_ids()))', t);
    execute format('create policy space_delete on public.%I for delete to authenticated
      using (space_id in (select public.writable_space_ids()))', t);
    execute format('create trigger set_updated_at before update on public.%I
      for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Nei conti condivisi: chi ha inserito i movimenti (nome e avatar), per "chi ha speso cosa".
-- Solo per chi può leggere lo spazio; non espone email.
create or replace function public.spese_autori(p_space uuid)
returns table (user_id uuid, name text, avatar text)
language sql stable security definer set search_path = ''
as $$
  select u.id,
         coalesce(a.display_name, u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)),
         u.raw_user_meta_data ->> 'avatar_url'
  from (select distinct m.owner_id from public.spese_movimenti m where m.space_id = p_space) o
  join auth.users u on u.id = o.owner_id
  left join private.allowed_emails a on a.email = lower(u.email)
  where p_space in (select public.readable_space_ids());
$$;
revoke execute on function public.spese_autori(uuid) from public;
grant execute on function public.spese_autori(uuid) to anon, authenticated;
