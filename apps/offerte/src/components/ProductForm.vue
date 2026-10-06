<script setup>
// Nuovo prodotto da seguire, modifica, oppure "Segui" partendo da un'offerta (campi già compilati).
// L'anteprima mostra subito quali offerte attive riconoscerebbe, per regolare parole ed esclusioni.
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fmtEuro, toast } from '@shared'
import Modal from './Modal.vue'
import { closeProdotto, deleteProdotto, previewMatches, saveProdotto, useData } from '../store.js'
import { parseList } from '../lib/match.js'
import { numText, parseNum } from '../lib/util.js'

const { ui, categorie, smById } = useData()
const route = useRoute()
const router = useRouter()

const p = ui.prodotto?.prodotto ?? null
const from = ui.prodotto?.fromOffer ?? null
const form = reactive({
  nome: p?.nome ?? from?.nome ?? '',
  parole: (p?.parole ?? []).join(', '),
  escludi: (p?.escludi ?? []).join(', '),
  marca: p?.marca ?? '',
  categoria: p?.categoria ?? from?.categoria ?? '',
  prezzo_max: numText(p?.prezzo_max),
  prezzo_per: p?.prezzo_per ?? (from?.unita === 'kg' || from?.unita === 'l' ? from.unita : 'pz'),
  note: p?.note ?? '',
  attivo: p?.attivo ?? true,
})
const busy = ref(false)
const title = p ? 'Modifica prodotto' : from ? 'Segui il prodotto' : 'Nuovo prodotto'

const draft = computed(() => ({
  nome: form.nome, parole: parseList(form.parole), escludi: parseList(form.escludi), marca: form.marca.trim(),
}))
const preview = computed(() => previewMatches(draft.value))
const previewText = computed(() => preview.value.slice(0, 6)
  .map((o) => `${o.nome}${o.marca ? ` ${o.marca}` : ''} (${smById.value.get(o.supermercato_id)?.nome ?? '—'}, ${fmtEuro(o.prezzo)})`))

async function save() {
  const nome = form.nome.replace(/\s+/g, ' ').trim()
  if (!nome) return toast.error('Dai un nome al prodotto.')
  const soglia = parseNum(form.prezzo_max)
  if (Number.isNaN(soglia) || (soglia != null && soglia <= 0)) return toast.error('Il prezzo massimo non è un numero valido.')
  busy.value = true
  try {
    const saved = await saveProdotto({
      nome, parole: draft.value.parole, escludi: draft.value.escludi, marca: draft.value.marca,
      categoria: form.categoria.trim(), prezzo_max: soglia, prezzo_per: form.prezzo_per, note: form.note.trim(), attivo: form.attivo,
    }, p?.id)
    toast.ok(p ? 'Prodotto aggiornato' : `Ora segui “${saved.nome}”`)
    closeProdotto()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!confirm(`Smettere di seguire “${p.nome}”? Le offerte e lo storico dei prezzi restano.`)) return
  busy.value = true
  try {
    await deleteProdotto(p.id)
    toast.ok('Prodotto eliminato')
    closeProdotto()
    if (route.params.id === p.id) router.push('/prodotti')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Modal :title="title" @close="closeProdotto">
    <form id="prodotto-form" class="stack" @submit.prevent="save">
      <label class="field">
        <span>Nome *</span>
        <input v-model="form.nome" class="input" required maxlength="80" placeholder="Es. Passata di pomodoro" />
      </label>
      <label class="field">
        <span>Anche come (separati da virgola)</span>
        <input v-model="form.parole" class="input" placeholder="Es. polpa di pomodoro, pelati" />
      </label>
      <div class="two">
        <label class="field">
          <span>Solo la marca</span>
          <input v-model="form.marca" class="input" maxlength="80" :placeholder="from?.marca || 'Qualsiasi'" />
        </label>
        <label class="field">
          <span>Escludi</span>
          <input v-model="form.escludi" class="input" placeholder="Es. biologico, sugo" />
        </label>
      </div>
      <button v-if="from?.marca && form.marca !== from.marca" type="button" class="hint-btn small" @click="form.marca = from.marca">Solo {{ from.marca }}</button>

      <div class="preview small" :class="{ none: !preview.length }">
        <template v-if="!form.nome.trim()">Scrivi un nome per vedere quali offerte riconosce.</template>
        <template v-else-if="!preview.length">Nessuna offerta attiva riconosciuta per ora: la prossima ricerca cercherà “{{ form.nome.trim() }}”.</template>
        <template v-else>
          Riconosce <strong>{{ preview.length }}</strong> {{ preview.length === 1 ? 'offerta attiva' : 'offerte attive' }}:
          {{ previewText.join(' · ') }}<template v-if="preview.length > previewText.length"> …</template>
        </template>
      </div>

      <div class="two">
        <label class="field">
          <span>Buon prezzo fino a (€)</span>
          <input v-model="form.prezzo_max" class="input" inputmode="decimal" placeholder="Facoltativo" />
        </label>
        <label class="field">
          <span>Prezzo al</span>
          <select v-model="form.prezzo_per" class="select">
            <option value="pz">pezzo / confezione</option>
            <option value="kg">kg</option>
            <option value="l">litro</option>
          </select>
        </label>
      </div>
      <label class="field">
        <span>Categoria</span>
        <input v-model="form.categoria" class="input" list="offerte-categorie" maxlength="60" placeholder="Es. Dispensa" />
        <datalist id="offerte-categorie"><option v-for="c in categorie" :key="c" :value="c" /></datalist>
      </label>
      <label class="field">
        <span>Note</span>
        <input v-model="form.note" class="input" maxlength="500" placeholder="Es. formato famiglia" />
      </label>
      <label class="check">
        <input v-model="form.attivo" type="checkbox" />
        <span>Attivo <span class="muted small">— in pausa non viene cercato né segnato nelle offerte</span></span>
      </label>
    </form>
    <template #foot>
      <button v-if="p" type="button" class="btn btn-danger" :disabled="busy" @click="remove">Elimina</button>
      <span class="spacer" />
      <button type="button" class="btn" @click="closeProdotto">Annulla</button>
      <button type="submit" form="prodotto-form" class="btn btn-primary" :disabled="busy">{{ busy ? 'Salvo…' : p ? 'Salva' : 'Segui' }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 420px) { .two { grid-template-columns: 1fr; } }
.preview { padding: 8px 10px; border-radius: var(--radius); background: var(--primary-soft); color: var(--text); }
.preview.none { background: var(--surface-2); color: var(--muted); }
.check { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
.check input { margin-top: 4px; }
.hint-btn { align-self: flex-start; margin-top: -6px; padding: 0; border: 0; background: none; color: var(--primary); font: inherit; cursor: pointer; }
</style>
