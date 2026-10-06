<script setup>
import { computed, ref } from 'vue'
import { GENOME } from '../game/data.js'
import * as E from '../game/engine.js'
import { act, derived, game, now, sporulateNow } from '../game/store.js'
import { fmt, fmtDuration } from '../game/format.js'

const gain = computed(() => E.sporeGain(game.value, derived.value))
const canSpor = computed(() => game.value.terr >= E.SPORE_TERR)
// Nutrienti da produrre per la prossima spora.
const toNext = computed(() => {
  const need = ((gain.value + 1) / derived.value.spore) ** 2 * E.SPORE_DIV
  return Math.max(0, need - game.value.run.earned.nutrienti)
})
const runMs = computed(() => now.value - game.value.run.start)

const genome = computed(() =>
  GENOME.map((g) => {
    const lvl = game.value.gen[g.id] ?? 0
    const maxed = E.genomeMaxed(game.value, g.id)
    const cost = E.genomeCost(game.value, g.id)
    return { ...g, lvl, maxed, cost, ok: !maxed && game.value.spore >= cost }
  }),
)

const confirming = ref(false)
async function sporulate() {
  confirming.value = false
  await sporulateNow()
}
</script>

<template>
  <div class="stack">
    <article class="card stack hero">
      <div class="row-between">
        <div>
          <span class="muted small">Spore disponibili</span>
          <div class="big">🍄 {{ fmt(game.spore) }}</div>
        </div>
        <div style="text-align: right">
          <span class="muted small">Partita in corso da</span>
          <div><strong>{{ fmtDuration(runMs) }}</strong></div>
        </div>
      </div>
      <p class="small" style="margin: 0">
        <strong>Sporulare</strong> significa far fruttificare tutta la rete e disperdere le spore: si ricomincia dal Sottobosco
        (risorse, strutture, depositi, ricerche e territori tornano a zero) ma le spore restano e si spendono nel
        <strong>genoma</strong>, che vale per sempre. Anche l'Albero Madre e i traguardi restano.
      </p>
      <template v-if="canSpor">
        <p class="small" style="margin: 0">
          Sporulando adesso: <strong>+{{ fmt(gain) }} spore</strong>
          <span class="muted"> · la prossima tra {{ fmt(toNext) }} 🟤 nutrienti prodotti</span>
        </p>
        <div v-if="!confirming" class="row">
          <button class="btn btn-primary" :disabled="gain < 1" @click="confirming = true">🌬️ Sporula</button>
        </div>
        <div v-else class="row confirm">
          <span class="small">Ricominci da capo con +{{ fmt(gain) }} spore. Sicuro?</span>
          <button class="btn btn-primary btn-sm" @click="sporulate">Sì, sporula</button>
          <button class="btn btn-sm" @click="confirming = false">Annulla</button>
        </div>
      </template>
      <p v-else class="muted small" style="margin: 0">Conquista il {{ E.territoryAt(E.SPORE_TERR).name }} per poter sporulare.</p>
    </article>

    <h3 style="margin: 4px 0 0">🧬 Genoma</h3>
    <div class="gen-grid">
      <article v-for="g in genome" :key="g.id" class="card gen">
        <div class="row-between">
          <strong>{{ g.icon }} {{ g.name }}</strong>
          <span class="badge">liv. {{ g.lvl }}{{ g.max != null ? ` / ${g.max}` : '' }}</span>
        </div>
        <p class="small muted" style="margin: 0; flex: 1">{{ g.desc }}</p>
        <button class="btn btn-sm" :class="{ 'btn-primary': g.ok }" :disabled="!g.ok" @click="act(E.buyGenome, g.id)">
          {{ g.maxed ? 'Al massimo' : `Evolvi · 🍄 ${fmt(g.cost)}` }}
        </button>
      </article>
    </div>
  </div>
</template>

<style scoped>
.hero { background: linear-gradient(135deg, var(--surface), var(--primary-soft)); }
.big { font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.confirm { padding: 8px 10px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--warn); }
.gen-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.gen { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; }
</style>
