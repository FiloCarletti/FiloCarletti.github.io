<script setup>
import { DEBUG, away } from '../game/store.js'
import { fmt, fmtDuration, resIcon, resName } from '../game/format.js'

const close = () => (away.value = null)
</script>

<template>
  <div class="overlay" @click.self="close">
    <div class="card stack modal" role="dialog" aria-modal="true" aria-labelledby="away-title">
      <h2 id="away-title" style="margin: 0">🌙 Mentre eri via</h2>
      <p class="muted small" style="margin: 0">Sei stato via {{ fmtDuration(away.ms) }}. La rete ha continuato a crescere:<template v-if="DEBUG"> (calcolato in {{ away.calcMs }} ms)</template></p>
      <table class="table small">
        <thead>
          <tr><th>Risorsa</th><th class="num">Prodotti</th><th class="num">Nel deposito</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in away.rows" :key="r.r">
            <td>{{ resIcon(r.r) }} {{ resName(r.r) }}</td>
            <td class="num">{{ fmt(r.made) }}</td>
            <td class="num" :class="r.delta < 0 ? 'neg' : 'pos'">
              {{ r.delta >= 0 ? '+' : '−' }}{{ fmt(Math.abs(r.delta)) }}<span v-if="r.full" title="Deposito pieno: il resto è andato perso"> · pieno</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="away.rows.some((r) => r.full)" class="small warn" style="margin: 0">
        ⚠ Alcuni depositi si sono riempiti: ingrandiscili (⬆) per non sprecare la produzione la prossima volta.
      </p>
      <p v-if="away.ach.length" class="small" style="margin: 0">🏆 Nuovi traguardi: {{ away.ach.map((a) => a.name).join(', ') }}</p>
      <button class="btn btn-primary" style="align-self: flex-end" @click="close">Continua</button>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / .5); }
.modal { width: min(460px, 100%); max-height: calc(100vh - 32px); overflow: auto; }
.pos { color: var(--ok); }
.neg { color: var(--danger); }
.warn { color: var(--warn); }
</style>
