<script setup>
import { fmtMoney } from '../lib/money.js'

// Sopra i 10.000 € i centesimi non aiutano e non stanno nel riquadro su telefono (il valore completo è nel tooltip).
const short = (v, sign = false) => (Math.abs(v) >= 10000 ? fmtMoney(Math.round(v), 'EUR', { sign }).replace(/,00(?=\s)/, '') : fmtMoney(v, 'EUR', { sign }))

defineProps({
  t: { type: Object, required: true }, // { entrate, uscite, netto, n, altre }
  hint: { type: String, default: '' },
})
</script>

<template>
  <div class="totals">
    <div class="tile">
      <span class="lab">Entrate</span>
      <strong class="val in" :title="fmtMoney(t.entrate)">{{ short(t.entrate) }}</strong>
    </div>
    <div class="tile">
      <span class="lab">Uscite</span>
      <strong class="val out" :title="fmtMoney(t.uscite)">{{ short(t.uscite) }}</strong>
    </div>
    <div class="tile">
      <span class="lab">Netto</span>
      <strong class="val" :class="t.netto < 0 ? 'out' : t.netto > 0 ? 'in' : ''" :title="fmtMoney(t.netto, 'EUR', { sign: true })">{{ short(t.netto, true) }}</strong>
    </div>
  </div>
  <p v-if="hint || t.altre" class="muted small foot">
    {{ hint }}<template v-if="t.altre">{{ hint ? ' · ' : '' }}{{ t.altre }} movimenti in altre valute esclusi dai totali</template>
  </p>
</template>

<style scoped>
.totals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 10px 12px; display: flex; flex-direction: column; min-width: 0; }
.lab { font-size: .78rem; color: var(--muted); font-weight: 500; }
.val { font-size: 1.2rem; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.val.in { color: var(--ok); }
.val.out { color: var(--danger); }
.foot { margin: -4px 0 0; }
@media (max-width: 420px) { .val { font-size: 1rem; letter-spacing: -.01em; } .tile { padding: 8px 9px; } }
</style>
