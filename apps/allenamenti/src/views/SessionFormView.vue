<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { supabase, unwrap, toast, todayISO, useSpace } from '@shared'
import { T } from '../db.js'
import { useData } from '../store.js'
import { CATEGORIE, UNITA, guessCategory, guessUnit } from '../lib/categories.js'
import { fmtShort, fmtVoce } from '../lib/metrics.js'

const { state, sessions, history, load, reload } = useData()
const { spaceId, canWrite } = useSpace()
const route = useRoute()
const router = useRouter()

const editId = computed(() => (route.name === 'edit' ? route.params.id : null))
// ?piano=1: programma l'allenamento (finisce nei "Da fare") invece di registrarlo.
const isPlan = computed(() => !editId.value && route.query.piano === '1')
const form = reactive({ data: todayISO(), titolo: '', note: '', durata_min: '' })
const rows = ref([])
const saving = ref(false)
const notFound = ref(false)
let seq = 0

const byName = computed(() => new Map(state.esercizi.map((e) => [e.nome.toLowerCase(), e])))
const names = computed(() => [...state.esercizi].map((e) => e.nome).sort((a, b) => a.localeCompare(b, 'it')))

const str = (v) => (v == null ? '' : String(v).replace('.', ','))
function newRow(v = {}) {
  return {
    key: ++seq,
    nome: v.esercizio?.nome ?? '',
    serie: str(v.serie), ripetizioni: str(v.ripetizioni), peso_kg: str(v.peso_kg), rpe: str(v.rpe),
    durata_min: str(v.durata_min), distanza_km: str(v.distanza_km), note: v.note ?? '',
    categoria: '', unita: 'rip', piano: v.piano ?? null,
  }
}

const existing = (r) => byName.value.get(r.nome.trim().toLowerCase()) ?? null
const unitOf = (r) => existing(r)?.unita ?? r.unita

function onName(r) {
  if (!existing(r) && r.nome.trim()) {
    r.categoria = guessCategory(r.nome)
    r.unita = guessUnit(r.nome)
  }
}

/** Ultima volta che l'esercizio è stato fatto (escluso questo allenamento). */
function lastTime(r) {
  const e = existing(r)
  if (!e) return null
  const h = (history.value.get(e.id) ?? []).filter((v) => v.sessione_id !== editId.value)
  return h.at(-1) ?? null
}
function useLast(r) {
  const l = lastTime(r)
  if (!l) return
  Object.assign(r, {
    serie: str(l.serie), ripetizioni: str(l.ripetizioni), peso_kg: str(l.peso_kg), rpe: '',
    durata_min: str(l.durata_min), distanza_km: str(l.distanza_km),
  })
}

function move(i, d) {
  const j = i + d
  if (j < 0 || j >= rows.value.length) return
  const r = rows.value
  ;[r[i], r[j]] = [r[j], r[i]]
}

async function init() {
  await load()
  notFound.value = false
  // Un allenamento programmato si completa dalla sua pagina, non da qui.
  if (editId.value && state.sessioni.some((x) => x.id === editId.value && x.stato === 'da_fare')) {
    router.replace(`/allenamenti/${editId.value}/svolgi`)
    return
  }
  const src = editId.value ?? route.query.da
  const s = src ? sessions.value.find((x) => x.id === src) : null
  if (editId.value && !s) { notFound.value = true; return }
  if (s) {
    // il piano originale resta solo modificando lo stesso allenamento, non copiandolo
    rows.value = s.voci.map((v) => newRow(editId.value ? v : { ...v, piano: null }))
    if (editId.value) Object.assign(form, { data: s.data, titolo: s.titolo ?? '', note: s.note ?? '', durata_min: s.durata_min ?? '' })
    else Object.assign(form, { data: todayISO(), titolo: s.titolo ?? '', note: '', durata_min: '' })
  } else {
    Object.assign(form, { data: todayISO(), titolo: '', note: '', durata_min: '' })
    rows.value = [newRow()]
  }
}
watch(() => [route.name, route.params.id, route.query.da, route.query.piano], init, { immediate: true })

const num = (v) => {
  const s = String(v ?? '').trim().replace(',', '.')
  if (!s) return null
  const x = Number(s)
  return Number.isFinite(x) ? x : NaN
}

function validate() {
  if (!form.data) return 'Inserisci la data.'
  const filled = rows.value.filter((r) => r.nome.trim())
  if (!filled.length) return 'Aggiungi almeno un esercizio.'
  for (const r of filled) {
    for (const k of ['serie', 'ripetizioni', 'peso_kg', 'rpe', 'durata_min', 'distanza_km']) {
      const x = num(r[k])
      if (Number.isNaN(x) || (x != null && x < 0)) return `${r.nome}: valore non valido in "${k.replace('_', ' ')}".`
    }
    const rpe = num(r.rpe)
    if (rpe != null && (rpe < 1 || rpe > 10)) return `${r.nome}: l'RPE va da 1 a 10.`
  }
  return null
}

async function save() {
  const err = validate()
  if (err) return toast.error(err)
  saving.value = true
  try {
    const filled = rows.value.filter((r) => r.nome.trim())
    if (isPlan.value) return await savePlan(filled)
    // 1. esercizi nuovi
    const ids = new Map([...byName.value].map(([k, e]) => [k, e.id]))
    const nuovi = new Map()
    for (const r of filled) {
      const k = r.nome.trim().toLowerCase()
      if (!ids.has(k) && !nuovi.has(k)) nuovi.set(k, { space_id: spaceId.value, nome: r.nome.trim(), categoria: r.categoria || guessCategory(r.nome), unita: r.unita })
    }
    if (nuovi.size) {
      const created = unwrap(await supabase.from(T.esercizi).insert([...nuovi.values()]).select('id, nome'))
      for (const e of created) ids.set(e.nome.toLowerCase(), e.id)
    }
    // 2. sessione
    const d = num(form.durata_min)
    const payload = { space_id: spaceId.value, data: form.data, titolo: form.titolo.trim() || null, note: form.note.trim() || null, durata_min: d ? Math.round(d) : null }
    let sid = editId.value
    if (sid) {
      unwrap(await supabase.from(T.sessioni).update(payload).eq('id', sid))
      // gli esercizi saltati di un allenamento programmato restano (non sono nel form)
      unwrap(await supabase.from(T.voci).delete().eq('sessione_id', sid).eq('stato', 'fatto'))
    } else {
      sid = unwrap(await supabase.from(T.sessioni).insert(payload).select('id').single()).id
    }
    // 3. voci
    const voci = filled.map((r, i) => {
      const u = unitOf(r)
      const s = num(r.serie)
      return {
        space_id: spaceId.value,
        sessione_id: sid,
        esercizio_id: ids.get(r.nome.trim().toLowerCase()),
        ordine: i,
        serie: u === 'cardio' || !s ? null : Math.round(s),
        ripetizioni: u === 'cardio' ? null : num(r.ripetizioni),
        peso_kg: u === 'rip' ? num(r.peso_kg) || null : null,
        rpe: num(r.rpe),
        durata_min: u === 'cardio' ? num(r.durata_min) : null,
        distanza_km: u === 'cardio' ? num(r.distanza_km) : null,
        note: r.note.trim() || null,
        piano: r.piano,
      }
    })
    unwrap(await supabase.from(T.voci).insert(voci))
    await reload()
    toast.ok(editId.value ? 'Allenamento aggiornato' : 'Allenamento salvato 💪')
    router.push('/allenamenti')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

/** Programma: stessa funzione SQL usata dall'import JSON e dalla skill Claude. */
async function savePlan(filled) {
  const d = num(form.durata_min)
  const esercizi = filled.map((r) => {
    const u = unitOf(r)
    const nuovo = !existing(r)
    return {
      nome: r.nome.trim(),
      ...(nuovo ? { categoria: r.categoria || guessCategory(r.nome), unita: r.unita } : {}),
      serie: u === 'cardio' ? null : num(r.serie),
      ripetizioni: u === 'cardio' ? null : num(r.ripetizioni),
      peso_kg: u === 'rip' ? num(r.peso_kg) : null,
      rpe: num(r.rpe),
      durata_min: u === 'cardio' ? num(r.durata_min) : null,
      distanza_km: u === 'cardio' ? num(r.distanza_km) : null,
      note: r.note.trim() || null,
    }
  })
  unwrap(await supabase.rpc('allenamenti_pianifica', {
    p_space_id: spaceId.value,
    p_piano: { data: form.data, titolo: form.titolo.trim() || null, note: form.note.trim() || null, durata_min: d ? Math.round(d) : null, esercizi },
    p_fonte: 'manuale',
  }))
  await reload()
  toast.ok('Allenamento aggiunto ai Da fare')
  router.push('/allenamenti')
}
</script>

<template>
  <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
  <div v-else-if="!canWrite" class="card empty">
    Questi dati sono in sola lettura. <RouterLink to="/allenamenti">Torna alla lista</RouterLink>
  </div>
  <div v-else-if="notFound" class="card empty">
    Allenamento non trovato. <RouterLink to="/allenamenti">Torna alla lista</RouterLink>
  </div>

  <form v-else class="stack" style="gap: 16px" @submit.prevent="save">
    <div>
      <h2 style="margin: 0">{{ editId ? 'Modifica allenamento' : isPlan ? 'Programma allenamento' : 'Nuovo allenamento' }}</h2>
      <p v-if="isPlan" class="muted small" style="margin: 4px 0 0">
        Finisce tra i <strong>Da fare</strong>: lo confermi esercizio per esercizio mentre ti alleni.
        Puoi anche <RouterLink to="/programma">farlo preparare a Claude o importarlo da JSON</RouterLink>.
      </p>
    </div>

    <div class="card head">
      <label class="field"><span>Data</span><input v-model="form.data" type="date" class="input" required /></label>
      <label class="field"><span>Durata (min)</span><input v-model="form.durata_min" inputmode="numeric" class="input" placeholder="—" /></label>
      <label class="field wide"><span>Titolo (facoltativo)</span><input v-model="form.titolo" class="input" placeholder="Es. Gambe + pliometria" /></label>
    </div>

    <datalist id="esercizi-list">
      <option v-for="n in names" :key="n" :value="n" />
    </datalist>

    <div v-for="(r, i) in rows" :key="r.key" class="card riga">
      <div class="riga-top">
        <span class="idx">{{ i + 1 }}</span>
        <input
          v-model="r.nome" class="input" list="esercizi-list" placeholder="Esercizio" aria-label="Esercizio"
          autocomplete="off" @change="onName(r)"
        />
        <div class="row" style="gap: 0; flex-wrap: nowrap">
          <button type="button" class="btn btn-ghost btn-icon" :disabled="i === 0" aria-label="Sposta su" @click="move(i, -1)">↑</button>
          <button type="button" class="btn btn-ghost btn-icon" :disabled="i === rows.length - 1" aria-label="Sposta giù" @click="move(i, 1)">↓</button>
          <button type="button" class="btn btn-ghost btn-icon btn-danger" aria-label="Rimuovi" @click="rows.splice(i, 1)">✕</button>
        </div>
      </div>

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
        <label class="field"><span>RPE</span><input v-model="r.rpe" inputmode="decimal" class="input" :placeholder="isPlan ? 'obiett.' : '1–10'" :title="isPlan ? 'RPE obiettivo (1–10)' : undefined" /></label>
      </div>
      <div v-else class="nums">
        <label class="field"><span>Serie</span><input v-model="r.serie" inputmode="numeric" class="input" /></label>
        <label class="field"><span>{{ unitOf(r) === 'sec' ? 'Secondi' : 'Rip' }}</span><input v-model="r.ripetizioni" inputmode="decimal" class="input" /></label>
        <label v-if="unitOf(r) === 'rip'" class="field"><span>Kg</span><input v-model="r.peso_kg" inputmode="decimal" class="input" placeholder="0" /></label>
        <label class="field"><span>RPE</span><input v-model="r.rpe" inputmode="decimal" class="input" :placeholder="isPlan ? 'obiett.' : '1–10'" :title="isPlan ? 'RPE obiettivo (1–10)' : undefined" /></label>
      </div>

      <input v-model="r.note" class="input input-sm" placeholder="Note (facoltative)" aria-label="Note" />

      <div v-if="lastTime(r)" class="last small muted">
        Ultima volta ({{ fmtShort(lastTime(r).data) }}): <strong>{{ fmtVoce(lastTime(r)) }}</strong>
        <button type="button" class="btn btn-ghost btn-sm" @click="useLast(r)">Usa</button>
      </div>
    </div>

    <button type="button" class="btn" style="align-self: flex-start" @click="rows.push(newRow())">+ Aggiungi esercizio</button>

    <label class="field"><span>Note sull'allenamento</span><textarea v-model="form.note" class="textarea" :placeholder="isPlan ? 'Obiettivo, indicazioni…' : 'Come è andata, sensazioni…'" /></label>

    <div class="row actions">
      <RouterLink to="/allenamenti" class="btn">Annulla</RouterLink>
      <button class="btn btn-primary" :disabled="saving">{{ saving ? 'Salvataggio…' : isPlan ? 'Aggiungi ai Da fare' : 'Salva allenamento' }}</button>
    </div>
  </form>
</template>

<style scoped>
.head { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
.head .wide { grid-column: 1 / -1; }
@media (min-width: 640px) { .head { grid-template-columns: 170px 120px 1fr; } .head .wide { grid-column: auto; } }
.riga { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.riga-top { display: flex; align-items: center; gap: 8px; }
.idx { width: 22px; height: 22px; border-radius: 50%; background: var(--surface-2); color: var(--muted); font-size: .78rem; display: grid; place-items: center; flex-shrink: 0; }
.nuovo { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.select-sm, .input-sm { padding: 6px 9px; font-size: .88rem; width: auto; }
.input-sm { width: 100%; }
.nums { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(64px, 1fr)); }
.nums .input { text-align: center; font-variant-numeric: tabular-nums; }
.last { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.actions { justify-content: flex-end; position: sticky; bottom: 0; padding: 10px 0; background: var(--bg); border-top: 1px solid var(--border); }
</style>
