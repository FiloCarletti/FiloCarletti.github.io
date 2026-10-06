<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { supabase, unwrap, toast, todayISO, useSpace } from '@shared'
import { T } from '../db.js'
import { dropLocal, putLocal, useData } from '../store.js'
import { CATEGORIE, UNITA, guessCategory, guessUnit } from '../lib/categories.js'
import { hasInfo } from '../lib/guide.js'
import ExerciseInfo from '../components/ExerciseInfo.vue'
import { fmtLong, fmtNum, fmtShort, fmtVoce } from '../lib/metrics.js'

// Allenamento programmato: si conferma un esercizio alla volta (com'è o con i valori reali),
// ogni conferma è salvata subito. "Termina" lo registra e lo porta nelle statistiche.
const { state, planned, history, load, reload } = useData()
const { spaceId, canWrite } = useSpace()
const route = useRoute()
const router = useRouter()

const session = computed(() => planned.value.find((s) => s.id === route.params.id) ?? null)
const head = reactive({ data: '', titolo: '' })
const rows = ref([])
const status = ref('loading') // loading | ok | missing | done
const busy = ref(false)
let seq = 0

const byName = computed(() => new Map(state.esercizi.map((e) => [e.nome.toLowerCase(), e])))
const names = computed(() => state.esercizi.map((e) => e.nome).sort((a, b) => a.localeCompare(b, 'it')))
const existing = (r) => byName.value.get(r.nome.trim().toLowerCase()) ?? null
const unitOf = (r) => existing(r)?.unita ?? r.unita

const str = (v) => (v == null ? '' : String(v).replace('.', ','))
function rowFrom(v) {
  return {
    key: v.id, id: v.id, nome: v.esercizio.nome, stato: v.stato, piano: v.piano, open: false, saving: false,
    serie: str(v.serie), ripetizioni: str(v.ripetizioni), peso_kg: str(v.peso_kg), rpe: str(v.rpe),
    durata_min: str(v.durata_min), distanza_km: str(v.distanza_km), note: v.note ?? '',
    categoria: '', unita: v.esercizio.unita,
  }
}
function newRow() {
  return {
    key: `n${++seq}`, id: null, nome: '', stato: 'da_fare', piano: null, open: true, saving: false,
    serie: '', ripetizioni: '', peso_kg: '', rpe: '', durata_min: '', distanza_km: '', note: '', categoria: 'Altro', unita: 'rip',
  }
}

async function init() {
  status.value = 'loading'
  await load()
  const s = session.value
  if (!s) {
    status.value = state.sessioni.some((x) => x.id === route.params.id) ? 'done' : 'missing'
    return
  }
  Object.assign(head, { data: s.data, titolo: s.titolo ?? '' })
  rows.value = s.voci.map(rowFrom)
  status.value = 'ok'
}
watch(() => route.params.id, init, { immediate: true })

const confirmed = computed(() => rows.value.filter((r) => r.stato === 'fatto').length)
const pending = computed(() => rows.value.filter((r) => r.stato === 'da_fare'))

function onName(r) {
  if (!existing(r) && r.nome.trim()) {
    r.categoria = guessCategory(r.nome)
    r.unita = guessUnit(r.nome)
  }
}

function lastTime(r) {
  const e = existing(r)
  return e ? (history.value.get(e.id) ?? []).at(-1) ?? null : null
}
function useLast(r) {
  const l = lastTime(r)
  if (l) Object.assign(r, { serie: str(l.serie), ripetizioni: str(l.ripetizioni), peso_kg: str(l.peso_kg), durata_min: str(l.durata_min), distanza_km: str(l.distanza_km) })
}

const num = (v) => {
  const s = String(v ?? '').trim().replace(',', '.')
  if (!s) return null
  const x = Number(s)
  return Number.isFinite(x) ? x : NaN
}
function values(r) {
  const u = unitOf(r)
  const s = num(r.serie)
  return {
    serie: u === 'cardio' || !s ? null : Math.round(s),
    ripetizioni: u === 'cardio' ? null : num(r.ripetizioni),
    peso_kg: u === 'rip' ? num(r.peso_kg) || null : null,
    rpe: num(r.rpe),
    durata_min: u === 'cardio' ? num(r.durata_min) : null,
    distanza_km: u === 'cardio' ? num(r.distanza_km) : null,
    note: r.note.trim() || null,
  }
}
function check(r) {
  if (!r.nome.trim()) return 'Scrivi il nome dell\'esercizio.'
  const v = values(r)
  for (const k of ['serie', 'ripetizioni', 'peso_kg', 'rpe', 'durata_min', 'distanza_km']) {
    if (Number.isNaN(v[k]) || (v[k] != null && v[k] < 0)) return `${r.nome}: valore non valido in "${k.replace('_', ' ')}".`
  }
  if (v.rpe != null && (v.rpe < 1 || v.rpe > 10)) return `${r.nome}: l'RPE va da 1 a 10.`
  return null
}

/** Cosa è cambiato rispetto al piano (per il badge "modificato"). */
function changes(r) {
  if (!r.piano) return null
  const out = []
  if (r.piano.esercizio && r.piano.esercizio.toLowerCase() !== r.nome.trim().toLowerCase()) out.push(`al posto di ${r.piano.esercizio}`)
  const v = values(r)
  const diff = ['serie', 'ripetizioni', 'peso_kg', 'durata_min', 'distanza_km'].some((k) => (v[k] || null) !== (Number(r.piano[k]) || null))
  if (diff) out.push(`piano: ${fmtVoce(r.piano, unitOf(r))}`)
  return out.length ? out.join(' · ') : null
}

async function exerciseId(r) {
  const e = existing(r)
  if (e) return e.id
  const created = unwrap(await supabase.from(T.esercizi)
    .insert({ space_id: spaceId.value, nome: r.nome.trim(), categoria: r.categoria || guessCategory(r.nome), unita: r.unita })
    .select().single())
  putLocal('esercizi', created)
  return created.id
}

const nextOrdine = () => Math.max(-1, ...state.voci.filter((v) => v.sessione_id === route.params.id).map((v) => v.ordine)) + 1

async function confirmRow(r, { quiet = false } = {}) {
  const err = check(r)
  if (err) { toast.error(err); return false }
  const first = !rows.value.some((x) => x !== r && x.stato === 'fatto')
  r.saving = true
  try {
    const patch = { ...values(r), esercizio_id: await exerciseId(r), stato: 'fatto' }
    const row = r.id
      ? unwrap(await supabase.from(T.voci).update(patch).eq('id', r.id).select().single())
      : unwrap(await supabase.from(T.voci).insert({ ...patch, space_id: spaceId.value, sessione_id: route.params.id, ordine: nextOrdine() }).select().single())
    putLocal('voci', row)
    Object.assign(r, { id: row.id, stato: 'fatto', open: false })
    // Ti stai allenando adesso: l'allenamento prende la data di oggi.
    if (first && head.data !== todayISO()) {
      head.data = todayISO()
      await saveHead()
      if (!quiet) toast.ok('Data dell\'allenamento spostata a oggi')
    }
    return true
  } catch (e) {
    toast.error(e)
    return false
  } finally {
    r.saving = false
  }
}

async function setStato(r, stato) {
  if (!r.id) { rows.value.splice(rows.value.indexOf(r), 1); return }
  r.saving = true
  try {
    putLocal('voci', unwrap(await supabase.from(T.voci).update({ stato }).eq('id', r.id).select().single()))
    Object.assign(r, { stato, open: false })
  } catch (e) {
    toast.error(e)
  } finally {
    r.saving = false
  }
}

async function removeRow(r) {
  if (r.id) {
    if (!confirm(`Togliere "${r.nome}" da questo allenamento?`)) return
    try {
      unwrap(await supabase.from(T.voci).delete().eq('id', r.id))
      dropLocal('voci', r.id)
    } catch (e) {
      return toast.error(e)
    }
  }
  rows.value.splice(rows.value.indexOf(r), 1)
}

function cancelEdit(r) {
  const v = session.value?.voci.find((x) => x.id === r.id)
  if (v) Object.assign(r, rowFrom(v))
}

async function confirmAll() {
  busy.value = true
  try {
    for (const r of pending.value.filter((x) => x.id || x.nome.trim())) {
      if (!(await confirmRow(r, { quiet: true }))) return
    }
    toast.ok('Confermato tutto come da piano')
  } finally {
    busy.value = false
  }
}

async function saveHead() {
  if (!head.data) return toast.error('Inserisci la data.')
  try {
    putLocal('sessioni', unwrap(await supabase.from(T.sessioni)
      .update({ data: head.data, titolo: head.titolo.trim() || null }).eq('id', route.params.id).select().single()))
  } catch (e) {
    toast.error(e)
  }
}

async function finish() {
  if (!confirmed.value) return toast.error('Conferma almeno un esercizio, oppure elimina il programma.')
  const n = pending.value.length
  if (n && !confirm(`${n} esercizi non confermati verranno segnati come saltati. Registrare l'allenamento?`)) return
  busy.value = true
  try {
    unwrap(await supabase.from(T.voci).update({ stato: 'saltato' }).eq('sessione_id', route.params.id).eq('stato', 'da_fare'))
    unwrap(await supabase.from(T.sessioni)
      .update({ stato: 'fatto', data: head.data, titolo: head.titolo.trim() || null }).eq('id', route.params.id))
    await reload()
    toast.ok('Allenamento registrato 💪')
    router.push('/allenamenti')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function deletePlan() {
  if (!confirm('Eliminare questo allenamento programmato?')) return
  try {
    unwrap(await supabase.from(T.sessioni).delete().eq('id', route.params.id))
    await reload()
    toast.ok('Programma eliminato')
    router.push('/allenamenti')
  } catch (e) {
    toast.error(e)
  }
}

const editable = (r) => canWrite.value && (r.stato === 'da_fare' || r.open)
</script>

<template>
  <div v-if="status === 'loading'" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
  <div v-else-if="status === 'done'" class="card empty">
    Questo allenamento è già stato registrato. <RouterLink to="/allenamenti">Vai alla lista</RouterLink>
  </div>
  <div v-else-if="status === 'missing'" class="card empty">
    Allenamento non trovato. <RouterLink to="/allenamenti">Torna alla lista</RouterLink>
  </div>

  <div v-else class="stack" style="gap: 14px">
    <div class="row-between">
      <RouterLink to="/allenamenti" class="small">← Allenamenti</RouterLink>
      <RouterLink v-if="canWrite && pending.length" :to="`/allenamenti/${route.params.id}/guida`" class="btn btn-primary btn-sm">▶ Allenamento guidato</RouterLink>
    </div>

    <div class="card stack" style="gap: 10px">
      <template v-if="canWrite">
        <div class="head">
          <label class="field"><span>Data</span><input v-model="head.data" type="date" class="input" required @change="saveHead" /></label>
          <label class="field wide"><span>Titolo</span><input v-model="head.titolo" class="input" placeholder="Allenamento" @change="saveHead" /></label>
        </div>
      </template>
      <div v-else>
        <div class="date">{{ fmtLong(head.data) }}</div>
        <h2 style="margin: 2px 0 0">{{ head.titolo || 'Allenamento' }}</h2>
      </div>
      <p v-if="session?.note" class="why small">{{ session.note }}</p>
      <div class="progress" :aria-label="`${confirmed} esercizi confermati su ${rows.length}`">
        <div class="bar"><i :style="{ width: rows.length ? `${(100 * (rows.length - pending.length)) / rows.length}%` : 0 }" /></div>
        <span class="small muted">{{ confirmed }}/{{ rows.length }} fatti</span>
      </div>
      <button v-if="canWrite && pending.length" type="button" class="btn btn-sm" style="align-self: flex-start" :disabled="busy" @click="confirmAll">
        ✓ Conferma tutto come da piano
      </button>
    </div>

    <datalist id="esercizi-list">
      <option v-for="n in names" :key="n" :value="n" />
    </datalist>

    <template v-for="(r, i) in rows" :key="r.key">
      <!-- Da confermare (o in modifica) -->
      <div v-if="editable(r)" class="card riga" :class="{ current: r === pending[0] }">
        <div class="riga-top">
          <span class="idx">{{ i + 1 }}</span>
          <input v-model="r.nome" class="input" list="esercizi-list" placeholder="Esercizio" aria-label="Esercizio" autocomplete="off" @change="onName(r)" />
          <button type="button" class="btn btn-ghost btn-icon btn-danger" aria-label="Togli dall'allenamento" title="Togli dall'allenamento" @click="removeRow(r)">✕</button>
        </div>

        <div v-if="r.piano" class="plan small">
          <span class="muted">Piano:</span> <strong>{{ fmtVoce(r.piano, unitOf(r)) }}</strong>
          <span v-if="r.piano.rpe" class="muted"> · RPE {{ fmtNum(r.piano.rpe) }}</span>
          <span v-if="r.piano.esercizio && r.piano.esercizio.toLowerCase() !== r.nome.trim().toLowerCase()" class="muted"> · era {{ r.piano.esercizio }}</span>
        </div>
        <div v-else class="small muted">Aggiunto da te</div>
        <details v-if="hasInfo(existing(r))" class="scheda small">
          <summary>ℹ️ Scheda dell'esercizio</summary>
          <ExerciseInfo :info="existing(r)" style="margin-top: 8px" />
        </details>

        <div v-if="r.nome.trim() && !existing(r)" class="nuovo">
          <span class="badge badge-primary">Nuovo esercizio</span>
          <select v-model="r.categoria" class="select select-sm" aria-label="Categoria">
            <option v-for="c in CATEGORIE" :key="c" :value="c">{{ c }}</option>
          </select>
          <select v-model="r.unita" class="select select-sm" aria-label="Tipo di misura">
            <option v-for="u in UNITA" :key="u.value" :value="u.value">{{ u.label }}</option>
          </select>
        </div>

        <div v-if="unitOf(r) === 'cardio'" class="nums">
          <label class="field"><span>Minuti</span><input v-model="r.durata_min" inputmode="decimal" class="input" /></label>
          <label class="field"><span>Km</span><input v-model="r.distanza_km" inputmode="decimal" class="input" /></label>
          <label class="field"><span>RPE</span><input v-model="r.rpe" inputmode="decimal" class="input" :placeholder="r.piano?.rpe ? `→ ${fmtNum(r.piano.rpe)}` : '1–10'" /></label>
        </div>
        <div v-else class="nums">
          <label class="field"><span>Serie</span><input v-model="r.serie" inputmode="numeric" class="input" /></label>
          <label class="field"><span>{{ unitOf(r) === 'sec' ? 'Secondi' : 'Rip' }}</span><input v-model="r.ripetizioni" inputmode="decimal" class="input" /></label>
          <label v-if="unitOf(r) === 'rip'" class="field"><span>Kg</span><input v-model="r.peso_kg" inputmode="decimal" class="input" placeholder="0" /></label>
          <label class="field"><span>RPE</span><input v-model="r.rpe" inputmode="decimal" class="input" :placeholder="r.piano?.rpe ? `→ ${fmtNum(r.piano.rpe)}` : '1–10'" /></label>
        </div>

        <input v-model="r.note" class="input input-sm" placeholder="Note (facoltative)" aria-label="Note" />

        <div v-if="lastTime(r)" class="last small muted">
          Ultima volta ({{ fmtShort(lastTime(r).data) }}): <strong>{{ fmtVoce(lastTime(r)) }}</strong>
          <button type="button" class="btn btn-ghost btn-sm" @click="useLast(r)">Usa</button>
        </div>

        <div class="row" style="justify-content: flex-end">
          <button v-if="r.open && r.id" type="button" class="btn btn-sm" @click="cancelEdit(r)">Annulla</button>
          <button v-if="r.stato === 'da_fare'" type="button" class="btn btn-sm" :disabled="r.saving" @click="setStato(r, 'saltato')">Salta</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="r.saving || busy" @click="confirmRow(r)">
            {{ r.saving ? 'Salvo…' : r.stato === 'fatto' ? 'Salva' : changes(r) || !r.piano ? '✓ Fatto così' : '✓ Fatto' }}
          </button>
        </div>
      </div>

      <!-- Confermato, saltato o sola lettura -->
      <div v-else class="card done" :class="r.stato">
        <span class="check" aria-hidden="true">{{ r.stato === 'fatto' ? '✓' : r.stato === 'saltato' ? '–' : i + 1 }}</span>
        <div class="done-main">
          <div class="row" style="gap: 4px 8px">
            <span class="name">{{ r.nome }}</span>
            <span class="what">{{ fmtVoce(r.stato === 'da_fare' && r.piano ? r.piano : values(r), unitOf(r)) }}</span>
            <span v-if="r.rpe" class="muted small">RPE {{ r.rpe }}</span>
            <span v-if="r.stato === 'saltato'" class="badge">saltato</span>
            <span v-else-if="r.stato === 'fatto' && !r.piano" class="badge">aggiunto</span>
            <span v-else-if="r.stato === 'fatto' && changes(r)" class="badge badge-primary">modificato</span>
          </div>
          <div v-if="r.stato === 'fatto' && changes(r)" class="muted small">{{ changes(r) }}</div>
          <div v-if="r.note" class="muted small">{{ r.note }}</div>
        </div>
        <template v-if="canWrite">
          <button v-if="r.stato === 'fatto'" type="button" class="btn btn-ghost btn-sm" @click="r.open = true">Modifica</button>
          <button v-else-if="r.stato === 'saltato'" type="button" class="btn btn-ghost btn-sm" :disabled="r.saving" @click="setStato(r, 'da_fare')">Ripristina</button>
        </template>
      </div>
    </template>

    <template v-if="canWrite">
      <button type="button" class="btn" style="align-self: flex-start" @click="rows.push(newRow())">+ Aggiungi esercizio</button>

      <div class="row actions">
        <button type="button" class="btn btn-ghost btn-danger" :disabled="busy" @click="deletePlan">Elimina</button>
        <span class="spacer" />
        <button type="button" class="btn btn-primary" :disabled="busy || !confirmed" @click="finish">
          {{ busy ? 'Salvo…' : 'Termina allenamento' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.head { display: grid; gap: 10px; grid-template-columns: 1fr; }
@media (min-width: 560px) { .head { grid-template-columns: 170px 1fr; } }
.date { font-size: .8rem; color: var(--muted); text-transform: capitalize; }
.why { margin: 0; padding: 8px 12px; border-radius: var(--radius); background: var(--primary-soft); white-space: pre-line; }
.progress { display: flex; align-items: center; gap: 10px; }
.bar { flex: 1; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--ok); transition: width .25s; }
.riga { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.riga.current { border-color: var(--primary); }
.riga-top { display: flex; align-items: center; gap: 8px; }
.idx { width: 22px; height: 22px; border-radius: 50%; background: var(--surface-2); color: var(--muted); font-size: .78rem; display: grid; place-items: center; flex-shrink: 0; }
.plan { padding: 6px 10px; border-radius: 8px; background: var(--surface-2); }
.scheda summary { cursor: pointer; color: var(--primary); }
.nuovo { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.select-sm, .input-sm { padding: 6px 9px; font-size: .88rem; width: auto; }
.input-sm { width: 100%; }
.nums { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(64px, 1fr)); }
.nums .input { text-align: center; font-variant-numeric: tabular-nums; }
.last { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.done { display: flex; align-items: center; gap: 10px; padding: 10px 12px; box-shadow: none; }
.done-main { flex: 1; min-width: 0; }
.done .check { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; font-size: .8rem; font-weight: 700; background: var(--surface-2); color: var(--muted); }
.done.fatto .check { background: var(--ok); color: var(--surface); }
.done.saltato .name, .done.saltato .what { color: var(--muted); text-decoration: line-through; }
.name { font-weight: 500; }
.what { font-variant-numeric: tabular-nums; white-space: nowrap; }
.actions { position: sticky; bottom: 0; padding: 10px 0; background: var(--bg); border-top: 1px solid var(--border); flex-wrap: nowrap; }
</style>
