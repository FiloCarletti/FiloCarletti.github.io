<script setup>
// Inserimento o modifica di una mano dal vivo: per ogni squadra burraco puliti e sporchi, pozzetto,
// carte in tavola e in mano (ed eventuale rettifica); in alto chi ha chiuso.
import { computed, reactive, ref } from 'vue'
import { emptyRound, fmtPts, roundPoints, TEAMS, usesSemi } from '../lib/score.js'
import Stepper from './Stepper.vue'

const props = defineProps({
  partita: { type: Object, required: true },
  initial: { type: Object, default: null }, // mano da modificare
  numero: { type: Number, required: true },
  totals: { type: Array, default: () => [0, 0] }, // totali prima di questa mano
  saving: Boolean,
})
const emit = defineEmits(['save', 'cancel', 'delete'])

const f = reactive({ ...emptyRound(), ...(props.initial ?? {}) })
const extra = ref(!!(f.extra_a || f.extra_b || f.note))
const names = computed(() => [props.partita.nome_a, props.partita.nome_b])

function setCloser(t) {
  f.chiusura = t
  if (t) {
    f[`mano_${t}`] = 0
    f[`pozzetto_${t}`] = true
  }
}

const pts = computed(() => roundPoints(f, props.partita))
const after = computed(() => props.totals.map((x, i) => x + pts.value[i].totale))
const warnings = computed(() => {
  const w = []
  for (const [i, t] of TEAMS.entries()) {
    if (f[`tavola_${t}`] % 5 || f[`mano_${t}`] % 5) w.push(`${names.value[i]}: i punti delle carte di solito sono multipli di 5`)
  }
  if (f.chiusura) {
    const t = f.chiusura
    if (!f[`puliti_${t}`] && !f[`sporchi_${t}`] && !(usesSemi(props.partita) && f[`semipuliti_${t}`])) w.push(`Per chiudere ${names.value[TEAMS.indexOf(t)]} doveva avere almeno un burraco`)
  }
  return w
})

function submit() {
  const out = { numero: props.numero, chiusura: f.chiusura, note: (f.note ?? '').trim() }
  for (const t of TEAMS) {
    for (const k of ['puliti', 'semipuliti', 'sporchi', 'tavola', 'mano', 'extra']) out[`${k}_${t}`] = Math.round(Number(f[`${k}_${t}`]) || 0)
    out[`pozzetto_${t}`] = !!f[`pozzetto_${t}`]
  }
  emit('save', out)
}
</script>

<template>
  <div class="overlay" role="dialog" aria-modal="true" :aria-label="`Mano ${numero}`" @click.self="emit('cancel')">
    <form class="sheet card stack" @submit.prevent="submit">
      <div class="row-between">
        <h2 style="margin: 0">{{ initial ? 'Modifica' : 'Nuova' }} mano {{ numero }}</h2>
        <button type="button" class="btn btn-ghost btn-sm" aria-label="Chiudi" @click="emit('cancel')">✕</button>
      </div>

      <div class="field">
        <span>Chi ha chiuso?</span>
        <div class="seg" role="radiogroup" aria-label="Chiusura">
          <button type="button" role="radio" :aria-checked="f.chiusura === 'a'" :class="{ on: f.chiusura === 'a' }" @click="setCloser('a')">{{ names[0] }}</button>
          <button type="button" role="radio" :aria-checked="f.chiusura === 'b'" :class="{ on: f.chiusura === 'b' }" @click="setCloser('b')">{{ names[1] }}</button>
          <button type="button" role="radio" :aria-checked="!f.chiusura" :class="{ on: !f.chiusura }" @click="setCloser(null)">Nessuno</button>
        </div>
      </div>

      <div class="cols">
        <div v-for="(t, i) in TEAMS" :key="t" class="col stack" :class="`t${i}`">
          <h3 class="team-name">{{ names[i] }}</h3>
          <div class="group">
            <span class="glabel">Base</span>
            <Stepper v-model="f[`puliti_${t}`]" compact label="Burraco puliti" />
            <Stepper v-if="usesSemi(partita)" v-model="f[`semipuliti_${t}`]" compact label="Semipuliti" />
            <Stepper v-model="f[`sporchi_${t}`]" compact label="Burraco sporchi" />
            <label class="check small">
              <input v-model="f[`pozzetto_${t}`]" type="checkbox" :disabled="f.chiusura === t" />
              Pozzetto preso
            </label>
          </div>
          <div class="group">
            <span class="glabel">Carte</span>
            <Stepper v-model="f[`tavola_${t}`]" compact label="In tavola" :step="5" :min="-2000" />
            <Stepper v-model="f[`mano_${t}`]" compact label="In mano (−)" :step="5" />
          </div>
          <Stepper v-if="extra" v-model="f[`extra_${t}`]" compact label="Rettifica" :step="5" :min="-5000" />
          <div class="preview small">
            <div><span class="muted">Base</span> <strong>{{ fmtPts(pts[i].base) }}</strong></div>
            <div><span class="muted">Carte</span> <strong>{{ fmtPts(pts[i].carte) }}</strong></div>
            <div class="tot"><span class="muted">Mano</span> <strong>{{ fmtPts(pts[i].totale) }}</strong></div>
            <div class="muted">Totale {{ after[i] }}</div>
          </div>
        </div>
      </div>

      <button v-if="!extra" type="button" class="btn btn-ghost btn-sm" style="align-self: flex-start" @click="extra = true">+ Rettifiche e note</button>
      <label v-else class="field"><span>Note</span><input v-model="f.note" class="input" maxlength="300" placeholder="Facoltative" /></label>

      <ul v-if="warnings.length" class="warn small">
        <li v-for="w in warnings" :key="w">{{ w }}</li>
      </ul>

      <div class="row">
        <button v-if="initial" type="button" class="btn btn-ghost btn-danger btn-sm" @click="emit('delete')">Elimina</button>
        <span class="spacer" />
        <button type="button" class="btn" @click="emit('cancel')">Annulla</button>
        <button class="btn btn-primary" :disabled="saving">Salva mano</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / .45); display: flex; align-items: flex-end; justify-content: center; }
.sheet { width: 100%; max-width: 560px; max-height: 94vh; overflow: auto; border-radius: var(--radius-lg) var(--radius-lg) 0 0; padding: 14px 12px; }
@media (min-width: 600px) { .overlay { align-items: center; } .sheet { border-radius: var(--radius-lg); } }
.seg { display: flex; gap: 4px; padding: 3px; background: var(--surface-2); border-radius: var(--radius); }
.seg button { flex: 1; min-width: 0; padding: 8px 6px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.col { gap: 8px; min-width: 0; }
.team-name { margin: 0; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 4px; border-bottom: 3px solid var(--primary); }
.t1 .team-name { border-color: var(--warn); }
.group { display: flex; flex-direction: column; gap: 6px; padding: 8px 6px; border-radius: var(--radius); background: var(--surface-2); }
.glabel { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.check { display: flex; align-items: center; gap: 6px; justify-content: center; }
.preview { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; padding: 6px 4px 0; }
.preview .tot strong { color: var(--primary); }
.warn { margin: 0; padding: 8px 8px 8px 24px; border-radius: var(--radius); background: color-mix(in srgb, var(--warn) 12%, transparent); color: var(--warn); }
</style>
