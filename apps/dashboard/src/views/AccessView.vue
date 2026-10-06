<script setup>
// Gestione accessi (solo admin): chi può fare login e quali app può usare.
// La condivisione dei dati la decide ogni proprietario (pagina Condivisioni), non l'admin.
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase, unwrap, toast } from '@shared'
import { loadCatalog, useCatalog } from '../catalog.js'

const { state: catalog, all } = useCatalog()
const data = ref(null)
const loading = ref(true)
const busy = ref(false)
const err = ref(null)

async function load() {
  try {
    data.value = unwrap(await supabase.rpc('admin_overview'))
    err.value = null
  } catch (e) {
    err.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(() => { loadCatalog(); load() })

/** Esegue una RPC di amministrazione e ricarica la panoramica. */
async function run(fn, args, ok) {
  busy.value = true
  try {
    unwrap(await supabase.rpc(fn, args))
    if (ok) toast.ok(ok)
    await load()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

const apps = computed(() => all.filter((a) => !a.hidden && a.kind !== 'game'))
const users = computed(() => data.value?.users ?? [])

const nu = reactive({ email: '', name: '' })
async function addUser() {
  if (!nu.email.trim()) return
  await run('admin_upsert_user', { p_email: nu.email, p_name: nu.name || null, p_admin: false }, 'Utente aggiunto')
  nu.email = ''
  nu.name = ''
}
function toggleApp(u, slug, on) {
  run('admin_set_grant', { p_email: u.email, p_app: slug, p_on: on })
}
function renameUser(u) {
  const name = prompt(`Nome visualizzato per ${u.email}`, u.display_name ?? '')
  if (name !== null) run('admin_upsert_user', { p_email: u.email, p_name: name, p_admin: u.is_admin })
}
function removeUser(u) {
  if (confirm(`Togliere l'accesso a ${u.email}? Perderà tutte le app e le condivisioni (i suoi dati restano nel DB).`)) {
    run('admin_delete_user', { p_email: u.email }, 'Accesso rimosso')
  }
}
</script>

<template>
  <div v-if="loading" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
  <div v-else-if="err" class="card empty">
    <p class="error-text">{{ err }}</p>
    <RouterLink to="/" class="btn" style="margin-top: 12px">Torna alle app</RouterLink>
  </div>

  <div v-else class="stack" style="gap: 20px" :class="{ busy }">
    <div>
      <RouterLink to="/" class="small">← Le mie app</RouterLink>
      <h2 style="margin: 4px 0 0">Accessi</h2>
      <p class="muted small" style="margin: 4px 0 0">Chi può entrare e quali app può usare.</p>
    </div>

    <details class="card help">
      <summary><strong>Come funziona</strong></summary>
      <ul class="small">
        <li><strong>Utenti</strong>: solo le email qui sotto possono fare login. Ognuno vede in dashboard solo le app abilitate (tu le vedi tutte).</li>
        <li><strong>App abilitate</strong>: l'utente può aprire l'app e avere i propri dati. Nelle app 👤 <em>personali</em> ognuno ha il suo spazio, creato al primo accesso.</li>
        <li><strong>Condivisione</strong>: la decide chi possiede i dati, dalla pagina <RouterLink to="/condivisioni">Condivisioni</RouterLink> o dentro l'app. Neanche l'admin può condividere i dati di altri.</li>
        <li><em>Esempi</em> — Lista spesa: uno spazio condiviso "Casa" in modifica con chi vive con te. Allenamenti: ognuno i suoi, e il tuo condiviso in lettura. Spese: spazio personale + "Conto comune" in modifica.</li>
      </ul>
    </details>

    <section class="stack" style="gap: 10px">
      <h3 class="section-title">Utenti</h3>
      <form class="card add-user" @submit.prevent="addUser">
        <input v-model="nu.email" type="email" class="input" placeholder="email@gmail.com" aria-label="Email" required />
        <input v-model="nu.name" class="input" placeholder="Nome (facoltativo)" aria-label="Nome" />
        <button class="btn btn-primary" :disabled="busy">Aggiungi</button>
      </form>
      <p class="muted small" style="margin: 0">Serve un account Google con quella email. Dopo l'aggiunta, abilita le app qui sotto.</p>

      <div v-for="u in users" :key="u.email" class="card user">
        <div class="row-between" style="align-items: flex-start; flex-wrap: nowrap">
          <div style="min-width: 0">
            <strong>{{ u.display_name || u.email.split('@')[0] }}</strong>
            <div class="muted small ellipsis">{{ u.email }}</div>
            <div class="row" style="gap: 6px; margin-top: 6px">
              <span v-if="u.is_admin" class="badge badge-primary">admin</span>
              <span v-if="!u.registered" class="badge">mai entrato</span>
            </div>
          </div>
          <div class="row" style="gap: 2px; flex-wrap: nowrap">
            <button class="btn btn-ghost btn-sm" @click="renameUser(u)">Nome</button>
            <button v-if="!u.is_admin" class="btn btn-ghost btn-sm btn-danger" @click="removeUser(u)">Rimuovi</button>
          </div>
        </div>
        <div v-if="u.is_admin" class="muted small" style="margin-top: 10px">Accesso a tutte le app.</div>
        <div v-else class="app-toggles">
          <label v-for="a in apps" :key="a.slug" class="toggle" :class="{ on: u.apps.includes(a.slug) }">
            <input type="checkbox" :checked="u.apps.includes(a.slug)" :disabled="busy" @change="toggleApp(u, a.slug, $event.target.checked)" />
            {{ a.icon }} {{ a.name }}
          </label>
        </div>
      </div>
    </section>

    <p v-if="!catalog.admin && catalog.loaded" class="error-text">Questa pagina è riservata agli amministratori.</p>
  </div>
</template>

<style scoped>
.busy { opacity: .7; pointer-events: none; }
.section-title { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 0; }
.help summary { cursor: pointer; }
.help ul { margin: 10px 0 0; padding-left: 18px; display: grid; gap: 6px; }
.add-user { display: grid; gap: 8px; grid-template-columns: 1fr; }
@media (min-width: 640px) { .add-user { grid-template-columns: 2fr 1.4fr auto; } }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-toggles { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.toggle { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px solid var(--border); border-radius: 999px; font-size: .86rem; cursor: pointer; }
.toggle.on { background: var(--primary-soft); border-color: transparent; color: var(--primary); }
.toggle input { margin: 0; }
</style>
