<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { supabase, unwrap, toast, useSpace } from '@shared'
import { T } from '../db.js'
import { sortHand, sumValues } from '../game/cards.js'
import { canClose, discardError, hasBurraco, liveScore, teamOf, tryAttach, tryMeld } from '../game/rules.js'
import {
  game, isHumanTurn, humanAttach, humanDiscard, humanDraw, humanHint, humanMeld, humanUndo, resume,
  continueAfterSummary, startMatch, abandonMatch, savePrefs, toggleSelect,
} from '../lib/session.js'
import PlayingCard from '../components/PlayingCard.vue'
import { plural } from '../lib/score.js'
import MeldView from '../components/MeldView.vue'
import HandSummary from '../components/HandSummary.vue'

const router = useRouter()
const { spaceId, canWrite } = useSpace()

const m = computed(() => game.match)
const st = computed(() => m.value?.hand)
const myTurn = computed(() => isHumanTurn())
const phase = computed(() => st.value?.phase)
const hand = computed(() => (st.value ? sortHand(st.value.hands[0], game.prefs.sort) : []))
const sel = computed(() => game.selected.filter((c) => st.value?.hands[0].includes(c)))
const fresh = computed(() => (st.value?.turn === 0 && st.value?.drawn ? new Set(st.value.drawn.cards) : new Set()))
const live = computed(() => (st.value ? [liveScore(st.value, 0), liveScore(st.value, 1)] : [0, 0]))
const others = computed(() => (m.value ? m.value.seats.map((s, i) => ({ ...s, i })).filter((s) => s.i !== 0) : []))

onMounted(resume)

// anteprima delle azioni con le carte selezionate
const meldCheck = computed(() => (myTurn.value && phase.value === 'play' && sel.value.length ? tryMeld(st.value, 0, sel.value) : null))
const attachTargets = computed(() => {
  if (!myTurn.value || phase.value !== 'play' || !sel.value.length) return new Set()
  return new Set(st.value.melds[0].filter((x) => !tryAttach(st.value, 0, x.id, sel.value).error).map((x) => x.id))
})
const discardCheck = computed(() => {
  if (!myTurn.value || phase.value !== 'play' || sel.value.length !== 1) return null
  return discardError(st.value, 0, sel.value[0])
})
const closing = computed(() => st.value?.hands[0].length === 1 && st.value.took[0])

const status = computed(() => {
  const s = st.value
  if (!s) return ''
  if (game.summary) return 'Mano finita'
  if (!myTurn.value) {
    const seat = s.turn
    const name = m.value.seats[seat].name
    const f = game.flash?.seat === seat ? ` ${game.flash.text}` : ' sta pensando…'
    return `${name}${f}`
  }
  if (s.phase === 'draw') return 'Tocca il tallone per pescare, oppure gli scarti per raccoglierli tutti'
  if (!sel.value.length) {
    if (s.took[0] && !hasBurraco(s.melds[0])) return 'Cala o attacca, poi scarta. Per chiudere vi serve un burraco'
    if (canClose(s, 0)) return 'Potete chiudere: cala tutto e scarta l’ultima carta (non una matta)'
    return 'Seleziona le carte da calare o da attaccare, poi scarta una carta'
  }
  if (meldCheck.value?.a) return `Combinazione valida: ${meldCheck.value.a.type === 'seq' ? 'scala' : 'tris'}${meldCheck.value.a.clean ? '' : ' sporca'} di ${sel.value.length}`
  if (attachTargets.value.size) return 'Tocca una combinazione evidenziata per attaccare'
  if (sel.value.length === 1) return discardCheck.value ?? (closing.value ? 'Scarta per chiudere' : 'Puoi scartare questa carta')
  return meldCheck.value?.error ?? ''
})

function tapMeld(id) {
  if (attachTargets.value.has(id)) humanAttach(id, sel.value)
  else if (sel.value.length) toast.error(tryAttach(st.value, 0, id, sel.value).error ?? 'Non si attacca')
}
const hintMeld = computed(() => (game.hint?.kind === 'attach' ? game.hint.meldId : null))

function toggleSort() {
  game.prefs.sort = game.prefs.sort === 'suit' ? 'rank' : 'suit'
  savePrefs()
}

function leave() {
  router.push('/')
}
function abandon() {
  if (!confirm('Abbandonare la partita? Non verrà registrata.')) return
  abandonMatch()
  router.push('/')
}

// ---------- fine partita: risultato nel database ----------
const saving = ref(false)
async function saveResult() {
  const x = m.value
  if (!x?.over || x.saved || saving.value) return
  if (!canWrite.value || !spaceId.value) { x.saved = 'skip'; return }
  saving.value = true
  try {
    const burraco = x.history.reduce((a, h) => a + h.score[0].puliti + h.score[0].sporchi, 0)
    const chiusure = x.history.filter((h) => h.closer != null && teamOf(h.closer) === 0).length
    unwrap(await supabase.from(T.sfide).insert({
      space_id: spaceId.value,
      modalita: x.mode,
      bot: x.opp,
      compagno: x.partner,
      obiettivo: x.target,
      punti_noi: x.scores[0],
      punti_loro: x.scores[1],
      vinta: x.winner === 0,
      mani: x.history.length,
      burraco_noi: burraco,
      chiusure_noi: chiusure,
      durata_s: Math.min(864000, Math.round((Date.now() - x.startedAt) / 1000)),
    }))
    x.saved = true
    try { localStorage.setItem('burraco-partita', JSON.stringify(x)) } catch { /* ignora */ }
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
watch(() => m.value?.over, (v) => { if (v) saveResult() }, { immediate: true })

function rematch() {
  const x = m.value
  startMatch({ mode: x.mode, target: x.target, opp: x.opp, partner: x.partner ?? 'stratega' })
}
function exitFinished() {
  continueAfterSummary()
  abandonMatch()
  router.push('/')
}
</script>

<template>
  <div v-if="!m" class="card empty">
    <p>Nessuna partita in corso.</p>
    <RouterLink to="/" class="btn btn-primary">Nuova partita</RouterLink>
  </div>

  <div v-else class="table-game">
    <div class="scorebar card">
      <button class="btn btn-ghost btn-sm" aria-label="Torna alla scelta della partita" @click="leave">←</button>
      <div class="score">
        <div class="team" :class="{ lead: m.scores[0] > m.scores[1] }">
          <span class="muted small">Noi</span>
          <strong>{{ m.scores[0] }}</strong>
          <span class="small live" title="Punti in tavola in questa mano">+{{ live[0] }}</span>
        </div>
        <div class="goal muted small">a {{ m.target }}<br />mano {{ m.handNo }}</div>
        <div class="team" :class="{ lead: m.scores[1] > m.scores[0] }">
          <span class="muted small">Loro</span>
          <strong>{{ m.scores[1] }}</strong>
          <span class="small live">+{{ live[1] }}</span>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" title="Abbandona la partita" aria-label="Abbandona la partita" @click="abandon">✕</button>
    </div>

    <div class="players">
      <div v-for="p in others" :key="p.i" class="player" :class="{ turn: st.turn === p.i && phase !== 'over', mate: teamOf(p.i) === 0 }">
        <span class="pname">{{ p.emoji }} {{ p.name }}</span>
        <span class="pinfo small">
          <span class="ncards" :title="`${st.hands[p.i].length} carte in mano`">🂠 {{ st.hands[p.i].length }}</span>
        </span>
        <span v-if="game.flash?.seat === p.i && st.turn === p.i" class="flash small">{{ game.flash.text }}</span>
      </div>
    </div>

    <section class="zone them" aria-label="Combinazioni degli avversari">
      <div class="zone-head small">
        <strong>Loro</strong>
        <span class="badge" :class="{ 'badge-primary': st.took[1] }">{{ st.took[1] ? 'pozzetto preso' : 'senza pozzetto' }}</span>
      </div>
      <div class="melds">
        <MeldView v-for="x in st.melds[1]" :key="x.id" :meld="x" />
        <span v-if="!st.melds[1].length" class="muted small">Nessuna combinazione</span>
      </div>
    </section>

    <section class="center" aria-label="Tallone e scarti">
      <button class="stock" :class="{ hinted: game.hint?.kind === 'draw' && game.hint.from === 'stock' }" :disabled="!myTurn || phase !== 'draw'" @click="humanDraw('stock')">
        <PlayingCard back />
        <span class="small"><strong>{{ st.stock.length }}</strong> tallone</span>
      </button>
      <div class="pozz small muted" title="Pozzetti ancora sul tavolo">
        <span class="pozz-cards"><PlayingCard v-for="i in st.pozzetti.length" :key="i" back size="sm" /></span>
        {{ st.pozzetti.length }} {{ st.pozzetti.length === 1 ? 'pozzetto' : 'pozzetti' }}
      </div>
      <button class="pile" :class="{ hinted: game.hint?.kind === 'draw' && game.hint.from === 'discard' }" :disabled="!myTurn || phase !== 'draw' || !st.discard.length" :aria-label="`Raccogli gli scarti (${st.discard.length})`" @click="humanDraw('discard')">
        <span class="pile-cards">
          <PlayingCard v-for="c in st.discard" :key="c" :id="c" size="sm" />
          <span v-if="!st.discard.length" class="muted small">nessuno scarto</span>
        </span>
        <span class="small"><strong>{{ st.discard.length }}</strong> {{ st.discard.length === 1 ? 'scarto' : 'scarti' }}</span>
      </button>
    </section>

    <section class="zone us" aria-label="Le vostre combinazioni">
      <div class="zone-head small">
        <strong>Noi</strong>
        <span class="badge" :class="{ 'badge-primary': st.took[0] }">{{ st.took[0] ? 'pozzetto preso' : 'senza pozzetto' }}</span>
        <span v-if="hasBurraco(st.melds[0])" class="badge">si può chiudere</span>
      </div>
      <div class="melds">
        <MeldView
          v-for="x in st.melds[0]" :key="x.id" :meld="x"
          :interactive="myTurn && phase === 'play' && sel.length > 0"
          :target="attachTargets.has(x.id)" :hinted="hintMeld === x.id"
          @tap="tapMeld"
        />
        <span v-if="!st.melds[0].length" class="muted small">Nessuna combinazione</span>
      </div>
    </section>

    <p class="status small" :class="{ mine: myTurn }" role="status">{{ status }}</p>

    <div class="actions">
      <button class="btn btn-primary btn-sm" :disabled="!meldCheck?.a" @click="humanMeld(sel)">Cala</button>
      <button class="btn btn-sm" :class="{ 'btn-primary': closing && !discardCheck && sel.length === 1 }" :disabled="!myTurn || phase !== 'play' || sel.length !== 1 || !!discardCheck" @click="humanDiscard(sel[0])">
        {{ closing ? 'Chiudi' : 'Scarta' }}
      </button>
      <button class="btn btn-sm" :disabled="!myTurn || !game.undo.length" title="Annulla l’ultima calata del turno" @click="humanUndo">Annulla</button>
      <span class="spacer" />
      <button class="btn btn-ghost btn-sm" :disabled="!myTurn" title="Suggerimento dello Stratega" @click="humanHint">💡</button>
      <button class="btn btn-ghost btn-sm" :title="game.prefs.sort === 'suit' ? 'Ordina per valore' : 'Ordina per seme'" @click="toggleSort">{{ game.prefs.sort === 'suit' ? '♠♥' : '7·8' }}</button>
      <button v-if="sel.length" class="btn btn-ghost btn-sm" @click="game.selected = []">Deseleziona</button>
    </div>

    <div class="hand" aria-label="La tua mano">
      <PlayingCard
        v-for="c in hand" :key="c" :id="c" interactive
        :selected="game.selected.includes(c)" :fresh="fresh.has(c)"
        :hinted="game.hint?.ids?.includes(c) || game.hint?.id === c"
        @tap="toggleSelect"
      />
    </div>
    <p class="muted small hand-info">{{ plural(st.hands[0].length, 'carta', 'carte') }} · {{ sumValues(st.hands[0]) }} punti in mano</p>

    <details class="log card">
      <summary class="small">Cronologia della mano</summary>
      <ol class="small">
        <li v-for="(l, i) in [...st.log].reverse().slice(0, 25)" :key="i">
          <strong>{{ l.seat == null ? '' : l.seat === 0 ? 'Tu' : m.seats[l.seat].name }}</strong> {{ l.text }}
        </li>
      </ol>
    </details>

    <HandSummary
      v-if="game.summary" :match="m" :entry="game.summary" :saving="saving"
      @continue="continueAfterSummary" @new="rematch" @exit="exitFinished"
    />
  </div>
</template>

<style scoped>
.table-game { display: flex; flex-direction: column; gap: 10px; margin-top: -8px; }
.scorebar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; }
.score { flex: 1; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
.team { display: flex; align-items: baseline; justify-content: center; gap: 6px; }
.team strong { font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.team.lead strong { color: var(--ok); }
.live { color: var(--muted); font-variant-numeric: tabular-nums; }
.goal { text-align: center; line-height: 1.2; }
.players { display: flex; gap: 6px; flex-wrap: wrap; }
.player {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; padding: 6px 10px;
  border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border);
}
.player.mate { border-style: dashed; }
.player.turn { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
.pname { font-weight: 600; font-size: .88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pinfo { color: var(--muted); }
.flash { color: var(--primary); font-weight: 500; }
.zone { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 8px 10px; }
.zone.us { background: color-mix(in srgb, var(--primary-soft) 45%, var(--surface)); }
.zone-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.melds { display: flex; flex-wrap: wrap; gap: 6px 4px; min-height: 50px; align-items: center; }
.center { display: flex; align-items: center; gap: 10px; }
.stock, .pile {
  display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px; border-radius: var(--radius);
  border: 1px solid transparent; background: none; color: inherit; font: inherit; cursor: pointer;
}
.stock:disabled, .pile:disabled { cursor: default; }
.stock:not(:disabled):hover, .pile:not(:disabled):hover { background: var(--surface-2); }
.hinted { border-color: #2f9e44; box-shadow: 0 0 0 1px #2f9e44; }
.pile { flex: 1; min-width: 0; align-items: stretch; }
.pile-cards { display: flex; flex-wrap: wrap; row-gap: 4px; min-height: 42px; align-items: center; }
.pile-cards > * + * { margin-left: -14px; }
.pile .small { text-align: center; }
.pozz { display: flex; flex-direction: column; align-items: center; gap: 2px; white-space: nowrap; }
.pozz-cards { display: flex; min-height: 42px; }
.pozz-cards > * + * { margin-left: -20px; }
.status { margin: 0; min-height: 1.5em; color: var(--muted); text-align: center; }
.status.mine { color: var(--text); font-weight: 500; }
.actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.hand { display: flex; flex-wrap: wrap; justify-content: center; padding: 14px 4px 4px; row-gap: 8px; }
.hand > * { margin-left: -10px; }
.hand > *:first-child { margin-left: 0; }
.hand-info { text-align: center; margin: 0; }
.log summary { cursor: pointer; color: var(--muted); }
.log ol { margin: 8px 0 0; padding-left: 18px; max-height: 220px; overflow: auto; }
@media (max-width: 380px) { .hand > * { margin-left: -14px; } }
</style>
