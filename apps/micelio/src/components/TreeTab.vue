<script setup>
import { computed } from 'vue'
import { TREE } from '../game/data.js'
import * as E from '../game/engine.js'
import { act, game } from '../game/store.js'
import { fmt, fmtPct } from '../game/format.js'
import CostList from './CostList.vue'

const stage = computed(() => game.value.tree)
const cost = computed(() => E.treeCost(game.value))
const ok = computed(() => cost.value && E.canAfford(game.value, cost.value))
const name = computed(() => (stage.value ? TREE.names[stage.value - 1] : 'Nessun germoglio'))
// L'albero cresce a vista: da 1.6rem a ~7rem.
const size = computed(() => `${1.6 + stage.value * 0.45}rem`)
const icon = computed(() => (stage.value === 0 ? '🌰' : stage.value < 3 ? '🌱' : stage.value < 6 ? '🌿' : stage.value < 9 ? '🌳' : '🌲'))
</script>

<template>
  <div class="stack">
    <article class="card tree">
      <div class="tree-visual" :style="{ fontSize: size }" aria-hidden="true">{{ icon }}</div>
      <div class="stack" style="gap: 6px; text-align: center">
        <span class="muted small">Stadio {{ stage }} / {{ TREE.stages }}</span>
        <h2 style="margin: 0">{{ name }}</h2>
        <p class="small" style="margin: 0">
          Bonus attuale: produzione <strong>×{{ fmt(TREE.all ** stage) }}</strong>, spore <strong>+{{ fmtPct(TREE.spore * stage) }}</strong>
        </p>
      </div>
    </article>

    <article v-if="cost" class="card stack">
      <p class="small" style="margin: 0">
        L'Albero Madre collega tutte le reti del bosco. Nutrilo con la ✨ luce dei corpi fruttiferi: ogni stadio dà
        <strong>×{{ TREE.all }}</strong> a tutta la produzione e <strong>+{{ fmtPct(TREE.spore) }}</strong> di spore,
        e <strong>non si perde mai</strong>, nemmeno sporulando.
      </p>
      <div class="row-between">
        <CostList :cost="cost" />
        <button class="btn btn-primary" :disabled="!ok" @click="act(E.growTree)">Nutri l'albero</button>
      </div>
    </article>
    <div v-else class="card empty">🌲 L'Albero Madre è adulto. Il bosco intero ti ascolta: continua a esplorare oltre il bosco.</div>
  </div>
</template>

<style scoped>
.tree { display: grid; place-items: center; gap: 10px; padding: 24px 16px; background: radial-gradient(circle at 50% 30%, var(--primary-soft), var(--surface) 70%); }
.tree-visual { line-height: 1; transition: font-size .6s cubic-bezier(.3, 1.6, .5, 1); filter: drop-shadow(0 6px 10px rgb(0 0 0 / .15)); }
</style>
