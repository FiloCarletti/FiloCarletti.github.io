-- Offerte: supermercati seguiti, prodotti di interesse e offerte dei volantini, per spazio.
--
-- Dati fondamentali (piccoli, da tenere): offerte_supermercati, offerte_prodotti.
-- Dati ripulibili (crescono nel tempo, vedi offerte_pulisci):
--   offerte_offerte  una riga per offerta, univoca per supermercato + prodotto (nome, marca, formato) + inizio
--                    validità: le ricerche dei giorni successivi aggiornano la stessa riga invece di duplicarla;
--   offerte_storico  prezzo e validità di ogni offerta, compatto, scritto da un trigger: resta anche quando le
--                    offerte scadute vengono cancellate;
--   offerte_ricerche registro delle ricerche (a mano, import, routine di Claude).
-- Da applicare DOPO le migrazioni base (spazi e condivisione).

create table public.offerte_supermercati (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references private.spaces(id),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome           text not null check (length(trim(nome)) between 1 and 80),
  zona           text not null default '' check (length(zona) <= 120),
  volantino_url  text not null default '' check (length(volantino_url) <= 500),
  note           text not null default '' check (length(note) <= 500),
  attivo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, space_id) -- per le chiavi esterne composte: offerte e storico solo di supermercati dello stesso spazio
);
create unique index offerte_supermercati_space_nome_key on public.offerte_supermercati (space_id, lower(nome));
create index on public.offerte_supermercati (owner_id);

-- Prodotto di interesse: si riconosce nelle offerte da nome e parole alternative (tutte le parole di un
-- termine devono comparire), filtrato da marca ed esclusioni. prezzo_max: soglia del "buon prezzo",
-- al pezzo (prezzo) o al kg/litro (prezzo_unitario).
create table public.offerte_prodotti (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references private.spaces(id),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null check (length(trim(nome)) between 1 and 80),
  parole      text[] not null default '{}' check (cardinality(parole) <= 20),
  escludi     text[] not null default '{}' check (cardinality(escludi) <= 20),
  marca       text not null default '' check (length(marca) <= 80),
  categoria   text not null default '' check (length(categoria) <= 60),
  prezzo_max  numeric(10, 2) check (prezzo_max is null or prezzo_max > 0),
  prezzo_per  text not null default 'pz' check (prezzo_per in ('pz', 'kg', 'l')),
  note        text not null default '' check (length(note) <= 500),
  attivo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index offerte_prodotti_space_nome_key on public.offerte_prodotti (space_id, lower(nome));
create index on public.offerte_prodotti (owner_id);

create table public.offerte_offerte (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references private.spaces(id),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  supermercato_id  uuid not null,
  nome             text not null check (length(trim(nome)) between 1 and 160),
  marca            text not null default '' check (length(marca) <= 80),
  formato          text not null default '' check (length(formato) <= 60),
  categoria        text not null default '' check (length(categoria) <= 60),
  prezzo           numeric(10, 2) not null check (prezzo > 0),
  prezzo_pieno     numeric(10, 2) check (prezzo_pieno is null or prezzo_pieno >= prezzo),
  prezzo_unitario  numeric(10, 2) check (prezzo_unitario is null or prezzo_unitario > 0),
  unita            text check (unita is null or unita in ('kg', 'l', 'pz')),
  condizioni       text not null default '' check (length(condizioni) <= 200),
  valido_da        date not null,
  valido_fino      date not null,
  url              text not null default '' check (length(url) <= 500),
  fonte            text not null default 'manuale' check (fonte in ('manuale', 'json', 'claude')),
  visto_il         date not null default current_date, -- ultima ricerca che l'ha trovata
  chiave           text not null generated always as (lower(regexp_replace(trim(nome || ' ' || marca || ' ' || formato), '\s+', ' ', 'g'))) stored,
  sconto_pct       smallint generated always as (case when prezzo_pieno > prezzo then round((1 - prezzo / prezzo_pieno) * 100)::smallint end) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (valido_fino >= valido_da),
  foreign key (supermercato_id, space_id) references public.offerte_supermercati (id, space_id) on delete cascade,
  constraint offerte_offerte_univoca unique (space_id, supermercato_id, chiave, valido_da)
);
create index on public.offerte_offerte (space_id, valido_fino);
create index on public.offerte_offerte (supermercato_id, space_id);
create index on public.offerte_offerte (owner_id);

-- Storico prezzi: righe immutabili (niente updated_at), una per offerta. `nome` = nome + marca + formato.
create table public.offerte_storico (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references private.spaces(id),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  supermercato_id  uuid not null,
  nome             text not null,
  chiave           text not null generated always as (lower(nome)) stored,
  prezzo           numeric(10, 2) not null,
  prezzo_pieno     numeric(10, 2),
  prezzo_unitario  numeric(10, 2),
  unita            text,
  valido_da        date not null,
  valido_fino      date not null,
  created_at       timestamptz not null default now(),
  foreign key (supermercato_id, space_id) references public.offerte_supermercati (id, space_id) on delete cascade,
  constraint offerte_storico_univoca unique (space_id, supermercato_id, chiave, valido_da)
);
create index on public.offerte_storico (space_id, valido_da);
create index on public.offerte_storico (supermercato_id, space_id);
create index on public.offerte_storico (owner_id);

create table public.offerte_ricerche (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references private.spaces(id),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fonte         text not null default 'manuale' check (fonte in ('manuale', 'json', 'claude')),
  supermercati  text[] not null default '{}',
  nuove         int not null default 0,
  aggiornate    int not null default 0,
  scartate      int not null default 0,
  note          text not null default '' check (length(note) <= 2000),
  created_at    timestamptz not null default now()
);
create index on public.offerte_ricerche (space_id, created_at desc);
create index on public.offerte_ricerche (owner_id);

-- RLS standard per spazi (vedi CONVENTIONS.md).
do $$
declare t text;
begin
  foreach t in array array['offerte_supermercati', 'offerte_prodotti', 'offerte_offerte', 'offerte_storico', 'offerte_ricerche'] loop
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
  foreach t in array array['offerte_supermercati', 'offerte_prodotti', 'offerte_offerte'] loop
    execute format('create trigger set_updated_at before update on public.%I
      for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Ogni offerta inserita o modificata finisce nello storico (una riga per offerta, aggiornata se cambia il prezzo).
create or replace function public.offerte_storicizza()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nome text := regexp_replace(trim(new.nome || ' ' || new.marca || ' ' || new.formato), '\s+', ' ', 'g');
begin
  -- Cambiata l'identità dell'offerta (correzione a mano): la vecchia riga di storico non ha più senso.
  if tg_op = 'UPDATE' and (old.chiave, old.supermercato_id, old.valido_da) is distinct from (new.chiave, new.supermercato_id, new.valido_da) then
    delete from public.offerte_storico
     where space_id = old.space_id and supermercato_id = old.supermercato_id and chiave = old.chiave and valido_da = old.valido_da;
  end if;
  insert into public.offerte_storico (space_id, owner_id, supermercato_id, nome, prezzo, prezzo_pieno, prezzo_unitario, unita, valido_da, valido_fino)
  values (new.space_id, coalesce(auth.uid(), new.owner_id), new.supermercato_id, v_nome,
          new.prezzo, new.prezzo_pieno, new.prezzo_unitario, new.unita, new.valido_da, new.valido_fino)
  on conflict on constraint offerte_storico_univoca do update
    set nome = excluded.nome, prezzo = excluded.prezzo, prezzo_pieno = excluded.prezzo_pieno,
        prezzo_unitario = excluded.prezzo_unitario, unita = excluded.unita, valido_fino = excluded.valido_fino;
  return new;
end $$;
revoke all on function public.offerte_storicizza() from public, anon, authenticated;

create trigger offerte_storicizza
  after insert or update of supermercato_id, nome, marca, formato, prezzo, prezzo_pieno, prezzo_unitario, unita, valido_da, valido_fino
  on public.offerte_offerte
  for each row execute function public.offerte_storicizza();

/**
 * Registra le offerte trovate in una ricerca, senza duplicati, e annota la ricerca nel registro.
 * p_dati: un array di offerte oppure { "offerte": [...], "supermercati": ["Esselunga", …], "note": "…" }
 *   (in "supermercati" quelli cercati, anche senza risultati: finiscono nel registro).
 * Offerta: { "supermercato": "Esselunga", "nome": "Passata di pomodoro", "marca": "Mutti", "formato": "700 g",
 *            "categoria": "Dispensa", "prezzo": 0.99, "prezzo_pieno": 1.59, "prezzo_unitario": 1.41, "unita": "kg",
 *            "condizioni": "con carta fedeltà", "valido_da": "2026-10-06", "valido_fino": "2026-10-15", "url": "…" }
 * Il supermercato si riconosce per nome (o "supermercato_id") e si crea se manca. Un'offerta già presente
 * (stesso supermercato, nome+marca+formato e inizio validità) viene aggiornata: prezzo, fine validità, visto_il.
 * Le offerte non valide vengono scartate (non bloccano le altre) e restituite in "errori".
 * Security invoker: dall'app valgono le policy RLS dello spazio. Senza utente (SQL dal connettore, usato dalla
 * routine di Claude) le righe vengono attribuite al titolare dello spazio.
 */
create or replace function public.offerte_registra(p_space_id uuid, p_dati jsonb, p_fonte text default 'json')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_owner    uuid := auth.uid();
  v_list     jsonb;
  v_o        jsonb;
  v_sm_id    uuid;
  v_sm_nome  text;
  v_nome     text;
  v_da       date;
  v_fino     date;
  v_prezzo   numeric;
  v_pieno    numeric;
  v_unit     numeric;
  v_unita    text;
  v_inserted boolean;
  v_nuove    int := 0;
  v_agg      int := 0;
  v_errori   jsonb := '[]';
  v_creati   text[] := '{}';
  v_cercati  text[] := '{}';
  v_i        int := 0;
begin
  if p_fonte not in ('manuale', 'json', 'claude') then raise exception 'Fonte non valida: %', p_fonte; end if;
  if v_owner is null then
    select owner_id into v_owner from private.spaces where id = p_space_id and app_slug = 'offerte';
    if v_owner is null then raise exception 'Spazio % non trovato', p_space_id; end if;
  end if;

  v_list := case jsonb_typeof(p_dati) when 'array' then p_dati when 'object' then coalesce(p_dati->'offerte', '[]') end;
  if jsonb_typeof(v_list) is distinct from 'array' then raise exception 'Mi aspetto un elenco di offerte'; end if;
  if jsonb_typeof(p_dati->'supermercati') = 'array' then
    select coalesce(array_agg(distinct trim(x)), '{}') into v_cercati
      from jsonb_array_elements_text(p_dati->'supermercati') x where trim(x) <> '';
  end if;

  for v_o in select value from jsonb_array_elements(v_list) loop
    v_i := v_i + 1;
    begin
      v_nome := regexp_replace(trim(coalesce(v_o->>'nome', v_o->>'prodotto', '')), '\s+', ' ', 'g');
      if v_nome = '' then raise exception 'senza nome'; end if;
      v_prezzo := nullif(replace(trim(v_o->>'prezzo'), ',', '.'), '')::numeric;
      if v_prezzo is null or v_prezzo <= 0 then raise exception 'prezzo mancante'; end if;
      v_pieno := nullif(replace(trim(v_o->>'prezzo_pieno'), ',', '.'), '')::numeric;
      if v_pieno <= v_prezzo then v_pieno := null; end if;
      v_unit := nullif(replace(trim(v_o->>'prezzo_unitario'), ',', '.'), '')::numeric;
      if v_unit <= 0 then v_unit := null; end if;
      v_unita := case lower(trim(coalesce(v_o->>'unita', '')))
        when 'kg' then 'kg' when 'chilo' then 'kg' when 'l' then 'l' when 'lt' then 'l' when 'litro' then 'l'
        when 'pz' then 'pz' when 'pezzo' then 'pz' end;
      if v_unit is null then v_unita := null; end if;
      v_da := coalesce(nullif(v_o->>'valido_da', '')::date, current_date);
      v_fino := coalesce(nullif(v_o->>'valido_fino', '')::date, v_da + 6);
      if v_fino < v_da then raise exception 'validità invertita'; end if;

      v_sm_id := null;
      if nullif(v_o->>'supermercato_id', '') is not null then
        select id, nome into v_sm_id, v_sm_nome from public.offerte_supermercati
         where space_id = p_space_id and id = (v_o->>'supermercato_id')::uuid;
      else
        v_sm_nome := regexp_replace(trim(coalesce(v_o->>'supermercato', '')), '\s+', ' ', 'g');
        if v_sm_nome = '' then raise exception 'supermercato mancante'; end if;
        select id, nome into v_sm_id, v_sm_nome from public.offerte_supermercati
         where space_id = p_space_id and lower(nome) = lower(v_sm_nome);
        if v_sm_id is null then
          insert into public.offerte_supermercati (space_id, owner_id, nome)
          values (p_space_id, v_owner, v_sm_nome)
          returning id into v_sm_id;
          v_creati := v_creati || v_sm_nome;
        end if;
      end if;
      if v_sm_id is null then raise exception 'supermercato non trovato'; end if;
      v_cercati := v_cercati || v_sm_nome;

      insert into public.offerte_offerte as o
        (space_id, owner_id, supermercato_id, nome, marca, formato, categoria, prezzo, prezzo_pieno, prezzo_unitario,
         unita, condizioni, valido_da, valido_fino, url, fonte)
      values (
        p_space_id, v_owner, v_sm_id, v_nome,
        left(trim(coalesce(v_o->>'marca', '')), 80),
        left(trim(coalesce(v_o->>'formato', '')), 60),
        left(trim(coalesce(v_o->>'categoria', '')), 60),
        v_prezzo, v_pieno, v_unit, v_unita,
        left(trim(coalesce(v_o->>'condizioni', '')), 200),
        v_da, v_fino,
        left(trim(coalesce(v_o->>'url', '')), 500),
        p_fonte
      )
      on conflict on constraint offerte_offerte_univoca do update
        set prezzo = excluded.prezzo,
            prezzo_pieno = coalesce(excluded.prezzo_pieno, o.prezzo_pieno),
            prezzo_unitario = coalesce(excluded.prezzo_unitario, o.prezzo_unitario),
            unita = coalesce(excluded.unita, o.unita),
            categoria = coalesce(nullif(excluded.categoria, ''), o.categoria),
            condizioni = coalesce(nullif(excluded.condizioni, ''), o.condizioni),
            url = coalesce(nullif(excluded.url, ''), o.url),
            valido_fino = greatest(excluded.valido_fino, o.valido_fino),
            visto_il = current_date
      returning (xmax = 0) into v_inserted;
      if v_inserted then v_nuove := v_nuove + 1; else v_agg := v_agg + 1; end if;
    exception when others then
      v_errori := v_errori || jsonb_build_object('n', v_i, 'nome', coalesce(v_o->>'nome', v_o->>'prodotto'), 'errore', sqlerrm);
    end;
  end loop;

  select coalesce(array_agg(distinct x order by x), '{}') into v_cercati from unnest(v_cercati) x;
  insert into public.offerte_ricerche (space_id, owner_id, fonte, supermercati, nuove, aggiornate, scartate, note)
  values (p_space_id, v_owner, p_fonte, v_cercati, v_nuove, v_agg, jsonb_array_length(v_errori),
          left(coalesce(case when jsonb_typeof(p_dati) = 'object' then trim(p_dati->>'note') end, ''), 2000));

  return jsonb_build_object('nuove', v_nuove, 'aggiornate', v_agg, 'scartate', jsonb_array_length(v_errori),
                            'errori', v_errori, 'supermercati_creati', to_jsonb(v_creati));
end $$;
revoke all on function public.offerte_registra(uuid, jsonb, text) from public, anon;
grant execute on function public.offerte_registra(uuid, jsonb, text) to authenticated;

/**
 * Pulizia dei dati non fondamentali di uno spazio. Ogni parametro null = non toccare quella tabella.
 *   p_giorni_offerte  offerte scadute da più di N giorni (lo storico resta)
 *   p_mesi_storico    storico con validità finita da più di N mesi
 *   p_giorni_ricerche registro delle ricerche più vecchio di N giorni
 * Restituisce quante righe ha cancellato per tabella. Security invoker: dall'app valgono le policy RLS.
 */
create or replace function public.offerte_pulisci(
  p_space_id uuid, p_giorni_offerte int default null, p_mesi_storico int default null, p_giorni_ricerche int default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_off int := 0;
  v_sto int := 0;
  v_ric int := 0;
begin
  if p_giorni_offerte is not null then
    delete from public.offerte_offerte where space_id = p_space_id and valido_fino < current_date - greatest(p_giorni_offerte, 0);
    get diagnostics v_off = row_count;
  end if;
  if p_mesi_storico is not null then
    delete from public.offerte_storico where space_id = p_space_id and valido_fino < current_date - make_interval(months => greatest(p_mesi_storico, 0));
    get diagnostics v_sto = row_count;
  end if;
  if p_giorni_ricerche is not null then
    delete from public.offerte_ricerche where space_id = p_space_id and created_at < now() - make_interval(days => greatest(p_giorni_ricerche, 0));
    get diagnostics v_ric = row_count;
  end if;
  return jsonb_build_object('offerte', v_off, 'storico', v_sto, 'ricerche', v_ric);
end $$;
revoke all on function public.offerte_pulisci(uuid, int, int, int) from public, anon;
grant execute on function public.offerte_pulisci(uuid, int, int, int) to authenticated;
