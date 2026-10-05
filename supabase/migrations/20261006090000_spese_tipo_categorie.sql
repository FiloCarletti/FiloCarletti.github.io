-- Spese: categorie principali separate tra uscite ed entrate, colori senza doppioni per gruppo.
-- Da applicare DOPO 20261005220000_spese_init.sql. Nessun dato eliminato.

-- 0. Backup di categorie e abbinamenti (schema private, non esposto).
create table private.spese_bak_categorie_20261006 as table public.spese_categorie;
create table private.spese_bak_mov_categorie_20261006 as select id, categoria_id, sottocategoria_id from public.spese_movimenti;
alter table private.spese_bak_categorie_20261006 enable row level security;
alter table private.spese_bak_mov_categorie_20261006 enable row level security;
revoke all on table private.spese_bak_categorie_20261006, private.spese_bak_mov_categorie_20261006 from public, anon, authenticated;

-- 1. Tipo delle categorie principali (le secondarie restano trasversali: tipo null).
alter table public.spese_categorie add column tipo text check (tipo in ('uscita', 'entrata'));

update public.spese_categorie c
   set tipo = case when (select count(*) filter (where m.importo > 0) > count(*) filter (where m.importo < 0)
                           from public.spese_movimenti m where m.categoria_id = c.id)
              then 'entrata' else 'uscita' end
 where c.livello = 'principale';

alter table public.spese_categorie
  add constraint spese_categorie_tipo_livello check ((livello = 'principale') = (tipo is not null));

-- Lo stesso nome può esistere come uscita e come entrata (es. "Altro").
drop index public.spese_categorie_space_nome_key;
create unique index spese_categorie_space_nome_key on public.spese_categorie (space_id, livello, coalesce(tipo, ''), lower(nome));

-- 2. Movimenti con segno opposto al tipo della loro categoria: gemella con l'altro tipo, stesso nome.
insert into public.spese_categorie (space_id, owner_id, livello, tipo, nome, colore)
select distinct c.space_id, c.owner_id, 'principale', case when m.importo > 0 then 'entrata' else 'uscita' end, c.nome, c.colore
  from public.spese_movimenti m
  join public.spese_categorie c on c.id = m.categoria_id
 where (m.importo > 0) <> (c.tipo = 'entrata')
on conflict do nothing;

update public.spese_movimenti m
   set categoria_id = n.id
  from public.spese_categorie c, public.spese_categorie n
 where c.id = m.categoria_id
   and (m.importo > 0) <> (c.tipo = 'entrata')
   and n.space_id = c.space_id and n.livello = 'principale' and lower(n.nome) = lower(c.nome)
   and n.tipo = case when m.importo > 0 then 'entrata' else 'uscita' end;

-- 3. Colori: in ogni gruppo (spazio, livello, tipo) le categorie più usate tengono il loro colore,
--    quelle con un colore già preso ricevono il primo libero della palette (poi a rotazione).
do $$
declare
  pal text[] := array['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  g record;
  c record;
  used text[];
  pick text;
  p text;
begin
  for g in select distinct space_id, livello, coalesce(tipo, '') as t from public.spese_categorie loop
    used := '{}';
    for c in
      select x.id, lower(x.colore) as colore
        from public.spese_categorie x
        left join lateral (select count(*) as n from public.spese_movimenti m
                            where m.categoria_id = x.id or m.sottocategoria_id = x.id) u on true
       where x.space_id = g.space_id and x.livello = g.livello and coalesce(x.tipo, '') = g.t
       order by u.n desc, x.created_at
    loop
      if c.colore = any (pal) and not (c.colore = any (used)) then
        used := used || c.colore;
      else
        pick := null;
        foreach p in array pal loop
          if not (p = any (used)) then pick := p; exit; end if;
        end loop;
        pick := coalesce(pick, pal[1 + (cardinality(used) % cardinality(pal))]);
        update public.spese_categorie set colore = pick where id = c.id;
        used := used || pick;
      end if;
    end loop;
  end loop;
end $$;
