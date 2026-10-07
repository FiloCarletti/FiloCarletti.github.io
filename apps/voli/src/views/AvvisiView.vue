<script setup>
// Avvisi generati dalla routine (prezzo obiettivo, nuovo minimo storico, calo forte), dal più recente.
// Aprendo la pagina restano evidenziati quelli nuovi; "Segna tutti come letti" azzera il badge.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase, toast, useSpace } from '@shared'
import { T } from '../db.js'
import { fetchAll, segnaLetti, useData } from '../store.js'
import { googleUrl } from '../lib/link.js'
import { giorno, prezzo } from '../lib/formato.js'

const { state, load } = useData()
const { spaceId, canWrite } = useSpace()
const avvisi = ref([])
const loading = ref(true)
onMounted(async () => {
  await load()
  try {
    avvisi.value = await fetchAll(() => supabase.from(T.avvisi).select('*').eq('space_id', spaceId.value)
      .order('created_at', { ascending: false }).limit(200))
  } catch (e) {
    toast.error(e)
  } finally {
    loading.value = false
  }
})
const nomi = computed(() => new Map(state.ricerche.map((r) => [r.id, r.nome])))
const nonLetti = computed(() => avvisi.value.filter((a) => !a.letto))
async function leggiTutti() {
  try {
    await segnaLetti(nonLetti.value.map((a) => a.id))
    avvisi.value = avvisi.value.map((a) => ({ ...a, letto: true }))
  } catch (e) { toast.error(e) }
}
async function leggi(a) {
  if (a.letto || !canWrite.value) return
  try {
    await segnaLetti([a.id])
    a.letto = true
  } catch (e) { toast.error(e) }
}
const TIPI = {
  obiettivo: { t: 'Sotto l’obiettivo', i: '🎯', rif: 'obiettivo' },
  minimo: { t: 'Nuovo minimo storico', i: '📉', rif: 'minimo precedente' },
  calo: { t: 'Calo forte', i: '⬇️', rif: 'ricerca precedente' },
}
const fmtT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const link = (s) => (s?.data && s.data_ritorno && s.ritorno_a === s.origine ? googleUrl(s.origine, s.destinazione, s.data, s.data_ritorno) : null)
</script>

<template>
  <div class="stack" style="gap: 14px">
    <div class="row-between">
      <div>
        <h2 style="margin: 0">Avvisi</h2>
        <p class="muted small" style="margin: 2px 0 0">Li genera la routine a ogni ricerca, secondo le soglie di ogni monitoraggio.</p>
      </div>
      <button v-if="canWrite && nonLetti.length" type="button" class="btn btn-sm" @click="leggiTutti">Segna tutti come letti</button>
    </div>
    <div v-if="loading" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="!avvisi.length" class="card empty">
      Nessun avviso. Imposta un prezzo obiettivo nei monitoraggi: quando la routine lo trova (o tocca un nuovo minimo storico) compare qui.
    </div>
    <div v-else class="stack" style="gap: 8px">
      <article v-for="a in avvisi" :key="a.id" class="card item" :class="{ nuovo: !a.letto }" @click="leggi(a)">
        <div class="row-between" style="align-items: flex-start">
          <div>
            <div><span aria-hidden="true">{{ TIPI[a.tipo].i }}</span> <strong>{{ TIPI[a.tipo].t }}</strong> · {{ prezzo(a.prezzo) }}
              <span v-if="a.riferimento != null" class="muted small">({{ TIPI[a.tipo].rif }} {{ prezzo(a.riferimento) }})</span>
            </div>
            <RouterLink v-if="nomi.get(a.ricerca_id)" :to="`/ricerca/${a.ricerca_id}`" class="small">{{ nomi.get(a.ricerca_id) }}</RouterLink>
            <p v-if="a.soluzione?.data" class="muted small" style="margin: 2px 0 0">
              {{ a.soluzione.origine }} → {{ a.soluzione.destinazione }} {{ giorno(a.soluzione.data) }}{{ a.soluzione.partenza ? ` ${a.soluzione.partenza}` : '' }}
              <template v-if="a.soluzione.data_ritorno"> · ritorno {{ giorno(a.soluzione.data_ritorno) }}{{ a.soluzione.rit_partenza ? ` ${a.soluzione.rit_partenza}` : '' }}{{ a.soluzione.ritorno_a && a.soluzione.ritorno_a !== a.soluzione.origine ? ` a ${a.soluzione.ritorno_a}` : '' }}</template>
              <template v-if="a.soluzione.compagnie"> · {{ a.soluzione.compagnie }}</template>
            </p>
          </div>
          <div class="side">
            <span class="muted small">{{ fmtT.format(new Date(a.created_at)) }}</span>
            <span v-if="!a.letto" class="badge badge-primary">nuovo</span>
            <a v-if="link(a.soluzione)" :href="link(a.soluzione)" target="_blank" rel="noopener" class="small" @click.stop>Vedi su Google Flights ↗</a>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.item { padding: 12px 14px; cursor: default; }
.item.nuovo { border-color: color-mix(in srgb, var(--primary) 50%, var(--border)); background: color-mix(in srgb, var(--primary-soft) 45%, var(--surface)); }
.side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right; }
</style>
