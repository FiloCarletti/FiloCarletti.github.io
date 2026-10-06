<script setup>
// Wrapper minimo per Chart.js: ricrea il grafico quando cambiano dati o tema.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Chart, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend, Filler,
} from 'chart.js'
import { cssVar, isDark } from '../lib/theme.js'

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler)

const props = defineProps({
  type: { type: String, default: 'bar' },
  data: { type: Object, required: true },
  options: { type: Object, default: () => ({}) },
  height: { type: Number, default: 240 },
  label: { type: String, default: '' }, // descrizione accessibile
})

const canvas = ref(null)
let chart = null

function merge(a, b) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof a?.[k] === 'object' ? merge(a[k], v) : v
  }
  return out
}

function render() {
  if (!canvas.value) return
  chart?.destroy()
  const muted = cssVar('--muted')
  const border = cssVar('--border')
  const surface = cssVar('--surface')
  const text = cssVar('--text')
  Chart.defaults.font.family = cssVar('--font') || 'system-ui'
  Chart.defaults.font.size = 12
  Chart.defaults.color = muted
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', color: muted, padding: 12 },
      },
      tooltip: {
        backgroundColor: surface, titleColor: text, bodyColor: text, borderColor: border, borderWidth: 1,
        padding: 10, boxPadding: 4, usePointStyle: true,
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: border }, ticks: { color: muted, maxRotation: 0, autoSkipPadding: 12 } },
      y: { grid: { color: border }, border: { display: false }, ticks: { color: muted, maxTicksLimit: 5 }, beginAtZero: true },
    },
    elements: {
      bar: { borderRadius: 4, borderSkipped: 'start' },
      line: { borderWidth: 2, tension: 0.25 },
      point: { radius: 4, hoverRadius: 6, borderWidth: 2, borderColor: surface },
    },
  }
  if (props.type === 'doughnut' || props.type === 'pie') {
    // Torte: niente assi; spicchi separati da un filo del colore di fondo.
    delete base.scales
    base.interaction = { mode: 'nearest', intersect: true }
    base.elements.arc = { borderColor: surface, borderWidth: 2, hoverOffset: 6 }
  }
  chart = new Chart(canvas.value, {
    type: props.type,
    data: JSON.parse(JSON.stringify(props.data)),
    options: merge(base, props.options),
  })
}

onMounted(render)
watch(() => [props.data, props.options, isDark.value], render, { deep: true })
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div class="chart" :style="{ height: `${height}px` }">
    <canvas ref="canvas" role="img" :aria-label="label" />
  </div>
</template>

<style scoped>
.chart { position: relative; width: 100%; }
</style>
