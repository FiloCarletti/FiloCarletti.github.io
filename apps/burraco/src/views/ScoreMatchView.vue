<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { supabase, unwrap, toast, useSpace, fmtDate } from '@shared'
import { T } from '../db.js'
import { fmtPts, summarize, usesSemi } from '../lib/score.js'
import { accent, accent2, cssVar } from '../lib/theme.js'
import RoundForm from '../components/RoundForm.vue'
import MatchForm from '../components/MatchForm.vue'
import StatTile from '../components/StatTile.vue'
import ChartBox from '../components/ChartBox.vue'

const route = useRoute()
const router = useRouter()
const { spaceId, canWrite } = useSpace()

const p = ref(null)
const mani = ref([])
const loading = ref(true)
const saving = ref(false)
const editing = ref(null) // { initial, numero } della mano nel form
const settings = ref(false)

async function load() {
  try {
    const [a, b] = await Promise.all([
      supabase.from(T.partite).select('*').eq('space_id', spaceId.value).eq('id', route.params.id).maybeSingle(),
      supabase.from(T.mani).select('*').eq('space_id', spaceId.value).eq('partita_id', route.params.id).order('numero'),
    ])
    p.value = unwrap(a)
    mani.value = unwrap(b)
  } catch (e) {
    toast.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const s = computed(() => (p.value ? summarize(p.value, mani.value) : null))
const names = computed(() => (p.value ? [p.value.nome_a, p.value.nome_b] : ['', '']))
const concluded = computed(() => p.value?.stato === 'conclusa')
const nextNumero = computed(() => (mani.value.at(-1)?.numero ?? 0) + 1)

function openNew() {
  editing.value = { initial: null, numero: nextNumero.value, totals: [...s.value.tot] }
}
function openEdit(row) {
  const i = s.value.rows.indexOf(row)
  const prev = i > 0 ? s.value.rows[i - 1].cum : [0, 0]
  editing.value = { initial: row.m, numero: row.m.numero, totals: [...prev] }
}

/** Dopo ogni modifica alle mani: conclude la partita se qualcuno ha vinto, la riapre altrimenti. */
async function syncState() {
  const sum = summarize(p.value, mani.value)
  const want = sum.winner != null
    ? { stato: 'conclusa', vincitore: sum.winner === 0 ? 'a' : 'b' }
    : { stato: 'in_corso', vincitore: null }
  if (want.stato === p.value.stato && want.vincitore === p.value.vincitore) return
  if (want.stato === 'in_corso' && p.value.stato === 'conclusa' && sum.winner == null && !p.value.vincitore) return
  p.value = unwrap(await supabase.from(T.partite).update(want).eq('id', p.value.id).select().single())
  if (want.stato === 'conclusa') toast.ok(`${names.value[sum.winner]} vince la partita! 🏆`)
}

async function saveRound(data) {
  saving.value = true
  try {
    if (editing.value.initial) {
      const row = unwrap(await supabase.from(T.mani).update(data).eq('id', editing.value.initial.id).select().single())
      mani.value = mani.value.map((m) => (m.id === row.id ? row : m))
    } else {
      const row = unwrap(await supabase.from(T.mani).insert({ ...data, partita_id: p.value.id, space_id: spaceId.value }).select().single())
      mani.value = [...mani.value, row]
    }
    editing.value = null
    await syncState()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

async function deleteRound() {
  const m = editing.value?.initial
  if (!m || !confirm(`Eliminare la mano ${m.numero}?`)) return
  saving.value = true
  try {
    unwrap(await supabase.from(T.mani).delete().eq('id', m.id))
    mani.value = mani.value.filter((x) => x.id !== m.id)
    editing.value = null
    await syncState()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

async function saveSettings(data) {
  saving.value = true
  try {
    p.value = unwrap(await supabase.from(T.partite).update(data).eq('id', p.value.id).select().single())
    settings.value = false
    await syncState()
    toast.ok('Partita aggiornata')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

async function setConcluded(on) {
  try {
    const leader = s.value.leader
    const patch = on ? { stato: 'conclusa', vincitore: leader == null ? null : leader === 0 ? 'a' : 'b' } : { stato: 'in_corso', vincitore: null }
    p.value = unwrap(await supabase.from(T.partite).update(patch).eq('id', p.value.id).select().single())
  } catch (e) {
    toast.error(e)
  }
}

async function removeMatch() {
  if (!confirm('Eliminare la partita con tutte le sue mani?')) return
  try {
    unwrap(await supabase.from(T.partite).delete().eq('id', p.value.id))
    toast.ok('Partita eliminata')
    router.push('/segnapunti')
  } catch (e) {
    toast.error(e)
  }
}

const winnerIdx = computed(() => {
  if (!p.value) return null
  if (p.value.vincitore) return p.value.vincitore === 'a' ? 0 : 1
  return s.value?.winner
})

const chart = computed(() => {
  if (!s.value?.n) return null
  const labels = ['0', ...s.value.rows.map((r) => String(r.m.numero))]
  return {
    labels,
    datasets: [
      { label: names.value[0], data: [0, ...s.value.rows.map((r) => r.cum[0])], borderColor: accent(), backgroundColor: accent() },
      { label: names.value[1], data: [0, ...s.value.rows.map((r) => r.cum[1])], borderColor: accent2(), backgroundColor: accent2() },
      { label: `Obiettivo ${p.value.obiettivo}`, data: labels.map(() => p.value.obiettivo), borderColor: cssVar('--muted'), borderDash: [5, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0 },
    ],
  }
})
const chartOptions = { scales: { x: { title: { display: true, text: 'Mano' } } } }

const fmtAvg = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('it-IT') : '—')
</script>

<template>
  <div v-if="loading" class="row" style="justify-content: center; padding: 32px"><div class="spinner" /></div>
  <div v-else-if="!p" class="card empty">
    <p>Partita non trovata.</p>
    <RouterLink to="/segnapunti" class="btn">← Tutte le partite</RouterLink>
  </div>

  <div v-else class="stack" style="gap: 14px">
    <div class="row-between">
      <RouterLink to="/segnapunti" class="btn btn-ghost btn-sm">← Partite</RouterLink>
      <span class="muted small">{{ fmtDate(p.data) }} · a {{ p.obiettivo }}</span>
      <button v-if="canWrite" class="btn btn-ghost btn-sm" :aria-expanded="settings" @click="settings = !settings">⚙︎ Impostazioni</button>
    </div>

    <section v-if="settings" class="card stack">
      <h3 style="margin: 0">Impostazioni della partita</h3>
      <MatchForm :initial="p" :saving="saving" submit-label="Salva" @save="saveSettings" @cancel="settings = false" />
      <div class="row" style="border-top: 1px solid var(--border); padding-top: 12px">
        <button v-if="!concluded" class="btn btn-sm" @click="setConcluded(true)">Concludi la partita</button>
        <button v-else class="btn btn-sm" @click="setConcluded(false)">Riapri la partita</button>
        <span class="spacer" />
        <button class="btn btn-sm btn-danger" @click="removeMatch">Elimina partita</button>
      </div>
    </section>

    <div v-if="winnerIdx != null && concluded" class="card winner">
      🏆 <strong>{{ names[winnerIdx] }}</strong> vince {{ s.tot[winnerIdx] }} a {{ s.tot[1 - winnerIdx] }}
      <span v-if="s.winnerAt" class="muted small">· alla mano {{ s.winnerAt }}</span>
    </div>

    <div class="board">
      <div v-for="i in [0, 1]" :key="i" class="card team" :class="[`t${i}`, { lead: s.leader === i }]">
        <div class="tname">{{ names[i] }}</div>
        <div v-if="(i === 0 ? p.giocatori_a : p.giocatori_b)" class="muted small players">{{ i === 0 ? p.giocatori_a : p.giocatori_b }}</div>
        <div class="total">{{ s.tot[i] }}</div>
        <div class="bar"><span :style="{ width: `${s.teams[i].progress * 100}%` }" /></div>
        <div class="small">
          <template v-if="s.teams[i].remaining > 0">mancano <strong>{{ s.teams[i].remaining }}</strong></template>
          <template v-else><strong>obiettivo raggiunto</strong></template>
        </div>
        <div class="muted small split">base {{ s.teams[i].base }} · carte {{ s.teams[i].carte }}</div>
      </div>
    </div>
    <p class="diff" :class="{ even: s.diff === 0 }">
      <template v-if="!s.n">Nessuna mano ancora</template>
      <template v-else-if="s.diff === 0">Parità</template>
      <template v-else><strong>{{ names[s.leader] }}</strong> avanti di <strong>{{ Math.abs(s.diff) }}</strong></template>
    </p>

    <button v-if="canWrite && !concluded" class="btn btn-primary add" @click="openNew">+ Mano {{ nextNumero }}</button>

    <section v-if="s.n" class="card rounds" aria-label="Mani">
      <div class="rhead small muted">
        <span>#</span><span class="ta">{{ names[0] }}</span><span class="ta">{{ names[1] }}</span>
      </div>
      <component
        :is="canWrite ? 'button' : 'div'" v-for="r in [...s.rows].reverse()" :key="r.m.id"
        class="rrow" :type="canWrite ? 'button' : undefined" :title="canWrite ? 'Modifica la mano' : undefined"
        @click="canWrite && openEdit(r)"
      >
        <span class="rn">{{ r.m.numero }}</span>
        <span v-for="i in [0, 1]" :key="i" class="cell" :class="{ closer: r.pts[i].chiusura }">
          <span class="pts" :class="{ neg: r.pts[i].totale < 0 }">{{ fmtPts(r.pts[i].totale) }}</span>
          <span class="cum">{{ r.cum[i] }}</span>
          <span class="det">
            {{ r.pts[i].base }} + {{ r.pts[i].carte }}
            <template v-if="r.pts[i].puliti"> · {{ r.pts[i].puliti }}P</template>
            <template v-if="r.pts[i].semipuliti"> · {{ r.pts[i].semipuliti }}SP</template>
            <template v-if="r.pts[i].sporchi"> · {{ r.pts[i].sporchi }}S</template>
            <template v-if="r.pts[i].chiusura"> · chiude</template>
            <template v-if="!r.pts[i].pozzetto"> · no pozz.</template>
          </span>
        </span>
      </component>
      <p class="muted small legend">Punti della mano (base + carte) e totale progressivo. P = burraco puliti,<template v-if="usesSemi(p)"> SP = semipuliti ({{ p.punti_semipulito }}),</template> S = sporchi.</p>
    </section>

    <template v-if="s.n">
      <section class="stack">
        <h3 style="margin: 0">Statistiche</h3>
        <div class="stats">
          <div v-for="i in [0, 1]" :key="i" class="stack sgroup">
            <div class="sname" :class="`t${i}`">{{ names[i] }}</div>
            <div class="tiles">
              <StatTile label="Media a mano" :value="fmtAvg(s.teams[i].avg)" :hint="`base ${fmtAvg(s.teams[i].avgBase)} · carte ${fmtAvg(s.teams[i].avgCarte)}`" />
              <StatTile label="Mani alla meta" :value="s.teams[i].eta == null ? '—' : s.teams[i].eta" hint="con la media attuale" />
              <StatTile label="Miglior mano" :value="fmtPts(s.teams[i].best.value)" :hint="`mano ${s.teams[i].best.n}`" />
              <StatTile label="Peggior mano" :value="fmtPts(s.teams[i].worst.value)" :hint="`mano ${s.teams[i].worst.n}`" />
              <StatTile label="Burraco" :value="s.teams[i].puliti + s.teams[i].semipuliti + s.teams[i].sporchi" :hint="`${s.teams[i].puliti} puliti${usesSemi(p) ? ` · ${s.teams[i].semipuliti} semi` : ''} · ${s.teams[i].sporchi} sporchi`" />
              <StatTile label="Chiusure" :value="s.teams[i].chiusure" :hint="`su ${s.n} mani`" />
              <StatTile label="Mani vinte" :value="s.teams[i].vinte" :hint="`${Math.round(s.teams[i].vinte / s.n * 100)}%`" />
              <StatTile label="Pozzetti mancati" :value="s.teams[i].pozzMancati" />
            </div>
          </div>
        </div>
        <div class="tiles wide">
          <StatTile label="Vantaggio massimo" :value="s.maxLead.value" :hint="s.maxLead.team == null ? '' : `${names[s.maxLead.team]}, mano ${s.maxLead.n}`" />
          <StatTile label="Cambi di vantaggio" :value="s.leadChanges" />
          <StatTile label="Punti in tavola" :value="`${s.teams[0].tavola} / ${s.teams[1].tavola}`" :hint="`in mano −${s.teams[0].mano} / −${s.teams[1].mano}`" />
        </div>
      </section>
      <section v-if="chart" class="card">
        <h3>Andamento</h3>
        <ChartBox type="line" :data="chart" :options="chartOptions" :height="240" label="Totale progressivo delle due squadre mano per mano" />
      </section>
    </template>

    <p v-if="p.note" class="muted small">{{ p.note }}</p>

    <RoundForm
      v-if="editing" :partita="p" :initial="editing.initial" :numero="editing.numero" :totals="editing.totals" :saving="saving"
      @save="saveRound" @cancel="editing = null" @delete="deleteRound"
    />
  </div>
</template>

<style scoped>
.winner { text-align: center; border-color: #f59f00; background: color-mix(in srgb, #fab005 14%, var(--surface)); }
.board { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.team { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 12px; border-top: 4px solid var(--primary); }
.team.t1 { border-top-color: var(--warn); }
.tname { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.players { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: -3px; }
.total { font-size: 2.2rem; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.team.lead .total { color: var(--ok); }
.bar { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--primary); }
.t1 .bar span { background: var(--warn); }
.split { font-variant-numeric: tabular-nums; }
.diff { margin: -4px 0 0; text-align: center; }
.add { align-self: stretch; justify-content: center; padding: 12px; font-size: 1.05rem; }
.rounds { padding: 6px 0 0; }
.rhead, .rrow { display: grid; grid-template-columns: 34px 1fr 1fr; gap: 8px; padding: 6px 12px; }
.rhead { border-bottom: 1px solid var(--border); }
.ta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rrow { width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--border); background: none; color: inherit; font: inherit; }
button.rrow { cursor: pointer; }
button.rrow:hover { background: var(--surface-2); }
.rn { color: var(--muted); font-variant-numeric: tabular-nums; padding-top: 2px; }
.cell { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: baseline; min-width: 0; }
.pts { font-weight: 700; font-variant-numeric: tabular-nums; }
.pts.neg { color: var(--danger); }
.cum { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.det { grid-column: 1 / -1; font-size: .76rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.closer .pts::after { content: ' ✓'; color: var(--ok); font-weight: 600; }
.legend { margin: 0; padding: 8px 12px; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.sgroup { gap: 8px; min-width: 0; }
.sname { font-weight: 700; padding-bottom: 4px; border-bottom: 3px solid var(--primary); }
.sname.t1 { border-color: var(--warn); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.tiles.wide { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
@media (max-width: 560px) { .stats { grid-template-columns: 1fr; } .tiles { grid-template-columns: 1fr 1fr; } }
</style>
