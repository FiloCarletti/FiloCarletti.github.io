<script setup>
// Una voce del semaforo: barra valore/obiettivo, stato con icona + etichetta (mai solo colore) e consiglio.
import { computed } from 'vue'
import { fmt } from '../lib/analisi.js'

const props = defineProps({ c: { type: Object, required: true } })

const STATO = {
  ok: { icon: '✓', text: 'ok' },
  warn: { icon: '!', text: '' },
  bad: { icon: '‼', text: '' },
}
const stato = computed(() => {
  const s = STATO[props.c.livello]
  if (props.c.livello === 'ok') return { ...s }
  const forte = props.c.livello === 'bad'
  return { ...s, text: props.c.direzione === 'poco' ? (forte ? 'molto basso' : 'basso') : (forte ? 'molto alto' : 'alto') }
})
// La barra arriva al 150% dell'obiettivo; la tacca segna l'obiettivo.
const SCALA = 1.5
const pct = computed(() => Math.min(100, (props.c.valore / (props.c.obiettivo * SCALA)) * 100))
const tacca = `${100 / SCALA}%`
const prefisso = computed(() => (props.c.tipo === 'min' ? '≥' : props.c.tipo === 'max' ? '≤' : '≈'))
</script>

<template>
  <div class="ctl" :class="c.livello">
    <div class="row-between top">
      <span class="lbl">{{ c.label }}</span>
      <span class="stato"><span class="ico" aria-hidden="true">{{ stato.icon }}</span>{{ stato.text }}</span>
    </div>
    <div class="bar" role="img" :aria-label="`${c.label}: ${fmt(c.valore)} ${c.unit}, obiettivo ${prefisso} ${fmt(c.obiettivo)}`">
      <div class="fill" :style="{ width: `${pct}%` }" />
      <div class="tick" :style="{ left: tacca }" />
    </div>
    <div class="row-between small muted">
      <span><strong class="val">{{ fmt(c.valore) }}</strong> {{ c.unit }}</span>
      <span>obiettivo {{ prefisso }} {{ fmt(c.obiettivo) }}</span>
    </div>
    <p v-if="c.consiglio" class="tip small">{{ c.consiglio }}</p>
  </div>
</template>

<style scoped>
.ctl { display: flex; flex-direction: column; gap: 5px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.ctl:last-child { border-bottom: 0; }
.top { gap: 6px; }
.lbl { font-weight: 600; }
.stato { display: inline-flex; align-items: center; gap: 5px; font-size: .8rem; font-weight: 600; color: var(--muted); }
.ico { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; font-size: .72rem; color: #fff; background: var(--muted); }
.ok .ico { background: var(--ok); }
.warn .ico { background: var(--warn); }
.bad .ico { background: var(--danger); }
.bar { position: relative; height: 8px; border-radius: 4px; background: var(--surface-2); }
.fill { height: 100%; border-radius: 4px; background: var(--muted); }
.ok .fill { background: var(--ok); }
.warn .fill { background: var(--warn); }
.bad .fill { background: var(--danger); }
.tick { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--text); border-radius: 1px; }
.val { color: var(--text); }
.tip { margin: 2px 0 0; color: var(--text); }
</style>
