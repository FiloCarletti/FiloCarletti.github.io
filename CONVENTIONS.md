# Convenzioni della monorepo

Questo file è la fonte di verità per chi (persona o Claude) crea o modifica un'app.
Le skill `pages-app-create` e `pages-app-update` lo leggono prima di iniziare.

## Architettura

| Cosa | Dove |
|---|---|
| Repo | `FiloCarletti/FiloCarletti.github.io` (branch `main`) |
| Sito | `https://filocarletti.github.io/` → dashboard; `https://filocarletti.github.io/<slug>/` → app |
| Deploy | `.github/workflows/deploy.yml`: a ogni push su `main` esegue `npm run build` e pubblica `dist/` su Pages |
| Database | Supabase, progetto **FiloCarletti's Project** (`jpqjsvmmgsyeohsunrzk`, eu-west-1), **condiviso da tutte le app** |
| Login | Google OAuth via Supabase Auth, una sessione unica per tutte le app (stessa origine) |
| Accesso | Solo email in `private.allowed_emails`. Controllato da RLS (`public.is_allowed()`) e dall'hook di registrazione |

```
apps/
  dashboard/            # indice delle app (legge apps.generated.json creato in build)
  _template/            # copiato da `npm run new-app` (non pubblicato)
  <slug>/
    app.json            # nome, descrizione, icona, tabelle, date → card in dashboard
    index.html
    src/main.js         # createPagesApp(App, { routes })
    src/App.vue         # AuthGate + AppShell + RouterView + ToastHost
    src/db.js           # costanti con i nomi delle tabelle (prefissate)
    src/views/*.vue
    src/components/*.vue
packages/shared/src/    # importato come '@shared'
supabase/migrations/    # copia di OGNI migrazione applicata, in ordine
scripts/                # build-all, dev, new-app
```

## Regole per le app

1. **Slug** in kebab-case (`spese-casa`). Riservati: `dashboard`, `assets`, `apps`, `shared`, `404`, `index`.
2. **Stack**: Vue 3 `<script setup>` in JavaScript, vue-router con hash history (già configurato da `createPagesApp`). Niente librerie UI esterne. Aggiungi una dipendenza npm solo se serve davvero (grafici: `chart.js`) e mettila nel `package.json` della root.
3. **UI**: usa le classi di `packages/shared/src/styles.css` (`card`, `btn`, `btn-primary`, `input`, `field`, `table`, `grid`, `stack`, `row`, `badge`, `empty`…) e le variabili CSS (`--primary`, `--muted`…). Il CSS specifico va in `<style scoped>`. Deve funzionare su mobile (larghezza 360px) e in dark mode.
4. **Shared**: `import { supabase, unwrap, toast, useAuth, fmtEuro, fmtDate, todayISO } from '@shared'`. Non modificare `packages/shared` per esigenze di una sola app; se una modifica serve a tutte, verifica che le altre app compilino ancora.
5. **Errori**: ogni chiamata Supabase passa da `unwrap(...)` dentro `try/catch` con `toast.error(e)`.
6. **Segreti**: nel codice c'è solo la publishable key (pubblica per design). Mai service_role/secret key, mai token o password nel repo (è pubblico).
7. **Metadati**: aggiorna `app.json` (`description`, `tables`, `updatedAt`) a ogni modifica: la dashboard si rigenera da lì.

## Regole per il database (condiviso)

- Ogni tabella si chiama `<prefisso>_<entità>` dove il prefisso è lo slug con `_` (`spese-casa` → `spese_casa_movimenti`). Mai tabelle senza prefisso, mai toccare tabelle di altre app.
- Colonne standard: `id uuid pk default gen_random_uuid()`, `owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` + trigger `public.set_updated_at()`.
- **RLS sempre attiva** con la policy standard (vedi template sotto). Nessuna policy per `anon`.
- Indice su `owner_id` e sulle colonne usate nei filtri/ordinamenti.
- Funzioni/viste specifiche dell'app: stesso prefisso; viste con `security_invoker = true`; funzioni con `set search_path = ''`.
- Storage: bucket privato `<slug>` con policy su `bucket_id = '<slug>'` + `public.is_allowed()` + `owner = auth.uid()`.
- Migrazioni: applicale con il connettore Supabase (`apply_migration`, nome `<prefisso>_<descrizione>`) e salva lo stesso SQL in `supabase/migrations/<YYYYMMDDHHMMSS>_<prefisso>_<descrizione>.sql`.
- Modifiche distruttive (drop di tabelle/colonne, cambi di tipo con perdita dati) solo dopo conferma esplicita.
- Dopo ogni migrazione: `get_advisors` (security) e correggi ciò che riguarda le tabelle dell'app.
- Free tier: 500 MB in tutto. Niente blob nel DB (usa Storage), niente log infiniti.

### Template tabella

```sql
create table public.<prefisso>_<entita> (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- colonne dell'app…
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.<prefisso>_<entita> (owner_id);
alter table public.<prefisso>_<entita> enable row level security;
create policy owner_all on public.<prefisso>_<entita>
  for all to authenticated
  using      ((select public.is_allowed()) and owner_id = (select auth.uid()))
  with check ((select public.is_allowed()) and owner_id = (select auth.uid()));
create trigger set_updated_at before update on public.<prefisso>_<entita>
  for each row execute function public.set_updated_at();
```

## Comandi

```bash
npm ci
npm run new-app -- <slug> "<Nome>" "<descrizione>" "<emoji>"
npm run dev -- <slug>          # http://localhost:5173/<slug>/
npm run build                  # tutto in dist/ (lo stesso che fa la Action)
npm run build:one -- <slug>    # controllo veloce di una sola app
```

## Sicurezza: perché i dati sono protetti anche se il repo è pubblico

- Il codice e la publishable key sono pubblici; chiunque può chiamare le API Supabase.
- Ma ogni tabella ha RLS: senza un JWT di un utente in `private.allowed_emails` le query tornano vuote e gli insert falliscono.
- L'hook `before-user-created` impedisce perfino la registrazione di altri account.
- Per dare accesso a qualcuno: `insert into private.allowed_emails(email) values ('...')` (vedrà solo i propri dati, per via di `owner_id`).
