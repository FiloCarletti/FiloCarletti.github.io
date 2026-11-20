<script setup>
// Scheda per aggiungere o correggere un pasto a mano. Gli alimenti stimati da Claude restano com'erano.
import { computed, reactive, ref } from 'vue'
import { toast } from '@shared'
import Modal from './Modal.vue'
import { GRUPPI, NUTRIENTI, TIPI } from '../lib/analisi.js'
import { eliminaPasto, salvaPasto, ui } from '../store.js'
import { today } from '../lib/dates.js'

const src = ui.pasto
const f = reactive({
  data: today(), tipo: 'pranzo', luogo: '', descrizione: '', commento: '', fritto: false, punteggio: null,
  fonte: 'manuale', alimenti: [], gruppi: {},
  ...Object.fromEntries(NUTRIENTI.map((n) => [n.key, null])),
  ...src,
})
const gruppi = reactive(Object.fromEntries(Object.keys(GRUPPI).map((k) => [k, f.gruppi?.[k] ?? null])))
const showGruppi = ref(false)
const busy = ref(false)
const isNew = computed(() => !src?.id)

const close = () => { ui.pasto = null }
const numOrNull = (v) => (v === '' || v == null ? null : Number(v))

async function save() {
  busy.value = true
  try {
    const out = { ...f, gruppi: Object.fromEntries(Object.entries(gruppi).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) }
    for (const n of NUTRIENTI) out[n.key] = numOrNull(out[n.key])
    out.punteggio = numOrNull(out.punteggio)
    await salvaPasto(out)
    toast.ok('Salvato')
    close()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
async function remove() {
  if (!confirm('Eliminare questo pasto?')) return
  busy.value = true
  try { await eliminaPasto(src.id); toast.ok('Eliminato'); close() } catch (e) { toast.error(e) } finally { busy.value = false }
}
</script>

<template>
  <Modal :title="isNew ? 'Nuovo pasto' : 'Modifica pasto'" @close="close">
    <div class="two">
      <label class="field"><span>Data</span><input v-model="f.data" class="input" type="date" required></label>
      <label class="field"><span>Pasto</span>
        <select v-model="f.tipo" class="select"><option v-for="t in TIPI" :key="t.key" :value="t.key">{{ t.label }}</option></select>
      </label>
    </div>
    <label class="field"><span>Dove</span><input v-model="f.luogo" class="input" placeholder="mensa, casa, fuori…" maxlength="60"></label>
    <label class="field"><span>Cosa hai mangiato</span><textarea v-model="f.descrizione" class="textarea" maxlength="1000" placeholder="Penne al pomodoro, pollo arrosto con patate, insalata, banana" /></label>
    <div class="nut">
      <label v-for="n in NUTRIENTI" :key="n.key" class="field"><span>{{ n.label }} ({{ n.unit }})</span>
        <input v-model="f[n.key]" class="input" type="number" min="0" step="any" inputmode="decimal">
      </label>
    </div>
    <button type="button" class="btn btn-ghost btn-sm toggle" @click="showGruppi = !showGruppi">
      {{ showGruppi ? '▾' : '▸' }} Grammi per gruppo alimentare
    </button>
    <div v-if="showGruppi" class="nut">
      <label v-for="(gr, k) in GRUPPI" :key="k" class="field"><span>{{ gr.label }}</span>
        <input v-model="gruppi[k]" class="input" type="number" min="0" step="any" inputmode="decimal">
      </label>
    </div>
    <div class="two">
      <label class="field"><span>Qualità (1–10)</span><input v-model="f.punteggio" class="input" type="number" min="1" max="10"></label>
      <label class="check"><input v-model="f.fritto" type="checkbox"> Fritto o impanato</label>
    </div>
    <label class="field"><span>Commento</span><textarea v-model="f.commento" class="textarea" maxlength="2000" /></label>
    <template #foot>
      <button v-if="!isNew" type="button" class="btn btn-danger" :disabled="busy" @click="remove">Elimina</button>
      <span class="spacer" />
      <button type="button" class="btn" @click="close">Annulla</button>
      <button type="button" class="btn btn-primary" :disabled="busy || !f.data" @click="save">Salva</button>
    </template>
  </Modal>
</template>

<style scoped>
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: end; }
.nut { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
.check { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; }
.toggle { align-self: flex-start; }
</style>
