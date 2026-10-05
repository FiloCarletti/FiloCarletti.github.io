<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { supabase, unwrap, toast, useSpace } from '@shared'
import { T } from '../db.js'
import { useData } from '../store.js'
import ChartBox from '../components/ChartBox.vue'
import StatTile from '../components/StatTile.vue'
import CatDot from '../components/CatDot.vue'
import { CATEGORIE, UNITA } from '../lib/categories.js'
import { fmtAgo, fmtKg, fmtNum, fmtPct, fmtShort, fmtVoce, parseISO } from '../lib/metrics.js'
import { accent, accent2 } from '../lib/theme.js'

const { state, esById, history, load, reload } = useData()
const { canWrite } = useSpace()
const route = useRoute()
const router = useRouter()
load()

const ex = computed(() => esById.value.get(route.params.id) ?? null)
const h = computed(() => history.value.get(route.params.id) ?? [])
const unita = computed(() => ex.value?.unita ?? 'rip')
const weighted = computed(() => unita.value === 'rip' && h.value.some((v) => v.peso_kg > 0))
const unitLabel = computed(() => (weighted.value ? 'kg' : unita.value === 'sec' ? 's' : unita.value === 'cardio' ? '' : 'rip'))

/** Una riga per sessione (un esercizio può comparire più volte nello stesso allenamento). */
const perSession = computed(() => {
  const map = new Map()
  for (const v of h.value) {
    const x = map.get(v.sessione_id) ?? { data: v.data, sid: v.sessione_id, peso: 0, e1rm: 0, vol: 0, rip: 0, tot: 0, km: 0, min: 0, pr: false }
    x.peso = Math.max(x.peso, Number(v.peso_kg ?? 0))
    x.e1rm = Math.max(x.e1rm, v.e1rm ?? 0)
    x.vol += v.volume
    x.rip = Math.max(x.rip, Number(v.ripetizioni ?? 0))
    x.tot += Number(v.serie ?? 1) * Number(v.ripetizioni ?? 0)
    x.km += Number(v.distanza_km ?? 0)
    x.min += Number(v.durata_min ?? 0)
    x.pr ||= v.isPR
    map.set(v.sessione_id, x)
  }
  return [...map.values()]
})

const metric = (x) => (weighted.value ? x.peso : unita.value === 'cardio' ? x.km || x.min : x.rip)

const kpi = computed(() => {
  const p = perSession.value
  if (!p.length) return null
  const first = metric(p[0]), last = metric(p.at(-1))
  return {
    n: p.length,
    best: Math.max(...p.map(metric)),
    e1rm: Math.max(...p.map((x) => x.e1rm)),
    delta: p.length > 1 && first > 0 ? last / first - 1 : null,
    first, last,
    vol: p.reduce((a, x) => a + x.vol, 0),
    tot: p.reduce((a, x) => a + x.tot, 0),
    prs: p.filter((x) => x.pr).length,
    lastDate: p.at(-1).data,
  }
})

/* ---------- grafici ---------- */
const t = (x) => parseISO(x.data).getTime()
const timeAxis = {
  type: 'linear',
  ticks: { callback: (v) => fmtShort(new Date(v)), maxTicksLimit: 6 },
}
const pointR = (arr) => arr.map((x) => (x.pr ? 7 : 4))

const progressChart = computed(() => {
  const p = perSession.value
  if (weighted.value) {
    const ds = [{
      label: 'Peso massimo', data: p.map((x) => ({ x: t(x), y: x.peso })), borderColor: accent(), backgroundColor: accent(), pointRadius: pointR(p),
    }]
    if (p.some((x) => x.e1rm > 0)) {
      ds.push({
        label: '1RM stimato', data: p.filter((x) => x.e1rm > 0).map((x) => ({ x: t(x), y: Math.round(x.e1rm * 10) / 10 })),
        borderColor: accent2(), backgroundColor: accent2(), borderDash: [5, 4],
      })
    }
    return { datasets: ds }
  }
  const label = unita.value === 'sec' ? 'Secondi per serie' : unita.value === 'cardio' ? (p.some((x) => x.km) ? 'Distanza (km)' : 'Durata (min)') : 'Ripetizioni per serie'
  return { datasets: [{ label, data: p.map((x) => ({ x: t(x), y: metric(x) })), borderColor: accent(), backgroundColor: accent(), pointRadius: pointR(p) }] }
})
const progressOpts = computed(() => ({
  scales: { x: timeAxis, y: { beginAtZero: false, grace: '10%' } },
  plugins: {
    legend: { display: weighted.value },
    tooltip: {
      callbacks: {
        title: (i) => fmtShort(new Date(i[0].raw.x)),
        label: (c) => ` ${c.dataset.label}: ${fmtNum(c.raw.y)} ${weighted.value ? 'kg' : ''}`,
      },
    },
  },
}))

const volumeChart = computed(() => {
  const p = perSession.value
  const label = weighted.value ? 'Volume (kg)' : unita.value === 'sec' ? 'Secondi totali' : unita.value === 'cardio' ? 'Minuti' : 'Ripetizioni totali'
  const val = (x) => (weighted.value ? Math.round(x.vol) : unita.value === 'cardio' ? x.min : x.tot)
  return {
    labels: p.map((x) => fmtShort(x.data)),
    datasets: [{ label, data: p.map(val), backgroundColor: accent(), maxBarThickness: 32 }],
  }
})
const volumeOpts = { plugins: { legend: { display: false } } }

/* ---------- modifica / unisci / elimina ---------- */
const editing = ref(false)
const edit = reactive({ nome: '', categoria: '', unita: 'rip', note: '' })
const mergeInto = ref('')
const busy = ref(false)
watch(ex, (e) => e && Object.assign(edit, { nome: e.nome, categoria: e.categoria, unita: e.unita, note: e.note ?? '' }), { immediate: true })

const catOptions = computed(() => [...new Set([...CATEGORIE, ...state.esercizi.map((e) => e.categoria)])])
const others = computed(() => state.esercizi.filter((e) => e.id !== route.params.id).sort((a, b) => a.nome.localeCompare(b.nome, 'it')))

async function saveEdit() {
  if (!edit.nome.trim()) return toast.error('Il nome non può essere vuoto.')
  busy.value = true
  try {
    unwrap(await supabase.from(T.esercizi).update({
      nome: edit.nome.trim(), categoria: edit.categoria.trim() || 'Altro', unita: edit.unita, note: edit.note.trim() || null,
    }).eq('id', ex.value.id))
    await reload()
    editing.value = false
    toast.ok('Esercizio aggiornato')
  } catch (e) {
    toast.error(e.code === '23505' ? new Error('Esiste già un esercizio con questo nome: usa "Unisci".') : e)
  } finally {
    busy.value = false
  }
}

async function merge() {
  const target = esById.value.get(mergeInto.value)
  if (!target || !confirm(`Spostare tutto lo storico di "${ex.value.nome}" in "${target.nome}" ed eliminare "${ex.value.nome}"?`)) return
  busy.value = true
  try {
    unwrap(await supabase.from(T.voci).update({ esercizio_id: target.id }).eq('esercizio_id', ex.value.id))
    unwrap(await supabase.from(T.esercizi).delete().eq('id', ex.value.id))
    await reload()
    toast.ok(`Uniti in "${target.nome}"`)
    router.replace(`/esercizi/${target.id}`)
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!confirm(`Eliminare "${ex.value.nome}"?`)) return
  try {
    unwrap(await supabase.from(T.esercizi).delete().eq('id', ex.value.id))
    await reload()
    toast.ok('Esercizio eliminato')
    router.replace('/esercizi')
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
  <div v-else-if="!ex" class="card empty">Esercizio non trovato. <RouterLink to="/esercizi">Torna agli esercizi</RouterLink></div>

  <div v-else class="stack" style="gap: 16px">
    <div class="row-between" style="align-items: flex-start">
      <div>
        <RouterLink to="/esercizi" class="small">← Esercizi</RouterLink>
        <h2 style="margin: 4px 0 6px; font-size: 1.4rem">{{ ex.nome }}</h2>
        <div class="row" style="gap: 6px">
          <CatDot :cat="ex.categoria" />
          <span class="badge">{{ UNITA.find((u) => u.value === ex.unita)?.label }}</span>
        </div>
        <p v-if="ex.note" class="muted small" style="margin: 8px 0 0">{{ ex.note }}</p>
      </div>
      <div class="row">
        <RouterLink :to="`/allenamenti?esercizio=${ex.id}`" class="btn btn-sm">Allenamenti</RouterLink>
        <button v-if="canWrite" class="btn btn-sm" @click="editing = !editing">{{ editing ? 'Chiudi' : 'Modifica' }}</button>
      </div>
    </div>

    <form v-if="editing && canWrite" class="card stack" @submit.prevent="saveEdit">
      <div class="edit-grid">
        <label class="field"><span>Nome</span><input v-model="edit.nome" class="input" required /></label>
        <label class="field">
          <span>Categoria</span>
          <input v-model="edit.categoria" class="input" list="cat-list" />
          <datalist id="cat-list"><option v-for="c in catOptions" :key="c" :value="c" /></datalist>
        </label>
        <label class="field">
          <span>Misura</span>
          <select v-model="edit.unita" class="select"><option v-for="u in UNITA" :key="u.value" :value="u.value">{{ u.label }}</option></select>
        </label>
      </div>
      <label class="field"><span>Note (tecnica, regolazioni macchina…)</span><textarea v-model="edit.note" class="textarea" style="min-height: 60px" /></label>
      <div class="row" style="justify-content: flex-end"><button class="btn btn-primary" :disabled="busy">Salva</button></div>

      <hr class="sep" />
      <div class="stack" style="gap: 6px">
        <span class="label">Unisci in un altro esercizio (per nomi doppi o varianti)</span>
        <div class="row" style="flex-wrap: nowrap">
          <select v-model="mergeInto" class="select" aria-label="Esercizio di destinazione">
            <option value="">Scegli…</option>
            <option v-for="o in others" :key="o.id" :value="o.id">{{ o.nome }}</option>
          </select>
          <button type="button" class="btn" :disabled="!mergeInto || busy" @click="merge">Unisci</button>
        </div>
      </div>
      <button v-if="!h.length" type="button" class="btn btn-danger" style="align-self: flex-start" @click="remove">Elimina esercizio</button>
    </form>

    <div v-if="!kpi" class="card empty">Ancora nessun allenamento con questo esercizio.</div>

    <template v-else>
      <div class="tiles">
        <StatTile label="Volte" :value="kpi.n" :hint="`ultima ${fmtAgo(kpi.lastDate)}`" />
        <StatTile
          :label="weighted ? 'Peso massimo' : unita === 'sec' ? 'Miglior tenuta' : unita === 'cardio' ? 'Migliore' : 'Max ripetizioni'"
          :value="`${fmtNum(kpi.best)} ${unitLabel}`" :hint="`${kpi.prs} record battuti`"
        />
        <StatTile label="Progresso" :value="fmtPct(kpi.delta)" :hint="`${fmtNum(kpi.first)} → ${fmtNum(kpi.last)} ${unitLabel}`" />
        <StatTile v-if="weighted" label="1RM stimato" :value="kpi.e1rm ? `${fmtNum(kpi.e1rm)} kg` : '—'" hint="formula di Epley" />
        <StatTile v-else-if="unita !== 'cardio'" :label="unita === 'sec' ? 'Tempo totale' : 'Ripetizioni totali'" :value="unita === 'sec' ? `${fmtNum(kpi.tot)} s` : fmtNum(kpi.tot)" />
        <StatTile v-if="weighted" label="Volume totale" :value="fmtKg(kpi.vol)" hint="serie × rip × kg" />
      </div>

      <section class="card">
        <h2>{{ weighted ? 'Crescita del carico' : 'Andamento' }}</h2>
        <p class="muted small sub">I punti più grandi sono record personali.</p>
        <ChartBox type="line" :data="progressChart" :options="progressOpts" :height="240" :label="`Andamento di ${ex.nome}`" />
      </section>

      <section v-if="kpi.n > 1" class="card">
        <h2>{{ volumeChart.datasets[0].label }} per allenamento</h2>
        <ChartBox :data="volumeChart" :options="volumeOpts" :height="180" :label="`${volumeChart.datasets[0].label} per allenamento`" />
      </section>

      <section class="card">
        <h2>Storico</h2>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Data</th><th>Lavoro</th><th v-if="weighted" class="num">Volume</th><th class="num">RPE</th></tr></thead>
            <tbody>
              <tr v-for="v in [...h].reverse()" :key="v.id">
                <td class="nowrap">{{ fmtShort(v.data) }}</td>
                <td>{{ fmtVoce(v) }} <span v-if="v.isPR" title="Record personale">🏆</span><div v-if="v.note" class="muted small">{{ v.note }}</div></td>
                <td v-if="weighted" class="num nowrap">{{ v.volume ? fmtKg(v.volume) : '—' }}</td>
                <td class="num">{{ v.rpe ? fmtNum(v.rpe) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.tiles { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 720px) { .tiles { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
.sub { margin: -4px 0 12px; }
.edit-grid { display: grid; gap: 10px; grid-template-columns: 1fr; }
@media (min-width: 640px) { .edit-grid { grid-template-columns: 2fr 1.4fr 1.4fr; } }
.sep { border: 0; border-top: 1px solid var(--border); margin: 4px 0; width: 100%; }
.nowrap { white-space: nowrap; }
.table td, .table th { padding: 8px 6px; }
</style>
