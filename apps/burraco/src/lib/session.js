// Partita in corso contro i bot: stato reattivo, salvataggio nel localStorage, turni dei bot con pause,
// annulla (solo le calate del proprio turno) e suggerimenti (dati dallo Stratega).
import { reactive, toRaw } from 'vue'
import { toast } from '@shared'
import { STRATEGIES, botDiscardChoice, botDrawChoice, botPlayStep, strategyOf } from '../game/bots.js'
import {
  attach, discard, drawStock, finishHand, meldNew, newMatch, nextHand, takeDiscard, RuleError,
} from '../game/rules.js'

const KEY = 'burraco-partita'
const PREFS = 'burraco-preferenze'
export const SPEEDS = { lento: 1.7, normale: 1, veloce: 0.4 }

const clone = (x) => JSON.parse(JSON.stringify(x))

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
}
function writeJSON(key, v) {
  try { v == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage pieno o bloccato */ }
}

export const game = reactive({
  match: readJSON(KEY),
  selected: [], // carte selezionate dall'umano
  undo: [], // istantanee della mano prima di ogni calata del turno
  busy: false, // stanno giocando i bot
  summary: null, // riepilogo della mano appena finita
  hint: null, // { kind: 'draw', from } | { kind: 'meld' | 'attach', ids, meldId } | { kind: 'discard', id }
  flash: null, // { seat, text }: ultima azione di un bot
  prefs: { speed: 'normale', sort: 'suit', mode: '1v1', target: 2005, opp: 'stratega', partner: 'stratega', semi: false, ...readJSON(PREFS) },
})

export const savePrefs = () => writeJSON(PREFS, game.prefs)
const save = () => writeJSON(KEY, game.match)

export const isHumanTurn = () => {
  const h = game.match?.hand
  return !!h && h.phase !== 'over' && h.turn === 0 && !game.busy && !game.summary
}

const seatNames = {
  '1v1': ['Tu', 'Avversario'],
  '2v2': ['Tu', 'Ovest', 'Compagno', 'Est'],
}

export function startMatch({ mode, target, opp, partner, semi = false }) {
  const names = seatNames[mode]
  const seats = names.map((name, i) => {
    if (i === 0) return { name, bot: null }
    const id = i % 2 ? opp : partner
    const S = strategyOf(id)
    return { name: mode === '1v1' ? S.name : `${name} · ${S.name}`, bot: id, emoji: S.emoji }
  })
  game.match = newMatch({ mode, target, seats, semi })
  game.match.opp = opp
  game.match.partner = mode === '2v2' ? partner : null
  game.selected = []
  game.undo = []
  game.summary = null
  game.hint = null
  game.flash = null
  save()
  runBots()
}

export function abandonMatch() {
  game.match = null
  game.summary = null
  game.selected = []
  game.undo = []
  save()
}

function wrap(fn) {
  try {
    fn()
    game.hint = null
    save()
    return true
  } catch (e) {
    if (e instanceof RuleError) toast.error(e.message)
    else { console.error(e); toast.error(e) }
    return false
  }
}

// ---------- azioni dell'umano ----------

export function humanDraw(from) {
  if (!isHumanTurn() || game.match.hand.phase !== 'draw') return
  wrap(() => (from === 'discard' ? takeDiscard(game.match.hand, 0) : drawStock(game.match.hand, 0)))
  game.selected = []
  game.undo = []
}

function snapshot() {
  game.undo.push(clone(toRaw(game.match.hand)))
}
function afterMeld(before) {
  game.selected = []
  // preso il pozzetto: non si torna indietro (le carte nuove sono state viste)
  if (game.match.hand.took[0] && !before) game.undo = []
}

export function humanMeld(ids = game.selected) {
  if (!isHumanTurn()) return
  const before = game.match.hand.took[0]
  snapshot()
  if (wrap(() => meldNew(game.match.hand, 0, [...ids]))) afterMeld(before)
  else game.undo.pop()
}

export function humanAttach(meldId, ids = game.selected) {
  if (!isHumanTurn()) return
  const before = game.match.hand.took[0]
  snapshot()
  if (wrap(() => attach(game.match.hand, 0, meldId, [...ids]))) afterMeld(before)
  else game.undo.pop()
}

export function humanUndo() {
  if (!isHumanTurn() || !game.undo.length) return
  game.match.hand = game.undo.pop()
  game.selected = []
  save()
}

export function humanDiscard(id) {
  if (!isHumanTurn()) return
  if (wrap(() => discard(game.match.hand, 0, id))) {
    game.selected = []
    game.undo = []
    afterTurn()
  }
}

export function humanHint() {
  if (!isHumanTurn()) return
  const st = toRaw(game.match.hand)
  if (st.phase === 'draw') {
    game.hint = { kind: 'draw', from: botDrawChoice(st, 0, 'stratega') }
    return
  }
  const a = botPlayStep(st, 0, 'stratega')
  if (a) {
    game.hint = { kind: a.type, ids: a.ids, meldId: a.meldId ?? null }
    game.selected = [...a.ids]
  } else {
    const id = botDiscardChoice(st, 0, 'stratega')
    game.hint = { kind: 'discard', id }
    game.selected = [id]
  }
}

export function toggleSelect(id) {
  const i = game.selected.indexOf(id)
  if (i >= 0) game.selected.splice(i, 1)
  else game.selected.push(id)
}

// ---------- fine mano ----------

function afterTurn() {
  if (game.match.hand.phase === 'over') endHand()
  else runBots()
}

function endHand() {
  game.summary = finishHand(game.match)
  game.match.pendingSummary = true
  save()
}

/** Chiude il riepilogo della mano e passa alla prossima (se la partita non è finita). */
export function continueAfterSummary() {
  game.summary = null
  game.match.pendingSummary = false
  if (!game.match.over) {
    nextHand(game.match)
    save()
    runBots()
  } else save()
}

/** Riprende dopo un ricaricamento della pagina. */
export function resume() {
  const m = game.match
  if (!m) return
  if (m.pendingSummary && m.history.length) game.summary = m.history.at(-1)
  else if (m.hand.phase === 'over') { if (!m.over) endHand() }
  else runBots()
}

// ---------- turni dei bot ----------

const wait = (ms) => new Promise((r) => setTimeout(r, ms * (SPEEDS[game.prefs.speed] ?? 1)))
let running = false

async function runBots() {
  if (running) return
  running = true
  game.busy = true
  try {
    const m = game.match
    while (m === game.match && m.hand.phase !== 'over' && m.seats[m.hand.turn].bot) {
      const st = m.hand
      const seat = st.turn
      const id = m.seats[seat].bot
      await wait(650)
      if (m !== game.match) return
      const choice = botDrawChoice(toRaw(st), seat, id)
      if (choice === 'discard') {
        const n = st.discard.length
        takeDiscard(st, seat)
        game.flash = { seat, text: `raccoglie ${n === 1 ? 'lo scarto' : `${n} scarti`}` }
      } else {
        drawStock(st, seat)
        game.flash = { seat, text: 'pesca' }
      }
      for (let i = 0; i < 40; i++) {
        const a = botPlayStep(toRaw(st), seat, id)
        if (!a) break
        await wait(550)
        if (m !== game.match) return
        if (a.type === 'attach') attach(st, seat, a.meldId, a.ids)
        else meldNew(st, seat, a.ids)
        game.flash = { seat, text: st.log.at(-1)?.text ?? '' }
      }
      await wait(500)
      if (m !== game.match) return
      const c = botDiscardChoice(toRaw(st), seat, id)
      discard(st, seat, c)
      game.flash = st.phase === 'over' && st.closer === seat ? { seat, text: 'chiude!' } : { seat, text: 'scarta' }
      save()
    }
    if (m === game.match && m.hand.phase === 'over' && !m.over && !m.pendingSummary && !game.summary) endHand()
  } catch (e) {
    console.error(e)
    toast.error(`Errore del bot: ${e.message}`)
  } finally {
    running = false
    game.busy = false
  }
}

export { STRATEGIES }
