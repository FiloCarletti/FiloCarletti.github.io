-- App "Allenamenti": catalogo esercizi, sessioni di allenamento e voci (esercizio svolto in una sessione).

create table public.allenamenti_esercizi (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  categoria   text not null default 'Altro',
  unita       text not null default 'rip' check (unita in ('rip', 'sec', 'cardio')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.allenamenti_esercizi (owner_id);
create unique index allenamenti_esercizi_owner_nome_key on public.allenamenti_esercizi (owner_id, lower(nome));
alter table public.allenamenti_esercizi enable row level security;
create policy owner_all on public.allenamenti_esercizi
  for all to authenticated
  using      ((select public.is_allowed()) and owner_id = (select auth.uid()))
  with check ((select public.is_allowed()) and owner_id = (select auth.uid()));
create trigger set_updated_at before update on public.allenamenti_esercizi
  for each row execute function public.set_updated_at();

create table public.allenamenti_sessioni (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        date not null,
  titolo      text,
  note        text,
  durata_min  integer check (durata_min is null or durata_min > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.allenamenti_sessioni (owner_id, data desc);
alter table public.allenamenti_sessioni enable row level security;
create policy owner_all on public.allenamenti_sessioni
  for all to authenticated
  using      ((select public.is_allowed()) and owner_id = (select auth.uid()))
  with check ((select public.is_allowed()) and owner_id = (select auth.uid()));
create trigger set_updated_at before update on public.allenamenti_sessioni
  for each row execute function public.set_updated_at();

create table public.allenamenti_voci (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sessione_id  uuid not null references public.allenamenti_sessioni(id) on delete cascade,
  esercizio_id uuid not null references public.allenamenti_esercizi(id) on delete restrict,
  ordine       integer not null default 0,
  serie        integer check (serie is null or serie > 0),
  ripetizioni  numeric(7,2) check (ripetizioni is null or ripetizioni >= 0),
  peso_kg      numeric(7,2) check (peso_kg is null or peso_kg >= 0),
  rpe          numeric(3,1) check (rpe is null or rpe between 1 and 10),
  durata_min   numeric(7,2) check (durata_min is null or durata_min >= 0),
  distanza_km  numeric(7,2) check (distanza_km is null or distanza_km >= 0),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.allenamenti_voci (owner_id);
create index on public.allenamenti_voci (sessione_id, ordine);
create index on public.allenamenti_voci (esercizio_id);
alter table public.allenamenti_voci enable row level security;
create policy owner_all on public.allenamenti_voci
  for all to authenticated
  using      ((select public.is_allowed()) and owner_id = (select auth.uid()))
  with check ((select public.is_allowed()) and owner_id = (select auth.uid()));
create trigger set_updated_at before update on public.allenamenti_voci
  for each row execute function public.set_updated_at();
