<script setup>
// Scheda di un prodotto seguito: offerte attive e in arrivo, storico dei prezzi con grafico per supermercato.
// Lo storico si legge solo qui: prima un filtro largo nel DB (radice della parola più lunga di ogni termine),
// poi lo stesso riconoscimento delle offerte.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { fmtEuro, supabase, toast, useSpace } from '@shared'
import ChartBox from '../components/ChartBox.vue'
import OfferCard from '../components/OfferCard.vue'
import { T } from '../db.js'
import { fetchAll, openProdotto, useData } from '../store.js'
import { addDays, fmtShort, today } from '../lib/dates.js'
import { UNITA, buonPrezzo, compile, matches, prezzoConfronto, stem, tokens } from '../lib/match.js'
import { seriesColor } from '../lib/theme.js'
import { fmtUnit } from '../lib/util.js'

const route = useRoute()
const { spaceId, canWrite } = useSpace()
const { state, smById, offerteByProdotto, load } = useData()
onMounted(load)

const p = computed(() => state.prodotti.find((x) => x.id === route.params.id) ?? null)
const offerte = computed(() => (p.value ? offerteByProdotto.value.get(p.value.id) ?? [] : []))
const per = computed(() => p.value?.prezzo_per ?? 'pz')
const fmtPer = (v) => (per.value === 'pz' ? fmtEuro(v) : fmtUnit(v, per.value))

/* ---------- storico ---------- */

const storico = ref([])
const loadingStorico = ref(false)
async function loadStorico() {
  if (!p.value) return
  const c = compile(p.value)
  const roots = [...new Set(c.terms.map((term) => stem(term.reduce((a, b) => (b.length > a.length ? b : a)))))].filter((s) => s.length >= 2)
  if (!roots.length) { storico.value = []; return }
  loadingStorico.value = true
  try {
    const rows = await fetchAll(() => supabase.from(T.storico)
      .select('id, supermercato_id, nome, prezzo, prezzo_pieno, prezzo_unitario, unita, valido_da, valido_fino')
      .eq('space_id', spaceId.value)
      .or(roots.map((r) => `chiave.ilike.*${r}*`).join(','))
      .order('valido_da', { ascending: false })
      .order('id'))
    storico.value = rows.filter((r) => matches(tokens(r.nome), c))
  } catch (e) {
    toast.error(e)
  } finally {
    loadingStorico.value = false
  }
}
watch(() => p.value && JSON.stringify([p.value.nome, p.value.parole, p.value.escludi, p.value.marca]), loadStorico, { immediate: true })

/** Rilevazioni con un prezzo confrontabile (al pezzo, o al kg/litro se il prodotto si confronta così). */
const punti = computed(() => storico.value
  .map((r) => ({ ...r, v: prezzoConfronto(r, per.value) }))
  .filter((r) => r.v != null))
const stats = computed(() => {
  const list = punti.value
  if (!list.length) return null
  const min = list.reduce((a, b) => (b.v < a.v ? b : a))
  const anno = list.filter((r) => r.valido_da >= addDays(today(), -365))
  const media = anno.length ? anno.reduce((s, r) => s + r.v, 0) / anno.length : null
  return { min, media, n: list.length }
})
const bestNow = computed(() => offerte.value.find((o) => o.valido_da <= today()) ?? null)
const bestNowV = computed(() => (bestNow.value ? prezzoConfronto(bestNow.value, per.value) : null))
const isMin = computed(() => bestNowV.value != null && stats.value && bestNowV.value <= stats.value.min.v)

/** Grafico: una linea per supermercato, il prezzo più basso di ogni inizio validità (ultimi 12 mesi). */
const chart = computed(() => {
  const from = addDays(today(), -365)
  const list = punti.value.filter((r) => r.valido_da >= from)
  const labels = [...new Set(list.map((r) => r.valido_da))].sort()
  if (labels.length < 2) return null
  const sms = [...new Set(list.map((r) => r.supermercato_id))]
  return {
    labels: labels.map(fmtShort),
    datasets: sms.map((sid, i) => {
      const byDate = new Map()
      for (const r of list) if (r.supermercato_id === sid) byDate.set(r.valido_da, Math.min(byDate.get(r.valido_da) ?? Infinity, r.v))
      const color = seriesColor(i)
      return {
        label: smById.value.get(sid)?.nome ?? '—',
        data: labels.map((d) => byDate.get(d) ?? null),
        borderColor: color, backgroundColor: color, pointBackgroundColor: color, spanGaps: true,
      }
    }),
  }
})
const chartOptions = computed(() => ({
  scales: { y: { beginAtZero: false, ticks: { callback: (v) => fmtEuro(v) } } },
  plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtPer(ctx.parsed.y)}` } } },
}))
const showAll = ref(false)
const tabella = computed(() => (showAll.value ? storico.value : storico.value.slice(0, 15)))
</script>

<template>
  <div class="stack" style="gap: 16px">
    <RouterLink to="/prodotti" class="small">← I miei prodotti</RouterLink>

    <div v-if="!state.loaded" class="center"><div v-if="state.loading" class="spinner" /></div>
    <div v-else-if="!p" class="card empty">Prodotto non trovato. <RouterLink to="/prodotti">Torna alla lista</RouterLink></div>

    <template v-else>
      <header class="head">
        <div class="titles">
          <h2>{{ p.nome }} <span v-if="!p.attivo" class="badge">in pausa</span></h2>
          <p class="muted small">
            <template v-if="p.parole.length">Anche: {{ p.parole.join(', ') }}. </template>
            <template v-if="p.marca">Solo {{ p.marca }}. </template>
            <template v-if="p.escludi.length">Escludi: {{ p.escludi.join(', ') }}. </template>
            <template v-if="p.prezzo_max != null">Buon prezzo fino a {{ fmtUnit(p.prezzo_max, p.prezzo_per) }}.</template>
          </p>
          <p v-if="p.note" class="small" style="margin: 4px 0 0">{{ p.note }}</p>
        </div>
        <button v-if="canWrite" type="button" class="btn btn-sm" @click="openProdotto({ prodotto: p })">Modifica</button>
      </header>

      <div class="tiles">
        <div class="tile card">
          <span class="label">Migliore ora</span>
          <strong>{{ bestNow ? fmtPer(bestNowV ?? bestNow.prezzo) : '—' }}</strong>
          <span class="muted small">{{ bestNow ? smById.get(bestNow.supermercato_id)?.nome : 'nessuna offerta oggi' }}</span>
          <span v-if="isMin" class="badge good">minimo visto</span>
          <span v-else-if="bestNow && buonPrezzo(bestNow, p)" class="badge good">buon prezzo</span>
        </div>
        <div class="tile card">
          <span class="label">Minimo visto</span>
          <strong>{{ stats ? fmtPer(stats.min.v) : '—' }}</strong>
          <span class="muted small">{{ stats ? `${smById.get(stats.min.supermercato_id)?.nome ?? '—'}, ${fmtShort(stats.min.valido_da)}` : 'ancora nessun dato' }}</span>
        </div>
        <div class="tile card">
          <span class="label">Media 12 mesi</span>
          <strong>{{ stats?.media != null ? fmtPer(stats.media) : '—' }}</strong>
          <span class="muted small">{{ stats ? `${stats.n} rilevazioni` : '' }}</span>
        </div>
      </div>
      <p v-if="per !== 'pz'" class="muted small" style="margin: -8px 0 0">
        Prezzi al {{ UNITA[per] }}: contano solo le offerte che indicano il prezzo al {{ UNITA[per] }}.
      </p>

      <section class="card list">
        <h3>Offerte attive e in arrivo <span class="muted small">{{ offerte.length }}</span></h3>
        <OfferCard v-for="o in offerte" :key="o.id" :offerta="o" />
        <p v-if="!offerte.length" class="muted small" style="margin: 4px 0 0">
          Nessuna offerta al momento{{ p.attivo ? ': la prossima ricerca lo cercherà in tutti i supermercati attivi.' : '.' }}
        </p>
      </section>

      <section class="card stack">
        <h3 style="margin: 0">Storico prezzi</h3>
        <div v-if="loadingStorico" class="center"><div class="spinner" /></div>
        <template v-else>
          <ChartBox v-if="chart" type="line" :data="chart" :options="chartOptions" :height="220" :label="`Andamento del prezzo di ${p.nome}`" />
          <div v-if="storico.length" class="table-wrap">
            <table class="table small">
              <thead><tr><th>Quando e dove</th><th>Prodotto</th><th class="num">Prezzo</th></tr></thead>
              <tbody>
                <tr v-for="r in tabella" :key="r.id">
                  <td class="nowrap">
                    {{ fmtShort(r.valido_da) }} – {{ fmtShort(r.valido_fino) }}
                    <div class="muted">{{ smById.get(r.supermercato_id)?.nome ?? '—' }}</div>
                  </td>
                  <td>{{ r.nome }}</td>
                  <td class="num nowrap">
                    {{ fmtEuro(r.prezzo) }}
                    <div v-if="r.prezzo_unitario && r.unita" class="muted">{{ fmtUnit(r.prezzo_unitario, r.unita) }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button v-if="storico.length > tabella.length" type="button" class="btn btn-ghost btn-sm" style="align-self: center" @click="showAll = true">
            Mostra tutte ({{ storico.length }})
          </button>
          <p v-if="!storico.length" class="muted small" style="margin: 0">
            Ancora nessun prezzo registrato: lo storico si riempie da solo con le offerte trovate.
          </p>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.center { display: flex; justify-content: center; padding: 24px 0; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.titles { min-width: 0; }
.titles h2 { margin: 0 0 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.titles p { margin: 0; }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
@media (max-width: 560px) { .tiles { grid-template-columns: 1fr 1fr; } .tiles > :first-child { grid-column: 1 / -1; } }
.tile { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 12px 14px; min-width: 0; }
.tile strong { font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.tile .label { font-size: .8rem; color: var(--muted); font-weight: 500; }
.good { background: color-mix(in srgb, var(--ok) 16%, var(--surface)); color: var(--ok); font-weight: 600; }
.list { display: flex; flex-direction: column; padding-top: 12px; }
.list h3 { margin: 0 0 2px; display: flex; align-items: baseline; gap: 8px; }
.nowrap { white-space: nowrap; }
.table td { vertical-align: top; }
.table th, .table td { padding: 8px 6px; }
.table th:first-child, .table td:first-child { padding-left: 0; }
.table th:last-child, .table td:last-child { padding-right: 0; }
</style>
