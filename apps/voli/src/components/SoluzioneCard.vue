<script setup>
// Una soluzione (andata + ritorno, o sola andata): orari, compagnie, prezzo, variazione dall'ultima ricerca, link per
// prenotare e, aprendo la scheda, lo storico del prezzo (somma delle tratte nel tempo).
import { computed, ref } from 'vue'
import { supabase, unwrap, toast, useSpace } from '@shared'
import ChartBox from './ChartBox.vue'
import { T } from '../db.js'
import { linkSoluzione } from '../lib/link.js'
import { fonteNome } from '../lib/fonti.js'
import { durata, giorno, nomeAeroporto, prezzo } from '../lib/formato.js'
import { seriesColor } from '../lib/theme.js'

const props = defineProps({
  s: { type: Object, required: true },
  adulti: { type: Number, default: 1 },
  voliById: { type: Map, default: () => new Map() },
})
const { spaceId } = useSpace()

/** Variazione rispetto alla ricerca precedente (somma delle tratte che hanno un prezzo precedente). */
const delta = computed(() => {
  let d = 0
  let any = false
  for (const id of props.s.voli) {
    const v = props.voliById.get(id)
    if (v?.prezzo_prec != null) { d += Number(v.prezzo) - Number(v.prezzo_prec); any = true }
  }
  return any && Math.abs(d) >= 0.01 ? Math.round(d * 100) / 100 : null
})
const minimo = computed(() => {
  // minimo mai visto per questa combinazione (se tutte le tratte hanno lo storico)
  const vs = props.s.voli.map((id) => props.voliById.get(id))
  return vs.length && vs.every(Boolean) ? vs.reduce((n, v) => n + Number(v.prezzo_min), 0) : null
})
const links = computed(() => linkSoluzione(props.s, props.adulti))
const fonti = computed(() => props.s.fonte.split('+').map(fonteNome).join(' + '))

const scali = (n) => (n == null ? '' : n === 0 ? 'diretto' : n === 1 ? '1 scalo' : `${n} scali`)

const open = ref(false)
const storico = ref(null)
async function toggle() {
  open.value = !open.value
  if (!open.value || storico.value || !props.s.voli.length) return
  try {
    const rows = unwrap(await supabase.from(T.prezzi).select('volo_id, rilevato_il, prezzo')
      .eq('space_id', spaceId.value).in('volo_id', props.s.voli).order('rilevato_il'))
    // Prezzo della soluzione nel tempo: a ogni rilevazione, somma dell'ultimo prezzo noto di ogni tratta.
    const last = new Map()
    const punti = []
    for (const r of rows) {
      last.set(r.volo_id, Number(r.prezzo))
      if (last.size === props.s.voli.length) {
        const tot = [...last.values()].reduce((a, b) => a + b, 0)
        const t = r.rilevato_il
        if (punti.length && punti.at(-1).t === t) punti.at(-1).p = tot
        else punti.push({ t, p: Math.round(tot * 100) / 100 })
      }
    }
    storico.value = punti
  } catch (e) {
    toast.error(e)
  }
}
const fmtT = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
const chart = computed(() => ({
  labels: (storico.value ?? []).map((x) => fmtT.format(new Date(x.t))),
  datasets: [{ label: 'Prezzo', data: (storico.value ?? []).map((x) => x.p), borderColor: seriesColor(0), backgroundColor: seriesColor(0), stepped: true }],
}))
</script>

<template>
  <article class="card sol" :class="{ pref: s.preferita }">
    <div class="top">
      <div class="legs">
        <div class="leg">
          <span class="dir" aria-label="Andata">→</span>
          <div>
            <div><strong>{{ giorno(s.data) }}</strong> · {{ s.andata.partenza || '?' }}<template v-if="s.andata.arrivo">–{{ s.andata.arrivo }}<sup v-if="s.andata.arrivo_giorni">+{{ s.andata.arrivo_giorni }}</sup></template></div>
            <div class="muted small">
              {{ s.origine }} → {{ s.destinazione }} · {{ s.andata.compagnia }}{{ s.andata.volo ? ` ${s.andata.volo}` : '' }}
              <template v-if="scali(s.andata.scali)"> · {{ scali(s.andata.scali) }}</template>
              <template v-if="s.andata.durata_min"> · {{ durata(s.andata.durata_min) }}</template>
            </div>
          </div>
        </div>
        <div v-if="s.ritorno" class="leg">
          <span class="dir" aria-label="Ritorno">←</span>
          <div>
            <div>
              <strong>{{ giorno(s.data_ritorno) }}</strong> ·
              <template v-if="s.ritorno.partenza">{{ s.ritorno.partenza }}<template v-if="s.ritorno.arrivo">–{{ s.ritorno.arrivo }}<sup v-if="s.ritorno.arrivo_giorni">+{{ s.ritorno.arrivo_giorni }}</sup></template></template>
              <span v-else class="muted">orario da scegliere</span>
              <span class="muted small"> · {{ s.durata }} {{ s.durata === 1 ? 'giorno' : 'giorni' }}</span>
            </div>
            <div class="muted small">
              {{ s.destinazione }} → {{ s.ritorno_a }}{{ s.ritorno.compagnia ? ` · ${s.ritorno.compagnia}` : '' }}{{ s.ritorno.volo ? ` ${s.ritorno.volo}` : '' }}
              <template v-if="scali(s.ritorno.scali)"> · {{ scali(s.ritorno.scali) }}</template>
            </div>
          </div>
        </div>
      </div>
      <div class="price">
        <strong>{{ prezzo(s.prezzo) }}</strong>
        <span v-if="adulti > 1" class="muted small">× {{ adulti }} = {{ prezzo(s.prezzo * adulti) }}</span>
        <span v-if="delta != null" class="small" :class="delta < 0 ? 'down' : 'up'">{{ delta < 0 ? '↓' : '↑' }} {{ prezzo(Math.abs(delta)) }}</span>
      </div>
    </div>
    <div class="row badges">
      <span class="badge">{{ fonti }}</span>
      <span v-if="s.preferita" class="badge badge-primary">★ preferita</span>
      <span v-if="s.ritorno_a && s.ritorno_a !== s.origine" class="badge" :title="nomeAeroporto(s.ritorno_a)">rientro a {{ s.ritorno_a }}</span>
      <span v-if="s.tipo === 'combinata' && s.andata.fonte !== s.ritorno.fonte" class="badge">biglietti separati</span>
      <span v-if="s.verificare" class="badge warn" title="Google dà il prezzo totale: l'orario del ritorno si sceglie sul sito">ritorno da verificare</span>
      <span v-if="minimo != null && minimo < s.prezzo - 0.01" class="badge" title="Il prezzo più basso visto per questa combinazione">minimo visto {{ prezzo(minimo) }}</span>
      <span class="spacer" />
      <a v-for="l in links" :key="l.url" :href="l.url" target="_blank" rel="noopener" class="btn btn-sm">{{ l.label }} ↗</a>
      <button v-if="s.voli.length" type="button" class="btn btn-sm btn-ghost" :aria-expanded="open" @click="toggle">Storico</button>
    </div>
    <div v-if="open" class="hist">
      <p v-if="!storico" class="muted small">Carico lo storico…</p>
      <p v-else-if="storico.length < 2" class="muted small">Ancora una sola rilevazione: lo storico si costruisce con le prossime ricerche.</p>
      <ChartBox v-else type="line" :data="chart" :height="180" :options="{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }" label="Storico del prezzo" />
    </div>
  </article>
</template>

<style scoped>
.sol { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.sol.pref { border-color: color-mix(in srgb, var(--primary) 45%, var(--border)); }
.top { display: flex; justify-content: space-between; gap: 10px; }
.legs { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.leg { display: flex; gap: 8px; align-items: flex-start; }
.dir { color: var(--muted); font-weight: 700; width: 14px; flex: none; }
.price { display: flex; flex-direction: column; align-items: flex-end; text-align: right; flex: none; }
.price strong { font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.down { color: var(--ok); font-weight: 600; }
.up { color: var(--danger); font-weight: 600; }
.badges { gap: 6px; }
.badge.warn { background: color-mix(in srgb, var(--warn) 16%, var(--surface)); color: var(--warn); }
.hist { border-top: 1px solid var(--border); padding-top: 8px; }
sup { font-size: .7em; color: var(--warn); }
</style>
