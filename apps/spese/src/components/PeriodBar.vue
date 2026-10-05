<script setup>
// Giorno / Settimana / Mese / Anno / Sempre, con frecce per scorrere. L'ultima scelta resta salvata.
import { computed } from 'vue'
import { useData } from '../store.js'
import { SPANS, isCurrent, rangeLabel, shiftAnchor, today } from '../lib/period.js'

const { span, anchor } = useData()
const label = computed(() => rangeLabel(span.value, anchor.value))
const atEnd = computed(() => isCurrent(span.value, anchor.value))
const move = (dir) => { anchor.value = shiftAnchor(span.value, anchor.value, dir) }
</script>

<template>
  <div class="period">
    <div class="spans" role="tablist" aria-label="Periodo">
      <button
        v-for="s in SPANS" :key="s.key" role="tab" class="span" :class="{ on: span === s.key }"
        :aria-selected="span === s.key" @click="span = s.key"
      >{{ s.label }}</button>
    </div>
    <div v-if="span !== 'all'" class="nav">
      <button class="btn btn-ghost btn-icon" aria-label="Periodo precedente" @click="move(-1)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <strong class="label">{{ label }}</strong>
      <button class="btn btn-ghost btn-icon" aria-label="Periodo successivo" :disabled="atEnd" @click="move(1)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      <button v-if="!atEnd" class="btn btn-ghost btn-sm today" @click="anchor = today()">Oggi</button>
    </div>
  </div>
</template>

<style scoped>
.period { display: flex; flex-direction: column; gap: 6px; }
.spans { display: flex; gap: 2px; border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
.span { flex: 1 0 auto; padding: 6px 8px 8px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; color: var(--muted); font: inherit; font-size: .9rem; font-weight: 500; cursor: pointer; }
.span.on { color: var(--primary); border-bottom-color: var(--primary); }
.nav { display: flex; align-items: center; gap: 4px; }
.label { flex: 1; text-align: center; font-size: 1.02rem; }
.today { position: absolute; right: 0; }
.nav { position: relative; }
@media (min-width: 520px) { .today { position: static; } .label { flex: 0 1 auto; min-width: 180px; } .nav { justify-content: center; } }
@media (max-width: 519px) { .today { display: none; } }
</style>
