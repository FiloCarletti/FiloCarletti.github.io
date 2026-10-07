<script setup>
// Un monitoraggio: riepilogo (miglior prezzo, minimo storico, obiettivo), filtri e quattro schede:
// Voli (soluzioni dalla più economica), Calendario (data × durata), Andamento (prezzo nel tempo, avvisi, ora migliore
// per cercare) e Statistiche. Da qui si condivide il monitoraggio (spazio condiviso dedicato).
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { fmtDateTime, toast, useSpace } from '@shared'
import AndamentoRicerca from '../components/AndamentoRicerca.vue'
import CercaOra from '../components/CercaOra.vue'
import GrigliaPrezzi from '../components/GrigliaPrezzi.vue'
import Modal from '../components/Modal.vue'
import SoluzioneCard from '../components/SoluzioneCard.vue'
import StatisticheRicerca from '../components/StatisticheRicerca.vue'
import { condividiRicerca, saveRicerca, soluzioni, useData, vaiASpazio } from '../store.js'
import { addDays, compagnieDi, isoDow, romeToday, stessaCompagnia } from '../lib/combina.js'
import { fonteNome } from '../lib/fonti.js'
import { criteriBreve, fasciaBreve, giorno, nomeAeroporto, prezzo } from '../lib/formato.js'

const route = useRoute()
const router = useRouter()
const { state, spazio, load, loadVoli } = useData()
const { canWrite } = useSpace()
onMounted(async () => { await load(); loadVoli() })

const r = computed(() => state.ricerche.find((x) => x.id === route.params.id) ?? null)

const TABS = [
  { v: 'voli', l: 'Voli' },
  { v: 'calendario', l: 'Calendario' },
  { v: 'andamento', l: 'Andamento' },
  { v: 'statistiche', l: 'Statistiche' },
]
const tab = computed({
  get: () => (TABS.some((t) => t.v === route.query.tab) ? route.query.tab : 'voli'),
  set: (v) => router.replace({ query: { ...route.query, tab: v === 'voli' ? undefined : v } }),
})

/* ---------- soluzioni e filtri ---------- */

const opz = reactive({ rientroAltro: false, miste: false })
watch(r, (x) => { if (x) { opz.rientroAltro = x.rientro_altro; opz.miste = x.compagnie_miste } }, { immediate: true })
// Con una fascia oraria per il ritorno, le soluzioni senza orario del ritorno (Google) si nascondono di default:
// così l'elenco parte dalle stesse soluzioni del "migliore" e degli avvisi.
const conFasciaRitorno = (x) => !!(x?.ritorno_dopo || x?.ritorno_prima)
const tutte = computed(() => (r.value && state.voliLoaded ? soluzioni(r.value, { rientroAltro: opz.rientroAltro, miste: opz.miste }) : []))

const f = reactive({ origini: [], destinazioni: [], compagnia: '', fonte: '', diretti: false, max: null, data: '', durata: '', verificare: true, ordine: 'prezzo' })
watch(() => r.value?.id, () => { f.verificare = !conFasciaRitorno(r.value) }, { immediate: true })
const filtriAttivi = computed(() => f.origini.length || f.destinazioni.length || f.compagnia || f.fonte || f.diretti || f.max || f.data || f.durata !== '' || f.verificare === conFasciaRitorno(r.value))
function azzera() {
  Object.assign(f, { origini: [], destinazioni: [], compagnia: '', fonte: '', diretti: false, max: null, data: '', durata: '', verificare: !conFasciaRitorno(r.value) })
}
const toggle = (list, v) => { const i = list.indexOf(v); if (i > -1) list.splice(i, 1); else list.push(v) }

const filtrate = computed(() => {
  const out = tutte.value.filter((s) =>
    (!f.origini.length || f.origini.includes(s.origine))
    && (!f.destinazioni.length || f.destinazioni.includes(s.destinazione))
    && (!f.compagnia || [s.andata.compagnia, s.ritorno?.compagnia].some((c) => compagnieDi(c).some((x) => stessaCompagnia(x, f.compagnia))))
    && (!f.fonte || s.fonte.split('+').includes(f.fonte))
    && (!f.diretti || ((s.andata.scali ?? 0) === 0 && (s.ritorno?.scali ?? 0) === 0))
    && (!f.max || s.prezzo <= f.max)
    && (!f.data || s.data === f.data)
    && (f.durata === '' || s.durata === Number(f.durata))
    && (f.verificare || !s.verificare))
  if (f.ordine === 'data') out.sort((a, b) => a.data.localeCompare(b.data) || (a.data_ritorno ?? '').localeCompare(b.data_ritorno ?? '') || a.prezzo - b.prezzo)
  if (f.ordine === 'partenza') out.sort((a, b) => (a.andata.partenza || '99').localeCompare(b.andata.partenza || '99') || a.prezzo - b.prezzo)
  return out
})
const compagnie = computed(() => {
  const set = new Set()
  for (const s of tutte.value) for (const c of [...compagnieDi(s.andata.compagnia), ...compagnieDi(s.ritorno?.compagnia)]) set.add(c)
  return [...set].sort((a, b) => a.localeCompare(b, 'it'))
})
const fonti = computed(() => [...new Set(tutte.value.flatMap((s) => s.fonte.split('+')))])
const migliore = computed(() => tutte.value.find((s) => !s.verificare) ?? null)
const voliById = computed(() => new Map(state.voli.map((v) => [v.id, v])))

const mostrati = ref(30)
watch(filtrate, () => { mostrati.value = 30 })

/* ---------- calendario ---------- */

const oggi = romeToday()
const dateCal = computed(() => {
  const x = r.value
  if (!x) return []
  const out = []
  for (let d = x.partenza_da < oggi ? oggi : x.partenza_da; d <= x.partenza_a; d = addDays(d, 1)) {
    if (!x.giorni_andata?.length || x.giorni_andata.includes(isoDow(d))) out.push(d)
  }
  return out
})
const durateCal = computed(() => {
  const x = r.value
  if (!x || x.solo_andata) return [null]
  return Array.from({ length: x.durata_max - x.durata_min + 1 }, (_, i) => x.durata_min + i)
})
const filtrateCal = computed(() => tutte.value.filter((s) =>
  (!f.origini.length || f.origini.includes(s.origine)) && (!f.destinazioni.length || f.destinazioni.includes(s.destinazione))
  && (!f.compagnia || [s.andata.compagnia, s.ritorno?.compagnia].some((c) => compagnieDi(c).some((x) => stessaCompagnia(x, f.compagnia))))
  && (!f.fonte || s.fonte.split('+').includes(f.fonte)) && (!f.diretti || ((s.andata.scali ?? 0) === 0 && (s.ritorno?.scali ?? 0) === 0))
  && (f.verificare || !s.verificare)))
function scegliCella({ data, durata }) {
  f.data = data
  f.durata = durata == null ? '' : String(durata)
  tab.value = 'voli'
}

/* ---------- azioni ---------- */

async function pausa() {
  try {
    await saveRicerca({ attiva: !r.value.attiva }, r.value.id)
    toast.ok(r.value.attiva ? 'Monitoraggio riattivato' : 'Monitoraggio in pausa: la routine lo salta')
  } catch (e) { toast.error(e) }
}
const condividi = ref(false)
const condividendo = ref(false)
async function confermaCondividi() {
  condividendo.value = true
  try {
    const id = await condividiRicerca(r.value)
    toast.ok('Spazio creato: aggiungi le persone con il pulsante Condividi in alto')
    vaiASpazio(id, `/ricerca/${r.value.id}`)
  } catch (e) {
    toast.error(e)
    condividendo.value = false
  }
}
</script>

<template>
  <div v-if="!state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
  <div v-else-if="!r" class="card empty">
    Monitoraggio non trovato. <RouterLink to="/">Torna all'elenco</RouterLink>
  </div>
  <div v-else class="stack" style="gap: 14px">
    <section class="card stack head">
      <div class="row-between" style="align-items: flex-start">
        <div style="min-width: 0">
          <RouterLink to="/" class="muted small back">← Monitoraggi</RouterLink>
          <h2 style="margin: 2px 0 0">{{ r.nome }} <span v-if="!r.attiva" class="badge">in pausa</span></h2>
          <p class="muted small" style="margin: 2px 0 0">{{ criteriBreve(r) }}</p>
          <p v-if="fasciaBreve(r.giorni_andata, r.andata_dopo, r.andata_prima) || fasciaBreve(r.giorni_ritorno, r.ritorno_dopo, r.ritorno_prima)" class="muted small" style="margin: 0">
            Andata {{ fasciaBreve(r.giorni_andata, r.andata_dopo, r.andata_prima) || 'qualsiasi' }} · ritorno {{ fasciaBreve(r.giorni_ritorno, r.ritorno_dopo, r.ritorno_prima) || 'qualsiasi' }}
          </p>
          <p v-if="r.compagnie.length || r.compagnie_escluse.length || r.max_scali != null" class="muted small" style="margin: 0">
            <template v-if="r.compagnie.length">{{ r.solo_compagnie ? 'Solo' : 'Preferite' }}: {{ r.compagnie.join(', ') }}. </template>
            <template v-if="r.compagnie_escluse.length">Escluse: {{ r.compagnie_escluse.join(', ') }}. </template>
            <template v-if="r.max_scali != null">{{ r.max_scali === 0 ? 'Solo voli diretti.' : `Al massimo ${r.max_scali} scal${r.max_scali === 1 ? 'o' : 'i'}.` }}</template>
          </p>
        </div>
      </div>
      <div class="kpis">
        <div><span class="muted small">Migliore ora</span><strong class="big">{{ migliore ? prezzo(migliore.prezzo) : '—' }}</strong>
          <span v-if="migliore" class="muted small">{{ migliore.origine }}→{{ migliore.destinazione }} {{ giorno(migliore.data) }}</span></div>
        <div><span class="muted small">Minimo storico</span><strong>{{ prezzo(r.minimo_storico) }}</strong>
          <span v-if="r.minimo_il" class="muted small">{{ fmtDateTime(r.minimo_il) }}</span></div>
        <div><span class="muted small">Obiettivo</span><strong>{{ r.prezzo_obiettivo != null ? prezzo(r.prezzo_obiettivo) : 'nessuno' }}</strong>
          <span v-if="r.adulti > 1" class="muted small">{{ r.adulti }} adulti</span></div>
      </div>
      <p class="muted small" style="margin: 0">
        {{ r.migliore_il ? `Ultima ricerca ${fmtDateTime(r.migliore_il)}.` : 'Nessuna ricerca ancora.' }}
        Prezzi a persona, senza bagagli in stiva.
      </p>
      <div class="row">
        <CercaOra v-if="canWrite" :ricerca="r" small />
        <RouterLink v-if="canWrite" :to="`/ricerca/${r.id}/modifica`" class="btn btn-sm">Modifica</RouterLink>
        <button v-if="canWrite" type="button" class="btn btn-sm" @click="pausa">{{ r.attiva ? 'Metti in pausa' : 'Riattiva' }}</button>
        <button v-if="canWrite && spazio?.kind === 'personal'" type="button" class="btn btn-sm" @click="condividi = true">Condividi…</button>
      </div>
    </section>

    <div class="seg" role="tablist">
      <button v-for="t in TABS" :key="t.v" type="button" role="tab" :aria-selected="tab === t.v" :class="{ on: tab === t.v }" @click="tab = t.v">{{ t.l }}</button>
    </div>

    <div v-if="!state.voliLoaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="!tutte.length && tab !== 'andamento'" class="card empty">
      <p>Nessun volo trovato per ora.</p>
      <p class="small">I prezzi arrivano con la prossima ricerca della routine di Claude, oppure con “Cerca ora”.
        Se la routine è già passata, prova ad allargare periodo, durata o orari.</p>
    </div>

    <template v-else-if="tab !== 'andamento'">
      <details class="card filters" :open="filtriAttivi || undefined">
        <summary class="row-between">
          <strong>Filtri</strong>
          <span class="muted small">{{ filtrate.length }} di {{ tutte.length }} soluzioni</span>
        </summary>
        <div class="stack" style="margin-top: 10px">
          <div class="chips">
            <span class="label">Da</span>
            <button v-for="o in r.origini" :key="o" type="button" class="chip" :class="{ on: f.origini.includes(o) }" :title="nomeAeroporto(o)" @click="toggle(f.origini, o)">{{ o }}</button>
            <span class="label" style="margin-left: 8px">A</span>
            <button v-for="d in r.destinazioni" :key="d" type="button" class="chip" :class="{ on: f.destinazioni.includes(d) }" :title="nomeAeroporto(d)" @click="toggle(f.destinazioni, d)">{{ d }}</button>
          </div>
          <div class="fgrid">
            <label class="field"><span>Compagnia</span>
              <select v-model="f.compagnia" class="select input"><option value="">Tutte</option><option v-for="c in compagnie" :key="c" :value="c">{{ c }}</option></select>
            </label>
            <label class="field"><span>Fonte</span>
              <select v-model="f.fonte" class="select input"><option value="">Tutte</option><option v-for="c in fonti" :key="c" :value="c">{{ fonteNome(c) }}</option></select>
            </label>
            <label class="field"><span>Prezzo max (€)</span><input v-model.number="f.max" type="number" min="0" step="5" class="input" inputmode="numeric" /></label>
            <label class="field"><span>Andata il</span><input v-model="f.data" type="date" class="input" :min="r.partenza_da" :max="r.partenza_a" /></label>
            <label v-if="!r.solo_andata" class="field"><span>Durata</span>
              <select v-model="f.durata" class="select input"><option value="">Tutte</option><option v-for="d in durateCal" :key="d" :value="String(d)">{{ d }} giorni</option></select>
            </label>
            <label class="field"><span>Ordina per</span>
              <select v-model="f.ordine" class="select input"><option value="prezzo">Prezzo</option><option value="data">Data</option><option value="partenza">Orario di partenza</option></select>
            </label>
          </div>
          <div class="row checks">
            <label><input v-model="f.diretti" type="checkbox" /> Solo diretti</label>
            <label v-if="!r.solo_andata"><input v-model="opz.rientroAltro" type="checkbox" /> Rientro su un altro aeroporto</label>
            <label v-if="!r.solo_andata"><input v-model="opz.miste" type="checkbox" /> Compagnie diverse</label>
            <label v-if="!r.solo_andata"><input v-model="f.verificare" type="checkbox" /> Anche con ritorno da verificare</label>
            <button v-if="filtriAttivi" type="button" class="btn btn-sm btn-ghost" @click="azzera">Azzera filtri</button>
          </div>
        </div>
      </details>

      <div v-if="tab === 'voli'" class="stack">
        <div v-if="!filtrate.length" class="card empty">Nessuna soluzione con questi filtri.</div>
        <SoluzioneCard v-for="s in filtrate.slice(0, mostrati)" :key="s.key" :s="s" :adulti="r.adulti" :voli-by-id="voliById" />
        <button v-if="filtrate.length > mostrati" type="button" class="btn" style="align-self: center" @click="mostrati += 30">
          Mostra altre ({{ filtrate.length - mostrati }})
        </button>
      </div>
      <GrigliaPrezzi v-else-if="tab === 'calendario'" :soluzioni="filtrateCal" :date="dateCal" :durate="durateCal" @select="scegliCella" />
      <StatisticheRicerca v-else :soluzioni="filtrate" :solo-andata="r.solo_andata" />
    </template>

    <AndamentoRicerca v-if="tab === 'andamento'" :ricerca="r" />

    <Modal v-if="condividi" title="Condividi il monitoraggio" @close="condividi = false">
      <p style="margin: 0">
        Creo uno spazio condiviso <strong>«{{ r.nome }}»</strong> e ci sposto questo monitoraggio con i suoi prezzi, l'andamento e gli avvisi.
        Poi, dal pulsante <strong>Condividi</strong> in alto, scegli con chi: in sola lettura o anche in modifica.
      </p>
      <p class="muted small" style="margin: 0">Gli altri tuoi monitoraggi restano privati. Lo trovi sempre nella pagina Monitoraggi, sotto “Altri spazi”.</p>
      <template #foot>
        <button type="button" class="btn btn-primary" :disabled="condividendo" @click="confermaCondividi">{{ condividendo ? 'Creo lo spazio…' : 'Crea spazio condiviso' }}</button>
        <button type="button" class="btn btn-ghost" @click="condividi = false">Annulla</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.back { text-decoration: none; }
.kpis { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 10px; }
.kpis > div { display: flex; flex-direction: column; min-width: 0; }
.big { font-size: 1.45rem; font-variant-numeric: tabular-nums; }
@media (max-width: 420px) { .kpis .muted.small { font-size: .78rem; } }
.seg { display: flex; padding: 3px; gap: 3px; background: var(--surface-2); border-radius: var(--radius); }
.seg button { flex: 1; padding: 8px 4px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-weight: 600; font-size: .9rem; cursor: pointer; }
.seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.filters { padding: 12px 14px; }
.filters summary { cursor: pointer; list-style: none; }
.filters summary::-webkit-details-marker { display: none; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.chip { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-size: .86rem; font-weight: 600; cursor: pointer; }
.chip.on { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
.fgrid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.checks { gap: 14px; font-size: .9rem; }
.checks label { display: inline-flex; align-items: center; gap: 6px; }
</style>
