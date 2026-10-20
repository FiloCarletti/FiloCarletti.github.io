<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { supabase, unwrap, toast, useSpace } from '@shared'
import { T } from '../db.js'
import { STRATEGIES, STRATEGY_IDS, ratingOf } from '../game/bots.js'
import { GOALS } from '../game/rules.js'
import { game, startMatch, abandonMatch, savePrefs, SPEEDS } from '../lib/session.js'
import Stars from '../components/Stars.vue'
import { plural } from '../lib/score.js'

const router = useRouter()
const { spaceId, canWrite } = useSpace()
const prefs = game.prefs

const current = computed(() => (game.match && !game.match.over ? game.match : null))
const customGoal = ref(!GOALS.includes(prefs.target))

// bot ordinati per difficoltà nella modalità scelta
const bots = computed(() => STRATEGY_IDS
  .map((id) => ({ id, ...STRATEGIES[id], r: ratingOf(id, prefs.mode) }))
  .sort((a, b) => a.r.elo - b.r.elo))

// risultati contro i bot (dal database)
const sfide = ref([])
onMounted(async () => {
  try {
    sfide.value = unwrap(await supabase.from(T.sfide).select('bot, modalita, vinta, punti_noi, punti_loro')
      .eq('space_id', spaceId.value))
  } catch (e) { toast.error(e) }
})
const record = computed(() => {
  const out = {}
  for (const s of sfide.value) {
    if (s.modalita !== prefs.mode) continue
    const r = (out[s.bot] ??= { v: 0, p: 0 })
    if (s.vinta) r.v++
    else r.p++
  }
  return out
})

function setGoal(v) {
  const n = Math.round(Number(v))
  if (Number.isFinite(n) && n >= 100 && n <= 20000) { prefs.target = n; savePrefs() }
}
function pick(key, v) { prefs[key] = v; savePrefs() }

function start() {
  if (current.value && !confirm('C’è una partita in corso: abbandonarla e iniziarne una nuova?')) return
  startMatch({ mode: prefs.mode, target: prefs.target, opp: prefs.opp, partner: prefs.partner })
  router.push('/tavolo')
}
function abandon() {
  if (confirm('Abbandonare la partita in corso? Non verrà registrata.')) abandonMatch()
}
const oppName = (m) => `${STRATEGIES[m.opp]?.emoji ?? ''} ${STRATEGIES[m.opp]?.name ?? m.opp}`
</script>

<template>
  <div class="stack" style="gap: 16px">
    <div v-if="current" class="card resume">
      <div>
        <div class="muted small">Partita in corso · {{ current.mode === '2v2' ? '2 contro 2' : '1 contro 1' }} contro {{ oppName(current) }}</div>
        <strong class="big">{{ current.scores[0] }} – {{ current.scores[1] }}</strong>
        <span class="muted small"> a {{ current.target }} · mano {{ current.handNo }}</span>
      </div>
      <div class="row">
        <button class="btn btn-ghost btn-sm btn-danger" @click="abandon">Abbandona</button>
        <RouterLink to="/tavolo" class="btn btn-primary">Riprendi</RouterLink>
      </div>
    </div>

    <section class="card stack">
      <h2 style="margin: 0">Nuova partita contro i bot</h2>

      <div class="field">
        <span>Modalità</span>
        <div class="seg" role="radiogroup" aria-label="Modalità">
          <button v-for="o in [['1v1', '1 contro 1'], ['2v2', '2 contro 2 (con un compagno)']]" :key="o[0]" type="button" role="radio" :aria-checked="prefs.mode === o[0]" :class="{ on: prefs.mode === o[0] }" @click="pick('mode', o[0])">{{ o[1] }}</button>
        </div>
      </div>

      <div class="field">
        <span>Obiettivo</span>
        <div class="seg wrap" role="radiogroup" aria-label="Obiettivo">
          <button v-for="g in GOALS" :key="g" type="button" role="radio" :aria-checked="!customGoal && prefs.target === g" :class="{ on: !customGoal && prefs.target === g }" @click="customGoal = false; pick('target', g)">{{ g }}</button>
          <button type="button" role="radio" :aria-checked="customGoal" :class="{ on: customGoal }" @click="customGoal = true">Altro</button>
        </div>
        <input v-if="customGoal" class="input goal-input" type="number" min="100" max="20000" step="5" :value="prefs.target" aria-label="Obiettivo personalizzato" @change="setGoal($event.target.value)" />
      </div>

      <div class="field">
        <span>{{ prefs.mode === '2v2' ? 'Avversari' : 'Avversario' }}</span>
        <div class="bots">
          <button v-for="b in bots" :key="b.id" type="button" class="bot" :class="{ on: prefs.opp === b.id }" :aria-pressed="prefs.opp === b.id" @click="pick('opp', b.id)">
            <span class="bot-head">
              <span class="emoji">{{ b.emoji }}</span>
              <strong>{{ b.name }}</strong>
              <span class="spacer" />
              <Stars :n="b.r.stars" />
            </span>
            <span class="small muted">{{ b.style }}</span>
            <span class="small bot-foot">
              <span class="muted">Elo {{ b.r.elo }}</span>
              <span v-if="record[b.id]" class="badge">Tu: {{ plural(record[b.id].v, 'vinta', 'vinte') }} · {{ plural(record[b.id].p, 'persa', 'perse') }}</span>
            </span>
          </button>
        </div>
      </div>

      <label v-if="prefs.mode === '2v2'" class="field">
        <span>Compagno</span>
        <select class="select" :value="prefs.partner" @change="pick('partner', $event.target.value)">
          <option v-for="b in bots" :key="b.id" :value="b.id">{{ b.emoji }} {{ b.name }} ({{ '★'.repeat(b.r.stars) }})</option>
        </select>
      </label>

      <label class="field">
        <span>Velocità dei bot</span>
        <select class="select" :value="prefs.speed" @change="pick('speed', $event.target.value)">
          <option v-for="(v, k) in SPEEDS" :key="k" :value="k">{{ k[0].toUpperCase() + k.slice(1) }}</option>
        </select>
      </label>

      <div class="row-between">
        <RouterLink to="/regole" class="btn btn-ghost btn-sm">Regole e punteggi</RouterLink>
        <button class="btn btn-primary" @click="start">Inizia la partita</button>
      </div>
      <p v-if="!canWrite" class="muted small" style="margin: 0">Stai guardando uno spazio in sola lettura: puoi giocare, ma i risultati non verranno salvati.</p>
    </section>

    <p class="muted small" style="margin: 0">
      La difficoltà viene da un torneo simulato tra i bot (Elo medio 1500, separato per 1 contro 1 e 2 contro 2).
      Il <strong>💡</strong> al tavolo ti mostra la mossa che farebbe lo Stratega.
    </p>
  </div>
</template>

<style scoped>
.resume { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-color: var(--primary); }
.big { font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.seg { display: flex; gap: 4px; padding: 3px; background: var(--surface-2); border-radius: var(--radius); }
.seg.wrap { flex-wrap: wrap; }
.seg button { flex: 1; padding: 7px 10px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap; }
.seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.goal-input { max-width: 160px; margin-top: 6px; }
.bots { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.bot {
  display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 10px 12px; border-radius: var(--radius);
  border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; cursor: pointer;
}
.bot:hover { background: var(--surface-2); }
.bot.on { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); background: var(--primary-soft); }
.bot-head { display: flex; align-items: center; gap: 6px; }
.emoji { font-size: 1.2rem; }
.bot-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
@media (max-width: 420px) { .seg button { white-space: normal; } }
</style>
