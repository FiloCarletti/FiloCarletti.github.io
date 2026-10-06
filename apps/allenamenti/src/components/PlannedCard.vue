<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useSpace } from '@shared'
import { daysBetween, fmtLong, fmtNum, fmtVoce, parseISO, toISO } from '../lib/metrics.js'

const props = defineProps({
  session: { type: Object, required: true },
  compact: { type: Boolean, default: false },
})
const { canWrite } = useSpace()

const when = computed(() => {
  const d = daysBetween(parseISO(toISO(new Date())), parseISO(props.session.data))
  if (d === 0) return { label: 'oggi', cls: 'today' }
  if (d === 1) return { label: 'domani', cls: '' }
  if (d > 1) return { label: `tra ${d} giorni`, cls: '' }
  return { label: d === -1 ? 'era ieri' : `era ${-d} giorni fa`, cls: 'late' }
})
const started = computed(() => props.session.done > 0)
const FONTI = { claude: '✨ Claude', json: 'JSON', manuale: 'A mano' }
</script>

<template>
  <article class="card planned" :class="{ compact }">
    <header class="row-between" style="align-items: flex-start; flex-wrap: nowrap">
      <div style="min-width: 0">
        <div class="date">
          {{ fmtLong(session.data) }} · <span class="when" :class="when.cls">{{ when.label }}</span>
        </div>
        <h3 style="margin: 2px 0 6px">{{ session.titolo || 'Allenamento' }}</h3>
        <div class="row" style="gap: 6px">
          <span class="badge badge-primary">Da fare</span>
          <span v-if="session.fonte" class="badge">{{ FONTI[session.fonte] ?? session.fonte }}</span>
          <span v-if="started" class="badge">{{ session.done }}/{{ session.voci.length }} confermati</span>
        </div>
      </div>
      <div class="row" style="gap: 2px; flex-wrap: nowrap">
        <RouterLink v-if="canWrite && !compact" :to="`/allenamenti/${session.id}/svolgi`" class="btn btn-ghost btn-sm" title="Vedi e modifica l'elenco degli esercizi">Elenco</RouterLink>
        <RouterLink :to="`/allenamenti/${session.id}/${canWrite ? 'guida' : 'svolgi'}`" class="btn btn-sm" :class="{ 'btn-primary': canWrite }">
          {{ !canWrite ? 'Apri' : started ? '▶ Continua' : '▶ Inizia' }}
        </RouterLink>
      </div>
    </header>

    <ul v-if="!compact" class="voci">
      <li v-for="v in session.voci" :key="v.id" :class="v.stato">
        <span class="check" aria-hidden="true">{{ v.stato === 'fatto' ? '✓' : v.stato === 'saltato' ? '–' : '' }}</span>
        <span class="name">{{ v.esercizio.nome }}</span>
        <span class="spacer" />
        <span class="what">{{ fmtVoce(v.stato === 'da_fare' && v.piano ? v.piano : v, v.esercizio.unita) }}</span>
        <span v-if="v.stato === 'da_fare' && v.piano?.rpe" class="rpe">RPE {{ fmtNum(v.piano.rpe) }}</span>
      </li>
    </ul>
    <p v-if="!compact && session.note" class="muted small note">{{ session.note }}</p>
  </article>
</template>

<style scoped>
.planned { border-style: dashed; border-color: var(--primary); box-shadow: none; }
.date { font-size: .8rem; color: var(--muted); }
.date::first-letter { text-transform: uppercase; }
.when.today { color: var(--primary); font-weight: 600; }
.when.late { color: var(--warn); }
.voci { list-style: none; margin: 10px 0 0; padding: 0; }
.voci li { display: flex; align-items: baseline; gap: 8px; padding: 6px 0; border-top: 1px solid var(--border); }
.voci li.fatto .name, .voci li.fatto .what { color: var(--muted); }
.voci li.saltato .name, .voci li.saltato .what { color: var(--muted); text-decoration: line-through; }
.check { width: 14px; color: var(--ok); font-weight: 700; flex-shrink: 0; }
.name { font-weight: 500; }
.what { font-variant-numeric: tabular-nums; white-space: nowrap; }
.rpe { font-size: .75rem; color: var(--muted); white-space: nowrap; }
.note { margin: 10px 0 0; white-space: pre-line; }
</style>
