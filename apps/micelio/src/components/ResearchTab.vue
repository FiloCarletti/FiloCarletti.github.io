<script setup>
import { computed, ref } from 'vue'
import { RESEARCH } from '../game/data.js'
import * as E from '../game/engine.js'
import { act, derived, game } from '../game/store.js'
import { fxText } from '../game/format.js'
import CostList from './CostList.vue'

const describe = (r) => [r.desc, ...r.fx.map(fxText)].filter(Boolean).join(' · ')

const available = computed(() => {
  const s = game.value
  const d = derived.value
  return RESEARCH.filter((r) => E.researchAvailable(s, r.id))
    .map((r) => {
      const cost = E.researchCost(r.id, d)
      return { ...r, cost, ok: E.canAfford(s, cost), text: describe(r) }
    })
    .sort((a, b) => (a.cost.segnali ?? 0) - (b.cost.segnali ?? 0))
})
const done = computed(() => RESEARCH.filter((r) => game.value.rs[r.id]).map((r) => ({ ...r, text: describe(r) })))
const locked = computed(() => RESEARCH.length - available.value.length - done.value.length)
const showDone = ref(false)
</script>

<template>
  <div class="stack">
    <p class="muted small" style="margin: 0">
      Le ricerche si pagano soprattutto in ⚡ segnali (in inverno i nodi ne producono il doppio). Si perdono alla sporulazione.
    </p>
    <article v-for="r in available" :key="r.id" class="card rs">
      <div style="min-width: 0">
        <strong>{{ r.name }}</strong>
        <p class="small muted" style="margin: 2px 0 6px">{{ r.text }}</p>
        <CostList :cost="r.cost" />
      </div>
      <button class="btn btn-primary btn-sm" :disabled="!r.ok" @click="act(E.buyResearch, r.id)">Ricerca</button>
    </article>
    <div v-if="!available.length" class="card empty">Nessuna ricerca disponibile: completa le altre o sblocca nuovi rami.</div>
    <p v-if="locked > 0" class="muted small" style="margin: 0">🔒 {{ locked }} ricerche ancora nascoste.</p>

    <div v-if="done.length" class="card" style="padding: 10px 14px">
      <button class="btn btn-ghost btn-sm" style="padding-left: 0" @click="showDone = !showDone">
        {{ showDone ? '▾' : '▸' }} Completate ({{ done.length }})
      </button>
      <ul v-if="showDone" class="done">
        <li v-for="r in done" :key="r.id"><strong>{{ r.name }}</strong> <span class="muted small">— {{ r.text }}</span></li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.rs { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; }
.done { margin: 6px 0 0; padding-left: 18px; display: grid; gap: 4px; }
</style>
