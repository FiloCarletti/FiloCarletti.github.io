<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { supabase, unwrap, toast, todayISO, useSpace } from '@shared'
import { T } from '../db.js'
import { putLocal, useData } from '../store.js'
import CatDot from '../components/CatDot.vue'
import ExerciseInfo from '../components/ExerciseInfo.vue'
import Stepper from '../components/Stepper.vue'
import { beep, clearProgress, fmtClock, hasInfo, loadProgress, restFor, saveProgress, unlockAudio, useNow, useWakeLock } from '../lib/guide.js'
import { fmtNum, fmtShort, fmtVoce } from '../lib/metrics.js'

// Allenamento guidato: un esercizio alla volta, con contatore delle serie, timer di recupero,
// timer per gli esercizi a tempo e cronometro per il cardio. Le serie fatte restano nel browser
// finché l'esercizio non viene salvato; "Termina" registra l'allenamento con la durata reale.
const { state, planned, history, load, reload } = useData()
const { canWrite } = useSpace()
const route = useRoute()
const router = useRouter()
const now = useNow()
useWakeLock()

const sid = computed(() => route.params.id)
const session = computed(() => planned.value.find((s) => s.id === sid.value) ?? null)
const voci = computed(() => session.value?.voci ?? [])
const pending = computed(() => voci.value.filter((v) => v.stato === 'da_fare'))
const status = ref('loading') // loading | ok | missing | done
const saving = ref(false)
const showInfo = ref(false)

const fresh = () => ({ startedAt: null, cur: null, work: {}, timer: null, restOver: false })
const p = reactive(fresh())
watch(p, () => status.value === 'ok' && saveProgress(sid.value, p), { deep: true })

async function init() {
  status.value = 'loading'
  await load()
  if (!session.value) {
    status.value = state.sessioni.some((x) => x.id === sid.value) ? 'done' : 'missing'
    return
  }
  if (!canWrite.value) { router.replace(`/allenamenti/${sid.value}/svolgi`); return }
  Object.assign(p, fresh(), loadProgress(sid.value) ?? {})
  ensureWork(cur.value)
  status.value = 'ok'
}
watch(sid, init, { immediate: true })

/* ---------- esercizio corrente ---------- */
const cur = computed(() => voci.value.find((v) => v.id === p.cur && v.stato === 'da_fare') ?? pending.value[0] ?? null)
const idx = computed(() => voci.value.indexOf(cur.value))
const unit = computed(() => cur.value?.esercizio.unita ?? 'rip')
const plan = computed(() => cur.value?.piano ?? {})
const w = computed(() => (cur.value ? p.work[cur.value.id] : null))
const last = computed(() => (cur.value ? (history.value.get(cur.value.esercizio_id) ?? []).at(-1) ?? null : null))

const n = (x) => (x == null || x === '' ? null : Number(x))
function ensureWork(v) {
  if (!v || p.work[v.id]) return
  const pl = v.piano ?? {}
  const u = v.esercizio.unita
  p.work[v.id] = {
    sets: [],
    serie: n(pl.serie ?? v.serie) || (u === 'cardio' ? 1 : 3),
    rip: n(pl.ripetizioni ?? v.ripetizioni) || (u === 'sec' ? 30 : 10),
    kg: n(pl.peso_kg ?? v.peso_kg) ?? 0,
    minuti: n(pl.durata_min ?? v.durata_min) ?? 10,
    km: n(pl.distanza_km ?? v.distanza_km),
    rpe: null,
    note: '',
    summary: false,
  }
}
watch(() => cur.value?.id, () => { ensureWork(cur.value); showInfo.value = false }, { immediate: true })

/* ---------- timer ---------- */
const elapsedMs = (t) => (t.acc ?? 0) + (t.start ? now.value - t.start : 0)
const timer = computed(() => p.timer)
const left = computed(() => (timer.value ? timer.value.dur - elapsedMs(timer.value) / 1000 : 0))
const pct = computed(() => (timer.value?.dur ? Math.min(100, (100 * elapsedMs(timer.value)) / 1000 / timer.value.dur) : 0))
const workoutClock = computed(() => (p.startedAt ? fmtClock((now.value - p.startedAt) / 1000) : '0:00'))
const timerFor = (kind) => timer.value?.kind === kind && timer.value.voceId === cur.value?.id

watch(now, () => {
  const t = p.timer
  if (!t || t.fired || (t.kind === 'cardio' && !t.start)) return
  if (elapsedMs(t) / 1000 < t.dur) return
  if (t.kind === 'prep') {
    beep(1)
    p.timer = { kind: 'hold', voceId: t.voceId, start: Date.now(), dur: t.hold }
  } else if (t.kind === 'rest') {
    beep(3)
    p.timer = null
    p.restOver = true
  } else if (t.kind === 'hold') {
    beep(2)
    const v = voci.value.find((x) => x.id === t.voceId)
    p.timer = null
    if (v) recordSet(v, t.dur)
  } else if (t.kind === 'cardio') {
    beep(2)
    t.fired = true
  }
})

function touch() {
  unlockAudio()
  p.restOver = false
  p.startedAt ??= Date.now()
}

/* ---------- serie ---------- */
function recordSet(v, value) {
  const wk = p.work[v.id]
  wk.sets.push({ v: value, kg: v.esercizio.unita === 'rip' ? wk.kg || null : null })
  if (wk.sets.length >= wk.serie) {
    wk.summary = true
    p.timer = null
  } else {
    p.timer = { kind: 'rest', voceId: v.id, start: Date.now(), dur: restFor(v) }
  }
}
function setDone() {
  touch()
  recordSet(cur.value, w.value.rip)
}
function startHold() {
  touch()
  p.timer = { kind: 'prep', voceId: cur.value.id, start: Date.now(), dur: 5, hold: w.value.rip }
}
function stopHold() {
  touch()
  const t = p.timer
  const secs = t?.kind === 'hold' ? Math.round(elapsedMs(t) / 1000) : 0
  p.timer = null
  if (secs > 0) recordSet(cur.value, secs)
}
function undoSet() {
  touch()
  w.value.sets.pop()
  w.value.summary = false
  p.timer = null
}
function addSet() {
  touch()
  w.value.serie = w.value.sets.length + 1
  w.value.summary = false
  p.timer = { kind: 'rest', voceId: cur.value.id, start: Date.now(), dur: restFor(cur.value) }
}
function finishEarly() {
  touch()
  p.timer = null
  w.value.summary = true
}
const restAdjust = (d) => { if (p.timer) p.timer.dur = Math.max(0, p.timer.dur + d) }
const skipRest = () => { touch(); p.timer = null }

/* ---------- cardio ---------- */
function cardioToggle() {
  touch()
  const t = p.timer
  if (!timerFor('cardio')) p.timer = { kind: 'cardio', voceId: cur.value.id, start: Date.now(), acc: 0, dur: (w.value.minuti || 0) * 60 }
  else if (t.start) { t.acc = elapsedMs(t); t.start = null }
  else t.start = Date.now()
}
function cardioDone() {
  touch()
  if (timerFor('cardio')) {
    const min = elapsedMs(p.timer) / 60000
    if (min >= 0.5) w.value.minuti = Math.round(min * 10) / 10
  }
  p.timer = null
  w.value.summary = true
}

/* ---------- salvataggio ---------- */
const fmtSet = (s, u) => (u === 'sec' ? `${fmtNum(s.v)}″` : `${fmtNum(s.v)}${s.kg ? ` × ${fmtNum(s.kg)}` : ''}`)

/** Valori da salvare per la voce corrente, a partire dalle serie fatte. */
const result = computed(() => {
  const v = cur.value, wk = w.value
  if (!v || !wk) return null
  const u = unit.value
  if (u === 'cardio') return { serie: null, ripetizioni: null, peso_kg: null, durata_min: n(wk.minuti), distanza_km: n(wk.km), dettaglio: null }
  const sets = wk.sets
  const reps = sets.map((s) => s.v)
  const kgs = sets.map((s) => s.kg ?? 0)
  const vario = new Set(reps).size > 1 || new Set(kgs).size > 1
  return {
    serie: sets.length || null,
    ripetizioni: sets.length ? Math.round((reps.reduce((a, x) => a + x, 0) / sets.length) * 10) / 10 : null,
    peso_kg: u === 'rip' ? Math.max(0, ...kgs) || null : null,
    durata_min: null,
    distanza_km: null,
    dettaglio: vario ? `Serie: ${sets.map((s) => fmtSet(s, u)).join(' · ')}` : null,
  }
})

async function saveExercise() {
  const v = cur.value, wk = w.value, r = result.value
  if (!r) return
  if (unit.value !== 'cardio' && !r.serie) return toast.error('Segna almeno una serie, oppure salta l\'esercizio.')
  touch()
  saving.value = true
  const first = !voci.value.some((x) => x.stato === 'fatto')
  try {
    const patch = {
      serie: r.serie, ripetizioni: r.ripetizioni, peso_kg: r.peso_kg, durata_min: r.durata_min, distanza_km: r.distanza_km,
      rpe: wk.rpe, stato: 'fatto',
      note: [v.note, wk.note.trim(), r.dettaglio].filter(Boolean).join(' · ') || null,
    }
    putLocal('voci', unwrap(await supabase.from(T.voci).update(patch).eq('id', v.id).select().single()))
    // ti stai allenando adesso: l'allenamento prende la data di oggi
    if (first && session.value.data !== todayISO()) {
      putLocal('sessioni', unwrap(await supabase.from(T.sessioni).update({ data: todayISO() }).eq('id', sid.value).select().single()))
    }
    delete p.work[v.id]
    goNext(v)
    toast.ok(`${v.esercizio.nome} ✓`)
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

async function skipExercise() {
  const v = cur.value
  if (!confirm(`Saltare "${v.esercizio.nome}"?`)) return
  touch()
  try {
    putLocal('voci', unwrap(await supabase.from(T.voci).update({ stato: 'saltato' }).eq('id', v.id).select().single()))
    delete p.work[v.id]
    if (p.timer?.voceId === v.id) p.timer = null
    goNext(v)
  } catch (e) {
    toast.error(e)
  }
}

/** Prossimo esercizio da fare dopo `v` (poi si riparte da capo con quelli rimasti). */
function goNext(v) {
  const order = voci.value
  const i = order.indexOf(v)
  const next = [...order.slice(i + 1), ...order.slice(0, i)].find((x) => x.stato === 'da_fare' && x.id !== v.id)
  p.cur = next?.id ?? null
}
function goTo(v) {
  if (v.stato !== 'da_fare' || v.id === cur.value?.id) return
  touch()
  if (p.timer && p.timer.kind !== 'rest') p.timer = null
  p.cur = v.id
}

async function finish() {
  touch()
  saving.value = true
  try {
    const durata = p.startedAt ? Math.max(1, Math.round((Date.now() - p.startedAt) / 60000)) : null
    unwrap(await supabase.from(T.voci).update({ stato: 'saltato' }).eq('sessione_id', sid.value).eq('stato', 'da_fare'))
    unwrap(await supabase.from(T.sessioni).update({ stato: 'fatto', ...(durata ? { durata_min: durata } : {}) }).eq('id', sid.value))
    clearProgress(sid.value)
    status.value = 'loading'
    await reload()
    toast.ok('Allenamento registrato 💪')
    router.push('/allenamenti')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

const doneCount = computed(() => voci.value.filter((v) => v.stato === 'fatto').length)
const skippedCount = computed(() => voci.value.filter((v) => v.stato === 'saltato').length)
const RPE = [6, 7, 8, 9, 10]
</script>

<template>
  <div v-if="status === 'loading'" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
  <div v-else-if="status === 'done'" class="card empty">
    Questo allenamento è già stato registrato. <RouterLink to="/allenamenti">Vai alla lista</RouterLink>
  </div>
  <div v-else-if="status === 'missing'" class="card empty">
    Allenamento non trovato. <RouterLink to="/allenamenti">Torna alla lista</RouterLink>
  </div>

  <div v-else class="stack guided" style="gap: 12px">
    <div class="row-between">
      <RouterLink :to="`/allenamenti/${sid}/svolgi`" class="small">≡ Elenco</RouterLink>
      <span class="clock" title="Tempo di allenamento">⏱ {{ workoutClock }}</span>
    </div>

    <div class="top">
      <div class="small muted ellipsis">{{ session.titolo || 'Allenamento' }}</div>
      <div class="dots" role="tablist" aria-label="Esercizi">
        <button
          v-for="(v, i) in voci" :key="v.id" type="button" class="dot" role="tab"
          :class="[v.stato, { on: v === cur }]" :aria-selected="v === cur"
          :aria-label="`${i + 1}. ${v.esercizio.nome} (${v.stato === 'fatto' ? 'fatto' : v.stato === 'saltato' ? 'saltato' : 'da fare'})`"
          :disabled="v.stato !== 'da_fare'" @click="goTo(v)"
        >{{ v.stato === 'fatto' ? '✓' : v.stato === 'saltato' ? '–' : i + 1 }}</button>
      </div>
    </div>

    <!-- Fine: niente più da fare -->
    <section v-if="!cur" class="card stack end">
      <div style="font-size: 2.4rem">🎉</div>
      <h2 style="margin: 0">Allenamento finito</h2>
      <p class="muted" style="margin: 0">
        {{ doneCount }} esercizi fatti<template v-if="skippedCount">, {{ skippedCount }} saltati</template> · {{ workoutClock }}
      </p>
      <button type="button" class="btn btn-primary big" :disabled="saving || !doneCount" @click="finish">
        {{ saving ? 'Salvo…' : 'Termina e registra' }}
      </button>
      <p v-if="!doneCount" class="small muted" style="margin: 0">Nessun esercizio fatto: torna all'<RouterLink :to="`/allenamenti/${sid}/svolgi`">elenco</RouterLink> per modificarlo o eliminarlo.</p>
    </section>

    <template v-else-if="w">
      <!-- Esercizio -->
      <section class="card stack ex" style="gap: 8px">
        <div class="row-between" style="flex-wrap: nowrap; align-items: flex-start">
          <div style="min-width: 0">
            <div class="small muted">Esercizio {{ idx + 1 }} di {{ voci.length }}</div>
            <h2 class="ex-name">{{ cur.esercizio.nome }}</h2>
            <CatDot :cat="cur.esercizio.categoria" />
          </div>
          <button v-if="hasInfo(cur.esercizio)" type="button" class="btn btn-sm" :aria-expanded="showInfo" @click="showInfo = !showInfo">
            {{ showInfo ? 'Chiudi' : 'ℹ️ Scheda' }}
          </button>
        </div>
        <div class="plan small">
          <span class="muted">Piano: </span>
          <strong>{{ cur.piano ? fmtVoce(cur.piano, unit) : fmtVoce(cur, unit) }}</strong>
          <span v-if="plan.rpe" class="muted"> · RPE {{ fmtNum(plan.rpe) }}</span>
          <span v-if="unit !== 'cardio'" class="muted"> · recupero {{ fmtClock(restFor(cur)) }}</span>
        </div>
        <p v-if="cur.note" class="small" style="margin: 0">📝 {{ cur.note }}</p>
        <p v-if="last" class="small muted" style="margin: 0">Ultima volta ({{ fmtShort(last.data) }}): {{ fmtVoce(last) }}<template v-if="last.rpe"> · RPE {{ fmtNum(last.rpe) }}</template></p>
        <ExerciseInfo v-if="showInfo" :info="cur.esercizio" class="info-box" />
        <RouterLink v-else-if="!hasInfo(cur.esercizio)" :to="`/esercizi/${cur.esercizio_id}`" class="small">Aggiungi la scheda dell'esercizio</RouterLink>
      </section>

      <!-- Riepilogo prima di salvare -->
      <section v-if="w.summary" class="card stack" style="gap: 12px">
        <h3 style="margin: 0">Com'è andata?</h3>
        <div v-if="unit !== 'cardio'" class="sets">
          <span v-for="(s, i) in w.sets" :key="i" class="set done">✓ {{ fmtSet(s, unit) }}</span>
        </div>
        <div v-else class="pair">
          <Stepper v-model="w.minuti" label="Minuti" :step="1" />
          <Stepper :model-value="w.km ?? 0" label="Km" :step="0.5" @update:model-value="w.km = $event || null" />
        </div>
        <div>
          <div class="lbl">Fatica (RPE)</div>
          <div class="rpe">
            <button v-for="r in RPE" :key="r" type="button" class="btn" :class="{ 'btn-primary': w.rpe === r }" :aria-pressed="w.rpe === r" @click="w.rpe = w.rpe === r ? null : r">{{ r }}</button>
          </div>
        </div>
        <input v-model="w.note" class="input" placeholder="Note (facoltative)" aria-label="Note" />
        <button type="button" class="btn btn-primary big" :disabled="saving" @click="saveExercise">
          {{ saving ? 'Salvo…' : pending.length > 1 ? 'Salva e vai avanti →' : 'Salva' }}
        </button>
        <div v-if="unit !== 'cardio'" class="row" style="justify-content: center">
          <button type="button" class="btn btn-ghost btn-sm" @click="addSet">+ Un'altra serie</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="undoSet">Annulla ultima serie</button>
        </div>
      </section>

      <!-- Recupero -->
      <section v-else-if="timer?.kind === 'rest'" class="card stack timer rest" style="gap: 10px">
        <div class="lbl">Recupero</div>
        <div class="big-clock" aria-live="polite">{{ fmtClock(left) }}</div>
        <div class="bar"><i :style="{ width: `${pct}%` }" /></div>
        <div class="small muted">
          Poi: <strong>{{ cur.esercizio.nome }}</strong>, serie {{ w.sets.length + 1 }} di {{ w.serie }}
        </div>
        <div class="row" style="justify-content: center">
          <button type="button" class="btn" @click="restAdjust(-15)">−15″</button>
          <button type="button" class="btn btn-primary" @click="skipRest">Salta recupero</button>
          <button type="button" class="btn" @click="restAdjust(15)">+15″</button>
        </div>
      </section>

      <!-- Esercizio a tempo -->
      <section v-else-if="unit === 'sec'" class="card stack timer" style="gap: 12px">
        <div v-if="p.restOver" class="go">Vai! 💪</div>
        <div class="lbl">Serie {{ Math.min(w.sets.length + 1, w.serie) }} di {{ w.serie }}</div>
        <div class="sets">
          <span v-for="i in Math.max(w.serie, w.sets.length)" :key="i" class="set" :class="{ done: i <= w.sets.length }">
            {{ i <= w.sets.length ? `✓ ${w.sets[i - 1].v}″` : i }}
          </span>
        </div>
        <template v-if="timerFor('prep')">
          <div class="lbl">Preparati</div>
          <div class="big-clock">{{ Math.ceil(left) }}</div>
          <button type="button" class="btn" @click="p.timer = null">Annulla</button>
        </template>
        <template v-else-if="timerFor('hold')">
          <div class="big-clock hold" aria-live="polite">{{ fmtClock(left) }}</div>
          <div class="bar"><i :style="{ width: `${pct}%` }" /></div>
          <button type="button" class="btn big" @click="stopHold">■ Stop ({{ Math.round(elapsedMs(timer) / 1000) }}″)</button>
        </template>
        <template v-else>
          <Stepper v-model="w.rip" label="Secondi" :step="5" :min="1" />
          <button type="button" class="btn btn-primary big" @click="startHold">▶ Avvia {{ w.rip }}″</button>
          <div class="row" style="justify-content: center">
            <button v-if="w.sets.length" type="button" class="btn btn-ghost btn-sm" @click="undoSet">Annulla ultima serie</button>
            <button v-if="w.sets.length" type="button" class="btn btn-ghost btn-sm" @click="finishEarly">Ho finito</button>
          </div>
        </template>
      </section>

      <!-- Cardio -->
      <section v-else-if="unit === 'cardio'" class="card stack timer" style="gap: 12px">
        <div class="lbl">Obiettivo {{ fmtNum(w.minuti) }} min<template v-if="w.km"> · {{ fmtNum(w.km) }} km</template></div>
        <div class="big-clock" :class="{ hold: timerFor('cardio') && timer.start }" aria-live="off">
          {{ fmtClock(timerFor('cardio') ? elapsedMs(timer) / 1000 : 0) }}
        </div>
        <div v-if="timerFor('cardio')" class="bar"><i :style="{ width: `${pct}%` }" /></div>
        <div v-if="timerFor('cardio') && timer.fired" class="go">Obiettivo raggiunto 🎯</div>
        <div class="row" style="justify-content: center">
          <button type="button" class="btn big" :class="{ 'btn-primary': !timerFor('cardio') || !timer.start }" @click="cardioToggle">
            {{ !timerFor('cardio') ? '▶ Avvia' : timer.start ? '⏸ Pausa' : '▶ Riprendi' }}
          </button>
          <button type="button" class="btn big" @click="cardioDone">✓ Finito</button>
        </div>
      </section>

      <!-- Serie × ripetizioni -->
      <section v-else class="card stack timer" style="gap: 12px">
        <div v-if="p.restOver" class="go">Vai! 💪</div>
        <div class="lbl">Serie {{ Math.min(w.sets.length + 1, w.serie) }} di {{ w.serie }}</div>
        <div class="sets">
          <span v-for="i in Math.max(w.serie, w.sets.length)" :key="i" class="set" :class="{ done: i <= w.sets.length }">
            {{ i <= w.sets.length ? `✓ ${fmtSet(w.sets[i - 1], 'rip')}` : i }}
          </span>
        </div>
        <div class="pair">
          <Stepper v-model="w.rip" label="Ripetizioni" :step="1" :min="1" />
          <Stepper v-model="w.kg" label="Kg" :step="2.5" />
        </div>
        <button type="button" class="btn btn-primary big" @click="setDone">✓ Serie fatta</button>
        <div class="row" style="justify-content: center">
          <button v-if="w.sets.length" type="button" class="btn btn-ghost btn-sm" @click="undoSet">Annulla ultima serie</button>
          <button v-if="w.sets.length" type="button" class="btn btn-ghost btn-sm" @click="finishEarly">Ho finito</button>
        </div>
      </section>

      <div class="row" style="justify-content: space-between">
        <button type="button" class="btn btn-ghost btn-sm" @click="skipExercise">Salta esercizio</button>
        <span class="small muted">{{ pending.length }} da fare</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.clock { font-variant-numeric: tabular-nums; font-weight: 600; }
.top { display: flex; flex-direction: column; gap: 6px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dots { display: flex; gap: 6px; flex-wrap: wrap; }
.dot { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); color: var(--muted); font: inherit; font-size: .8rem; font-weight: 600; cursor: pointer; padding: 0; }
.dot.on { border-color: var(--primary); background: var(--primary); color: var(--primary-text); }
.dot.fatto { background: var(--ok); border-color: var(--ok); color: var(--surface); cursor: default; }
.dot.saltato { text-decoration: line-through; cursor: default; opacity: .6; }
.ex-name { margin: 2px 0 6px; font-size: 1.35rem; }
.plan { padding: 6px 10px; border-radius: 8px; background: var(--surface-2); }
.info-box { padding: 10px 12px; border-radius: var(--radius); background: var(--primary-soft); }
.timer { align-items: center; text-align: center; }
.lbl { font-size: .78rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.big-clock { font-size: 3.6rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.big-clock.hold { color: var(--primary); }
.rest .big-clock { color: var(--ok); }
.bar { width: 100%; height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--primary); transition: width .25s linear; }
.rest .bar i { background: var(--ok); }
.sets { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.set { min-width: 34px; padding: 4px 10px; border-radius: 999px; border: 1px dashed var(--border); color: var(--muted); font-size: .85rem; font-variant-numeric: tabular-nums; }
.set.done { border-style: solid; border-color: var(--ok); color: var(--ok); font-weight: 600; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }
.big { width: 100%; justify-content: center; min-height: 52px; font-size: 1.05rem; font-weight: 600; }
.row .big { flex: 1; width: auto; }
.go { color: var(--ok); font-weight: 700; font-size: 1.1rem; }
.rpe { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 4px; }
.rpe .btn { justify-content: center; min-height: 44px; font-weight: 600; }
.end { align-items: center; text-align: center; }
</style>
