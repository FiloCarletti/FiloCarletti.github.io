<script setup>
// Nuovo monitoraggio o modifica: aeroporti, periodo e durata, orari e giorni, compagnie, fonti, avvisi.
// Se cambiano i criteri, il DB azzera miglior prezzo e minimo storico (non sarebbero più confrontabili).
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast, useSpace } from '@shared'
import AirportInput from '../components/AirportInput.vue'
import TagInput from '../components/TagInput.vue'
import { deleteRicerca, eliminaSpazioCorrente, saveRicerca, useData, vaiASpazio } from '../store.js'
import { addDays, romeToday } from '../lib/combina.js'
import { FONTI_SUPPORTATE, fonteAttiva } from '../lib/fonti.js'
import { GIORNI_BREVI } from '../lib/formato.js'

const route = useRoute()
const router = useRouter()
const { state, attive, spazio, altriSpazi, load } = useData()
const { canWrite, info } = useSpace()
onMounted(load)

const id = computed(() => route.params.id ?? null)
const esistente = computed(() => (id.value ? state.ricerche.find((r) => r.id === id.value) ?? null : null))

const COMPAGNIE = ['Ryanair', 'Wizz Air', 'easyJet', 'Vueling', 'ITA', 'Volotea', 'Aeroitalia', 'Lufthansa', 'Air France', 'KLM',
  'British Airways', 'Iberia', 'SWISS', 'Austrian', 'TAP', 'Transavia', 'Eurowings', 'Brussels Airlines', 'Air Dolomiti',
  'Norwegian', 'SAS', 'Turkish Airlines', 'Aegean', 'Emirates', 'Qatar Airways']

const oggi = romeToday()
const vuoto = () => ({
  nome: '', origini: [], destinazioni: [], partenza_da: addDays(oggi, 14), partenza_a: addDays(oggi, 60),
  solo_andata: false, durata_min: 3, durata_max: 5, adulti: 1, max_scali: null, compagnie: [], solo_compagnie: false,
  compagnie_escluse: [], fonti: [], giorni_andata: [], andata_dopo: '', andata_prima: '', giorni_ritorno: [],
  ritorno_dopo: '', ritorno_prima: '', rientro_altro: false, compagnie_miste: false, prezzo_obiettivo: null,
  avvisa_minimo: true, avvisa_calo: 15, attiva: true, note: '',
})
const form = reactive(vuoto())
const hhmm = (t) => (t ? String(t).slice(0, 5) : '')
watch(esistente, (r) => {
  if (!r) return
  Object.assign(form, vuoto(), {
    ...Object.fromEntries(Object.keys(vuoto()).map((k) => [k, r[k]])),
    andata_dopo: hhmm(r.andata_dopo), andata_prima: hhmm(r.andata_prima),
    ritorno_dopo: hhmm(r.ritorno_dopo), ritorno_prima: hhmm(r.ritorno_prima),
    prezzo_obiettivo: r.prezzo_obiettivo != null ? Number(r.prezzo_obiettivo) : null,
  })
}, { immediate: true })

const toggleGiorno = (list, g) => { const i = list.indexOf(g); if (i > -1) list.splice(i, 1); else list.push(g); list.sort() }
const toggleFonte = (c) => {
  const tutte = FONTI_SUPPORTATE.map((f) => f.codice)
  const sel = form.fonti.length ? [...form.fonti] : [...tutte]
  const i = sel.indexOf(c)
  if (i > -1) sel.splice(i, 1); else sel.push(c)
  form.fonti = sel.length === tutte.length ? [] : sel
}
const fonteScelta = (c) => !form.fonti.length || form.fonti.includes(c)

const errori = computed(() => {
  const e = []
  if (!form.nome.trim()) e.push('Dai un nome al monitoraggio.')
  if (!form.origini.length) e.push('Indica almeno un aeroporto di partenza.')
  if (!form.destinazioni.length) e.push('Indica almeno un aeroporto di arrivo.')
  if (!form.partenza_da || !form.partenza_a || form.partenza_a < form.partenza_da) e.push('Il periodo di partenza non è valido.')
  if (!form.solo_andata && (form.durata_min == null || form.durata_max == null || form.durata_max < form.durata_min)) e.push('La durata massima deve essere almeno quella minima.')
  if (!form.solo_andata && form.durata_max > 60) e.push('Durata massima: 60 giorni.')
  if (FONTI_SUPPORTATE.every((f) => !fonteScelta(f.codice))) e.push('Scegli almeno una fonte.')
  return e
})
const stima = computed(() => {
  // giorni × durate × tratte: per dare un'idea del peso della ricerca
  const giorni = Math.max(0, (Date.parse(form.partenza_a) - Date.parse(form.partenza_da)) / 86400000 + 1)
  return { giorni, tratte: form.origini.length * form.destinazioni.length }
})

const saving = ref(false)
async function salva() {
  if (errori.value.length) { toast.error(errori.value[0]); return }
  saving.value = true
  const t = (x) => x || null
  const row = {
    ...form,
    nome: form.nome.trim(),
    note: form.note.trim(),
    durata_min: form.solo_andata ? 0 : form.durata_min,
    durata_max: form.solo_andata ? 0 : form.durata_max,
    andata_dopo: t(form.andata_dopo), andata_prima: t(form.andata_prima),
    ritorno_dopo: t(form.ritorno_dopo), ritorno_prima: t(form.ritorno_prima),
    prezzo_obiettivo: form.prezzo_obiettivo || null,
    avvisa_calo: form.avvisa_calo || null,
  }
  try {
    const saved = await saveRicerca(row, id.value)
    toast.ok(id.value ? 'Monitoraggio aggiornato' : 'Monitoraggio creato: i prezzi arrivano con la prossima ricerca')
    router.replace(`/ricerca/${saved.id}`)
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

const ultimoDelloSpazio = computed(() => spazio.value?.kind === 'shared' && info.value?.my_role === 'owner' && state.ricerche.length === 1)
async function elimina() {
  const r = esistente.value
  if (!r) return
  const conSpazio = ultimoDelloSpazio.value
  const msg = conSpazio
    ? `Eliminare «${r.nome}» con tutto il suo storico? È l'unico monitoraggio di questo spazio condiviso: elimino anche lo spazio.`
    : `Eliminare «${r.nome}» con il suo andamento e i suoi avvisi?`
  if (!confirm(msg)) return
  try {
    if (conSpazio) {
      await eliminaSpazioCorrente()
      toast.ok('Monitoraggio e spazio eliminati')
      const personale = altriSpazi.value.find((s) => s.kind === 'personal')
      if (personale) vaiASpazio(personale.id)
      else window.location.href = '/'
      return
    }
    await deleteRicerca(r.id)
    toast.ok('Monitoraggio eliminato')
    router.replace('/')
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div v-if="!canWrite" class="card empty">Questi dati sono in sola lettura. <RouterLink to="/">Torna ai monitoraggi</RouterLink></div>
  <div v-else-if="id && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
  <div v-else-if="id && !esistente" class="card empty">Monitoraggio non trovato. <RouterLink to="/">Torna all'elenco</RouterLink></div>
  <form v-else class="stack" style="gap: 14px" @submit.prevent="salva">
    <div>
      <RouterLink :to="id ? `/ricerca/${id}` : '/'" class="muted small" style="text-decoration: none">← {{ id ? 'Monitoraggio' : 'Monitoraggi' }}</RouterLink>
      <h2 style="margin: 2px 0 0">{{ id ? 'Modifica monitoraggio' : 'Nuovo monitoraggio' }}</h2>
    </div>

    <section class="card stack">
      <label class="field"><span>Nome</span><input v-model="form.nome" class="input" maxlength="80" placeholder="es. Barcellona a novembre" required /></label>
      <div class="field"><span>Partenza da (uno o più aeroporti)</span><AirportInput v-model="form.origini" label="Aeroporti di partenza" /></div>
      <div class="field"><span>Arrivo a (uno o più aeroporti)</span><AirportInput v-model="form.destinazioni" label="Aeroporti di arrivo" /></div>
      <label class="check"><input v-model="form.solo_andata" type="checkbox" /> Solo andata</label>
    </section>

    <section class="card stack">
      <h3 style="margin: 0">Quando</h3>
      <div class="two">
        <label class="field"><span>Partenza dal</span><input v-model="form.partenza_da" type="date" class="input" :min="oggi" required /></label>
        <label class="field"><span>al</span><input v-model="form.partenza_a" type="date" class="input" :min="form.partenza_da" required /></label>
      </div>
      <div v-if="!form.solo_andata" class="two">
        <label class="field"><span>Durata minima (giorni)</span><input v-model.number="form.durata_min" type="number" min="0" max="60" class="input" inputmode="numeric" /></label>
        <label class="field"><span>Durata massima (giorni)</span><input v-model.number="form.durata_max" type="number" :min="form.durata_min" max="60" class="input" inputmode="numeric" /></label>
      </div>
      <p v-if="!form.solo_andata" class="muted small" style="margin: 0">
        Giorni tra andata e ritorno: da venerdì a domenica sono 2. Per ogni volo di andata nel periodo si cercano i ritorni
        da {{ form.durata_min }} a {{ form.durata_max }} giorni dopo.
      </p>
      <label class="field" style="max-width: 160px"><span>Adulti</span><input v-model.number="form.adulti" type="number" min="1" max="9" class="input" inputmode="numeric" /></label>
    </section>

    <section class="card stack">
      <h3 style="margin: 0">Giorni e orari</h3>
      <div class="field">
        <span>Andata: giorni (nessuno = tutti)</span>
        <div class="days">
          <button v-for="(g, i) in GIORNI_BREVI" :key="g" type="button" class="day" :class="{ on: form.giorni_andata.includes(i + 1) }" :aria-pressed="form.giorni_andata.includes(i + 1)" @click="toggleGiorno(form.giorni_andata, i + 1)">{{ g }}</button>
        </div>
      </div>
      <div class="two">
        <label class="field"><span>Andata: parte dopo le</span><input v-model="form.andata_dopo" type="time" class="input" /></label>
        <label class="field"><span>e prima delle</span><input v-model="form.andata_prima" type="time" class="input" /></label>
      </div>
      <template v-if="!form.solo_andata">
        <div class="field">
          <span>Ritorno: giorni (nessuno = tutti)</span>
          <div class="days">
            <button v-for="(g, i) in GIORNI_BREVI" :key="g" type="button" class="day" :class="{ on: form.giorni_ritorno.includes(i + 1) }" :aria-pressed="form.giorni_ritorno.includes(i + 1)" @click="toggleGiorno(form.giorni_ritorno, i + 1)">{{ g }}</button>
          </div>
        </div>
        <div class="two">
          <label class="field"><span>Ritorno: parte dopo le</span><input v-model="form.ritorno_dopo" type="time" class="input" /></label>
          <label class="field"><span>e prima delle</span><input v-model="form.ritorno_prima" type="time" class="input" /></label>
        </div>
      </template>
      <p class="muted small" style="margin: 0">Esempio: andata il venerdì dopo le 17, ritorno la domenica dopo le 15; “nessun volo prima delle 7”: dopo le 07:00.</p>
    </section>

    <section class="card stack">
      <h3 style="margin: 0">Compagnie e opzioni</h3>
      <div class="field"><span>Compagnie preferite</span><TagInput v-model="form.compagnie" :suggestions="COMPAGNIE" placeholder="es. Ryanair, ITA" label="Compagnie preferite" /></div>
      <label class="check"><input v-model="form.solo_compagnie" type="checkbox" :disabled="!form.compagnie.length" /> Solo le preferite (altrimenti le evidenzio con ★)</label>
      <div class="field"><span>Compagnie da escludere</span><TagInput v-model="form.compagnie_escluse" :suggestions="COMPAGNIE" placeholder="nessuna" label="Compagnie escluse" /></div>
      <label class="field" style="max-width: 240px"><span>Scali</span>
        <select v-model="form.max_scali" class="select input">
          <option :value="null">Qualsiasi</option><option :value="0">Solo diretti</option><option :value="1">Al massimo 1</option><option :value="2">Al massimo 2</option>
        </select>
      </label>
      <template v-if="!form.solo_andata">
        <label class="check"><input v-model="form.rientro_altro" type="checkbox" /> Rientro anche su un altro aeroporto di partenza (es. andata da BLQ, ritorno a BGY)</label>
        <label class="check"><input v-model="form.compagnie_miste" type="checkbox" /> Andata e ritorno anche con compagnie diverse (due biglietti separati)</label>
      </template>
    </section>

    <section class="card stack">
      <h3 style="margin: 0">Dove cercare</h3>
      <div class="stack" style="gap: 6px">
        <label v-for="f in FONTI_SUPPORTATE" :key="f.codice" class="check">
          <input type="checkbox" :checked="fonteScelta(f.codice)" @change="toggleFonte(f.codice)" />
          <span><strong>{{ f.nome }}</strong> <span class="muted small">· {{ f.copre }}</span>
            <span v-if="!fonteAttiva(f.codice, attive)" class="badge">disattivata in Fonti</span></span>
        </label>
      </div>
      <p class="muted small" style="margin: 0">Gli altri siti e la loro affidabilità sono in <RouterLink to="/fonti">Fonti</RouterLink>.</p>
    </section>

    <section class="card stack">
      <h3 style="margin: 0">Avvisi</h3>
      <label class="field" style="max-width: 240px"><span>Avvisami sotto (€ a persona{{ form.solo_andata ? '' : ', andata e ritorno' }})</span>
        <input v-model.number="form.prezzo_obiettivo" type="number" min="1" step="1" class="input" inputmode="decimal" placeholder="es. 60" />
      </label>
      <label class="check"><input v-model="form.avvisa_minimo" type="checkbox" /> Avvisami quando il prezzo tocca un nuovo minimo storico</label>
      <label class="check wrap">
        <input :checked="form.avvisa_calo != null" type="checkbox" @change="form.avvisa_calo = $event.target.checked ? 15 : null" />
        Avvisami se scende di almeno
        <input v-model.number="form.avvisa_calo" type="number" min="1" max="90" class="input pct" :disabled="form.avvisa_calo == null" aria-label="Percentuale di calo" /> %
        rispetto alla ricerca precedente
      </label>
      <label class="field"><span>Note</span><textarea v-model="form.note" class="textarea" maxlength="500" rows="2" /></label>
    </section>

    <p v-if="stima.tratte * stima.giorni > 4000" class="warn small">
      Ricerca molto ampia ({{ stima.tratte }} tratte × {{ stima.giorni }} giorni): la routine sarà più lenta e Google Flights coprirà
      solo una parte delle date a ogni passaggio.
    </p>
    <ul v-if="errori.length" class="error-text" style="margin: 0; padding-left: 18px"><li v-for="e in errori" :key="e">{{ e }}</li></ul>

    <div class="row">
      <button type="submit" class="btn btn-primary" :disabled="saving || errori.length > 0">{{ saving ? 'Salvo…' : id ? 'Salva' : 'Crea monitoraggio' }}</button>
      <RouterLink :to="id ? `/ricerca/${id}` : '/'" class="btn btn-ghost">Annulla</RouterLink>
      <span class="spacer" />
      <button v-if="id" type="button" class="btn btn-danger" @click="elimina">Elimina</button>
    </div>
  </form>
</template>

<style scoped>
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.check { display: flex; align-items: flex-start; gap: 8px; }
.check > input[type='checkbox'] { flex: none; margin-top: 4px; }
.check.wrap { flex-wrap: wrap; align-items: center; }
.check.wrap > input[type='checkbox'] { margin-top: 0; }
.days { display: flex; gap: 6px; flex-wrap: wrap; }
.day { width: 44px; padding: 7px 0; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-size: .88rem; cursor: pointer; }
.day.on { background: var(--primary); border-color: var(--primary); color: var(--primary-text); font-weight: 600; }
.pct { width: 72px; padding: 5px 8px; }
.warn { margin: 0; padding: 8px 10px; border-radius: var(--radius); background: color-mix(in srgb, var(--warn) 14%, var(--surface)); }
</style>
