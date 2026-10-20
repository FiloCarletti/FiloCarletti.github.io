<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { supabase, unwrap, toast, useSpace, fmtDate } from '@shared'
import { T } from '../db.js'
import { plural, summarize } from '../lib/score.js'
import MatchForm from '../components/MatchForm.vue'

const router = useRouter()
const { spaceId, canWrite } = useSpace()
const partite = ref([])
const mani = ref([])
const loading = ref(true)
const creating = ref(false)
const saving = ref(false)

async function load() {
  try {
    const [p, m] = await Promise.all([
      supabase.from(T.partite).select('*').eq('space_id', spaceId.value).order('data', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from(T.mani).select('*').eq('space_id', spaceId.value),
    ])
    partite.value = unwrap(p)
    mani.value = unwrap(m)
  } catch (e) {
    toast.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const list = computed(() => {
  const by = new Map()
  for (const m of mani.value) {
    if (!by.has(m.partita_id)) by.set(m.partita_id, [])
    by.get(m.partita_id).push(m)
  }
  return partite.value.map((p) => ({ p, s: summarize(p, by.get(p.id) ?? []) }))
})
const inCorso = computed(() => list.value.filter((x) => x.p.stato === 'in_corso'))
const concluse = computed(() => list.value.filter((x) => x.p.stato !== 'in_corso'))

async function create(data) {
  saving.value = true
  try {
    const row = unwrap(await supabase.from(T.partite).insert({ ...data, space_id: spaceId.value }).select().single())
    toast.ok('Partita creata')
    router.push(`/segnapunti/${row.id}`)
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="stack" style="gap: 16px">
    <div class="row-between">
      <div>
        <h2 style="margin: 0">Partite dal vivo</h2>
        <p class="muted small" style="margin: 0">Segna i punti mano per mano: totali, mancanti all’obiettivo e statistiche si calcolano da soli.</p>
      </div>
      <button v-if="canWrite && !creating" class="btn btn-primary" @click="creating = true">+ Nuova partita</button>
    </div>

    <section v-if="creating" class="card">
      <h3>Nuova partita</h3>
      <MatchForm :saving="saving" @save="create" @cancel="creating = false" />
    </section>

    <div v-if="loading" class="row" style="justify-content: center; padding: 24px"><div class="spinner" /></div>

    <template v-else>
      <div v-if="!list.length && !creating" class="card empty">
        <p style="font-size: 2rem; margin: 0">📝</p>
        <p>Nessuna partita ancora.</p>
        <button v-if="canWrite" class="btn btn-primary" @click="creating = true">Inizia a segnare i punti</button>
      </div>

      <section v-if="inCorso.length" class="stack">
        <h3 class="sec">In corso</h3>
        <RouterLink v-for="{ p, s } in inCorso" :key="p.id" :to="`/segnapunti/${p.id}`" class="card match">
          <div class="teams">
            <div class="t" :class="{ lead: s.leader === 0 }"><span class="name">{{ p.nome_a }}</span><strong>{{ s.tot[0] }}</strong><span class="muted small">mancano {{ s.teams[0].remaining }}</span></div>
            <div class="t" :class="{ lead: s.leader === 1 }"><span class="name">{{ p.nome_b }}</span><strong>{{ s.tot[1] }}</strong><span class="muted small">mancano {{ s.teams[1].remaining }}</span></div>
          </div>
          <div class="bars">
            <div class="bar"><span :style="{ width: `${s.teams[0].progress * 100}%` }" /></div>
            <div class="bar b"><span :style="{ width: `${s.teams[1].progress * 100}%` }" /></div>
          </div>
          <div class="muted small">{{ fmtDate(p.data) }} · a {{ p.obiettivo }} · {{ plural(s.n, 'mano', 'mani') }}<template v-if="s.n"> · differenza {{ Math.abs(s.diff) }}</template></div>
        </RouterLink>
      </section>

      <section v-if="concluse.length" class="stack">
        <h3 class="sec">Concluse</h3>
        <div class="card" style="padding: 0">
          <RouterLink v-for="{ p, s } in concluse" :key="p.id" :to="`/segnapunti/${p.id}`" class="done">
            <span class="muted small date">{{ fmtDate(p.data) }}</span>
            <span class="res">
              <span :class="{ win: p.vincitore === 'a' }">{{ p.nome_a }} {{ s.tot[0] }}</span>
              <span class="muted"> – </span>
              <span :class="{ win: p.vincitore === 'b' }">{{ s.tot[1] }} {{ p.nome_b }}</span>
            </span>
            <span class="muted small">{{ plural(s.n, 'mano', 'mani') }}</span>
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.sec { margin: 0; font-size: .85rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.match { display: flex; flex-direction: column; gap: 8px; color: inherit; text-decoration: none; }
.match:hover { border-color: var(--primary); }
.teams { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.t { display: flex; flex-direction: column; min-width: 0; }
.t:last-child { text-align: right; }
.t .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t strong { font-size: 1.6rem; line-height: 1.15; font-variant-numeric: tabular-nums; }
.t.lead strong { color: var(--ok); }
.bars { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.bar { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--primary); border-radius: 3px; }
.bar.b { transform: scaleX(-1); }
.bar.b span { background: var(--warn); }
.done { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border); color: inherit; text-decoration: none; }
.done:last-child { border-bottom: 0; }
.done:hover { background: var(--surface-2); }
.date { width: 92px; flex-shrink: 0; }
.res { flex: 1; min-width: 0; font-variant-numeric: tabular-nums; }
.win { font-weight: 700; }
</style>
