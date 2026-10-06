<script setup>
// Ricerca con Claude (prompt da copiare con supermercati e prodotti) o import di un JSON.
// Le offerte passano da offerte_registra: niente doppioni con le ricerche dei giorni precedenti.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { fmtEuro, toast, useSpace } from '@shared'
import { registra, useData } from '../store.js'
import { fmtShort, today } from '../lib/dates.js'
import { ESEMPIO, buildPrompt, extractJSON, parseImport } from '../lib/importer.js'

const { state, supermercati, prodotti, load } = useData()
const { canWrite } = useSpace()
const route = useRoute()
const router = useRouter()
onMounted(load)

const MODES = [
  { value: 'claude', label: 'Con Claude' },
  { value: 'json', label: 'Da JSON' },
]
const mode = computed({
  get: () => (route.query.da === 'json' ? 'json' : 'claude'),
  set: (v) => router.replace({ query: { ...route.query, da: v === 'json' ? 'json' : undefined } }),
})

const oggi = today()
const attivi = computed(() => supermercati.value.filter((s) => s.attivo))
const prompt = computed(() => buildPrompt({ supermercati: supermercati.value, prodotti: prodotti.value, oggi }))
const showPrompt = ref(false)
async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(prompt.value)
    toast.ok('Prompt copiato: incollalo in Claude')
  } catch {
    toast.error('Copia non riuscita: seleziona il testo del prompt e copialo a mano.')
    showPrompt.value = true
  }
}

const text = ref('')
async function fromFile(ev) {
  const f = ev.target.files?.[0]
  if (f) text.value = await f.text()
}
const parsed = ref(null)
watch(text, () => {
  if (!text.value.trim()) { parsed.value = null; return }
  result.value = null
  try {
    parsed.value = parseImport(extractJSON(text.value), { oggi })
  } catch (e) {
    parsed.value = { offerte: [], supermercati: [], note: '', errors: [e.message] }
  }
})
const perSupermercato = computed(() => {
  const m = new Map()
  for (const o of parsed.value?.offerte ?? []) m.set(o.supermercato, (m.get(o.supermercato) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
})
const nuoviSm = computed(() => {
  const known = new Set(state.supermercati.map((s) => s.nome.toLowerCase()))
  return perSupermercato.value.map(([n]) => n).filter((n) => !known.has(n.toLowerCase()))
})
const showAll = ref(false)

const saving = ref(false)
const result = ref(null)
async function save() {
  if (!parsed.value?.offerte.length) return
  saving.value = true
  try {
    const { offerte, supermercati: cercati, note } = parsed.value
    const r = await registra({ offerte, supermercati: cercati, note }, mode.value)
    toast.ok(`${r.nuove} nuove, ${r.aggiornate} aggiornate${r.scartate ? `, ${r.scartate} scartate` : ''}`)
    text.value = ''
    result.value = r
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
const esempio = JSON.stringify(ESEMPIO, null, 2)
</script>

<template>
  <div v-if="!canWrite" class="card empty">
    Questi dati sono in sola lettura. <RouterLink to="/">Torna alle offerte</RouterLink>
  </div>
  <div v-else class="stack" style="gap: 16px">
    <div>
      <h2 style="margin: 0 0 4px">Importa offerte</h2>
      <p class="muted small" style="margin: 0">
        Le offerte già presenti (stesso supermercato, prodotto e inizio validità) vengono aggiornate, non duplicate.
        La ricerca automatica di ogni mattina usa lo stesso formato: il registro è in <RouterLink to="/dati">Dati</RouterLink>.
      </p>
    </div>

    <div class="seg" role="tablist">
      <button v-for="m in MODES" :key="m.value" type="button" role="tab" :aria-selected="mode === m.value" :class="{ on: mode === m.value }" @click="mode = m.value">{{ m.label }}</button>
    </div>

    <section v-if="mode === 'claude'" class="card stack">
      <h3 style="margin: 0">1. Copia il prompt con i tuoi supermercati e prodotti</h3>
      <p v-if="state.loaded && !attivi.length" class="warn small">
        Non hai supermercati attivi: <RouterLink to="/supermercati">aggiungili</RouterLink> prima, così Claude sa dove cercare.
      </p>
      <p v-else class="muted small" style="margin: 0">
        {{ attivi.length }} supermercati attivi, {{ prodotti.filter((p) => p.attivo).length }} prodotti seguiti.
        Serve Claude con la ricerca web attiva.
      </p>
      <div class="row">
        <button type="button" class="btn btn-primary" :disabled="!state.loaded" @click="copyPrompt">Copia prompt</button>
        <a href="https://claude.ai/new" target="_blank" rel="noopener" class="btn">Apri Claude ↗</a>
        <button type="button" class="btn btn-ghost btn-sm" @click="showPrompt = !showPrompt">{{ showPrompt ? 'Nascondi' : 'Vedi' }} prompt</button>
      </div>
      <textarea v-if="showPrompt" class="textarea mono" readonly :value="prompt" rows="12" @focus="$event.target.select()" />
      <h3 style="margin: 4px 0 0">2. Incolla qui la risposta di Claude</h3>
      <textarea v-model="text" class="textarea mono" rows="6" placeholder="Incolla tutta la risposta: trovo io il blocco JSON" aria-label="Risposta di Claude" />
    </section>

    <section v-else class="card stack">
      <label class="field">
        <span>Incolla il JSON</span>
        <textarea v-model="text" class="textarea mono" rows="8" placeholder='{ "offerte": [ { "supermercato": "Lidl", "nome": "Mele Golden", "prezzo": 1.49, "valido_da": "2026-10-06", "valido_fino": "2026-10-12" } ] }' />
      </label>
      <label class="field">
        <span>oppure un file .json</span>
        <input type="file" accept=".json,application/json,text/plain" class="input" @change="fromFile" />
      </label>
      <details class="small">
        <summary>Formato</summary>
        <p class="muted" style="margin: 8px 0">
          Un elenco di offerte, o un oggetto con <code>offerte</code>, <code>supermercati</code> (quelli cercati) e <code>note</code>.
          Per ogni offerta servono <code>supermercato</code>, <code>nome</code> e <code>prezzo</code>; poi, se ci sono,
          <code>marca</code>, <code>formato</code>, <code>categoria</code>, <code>prezzo_pieno</code>, <code>prezzo_unitario</code> con
          <code>unita</code> (kg, l, pz), <code>condizioni</code>, <code>valido_da</code>/<code>valido_fino</code> (AAAA-MM-GG; senza fine: 7 giorni) e <code>url</code>.
          I supermercati che non hai ancora vengono creati.
        </p>
        <pre class="mono example">{{ esempio }}</pre>
      </details>
    </section>

    <template v-if="parsed">
      <div v-for="w in parsed.errors.slice(0, 8)" :key="w" class="card warn small">{{ w }}</div>
      <p v-if="parsed.errors.length > 8" class="muted small" style="margin: 0">… e altri {{ parsed.errors.length - 8 }} problemi.</p>

      <section v-if="parsed.offerte.length" class="card stack">
        <div class="row-between">
          <h3 style="margin: 0">{{ parsed.offerte.length }} offerte da registrare</h3>
          <span class="muted small">{{ perSupermercato.map(([n, c]) => `${n} ${c}`).join(' · ') }}</span>
        </div>
        <p v-if="nuoviSm.length" class="muted small" style="margin: 0">Verranno creati: {{ nuoviSm.join(', ') }}.</p>
        <p v-if="parsed.note" class="small" style="margin: 0"><strong>Note:</strong> {{ parsed.note }}</p>
        <div class="table-wrap">
          <table class="table small">
            <thead><tr><th>Prodotto</th><th>Dove</th><th>Validità</th><th class="num">Prezzo</th></tr></thead>
            <tbody>
              <tr v-for="(o, i) in (showAll ? parsed.offerte : parsed.offerte.slice(0, 20))" :key="i">
                <td>{{ o.nome }} <span class="muted">{{ [o.marca, o.formato].filter(Boolean).join(' · ') }}</span></td>
                <td>{{ o.supermercato }}</td>
                <td class="nowrap">{{ o.valido_da ? fmtShort(o.valido_da) : 'oggi' }} – {{ o.valido_fino ? fmtShort(o.valido_fino) : '+7 gg' }}</td>
                <td class="num nowrap">{{ fmtEuro(o.prezzo) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button v-if="!showAll && parsed.offerte.length > 20" type="button" class="btn btn-ghost btn-sm" style="align-self: center" @click="showAll = true">
          Mostra tutte
        </button>
        <div class="row">
          <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
            {{ saving ? 'Registro…' : `Registra ${parsed.offerte.length} offerte` }}
          </button>
        </div>
      </section>
    </template>

    <section v-if="result" class="card stack">
      <h3 style="margin: 0">Fatto</h3>
      <p style="margin: 0">
        <strong>{{ result.nuove }}</strong> nuove, <strong>{{ result.aggiornate }}</strong> aggiornate<template v-if="result.scartate">,
        <strong>{{ result.scartate }}</strong> scartate</template>.
        <template v-if="result.supermercati_creati?.length"> Supermercati aggiunti: {{ result.supermercati_creati.join(', ') }}.</template>
      </p>
      <ul v-if="result.errori?.length" class="small" style="margin: 0; padding-left: 18px">
        <li v-for="e in result.errori" :key="e.n">{{ e.nome ?? `Offerta ${e.n}` }}: {{ e.errore }}</li>
      </ul>
      <div><RouterLink to="/" class="btn">Vedi le offerte</RouterLink></div>
    </section>
  </div>
</template>

<style scoped>
.seg { display: flex; padding: 3px; gap: 3px; background: var(--surface-2); border-radius: var(--radius); }
.seg button { flex: 1; padding: 8px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-weight: 600; cursor: pointer; }
.seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.mono { font-family: var(--mono); font-size: .85rem; }
.example { margin: 0; padding: 10px; border-radius: var(--radius); background: var(--surface-2); overflow-x: auto; }
.warn { margin: 0; padding: 8px 10px; border-radius: var(--radius); background: color-mix(in srgb, var(--warn) 14%, var(--surface)); border-color: color-mix(in srgb, var(--warn) 30%, var(--border)); }
.nowrap { white-space: nowrap; }
</style>
