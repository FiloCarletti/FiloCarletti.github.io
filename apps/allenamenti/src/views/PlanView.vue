<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { supabase, unwrap, toast, todayISO, useSpace } from '@shared'
import { useData } from '../store.js'
import CatDot from '../components/CatDot.vue'
import ExerciseInfo from '../components/ExerciseInfo.vue'
import { ESEMPIO, buildPrompt, extractJSON, normalizePlan, toPayload } from '../lib/planner.js'
import { fmtLong, fmtVoce, parseISO, toISO } from '../lib/metrics.js'

const { state, sessions, planned, history, load, reload } = useData()
const { spaceId, canWrite } = useSpace()
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

const tomorrow = () => { const d = parseISO(todayISO()); d.setDate(d.getDate() + 1); return toISO(d) }
const request = ref('')
const data = ref(tomorrow())
const text = ref('')
const saving = ref(false)

const prompt = computed(() => buildPrompt({
  sessions: sessions.value, history: history.value, esercizi: state.esercizi, planned: planned.value,
  request: request.value, data: data.value,
}))

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(prompt.value)
    toast.ok('Prompt copiato: incollalo in Claude')
  } catch {
    toast.error('Copia non riuscita: seleziona il testo del prompt e copialo a mano.')
    showPrompt.value = true
  }
}
const showPrompt = ref(false)

async function fromFile(ev) {
  const f = ev.target.files?.[0]
  if (f) text.value = await f.text()
}

const parsed = ref(null)
watch([text, () => state.esercizi], () => {
  if (!text.value.trim()) { parsed.value = null; return }
  try {
    parsed.value = normalizePlan(extractJSON(text.value), { known: state.esercizi, today: todayISO() })
  } catch (e) {
    parsed.value = { sessions: [], errors: [e.message] }
  }
})

const esempio = JSON.stringify(ESEMPIO, null, 2)

async function save() {
  if (!parsed.value?.sessions.length) return
  saving.value = true
  try {
    unwrap(await supabase.rpc('allenamenti_pianifica', {
      p_space_id: spaceId.value,
      p_piano: toPayload(parsed.value.sessions),
      p_fonte: mode.value,
    }))
    await reload()
    const n = parsed.value.sessions.length
    toast.ok(n === 1 ? 'Allenamento aggiunto ai Da fare' : `${n} allenamenti aggiunti ai Da fare`)
    router.push('/allenamenti')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="!canWrite" class="card empty">
    Questi dati sono in sola lettura. <RouterLink to="/allenamenti">Torna alla lista</RouterLink>
  </div>
  <div v-else class="stack" style="gap: 16px">
    <div>
      <RouterLink to="/allenamenti" class="small">← Allenamenti</RouterLink>
      <h2 style="margin: 4px 0 4px">Programma un allenamento</h2>
      <p class="muted small" style="margin: 0">
        Finisce tra i <strong>Da fare</strong>: mentre ti alleni confermi ogni esercizio com'è o con i valori reali.
        Puoi anche <RouterLink to="/allenamenti/nuovo?piano=1">compilarlo a mano</RouterLink>.
      </p>
    </div>

    <div class="seg" role="tablist">
      <button v-for="m in MODES" :key="m.value" type="button" role="tab" :aria-selected="mode === m.value" :class="{ on: mode === m.value }" @click="mode = m.value">{{ m.label }}</button>
    </div>

    <section v-if="mode === 'claude'" class="card stack">
      <div class="tip small">
        Con la skill <strong>allenamenti-coach</strong> e il connettore Supabase basta chiedere a Claude
        <em>“preparami il prossimo allenamento”</em>: legge lo storico e lo inserisce da solo nei Da fare.
        Altrimenti:
      </div>
      <h3 style="margin: 0">1. Copia il prompt con il tuo storico</h3>
      <div class="ask">
        <label class="field"><span>Per quando</span><input v-model="data" type="date" class="input" /></label>
        <label class="field grow"><span>Cosa vuoi fare (facoltativo)</span><input v-model="request" class="input" placeholder="Es. gambe, 45 minuti, niente salti" /></label>
      </div>
      <div class="row">
        <button type="button" class="btn btn-primary" :disabled="!state.loaded" @click="copyPrompt">Copia prompt</button>
        <a href="https://claude.ai/new" target="_blank" rel="noopener" class="btn">Apri Claude ↗</a>
        <button type="button" class="btn btn-ghost btn-sm" @click="showPrompt = !showPrompt">{{ showPrompt ? 'Nascondi' : 'Vedi' }} prompt</button>
      </div>
      <textarea v-if="showPrompt" class="textarea mono" readonly :value="prompt" rows="10" @focus="$event.target.select()" />
      <h3 style="margin: 4px 0 0">2. Incolla qui la risposta di Claude</h3>
      <textarea v-model="text" class="textarea mono" rows="6" placeholder="Incolla tutta la risposta: trovo io il blocco JSON" aria-label="Risposta di Claude" />
    </section>

    <section v-else class="card stack">
      <label class="field">
        <span>Incolla il JSON</span>
        <textarea v-model="text" class="textarea mono" rows="8" placeholder='{ "data": "2026-10-07", "esercizi": [ { "nome": "Squat", "serie": 4, "ripetizioni": 6, "peso_kg": 60 } ] }' />
      </label>
      <label class="field">
        <span>oppure un file .json</span>
        <input type="file" accept=".json,application/json,text/plain" class="input" @change="fromFile" />
      </label>
      <details class="small">
        <summary>Formato</summary>
        <p class="muted" style="margin: 8px 0">
          Un allenamento o un array di allenamenti. Per ogni esercizio: <code>nome</code> e i valori che servono —
          <code>serie</code>, <code>ripetizioni</code> (secondi per gli esercizi a tempo), <code>peso_kg</code>,
          <code>rpe</code> obiettivo, <code>durata_min</code>/<code>distanza_km</code> per il cardio, <code>note</code>.
          Per gli esercizi nuovi anche <code>categoria</code> e <code>unita</code> (<code>rip</code>, <code>sec</code>, <code>cardio</code>).
          Facoltativi: <code>recupero_sec</code> (recupero tra le serie) e <code>descrizione</code> con <code>esecuzione</code>,
          <code>attenzione</code>, <code>scopo</code> e <code>muscoli</code>, che finisce nella scheda dell'esercizio.
        </p>
        <pre class="mono example">{{ esempio }}</pre>
      </details>
    </section>

    <template v-if="parsed">
      <div v-for="w in parsed.errors" :key="w" class="card warn small">{{ w }}</div>
      <section v-for="(s, si) in parsed.sessions" :key="si" class="card stack" style="gap: 8px">
        <div>
          <div class="date">{{ fmtLong(s.data) }}</div>
          <h3 style="margin: 2px 0 0">{{ s.titolo || 'Allenamento' }}</h3>
          <p v-if="s.note" class="muted small" style="margin: 4px 0 0; white-space: pre-line">{{ s.note }}</p>
        </div>
        <ul class="voci">
          <li v-for="(v, i) in s.esercizi" :key="i">
            <span class="name">{{ v.nome }}</span>
            <span v-if="v.isNew" class="badge badge-primary" :title="`Nuovo esercizio: ${v.categoria}, ${v.unita}`">nuovo</span>
            <CatDot v-if="v.isNew" :cat="v.categoria" />
            <span class="spacer" />
            <span class="what">{{ fmtVoce(v, v.unita) }}</span>
            <span v-if="v.rpe" class="rpe">RPE {{ v.rpe }}</span>
            <span v-if="v.recupero_sec" class="rpe">rec. {{ v.recupero_sec }}″</span>
            <span v-if="v.note" class="note muted small">{{ v.note }}</span>
            <details v-if="v.descrizione" class="note scheda small">
              <summary>📖 Scheda{{ v.isNew || !v.esercizio?.esecuzione ? '' : ' (quella salvata resta: si completano solo i campi vuoti)' }}</summary>
              <ExerciseInfo :info="v.descrizione" style="margin-top: 8px" />
            </details>
          </li>
        </ul>
      </section>
      <div v-if="parsed.sessions.length" class="row actions">
        <button class="btn btn-primary" :disabled="saving" @click="save">
          {{ saving ? 'Aggiungo…' : parsed.sessions.length === 1 ? 'Aggiungi ai Da fare' : `Aggiungi ${parsed.sessions.length} allenamenti ai Da fare` }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.seg { display: flex; gap: 4px; padding: 3px; background: var(--surface-2); border-radius: var(--radius); align-self: flex-start; }
.seg button { border: 0; background: transparent; color: var(--muted); font: inherit; font-weight: 500; padding: 6px 14px; border-radius: 8px; cursor: pointer; }
.seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.tip { background: var(--primary-soft); border-radius: var(--radius); padding: 10px 12px; }
.ask { display: grid; gap: 10px; grid-template-columns: 1fr; }
@media (min-width: 560px) { .ask { grid-template-columns: 170px 1fr; } }
.mono { font-family: var(--mono); font-size: .82rem; }
.example { background: var(--surface-2); border-radius: var(--radius); padding: 10px; overflow-x: auto; margin: 0; }
.warn { border-color: var(--warn); color: var(--warn); box-shadow: none; padding: 10px 14px; }
.date { font-size: .8rem; color: var(--muted); text-transform: capitalize; }
.voci { list-style: none; margin: 0; padding: 0; }
.voci li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; padding: 7px 0; border-top: 1px solid var(--border); }
.name { font-weight: 500; }
.what { font-variant-numeric: tabular-nums; white-space: nowrap; }
.rpe { font-size: .75rem; color: var(--muted); white-space: nowrap; }
.note { flex-basis: 100%; }
.scheda summary { cursor: pointer; color: var(--primary); }
.actions { justify-content: flex-end; position: sticky; bottom: 0; padding: 10px 0; background: var(--bg); border-top: 1px solid var(--border); }
</style>
