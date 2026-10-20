-- Burraco: segnapunti delle partite dal vivo e risultati delle partite contro i bot.
--
--   burraco_partite  partite dal vivo (IRL): squadre, obiettivo (2005…), valori dei punti, stato e vincitore;
--   burraco_mani     mani di una partita: per squadra burraco puliti/sporchi, pozzetto, carte in tavola e in mano,
--                    rettifiche; chi ha chiuso. I totali li calcola l'app con i valori della partita;
--   burraco_sfide    partite concluse contro i bot (modalità, strategie, punteggi), per le statistiche.
-- La partita in corso contro i bot sta nel localStorage del dispositivo.
-- Da applicare DOPO le migrazioni base (spazi e condivisione).

create table public.burraco_partite (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references private.spaces(id),
  owner_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data               date not null default current_date,
  nome_a             text not null default 'Noi' check (length(trim(nome_a)) between 1 and 40),
  nome_b             text not null default 'Loro' check (length(trim(nome_b)) between 1 and 40),
  giocatori_a        text not null default '' check (length(giocatori_a) <= 80),
  giocatori_b        text not null default '' check (length(giocatori_b) <= 80),
  obiettivo          integer not null default 2005 check (obiettivo between 100 and 20000),
  punti_pulito       smallint not null default 200 check (punti_pulito between 0 and 1000),
  punti_sporco       smallint not null default 100 check (punti_sporco between 0 and 1000),
  punti_chiusura     smallint not null default 100 check (punti_chiusura between 0 and 1000),
  penalita_pozzetto  smallint not null default 100 check (penalita_pozzetto between 0 and 1000),
  stato              text not null default 'in_corso' check (stato in ('in_corso', 'conclusa')),
  vincitore          text check (vincitore in ('a', 'b')),
  note               text not null default '' check (length(note) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, space_id) -- per la chiave esterna composta delle mani: mani solo di partite dello stesso spazio
);
create index on public.burraco_partite (space_id, data desc);
create index on public.burraco_partite (owner_id);

create table public.burraco_mani (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references private.spaces(id),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  partita_id   uuid not null,
  numero       smallint not null check (numero between 1 and 500),
  chiusura     text check (chiusura in ('a', 'b')), -- squadra che ha chiuso (null: mano finita senza chiusura)
  puliti_a     smallint not null default 0 check (puliti_a between 0 and 20),
  sporchi_a    smallint not null default 0 check (sporchi_a between 0 and 20),
  pozzetto_a   boolean not null default true, -- false: pozzetto non preso (penalità)
  tavola_a     integer not null default 0 check (tavola_a between -2000 and 5000), -- valore delle carte calate
  mano_a       integer not null default 0 check (mano_a between 0 and 2000),      -- valore delle carte rimaste in mano
  extra_a      integer not null default 0 check (extra_a between -5000 and 5000), -- rettifiche manuali
  puliti_b     smallint not null default 0 check (puliti_b between 0 and 20),
  sporchi_b    smallint not null default 0 check (sporchi_b between 0 and 20),
  pozzetto_b   boolean not null default true,
  tavola_b     integer not null default 0 check (tavola_b between -2000 and 5000),
  mano_b       integer not null default 0 check (mano_b between 0 and 2000),
  extra_b      integer not null default 0 check (extra_b between -5000 and 5000),
  note         text not null default '' check (length(note) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (partita_id, space_id) references public.burraco_partite (id, space_id) on delete cascade,
  unique (partita_id, numero)
);
create index on public.burraco_mani (space_id);
create index on public.burraco_mani (owner_id);

create table public.burraco_sfide (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references private.spaces(id),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modalita      text not null check (modalita in ('1v1', '2v2')),
  bot           text not null check (bot ~ '^[a-z0-9_]{2,30}$'),            -- strategia degli avversari
  compagno      text check (compagno is null or compagno ~ '^[a-z0-9_]{2,30}$'), -- strategia del compagno (2v2)
  obiettivo     integer not null check (obiettivo between 100 and 20000),
  punti_noi     integer not null,
  punti_loro    integer not null,
  vinta         boolean not null,
  mani          smallint not null default 0 check (mani between 0 and 500),
  burraco_noi   smallint not null default 0 check (burraco_noi between 0 and 1000),
  chiusure_noi  smallint not null default 0 check (chiusure_noi between 0 and 500),
  durata_s      integer not null default 0 check (durata_s between 0 and 864000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.burraco_sfide (space_id, created_at desc);
create index on public.burraco_sfide (owner_id);

do $$
declare t text;
begin
  foreach t in array array['burraco_partite', 'burraco_mani', 'burraco_sfide'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon', t); -- solo per il link pubblico, filtrato dalla policy
    execute format($p$create policy space_select on public.%I for select to anon, authenticated
      using (space_id in (select public.readable_space_ids()))$p$, t);
    execute format($p$create policy space_insert on public.%I for insert to authenticated
      with check (space_id in (select public.writable_space_ids()) and owner_id = (select auth.uid()))$p$, t);
    execute format($p$create policy space_update on public.%I for update to authenticated
      using (space_id in (select public.writable_space_ids()))
      with check (space_id in (select public.writable_space_ids()))$p$, t);
    execute format($p$create policy space_delete on public.%I for delete to authenticated
      using (space_id in (select public.writable_space_ids()))$p$, t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
