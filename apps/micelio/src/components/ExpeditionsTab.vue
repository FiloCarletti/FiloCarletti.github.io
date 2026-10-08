<script setup>
import { computed } from 'vue'
import { toast } from '@shared/toast.js'
import { BIOMES, RARITIES, RELICS } from '../game/data.js'
import * as E from '../game/engine.js'
import { act, derived, game, now } from '../game/store.js'
import { fmtDuration, fmtPct, fxText } from '../game/format.js'
import CostList from './CostList.vue'

const slots = computed(() => derived.value.slots)
const running = computed(() =>
  game.value.exp.map((e, i) => {
    const b = E.BIOME[e.b]
    const done = now.value >= e.end
    return { ...e, i, biome: b, done, left: e.end - now.value, pct: Math.min(1, (now.value - e.start) / (e.end - e.start)) }
  }),
)
const free = computed(() => game.value.exp.length < slots.value)

const biomes = computed(() => {
  const s = game.value
  const d = derived.value
  return BIOMES.map((b) => {
    const open = E.biomeAvailable(s, b)
    const cost = E.biomeCost(b, d)
    return { ...b, open, cost, ms: E.biomeMs(b, d), odds: E.biomeOdds(b, d), ok: open && free.value && E.canAfford(s, cost) }
  })
})

const relics = computed(() =>
  RARITIES.map((rar, i) => ({
    ...rar,
    i,
    items: RELICS.filter((r) => r.r === i).map((r) => {
      const lvl = game.value.relics[r.id] ?? 0
      return { ...r, lvl, max: E.relicMax(r), text: r.fx.map((f) => fxText(f)).join(' · ') }
    }),
  })),
)
const found = computed(() => Object.keys(game.value.relics).length)

function start(id) {
  act(E.startExpedition, id, Date.now())
}
function collect(i) {
  const r = act(E.collectExpedition, i, Date.now())
  if (!r) return
  if (r.spore) toast.ok(`${r.relic.icon} ${r.relic.name} è già al massimo: diventa +${r.spore} spore`)
  else toast.ok(`${r.relic.icon} ${r.isNew ? 'Nuovo reperto' : 'Reperto potenziato'}: ${r.relic.name} (liv. ${r.lvl})`)
}
</script>

<template>
  <div class="stack">
    <p class="muted small" style="margin: 0">
      Manda le ife a esplorare: tornano dopo qualche ora (reale, anche a gioco chiuso) con un <strong>reperto</strong>.
      I reperti doppi salgono di livello. Costano una parte dei depositi e restano dopo la sporulazione.
    </p>

    <section class="stack" style="gap: 8px">
      <h3 style="margin: 0">🎒 In viaggio · {{ running.length }} / {{ slots }}</h3>
      <article v-for="e in running" :key="`${e.b}:${e.start}`" class="card run" :class="{ done: e.done }">
        <span class="b-icon">{{ e.biome.icon }}</span>
        <div style="flex: 1; min-width: 0">
          <strong>{{ e.biome.name }}</strong>
          <div class="bar"><span :style="{ width: `${e.pct * 100}%` }" /></div>
          <span class="muted small">{{ e.done ? 'È tornata!' : `torna tra ${fmtDuration(e.left)}` }}</span>
        </div>
        <button class="btn btn-sm" :class="{ 'btn-primary': e.done }" :disabled="!e.done" @click="collect(e.i)">Raccogli</button>
      </article>
      <p v-if="!running.length" class="muted small" style="margin: 0">Nessuna spedizione in corso.</p>
    </section>

    <section class="stack" style="gap: 8px">
      <h3 style="margin: 0">🧭 Biomi</h3>
      <article v-for="b in biomes" :key="b.id" class="card biome" :class="{ locked: !b.open }">
        <span class="b-icon">{{ b.open ? b.icon : '🔒' }}</span>
        <div class="stack" style="gap: 4px; flex: 1; min-width: 0">
          <div class="row-between">
            <strong>{{ b.name }}</strong>
            <span class="badge">⏱ {{ fmtDuration(b.ms) }}</span>
          </div>
          <p class="small muted" style="margin: 0">{{ b.open ? b.desc : b.hint }}</p>
          <div class="odds">
            <template v-for="(p, i) in b.odds" :key="i">
              <span v-if="p > 0" class="odd" :class="`r${i}`">{{ RARITIES[i].name }} {{ fmtPct(p) }}</span>
            </template>
          </div>
          <div v-if="b.open" class="row-between">
            <CostList :cost="b.cost" />
            <button class="btn btn-sm btn-primary" :disabled="!b.ok" :title="free ? '' : 'Tutte le ife sono in viaggio'" @click="start(b.id)">Parti</button>
          </div>
        </div>
      </article>
    </section>

    <section class="stack" style="gap: 8px">
      <h3 style="margin: 0">🏺 Reperti · {{ found }} / {{ RELICS.length }}</h3>
      <div v-for="g in relics" :key="g.id" class="stack" style="gap: 6px">
        <span class="small odd" :class="`r${g.i}`" style="align-self: flex-start">{{ g.name }}</span>
        <div class="relics">
          <div v-for="r in g.items" :key="r.id" class="relic" :class="{ on: r.lvl }" :title="r.lvl ? r.text : 'Non ancora trovato'">
            <span class="relic-icon">{{ r.lvl ? r.icon : '❓' }}</span>
            <div style="min-width: 0">
              <div class="small relic-name">{{ r.lvl ? r.name : '???' }}</div>
              <div v-if="r.lvl" class="relic-lvl">
                <span v-for="k in r.max" :key="k" :class="{ lit: k <= r.lvl }">★</span>
              </div>
              <div v-if="r.lvl" class="muted relic-fx">{{ r.text }} per livello</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.run, .biome { display: flex; gap: 12px; align-items: center; padding: 12px 14px; }
.biome { align-items: flex-start; }
.run.done { border-color: var(--ok); }
.biome.locked { opacity: .6; box-shadow: none; border-style: dashed; }
.b-icon { font-size: 1.5rem; width: 44px; height: 44px; display: grid; place-items: center; background: var(--surface-2); border-radius: 12px; flex-shrink: 0; }
.bar { height: 6px; border-radius: 3px; background: var(--surface-2); margin: 6px 0 4px; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--primary); transition: width .25s linear; }
.run.done .bar span { background: var(--ok); }
.odds { display: flex; flex-wrap: wrap; gap: 4px; }
.odd { font-size: .74rem; padding: 1px 7px; border-radius: 999px; background: var(--surface-2); }
.r0 { color: var(--muted); }
.r1 { color: #3b82f6; }
.r2 { color: #a855f7; }
.r3 { color: #f59f00; }
.relics { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.relic { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: var(--radius); border: 1px dashed var(--border); opacity: .6; }
.relic.on { opacity: 1; border-style: solid; background: var(--surface); box-shadow: var(--shadow); }
.relic-icon { font-size: 1.4rem; width: 30px; text-align: center; flex-shrink: 0; }
.relic-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.relic-lvl { font-size: .72rem; color: var(--border); letter-spacing: 1px; }
.relic-lvl .lit { color: #f59f00; }
.relic-fx { font-size: .74rem; line-height: 1.3; }
</style>
