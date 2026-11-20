-- Pasti: diario alimentare con valori nutrizionali stimati (da foto o descrizione, di solito da Claude),
-- obiettivi personali e report periodici con carenze, eccessi e consigli.
--
--   pasti_pasti      un pasto per riga (colazione/pranzo/cena univoci per giorno; spuntini liberi), con
--                    stime nutrizionali, grammi per gruppo alimentare (jsonb "gruppi") e commento;
--   pasti_obiettivi  una riga per spazio: obiettivi giornalieri e settimanali + profilo (peso, attività…);
--   pasti_report     analisi scritte da Claude su un periodo.
-- Scrittura da Claude: public.pasti_registra(space_id, dati jsonb).

create table public.pasti_pasti (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references private.spaces(id),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data             date not null,
  tipo             text not null check (tipo in ('colazione', 'pranzo', 'cena', 'spuntino')),
  luogo            text not null default '' check (length(luogo) <= 60),
  descrizione      text not null default '' check (length(descrizione) <= 1000),
  -- [{ "nome": "Penne all'arrabbiata", "grammi": 250, "gruppo": "cereali_raffinati" }, …]
  alimenti         jsonb not null default '[]' check (jsonb_typeof(alimenti) = 'array'),
  -- grammi per gruppo: verdura, frutta, legumi, cereali_integrali, cereali_raffinati, patate, carne_bianca,
  -- carne_rossa, carne_processata, pesce, uova, latticini, formaggi, frutta_secca, dolci
  gruppi           jsonb not null default '{}' check (jsonb_typeof(gruppi) = 'object'),
  kcal             int check (kcal between 0 and 6000),
  proteine_g       numeric(6, 1) check (proteine_g >= 0),
  carboidrati_g    numeric(6, 1) check (carboidrati_g >= 0),
  zuccheri_g       numeric(6, 1) check (zuccheri_g >= 0),
  grassi_g         numeric(6, 1) check (grassi_g >= 0),
  grassi_saturi_g  numeric(6, 1) check (grassi_saturi_g >= 0),
  fibre_g          numeric(6, 1) check (fibre_g >= 0),
  sodio_mg         int check (sodio_mg >= 0),
  fritto           boolean not null default false,
  punteggio        smallint check (punteggio between 1 and 10), -- qualità complessiva del pasto
  commento         text not null default '' check (length(commento) <= 2000),
  fonte            text not null default 'manuale' check (fonte in ('foto', 'descrizione', 'manuale')),
  data_stimata     boolean not null default false, -- la data è ricostruita (es. foto senza data)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index pasti_pasti_giorno_tipo_key on public.pasti_pasti (space_id, data, tipo) where tipo <> 'spuntino';
create index on public.pasti_pasti (space_id, data desc);
create index on public.pasti_pasti (owner_id);

create table public.pasti_obiettivi (
  id                   uuid primary key default gen_random_uuid(),
  space_id             uuid not null references private.spaces(id),
  owner_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- giornalieri
  kcal                 int not null default 2300,
  proteine_g           int not null default 90,
  fibre_min_g          int not null default 30,
  zuccheri_max_g       int not null default 50,
  saturi_max_g         int not null default 25,
  sodio_max_mg         int not null default 2000,
  verdura_min_g        int not null default 400,
  frutta_min_g         int not null default 300,
  -- porzioni a settimana
  legumi_min_sett      int not null default 3,
  pesce_min_sett       int not null default 2,
  carne_rossa_max_sett int not null default 2,
  processata_max_sett  int not null default 1,
  fritti_max_sett      int not null default 2,
  -- { "sesso": "M", "eta": 30, "peso_kg": 75, "altezza_cm": 178, "attivita": "moderata", "obiettivo": "mantenimento" }
  profilo              jsonb not null default '{}' check (jsonb_typeof(profilo) = 'object'),
  note                 text not null default '' check (length(note) <= 2000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (space_id)
);
create index on public.pasti_obiettivi (owner_id);

create table public.pasti_report (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references private.spaces(id),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dal         date not null,
  al          date not null,
  titolo      text not null default '' check (length(titolo) <= 160),
  sintesi     text not null default '' check (length(sintesi) <= 4000),
  carenze     text[] not null default '{}' check (cardinality(carenze) <= 20),
  eccessi     text[] not null default '{}' check (cardinality(eccessi) <= 20),
  consigli    text[] not null default '{}' check (cardinality(consigli) <= 20),
  punteggio   smallint check (punteggio between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (al >= dal),
  unique (space_id, dal, al)
);
create index on public.pasti_report (space_id, al desc);
create index on public.pasti_report (owner_id);

-- RLS standard per spazi (vedi CONVENTIONS.md).
do $$
declare t text;
begin
  foreach t in array array['pasti_pasti', 'pasti_obiettivi', 'pasti_report'] loop
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

/**
 * Registra pasti (e opzionalmente un report e gli obiettivi) in uno spazio.
 * p_dati: { "pasti": [...], "report": {...}, "obiettivi": {...} }  oppure direttamente un array di pasti.
 * Pasto: { "data": "2026-11-19", "tipo": "pranzo", "luogo": "mensa", "descrizione": "…", "alimenti": [...],
 *          "gruppi": {"verdura": 80, …}, "kcal": 1250, "proteine_g": 45, "carboidrati_g": 170, "zuccheri_g": 20,
 *          "grassi_g": 40, "grassi_saturi_g": 9, "fibre_g": 11, "sodio_mg": 1500, "fritto": false,
 *          "punteggio": 6, "commento": "…", "fonte": "foto", "data_stimata": false }
 * Colazione, pranzo e cena sono univoci per giorno: se esistono vengono sovrascritti. Gli spuntini si aggiungono.
 * Report: { "dal", "al", "titolo", "sintesi", "carenze": [], "eccessi": [], "consigli": [], "punteggio" }
 *   (stesso periodo = sovrascritto). Obiettivi: solo i campi passati vengono aggiornati.
 * Security invoker: dall'app valgono le RLS. Senza utente (SQL dal connettore di Claude) le righe vanno
 * al titolare dello spazio.
 */
create or replace function public.pasti_registra(p_space_id uuid, p_dati jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_owner  uuid := auth.uid();
  v_list   jsonb;
  v_p      jsonb;
  v_r      jsonb;
  v_o      jsonb;
  v_tipo   text;
  v_id     uuid;
  v_ids    uuid[] := '{}';
  v_rep    uuid;
begin
  if v_owner is null then
    select owner_id into v_owner from private.spaces where id = p_space_id and app_slug = 'pasti';
    if v_owner is null then raise exception 'Spazio % non trovato', p_space_id; end if;
  end if;

  v_list := case jsonb_typeof(p_dati) when 'array' then p_dati when 'object' then coalesce(p_dati->'pasti', '[]') end;
  if jsonb_typeof(v_list) is distinct from 'array' then raise exception 'Mi aspetto un elenco di pasti'; end if;

  for v_p in select value from jsonb_array_elements(v_list) loop
    v_tipo := lower(trim(coalesce(v_p->>'tipo', '')));
    v_id := null;
    if v_tipo <> 'spuntino' then
      select id into v_id from public.pasti_pasti
       where space_id = p_space_id and data = (v_p->>'data')::date and tipo = v_tipo;
    end if;
    if v_id is null then
      insert into public.pasti_pasti (space_id, owner_id, data, tipo) values (p_space_id, v_owner, (v_p->>'data')::date, v_tipo)
      returning id into v_id;
    end if;
    update public.pasti_pasti set
      luogo           = coalesce(v_p->>'luogo', ''),
      descrizione     = coalesce(v_p->>'descrizione', ''),
      alimenti        = coalesce(v_p->'alimenti', '[]'),
      gruppi          = coalesce(v_p->'gruppi', '{}'),
      kcal            = (v_p->>'kcal')::numeric::int,
      proteine_g      = (v_p->>'proteine_g')::numeric,
      carboidrati_g   = (v_p->>'carboidrati_g')::numeric,
      zuccheri_g      = (v_p->>'zuccheri_g')::numeric,
      grassi_g        = (v_p->>'grassi_g')::numeric,
      grassi_saturi_g = (v_p->>'grassi_saturi_g')::numeric,
      fibre_g         = (v_p->>'fibre_g')::numeric,
      sodio_mg        = (v_p->>'sodio_mg')::numeric::int,
      fritto          = coalesce((v_p->>'fritto')::boolean, false),
      punteggio       = (v_p->>'punteggio')::numeric::smallint,
      commento        = coalesce(v_p->>'commento', ''),
      fonte           = coalesce(v_p->>'fonte', 'descrizione'),
      data_stimata    = coalesce((v_p->>'data_stimata')::boolean, false)
    where id = v_id;
    v_ids := v_ids || v_id;
  end loop;

  v_r := case when jsonb_typeof(p_dati) = 'object' then p_dati->'report' end;
  if jsonb_typeof(v_r) = 'object' then
    insert into public.pasti_report (space_id, owner_id, dal, al, titolo, sintesi, carenze, eccessi, consigli, punteggio)
    values (p_space_id, v_owner, (v_r->>'dal')::date, (v_r->>'al')::date, coalesce(v_r->>'titolo', ''),
            coalesce(v_r->>'sintesi', ''),
            coalesce((select array_agg(x) from jsonb_array_elements_text(v_r->'carenze') x), '{}'),
            coalesce((select array_agg(x) from jsonb_array_elements_text(v_r->'eccessi') x), '{}'),
            coalesce((select array_agg(x) from jsonb_array_elements_text(v_r->'consigli') x), '{}'),
            (v_r->>'punteggio')::numeric::smallint)
    on conflict (space_id, dal, al) do update set
      titolo = excluded.titolo, sintesi = excluded.sintesi, carenze = excluded.carenze,
      eccessi = excluded.eccessi, consigli = excluded.consigli, punteggio = excluded.punteggio
    returning id into v_rep;
  end if;

  v_o := case when jsonb_typeof(p_dati) = 'object' then p_dati->'obiettivi' end;
  if jsonb_typeof(v_o) = 'object' then
    insert into public.pasti_obiettivi (space_id, owner_id) values (p_space_id, v_owner) on conflict (space_id) do nothing;
    update public.pasti_obiettivi o set
      kcal                 = coalesce((v_o->>'kcal')::int, o.kcal),
      proteine_g           = coalesce((v_o->>'proteine_g')::int, o.proteine_g),
      fibre_min_g          = coalesce((v_o->>'fibre_min_g')::int, o.fibre_min_g),
      zuccheri_max_g       = coalesce((v_o->>'zuccheri_max_g')::int, o.zuccheri_max_g),
      saturi_max_g         = coalesce((v_o->>'saturi_max_g')::int, o.saturi_max_g),
      sodio_max_mg         = coalesce((v_o->>'sodio_max_mg')::int, o.sodio_max_mg),
      verdura_min_g        = coalesce((v_o->>'verdura_min_g')::int, o.verdura_min_g),
      frutta_min_g         = coalesce((v_o->>'frutta_min_g')::int, o.frutta_min_g),
      legumi_min_sett      = coalesce((v_o->>'legumi_min_sett')::int, o.legumi_min_sett),
      pesce_min_sett       = coalesce((v_o->>'pesce_min_sett')::int, o.pesce_min_sett),
      carne_rossa_max_sett = coalesce((v_o->>'carne_rossa_max_sett')::int, o.carne_rossa_max_sett),
      processata_max_sett  = coalesce((v_o->>'processata_max_sett')::int, o.processata_max_sett),
      fritti_max_sett      = coalesce((v_o->>'fritti_max_sett')::int, o.fritti_max_sett),
      profilo              = o.profilo || coalesce(v_o->'profilo', '{}'),
      note                 = coalesce(v_o->>'note', o.note)
    where o.space_id = p_space_id;
  end if;

  return jsonb_build_object('pasti', to_jsonb(v_ids), 'report', v_rep);
end $$;
revoke all on function public.pasti_registra(uuid, jsonb) from public, anon;
grant execute on function public.pasti_registra(uuid, jsonb) to authenticated;
