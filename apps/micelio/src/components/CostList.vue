<script setup>
// Costo come lista di chip: rosso se manca, ⚠ se supera il deposito; stima del tempo di attesa.
import { computed } from 'vue'
import { derived, game, live } from '../game/store.js'
import { fmt, fmtDuration, resIcon, resName } from '../game/format.js'

const props = defineProps({ cost: { type: Object, required: true } })

const items = computed(() =>
  Object.entries(props.cost).map(([r, v]) => ({
    r, v, ok: game.value.res[r] >= v * (1 - 1e-9), tooBig: v > derived.value.caps[r] * (1 + 1e-9),
  })),
)
// Tempo per permetterselo al ritmo attuale (null se non arriva mai).
const wait = computed(() => {
  let t = 0
  for (const { r, v, ok, tooBig } of items.value) {
    if (ok) continue
    const rate = live.value.flow[r] ?? 0
    if (tooBig || rate <= 0) return null
    t = Math.max(t, (v - game.value.res[r]) / rate)
  }
  return t * 1000
})
const affordable = computed(() => items.value.every((i) => i.ok))
</script>

<template>
  <span class="costs">
    <span
      v-for="i in items" :key="i.r" class="cost" :class="{ no: !i.ok }"
      :title="i.tooBig ? `Supera il deposito di ${resName(i.r).toLowerCase()}: ingrandiscilo` : resName(i.r)"
    >{{ resIcon(i.r) }} {{ fmt(i.v) }}<template v-if="i.tooBig"> ⚠</template></span>
    <span v-if="!affordable" class="muted small">{{ wait != null ? `⏳ ${fmtDuration(wait)}` : '' }}</span>
  </span>
</template>

<style scoped>
.costs { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.cost { padding: 1px 7px; border-radius: 999px; background: var(--surface-2); font-size: .8rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cost.no { color: var(--danger); }
</style>
