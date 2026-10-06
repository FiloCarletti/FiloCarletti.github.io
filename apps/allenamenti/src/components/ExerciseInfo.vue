<script setup>
import { computed } from 'vue'

// Scheda di un esercizio: come si esegue, a cosa stare attenti, a cosa serve, muscoli coinvolti.
// `info` è un esercizio del DB oppure la `descrizione` di un piano JSON (stessi campi).
const props = defineProps({
  info: { type: Object, default: null },
})
const muscoli = computed(() => {
  const m = props.info?.muscoli
  return Array.isArray(m) ? m : typeof m === 'string' ? m.split(',').map((x) => x.trim()).filter(Boolean) : []
})
const sections = computed(() => [
  { key: 'esecuzione', label: 'Come si esegue', icon: '🧭' },
  { key: 'attenzione', label: 'A cosa stare attento', icon: '⚠️' },
  { key: 'scopo', label: 'Perché lo fai', icon: '🎯' },
].filter((s) => props.info?.[s.key]))
</script>

<template>
  <div class="info">
    <div v-if="muscoli.length" class="muscoli">
      <span class="label">Muscoli</span>
      <span v-for="m in muscoli" :key="m" class="badge">{{ m }}</span>
    </div>
    <div v-for="s in sections" :key="s.key" class="sec">
      <div class="label">{{ s.icon }} {{ s.label }}</div>
      <p>{{ info[s.key] }}</p>
    </div>
  </div>
</template>

<style scoped>
.info { display: flex; flex-direction: column; gap: 10px; }
.muscoli { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
.label { font-size: .75rem; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; font-weight: 600; }
.muscoli .label { margin-right: 4px; }
.sec p { margin: 2px 0 0; white-space: pre-line; line-height: 1.45; }
</style>
