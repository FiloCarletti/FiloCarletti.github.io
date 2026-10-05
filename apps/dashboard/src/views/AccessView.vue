<script setup>
// Gestione accessi (solo admin): utenti autorizzati, app abilitate, spazi di dati e loro membri.
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase, unwrap, toast } from '@shared'
import { MODES, loadCatalog, useCatalog } from '../catalog.js'

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

const apps = computed(() => all.filter((a) => !a.hidden))
const appBySlug = computed(() => new Map(all.map((a) => [a.slug, a])))
const users = computed(() => data.value?.users ?? [])
const userName = (email) => users.value.find((u) => u.email === email)?.display_name || email

/* ---------- utenti ---------- */
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

/* ---------- spazi ---------- */
const spacesByApp = computed(() => {
  const map = new Map(apps.value.map((a) => [a.slug, []]))
  for (const s of data.value?.spaces ?? []) {
    if (!map.has(s.app_slug)) map.set(s.app_slug, [])
    map.get(s.app_slug).push(s)
  }
  return map
})
function spaceTitle(s) {
  if (s.kind === 'shared') return s.name
  return s.mine ? 'Il tuo spazio personale' : `Personale di ${userName(s.owner_email)}`
}
const adding = reactive({}) // space_id → { email, role }
const addState = (s) => (adding[s.id] ??= { email: '', role: 'viewer' })
const candidates = (s) => users.value.filter((u) => u.email !== s.owner_email && !s.members.some((m) => m.email === u.email))

async function addMember(s) {
  const a = addState(s)
  if (!a.email) return
  // Chi entra in uno spazio deve poter aprire l'app.
  const u = users.value.find((x) => x.email === a.email)
  if (u && !u.is_admin && !u.apps.includes(s.app_slug)) {
    try { unwrap(await supabase.rpc('admin_set_grant', { p_email: a.email, p_app: s.app_slug, p_on: true })) } catch (e) { return toast.error(e) }
  }
  await run('admin_set_member', { p_space: s.id, p_email: a.email, p_role: a.role }, 'Condivisione aggiornata')
  a.email = ''
}
function setRole(s, m, role) {
  run('admin_set_member', { p_space: s.id, p_email: m.email, p_role: role })
}
function removeMember(s, m) {
  run('admin_set_member', { p_space: s.id, p_email: m.email, p_role: null }, 'Membro rimosso')
}
function createSpace(slug) {
  const name = prompt('Nome del nuovo spazio condiviso (es. "Casa", "Conto comune")')
  if (name?.trim()) run('admin_create_space', { p_app: slug, p_name: name }, 'Spazio creato')
}
function renameSpace(s) {
  const name = prompt('Nuovo nome', s.name)
  if (name?.trim()) run('admin_rename_space', { p_id: s.id, p_name: name })
}
function deleteSpace(s) {
  if (confirm(`Eliminare lo spazio "${s.name}"? Si può solo se è vuoto.`)) run('admin_delete_space', { p_id: s.id }, 'Spazio eliminato')
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
      <h2 style="margin: 0">Accessi</h2>
      <p class="muted small" style="margin: 4px 0 0">Chi può entrare, quali app vede e con chi condivide i dati.</p>
    </div>

    <details class="card help">
      <summary><strong>Come funziona</strong></summary>
      <ul class="small">
        <li><strong>Utenti</strong>: solo le email qui sotto possono fare login. Ognuno vede in dashboard solo le app abilitate (tu le vedi tutte).</li>
        <li><strong>Spazi</strong>: i dati di un'app stanno in uno spazio. Nelle app 👤 <em>personali</em> ognuno ha il proprio, creato al primo accesso; gli spazi 👥 <em>condivisi</em> li crei tu.</li>
        <li><strong>Membri</strong>: aggiungi qualcuno a uno spazio in <em>lettura</em> (vede i dati) o <em>modifica</em> (li cambia). Dall'app si passa da uno spazio all'altro con il selettore "Dati".</li>
        <li><em>Esempi</em> — Lista spesa: spazio condiviso "Casa" con chi vive con te in modifica. Allenamenti: ognuno il suo spazio personale, e il tuo condiviso in lettura. Spese: spazio personale + "Conto comune" condiviso in modifica.</li>
        <li>Tu, da admin, gestisci tutto ma non vedi i dati personali degli altri finché non ti aggiungi come membro.</li>
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

    <section class="stack" style="gap: 10px">
      <h3 class="section-title">Spazi di dati</h3>
      <div v-for="[slug, list] in spacesByApp" :key="slug" class="card stack app-spaces">
        <div class="row-between">
          <strong>{{ appBySlug.get(slug)?.icon }} {{ appBySlug.get(slug)?.name ?? slug }}</strong>
          <span class="badge">{{ MODES[appBySlug.get(slug)?.dataMode]?.icon }} {{ MODES[appBySlug.get(slug)?.dataMode]?.label }}</span>
        </div>
        <p v-if="!list.length" class="muted small" style="margin: 0">Nessuno spazio: quello personale si crea al primo accesso all'app.</p>

        <div v-for="s in list" :key="s.id" class="space">
          <div class="row-between" style="flex-wrap: nowrap">
            <div style="min-width: 0">
              <span>{{ s.kind === 'shared' ? '👥' : '👤' }}</span> <strong>{{ spaceTitle(s) }}</strong>
            </div>
            <div v-if="s.kind === 'shared'" class="row" style="gap: 2px; flex-wrap: nowrap">
              <button class="btn btn-ghost btn-sm" @click="renameSpace(s)">Rinomina</button>
              <button class="btn btn-ghost btn-sm btn-danger" @click="deleteSpace(s)">Elimina</button>
            </div>
          </div>

          <ul v-if="s.members.length" class="members">
            <li v-for="m in s.members" :key="m.email">
              <span class="ellipsis">{{ userName(m.email) }}</span>
              <select :value="m.role" class="select select-sm" :aria-label="`Permesso di ${m.email}`" @change="setRole(s, m, $event.target.value)">
                <option value="viewer">Lettura</option>
                <option value="editor">Modifica</option>
              </select>
              <button class="btn btn-ghost btn-icon btn-danger" :aria-label="`Rimuovi ${m.email}`" @click="removeMember(s, m)">✕</button>
            </li>
          </ul>
          <p v-else class="muted small" style="margin: 4px 0">{{ s.kind === 'shared' ? 'Nessun membro oltre a te.' : 'Non condiviso.' }}</p>

          <div v-if="candidates(s).length" class="add-member">
            <select v-model="addState(s).email" class="select select-sm" aria-label="Utente da aggiungere">
              <option value="">Condividi con…</option>
              <option v-for="u in candidates(s)" :key="u.email" :value="u.email">{{ u.display_name || u.email }}</option>
            </select>
            <select v-model="addState(s).role" class="select select-sm" aria-label="Permesso">
              <option value="viewer">Lettura</option>
              <option value="editor">Modifica</option>
            </select>
            <button class="btn btn-sm" :disabled="!addState(s).email || busy" @click="addMember(s)">Aggiungi</button>
          </div>
        </div>

        <button class="btn btn-sm" style="align-self: flex-start" :disabled="busy" @click="createSpace(slug)">+ Spazio condiviso</button>
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
.space { border-top: 1px solid var(--border); padding-top: 10px; }
.members { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 4px; }
.members li { display: flex; align-items: center; gap: 8px; }
.members li .ellipsis { flex: 1; min-width: 0; }
.select-sm { width: auto; padding: 5px 8px; font-size: .86rem; }
.add-member { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.add-member .select-sm:first-child { flex: 1 1 160px; }
</style>
