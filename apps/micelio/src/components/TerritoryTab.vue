<script setup>
import { computed } from 'vue'
import * as E from '../game/engine.js'
import { act, derived, game } from '../game/store.js'
import { fxText } from '../game/format.js'
import CostList from './CostList.vue'

const conquered = computed(() => Array.from({ length: game.value.terr + 1 }, (_, i) => E.territoryAt(i)))
const next = computed(() => {
  const s = game.value
  const t = E.territoryAt(s.terr + 1)
  const cost = E.territoryCost(s, derived.value)
  return { ...t, cost, ok: E.canAfford(s, cost), text: t.desc || t.fx.map(fxText).join(' · ') }
})
const after = computed(() => E.territoryAt(game.value.terr + 2))
</script>

<template>
  <div class="stack">
    <p class="muted small" style="margin: 0">
      Estendi la rete a nuovi territori, uno dopo l'altro: ognuno dà un bonus permanente per questa partita
      e alcuni sbloccano nuove strutture. Si ricomincia dal Sottobosco a ogni sporulazione.
    </p>

    <article class="card next">
      <div class="next-icon">{{ next.icon }}</div>
      <div class="stack" style="gap: 6px; flex: 1; min-width: 0">
        <div>
          <span class="muted small">Prossimo territorio · {{ game.terr + 1 }}</span>
          <h3 style="margin: 0">{{ next.name }}</h3>
          <p class="small" style="margin: 2px 0 0">{{ next.text }}</p>
        </div>
        <div class="row-between">
          <CostList :cost="next.cost" />
          <button class="btn btn-primary" :disabled="!next.ok" @click="act(E.conquer)">Conquista</button>
        </div>
      </div>
    </article>
    <p class="muted small" style="margin: 0">Poi: {{ after.far ? after.name : '???' }}</p>

    <div class="card">
      <h3 class="small muted" style="text-transform: uppercase; letter-spacing: .05em">La tua rete ({{ conquered.length }})</h3>
      <ol class="path">
        <li v-for="(t, i) in conquered" :key="i" :title="t.desc">
          <span class="dot">{{ t.icon }}</span>
          <span class="small">{{ t.name }}</span>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.next { display: flex; gap: 14px; align-items: flex-start; border-color: var(--primary); }
.next-icon { font-size: 2.2rem; width: 60px; height: 60px; display: grid; place-items: center; background: var(--primary-soft); border-radius: 16px; flex-shrink: 0; }
.path { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.path li { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; background: var(--surface-2); border-radius: 999px; }
.dot { width: 26px; height: 26px; display: grid; place-items: center; background: var(--surface); border-radius: 50%; }
</style>
