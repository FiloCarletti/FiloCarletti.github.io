<script setup>
import { computed } from 'vue'
import { RESERVE_STEPS, SEASONS, STORAGE_COST, WEATHER } from '../game/data.js'
import * as E from '../game/engine.js'
import { act, derived, game, live, now } from '../game/store.js'
import { fmt, fmtDuration, fmtPct, fmtRate } from '../game/format.js'

const season = computed(() => {
  const i = E.seasonAt(now.value)
  return { ...SEASONS[i], left: E.nextSeasonAt(now.value) - now.value, next: SEASONS[(i + 1) % 4] }
})
// Meteo di oggi e previsione per domani (dipendono dalla data: si possono pianificare).
const weather = computed(() => WEATHER[E.weatherAt(game.value, now.value)])
const tomorrow = computed(() => WEATHER[E.weatherAt(game.value, E.nextDayAt(now.value))])

// Risorse consumate da almeno un convertitore posseduto: per loro ha senso la riserva.
const consumed = computed(() => {
  const s = game.value
  const set = new Set()
  for (const id of Object.keys(s.b)) for (const r of Object.keys(E.BLD[id]?.in ?? {})) if (s.b[id]) set.add(r)
  return set
})

const rows = computed(() => {
  const s = game.value
  const d = derived.value
  return E.RES_IDS.filter((r) => E.resourceVisible(s, r)).map((r) => {
    const cap = d.caps[r]
    const amount = s.res[r]
    return {
      ...E.RES[r], amount, cap, pct: Math.min(1, amount / cap), full: amount >= cap * 0.999,
      rate: live.value.flow[r] ?? 0,
      upCost: cap * STORAGE_COST, canUp: amount >= cap * STORAGE_COST,
      reserve: consumed.value.has(r) ? E.reserveOf(s, r) : null,
    }
  })
})

const clickValue = computed(() => E.clickValue(game.value, derived.value, now.value))
const popped = computed(() => game.value.life.clicks)

function upgrade(r) {
  act(E.upgradeStorage, r)
}
function cycleReserve(r) {
  act((s) => {
    const i = RESERVE_STEPS.indexOf(E.reserveOf(s, r))
    s.reserve[r] = RESERVE_STEPS[(i + 1) % RESERVE_STEPS.length]
  })
}
function tap() {
  act(E.click, Date.now())
}
</script>

<template>
  <aside class="stack side">
    <div class="card season" :title="season.desc">
      <div class="row-between">
        <strong>{{ season.icon }} {{ season.name }}</strong>
        <span class="muted small">ancora {{ fmtDuration(season.left) }}</span>
      </div>
      <p class="small" style="margin: 4px 0 0">{{ season.desc }}</p>
      <p class="muted small" style="margin: 2px 0 0">Poi {{ season.next.icon }} {{ season.next.name }}. Un giorno reale è un anno: ogni stagione dura 6 ore.</p>
      <div class="weather" :title="weather.desc">
        <strong>{{ weather.icon }} {{ weather.name }}</strong>
        <span class="small">{{ weather.desc }}</span>
        <span class="muted small">Domani: {{ tomorrow.icon }} {{ tomorrow.name }}</span>
      </div>
    </div>

    <button class="card tap" @click="tap">
      <span :key="popped" class="tap-icon">👆</span>
      <span>
        <strong>Assorbi</strong>
        <span class="muted small block">+{{ fmt(clickValue) }} 🟤 nutrienti a tocco</span>
      </span>
    </button>

    <div class="card res-list">
      <div v-for="r in rows" :key="r.id" class="res" :title="r.desc">
        <div class="res-top">
          <span class="res-name">{{ r.icon }} {{ r.name }}</span>
          <span class="res-amt"><strong>{{ fmt(r.amount) }}</strong><span class="muted"> / {{ fmt(r.cap) }}</span></span>
        </div>
        <div class="bar" :class="{ full: r.full }"><span :style="{ width: `${r.pct * 100}%` }" /></div>
        <div class="res-bottom">
          <span class="small" :class="r.rate < -1e-9 ? 'neg' : r.full ? 'muted' : 'pos'">
            {{ r.full ? 'pieno' : fmtRate(r.rate) }}
          </span>
          <span class="row" style="gap: 4px">
            <button
              v-if="r.reserve != null" class="mini" :title="`Riserva: i convertitori non scendono sotto il ${fmtPct(r.reserve)} del deposito. Tocca per cambiarla.`"
              @click="cycleReserve(r.id)"
            >🔒 {{ fmtPct(r.reserve) }}</button>
            <button
              class="mini" :disabled="!r.canUp"
              :title="`Raddoppia il deposito (da ${fmt(r.cap)} a ${fmt(r.cap * 2)}). Costa ${fmt(r.upCost)} ${r.name.toLowerCase()}.`"
              @click="upgrade(r.id)"
            >⬆ {{ fmt(r.upCost) }}</button>
          </span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.side { gap: 10px; }
.season { padding: 12px 14px; background: linear-gradient(135deg, var(--surface), var(--surface-2)); }
.tap { display: flex; align-items: center; gap: 12px; text-align: left; font: inherit; color: inherit; cursor: pointer; padding: 12px 14px; user-select: none; -webkit-tap-highlight-color: transparent; }
.tap:hover { border-color: var(--primary); }
.tap:active { transform: scale(.98); }
.tap-icon { font-size: 1.6rem; animation: pop .25s ease-out; }
.block { display: block; }
.weather { display: flex; flex-direction: column; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
@keyframes pop { from { transform: scale(1.3); } to { transform: scale(1); } }
.res-list { padding: 8px 12px; display: grid; gap: 2px; }
.res { padding: 6px 0; border-bottom: 1px solid var(--border); }
.res:last-child { border-bottom: 0; }
.res-top, .res-bottom { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.res-name { font-weight: 500; white-space: nowrap; }
.res-amt { font-variant-numeric: tabular-nums; font-size: .9rem; white-space: nowrap; }
.bar { height: 4px; border-radius: 2px; background: var(--surface-2); margin: 4px 0; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--primary); transition: width .25s linear; }
.bar.full span { background: var(--warn); }
.pos { color: var(--ok); font-variant-numeric: tabular-nums; }
.neg { color: var(--danger); font-variant-numeric: tabular-nums; }
.mini {
  border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 6px;
  padding: 1px 6px; font: inherit; font-size: .76rem; cursor: pointer; white-space: nowrap;
}
.mini:hover:not(:disabled) { border-color: var(--primary); }
.mini:disabled { opacity: .45; cursor: not-allowed; }
@media (max-width: 820px) {
  .res-list { grid-template-columns: 1fr 1fr; column-gap: 14px; }
  .res { border-bottom: 1px solid var(--border) !important; }
}
@media (max-width: 420px) {
  .res-list { grid-template-columns: 1fr; }
}
</style>
