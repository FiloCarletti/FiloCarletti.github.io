-- Allenamenti: lettura via link pubblico (vedi base_sharing). Da applicare DOPO 20261005180000_base_sharing.sql.
-- anon legge solo gli spazi il cui token arriva nell'header x-space-token (readable_space_ids).
grant select on public.allenamenti_esercizi, public.allenamenti_sessioni, public.allenamenti_voci to anon;
alter policy space_select on public.allenamenti_esercizi to anon, authenticated;
alter policy space_select on public.allenamenti_sessioni to anon, authenticated;
alter policy space_select on public.allenamenti_voci to anon, authenticated;
