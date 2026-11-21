<script setup>
// Obiettivi giornalieri e settimanali (di partenza: linee guida CREA/LARN per un adulto) e profilo.
import { onMounted, reactive, ref, watch } from 'vue'
import { toast, useSpace } from '@shared'
import { load, salvaObiettivi, state } from '../store.js'
import { DEFAULT_OBIETTIVI } from '../lib/analisi.js'

const { canWrite } = useSpace()
onMounted(() => load())

const GIORNO = [
  { key: 'kcal', label: 'Energia', unit: 'kcal', hint: 'circa' },
  { key: 'proteine_g', label: 'Proteine', unit: 'g', hint: 'almeno' },
  { key: 'fibre_min_g', label: 'Fibre', unit: 'g', hint: 'almeno' },
  { key: 'zuccheri_max_g', label: 'Zuccheri liberi', unit: 'g', hint: 'al massimo' },
  { key: 'saturi_max_g', label: 'Grassi saturi', unit: 'g', hint: 'al massimo' },
  { key: 'sodio_max_mg', label: 'Sodio', unit: 'mg', hint: 'al massimo' },
  { key: 'verdura_min_g', label: 'Verdura', unit: 'g', hint: 'almeno' },
  { key: 'frutta_min_g', label: 'Frutta', unit: 'g', hint: 'almeno' },
]
const SETTIMANA = [
  { key: 'legumi_min_sett', label: 'Legumi', hint: 'almeno' },
  { key: 'pesce_min_sett', label: 'Pesce', hint: 'almeno' },
  { key: 'carne_rossa_max_sett', label: 'Carne rossa', hint: 'al massimo' },
  { key: 'processata_max_sett', label: 'Salumi e carni lavorate', hint: 'al massimo' },
  { key: 'fritti_max_sett', label: 'Fritti e impanati', hint: 'al massimo' },
]
const PROFILO = [
  { key: 'sesso', label: 'Sesso', type: 'select', options: ['', 'M', 'F'] },
  { key: 'eta', label: 'Età', type: 'number' },
  { key: 'peso_kg', label: 'Peso (kg)', type: 'number' },
  { key: 'altezza_cm', label: 'Altezza (cm)', type: 'number' },
  { key: 'attivita', label: 'Attività fisica', type: 'select', options: ['', 'sedentaria', 'leggera', 'moderata', 'intensa'] },
  { key: 'obiettivo', label: 'Obiettivo', type: 'select', options: ['', 'dimagrire', 'mantenimento', 'massa'] },
]

const f = reactive({ ...DEFAULT_OBIETTIVI, profilo: {} })
const fill = () => Object.assign(f, structuredClone({ ...DEFAULT_OBIETTIVI, ...state.obiettivi, profilo: { ...(state.obiettivi.profilo ?? {}) } }))
watch(() => state.obiettivi, fill, { immediate: true })
const busy = ref(false)

async function save() {
  busy.value = true
  try {
    const out = { ...f, profilo: Object.fromEntries(Object.entries(f.profilo).filter(([, v]) => v !== '' && v != null)) }
    for (const k of [...GIORNO, ...SETTIMANA].map((x) => x.key)) out[k] = Math.max(0, Math.round(Number(out[k]) || 0))
    for (const k of ['eta', 'peso_kg', 'altezza_cm']) if (out.profilo[k] != null) out.profilo[k] = Number(out.profilo[k])
    await salvaObiettivi(out)
    toast.ok('Obiettivi salvati')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="stack" @submit.prevent="save">
    <p class="muted small" style="margin: 0">
      Valori di partenza dalle linee guida per un adulto. Con età, peso, altezza e attività Claude può calcolarti obiettivi su misura.
    </p>
    <fieldset class="card" :disabled="!canWrite">
      <h2>Ogni giorno</h2>
      <div class="grid3">
        <label v-for="x in GIORNO" :key="x.key" class="field">
          <span>{{ x.label }} <em class="muted">{{ x.hint }}, {{ x.unit }}</em></span>
          <input v-model="f[x.key]" class="input" type="number" min="0" inputmode="numeric">
        </label>
      </div>
    </fieldset>
    <fieldset class="card" :disabled="!canWrite">
      <h2>Porzioni a settimana</h2>
      <div class="grid3">
        <label v-for="x in SETTIMANA" :key="x.key" class="field">
          <span>{{ x.label }} <em class="muted">{{ x.hint }}</em></span>
          <input v-model="f[x.key]" class="input" type="number" min="0" inputmode="numeric">
        </label>
      </div>
    </fieldset>
    <fieldset class="card" :disabled="!canWrite">
      <h2>Profilo</h2>
      <div class="grid3">
        <label v-for="x in PROFILO" :key="x.key" class="field">
          <span>{{ x.label }}</span>
          <select v-if="x.type === 'select'" v-model="f.profilo[x.key]" class="select">
            <option v-for="o in x.options" :key="o" :value="o">{{ o || '—' }}</option>
          </select>
          <input v-else v-model="f.profilo[x.key]" class="input" type="number" min="0" step="any" inputmode="decimal">
        </label>
      </div>
      <label class="field" style="margin-top: 12px"><span>Note (intolleranze, preferenze, cosa non ti piace)</span>
        <textarea v-model="f.note" class="textarea" maxlength="2000" />
      </label>
    </fieldset>
    <div v-if="canWrite" class="row"><span class="spacer" /><button class="btn btn-primary" :disabled="busy">Salva obiettivi</button></div>
  </form>
</template>

<style scoped>
fieldset { margin: 0; min-width: 0; }
.grid3 { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
em { font-style: normal; font-weight: 400; }
</style>
