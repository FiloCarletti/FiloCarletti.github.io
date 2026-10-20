-- Burraco: burraco semipulito facoltativo nel segnapunti dal vivo
-- (almeno 7 carte naturali consecutive e poi la matta: di solito 150 invece di 100).
--   burraco_partite.punti_semipulito  valore del semipulito; null = regola non usata in questa partita
--   burraco_mani.semipuliti_a/_b      numero di burraco semipuliti per squadra nella mano
alter table public.burraco_partite
  add column punti_semipulito smallint check (punti_semipulito is null or punti_semipulito between 0 and 1000);
alter table public.burraco_mani
  add column semipuliti_a smallint not null default 0 check (semipuliti_a between 0 and 20),
  add column semipuliti_b smallint not null default 0 check (semipuliti_b between 0 and 20);
