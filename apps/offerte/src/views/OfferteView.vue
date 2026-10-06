<script setup>
// Cosa è in offerta oggi, domani, nei prossimi giorni: prima le offerte dei prodotti seguiti, poi le altre.
// Le offerte trovate nelle ricerche dei giorni scorsi restano valide fino alla loro data di fine.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useSpace } from '@shared'
import OfferCard from '../components/OfferCard.vue'
import { openOfferta, pref, savePref, useData } from '../store.js'
import { PERIODI, inPeriodo, today } from '../lib/dates.js'
import { normalize, offerText, tokens } from '../lib/match.js'

const { state, supermercati, prodottiByOffer, categorie, load } = useData()
const { canWrite } = useSpace()
onMounted(load)

const SORTS = [
  { key: 'sconto', label: 'Sconto più alto' },
  { key: 'prezzo', label: 'Prezzo più basso' },
  { key: 'unitario', label: 'Prezzo al kg/l' },
  { key: 'scadenza', label: 'In scadenza' },
  { key: 'nome', label: 'Nome' },
]
const savedPeriodo = pref('periodo', 'oggi')
const periodo = ref(PERIODI.some((p) => p.key === savedPeriodo) ? savedPeriodo : 'oggi')
const savedSort = pref('sort', 'sconto')
const sort = ref(SORTS.some((s) => s.key === savedSort) ? savedSort : 'sconto')
const soloMiei = ref(pref('solo-miei', '0') === '1')
const q = ref('')
const sm = ref('')
const cat = ref('')
const limit = ref(60)
watch(periodo, (v) => savePref('periodo', v))
watch(sort, (v) => savePref('sort', v))
watch(soloMiei, (v) => savePref('solo-miei', v ? '1' : '0'))
watch([periodo, sort, soloMiei, q, sm, cat], () => { limit.value = 60 })

const t = today()
const searchText = computed(() => new Map(state.offerte.map((o) => [o.id, normalize(`${offerText(o)} ${o.categoria}`)])))
/** Offerte che passano i filtri (tranne il periodo). */
const base = computed(() => {
  const words = tokens(q.value)
  return state.offerte.filter((o) =>
    (!sm.value || o.supermercato_id === sm.value)
    && (!cat.value || o.categoria === cat.value)
    && (!words.length || words.every((w) => searchText.value.get(o.id).includes(w))))
})
const counts = computed(() => Object.fromEntries(PERIODI.map((p) => [p.key, base.value.filter((o) => inPeriodo(o, p.key, t)).length])))

const sorters = {
  sconto: (a, b) => (b.sconto_pct ?? -1) - (a.sconto_pct ?? -1) || a.prezzo - b.prezzo,
  prezzo: (a, b) => a.prezzo - b.prezzo,
  unitario: (a, b) => (a.prezzo_unitario ?? Infinity) - (b.prezzo_unitario ?? Infinity) || a.prezzo - b.prezzo,
  scadenza: (a, b) => a.valido_fino.localeCompare(b.valido_fino) || a.prezzo - b.prezzo,
  nome: (a, b) => a.nome.localeCompare(b.nome, 'it'),
}
const shown = computed(() => base.value.filter((o) => inPeriodo(o, periodo.value, t)).sort(sorters[sort.value]))
const mie = computed(() => shown.value.filter((o) => prodottiByOffer.value.has(o.id)))
const altre = computed(() => (soloMiei.value ? [] : shown.value.filter((o) => !prodottiByOffer.value.has(o.id))))
const filtri = computed(() => !!(q.value.trim() || sm.value || cat.value))
const QUANDO = { oggi: 'valida oggi', domani: 'valida domani', settimana: 'nei prossimi 7 giorni', arrivo: 'in arrivo', tutte: '' }
</script>

<template>
  <div v-if="!state.loaded" class="center">
    <div v-if="state.loading" class="spinner" />
    <p v-else-if="state.error" class="error-text">{{ state.error }}</p>
  </div>

  <div v-else-if="!state.supermercati.length && !state.offerte.length" class="card empty stack">
    <p style="font-size: 2rem; margin: 0">🏷️</p>
    <p style="margin: 0">
      Aggiungi i supermercati che ti interessano e i prodotti da seguire. Le offerte arrivano dalla ricerca
      di Claude (ogni giorno, o quando la lanci tu) oppure le inserisci a mano.
    </p>
    <div class="row" style="justify-content: center">
      <RouterLink to="/supermercati" class="btn btn-primary">Aggiungi supermercati</RouterLink>
      <RouterLink to="/prodotti" class="btn">I miei prodotti</RouterLink>
      <RouterLink to="/importa" class="btn">Importa offerte</RouterLink>
    </div>
  </div>

  <div v-else class="stack">
    <div class="periods" role="tablist" aria-label="Periodo">
      <button
        v-for="p in PERIODI" :key="p.key" type="button" role="tab" class="period"
        :class="{ on: periodo === p.key }" :aria-selected="periodo === p.key" @click="periodo = p.key"
      >
        {{ p.label }} <span class="count">{{ counts[p.key] }}</span>
      </button>
    </div>

    <div class="filters">
      <input v-model="q" type="search" class="input search" placeholder="Cerca un prodotto…" aria-label="Cerca" />
      <select v-model="sm" class="select" aria-label="Supermercato">
        <option value="">Tutti i supermercati</option>
        <option v-for="s in supermercati" :key="s.id" :value="s.id">{{ s.nome }}</option>
      </select>
      <select v-if="categorie.length" v-model="cat" class="select" aria-label="Categoria">
        <option value="">Tutte le categorie</option>
        <option v-for="c in categorie" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="sort" class="select" aria-label="Ordina">
        <option v-for="s in SORTS" :key="s.key" :value="s.key">{{ s.label }}</option>
      </select>
    </div>

    <div class="row-between">
      <label class="toggle">
        <input v-model="soloMiei" type="checkbox" />
        <span>★ Solo i miei prodotti</span>
      </label>
      <button v-if="canWrite" type="button" class="btn btn-sm" @click="openOfferta()">＋ Offerta a mano</button>
    </div>

    <section v-if="mie.length" class="card list">
      <h3>★ Dei tuoi prodotti <span class="muted small">{{ mie.length }}</span></h3>
      <OfferCard v-for="o in mie" :key="o.id" :offerta="o" />
    </section>

    <section v-if="altre.length" class="card list">
      <h3>{{ mie.length ? 'Altre offerte' : 'Offerte' }} <span class="muted small">{{ altre.length }}</span></h3>
      <OfferCard v-for="o in altre.slice(0, limit)" :key="o.id" :offerta="o" />
      <button v-if="altre.length > limit" type="button" class="btn btn-ghost more" @click="limit += 60">
        Mostra altre {{ Math.min(60, altre.length - limit) }}
      </button>
    </section>

    <div v-if="!mie.length && !altre.length" class="card empty">
      <template v-if="!state.offerte.length">
        Non ci sono ancora offerte. <RouterLink to="/importa">Lancia una ricerca</RouterLink> o aggiungine una a mano.
      </template>
      <template v-else-if="soloMiei && !state.prodotti.length">
        Non segui ancora nessun prodotto: tocca <strong>☆ Segui</strong> su un'offerta o vai in
        <RouterLink to="/prodotti">I miei prodotti</RouterLink>.
      </template>
      <template v-else>
        Nessuna offerta {{ soloMiei ? 'dei tuoi prodotti ' : '' }}{{ QUANDO[periodo] }}{{ filtri ? ' con questi filtri' : '' }}.
      </template>
    </div>
  </div>
</template>

<style scoped>
.center { display: flex; justify-content: center; padding: 40px 0; }
.periods { display: flex; gap: 4px; padding: 3px; background: var(--surface-2); border-radius: var(--radius); overflow-x: auto; scrollbar-width: none; }
.period { flex: 1 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 10px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-weight: 500; font-size: .92rem; cursor: pointer; white-space: nowrap; }
.period.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.count { font-size: .76rem; padding: 0 6px; border-radius: 999px; background: var(--border); color: var(--muted); font-variant-numeric: tabular-nums; }
.period.on .count { background: var(--primary-soft); color: var(--primary); }
@media (max-width: 420px) {
  .period { padding: 7px 5px; font-size: .82rem; gap: 3px; }
  .count { padding: 0 4px; font-size: .7rem; }
}
.filters { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; }
@media (max-width: 760px) {
  .filters { grid-template-columns: 1fr 1fr; }
  .search { grid-column: 1 / -1; }
}
.toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 500; }
.list { display: flex; flex-direction: column; padding-top: 12px; }
.list h3 { margin: 0 0 2px; display: flex; align-items: baseline; gap: 8px; }
.more { align-self: center; margin-top: 8px; }
</style>
