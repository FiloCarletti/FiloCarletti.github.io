<script setup>
// Andamento del miglior prezzo di un monitoraggio (una riga per ricerca della routine), avvisi e "quando cercare":
// a quale ora della ricerca i prezzi sono stati più bassi, per decidere gli orari della routine.
import { computed, onMounted, ref } from 'vue'
import { supabase, unwrap, toast, useSpace } from '@shared'
import ChartBox from './ChartBox.vue'
import { T } from '../db.js'
import { prezzo, giorno } from '../lib/formato.js'
import { seriesColor, cssVar } from '../lib/theme.js'
import { fetchAll } from '../store.js'

const props = defineProps({ ricerca: { type: Object, required: true } })
const { spaceId } = useSpace()
const rows = ref([])
const avvisi = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [a, b] = await Promise.all([
      fetchAll(() => supabase.from(T.andamento).select('rilevato_il, prezzo, soluzione')
        .eq('space_id', spaceId.value).eq('ricerca_id', props.ricerca.id).order('rilevato_il')),
      supabase.from(T.avvisi).select('*').eq('space_id', spaceId.value).eq('ricerca_id', props.ricerca.id)
        .order('created_at', { ascending: false }).limit(10),
    ])
    rows.value = a
    avvisi.value = unwrap(b)
  } catch (e) {
    toast.error(e)
  } finally {
    loading.value = false
  }
})

const fmtT = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
const chart = computed(() => {
  const labels = rows.value.map((r) => fmtT.format(new Date(r.rilevato_il)))
  const ds = [{ label: 'Miglior prezzo', data: rows.value.map((r) => Number(r.prezzo)), borderColor: seriesColor(0), backgroundColor: seriesColor(0) }]
  const line = (label, v, color) => ({ label, data: labels.map(() => v), borderColor: color, borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 })
  if (props.ricerca.prezzo_obiettivo != null) ds.push(line('Obiettivo', Number(props.ricerca.prezzo_obiettivo), cssVar('--ok')))
  if (props.ricerca.minimo_storico != null) ds.push(line('Minimo storico', Number(props.ricerca.minimo_storico), cssVar('--muted')))
  return { labels, datasets: ds }
})

/**
 * Quando cercare: per ogni giorno con più ricerche, quanto ogni ricerca era sopra il minimo di quel giorno.
 * Per ora (Europe/Rome): numero di ricerche, scarto medio dal minimo del giorno, volte in cui ha trovato il minimo.
 */
const oraRome = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', hour12: false, timeZone: 'Europe/Rome' })
const dataRome = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' })
const orari = computed(() => {
  const perGiorno = new Map()
  for (const r of rows.value) {
    const d = dataRome.format(new Date(r.rilevato_il))
    if (!perGiorno.has(d)) perGiorno.set(d, [])
    perGiorno.get(d).push(r)
  }
  const perOra = new Map()
  let giorni = 0
  for (const list of perGiorno.values()) {
    if (list.length < 2) continue
    giorni++
    const min = Math.min(...list.map((r) => Number(r.prezzo)))
    for (const r of list) {
      const h = Number(oraRome.format(new Date(r.rilevato_il)))
      const x = perOra.get(h) ?? { ora: h, n: 0, scarto: 0, minimi: 0 }
      x.n++
      x.scarto += Number(r.prezzo) - min
      if (Number(r.prezzo) <= min + 0.005) x.minimi++
      perOra.set(h, x)
    }
  }
  const out = [...perOra.values()].map((x) => ({ ...x, scarto: x.scarto / x.n })).sort((a, b) => a.ora - b.ora)
  return { giorni, out }
})
const migliorOra = computed(() => [...orari.value.out].sort((a, b) => a.scarto - b.scarto || b.minimi - a.minimi)[0])
const TIPI = { obiettivo: 'Obiettivo raggiunto', minimo: 'Nuovo minimo storico', calo: 'Calo forte' }
</script>

<template>
  <div v-if="loading" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
  <div v-else class="stack">
    <section class="card stack">
      <h3 style="margin: 0">Miglior prezzo nel tempo</h3>
      <p v-if="rows.length < 2" class="muted small" style="margin: 0">
        {{ rows.length ? 'Una sola ricerca finora' : 'Nessuna ricerca ancora' }}: il grafico si riempie a ogni esecuzione della routine.
      </p>
      <ChartBox v-else type="line" :data="chart" :height="240" :options="{ scales: { y: { beginAtZero: false } } }" label="Andamento del miglior prezzo" />
    </section>

    <section class="card stack">
      <h3 style="margin: 0">Quando cercare</h3>
      <p v-if="orari.giorni < 2 || orari.out.length < 2" class="muted small" style="margin: 0">
        Servono almeno due giorni con ricerche a orari diversi. Per capire quale ora conviene, pianifica la routine per qualche
        giorno a più orari (es. 7, 13, 19, 23): qui vedrai a che ora il prezzo è stato più spesso il più basso della giornata.
      </p>
      <template v-else>
        <p class="small" style="margin: 0">
          Su {{ orari.giorni }} giorni con più ricerche, l'ora migliore è finora le <strong>{{ String(migliorOra.ora).padStart(2, '0') }}</strong>
          (in media {{ prezzo(migliorOra.scarto) }} sopra il minimo del giorno).
        </p>
        <div class="table-wrap">
          <table class="table small">
            <thead><tr><th>Ora</th><th class="num">Ricerche</th><th class="num">Sopra il minimo (media)</th><th class="num">Ha trovato il minimo</th></tr></thead>
            <tbody>
              <tr v-for="x in orari.out" :key="x.ora">
                <td>{{ String(x.ora).padStart(2, '0') }}:00</td>
                <td class="num">{{ x.n }}</td>
                <td class="num">{{ prezzo(x.scarto) }}</td>
                <td class="num">{{ x.minimi }} / {{ x.n }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>

    <section class="card stack">
      <h3 style="margin: 0">Avvisi</h3>
      <p v-if="!avvisi.length" class="muted small" style="margin: 0">Nessun avviso per questo monitoraggio.</p>
      <ul v-else class="list">
        <li v-for="a in avvisi" :key="a.id">
          <strong>{{ TIPI[a.tipo] }}</strong>: {{ prezzo(a.prezzo) }}
          <span class="muted small">
            <template v-if="a.riferimento != null"> (prima {{ prezzo(a.riferimento) }})</template>
            · {{ fmtT.format(new Date(a.created_at)) }}
            <template v-if="a.soluzione?.data"> · {{ a.soluzione.origine }}→{{ a.soluzione.destinazione }} {{ giorno(a.soluzione.data) }}<template v-if="a.soluzione.data_ritorno"> – {{ giorno(a.soluzione.data_ritorno) }}</template></template>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
</style>
