-- Allenamenti: il piano di ogni voce ricorda anche il nome dell'esercizio programmato,
-- così si vede se è stato sostituito con un altro.
create or replace function public.allenamenti_pianifica(p_space_id uuid, p_piano jsonb, p_fonte text default 'json')
returns uuid[]
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_list  jsonb;
  v_sess  jsonb;
  v_items jsonb;
  v_ex    jsonb;
  v_sid   uuid;
  v_eid   uuid;
  v_nome  text;
  v_canon text;
  v_unita text;
  v_ord   int;
  v_ids   uuid[] := '{}';
  v_serie numeric; v_rip numeric; v_peso numeric; v_rpe numeric; v_min numeric; v_km numeric;
begin
  if v_owner is null then
    select owner_id into v_owner from private.spaces where id = p_space_id and app_slug = 'allenamenti';
    if v_owner is null then raise exception 'Spazio % non trovato', p_space_id; end if;
  end if;

  v_list := case jsonb_typeof(p_piano) when 'array' then p_piano when 'object' then jsonb_build_array(p_piano) end;
  if v_list is null or jsonb_array_length(v_list) = 0 then raise exception 'Il piano è vuoto'; end if;

  for v_sess in select value from jsonb_array_elements(v_list) loop
    v_items := coalesce(v_sess->'esercizi', v_sess->'voci');
    if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) = 0 then
      raise exception 'Ogni allenamento deve avere un elenco "esercizi"';
    end if;

    insert into public.allenamenti_sessioni (space_id, owner_id, data, titolo, note, durata_min, stato, fonte)
    values (
      p_space_id, v_owner,
      coalesce(nullif(v_sess->>'data', '')::date, current_date),
      nullif(trim(v_sess->>'titolo'), ''),
      nullif(trim(v_sess->>'note'), ''),
      nullif(round(nullif(v_sess->>'durata_min', '')::numeric), 0)::int,
      'da_fare', p_fonte
    )
    returning id into v_sid;

    v_ord := 0;
    for v_ex in select value from jsonb_array_elements(v_items) loop
      v_nome := regexp_replace(trim(coalesce(v_ex->>'nome', v_ex->>'esercizio', '')), '\s+', ' ', 'g');
      if v_nome = '' then raise exception 'Esercizio senza nome nell''allenamento del %', v_sess->>'data'; end if;

      v_serie := nullif(v_ex->>'serie', '')::numeric;
      v_rip   := nullif(v_ex->>'ripetizioni', '')::numeric;
      v_peso  := nullif(v_ex->>'peso_kg', '')::numeric;
      v_rpe   := nullif(v_ex->>'rpe', '')::numeric;
      v_min   := nullif(v_ex->>'durata_min', '')::numeric;
      v_km    := nullif(v_ex->>'distanza_km', '')::numeric;

      v_eid := null;
      select id, unita, nome into v_eid, v_unita, v_canon
        from public.allenamenti_esercizi
       where space_id = p_space_id and lower(nome) = lower(v_nome);
      v_nome := coalesce(v_canon, v_nome);
      if v_eid is null then
        v_unita := coalesce(nullif(v_ex->>'unita', ''), case when v_min is not null or v_km is not null then 'cardio' else 'rip' end);
        insert into public.allenamenti_esercizi (space_id, owner_id, nome, categoria, unita)
        values (p_space_id, v_owner, v_nome, coalesce(nullif(trim(v_ex->>'categoria'), ''), 'Altro'), v_unita)
        returning id into v_eid;
      end if;

      insert into public.allenamenti_voci
        (space_id, owner_id, sessione_id, esercizio_id, ordine, serie, ripetizioni, peso_kg, rpe, durata_min, distanza_km, note, stato, piano)
      values (
        p_space_id, v_owner, v_sid, v_eid, v_ord,
        case when v_unita = 'cardio' then null else nullif(round(v_serie), 0)::int end,
        case when v_unita = 'cardio' then null else v_rip end,
        case when v_unita = 'rip' then nullif(v_peso, 0) end,
        null,
        case when v_unita = 'cardio' then v_min end,
        case when v_unita = 'cardio' then v_km end,
        nullif(trim(v_ex->>'note'), ''),
        'da_fare',
        jsonb_strip_nulls(jsonb_build_object(
          'serie', v_serie, 'ripetizioni', v_rip, 'peso_kg', v_peso, 'rpe', v_rpe,
          'durata_min', v_min, 'distanza_km', v_km, 'note', nullif(trim(v_ex->>'note'), ''),
          'esercizio', v_nome
        ))
      );
      v_ord := v_ord + 1;
    end loop;
    v_ids := v_ids || v_sid;
  end loop;
  return v_ids;
end $$;

revoke all on function public.allenamenti_pianifica(uuid, jsonb, text) from public, anon;
grant execute on function public.allenamenti_pianifica(uuid, jsonb, text) to authenticated;
