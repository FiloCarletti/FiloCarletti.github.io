<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase, unwrap, toast, useSpace, fmtDate } from '@shared'
import { T } from '../db.js'
import { STRATEGIES, ratingOf } from '../game/bots.js'
import { plural, summarize } from '../lib/score.js'
import StatTile from '../components/StatTile.vue'
import Stars from '../components/Stars.vue'

const { spaceId } = useSpace()
const partite = ref([])
const mani = ref([])
const sfide = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [a, b, c] = await Promise.all([
      supabase.from(T.partite).select('*').eq('space_id', spaceId.value),
      supabase.from(T.mani).select('*').eq('space_id', spaceId.value),
      supabase.from(T.sfide).select('*').eq('space_id', spaceId.value).order('created_at', { ascending: false }),
    ])
    partite.value = unwrap(a)
    mani.value = unwrap(b)
    sfide.value = unwrap(c)
  } catch (e) {
    toast.error(e)
  } finally {
    loading.value = false
  }
})

// ---------- dal vivo ----------
const live = computed(() => {
  const by = new Map()
  for (const m of mani.value) {
    if (!by.has(m.partita_id)) by.set(m.partita_id, [])
    by.get(m.partita_id).push(m)
  }
  const sums = partite.value.map((p) => ({ p, s: summarize(p, by.get(p.id) ?? []) }))
  const teams = new Map() // per nome di squadra (senza maiuscole)
  const pairs = new Map()
  let hands = 0
  let burraco = 0
  let pts = 0
  let best = null
  for (const { p, s } of sums) {
    hands += s.n
    const names = [p.nome_a.trim(), p.nome_b.trim()]
    const winner = p.vincitore ? (p.vincitore === 'a' ? 0 : 1) : null
    names.forEach((name, i) => {
      const key = name.toLowerCase()
      const t = teams.get(key) ?? { name, partite: 0, vinte: 0, concluse: 0, mani: 0, punti: 0, burraco: 0, chiusure: 0 }
      t.partite++
      if (p.stato === 'conclusa') t.concluse++
      if (winner === i) t.vinte++
      t.mani += s.n
      t.punti += s.teams[i].totale
      t.burraco += s.teams[i].puliti + s.teams[i].sporchi
      t.chiusure += s.teams[i].chiusure
      teams.set(key, t)
      burraco += s.teams[i].puliti + s.teams[i].sporchi
      pts += s.teams[i].totale
      for (const r of s.rows) {
        if (!best || r.pts[i].totale > best.value) best = { value: r.pts[i].totale, name, date: p.data }
      }
    })
    if (p.stato === 'conclusa' && winner != null) {
      const sorted = [...names].sort((x, y) => x.localeCompare(y, 'it'))
      const key = sorted.map((x) => x.toLowerCase()).join('|')
      const pr = pairs.get(key) ?? { names: sorted, wins: [0, 0] }
      pr.wins[sorted.indexOf(names[winner])]++
      pairs.set(key, pr)
    }
  }
  return {
    n: sums.length,
    concluse: sums.filter((x) => x.p.stato === 'conclusa').length,
    hands,
    burraco,
    avg: hands ? pts / (hands * 2) : 0,
    best,
    teams: [...teams.values()].sort((a, b) => b.vinte - a.vinte || b.partite - a.partite),
    pairs: [...pairs.values()],
  }
})

// ---------- contro i bot ----------
const bots = computed(() => {
  const out = new Map()
  for (const s of sfide.value) {
    const key = `${s.modalita}|${s.bot}`
    const r = out.get(key) ?? { mode: s.modalita, bot: s.bot, n: 0, v: 0, diff: 0, best: null }
    r.n++
    if (s.vinta) r.v++
    r.diff += s.punti_noi - s.punti_loro
    out.set(key, r)
  }
  return [...out.values()].sort((a, b) => ratingOf(a.bot, a.mode).elo - ratingOf(b.bot, b.mode).elo || a.mode.localeCompare(b.mode))
})
const botTotals = computed(() => {
  const n = sfide.value.length
  const v = sfide.value.filter((s) => s.vinta).length
  const secs = sfide.value.reduce((a, s) => a + s.durata_s, 0)
  const burraco = sfide.value.reduce((a, s) => a + s.burraco_noi, 0)
  const hands = sfide.value.reduce((a, s) => a + s.mani, 0)
  return { n, v, pct: n ? Math.round(v / n * 100) : 0, hours: secs / 3600, burraco, hands }
})
const botName = (id) => `${STRATEGIES[id]?.emoji ?? '🤖'} ${STRATEGIES[id]?.name ?? id}`
const fmt = (v) => Math.round(v).toLocaleString('it-IT')
const fmtTime = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1).replace('.', ',')} h`)
</script>

<template>
  <div v-if="loading" class="row" style="justify-content: center; padding: 32px"><div class="spinner" /></div>
  <div v-else class="stack" style="gap: 20px">
    <section class="stack">
      <h2 style="margin: 0">Partite dal vivo</h2>
      <div v-if="!live.n" class="card empty">Nessuna partita dal vivo registrata.</div>
      <template v-else>
        <div class="tiles">
          <StatTile label="Partite" :value="live.n" :hint="plural(live.concluse, 'conclusa', 'concluse')" />
          <StatTile label="Mani giocate" :value="live.hands" />
          <StatTile label="Media a mano" :value="fmt(live.avg)" hint="per squadra" />
          <StatTile label="Burraco fatti" :value="live.burraco" />
          <StatTile v-if="live.best" label="Mano record" :value="`+${live.best.value}`" :hint="`${live.best.name}, ${fmtDate(live.best.date)}`" />
        </div>
        <div class="card table-wrap" style="padding: 0">
          <table class="table">
            <thead>
              <tr><th>Squadra</th><th class="num">Partite</th><th class="num">Vinte</th><th class="num">Media a mano</th><th class="num">Burraco</th><th class="num">Chiusure</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in live.teams" :key="t.name">
                <td><strong>{{ t.name }}</strong></td>
                <td class="num">{{ t.partite }}</td>
                <td class="num">{{ t.vinte }}<span v-if="t.concluse" class="muted small"> · {{ Math.round(t.vinte / t.concluse * 100) }}%</span></td>
                <td class="num">{{ t.mani ? fmt(t.punti / t.mani) : '—' }}</td>
                <td class="num">{{ t.burraco }}</td>
                <td class="num">{{ t.chiusure }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="live.pairs.length" class="card stack" style="gap: 6px">
          <h3 style="margin: 0">Scontri diretti</h3>
          <div v-for="pr in live.pairs" :key="pr.names.join()" class="pair">
            <span :class="{ win: pr.wins[0] > pr.wins[1] }">{{ pr.names[0] }}</span>
            <strong class="pscore">{{ pr.wins[0] }} – {{ pr.wins[1] }}</strong>
            <span :class="{ win: pr.wins[1] > pr.wins[0] }">{{ pr.names[1] }}</span>
          </div>
        </div>
      </template>
    </section>

    <section class="stack">
      <h2 style="margin: 0">Contro i bot</h2>
      <div v-if="!sfide.length" class="card empty">Nessuna partita contro i bot ancora: i risultati delle partite finite compaiono qui.</div>
      <template v-else>
        <div class="tiles">
          <StatTile label="Partite" :value="botTotals.n" :hint="plural(botTotals.v, 'vinta', 'vinte')" />
          <StatTile label="Vittorie" :value="`${botTotals.pct}%`" />
          <StatTile label="Mani giocate" :value="botTotals.hands" />
          <StatTile label="Burraco fatti" :value="botTotals.burraco" />
          <StatTile label="Tempo di gioco" :value="fmtTime(botTotals.hours)" />
        </div>
        <div class="card table-wrap" style="padding: 0">
          <table class="table">
            <thead>
              <tr><th>Avversario</th><th>Modalità</th><th class="num">Partite</th><th class="num">Vinte</th><th class="num">Scarto medio</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in bots" :key="`${r.mode}${r.bot}`">
                <td>{{ botName(r.bot) }} <Stars :n="ratingOf(r.bot, r.mode).stars" /></td>
                <td>{{ r.mode === '2v2' ? '2 contro 2' : '1 contro 1' }}</td>
                <td class="num">{{ r.n }}</td>
                <td class="num">{{ r.v }} <span class="muted small">· {{ Math.round(r.v / r.n * 100) }}%</span></td>
                <td class="num" :class="{ pos: r.diff > 0, neg: r.diff < 0 }">{{ r.diff > 0 ? '+' : '' }}{{ fmt(r.diff / r.n) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card" style="padding: 0">
          <div class="last small muted">Ultime partite</div>
          <div v-for="s in sfide.slice(0, 10)" :key="s.id" class="game">
            <span class="badge" :class="{ 'badge-primary': s.vinta }">{{ s.vinta ? 'Vinta' : 'Persa' }}</span>
            <span class="gname">{{ botName(s.bot) }}<span class="muted small"> · {{ s.modalita === '2v2' ? '2c2' : '1c1' }}</span></span>
            <span class="gscore">{{ s.punti_noi }} – {{ s.punti_loro }}</span>
            <span class="muted small gdate">{{ fmtDate(s.created_at) }}</span>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.table td, .table th { white-space: nowrap; }
.pair { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; }
.pair span:last-child { text-align: right; }
.pscore { font-variant-numeric: tabular-nums; }
.win { font-weight: 700; color: var(--ok); }
.pos { color: var(--ok); }
.neg { color: var(--danger); }
.last { padding: 10px 14px 4px; }
.game { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-top: 1px solid var(--border); }
.gname { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gscore { font-variant-numeric: tabular-nums; font-weight: 600; }
.gdate { width: 84px; text-align: right; }
@media (max-width: 420px) { .gdate { display: none; } }
</style>
