// Stato del gioco per Vue: ciclo di aggiornamento, salvataggi, progressi offline, blocco multi-scheda.
// Lo stato è un oggetto semplice (veloce da simulare) dentro uno shallowRef: dopo ogni modifica
// `refresh()` notifica le viste.
import { ref, shallowRef, triggerRef } from 'vue'
import { toast } from '@shared/toast.js'
import * as E from './engine.js'
import { ACH_BONUS } from './data.js'
import { DEBUG, backupGame, decode, encode, loadGame, saveGame, wipeGame } from './save.js'

const TICK_MS = 250
const SAVE_MS = 10_000
/** Sotto questa assenza non si mostra il riepilogo offline. */
const AWAY_MIN_MS = 60_000
const TAB_KEY = 'micelio-tab'
const tabId = Math.random().toString(36).slice(2)

export const game = shallowRef(null)
export const derived = shallowRef(null)
export const live = shallowRef({ flow: {}, eff: {} })
export const now = ref(Date.now())
/** 'loading' | 'ready' | 'error' | 'elsewhere' */
export const status = ref('loading')
export const loadError = ref('')
/** Riepilogo dei progressi mentre il gioco era chiuso. */
export const away = ref(null)
export const lastSaved = ref(null)
export { DEBUG }

let timer = null
let saveTimer = null
let saving = false

export function refresh() {
  derived.value = E.derive(game.value)
  triggerRef(game)
}

/** Simula `ms` di assenza (all'avvio, o dal pannello debug) e prepara il riepilogo. */
function simulateAway(s, to) {
  const ms = to - s.t
  const earned = { ...s.life.earned }
  const before = { ...s.res }
  const t0 = performance.now()
  live.value = E.advance(s, to)
  const fresh = E.checkProgress(s, to)
  if (ms < AWAY_MIN_MS) return
  const d = E.derive(s)
  away.value = {
    ms,
    calcMs: Math.round(performance.now() - t0),
    rows: E.RES_IDS.filter((r) => s.life.earned[r] - earned[r] > 0 || s.res[r] !== before[r]).map((r) => ({
      r,
      made: s.life.earned[r] - earned[r],
      delta: s.res[r] - before[r],
      full: s.res[r] >= d.caps[r] * 0.999,
    })),
    ach: fresh,
  }
}

export async function start() {
  status.value = 'loading'
  let s
  try {
    s = await loadGame()
  } catch (e) {
    loadError.value = e.message
    status.value = 'error'
    return
  }
  const t = Date.now()
  if (!s) s = E.newState(t)
  else simulateAway(s, t)
  E.checkProgress(s, t)
  game.value = s
  refresh()
  status.value = 'ready'
  claimTab()
  run()
  await save()
}

function run() {
  stop()
  timer = setInterval(tick, TICK_MS)
  saveTimer = setInterval(save, SAVE_MS)
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', save)
  window.addEventListener('storage', onStorage)
}
function stop() {
  clearInterval(timer)
  clearInterval(saveTimer)
  document.removeEventListener('visibilitychange', onHide)
  window.removeEventListener('pagehide', save)
}

function tick() {
  const s = game.value
  if (!s || status.value !== 'ready') return
  const t = Date.now()
  now.value = t
  // Scheda in background: il browser rallenta i timer, advance recupera il tempo perso.
  live.value = E.advance(s, t)
  for (const a of E.checkProgress(s, t)) toast.ok(`🏆 Traguardo: ${a.name} (+${Math.round(ACH_BONUS * 100)}% produzione)`)
  refresh()
}

export async function save() {
  const s = game.value
  if (!s || saving || status.value !== 'ready') return
  saving = true
  try {
    s.savedAt = Date.now()
    await saveGame(s)
    lastSaved.value = s.savedAt
  } catch (e) {
    toast.error(new Error(`Salvataggio non riuscito: ${e.message}`))
  } finally {
    saving = false
  }
}
function onHide() {
  if (document.visibilityState === 'hidden') save()
  else tick()
}

// Una sola scheda alla volta: l'ultima aperta "vince", le altre si fermano senza salvare.
function claimTab() {
  try {
    localStorage.setItem(TAB_KEY, tabId)
  } catch { /* storage non disponibile */ }
}
function onStorage(e) {
  if (e.key === TAB_KEY && e.newValue && e.newValue !== tabId && status.value === 'ready') {
    status.value = 'elsewhere'
    stop()
  }
}

/** Esegue un'azione del motore sullo stato e aggiorna le viste. */
export function act(fn, ...args) {
  const s = game.value
  if (!s || status.value !== 'ready') return false
  const r = fn(s, ...args)
  E.checkProgress(s, Date.now())
  refresh()
  return r
}

export async function sporulateNow() {
  await save()
  backupGame()
  const gain = act(E.sporulate, Date.now())
  if (gain) {
    toast.ok(`🌬️ Le spore si sono disperse: +${gain} spore`)
    await save()
  }
  return gain
}

export const exportSave = () => encode(game.value)

export async function importSave(str) {
  const s = await decode(str)
  backupGame()
  stop()
  simulateAway(s, Date.now())
  game.value = s
  refresh()
  status.value = 'ready'
  run()
  await save()
}

export async function resetGame() {
  stop()
  wipeGame()
  game.value = E.newState(Date.now())
  refresh()
  status.value = 'ready'
  run()
  await save()
}

// ---- solo debug

export function debugSkip(ms) {
  const s = game.value
  simulateAway(s, s.t + ms) // il tick successivo riallinea s.t all'ora reale senza contare due volte
  refresh()
}
export function debugFill() {
  act((s) => {
    const d = E.derive(s)
    for (const r of E.RES_IDS) s.res[r] = d.caps[r]
  })
}
export function debugSpore(n) {
  act((s) => {
    s.spore += n
    s.life.sporeTot += n
  })
}
