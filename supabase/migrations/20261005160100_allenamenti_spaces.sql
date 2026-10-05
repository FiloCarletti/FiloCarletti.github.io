-- Allenamenti: i dati passano dagli "owner" agli spazi (vedi base_spaces_access).
-- Da applicare DOPO 20261005160000_base_spaces_access.sql.

alter table public.allenamenti_esercizi add column space_id uuid references private.spaces(id);
alter table public.allenamenti_sessioni add column space_id uuid references private.spaces(id);
alter table public.allenamenti_voci     add column space_id uuid references private.spaces(id);

-- Dati già presenti: nello spazio personale di chi li ha inseriti.
insert into private.spaces (app_slug, kind, name, owner_id)
select distinct 'allenamenti', 'personal', 'Personale', owner_id
from (
  select owner_id from public.allenamenti_esercizi
  union select owner_id from public.allenamenti_sessioni
  union select owner_id from public.allenamenti_voci
) o
on conflict do nothing;

update public.allenamenti_esercizi t set space_id = s.id from private.spaces s
 where s.app_slug = 'allenamenti' and s.kind = 'personal' and s.owner_id = t.owner_id;
update public.allenamenti_sessioni t set space_id = s.id from private.spaces s
 where s.app_slug = 'allenamenti' and s.kind = 'personal' and s.owner_id = t.owner_id;
update public.allenamenti_voci t set space_id = s.id from private.spaces s
 where s.app_slug = 'allenamenti' and s.kind = 'personal' and s.owner_id = t.owner_id;

alter table public.allenamenti_esercizi alter column space_id set not null;
alter table public.allenamenti_sessioni alter column space_id set not null;
alter table public.allenamenti_voci     alter column space_id set not null;

create index on public.allenamenti_esercizi (space_id);
create index on public.allenamenti_sessioni (space_id, data desc);
create index on public.allenamenti_voci (space_id);

-- Il nome di un esercizio è unico dentro lo spazio, non più per utente.
drop index public.allenamenti_esercizi_owner_nome_key;
create unique index allenamenti_esercizi_space_nome_key on public.allenamenti_esercizi (space_id, lower(nome));

-- Policy standard per spazi.
do $$
declare t text;
begin
  foreach t in array array['allenamenti_esercizi', 'allenamenti_sessioni', 'allenamenti_voci'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy space_select on public.%I for select to authenticated
      using (space_id in (select public.readable_space_ids()))', t);
    execute format('create policy space_insert on public.%I for insert to authenticated
      with check (space_id in (select public.writable_space_ids()) and owner_id = (select auth.uid()))', t);
    execute format('create policy space_update on public.%I for update to authenticated
      using (space_id in (select public.writable_space_ids()))
      with check (space_id in (select public.writable_space_ids()))', t);
    execute format('create policy space_delete on public.%I for delete to authenticated
      using (space_id in (select public.writable_space_ids()))', t);
  end loop;
end $$;
