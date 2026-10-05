<script setup>
// I miei spazi (di cui sono titolare o co-proprietario), app per app, con la loro condivisione.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { SpaceSharing, ownersLabel, spaceUrl, supabase, toast, unwrap } from '@shared'
import { MODES, loadCatalog, useCatalog } from '../catalog.js'

const { state, apps, all } = useCatalog()
const shares = ref([])
const loading = ref(true)
const open = ref(null) // id dello spazio con i controlli aperti

async function load() {
  try {
    shares.value = unwrap(await supabase.rpc('my_shares')) ?? []
  } catch (e) {
    toast.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(() => { loadCatalog(); load() })

const bySlug = computed(() => new Map(all.map((a) => [a.slug, a])))
// App abilitate + app in cui sono co-proprietario di qualcosa.
const groups = computed(() => {
  const slugs = [...new Set([...apps.value.map((a) => a.slug), ...shares.value.map((s) => s.app_slug)])]
  return slugs
    .map((slug) => ({
      app: bySlug.value.get(slug) ?? { slug, name: slug, icon: '🧩', dataMode: 'personal' },
      spaces: shares.value.filter((s) => s.app_slug === slug),
      canCreate: apps.value.some((a) => a.slug === slug),
    }))
    .sort((a, b) => a.app.name.localeCompare(b.app.name, 'it'))
})

const title = (s) => (s.kind === 'shared' ? s.name : 'Dati personali')
const summary = (s) => {
  const n = (s.members ?? []).length
  const parts = [ownersLabel(s.owners)]
  if (n) parts.push(`${n} ${n === 1 ? 'persona' : 'persone'}`)
  if (s.link_token) parts.push('link pubblico attivo')
  return parts.join(' · ')
}

async function create(slug) {
  const name = prompt('Nome del nuovo spazio condiviso (es. "Casa", "Conto comune")')
  if (!name?.trim()) return
  try {
    const id = unwrap(await supabase.rpc('space_create', { p_app: slug, p_name: name }))
    toast.ok('Spazio creato: ora condividilo')
    await load()
    open.value = id
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="stack" style="gap: 16px">
    <div>
      <RouterLink to="/" class="small">← Le mie app</RouterLink>
      <h2 style="margin: 4px 0 0">Condivisioni</h2>
      <p class="muted small" style="margin: 4px 0 0">
        I tuoi dati, app per app. Condividili in <strong>lettura</strong> (vedono) o in <strong>modifica</strong> (diventano co-proprietari),
        oppure con un link pubblico.
      </p>
    </div>

    <div v-if="loading || !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="!groups.length" class="card empty">Non hai ancora app abilitate.</div>

    <section v-for="g in groups" v-else :key="g.app.slug" class="card stack app">
      <div class="row-between">
        <strong>{{ g.app.icon }} {{ g.app.name }}</strong>
        <span class="badge">{{ MODES[g.app.dataMode]?.icon }} {{ MODES[g.app.dataMode]?.label }}</span>
      </div>
      <p v-if="!g.spaces.length" class="muted small" style="margin: 0">
        Nessun dato ancora: lo spazio personale si crea la prima volta che apri l'app.
      </p>

      <div v-for="s in g.spaces" :key="s.id" class="space">
        <div class="row-between" style="flex-wrap: nowrap; align-items: flex-start">
          <button class="space-head" :aria-expanded="open === s.id" @click="open = open === s.id ? null : s.id">
            <span>{{ s.kind === 'shared' ? '👥' : '👤' }}</span>
            <span style="min-width: 0">
              <strong>{{ title(s) }}</strong>
              <span class="muted small" style="display: block">{{ summary(s) }}</span>
            </span>
          </button>
          <div class="row" style="flex-wrap: nowrap; gap: 4px">
            <a :href="spaceUrl(s.app_slug, s.id)" class="btn btn-ghost btn-sm">Apri</a>
            <button class="btn btn-sm" @click="open = open === s.id ? null : s.id">{{ open === s.id ? 'Chiudi' : 'Condividi' }}</button>
          </div>
        </div>
        <SpaceSharing v-if="open === s.id" :info="s" style="margin-top: 12px" @changed="load" @deleted="load" />
      </div>

      <button v-if="g.canCreate" class="btn btn-sm" style="align-self: flex-start" @click="create(g.app.slug)">+ Spazio condiviso</button>
    </section>
  </div>
</template>

<style scoped>
.space { border-top: 1px solid var(--border); padding-top: 10px; }
.space-head { display: flex; gap: 8px; align-items: flex-start; background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; min-width: 0; }
</style>
