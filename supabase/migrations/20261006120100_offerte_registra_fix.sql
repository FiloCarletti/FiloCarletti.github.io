-- Offerte: correzione di offerte_registra (un supermercato nuovo veniva scartato con nome nullo).

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
  v_nome_cercato text;
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
        -- (select … into azzera le variabili se non trova righe: il nome cercato resta in v_nome_cercato)
        v_nome_cercato := v_sm_nome;
        select id, nome into v_sm_id, v_sm_nome from public.offerte_supermercati
         where space_id = p_space_id and lower(nome) = lower(v_nome_cercato);
        if v_sm_id is null then
          v_sm_nome := v_nome_cercato;
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
