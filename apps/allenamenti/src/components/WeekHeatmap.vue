<script setup>
// Calendario a settimane (colonne) × giorni (righe), intensità = volume del giorno.
import { computed } from 'vue'
import { DAY, fmtKg, fmtShort, toISO, weekStart } from '../lib/metrics.js'
import { seqColor } from '../lib/theme.js'

const props = defineProps({
  sessions: { type: Array, required: true },
  weeks: { type: Number, default: 26 },
})

const grid = computed(() => {
  const byDay = new Map()
  for (const s of props.sessions) {
    const d = byDay.get(s.data) ?? { n: 0, vol: 0 }
    d.n++
    d.vol += s.stats.volume
    byDay.set(s.data, d)
  }
  const vols = [...byDay.values()].map((d) => d.vol).filter((v) => v > 0).sort((a, b) => a - b)
  const q = (p) => vols[Math.min(vols.length - 1, Math.floor(p * vols.length))] ?? 0
  const cuts = [q(0.25), q(0.5), q(0.75)]
  const today = toISO(new Date())
  const start = new Date(weekStart(new Date()).getTime() - (props.weeks - 1) * 7 * DAY)
  const cols = []
  for (let w = 0; w < props.weeks; w++) {
    const days = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i)
      const iso = toISO(date)
      const d = byDay.get(iso)
      const step = d ? (d.vol <= cuts[0] ? 0 : d.vol <= cuts[1] ? 1 : d.vol <= cuts[2] ? 2 : 3) : -1
      days.push({ iso, future: iso > today, step, d })
    }
    cols.push({ days, month: days[0].iso.slice(8) <= '07' ? fmtShort(days[0].iso).split(' ')[1] : '' })
  }
  return cols
})

const tip = (c) => (c.d ? `${fmtShort(c.iso)}: ${c.d.n > 1 ? `${c.d.n} allenamenti` : 'allenamento'} · ${fmtKg(c.d.vol)}` : fmtShort(c.iso))
</script>

<template>
  <div class="heat" :style="{ '--cols': weeks }">
    <div class="months">
      <span v-for="(c, i) in grid" :key="i">{{ c.month }}</span>
    </div>
    <div class="cells">
      <div v-for="(c, i) in grid" :key="i" class="col">
        <span
          v-for="d in c.days" :key="d.iso" class="cell" :class="{ future: d.future, on: d.step >= 0 }"
          :style="d.step >= 0 ? { background: seqColor(d.step) } : null" :title="tip(d)" :aria-label="tip(d)"
        />
      </div>
    </div>
    <div class="legend muted small">
      <span>meno volume</span>
      <span class="cell" /><span v-for="s in 4" :key="s" class="cell on" :style="{ background: seqColor(s - 1) }" />
      <span>più volume</span>
    </div>
  </div>
</template>

<style scoped>
.heat { display: flex; flex-direction: column; gap: 4px; }
.months, .cells { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 2px; }
.months span { font-size: .68rem; color: var(--muted); white-space: nowrap; overflow: visible; }
.col { display: grid; grid-template-rows: repeat(7, 1fr); gap: 2px; }
.cell { display: block; aspect-ratio: 1; border-radius: 2px; background: var(--surface-2); min-width: 6px; }
.cell.future { opacity: .35; }
.legend { display: flex; align-items: center; gap: 3px; justify-content: flex-end; margin-top: 4px; }
.legend .cell { width: 10px; height: 10px; }
.legend span:first-child { margin-right: 4px; }
.legend span:last-child { margin-left: 4px; }
</style>
