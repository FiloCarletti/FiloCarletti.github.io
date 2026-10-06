<script setup>
// I prodotti seguiti, divisi in: in offerta oggi, in arrivo, senza offerte, in pausa.
// Per ognuno l'offerta più conveniente (al pezzo o al kg/litro, secondo il prodotto).
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { fmtEuro, useSpace } from '@shared'
import { openProdotto, useData } from '../store.js'
import { inPeriodo, today, validity } from '../lib/dates.js'
import { buonPrezzo, normalize } from '../lib/match.js'
import { fmtUnit } from '../lib/util.js'

const { state, prodotti, offerteByProdotto, smById, load } = useData()
const { canWrite } = useSpace()
onMounted(load)

const q = ref('')
const t = today()
const rows = computed(() => {
  const needle = normalize(q.value)
  return prodotti.value
    .filter((p) => !needle || normalize(`${p.nome} ${p.parole.join(' ')} ${p.marca} ${p.categoria}`).includes(needle))
    .map((p) => {
      const all = offerteByProdotto.value.get(p.id) ?? []
      const oggi = all.filter((o) => inPeriodo(o, 'oggi', t))
      const arrivo = all.filter((o) => o.valido_da > t)
      const best = oggi[0] ?? arrivo[0] ?? null
      return { p, n: oggi.length || arrivo.length, best, good: !!best && buonPrezzo(best, p) }
    })
})
const groups = computed(() => [
  { key: 'oggi', title: 'In offerta oggi', rows: rows.value.filter((r) => r.p.attivo && r.best && r.best.valido_da <= t) },
  { key: 'arrivo', title: 'In offerta prossimamente', rows: rows.value.filter((r) => r.p.attivo && r.best && r.best.valido_da > t) },
  { key: 'senza', title: 'Nessuna offerta per ora', rows: rows.value.filter((r) => r.p.attivo && !r.best) },
  { key: 'pausa', title: 'In pausa', rows: rows.value.filter((r) => !r.p.attivo) },
].filter((g) => g.rows.length))

/** Prezzo principale: al kg/litro se il prodotto si confronta così e l'offerta lo indica. */
function mainPrice(r) {
  const o = r.best
  if (r.p.prezzo_per !== 'pz' && o.unita === r.p.prezzo_per && o.prezzo_unitario != null) return fmtUnit(o.prezzo_unitario, o.unita)
  return fmtEuro(o.prezzo)
}
const sub = (p) => [
  p.marca && `solo ${p.marca}`,
  p.categoria,
  p.prezzo_max != null && `buon prezzo ≤ ${fmtUnit(p.prezzo_max, p.prezzo_per)}`,
].filter(Boolean).join(' · ')
</script>

<template>
  <div class="stack">
    <div class="row-between">
      <h2 style="margin: 0">I miei prodotti</h2>
      <button v-if="canWrite" type="button" class="btn btn-primary btn-sm" @click="openProdotto()">＋ Prodotto</button>
    </div>
    <p class="muted small" style="margin: -4px 0 0">
      Le offerte che li riconoscono sono segnate con ★. La ricerca di Claude li cerca per primi in ogni volantino.
    </p>

    <div v-if="!state.loaded" class="center"><div v-if="state.loading" class="spinner" /></div>

    <div v-else-if="!state.prodotti.length" class="card empty stack">
      <p style="margin: 0">Non segui ancora nessun prodotto.</p>
      <p class="small" style="margin: 0">
        Aggiungilo da qui oppure tocca <strong>☆ Segui</strong> su un'offerta in <RouterLink to="/">Offerte</RouterLink>.
      </p>
      <div v-if="canWrite"><button type="button" class="btn btn-primary" @click="openProdotto()">＋ Aggiungi un prodotto</button></div>
    </div>

    <template v-else>
      <input v-if="state.prodotti.length > 8" v-model="q" type="search" class="input" placeholder="Cerca tra i tuoi prodotti…" aria-label="Cerca" />
      <section v-for="g in groups" :key="g.key" class="card list" :class="g.key">
        <h3>{{ g.title }} <span class="muted small">{{ g.rows.length }}</span></h3>
        <RouterLink v-for="r in g.rows" :key="r.p.id" :to="`/prodotti/${r.p.id}`" class="prow">
          <div class="pinfo">
            <strong>{{ r.p.nome }}</strong>
            <span v-if="sub(r.p)" class="muted small">{{ sub(r.p) }}</span>
          </div>
          <div v-if="r.best" class="pbest">
            <span class="price">
              <span v-if="r.good" class="badge good">buon prezzo</span>
              <strong>{{ mainPrice(r) }}</strong>
            </span>
            <span class="muted small where">
              {{ smById.get(r.best.supermercato_id)?.nome }} · {{ validity(r.best, t).text }}<template v-if="r.n > 1"> · +{{ r.n - 1 }}</template>
            </span>
          </div>
          <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </RouterLink>
      </section>
      <p v-if="!groups.length" class="card empty">Nessun prodotto corrisponde alla ricerca.</p>
    </template>
  </div>
</template>

<style scoped>
.center { display: flex; justify-content: center; padding: 40px 0; }
.list { display: flex; flex-direction: column; padding-top: 12px; padding-bottom: 6px; }
.list h3 { margin: 0 0 4px; display: flex; align-items: baseline; gap: 8px; }
.list.pausa { opacity: .75; }
.prow { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); color: inherit; text-decoration: none; }
.prow:last-child { border-bottom: 0; }
.prow:hover .pinfo strong { color: var(--primary); }
.pinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pbest { display: flex; flex-direction: column; align-items: flex-end; text-align: right; max-width: 55%; }
.price { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.good { background: color-mix(in srgb, var(--ok) 16%, var(--surface)); color: var(--ok); font-weight: 600; }
.chev { color: var(--muted); flex-shrink: 0; }
</style>
