<script setup>
import { computed } from 'vue'
import { toast } from '@shared/toast.js'
import { RING_MILESTONES, RING_TRAITS, TREE } from '../game/data.js'
import * as E from '../game/engine.js'
import { act, game, now } from '../game/store.js'
import { fmt, fmtDuration, fmtPct, fxText } from '../game/format.js'
import CostList from './CostList.vue'

const stage = computed(() => game.value.tree)
const adult = computed(() => stage.value >= TREE.stages)
const cost = computed(() => E.treeCost(game.value))
const ok = computed(() => cost.value && E.canAfford(game.value, cost.value))
const name = computed(() => (stage.value ? TREE.names[stage.value - 1] : 'Nessun germoglio'))
// L'albero cresce a vista: da 1.6rem a ~7rem.
const size = computed(() => `${1.6 + stage.value * 0.45}rem`)
const icon = computed(() => (stage.value === 0 ? '🌰' : stage.value < 3 ? '🌱' : stage.value < 6 ? '🌿' : stage.value < 9 ? '🌳' : '🌲'))

// ---- anelli
const ringCost = computed(() => E.ringCost(game.value))
const canRing = computed(() => game.value.ringsReady > 0 && E.canAfford(game.value, ringCost.value))
const choices = computed(() => E.ringChoices(game.value).map((id) => ({ ...E.TRAIT[id], text: E.TRAIT[id].fx.map(fxText).join(' · '), have: game.value.traits[id] ?? 0 })))
const nextRingIn = computed(() => E.nextDayAt(now.value) - now.value)
const traits = computed(() =>
  RING_TRAITS.filter((t) => game.value.traits[t.id]).map((t) => ({ ...t, n: game.value.traits[t.id], text: t.fx.map(fxText).join(' · ') })),
)
const milestones = computed(() => RING_MILESTONES.map((m) => ({ ...m, done: game.value.rings >= m.n })))

function form(id) {
  if (act(E.formRing, id)) toast.ok(`🪵 Anello ${game.value.rings}: ${E.TRAIT[id].icon} ${E.TRAIT[id].name}`)
}
</script>

<template>
  <div class="stack">
    <article class="card tree">
      <div class="tree-visual" :style="{ fontSize: size }" aria-hidden="true">{{ icon }}</div>
      <div class="stack" style="gap: 6px; text-align: center">
        <span class="muted small">Stadio {{ stage }} / {{ TREE.stages }}<template v-if="adult"> · {{ game.rings }} anelli</template></span>
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
        e <strong>non si perde mai</strong>, nemmeno sporulando. Da adulto inizierà a formare un anello all'anno.
      </p>
      <div class="row-between">
        <CostList :cost="cost" />
        <button class="btn btn-primary" :disabled="!ok" @click="act(E.growTree)">Nutri l'albero</button>
      </div>
    </article>

    <template v-else>
      <article class="card stack rings">
        <h3 style="margin: 0">🪵 Anelli</h3>
        <p class="small" style="margin: 0">
          L'Albero Madre è adulto e ora cresce in larghezza: a ogni mezzanotte (la fine dell'anno del bosco) matura un anello.
          Formalo con la luce e scegli il suo <strong>tratto</strong>: i tratti si sommano e restano per sempre.
          Gli anelli maturi si accumulano, quindi saltare un giorno non fa perdere nulla.
        </p>
        <div class="row-between">
          <span class="small">
            Maturi da formare: <strong>{{ game.ringsReady }}</strong>
            <span class="muted"> · il prossimo matura tra {{ fmtDuration(nextRingIn) }}</span>
          </span>
          <CostList v-if="game.ringsReady" :cost="ringCost" />
        </div>
        <div v-if="game.ringsReady" class="choices">
          <button v-for="c in choices" :key="c.id" class="card choice" :disabled="!canRing" @click="form(c.id)">
            <span class="choice-icon">{{ c.icon }}</span>
            <strong>{{ c.name }}</strong>
            <span class="small">{{ c.text }}</span>
            <span v-if="c.have" class="muted small">ne hai già {{ c.have }}</span>
          </button>
        </div>
        <p v-else class="muted small" style="margin: 0">Nessun anello da formare: torna dopo mezzanotte.</p>
      </article>

      <article v-if="traits.length" class="card">
        <h3 class="small muted caps">Tratti</h3>
        <ul class="traits">
          <li v-for="t in traits" :key="t.id"><span>{{ t.icon }} {{ t.name }} <strong>×{{ t.n }}</strong></span><span class="muted small">{{ t.text }}</span></li>
        </ul>
      </article>

      <article class="card">
        <h3 class="small muted caps">Traguardi degli anelli</h3>
        <ul class="miles">
          <li v-for="m in milestones" :key="m.n" :class="{ done: m.done }">
            <span class="badge" :class="{ 'badge-primary': m.done }">{{ m.n }}</span>
            <span class="small">{{ m.text }}</span>
          </li>
        </ul>
      </article>
    </template>
  </div>
</template>

<style scoped>
.tree { display: grid; place-items: center; gap: 10px; padding: 24px 16px; background: radial-gradient(circle at 50% 30%, var(--primary-soft), var(--surface) 70%); }
.tree-visual { line-height: 1; transition: font-size .6s cubic-bezier(.3, 1.6, .5, 1); filter: drop-shadow(0 6px 10px rgb(0 0 0 / .15)); }
.rings { border-color: var(--primary); }
.choices { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); }
.choice { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; font: inherit; color: inherit; cursor: pointer; padding: 12px 8px; }
.choice:hover:not(:disabled) { border-color: var(--primary); transform: translateY(-2px); }
.choice:disabled { opacity: .55; cursor: not-allowed; }
.choice-icon { font-size: 1.8rem; }
.caps { text-transform: uppercase; letter-spacing: .05em; }
.traits, .miles { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.traits li { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.miles li { display: flex; align-items: center; gap: 8px; opacity: .65; }
.miles li.done { opacity: 1; }
</style>
