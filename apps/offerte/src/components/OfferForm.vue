<script setup>
// Offerta inserita a mano (passa da offerte_registra: niente doppioni, supermercato creato se manca)
// oppure correzione di un'offerta esistente.
import { reactive, ref } from 'vue'
import { toast } from '@shared'
import Modal from './Modal.vue'
import { closeOfferta, deleteOfferta, registra, saveSupermercato, updateOfferta, useData } from '../store.js'
import { addDays, today } from '../lib/dates.js'
import { numText, parseNum, safeUrl } from '../lib/util.js'

const { ui, supermercati, categorie } = useData()
const o = ui.offerta?.offerta ?? null
const NEW = '__nuovo__'

const form = reactive({
  supermercato_id: o?.supermercato_id ?? supermercati.value.find((s) => s.attivo)?.id ?? NEW,
  supermercato_nuovo: '',
  nome: o?.nome ?? '',
  marca: o?.marca ?? '',
  formato: o?.formato ?? '',
  categoria: o?.categoria ?? '',
  prezzo: numText(o?.prezzo),
  prezzo_pieno: numText(o?.prezzo_pieno),
  prezzo_unitario: numText(o?.prezzo_unitario),
  unita: o?.unita ?? 'kg',
  condizioni: o?.condizioni ?? '',
  valido_da: o?.valido_da ?? today(),
  valido_fino: o?.valido_fino ?? addDays(today(), 6),
  url: o?.url ?? '',
})
const busy = ref(false)

function payload() {
  const nome = form.nome.replace(/\s+/g, ' ').trim()
  if (!nome) throw new Error('Scrivi il nome del prodotto.')
  const prezzo = parseNum(form.prezzo)
  if (!(prezzo > 0)) throw new Error('Il prezzo non è valido.')
  const pieno = parseNum(form.prezzo_pieno)
  if (Number.isNaN(pieno) || (pieno != null && pieno < prezzo)) throw new Error('Il prezzo pieno deve essere maggiore di quello in offerta.')
  const unit = parseNum(form.prezzo_unitario)
  if (Number.isNaN(unit) || (unit != null && unit <= 0)) throw new Error('Il prezzo al kg/litro non è valido.')
  if (!form.valido_da || !form.valido_fino || form.valido_fino < form.valido_da) throw new Error('Controlla le date di validità.')
  if (form.url.trim() && !safeUrl(form.url)) throw new Error('Il link deve iniziare con http:// o https://')
  return {
    nome, marca: form.marca.trim(), formato: form.formato.trim(), categoria: form.categoria.trim(),
    prezzo, prezzo_pieno: pieno === prezzo ? null : pieno, prezzo_unitario: unit, unita: unit != null ? form.unita : null,
    condizioni: form.condizioni.trim(), valido_da: form.valido_da, valido_fino: form.valido_fino, url: form.url.trim(),
  }
}

async function save() {
  busy.value = true
  try {
    const row = payload()
    const nuovoSm = form.supermercato_id === NEW ? form.supermercato_nuovo.replace(/\s+/g, ' ').trim() : ''
    if (form.supermercato_id === NEW && !nuovoSm) throw new Error('Scrivi il nome del supermercato.')
    if (o) {
      const smId = nuovoSm ? (await saveSupermercato({ nome: nuovoSm })).id : form.supermercato_id
      await updateOfferta(o.id, { ...row, supermercato_id: smId })
      toast.ok('Offerta aggiornata')
    } else {
      const sm = nuovoSm ? { supermercato: nuovoSm } : { supermercato_id: form.supermercato_id }
      const res = await registra({ offerte: [{ ...sm, ...row }] }, 'manuale')
      if (res.scartate) throw new Error(`Offerta non salvata: ${res.errori?.[0]?.errore ?? 'dati non validi'}`)
      toast.ok(res.aggiornate ? "C'era già: l'ho aggiornata" : 'Offerta aggiunta')
    }
    closeOfferta()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!confirm(`Eliminare l'offerta “${o.nome}”? Il prezzo resta nello storico.`)) return
  busy.value = true
  try {
    await deleteOfferta(o.id)
    toast.ok('Offerta eliminata')
    closeOfferta()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Modal :title="o ? 'Modifica offerta' : 'Nuova offerta'" @close="closeOfferta">
    <form id="offerta-form" class="stack" @submit.prevent="save">
      <label class="field">
        <span>Supermercato *</span>
        <select v-model="form.supermercato_id" class="select">
          <option v-for="s in supermercati" :key="s.id" :value="s.id">{{ s.nome }}{{ s.attivo ? '' : ' (in pausa)' }}</option>
          <option :value="NEW">＋ Nuovo supermercato…</option>
        </select>
      </label>
      <label v-if="form.supermercato_id === NEW" class="field">
        <span>Nome del supermercato *</span>
        <input v-model="form.supermercato_nuovo" class="input" maxlength="80" placeholder="Es. Esselunga" />
      </label>
      <label class="field">
        <span>Prodotto *</span>
        <input v-model="form.nome" class="input" required maxlength="160" placeholder="Es. Passata di pomodoro" />
      </label>
      <div class="two">
        <label class="field"><span>Marca</span><input v-model="form.marca" class="input" maxlength="80" placeholder="Es. Mutti" /></label>
        <label class="field"><span>Formato</span><input v-model="form.formato" class="input" maxlength="60" placeholder="Es. 700 g" /></label>
      </div>
      <div class="three">
        <label class="field"><span>Prezzo (€) *</span><input v-model="form.prezzo" class="input" inputmode="decimal" required placeholder="0,99" /></label>
        <label class="field"><span>Prezzo pieno</span><input v-model="form.prezzo_pieno" class="input" inputmode="decimal" placeholder="1,59" /></label>
        <label class="field">
          <span>Al kg/l/pz</span>
          <div class="unit-row">
            <input v-model="form.prezzo_unitario" class="input" inputmode="decimal" placeholder="1,41" />
            <select v-model="form.unita" class="select" aria-label="Unità">
              <option value="kg">kg</option><option value="l">l</option><option value="pz">pz</option>
            </select>
          </div>
        </label>
      </div>
      <div class="two">
        <label class="field"><span>Valida dal *</span><input v-model="form.valido_da" type="date" class="input" required /></label>
        <label class="field"><span>al *</span><input v-model="form.valido_fino" type="date" class="input" required :min="form.valido_da" /></label>
      </div>
      <label class="field">
        <span>Condizioni</span>
        <input v-model="form.condizioni" class="input" maxlength="200" placeholder="Es. con carta fedeltà, 3x2" />
      </label>
      <div class="two">
        <label class="field">
          <span>Categoria</span>
          <input v-model="form.categoria" class="input" list="offerte-cat-off" maxlength="60" placeholder="Es. Dispensa" />
          <datalist id="offerte-cat-off"><option v-for="c in categorie" :key="c" :value="c" /></datalist>
        </label>
        <label class="field"><span>Link al volantino</span><input v-model="form.url" class="input" type="url" maxlength="500" placeholder="https://…" /></label>
      </div>
      <p v-if="!o" class="muted small" style="margin: 0">
        Se c'è già un'offerta uguale (stesso supermercato, prodotto e inizio validità) viene aggiornata.
      </p>
    </form>
    <template #foot>
      <button v-if="o" type="button" class="btn btn-danger" :disabled="busy" @click="remove">Elimina</button>
      <span class="spacer" />
      <button type="button" class="btn" @click="closeOfferta">Annulla</button>
      <button type="submit" form="offerta-form" class="btn btn-primary" :disabled="busy">{{ busy ? 'Salvo…' : 'Salva' }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.three { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 12px; }
@media (max-width: 480px) {
  .three { grid-template-columns: 1fr 1fr; }
  .three > :last-child { grid-column: 1 / -1; }
}
.unit-row { display: flex; gap: 6px; }
.unit-row .select { width: auto; flex: 0 0 auto; }
</style>
