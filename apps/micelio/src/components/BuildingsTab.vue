<script setup>
import { computed } from 'vue'
import { BUILDINGS } from '../game/data.js'
import * as E from '../game/engine.js'
import { act, derived, game, live, now } from '../game/store.js'
import { fmt, fmtPct, resIcon } from '../game/format.js'
import CostList from './CostList.vue'

const list = computed(() => {
  const s = game.value
  const d = derived.value
  const si = E.seasonAt(now.value)
  return BUILDINGS.filter((b) => E.buildingVisible(s, b)).map((b) => {
    const n = s.b[b.id] ?? 0
    const each = E.buildingMult(d, b.id) * E.seasonMult(si, b.main, d.season)
    const eff = live.value.eff[b.id]
    return {
      ...b, n, each, cost: E.buildingCost(s, b.id, d), max: E.maxAffordable(s, b.id, d),
      off: !!s.off[b.id], eff: eff == null ? 1 : eff,
      lacking: b.in ? Object.keys(b.in).filter((r) => s.res[r] <= E.reserveOf(s, r) * d.caps[r] * 1.001) : [],
    }
  })
})
const locked = computed(() => BUILDINGS.find((b) => !E.buildingVisible(game.value, b)))

const io = (o, k) => Object.entries(o).map(([r, v]) => `${resIcon(r)} ${fmt(v * k)}`).join('  ')

function buy(id, qty) {
  act(E.buyBuilding, id, qty)
}
function toggle(id) {
  act((s) => {
    if (s.off[id]) delete s.off[id]
    else s.off[id] = true
  })
}
</script>

<template>
  <div class="stack">
    <p class="muted small" style="margin: 0">
      Le strutture producono da sole, anche a gioco chiuso. I <strong>convertitori</strong> trasformano una risorsa in un'altra:
      non scendono mai sotto la <strong>riserva 🔒</strong> che scegli nel pannello delle risorse.
    </p>

    <article v-for="b in list" :key="b.id" class="card bld" :class="{ dim: b.off }">
      <div class="bld-head">
        <span class="bld-icon">{{ b.icon }}</span>
        <div class="bld-title">
          <strong>{{ b.name }}</strong>
          <span class="badge badge-primary">× {{ b.n }}</span>
        </div>
        <label v-if="b.in && b.n" class="switch" :title="b.off ? 'Spento: non consuma e non produce' : 'Acceso'">
          <input type="checkbox" :checked="!b.off" @change="toggle(b.id)" />
          <span>{{ b.off ? 'spento' : 'acceso' }}</span>
        </label>
      </div>
      <p class="muted small desc">{{ b.desc }}</p>
      <p class="small io">
        <span v-if="b.in" class="neg">− {{ io(b.in, b.each) }}</span>
        <span v-if="b.in" class="muted"> → </span>
        <span class="pos">+ {{ io(b.out, b.each) }}</span>
        <span class="muted"> /s ciascuna</span>
        <template v-if="b.n > 1"><span class="muted"> · totale </span><span class="pos">+ {{ io(b.out, b.each * b.n * (b.in && !b.off ? b.eff : 1)) }}</span></template>
      </p>
      <p v-if="b.in && b.n && !b.off && b.eff < 0.99" class="small warn">
        ⚠ Lavora al {{ fmtPct(b.eff) }}<template v-if="b.lacking.length">: manca {{ b.lacking.map(resIcon).join(' ') }}</template>
      </p>
      <div class="bld-foot">
        <CostList :cost="b.cost" />
        <div class="row" style="gap: 6px">
          <button class="btn btn-sm" :disabled="b.max < 10" :title="`Compra 10`" @click="buy(b.id, 10)">×10</button>
          <button class="btn btn-sm" :disabled="b.max < 1" :title="`Compra tutte quelle che puoi (${b.max})`" @click="buy(b.id, b.max)">Max {{ b.max > 1 ? b.max : '' }}</button>
          <button class="btn btn-sm btn-primary" :disabled="b.max < 1" @click="buy(b.id, 1)">Compra</button>
        </div>
      </div>
    </article>

    <div v-if="locked" class="card locked">
      <span class="bld-icon">🔒</span>
      <div>
        <strong>Prossima struttura</strong>
        <p class="muted small" style="margin: 0">{{ locked.hint }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bld { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; }
.bld.dim { opacity: .65; }
.bld-head { display: flex; align-items: center; gap: 10px; }
.bld-icon { font-size: 1.5rem; width: 40px; height: 40px; display: grid; place-items: center; background: var(--surface-2); border-radius: 12px; flex-shrink: 0; }
.bld-title { flex: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.desc, .io, .warn { margin: 0; }
.io { font-variant-numeric: tabular-nums; }
.pos { color: var(--ok); }
.neg { color: var(--danger); }
.warn { color: var(--warn); }
.bld-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
.switch { display: inline-flex; align-items: center; gap: 6px; font-size: .82rem; color: var(--muted); cursor: pointer; }
.switch input { accent-color: var(--primary); width: 16px; height: 16px; }
.locked { display: flex; align-items: center; gap: 12px; border-style: dashed; box-shadow: none; background: transparent; }
</style>
