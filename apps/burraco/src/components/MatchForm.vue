<script setup>
// Dati di una partita dal vivo: squadre, obiettivo, data e valori dei punti.
import { reactive, ref } from 'vue'
import { todayISO } from '@shared'
import { DEFAULT_VALUES, GOAL_PRESETS } from '../lib/score.js'

const props = defineProps({
  initial: { type: Object, default: null },
  saving: Boolean,
  submitLabel: { type: String, default: 'Crea partita' },
})
const emit = defineEmits(['save', 'cancel'])

const f = reactive({
  nome_a: 'Noi', nome_b: 'Loro', giocatori_a: '', giocatori_b: '', obiettivo: 2005, data: todayISO(), note: '',
  ...DEFAULT_VALUES,
  ...(props.initial ?? {}),
})
const custom = ref(!GOAL_PRESETS.includes(f.obiettivo))
const semi = ref(f.punti_semipulito != null)
if (f.punti_semipulito == null) f.punti_semipulito = 150
const advanced = ref(Object.keys(DEFAULT_VALUES).some((k) => f[k] !== DEFAULT_VALUES[k]))

function submit() {
  const n = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)))
  emit('save', {
    nome_a: f.nome_a.trim() || 'Noi',
    nome_b: f.nome_b.trim() || 'Loro',
    giocatori_a: f.giocatori_a.trim(),
    giocatori_b: f.giocatori_b.trim(),
    obiettivo: n(f.obiettivo, 100, 20000),
    data: f.data || todayISO(),
    note: f.note.trim(),
    punti_pulito: n(f.punti_pulito, 0, 1000),
    punti_sporco: n(f.punti_sporco, 0, 1000),
    punti_chiusura: n(f.punti_chiusura, 0, 1000),
    penalita_pozzetto: n(f.penalita_pozzetto, 0, 1000),
    punti_semipulito: semi.value ? n(f.punti_semipulito, 0, 1000) : null,
  })
}
</script>

<template>
  <form class="stack" @submit.prevent="submit">
    <div class="teams">
      <div class="stack team">
        <label class="field"><span>Squadra 1</span><input v-model="f.nome_a" class="input" maxlength="40" required /></label>
        <label class="field"><span>Giocatori</span><input v-model="f.giocatori_a" class="input" maxlength="80" placeholder="es. Anna e Marco" /></label>
      </div>
      <div class="stack team">
        <label class="field"><span>Squadra 2</span><input v-model="f.nome_b" class="input" maxlength="40" required /></label>
        <label class="field"><span>Giocatori</span><input v-model="f.giocatori_b" class="input" maxlength="80" placeholder="es. Luca e Sara" /></label>
      </div>
    </div>

    <div class="field">
      <span>Obiettivo</span>
      <div class="seg" role="radiogroup" aria-label="Obiettivo">
        <button v-for="g in GOAL_PRESETS" :key="g" type="button" role="radio" :aria-checked="!custom && f.obiettivo === g" :class="{ on: !custom && f.obiettivo === g }" @click="custom = false; f.obiettivo = g">{{ g }}</button>
        <button type="button" role="radio" :aria-checked="custom" :class="{ on: custom }" @click="custom = true">Altro</button>
      </div>
      <input v-if="custom" v-model.number="f.obiettivo" class="input narrow" type="number" min="100" max="20000" step="5" aria-label="Obiettivo personalizzato" />
    </div>

    <div class="semi">
      <label class="check">
        <input v-model="semi" type="checkbox" />
        <span><strong>Burraco semipulito</strong> <span class="muted small">· 7 carte naturali consecutive e poi la matta</span></span>
      </label>
      <label v-if="semi" class="row small">
        vale <input v-model.number="f.punti_semipulito" class="input pts" type="number" min="0" max="1000" step="5" aria-label="Punti del burraco semipulito" />
      </label>
    </div>

    <label class="field narrow"><span>Data</span><input v-model="f.data" class="input" type="date" required /></label>

    <button type="button" class="btn btn-ghost btn-sm" style="align-self: flex-start" :aria-expanded="advanced" @click="advanced = !advanced">
      {{ advanced ? '▾' : '▸' }} Valori dei punti
    </button>
    <div v-if="advanced" class="values">
      <label class="field"><span>Burraco pulito</span><input v-model.number="f.punti_pulito" class="input" type="number" min="0" max="1000" step="5" /></label>
      <label class="field"><span>Burraco sporco</span><input v-model.number="f.punti_sporco" class="input" type="number" min="0" max="1000" step="5" /></label>
      <label class="field"><span>Chiusura</span><input v-model.number="f.punti_chiusura" class="input" type="number" min="0" max="1000" step="5" /></label>
      <label class="field"><span>Pozzetto non preso (−)</span><input v-model.number="f.penalita_pozzetto" class="input" type="number" min="0" max="1000" step="5" /></label>
    </div>

    <label class="field"><span>Note</span><input v-model="f.note" class="input" maxlength="500" placeholder="Facoltative" /></label>

    <div class="row" style="justify-content: flex-end">
      <button type="button" class="btn" @click="emit('cancel')">Annulla</button>
      <button class="btn btn-primary" :disabled="saving">{{ submitLabel }}</button>
    </div>
  </form>
</template>

<style scoped>
.teams { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.team { gap: 8px; }
.seg { display: flex; flex-wrap: wrap; gap: 4px; padding: 3px; background: var(--surface-2); border-radius: var(--radius); }
.seg button { flex: 1; padding: 7px 8px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-weight: 500; cursor: pointer; }
.seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.narrow { max-width: 200px; }
input.narrow { margin-top: 6px; }
.semi { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; }
.check { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
.check input { margin-top: 4px; }
.pts { width: 90px; padding: 5px 8px; }
.values { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
@media (max-width: 400px) { .teams { grid-template-columns: 1fr; } }
</style>
