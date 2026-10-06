<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Avatar, fmtDate, useAuth } from '@shared'
import { MODES, fmtRelative, loadCatalog, useCatalog } from '../catalog.js'

const { user } = useAuth()
const { state, apps, recent, friends, games } = useCatalog()
onMounted(loadCatalog)

const firstName = computed(() => (user.value?.user_metadata?.full_name ?? '').split(' ')[0])
const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 6 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'
})

const q = ref('')
const tag = ref('')
const SORTS = [
  { value: 'used', label: 'Più usate' },
  { value: 'recent', label: 'Aperte di recente' },
  { value: 'name', label: 'Nome' },
  { value: 'updated', label: 'Aggiornate' },
]
const sort = ref(readSort())
function readSort() {
  try { return localStorage.getItem('dashboard-sort') ?? 'used' } catch { return 'used' }
}
function setSort(v) {
  sort.value = v
  try { localStorage.setItem('dashboard-sort', v) } catch { /* storage non disponibile */ }
}

const tags = computed(() => [...new Set([...apps.value, ...games].flatMap((a) => a.tags ?? []))].sort((a, b) => a.localeCompare(b, 'it')))
const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const gameList = computed(() => {
  const words = norm(q.value.trim()).split(/\s+/).filter(Boolean)
  return games.filter((g) => {
    if (tag.value && !(g.tags ?? []).includes(tag.value)) return false
    const hay = norm([g.name, g.description, g.slug, ...(g.tags ?? [])].join(' '))
    return words.every((w) => hay.includes(w))
  })
})

const list = computed(() => {
  const words = norm(q.value.trim()).split(/\s+/).filter(Boolean)
  const out = apps.value.filter((a) => {
    if (tag.value && !(a.tags ?? []).includes(tag.value)) return false
    const hay = norm([a.name, a.description, a.slug, ...(a.tags ?? [])].join(' '))
    return words.every((w) => hay.includes(w))
  })
  const by = {
    used: (a, b) => b.opens - a.opens || (b.lastOpened ?? '').localeCompare(a.lastOpened ?? '') || a.name.localeCompare(b.name, 'it'),
    recent: (a, b) => (b.lastOpened ?? '').localeCompare(a.lastOpened ?? '') || a.name.localeCompare(b.name, 'it'),
    name: (a, b) => a.name.localeCompare(b.name, 'it'),
    updated: (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.name.localeCompare(b.name, 'it'),
  }
  return out.sort(by[sort.value] ?? by.used)
})

// "/" mette il focus sulla ricerca; Invio apre il primo risultato.
const search = ref(null)
function onKey(e) {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault()
    search.value?.focus()
  }
}
function openFirst() {
  const first = list.value[0] ?? gameList.value[0]
  if (first) window.location.href = first.path
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="stack" style="gap: 20px">
    <header class="hero">
      <h2>{{ greeting }}{{ firstName ? `, ${firstName}` : '' }} 👋</h2>
      <p class="muted small">
        <template v-if="state.loaded">{{ apps.length }} app disponibil{{ apps.length === 1 ? 'e' : 'i' }}</template>
        <template v-else>&nbsp;</template>
      </p>
      <div class="search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input
          ref="search" v-model="q" type="search" class="input" placeholder="Cerca un'app…" aria-label="Cerca un'app"
          @keydown.enter="openFirst" @keydown.esc="q = ''"
        />
        <kbd class="hide-sm">/</kbd>
      </div>
    </header>

    <div v-if="!state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>

    <template v-else>
      <section v-if="recent.length && !q && !tag" aria-labelledby="recenti">
        <h3 id="recenti" class="section-title">Usate di recente</h3>
        <div class="recent">
          <a v-for="a in recent" :key="a.slug" :href="a.path" class="recent-item" :title="`${a.name} · aperta ${fmtRelative(a.lastOpened)}`">
            <span class="recent-icon">{{ a.icon }}</span>
            <span class="recent-name">{{ a.name }}</span>
          </a>
        </div>
      </section>

      <section aria-labelledby="tutte" class="stack" style="gap: 10px">
        <div class="row-between">
          <h3 id="tutte" class="section-title" style="margin: 0">{{ q || tag ? `Risultati (${list.length})` : 'Tutte le app' }}</h3>
          <select :value="sort" class="select sort" aria-label="Ordina" @change="setSort($event.target.value)">
            <option v-for="s in SORTS" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </div>

        <div v-if="tags.length > 1" class="chips" role="group" aria-label="Filtra per etichetta">
          <button class="chip" :class="{ on: !tag }" @click="tag = ''">Tutte</button>
          <button v-for="t in tags" :key="t" class="chip" :class="{ on: tag === t }" @click="tag = tag === t ? '' : t">{{ t }}</button>
        </div>

        <div v-if="list.length" class="list">
          <a v-for="a in list" :key="a.slug" :href="a.path" class="card app">
            <div class="app-icon">{{ a.icon }}</div>
            <div class="app-body">
              <div class="app-head">
                <strong>{{ a.name }}</strong>
                <span class="badge" :title="MODES[a.dataMode]?.hint">{{ MODES[a.dataMode]?.icon }} {{ MODES[a.dataMode]?.label }}</span>
              </div>
              <p class="muted small desc">{{ a.description }}</p>
              <div class="row meta">
                <span v-for="t in a.tags" :key="t" class="badge">{{ t }}</span>
                <span class="muted small">{{ a.lastOpened ? `aperta ${fmtRelative(a.lastOpened)}` : 'mai aperta' }}</span>
                <span v-if="a.updatedAt" class="muted small">· agg. {{ fmtDate(a.updatedAt) }}</span>
              </div>
            </div>
            <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
          </a>
        </div>
        <div v-else-if="apps.length && !gameList.length" class="card empty">
          Nessuna app corrisponde a “{{ q || tag }}”.
          <button class="btn btn-sm" style="margin-left: 6px" @click="q = ''; tag = ''">Azzera</button>
        </div>
        <div v-else-if="!apps.length" class="card empty">
          <p style="font-size: 2rem; margin: 0">🌱</p>
          <p v-if="state.admin">Nessuna app ancora. Chiedi a Claude di crearne una!</p>
          <p v-else>Non hai ancora app abilitate: chiedi all'amministratore di darti accesso.</p>
        </div>
      </section>

      <section v-if="gameList.length" aria-labelledby="giochi" class="stack" style="gap: 10px">
        <h3 id="giochi" class="section-title" style="margin: 0">Giochi</h3>
        <div class="list">
          <a v-for="g in gameList" :key="g.slug" :href="g.path" class="card app game">
            <div class="app-icon">{{ g.icon }}</div>
            <div class="app-body">
              <div class="app-head">
                <strong>{{ g.name }}</strong>
                <span class="badge" title="Si gioca nel browser, i progressi restano su questo dispositivo">🎮 Gioco</span>
              </div>
              <p class="muted small desc">{{ g.description }}</p>
              <div v-if="g.updatedAt" class="row meta">
                <span class="muted small">agg. {{ fmtDate(g.updatedAt) }}</span>
              </div>
            </div>
            <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
          </a>
        </div>
      </section>

      <section v-if="!q && !tag && friends.length" aria-labelledby="community" class="stack" style="gap: 10px">
        <h3 id="community" class="section-title" style="margin: 0">Community</h3>
        <div class="friends">
          <RouterLink v-for="f in friends" :key="f.email" :to="`/amici/${encodeURIComponent(f.email)}`" class="card friend">
            <Avatar :name="f.name" :src="f.avatar" :size="44" />
            <div style="min-width: 0">
              <strong class="ellipsis">{{ f.name }}</strong>
              <div class="muted small">{{ f.spaces.length }} condivision{{ f.spaces.length === 1 ? 'e' : 'i' }}</div>
              <div class="friend-apps">
                <span v-for="s in f.spaces.slice(0, 5)" :key="s.id" :title="s.app.name">{{ s.app.icon }}</span>
              </div>
            </div>
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.hero h2 { margin: 0; font-size: 1.5rem; }
.hero p { margin: 2px 0 14px; }
.search { position: relative; display: flex; align-items: center; }
.search svg { position: absolute; left: 12px; color: var(--muted); pointer-events: none; }
.search .input { padding: 12px 40px 12px 40px; font-size: 1rem; border-radius: var(--radius-lg); box-shadow: var(--shadow); }
.search kbd { position: absolute; right: 12px; font: .78rem var(--mono); color: var(--muted); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; }
.section-title { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 0 0 10px; }

.recent { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 8px; margin: 0 -2px; scroll-snap-type: x mandatory; scrollbar-width: thin; }
.recent-item { flex: 0 0 76px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 6px 2px; border-radius: var(--radius); color: var(--text); text-decoration: none; scroll-snap-align: start; }
.recent-item:hover .recent-icon, .recent-item:focus-visible .recent-icon { transform: translateY(-2px); border-color: var(--primary); }
.recent-icon { width: 56px; height: 56px; display: grid; place-items: center; font-size: 1.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); transition: transform .15s, border-color .15s; }
.recent-name { font-size: .76rem; max-width: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.sort { width: auto; padding: 6px 10px; font-size: .88rem; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { border: 1px solid var(--border); background: var(--surface); color: var(--muted); border-radius: 999px; padding: 4px 12px; font: inherit; font-size: .85rem; cursor: pointer; }
.chip.on { background: var(--primary-soft); color: var(--primary); border-color: transparent; }

.list { display: grid; gap: 10px; grid-template-columns: 1fr; }
@media (min-width: 760px) { .list { grid-template-columns: 1fr 1fr; } }
.app { display: flex; gap: 14px; align-items: flex-start; color: inherit; text-decoration: none; transition: transform .15s, border-color .15s; }
.app:hover { transform: translateY(-2px); border-color: var(--primary); }
.game { background: linear-gradient(135deg, var(--surface), var(--primary-soft)); }
.app-icon { font-size: 1.8rem; width: 48px; height: 48px; display: grid; place-items: center; background: var(--surface-2); border-radius: 14px; flex-shrink: 0; }
.app-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.app-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.desc { margin: 0; }
.meta { gap: 6px; margin-top: 2px; }
.chev { color: var(--muted); align-self: center; flex-shrink: 0; }
@media (max-width: 480px) { .hide-sm { display: none; } }
.friends { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.friend { display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; padding: 12px 14px; transition: transform .15s, border-color .15s; }
.friend:hover { transform: translateY(-2px); border-color: var(--primary); }
.friend-apps { display: flex; gap: 4px; margin-top: 2px; }
.ellipsis { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
