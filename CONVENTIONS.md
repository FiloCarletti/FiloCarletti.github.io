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
| Accesso | Login solo per le email in `private.allowed_emails` (hook di registrazione). Ogni utente apre solo le app abilitate (`private.app_grants`; gli admin tutte). I dati stanno in **spazi** (vedi sotto). Si gestisce tutto dalla pagina **Accessi** della dashboard |

```
apps/
  dashboard/            # indice delle app (legge apps.generated.json creato in build)
  _template/            # copiato da `npm run new-app` (non pubblicato)
  <slug>/
    app.json            # nome, descrizione, icona, dataMode, tabelle, date → card in dashboard
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
4. **Shared**: `import { supabase, unwrap, toast, useAuth, useSpace, fmtEuro, fmtDate, todayISO } from '@shared'`. Non modificare `packages/shared` per esigenze di una sola app; se una modifica serve a tutte, verifica che le altre app compilino ancora.
5. **Errori**: ogni chiamata Supabase passa da `unwrap(...)` dentro `try/catch` con `toast.error(e)`.
6. **Segreti**: nel codice c'è solo la publishable key (pubblica per design). Mai service_role/secret key, mai token o password nel repo (è pubblico).
7. **Metadati**: aggiorna `app.json` (`description`, `tables`, `updatedAt`) a ogni modifica: la dashboard si rigenera da lì.
8. **Spazi**: `const { spaceId, canWrite } = useSpace()`. Ogni select filtra `.eq('space_id', spaceId.value)`, ogni insert mette `space_id: spaceId.value`, i comandi di modifica stanno sotto `v-if="canWrite"`. Cambiare spazio ricarica la pagina, quindi basta leggere i dati al mount. `AuthGate` mostra l'app solo dopo aver verificato l'accesso e caricato gli spazi; `AppShell` mostra il selettore "Dati" quando serve.
9. **`dataMode`** in `app.json`: `personal` (ognuno i suoi dati, es. allenamenti), `shared` (dati unici per tutti gli abilitati, es. lista della spesa: all'admin viene creato uno spazio "Condiviso"), `mixed` (personale + spazi condivisi, es. spese con "conto comune"). In tutti i casi l'admin può creare spazi condivisi e condividere quelli personali in lettura o modifica.

## Permessi e spazi

| Oggetto | Dove | Significato |
|---|---|---|
| Utente | `private.allowed_emails` (`is_admin`, `display_name`) | Può fare login. Gli admin vedono tutte le app e gestiscono gli accessi |
| Accesso app | `private.app_grants (app_slug, email)` | L'utente vede e apre l'app |
| Spazio | `private.spaces (app_slug, kind, name, owner_id)` | Contenitore dei dati. `personal`: uno per utente e app, creato al primo accesso. `shared`: creato dall'admin |
| Membro | `private.space_members (space_id, email, role)` | `viewer` legge, `editor` legge e scrive. Il titolare/creatore ha sempre tutti i permessi |

- Le tabelle `private.*` non sono esposte: si usano solo tramite RPC (`my_spaces`, `my_apps`, `admin_*`).
- Le policy delle tabelle delle app usano `public.readable_space_ids()` e `public.writable_space_ids()` (già filtrate per app abilitata).
- L'admin non vede automaticamente i dati personali altrui: deve aggiungersi come membro, in modo visibile.
- Per dare accesso a qualcuno: dashboard → **Accessi** → aggiungi l'email, abilita le app, e se serve condividi uno spazio.

## Regole per il database (condiviso)

- Ogni tabella si chiama `<prefisso>_<entità>` dove il prefisso è lo slug con `_` (`spese-casa` → `spese_casa_movimenti`). Mai tabelle senza prefisso, mai toccare tabelle di altre app.
- Colonne standard: `id uuid pk default gen_random_uuid()`, `space_id uuid not null references private.spaces(id)` (dove stanno i dati), `owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade` (chi ha creato la riga), `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` + trigger `public.set_updated_at()`.
- **RLS sempre attiva** con le 4 policy standard sugli spazi (vedi template sotto). Nessuna policy per `anon`.
- Indice su `space_id`, `owner_id` e sulle colonne usate nei filtri/ordinamenti. I vincoli di unicità "per utente" diventano "per spazio" (`unique (space_id, …)`).
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
  space_id    uuid not null references private.spaces(id),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- colonne dell'app…
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.<prefisso>_<entita> (space_id);
create index on public.<prefisso>_<entita> (owner_id);
alter table public.<prefisso>_<entita> enable row level security;
create policy space_select on public.<prefisso>_<entita> for select to authenticated
  using (space_id in (select public.readable_space_ids()));
create policy space_insert on public.<prefisso>_<entita> for insert to authenticated
  with check (space_id in (select public.writable_space_ids()) and owner_id = (select auth.uid()));
create policy space_update on public.<prefisso>_<entita> for update to authenticated
  using (space_id in (select public.writable_space_ids()))
  with check (space_id in (select public.writable_space_ids()));
create policy space_delete on public.<prefisso>_<entita> for delete to authenticated
  using (space_id in (select public.writable_space_ids()));
create trigger set_updated_at before update on public.<prefisso>_<entita>
  for each row execute function public.set_updated_at();
```

## Comandi

```bash
npm ci
npm run new-app -- <slug> "<Nome>" "<descrizione>" "<emoji>"
npm run dev                    # tutte le app: http://localhost:5173/ (dashboard) e /<slug>/
npm run dev -- <slug>          # idem, evidenzia l'URL di <slug>
npm run build                  # tutto in dist/ (lo stesso che fa la Action)
npm run build:one -- <slug>    # controllo veloce di una sola app
```

Login da localhost: in Supabase → Authentication → URL Configuration deve esserci il Redirect URL `http://localhost:5173/**` (altrimenti dopo il login Google si torna al sito pubblicato).

## Sicurezza: perché i dati sono protetti anche se il repo è pubblico

- Il codice e la publishable key sono pubblici; chiunque può chiamare le API Supabase.
- Ma ogni tabella ha RLS: si leggono solo gli spazi propri o condivisi con sé, nelle app abilitate; si scrive solo dove si è titolari o editor.
- L'hook `before-user-created` impedisce perfino la registrazione di altri account.
- Per dare accesso a qualcuno: pagina **Accessi** della dashboard (oppure le RPC `admin_*`). Se il progetto Google OAuth è in modalità "Testing", l'email va aggiunta anche ai *Test users* in Google Cloud Console.
