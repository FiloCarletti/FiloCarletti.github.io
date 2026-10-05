<script setup>
import { RouterLink } from 'vue-router'
import { useSpace } from '@shared'
import CatDot from './CatDot.vue'
import { fmtKg, fmtLong, fmtNum, fmtVoce } from '../lib/metrics.js'

const props = defineProps({
  session: { type: Object, required: true },
  highlight: { type: String, default: '' }, // esercizio_id da evidenziare
})
defineEmits(['delete'])
const { canWrite } = useSpace()

const title = () => props.session.titolo || props.session.stats.categorie.join(' · ') || 'Allenamento'
</script>

<template>
  <article class="card session">
    <header class="row-between" style="align-items: flex-start; flex-wrap: nowrap">
      <div style="min-width: 0">
        <div class="date">{{ fmtLong(session.data) }}</div>
        <h3 style="margin: 2px 0 6px">{{ title() }}</h3>
        <div class="row" style="gap: 6px">
          <CatDot v-for="c in session.stats.categorie" :key="c" :cat="c" />
          <span v-if="session.stats.prs" class="badge badge-primary">🏆 {{ session.stats.prs }} record</span>
          <span v-if="session.fonte === 'claude'" class="badge" title="Programmato con Claude">✨ Claude</span>
        </div>
      </div>
      <div v-if="canWrite" class="row" style="gap: 2px; flex-wrap: nowrap">
        <RouterLink :to="`/allenamenti/nuovo?da=${session.id}&piano=1`" class="btn btn-ghost btn-icon" title="Programma di nuovo questo allenamento" aria-label="Programma di nuovo">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>
        </RouterLink>
        <RouterLink :to="`/allenamenti/nuovo?da=${session.id}`" class="btn btn-ghost btn-icon" title="Ripeti questo allenamento" aria-label="Ripeti">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>
        </RouterLink>
        <RouterLink :to="`/allenamenti/${session.id}`" class="btn btn-ghost btn-icon" title="Modifica" aria-label="Modifica">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </RouterLink>
        <button class="btn btn-ghost btn-icon btn-danger" title="Elimina" aria-label="Elimina" @click="$emit('delete', session)">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>
    </header>

    <dl class="kpis">
      <div><dt>Esercizi</dt><dd>{{ session.stats.esercizi }}</dd></div>
      <div><dt>Serie</dt><dd>{{ session.stats.serie }}</dd></div>
      <div><dt>Volume</dt><dd>{{ fmtKg(session.stats.volume) }}</dd></div>
      <div v-if="session.stats.rpe"><dt>RPE medio</dt><dd>{{ fmtNum(session.stats.rpe) }}</dd></div>
      <div v-if="session.durata_min"><dt>Durata</dt><dd>{{ session.durata_min }} min</dd></div>
    </dl>

    <ul class="voci">
      <li v-for="v in session.voci" :key="v.id" :class="{ hl: highlight && v.esercizio_id === highlight }">
        <RouterLink :to="`/esercizi/${v.esercizio_id}`" class="name">{{ v.esercizio.nome }}</RouterLink>
        <span v-if="v.isPR" class="pr" title="Record personale">🏆</span>
        <span class="spacer" />
        <span class="what">{{ fmtVoce(v) }}</span>
        <span v-if="v.rpe" class="rpe" title="RPE (sforzo percepito)">RPE {{ fmtNum(v.rpe) }}</span>
        <span v-if="v.note" class="note muted small">{{ v.note }}</span>
      </li>
    </ul>
    <p v-if="session.note" class="muted small" style="margin: 10px 0 0; white-space: pre-line">{{ session.note }}</p>
  </article>
</template>

<style scoped>
.date { font-size: .8rem; color: var(--muted); text-transform: capitalize; }
.kpis { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 12px 0 8px; }
.kpis div { display: flex; flex-direction: column; }
.kpis dt { font-size: .72rem; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.kpis dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.voci { list-style: none; margin: 0; padding: 0; }
.voci li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; padding: 7px 8px; margin: 0 -8px; border-top: 1px solid var(--border); border-radius: 6px; }
.voci li.hl { background: var(--primary-soft); border-top-color: transparent; }
.name { color: var(--text); text-decoration: none; font-weight: 500; }
.name:hover { color: var(--primary); }
.what { font-variant-numeric: tabular-nums; white-space: nowrap; }
.rpe { font-size: .75rem; color: var(--muted); white-space: nowrap; }
.note { flex-basis: 100%; }
.pr { font-size: .85rem; }
</style>
