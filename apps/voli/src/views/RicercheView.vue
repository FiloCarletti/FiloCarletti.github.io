<script setup>
// Elenco dei monitoraggi dello spazio con miglior prezzo attuale, minimo storico e obiettivo; sotto, gli altri spazi
// (i monitoraggi condivisi con me, o il mio spazio personale se sto guardando un condiviso).
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { fmtDateTime, useSpace } from '@shared'
import CercaOra from '../components/CercaOra.vue'
import { urlSpazio, useData, vaiASpazio } from '../store.js'
import { romeToday } from '../lib/combina.js'
import { criteriBreve, fasciaBreve, prezzo } from '../lib/formato.js'

const { state, ricerche, spazio, altriSpazi, load } = useData()
const { canWrite, viaLink } = useSpace()
onMounted(load)

const oggi = romeToday()
const attive = computed(() => ricerche.value.filter((r) => r.attiva && r.partenza_a >= oggi))
const altre = computed(() => ricerche.value.filter((r) => !(r.attiva && r.partenza_a >= oggi)))
const condiviso = computed(() => spazio.value?.kind === 'shared')
const personale = computed(() => altriSpazi.value.find((s) => s.kind === 'personal'))
const condivisi = computed(() => altriSpazi.value.filter((s) => s.kind !== 'personal'))

function stato(r) {
  if (r.migliore == null) return null
  if (r.prezzo_obiettivo != null && r.migliore <= r.prezzo_obiettivo) return { cls: 'ok', txt: 'sotto l’obiettivo' }
  if (r.minimo_storico != null && r.migliore <= r.minimo_storico) return { cls: 'ok', txt: 'minimo storico' }
  return null
}
const ruolo = (s) => (s.role === 'viewer' ? 'sola lettura' : s.role === 'editor' ? 'co-proprietario' : 'tuo')
</script>

<template>
  <div class="stack" style="gap: 16px">
    <div class="row-between">
      <div>
        <h2 style="margin: 0">{{ condiviso ? spazio.name : 'I miei monitoraggi' }}</h2>
        <p class="muted small" style="margin: 2px 0 0">
          <template v-if="condiviso">Monitoraggio condiviso: chi ne fa parte vede gli stessi voli e gli stessi avvisi.</template>
          <template v-else>I tuoi monitoraggi sono privati. Per condividerne uno, aprilo e tocca “Condividi”.</template>
        </p>
      </div>
      <div class="row">
        <CercaOra v-if="canWrite && attive.length" />
        <RouterLink v-if="canWrite" to="/nuova" class="btn btn-primary">+ Nuovo</RouterLink>
      </div>
    </div>

    <div v-if="!state.loaded && state.loading" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="!ricerche.length" class="card empty">
      <p style="font-size: 2rem; margin: 0">✈️</p>
      <p>Nessun monitoraggio. Indica da quali aeroporti puoi partire, dove vuoi andare, il periodo e la durata:
        Claude cercherà i prezzi in automatico e ti avviserà quando scendono.</p>
      <RouterLink v-if="canWrite" to="/nuova" class="btn btn-primary">Crea il primo monitoraggio</RouterLink>
    </div>

    <div v-else class="grid list">
      <RouterLink v-for="r in [...attive, ...altre]" :key="r.id" :to="`/ricerca/${r.id}`" class="card item" :class="{ off: !attive.includes(r) }">
        <div class="row-between" style="align-items: flex-start">
          <strong class="name">{{ r.nome }}</strong>
          <span v-if="!r.attiva" class="badge">in pausa</span>
          <span v-else-if="r.partenza_a < oggi" class="badge">concluso</span>
        </div>
        <p class="muted small crit">{{ criteriBreve(r) }}</p>
        <p v-if="fasciaBreve(r.giorni_andata, r.andata_dopo, r.andata_prima)" class="muted small crit">
          Andata {{ fasciaBreve(r.giorni_andata, r.andata_dopo, r.andata_prima) }}<template v-if="fasciaBreve(r.giorni_ritorno, r.ritorno_dopo, r.ritorno_prima)"> · ritorno {{ fasciaBreve(r.giorni_ritorno, r.ritorno_dopo, r.ritorno_prima) }}</template>
        </p>
        <div class="prices">
          <div>
            <span class="muted small">Ora</span>
            <strong class="big">{{ r.migliore != null ? prezzo(r.migliore) : '—' }}</strong>
          </div>
          <div v-if="r.minimo_storico != null">
            <span class="muted small">Minimo</span>
            <strong>{{ prezzo(r.minimo_storico) }}</strong>
          </div>
          <div v-if="r.prezzo_obiettivo != null">
            <span class="muted small">Obiettivo</span>
            <strong>{{ prezzo(r.prezzo_obiettivo) }}</strong>
          </div>
        </div>
        <div class="row small">
          <span v-if="stato(r)" class="badge ok">{{ stato(r).txt }}</span>
          <span class="muted">{{ r.migliore_il ? `aggiornato ${fmtDateTime(r.migliore_il)}` : 'in attesa della prima ricerca' }}</span>
        </div>
      </RouterLink>
    </div>

    <section v-if="!viaLink && (personale || condivisi.length)" class="stack">
      <h3 style="margin: 0">{{ condiviso ? 'Altri spazi' : 'Condivisi con te' }}</h3>
      <div class="stack" style="gap: 6px">
        <a v-if="personale" :href="urlSpazio(personale.id)" class="card link" @click.prevent="vaiASpazio(personale.id)">
          <span>🔒 I miei monitoraggi</span><span class="muted small">personale</span>
        </a>
        <a v-for="s in condivisi" :key="s.id" :href="urlSpazio(s.id)" class="card link" @click.prevent="vaiASpazio(s.id)">
          <span>👥 {{ s.name }}</span><span class="muted small">{{ s.role === 'owner' ? `tuo` : `di ${s.ownerName}` }} · {{ ruolo(s) }}</span>
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.list { grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); }
.item { display: flex; flex-direction: column; gap: 6px; color: inherit; text-decoration: none; transition: border-color .15s; }
.item:hover { border-color: var(--primary); }
.item.off { opacity: .65; }
.name { font-size: 1.05rem; }
.crit { margin: 0; }
.prices { display: flex; gap: 18px; margin: 4px 0; }
.prices > div { display: flex; flex-direction: column; }
.big { font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.badge.ok { background: color-mix(in srgb, var(--ok) 18%, var(--surface)); color: var(--ok); }
.link { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 14px; color: inherit; text-decoration: none; }
.link:hover { border-color: var(--primary); }
</style>
