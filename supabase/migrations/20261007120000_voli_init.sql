-- Voli: monitoraggi di voli con date flessibili, prezzi trovati dalla routine di Claude, storico e avvisi.
--
-- Dati fondamentali (piccoli, da tenere):
--   voli_ricerche    i monitoraggi (aeroporti, periodo, durata, orari, compagnie, fonti, soglie di avviso) più lo
--                    stato scritto dalla routine (miglior prezzo attuale, minimo storico);
--   voli_fonti       siti attivati o disattivati per lo spazio (il catalogo è nel codice: apps/voli/src/lib/fonti.js).
-- Dati ripulibili (crescono nel tempo, vedi voli_pulisci):
--   voli_voli        prezzi attuali: tratte di sola andata (le combina l'app in andata + ritorno) o soluzioni
--                    andata e ritorno già complete (Google Flights). Univoci per spazio + chiave: le ricerche
--                    successive aggiornano la stessa riga; "attivo" = trovato nell'ultima ricerca che ne ha coperto
--                    tratta e data;
--   voli_prezzi      storico del prezzo di ogni volo: una riga quando cambia e almeno una al giorno;
--   voli_andamento   miglior prezzo di ogni monitoraggio a ogni ricerca (grafico e statistiche sull'ora di ricerca);
--   voli_avvisi      prezzo obiettivo raggiunto, nuovo minimo storico, calo forte;
--   voli_esecuzioni  registro delle ricerche (routine di Claude o a mano), con l'esito di ogni fonte.
-- Da applicare DOPO le migrazioni base (spazi e condivisione).

create table public.voli_ricerche (
  id                  uuid primary key default gen_random_uuid(),
  space_id            uuid not null references private.spaces(id),
  owner_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome                text not null check (length(trim(nome)) between 1 and 80),
  origini             text[] not null check (array_to_string(origini, ',') ~ '^[A-Z]{3}(,[A-Z]{3}){0,9}$'),
  destinazioni        text[] not null check (array_to_string(destinazioni, ',') ~ '^[A-Z]{3}(,[A-Z]{3}){0,9}$'),
  partenza_da         date not null,
  partenza_a          date not null,
  solo_andata         boolean not null default false,
  durata_min          smallint not null default 2 check (durata_min between 0 and 60),
  durata_max          smallint not null default 7 check (durata_max between 0 and 60),
  adulti              smallint not null default 1 check (adulti between 1 and 9),
  max_scali           smallint check (max_scali is null or max_scali between 0 and 3),
  compagnie           text[] not null default '{}' check (cardinality(compagnie) <= 20),
  solo_compagnie      boolean not null default false, -- true: solo le compagnie preferite; false: le evidenzia
  compagnie_escluse   text[] not null default '{}' check (cardinality(compagnie_escluse) <= 20),
  fonti               text[] not null default '{}' check (cardinality(fonti) <= 20), -- vuoto = tutte le attive
  giorni_andata       smallint[] not null default '{}' check (giorni_andata <@ '{1,2,3,4,5,6,7}'::smallint[]), -- 1 = lunedì
  andata_dopo         time,
  andata_prima        time,
  giorni_ritorno      smallint[] not null default '{}' check (giorni_ritorno <@ '{1,2,3,4,5,6,7}'::smallint[]),
  ritorno_dopo        time,
  ritorno_prima       time,
  rientro_altro       boolean not null default false, -- ritorno anche su un altro aeroporto tra le origini
  compagnie_miste     boolean not null default false, -- andata e ritorno anche con compagnie diverse
  prezzo_obiettivo    numeric(8, 2) check (prezzo_obiettivo is null or prezzo_obiettivo > 0),
  avvisa_minimo       boolean not null default true,
  avvisa_calo         smallint default 15 check (avvisa_calo is null or avvisa_calo between 1 and 90), -- % rispetto alla ricerca precedente
  attiva              boolean not null default true,
  note                text not null default '' check (length(note) <= 500),
  -- stato scritto da voli_registra (azzerato quando cambiano i criteri)
  migliore            numeric(8, 2),
  migliore_il         timestamptz,
  minimo_storico      numeric(8, 2),
  minimo_il           timestamptz,
  avvisato_obiettivo  numeric(8, 2),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (partenza_a >= partenza_da and partenza_a - partenza_da <= 366),
  check (durata_max >= durata_min),
  unique (id, space_id) -- per le chiavi esterne composte: andamento e avvisi solo di monitoraggi dello stesso spazio
);
create unique index voli_ricerche_space_nome_key on public.voli_ricerche (space_id, lower(nome));
create index on public.voli_ricerche (owner_id);

create table public.voli_fonti (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references private.spaces(id),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codice      text not null check (codice ~ '^[a-z0-9_]{2,20}$'),
  attiva      boolean not null default true,
  note        text not null default '' check (length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (space_id, codice)
);
create index on public.voli_fonti (owner_id);

create table public.voli_voli (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references private.spaces(id),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fonte          text not null check (fonte ~ '^[a-z0-9_]{2,20}$'),
  tipo           text not null check (tipo in ('tratta', 'ar')), -- tratta = sola andata; ar = andata e ritorno
  origine        text not null check (origine ~ '^[A-Z]{3}$'),
  destinazione   text not null check (destinazione ~ '^[A-Z]{3}$'),
  data           date not null,
  partenza       time,
  arrivo         time,
  arrivo_giorni  smallint not null default 0 check (arrivo_giorni between 0 and 3),
  volo           text not null default '' check (length(volo) <= 40),
  compagnia      text not null default '' check (length(compagnia) <= 120),
  scali          smallint not null default 0 check (scali between 0 and 5),
  durata_min     int check (durata_min is null or durata_min between 0 and 4320),
  -- solo per tipo 'ar': il ritorno parte da "destinazione" e arriva a "ritorno_a"
  ritorno_a      text check (ritorno_a is null or ritorno_a ~ '^[A-Z]{3}$'),
  data_ritorno   date,
  rit_partenza   time,
  rit_arrivo     time,
  rit_compagnia  text check (rit_compagnia is null or length(rit_compagnia) <= 120),
  rit_scali      smallint check (rit_scali is null or rit_scali between 0 and 5),
  prezzo         numeric(8, 2) not null check (prezzo > 0), -- a persona (per 'ar' il totale andata e ritorno)
  prezzo_prec    numeric(8, 2),
  prezzo_min     numeric(8, 2) not null,
  prezzo_max     numeric(8, 2) not null,
  volte          int not null default 1,
  attivo         boolean not null default true,
  url            text not null default '' check (length(url) <= 600),
  note           text not null default '' check (length(note) <= 200),
  chiave         text not null,
  primo_visto    timestamptz not null default now(),
  ultimo_visto   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (tipo = 'tratta' or (data_ritorno is not null and ritorno_a is not null and data_ritorno >= data)),
  constraint voli_voli_univoca unique (space_id, chiave),
  unique (id, space_id)
);
create index on public.voli_voli (space_id, data);
create index on public.voli_voli (owner_id);

-- Storico prezzi: righe immutabili (niente updated_at).
create table public.voli_prezzi (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references private.spaces(id),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  volo_id      uuid not null,
  rilevato_il  timestamptz not null default now(),
  prezzo       numeric(8, 2) not null,
  foreign key (volo_id, space_id) references public.voli_voli (id, space_id) on delete cascade
);
create index on public.voli_prezzi (volo_id, space_id, rilevato_il desc);
create index on public.voli_prezzi (space_id, rilevato_il);
create index on public.voli_prezzi (owner_id);

create table public.voli_andamento (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references private.spaces(id),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ricerca_id   uuid not null,
  rilevato_il  timestamptz not null default now(),
  prezzo       numeric(8, 2) not null,
  soluzione    jsonb not null default '{}',
  foreign key (ricerca_id, space_id) references public.voli_ricerche (id, space_id) on update cascade on delete cascade
);
create index on public.voli_andamento (ricerca_id, space_id, rilevato_il);
create index on public.voli_andamento (space_id);
create index on public.voli_andamento (owner_id);

create table public.voli_avvisi (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references private.spaces(id),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ricerca_id   uuid not null,
  tipo         text not null check (tipo in ('obiettivo', 'minimo', 'calo')),
  prezzo       numeric(8, 2) not null,
  riferimento  numeric(8, 2), -- obiettivo, minimo precedente o prezzo della ricerca precedente
  soluzione    jsonb not null default '{}',
  letto        boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (ricerca_id, space_id) references public.voli_ricerche (id, space_id) on update cascade on delete cascade
);
create index on public.voli_avvisi (space_id, created_at desc);
create index on public.voli_avvisi (ricerca_id, space_id);
create index on public.voli_avvisi (owner_id);

create table public.voli_esecuzioni (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references private.spaces(id),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fonte        text not null default 'claude' check (fonte in ('claude', 'manuale', 'json')),
  fonti        jsonb not null default '{}', -- { "ryanair": { "ok": true, "richieste": 12, "voli": 80, "errore": "" }, … }
  ricerche     int not null default 0,
  nuovi        int not null default 0,
  aggiornati   int not null default 0,
  disattivati  int not null default 0,
  scartati     int not null default 0,
  avvisi       int not null default 0,
  note         text not null default '' check (length(note) <= 2000),
  created_at   timestamptz not null default now()
);
create index on public.voli_esecuzioni (space_id, created_at desc);
create index on public.voli_esecuzioni (owner_id);

-- RLS standard per spazi (vedi CONVENTIONS.md).
do $$
declare t text;
begin
  foreach t in array array['voli_ricerche', 'voli_fonti', 'voli_voli', 'voli_prezzi', 'voli_andamento', 'voli_avvisi', 'voli_esecuzioni'] loop
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
  end loop;
  foreach t in array array['voli_ricerche', 'voli_fonti', 'voli_voli', 'voli_avvisi'] loop
    execute format('create trigger set_updated_at before update on public.%I
      for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Se cambiano i criteri di un monitoraggio, miglior prezzo e minimo storico non sono più confrontabili: si azzerano.
create or replace function public.voli_ricerca_azzera()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.origini, new.destinazioni, new.partenza_da, new.partenza_a, new.solo_andata, new.durata_min, new.durata_max,
      new.max_scali, new.compagnie, new.solo_compagnie, new.compagnie_escluse, new.fonti, new.giorni_andata,
      new.andata_dopo, new.andata_prima, new.giorni_ritorno, new.ritorno_dopo, new.ritorno_prima, new.rientro_altro,
      new.compagnie_miste)
     is distinct from
     (old.origini, old.destinazioni, old.partenza_da, old.partenza_a, old.solo_andata, old.durata_min, old.durata_max,
      old.max_scali, old.compagnie, old.solo_compagnie, old.compagnie_escluse, old.fonti, old.giorni_andata,
      old.andata_dopo, old.andata_prima, old.giorni_ritorno, old.ritorno_dopo, old.ritorno_prima, old.rientro_altro,
      old.compagnie_miste) then
    new.migliore := null;
    new.migliore_il := null;
    new.minimo_storico := null;
    new.minimo_il := null;
    new.avvisato_obiettivo := null;
  elsif new.prezzo_obiettivo is distinct from old.prezzo_obiettivo then
    new.avvisato_obiettivo := null;
  end if;
  return new;
end $$;
revoke all on function public.voli_ricerca_azzera() from public, anon, authenticated;

create trigger voli_ricerca_azzera before update on public.voli_ricerche
  for each row execute function public.voli_ricerca_azzera();

/**
 * Configurazione per la routine: monitoraggi attivi non ancora scaduti e fonti dello spazio.
 * Security invoker: dall'app valgono le policy RLS dello spazio.
 */
create or replace function public.voli_config(p_space_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'space_id', p_space_id,
    'oggi', current_date,
    'ricerche', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.nome)
      from (
        select id, nome, origini, destinazioni, partenza_da, partenza_a, solo_andata, durata_min, durata_max, adulti,
               max_scali, compagnie, solo_compagnie, compagnie_escluse, fonti, giorni_andata, andata_dopo, andata_prima,
               giorni_ritorno, ritorno_dopo, ritorno_prima, rientro_altro, compagnie_miste, prezzo_obiettivo,
               migliore, minimo_storico
        from public.voli_ricerche
        where space_id = p_space_id and attiva and partenza_a >= current_date
      ) r), '[]'::jsonb),
    'fonti', coalesce((
      select jsonb_object_agg(codice, attiva) from public.voli_fonti where space_id = p_space_id), '{}'::jsonb)
  )
$$;
revoke all on function public.voli_config(uuid) from public, anon;
grant execute on function public.voli_config(uuid) to authenticated;

/**
 * Registra i voli trovati in una ricerca, aggiorna lo storico e genera gli avvisi.
 * p_dati (prodotto da scripts/voli/cerca.mjs):
 * {
 *   "tratte": [ ["ryanair","BLQ","BCN","2026-11-12","08:40","10:25","FR574",34.99], … ]
 *             -- [fonte, origine, destinazione, data, partenza, arrivo ("01:10+1" se arriva il giorno dopo), volo,
 *             --  prezzo, compagnia?, scali?, durata in minuti?] oppure lo stesso come oggetto con quei nomi
 *   "ar":     [ ["google","BLQ","BCN","2026-11-12","08:40","10:25","Ryanair",0,105,"BLQ","2026-11-16",81], … ]
 *             -- [fonte, origine, destinazione, data, partenza, arrivo, compagnia, scali, durata, ritorno_a, data_ritorno,
 *             --  prezzo, url?] oppure oggetti con quei nomi (più rit_partenza, rit_arrivo, rit_compagnia, rit_scali)
 *   "coperture": [ ["ryanair","BLQ","BCN","2026-11-01","2026-11-30"], ["google","BLQ","BCN","2026-11-12","2026-11-12","2026-11-16"] ]
 *             -- tratte e date cercate con successo: i voli lì non ritrovati diventano non attivi
 *   "migliori": [ { "ricerca":"<uuid>", "prezzo":79.63, "soluzione":{…} } ]   -- miglior soluzione per monitoraggio
 *   "fonti":  { "ryanair": { "ok":true, "richieste":12, "voli":80, "errore":"" }, … },
 *   "note":   "…",
 *   "esecuzione": "<uuid>"  -- facoltativo: id della riga del registro (la crea se non c'è): le parti di un payload
 *                              diviso si sommano alla stessa riga
 * }
 * Security invoker: dall'app valgono le policy RLS. Senza utente (SQL dal connettore, usato dalla routine di Claude)
 * le righe vengono attribuite al titolare dello spazio.
 */
create or replace function public.voli_registra(p_space_id uuid, p_dati jsonb, p_fonte text default 'claude')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_owner     uuid := auth.uid();
  v_now       timestamptz := now();
  v_oggi      date := (now() at time zone 'Europe/Rome')::date;
  v           jsonb;
  v_i         int := 0;
  v_tipo      text;
  v_fonte     text;
  v_o         text;
  v_d         text;
  v_data      date;
  v_part      time;
  v_arr       time;
  v_arr_gg    int;
  v_comp      text;
  v_prezzo    numeric;
  v_ra        text;
  v_dr        date;
  v_chiave    text;
  v_id        uuid;
  v_ins       boolean;
  v_last_p    numeric;
  v_last_t    timestamptz;
  v_n         int;
  v_nuovi     int := 0;
  v_agg       int := 0;
  v_disatt    int := 0;
  v_errori    jsonb := '[]';
  v_avvisi    jsonb := '[]';
  v_r         public.voli_ricerche;
  v_best      numeric;
  v_sol       jsonb;
  v_avvisato  numeric;
  v_esec      uuid;
  v_ricerche  int := 0;
begin
  if p_fonte not in ('claude', 'manuale', 'json') then raise exception 'Fonte non valida: %', p_fonte; end if;
  if jsonb_typeof(p_dati) is distinct from 'object' then raise exception 'Mi aspetto un oggetto con tratte, ar, coperture, migliori'; end if;
  if v_owner is null then
    select owner_id into v_owner from private.spaces where id = p_space_id and app_slug = 'voli';
    if v_owner is null then raise exception 'Spazio % non trovato', p_space_id; end if;
  end if;

  -- 1. Voli: tratte (array compatti o oggetti) e soluzioni andata e ritorno.
  for v in
    select case jsonb_typeof(x)
             when 'array' then jsonb_build_object('tipo', 'tratta', 'fonte', x->>0, 'origine', x->>1, 'destinazione', x->>2,
               'data', x->>3, 'partenza', x->>4, 'arrivo', x->>5, 'volo', x->>6, 'prezzo', x->7, 'compagnia', x->>8,
               'scali', x->9, 'durata', x->10)
             else x || '{"tipo":"tratta"}' end
    from jsonb_array_elements(case when jsonb_typeof(p_dati->'tratte') = 'array' then p_dati->'tratte' else '[]' end) x
    union all
    select case jsonb_typeof(x)
             when 'array' then jsonb_build_object('tipo', 'ar', 'fonte', x->>0, 'origine', x->>1, 'destinazione', x->>2,
               'data', x->>3, 'partenza', x->>4, 'arrivo', x->>5, 'compagnia', x->>6, 'scali', x->7, 'durata', x->8,
               'ritorno_a', x->>9, 'data_ritorno', x->>10, 'prezzo', x->11, 'url', x->>12)
             else x || '{"tipo":"ar"}' end
    from jsonb_array_elements(case when jsonb_typeof(p_dati->'ar') = 'array' then p_dati->'ar' else '[]' end) x
    where jsonb_typeof(x) in ('object', 'array')
  loop
    v_i := v_i + 1;
    begin
      v_tipo := v->>'tipo';
      v_fonte := lower(trim(coalesce(v->>'fonte', '')));
      v_o := upper(trim(coalesce(v->>'origine', '')));
      v_d := upper(trim(coalesce(v->>'destinazione', '')));
      v_data := (v->>'data')::date;
      if v_data < v_oggi then raise exception 'data passata'; end if;
      v_part := nullif(trim(coalesce(v->>'partenza', '')), '')::time;
      v_arr := nullif(split_part(trim(coalesce(v->>'arrivo', '')), '+', 1), '')::time;
      v_arr_gg := coalesce(nullif(split_part(trim(coalesce(v->>'arrivo', '')), '+', 2), '')::int, 0);
      v_prezzo := round(nullif(trim(v->>'prezzo'), '')::numeric, 2);
      if v_prezzo is null or v_prezzo <= 0 then raise exception 'prezzo mancante'; end if;
      v_comp := left(trim(coalesce(nullif(trim(v->>'compagnia'), ''),
        case v_fonte when 'ryanair' then 'Ryanair' when 'wizz' then 'Wizz Air' else '' end)), 120);
      v_ra := null;
      v_dr := null;
      if v_tipo = 'ar' then
        v_ra := upper(trim(coalesce(nullif(v->>'ritorno_a', ''), v_o)));
        v_dr := (v->>'data_ritorno')::date;
        if v_dr is null then raise exception 'data di ritorno mancante'; end if;
      end if;
      v_chiave := concat_ws('|', v_fonte, v_tipo, v_o, v_d, v_data, to_char(v_part, 'HH24:MI'), lower(v_comp), v_ra, v_dr);

      insert into public.voli_voli as w
        (space_id, owner_id, fonte, tipo, origine, destinazione, data, partenza, arrivo, arrivo_giorni, volo, compagnia,
         scali, durata_min, ritorno_a, data_ritorno, rit_partenza, rit_arrivo, rit_compagnia, rit_scali,
         prezzo, prezzo_min, prezzo_max, url, note, chiave, primo_visto, ultimo_visto)
      values (
        p_space_id, v_owner, v_fonte, v_tipo, v_o, v_d, v_data, v_part, v_arr, v_arr_gg,
        left(trim(coalesce(v->>'volo', '')), 40), v_comp,
        coalesce(nullif(v->>'scali', '')::int, 0), nullif(v->>'durata', '')::int,
        v_ra, v_dr,
        case when v_tipo = 'ar' then nullif(trim(coalesce(v->>'rit_partenza', '')), '')::time end,
        case when v_tipo = 'ar' then nullif(split_part(trim(coalesce(v->>'rit_arrivo', '')), '+', 1), '')::time end,
        case when v_tipo = 'ar' then nullif(left(trim(coalesce(v->>'rit_compagnia', '')), 120), '') end,
        case when v_tipo = 'ar' then nullif(v->>'rit_scali', '')::int end,
        v_prezzo, v_prezzo, v_prezzo,
        left(trim(coalesce(v->>'url', '')), 600), left(trim(coalesce(v->>'note', '')), 200),
        v_chiave, v_now, v_now
      )
      on conflict on constraint voli_voli_univoca do update
        set prezzo_prec = case when w.prezzo is distinct from excluded.prezzo then w.prezzo else w.prezzo_prec end,
            prezzo = excluded.prezzo,
            prezzo_min = least(w.prezzo_min, excluded.prezzo),
            prezzo_max = greatest(w.prezzo_max, excluded.prezzo),
            arrivo = coalesce(excluded.arrivo, w.arrivo),
            arrivo_giorni = case when excluded.arrivo is null then w.arrivo_giorni else excluded.arrivo_giorni end,
            volo = coalesce(nullif(excluded.volo, ''), w.volo),
            scali = excluded.scali,
            durata_min = coalesce(excluded.durata_min, w.durata_min),
            rit_partenza = coalesce(excluded.rit_partenza, w.rit_partenza),
            rit_arrivo = coalesce(excluded.rit_arrivo, w.rit_arrivo),
            rit_compagnia = coalesce(excluded.rit_compagnia, w.rit_compagnia),
            rit_scali = coalesce(excluded.rit_scali, w.rit_scali),
            url = coalesce(nullif(excluded.url, ''), w.url),
            note = excluded.note,
            volte = w.volte + case when w.ultimo_visto = excluded.ultimo_visto then 0 else 1 end,
            attivo = true,
            ultimo_visto = excluded.ultimo_visto
      returning id, (xmax = 0) into v_id, v_ins;
      if v_ins then v_nuovi := v_nuovi + 1; else v_agg := v_agg + 1; end if;

      -- Storico: una riga se il prezzo è cambiato o se oggi non c'è ancora.
      select prezzo, rilevato_il into v_last_p, v_last_t
        from public.voli_prezzi where volo_id = v_id and space_id = p_space_id
       order by rilevato_il desc limit 1;
      if not found or v_last_p <> v_prezzo
         or (v_last_t at time zone 'Europe/Rome')::date < (v_now at time zone 'Europe/Rome')::date then
        insert into public.voli_prezzi (space_id, owner_id, volo_id, rilevato_il, prezzo)
        values (p_space_id, v_owner, v_id, v_now, v_prezzo);
      end if;
    exception when others then
      v_errori := v_errori || jsonb_build_object('n', v_i, 'volo', concat_ws(' ', v->>'fonte', v->>'origine', v->>'destinazione', v->>'data'), 'errore', sqlerrm);
    end;
  end loop;

  -- 2. Coperture: i voli già noti nelle tratte e date cercate ma non ritrovati non sono più attivi.
  for v in select x from jsonb_array_elements(case when jsonb_typeof(p_dati->'coperture') = 'array' then p_dati->'coperture' else '[]' end) x
           where jsonb_typeof(x) = 'array' and jsonb_array_length(x) >= 5
  loop
    begin
      update public.voli_voli
         set attivo = false
       where space_id = p_space_id
         and fonte = lower(v->>0) and origine = upper(v->>1) and destinazione = upper(v->>2)
         and data between (v->>3)::date and (v->>4)::date
         and case when nullif(v->>5, '') is null then tipo = 'tratta' else tipo = 'ar' and data_ritorno = (v->>5)::date end
         and attivo and ultimo_visto < v_now;
      get diagnostics v_n = row_count;
      v_disatt := v_disatt + v_n;
    exception when others then
      v_errori := v_errori || jsonb_build_object('copertura', v, 'errore', sqlerrm);
    end;
  end loop;

  -- 3. Miglior prezzo per monitoraggio: andamento e avvisi.
  for v in select x from jsonb_array_elements(case when jsonb_typeof(p_dati->'migliori') = 'array' then p_dati->'migliori' else '[]' end) x
           where jsonb_typeof(x) = 'object'
  loop
    begin
      select * into v_r from public.voli_ricerche
       where id = (v->>'ricerca')::uuid and space_id = p_space_id for update;
      if not found then raise exception 'monitoraggio non trovato'; end if;
      v_ricerche := v_ricerche + 1;
      v_best := round(nullif(v->>'prezzo', '')::numeric, 2);
      v_sol := case when jsonb_typeof(v->'soluzione') = 'object' and length((v->'soluzione')::text) <= 3000 then v->'soluzione' else '{}' end;
      if v_best is null or v_best <= 0 then
        -- nessuna soluzione che rispetti i criteri
        update public.voli_ricerche set migliore = null, migliore_il = v_now where id = v_r.id;
        continue;
      end if;

      insert into public.voli_andamento (space_id, owner_id, ricerca_id, rilevato_il, prezzo, soluzione)
      values (p_space_id, v_owner, v_r.id, v_now, v_best, v_sol);

      v_avvisato := v_r.avvisato_obiettivo;
      if v_r.prezzo_obiettivo is not null and v_best <= v_r.prezzo_obiettivo then
        if v_r.avvisato_obiettivo is null or v_best < v_r.avvisato_obiettivo then
          insert into public.voli_avvisi (space_id, owner_id, ricerca_id, tipo, prezzo, riferimento, soluzione, created_at, updated_at)
          values (p_space_id, v_owner, v_r.id, 'obiettivo', v_best, v_r.prezzo_obiettivo, v_sol, v_now, v_now);
          v_avvisi := v_avvisi || jsonb_build_object('ricerca', v_r.nome, 'tipo', 'obiettivo', 'prezzo', v_best, 'riferimento', v_r.prezzo_obiettivo);
          v_avvisato := v_best;
        end if;
      else
        v_avvisato := null; -- di nuovo sopra l'obiettivo: alla prossima discesa si avvisa ancora
      end if;

      if v_r.avvisa_minimo and v_r.minimo_storico is not null and v_best < v_r.minimo_storico then
        insert into public.voli_avvisi (space_id, owner_id, ricerca_id, tipo, prezzo, riferimento, soluzione, created_at, updated_at)
        values (p_space_id, v_owner, v_r.id, 'minimo', v_best, v_r.minimo_storico, v_sol, v_now, v_now);
        v_avvisi := v_avvisi || jsonb_build_object('ricerca', v_r.nome, 'tipo', 'minimo', 'prezzo', v_best, 'riferimento', v_r.minimo_storico);
      elsif v_r.avvisa_calo is not null and v_r.migliore is not null
            and v_best <= v_r.migliore * (1 - v_r.avvisa_calo / 100.0) then
        insert into public.voli_avvisi (space_id, owner_id, ricerca_id, tipo, prezzo, riferimento, soluzione, created_at, updated_at)
        values (p_space_id, v_owner, v_r.id, 'calo', v_best, v_r.migliore, v_sol, v_now, v_now);
        v_avvisi := v_avvisi || jsonb_build_object('ricerca', v_r.nome, 'tipo', 'calo', 'prezzo', v_best, 'riferimento', v_r.migliore);
      end if;

      update public.voli_ricerche
         set migliore = v_best,
             migliore_il = v_now,
             minimo_storico = least(coalesce(v_r.minimo_storico, v_best), v_best),
             minimo_il = case when v_r.minimo_storico is null or v_best < v_r.minimo_storico then v_now else v_r.minimo_il end,
             avvisato_obiettivo = v_avvisato
       where id = v_r.id;
    exception when others then
      v_errori := v_errori || jsonb_build_object('ricerca', v->>'ricerca', 'errore', sqlerrm);
    end;
  end loop;

  -- 4. Registro (una riga per ricerca; le parti successive di un payload diviso si sommano).
  v_esec := nullif(p_dati->>'esecuzione', '')::uuid;
  if v_esec is not null then
    update public.voli_esecuzioni
       set fonti = fonti || case when jsonb_typeof(p_dati->'fonti') = 'object' then p_dati->'fonti' else '{}' end,
           ricerche = ricerche + v_ricerche, nuovi = nuovi + v_nuovi, aggiornati = aggiornati + v_agg,
           disattivati = disattivati + v_disatt, scartati = scartati + jsonb_array_length(v_errori),
           avvisi = avvisi + jsonb_array_length(v_avvisi),
           note = left(concat_ws(' ', nullif(note, ''), nullif(trim(p_dati->>'note'), '')), 2000)
     where id = v_esec and space_id = p_space_id;
  end if;
  if v_esec is null or not found then
    insert into public.voli_esecuzioni (id, space_id, owner_id, fonte, fonti, ricerche, nuovi, aggiornati, disattivati, scartati, avvisi, note, created_at)
    values (coalesce(v_esec, gen_random_uuid()), p_space_id, v_owner, p_fonte,
            case when jsonb_typeof(p_dati->'fonti') = 'object' then p_dati->'fonti' else '{}' end,
            v_ricerche, v_nuovi, v_agg, v_disatt, jsonb_array_length(v_errori), jsonb_array_length(v_avvisi),
            left(coalesce(trim(p_dati->>'note'), ''), 2000), v_now)
    returning id into v_esec;
  end if;

  return jsonb_build_object('esecuzione', v_esec, 'nuovi', v_nuovi, 'aggiornati', v_agg, 'disattivati', v_disatt,
                            'scartati', jsonb_array_length(v_errori), 'errori', v_errori, 'avvisi', v_avvisi);
end $$;
revoke all on function public.voli_registra(uuid, jsonb, text) from public, anon;
grant execute on function public.voli_registra(uuid, jsonb, text) to authenticated;

/**
 * Pulizia dei dati non fondamentali di uno spazio. Ogni parametro null = non toccare quella tabella.
 *   p_giorni_voli     voli (con il loro storico) il cui viaggio è finito da più di N giorni
 *   p_giorni_registro registro delle ricerche e avvisi già letti più vecchi di N giorni
 *   p_mesi_andamento  andamento dei monitoraggi più vecchio di N mesi
 * Restituisce quante righe ha cancellato per tabella. Security invoker: dall'app valgono le policy RLS.
 */
create or replace function public.voli_pulisci(
  p_space_id uuid, p_giorni_voli int default 30, p_giorni_registro int default 90, p_mesi_andamento int default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_voli int := 0;
  v_reg  int := 0;
  v_avv  int := 0;
  v_and  int := 0;
begin
  if p_giorni_voli is not null then
    delete from public.voli_voli
     where space_id = p_space_id and coalesce(data_ritorno, data) < current_date - greatest(p_giorni_voli, 0);
    get diagnostics v_voli = row_count;
  end if;
  if p_giorni_registro is not null then
    delete from public.voli_esecuzioni
     where space_id = p_space_id and created_at < now() - make_interval(days => greatest(p_giorni_registro, 0));
    get diagnostics v_reg = row_count;
    delete from public.voli_avvisi
     where space_id = p_space_id and letto and created_at < now() - make_interval(days => greatest(p_giorni_registro, 0));
    get diagnostics v_avv = row_count;
  end if;
  if p_mesi_andamento is not null then
    delete from public.voli_andamento
     where space_id = p_space_id and rilevato_il < now() - make_interval(months => greatest(p_mesi_andamento, 0));
    get diagnostics v_and = row_count;
  end if;
  return jsonb_build_object('voli', v_voli, 'registro', v_reg, 'avvisi', v_avv, 'andamento', v_and);
end $$;
revoke all on function public.voli_pulisci(uuid, int, int, int) from public, anon;
grant execute on function public.voli_pulisci(uuid, int, int, int) to authenticated;

/**
 * Sposta un monitoraggio in un altro spazio dell'app (di solito uno spazio condiviso creato apposta per condividerlo):
 * andamento e avvisi lo seguono (chiavi esterne "on update cascade"); i voli delle sue tratte, con il loro storico,
 * vengono copiati, perché nello spazio di partenza possono servire anche ad altri monitoraggi.
 * Security invoker: serve poter scrivere in entrambi gli spazi. Restituisce quanti voli ha copiato.
 */
create or replace function public.voli_sposta(p_ricerca uuid, p_space uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_r     public.voli_ricerche;
  v_owner uuid := auth.uid();
  v_voli  int := 0;
  v_now   timestamptz := now();
begin
  if (public.space_info(p_space) ->> 'app_slug') is distinct from 'voli' then
    raise exception 'Spazio di destinazione non valido' using errcode = '42501';
  end if;
  select * into v_r from public.voli_ricerche where id = p_ricerca for update;
  if not found then raise exception 'Monitoraggio non trovato'; end if;
  if v_r.space_id = p_space then return jsonb_build_object('voli', 0); end if;
  if v_owner is null then
    select owner_id into v_owner from private.spaces where id = p_space;
  end if;

  update public.voli_ricerche set space_id = p_space where id = p_ricerca;

  insert into public.voli_voli
    (space_id, owner_id, fonte, tipo, origine, destinazione, data, partenza, arrivo, arrivo_giorni, volo, compagnia,
     scali, durata_min, ritorno_a, data_ritorno, rit_partenza, rit_arrivo, rit_compagnia, rit_scali, prezzo, prezzo_prec,
     prezzo_min, prezzo_max, volte, attivo, url, note, chiave, primo_visto, ultimo_visto, created_at)
  select p_space, v_owner, fonte, tipo, origine, destinazione, data, partenza, arrivo, arrivo_giorni, volo, compagnia,
         scali, durata_min, ritorno_a, data_ritorno, rit_partenza, rit_arrivo, rit_compagnia, rit_scali, prezzo, prezzo_prec,
         prezzo_min, prezzo_max, volte, attivo, url, note, chiave, primo_visto, ultimo_visto, v_now
    from public.voli_voli
   where space_id = v_r.space_id
     and ((origine = any (v_r.origini) and destinazione = any (v_r.destinazioni))
       or (origine = any (v_r.destinazioni) and destinazione = any (v_r.origini)))
  on conflict on constraint voli_voli_univoca do nothing;
  get diagnostics v_voli = row_count;

  insert into public.voli_prezzi (space_id, owner_id, volo_id, rilevato_il, prezzo)
  select p_space, v_owner, n.id, p.rilevato_il, p.prezzo
    from public.voli_voli n
    join public.voli_voli o on o.space_id = v_r.space_id and o.chiave = n.chiave
    join public.voli_prezzi p on p.volo_id = o.id and p.space_id = o.space_id
   where n.space_id = p_space and n.created_at = v_now;

  return jsonb_build_object('voli', v_voli);
end $$;
revoke all on function public.voli_sposta(uuid, uuid) from public, anon;
grant execute on function public.voli_sposta(uuid, uuid) to authenticated;
