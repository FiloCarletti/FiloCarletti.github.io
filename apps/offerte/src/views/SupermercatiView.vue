<script setup>
// Supermercati seguiti: la ricerca (Claude o routine) guarda solo quelli attivi, partendo dal link al volantino.
import { computed, onMounted, reactive, ref } from 'vue'
import { toast, useSpace } from '@shared'
import Modal from '../components/Modal.vue'
import { deleteSupermercato, saveSupermercato, useData } from '../store.js'
import { fmtShort, today } from '../lib/dates.js'
import { safeUrl } from '../lib/util.js'

const { state, supermercati, load } = useData()
const { canWrite } = useSpace()
onMounted(load)

const t = today()
const stats = computed(() => {
  const out = new Map()
  for (const o of state.offerte) {
    const s = out.get(o.supermercato_id) ?? { oggi: 0, tot: 0, visto: null }
    s.tot++
    if (o.valido_da <= t) s.oggi++
    if (!s.visto || o.visto_il > s.visto) s.visto = o.visto_il
    out.set(o.supermercato_id, s)
  }
  return out
})

/* ---------- modulo ---------- */

const editing = ref(null) // null | { id?: uuid }
const form = reactive({ nome: '', zona: '', volantino_url: '', note: '', attivo: true })
const busy = ref(false)
function open(s = null) {
  Object.assign(form, {
    nome: s?.nome ?? '', zona: s?.zona ?? '', volantino_url: s?.volantino_url ?? '', note: s?.note ?? '', attivo: s?.attivo ?? true,
  })
  editing.value = { id: s?.id ?? null }
}
async function save() {
  const nome = form.nome.replace(/\s+/g, ' ').trim()
  if (!nome) return toast.error('Scrivi il nome del supermercato.')
  if (form.volantino_url.trim() && !safeUrl(form.volantino_url)) return toast.error('Il link deve iniziare con http:// o https://')
  busy.value = true
  try {
    await saveSupermercato({
      nome, zona: form.zona.trim(), volantino_url: form.volantino_url.trim(), note: form.note.trim(), attivo: form.attivo,
    }, editing.value.id)
    toast.ok(editing.value.id ? 'Supermercato aggiornato' : 'Supermercato aggiunto')
    editing.value = null
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
async function remove() {
  const s = state.supermercati.find((x) => x.id === editing.value.id)
  if (!confirm(`Eliminare “${s.nome}”? Spariscono anche le sue offerte e il suo storico prezzi. Per smettere solo di cercarlo, mettilo in pausa.`)) return
  busy.value = true
  try {
    await deleteSupermercato(s.id)
    toast.ok('Supermercato eliminato')
    editing.value = null
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="stack">
    <div class="row-between">
      <h2 style="margin: 0">Supermercati</h2>
      <button v-if="canWrite" type="button" class="btn btn-primary btn-sm" @click="open()">＋ Supermercato</button>
    </div>
    <p class="muted small" style="margin: -4px 0 0">
      La ricerca guarda solo quelli attivi. Nel link metti la pagina del volantino più facile da leggere:
      il sito della catena o un aggregatore come PromoQui, DoveConviene o Tiendeo.
    </p>

    <div v-if="!state.loaded" class="center"><div v-if="state.loading" class="spinner" /></div>
    <div v-else-if="!supermercati.length" class="card empty stack">
      <p style="margin: 0">Nessun supermercato. Aggiungi quelli dove fai la spesa, con la zona e il link al volantino.</p>
      <div v-if="canWrite"><button type="button" class="btn btn-primary" @click="open()">＋ Aggiungi un supermercato</button></div>
    </div>

    <section v-else class="card list">
      <div v-for="s in supermercati" :key="s.id" class="srow" :class="{ off: !s.attivo }">
        <div class="sinfo">
          <div class="row" style="gap: 6px">
            <strong>{{ s.nome }}</strong>
            <span v-if="!s.attivo" class="badge">in pausa</span>
          </div>
          <span v-if="s.zona" class="muted small">{{ s.zona }}</span>
          <span class="small">
            <span v-if="stats.get(s.id)?.tot" class="muted">
              {{ stats.get(s.id).oggi }} offerte valide oggi<template v-if="stats.get(s.id).tot > stats.get(s.id).oggi">, {{ stats.get(s.id).tot - stats.get(s.id).oggi }} in arrivo</template>
            </span>
            <span v-else class="muted">nessuna offerta attiva</span>
            <span v-if="stats.get(s.id)?.visto" class="muted"> · ultima ricerca {{ fmtShort(stats.get(s.id).visto) }}</span>
          </span>
          <span v-if="s.note" class="small">{{ s.note }}</span>
        </div>
        <div class="sact">
          <a v-if="safeUrl(s.volantino_url)" :href="safeUrl(s.volantino_url)" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost">Volantino ↗</a>
          <button v-if="canWrite" type="button" class="btn btn-sm" @click="open(s)">Modifica</button>
        </div>
      </div>
    </section>

    <Modal v-if="editing" :title="editing.id ? 'Modifica supermercato' : 'Nuovo supermercato'" @close="editing = null">
      <form id="sm-form" class="stack" @submit.prevent="save">
        <label class="field"><span>Nome *</span><input v-model="form.nome" class="input" required maxlength="80" placeholder="Es. Esselunga" /></label>
        <label class="field"><span>Zona o punto vendita</span><input v-model="form.zona" class="input" maxlength="120" placeholder="Es. Milano, viale Piave" /></label>
        <label class="field">
          <span>Link al volantino</span>
          <input v-model="form.volantino_url" class="input" type="url" maxlength="500" placeholder="https://…" />
        </label>
        <label class="field"><span>Note per la ricerca</span><input v-model="form.note" class="input" maxlength="500" placeholder="Es. il volantino cambia il giovedì" /></label>
        <label class="check">
          <input v-model="form.attivo" type="checkbox" />
          <span>Attivo <span class="muted small">— in pausa non viene cercato, le offerte restano</span></span>
        </label>
      </form>
      <template #foot>
        <button v-if="editing.id" type="button" class="btn btn-danger" :disabled="busy" @click="remove">Elimina</button>
        <span class="spacer" />
        <button type="button" class="btn" @click="editing = null">Annulla</button>
        <button type="submit" form="sm-form" class="btn btn-primary" :disabled="busy">{{ busy ? 'Salvo…' : 'Salva' }}</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.center { display: flex; justify-content: center; padding: 40px 0; }
.list { display: flex; flex-direction: column; padding-top: 4px; padding-bottom: 4px; }
.srow { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.srow:last-child { border-bottom: 0; }
.srow.off .sinfo { opacity: .7; }
.sinfo { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 2px; }
.sact { display: flex; gap: 6px; }
.check { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
.check input { margin-top: 4px; }
</style>
