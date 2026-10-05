<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { supabase, unwrap, toast, useSpace } from '@shared'
import { T } from '../db.js'
import { useData } from '../store.js'
import { CATEGORIE, UNITA } from '../lib/categories.js'
import { buildImport, parseCSV, sheetCsvUrl } from '../lib/importer.js'
import { fmtLong, fmtShort } from '../lib/metrics.js'

const { state, load, reload } = useData()
const router = useRouter()
const { spaceId, canWrite } = useSpace()
onMounted(load)

// L'URL del foglio resta solo in questo browser (la repo è pubblica: niente link nel codice).
const LS_KEY = 'allenamenti-sheet-url'
const read = () => { try { return localStorage.getItem(LS_KEY) ?? '' } catch { return '' } }
const url = ref(read())
const year = ref(new Date().getFullYear())
const csv = ref('')
const fetching = ref(false)
const importing = ref(false)
const skipExisting = ref(true)
const result = ref(null)

async function fromSheet() {
  const u = sheetCsvUrl(url.value)
  if (!u) return toast.error('Link non valido: incolla il link del Google Sheet (docs.google.com/spreadsheets/d/…).')
  fetching.value = true
  try {
    const res = await fetch(u)
    if (!res.ok) throw new Error(`Google ha risposto ${res.status}: il foglio deve essere condiviso con "Chiunque abbia il link".`)
    const text = await res.text()
    if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Il foglio non è accessibile: condividilo con "Chiunque abbia il link può visualizzare".')
    csv.value = text
    try { localStorage.setItem(LS_KEY, url.value) } catch { /* storage non disponibile */ }
  } catch (e) {
    toast.error(e instanceof TypeError ? new Error('Impossibile scaricare il foglio (rete o permessi). Prova con "File → Scarica → CSV".') : e)
  } finally {
    fetching.value = false
  }
}

async function fromFile(ev) {
  const f = ev.target.files?.[0]
  if (f) csv.value = await f.text()
}

watch([csv, year, () => state.esercizi], () => {
  result.value = csv.value ? buildImport(parseCSV(csv.value), { year: Number(year.value), known: state.esercizi }) : null
})

const existingDates = computed(() => new Set(state.sessioni.map((s) => s.data)))
const toImport = computed(() => (result.value?.sessions ?? []).filter((s) => !skipExisting.value || !existingDates.value.has(s.data)))
const skipped = computed(() => (result.value?.sessions.length ?? 0) - toImport.value.length)
const nameOf = (key) => result.value.newExercises.find((e) => e.nome.toLowerCase() === key)?.nome ?? state.esercizi.find((e) => e.nome.toLowerCase() === key)?.nome ?? key
const usedNew = computed(() => {
  const keys = new Set(toImport.value.flatMap((s) => s.voci.map((v) => v.nomeKey)))
  return (result.value?.newExercises ?? []).filter((e) => keys.has(e.nome.toLowerCase()))
})

async function doImport() {
  if (!toImport.value.length) return
  importing.value = true
  try {
    const ids = new Map(state.esercizi.map((e) => [e.nome.toLowerCase(), e.id]))
    if (usedNew.value.length) {
      const created = unwrap(await supabase.from(T.esercizi)
        .insert(usedNew.value.map(({ nome, categoria, unita }) => ({ space_id: spaceId.value, nome, categoria, unita })))
        .select('id, nome'))
      for (const e of created) ids.set(e.nome.toLowerCase(), e.id)
    }
    const created = unwrap(await supabase.from(T.sessioni)
      .insert(toImport.value.map((s) => ({ space_id: spaceId.value, data: s.data })))
      .select('id, data'))
    const sid = new Map(created.map((s) => [s.data, s.id]))
    const voci = toImport.value.flatMap((s) => s.voci.map(({ nomeKey, ...v }, i) => ({
      ...v, space_id: spaceId.value, ordine: i, sessione_id: sid.get(s.data), esercizio_id: ids.get(nomeKey),
    })))
    unwrap(await supabase.from(T.voci).insert(voci))
    await reload()
    toast.ok(`Importati ${created.length} allenamenti (${voci.length} esercizi)`)
    router.push('/')
  } catch (e) {
    toast.error(e)
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div v-if="!canWrite" class="card empty">
    Questi dati sono in sola lettura: non puoi importare qui. <RouterLink to="/allenamenti">Torna alla lista</RouterLink>
  </div>
  <div v-else class="stack" style="gap: 16px">
    <div>
      <RouterLink to="/allenamenti" class="small">← Allenamenti</RouterLink>
      <h2 style="margin: 4px 0 4px">Importa allenamenti</h2>
      <p class="muted small" style="margin: 0">
        Colonne riconosciute: <strong>Data, Esercizio, Serie, Rip, Peso</strong>, e facoltative Type/Categoria, RPE, Note.
        Le righe senza data appartengono all'allenamento precedente.
      </p>
    </div>

    <section class="card stack">
      <h3 style="margin: 0">Da Google Sheet</h3>
      <p class="muted small" style="margin: 0">Il foglio deve essere condiviso con “Chiunque abbia il link può visualizzare”. Viene letto il primo tab (o quello del link, se contiene <code>gid=</code>).</p>
      <div class="row" style="flex-wrap: nowrap">
        <input v-model="url" class="input" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Link del Google Sheet" />
        <button class="btn btn-primary" :disabled="!url || fetching" @click="fromSheet">{{ fetching ? 'Leggo…' : 'Leggi' }}</button>
      </div>
      <div class="or muted small">oppure</div>
      <label class="field">
        <span>File CSV (File → Scarica → CSV)</span>
        <input type="file" accept=".csv,text/csv" class="input" @change="fromFile" />
      </label>
      <label class="field" style="max-width: 200px">
        <span>Anno per le date senza anno (gg/mm)</span>
        <input v-model.number="year" type="number" min="2000" max="2100" class="input" />
      </label>
    </section>

    <template v-if="result">
      <div v-for="w in result.warnings" :key="w" class="card warn small">{{ w }}</div>

      <section v-if="result.sessions.length" class="card stack">
        <div class="row-between">
          <h3 style="margin: 0">Anteprima</h3>
          <span class="badge badge-primary">{{ toImport.length }} allenamenti da importare</span>
        </div>
        <p v-if="result.rpeDetected" class="muted small" style="margin: 0">Ho trovato una colonna con valori 1–10 senza intestazione: la importo come <strong>RPE</strong> (sforzo percepito).</p>
        <label v-if="skipped || existingDates.size" class="row small">
          <input v-model="skipExisting" type="checkbox" />
          Salta le date che hanno già un allenamento<span v-if="skipped" class="muted">({{ skipped }} saltat{{ skipped === 1 ? 'o' : 'i' }})</span>
        </label>

        <div v-if="usedNew.length" class="stack" style="gap: 6px">
          <span class="label">Nuovi esercizi ({{ usedNew.length }}) — controlla categoria e misura</span>
          <div class="new-list">
            <div v-for="e in usedNew" :key="e.nome" class="new-item">
              <strong>{{ e.nome }}</strong>
              <select v-model="e.categoria" class="select select-sm" :aria-label="`Categoria di ${e.nome}`">
                <option v-for="c in [...new Set([...CATEGORIE, e.categoria])]" :key="c" :value="c">{{ c }}</option>
              </select>
              <select v-model="e.unita" class="select select-sm" :aria-label="`Misura di ${e.nome}`">
                <option v-for="u in UNITA" :key="u.value" :value="u.value">{{ u.label }}</option>
              </select>
            </div>
          </div>
        </div>

        <div class="stack" style="gap: 8px">
          <details v-for="s in toImport" :key="s.data" class="sess">
            <summary><span class="cap">{{ fmtLong(s.data) }}</span> <span class="muted small">· {{ s.voci.length }} esercizi</span></summary>
            <ul>
              <li v-for="(v, i) in s.voci" :key="i">
                {{ nameOf(v.nomeKey) }}
                <span class="muted">—
                  <template v-if="v.durata_min || v.distanza_km">{{ [v.durata_min && `${v.durata_min} min`, v.distanza_km && `${v.distanza_km} km`].filter(Boolean).join(' · ') }}</template>
                  <template v-else>{{ v.serie ?? '?' }} × {{ v.ripetizioni ?? '?' }}{{ v.peso_kg ? ` · ${v.peso_kg} kg` : '' }}</template>
                  <template v-if="v.rpe"> · RPE {{ v.rpe }}</template>
                  <template v-if="v.note"> · {{ v.note }}</template>
                </span>
              </li>
            </ul>
          </details>
        </div>

        <div class="row" style="justify-content: flex-end">
          <span v-if="toImport.length" class="muted small">dal {{ fmtShort(toImport[0].data) }} al {{ fmtShort(toImport.at(-1).data) }}</span>
          <button class="btn btn-primary" :disabled="!toImport.length || importing" @click="doImport">
            {{ importing ? 'Importo…' : `Importa ${toImport.length} allenamenti` }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.or { text-align: center; }
.warn { border-color: var(--warn); color: var(--warn); box-shadow: none; padding: 10px 14px; }
.select-sm { padding: 5px 8px; font-size: .86rem; width: auto; }
.new-list { display: flex; flex-direction: column; gap: 6px; }
.new-item { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 6px 0; border-top: 1px solid var(--border); }
.new-item strong { flex: 1 1 160px; }
.sess { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; }
.sess summary { cursor: pointer; }
.sess ul { margin: 8px 0 2px; padding-left: 18px; font-size: .9rem; }
.cap { text-transform: capitalize; font-weight: 500; }
</style>
