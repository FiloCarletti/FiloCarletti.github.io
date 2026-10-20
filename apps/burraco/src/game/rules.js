// Regole di una mano e di una partita di burraco (regolamento classico italiano, in stile FIBUR).
//
// Mano: 11 carte a testa, due pozzetti da 11, una carta scoperta sugli scarti, il resto è il tallone.
// Turno: si pesca una carta dal tallone OPPURE si raccolgono tutti gli scarti; si calano combinazioni o si
// attaccano carte alle combinazioni della propria squadra; si scarta una carta.
// Chi finisce le carte prende il pozzetto della squadra (una volta per squadra): se le finisce calando
// continua a giocare con il pozzetto, se le finisce scartando lo gioca dal turno successivo.
// Si chiude (dopo aver preso il pozzetto e con almeno un burraco) calando tutte le carte e scartando
// l'ultima, che non può essere una matta. Se il tallone si esaurisce la mano finisce senza chiusura.
// Punteggio di squadra: carte calate − carte in mano + burraco (pulito 200, sporco 100)
// + chiusura 100 − 100 se non ha preso il pozzetto.
//
// Posti: 0 = tu, poi in senso di gioco. Squadra di un posto = posto % 2 (in 2 contro 2: 0 e 2 contro 1 e 3).
import { cardValue, isWild, newDeck, sumValues } from './cards.js'
import { analyzeMeld, isBurraco, BURRACO_LEN } from './melds.js'

export const HAND_SIZE = 11
/** Limite di sicurezza: oltre questo numero di turni la mano finisce come a tallone esaurito. */
export const MAX_TURNS = 300
export const POINTS = { pulito: 200, sporco: 100, chiusura: 100, pozzetto: 100 }
export const GOALS = [1005, 1505, 2005, 2505, 3005]

export class RuleError extends Error {}
const fail = (msg) => { throw new RuleError(msg) }
export const teamOf = (seat) => seat % 2

export function newHand({ nPlayers = 2, dealer = 0, rng = Math.random } = {}) {
  const deck = newDeck(rng)
  const hands = Array.from({ length: nPlayers }, () => deck.splice(0, HAND_SIZE))
  const pozzetti = [deck.splice(0, HAND_SIZE), deck.splice(0, HAND_SIZE)]
  const discard = [deck.pop()]
  return {
    n: nPlayers,
    hands,
    pozzetti,
    stock: deck,
    discard,
    melds: [[], []], // per squadra: [{ id, type, cards }]
    took: [false, false], // pozzetto preso dalla squadra
    tookBy: [null, null],
    turn: (dealer + 1) % nPlayers,
    phase: 'draw', // draw | play | over
    pickedSingle: null, // carta singola appena raccolta dagli scarti: non si può riscartare subito
    drawn: null, // { from: 'stock' | 'discard', cards }
    known: hands.map(() => []), // carte di ogni giocatore note a tutti (raccolte dagli scarti)
    closer: null, // posto di chi ha chiuso
    endReason: null, // 'chiusura' | 'tallone'
    nextMeldId: 1,
    turns: 0,
    log: [],
  }
}

const removeCards = (arr, ids) => {
  for (const id of ids) {
    const i = arr.indexOf(id)
    if (i < 0) fail('Carta non in mano')
    arr.splice(i, 1)
  }
}
const forget = (st, seat, ids) => { st.known[seat] = st.known[seat].filter((c) => !ids.includes(c)) }
const say = (st, seat, text) => { st.log.push({ seat, text }); if (st.log.length > 60) st.log.shift() }

export const canTakePozzetto = (st, team) => !st.took[team] && st.pozzetti.length > 0
export const hasBurraco = (melds) => melds.some((m) => m.cards.length >= BURRACO_LEN)
export const meldInfo = (m) => analyzeMeld(m.cards, m.type)
/** La squadra del posto può chiudere (pozzetto preso e almeno un burraco)? */
export const canClose = (st, seat) => st.took[teamOf(seat)] && hasBurraco(st.melds[teamOf(seat)])

/**
 * Controlla la mano che resterebbe dopo aver calato: errore (stringa) o null.
 * Senza pozzetto si può restare a zero carte (si prende il pozzetto). Con il pozzetto preso bisogna tenere
 * almeno una carta da scartare: una sola solo se si può chiudere e non è una matta, altrimenti almeno due.
 */
export function handAfterError(st, seat, rest, teamMelds) {
  const t = teamOf(seat)
  if (canTakePozzetto(st, t)) return null
  if (rest.length >= 2) return null
  if (rest.length === 0) return 'Devi tenere almeno una carta da scartare'
  if (!hasBurraco(teamMelds)) return 'Per chiudere serve almeno un burraco: tieni almeno due carte'
  if (isWild(rest[0])) return 'Non si può chiudere scartando una matta: tieni un’altra carta'
  return null
}

function checkPlay(st, seat, ids) {
  if (st.phase !== 'play' || st.turn !== seat) fail(st.phase === 'draw' ? 'Prima devi pescare' : 'Non è il tuo turno')
  if (!ids.length) fail('Seleziona delle carte')
  if (new Set(ids).size !== ids.length) fail('Carte ripetute')
  for (const c of ids) if (!st.hands[seat].includes(c)) fail('Carta non in mano')
}

/** Verifica una calata nuova senza applicarla: { error } o { a } (analisi della combinazione). */
export function tryMeld(st, seat, ids) {
  try { checkPlay(st, seat, ids) } catch (e) { return { error: e.message } }
  const a = analyzeMeld(ids)
  if (!a) return { error: ids.length < 3 ? 'Servono almeno 3 carte' : 'Combinazione non valida' }
  const rest = st.hands[seat].filter((c) => !ids.includes(c))
  const melds = [...st.melds[teamOf(seat)], { cards: ids, type: a.type }]
  const error = handAfterError(st, seat, rest, melds)
  return error ? { error } : { a }
}

/** Verifica un attacco a una combinazione della propria squadra senza applicarlo. */
export function tryAttach(st, seat, meldId, ids) {
  try { checkPlay(st, seat, ids) } catch (e) { return { error: e.message } }
  const melds = st.melds[teamOf(seat)]
  const m = melds.find((x) => x.id === meldId)
  if (!m) return { error: 'Puoi attaccare solo alle combinazioni della tua squadra' }
  const a = analyzeMeld([...m.cards, ...ids], m.type)
  if (!a) return { error: 'Le carte non si attaccano a questa combinazione' }
  const rest = st.hands[seat].filter((c) => !ids.includes(c))
  const after = melds.map((x) => (x.id === meldId ? { ...x, cards: [...x.cards, ...ids] } : x))
  const error = handAfterError(st, seat, rest, after)
  return error ? { error } : { a }
}

function takePozzetto(st, seat, how) {
  const t = teamOf(seat)
  st.hands[seat] = st.pozzetti.shift()
  st.took[t] = true
  st.tookBy[t] = seat
  say(st, seat, how === 'meld' ? 'prende il pozzetto e continua' : 'prende il pozzetto')
}

export function drawStock(st, seat = st.turn) {
  if (st.phase !== 'draw' || st.turn !== seat) fail('Non puoi pescare adesso')
  if (!st.stock.length) fail('Il tallone è finito')
  const c = st.stock.pop()
  st.hands[seat].push(c)
  st.pickedSingle = null
  st.drawn = { from: 'stock', cards: [c] }
  st.phase = 'play'
  say(st, seat, 'pesca dal tallone')
  return c
}

export function takeDiscard(st, seat = st.turn) {
  if (st.phase !== 'draw' || st.turn !== seat) fail('Non puoi raccogliere adesso')
  if (!st.discard.length) fail('Non ci sono scarti')
  const cards = st.discard.splice(0)
  st.hands[seat].push(...cards)
  st.known[seat].push(...cards)
  st.pickedSingle = cards.length === 1 ? cards[0] : null
  st.drawn = { from: 'discard', cards }
  st.phase = 'play'
  say(st, seat, `raccoglie gli scarti (${cards.length})`)
  return cards
}

export function meldNew(st, seat, ids) {
  const r = tryMeld(st, seat, ids)
  if (r.error) fail(r.error)
  removeCards(st.hands[seat], ids)
  forget(st, seat, ids)
  const m = { id: st.nextMeldId++, type: r.a.type, cards: [...ids] }
  st.melds[teamOf(seat)].push(m)
  say(st, seat, `cala ${ids.length} carte`)
  if (!st.hands[seat].length) takePozzetto(st, seat, 'meld')
  return m
}

export function attach(st, seat, meldId, ids) {
  const r = tryAttach(st, seat, meldId, ids)
  if (r.error) fail(r.error)
  removeCards(st.hands[seat], ids)
  forget(st, seat, ids)
  const m = st.melds[teamOf(seat)].find((x) => x.id === meldId)
  const wasBurraco = m.cards.length >= BURRACO_LEN
  m.cards.push(...ids)
  say(st, seat, !wasBurraco && m.cards.length >= BURRACO_LEN ? `fa burraco ${r.a.clean ? 'pulito' : 'sporco'}!` : `attacca ${ids.length} ${ids.length === 1 ? 'carta' : 'carte'}`)
  if (!st.hands[seat].length) takePozzetto(st, seat, 'meld')
  return m
}

/** Errore dello scarto (stringa) o null. */
export function discardError(st, seat, id) {
  if (st.phase !== 'play' || st.turn !== seat) return st.phase === 'draw' ? 'Prima devi pescare' : 'Non è il tuo turno'
  const hand = st.hands[seat]
  if (!hand.includes(id)) return 'Carta non in mano'
  if (hand.length > 1 && st.pickedSingle === id) return 'Non puoi scartare la carta appena raccolta'
  if (hand.length === 1 && !canTakePozzetto(st, teamOf(seat))) {
    if (!hasBurraco(st.melds[teamOf(seat)])) return 'Per chiudere serve almeno un burraco'
    if (isWild(id)) return 'Non si può chiudere scartando una matta'
  }
  return null
}

export function discard(st, seat, id) {
  const err = discardError(st, seat, id)
  if (err) fail(err)
  const hand = st.hands[seat]
  hand.splice(hand.indexOf(id), 1)
  forget(st, seat, [id])
  st.discard.push(id)
  st.turns++
  if (!hand.length) {
    if (canTakePozzetto(st, teamOf(seat))) takePozzetto(st, seat, 'discard')
    else {
      st.closer = seat
      st.endReason = 'chiusura'
      st.phase = 'over'
      say(st, seat, 'chiude!')
      return
    }
  }
  if (!st.stock.length || st.turns >= MAX_TURNS) {
    st.endReason = 'tallone'
    st.phase = 'over'
    say(st, null, 'Il tallone è finito: mano chiusa senza chiusura')
    return
  }
  st.turn = (st.turn + 1) % st.n
  st.phase = 'draw'
  st.pickedSingle = null
  st.drawn = null
}

/**
 * Punteggio della mano per squadra:
 * { tavola, mano, puliti, sporchi, chiusura, pozzetto, base, carte, totale }.
 * base = burraco + chiusura − pozzetto non preso; carte = tavola − mano.
 */
export function scoreHand(st, points = POINTS) {
  return [0, 1].map((t) => {
    const melds = st.melds[t]
    let puliti = 0
    let sporchi = 0
    let tavola = 0
    for (const m of melds) {
      tavola += sumValues(m.cards)
      if (m.cards.length >= BURRACO_LEN) {
        const a = meldInfo(m)
        if (a?.clean) puliti++
        else sporchi++
      }
    }
    let mano = 0
    for (let s = 0; s < st.n; s++) if (teamOf(s) === t) mano += sumValues(st.hands[s])
    const chiusura = st.closer != null && teamOf(st.closer) === t
    const pozzetto = st.took[t]
    const base = puliti * points.pulito + sporchi * points.sporco + (chiusura ? points.chiusura : 0) - (pozzetto ? 0 : points.pozzetto)
    const carte = tavola - mano
    return { tavola, mano, puliti, sporchi, chiusura, pozzetto, base, carte, totale: base + carte }
  })
}

/** Punti in tavola "provvisori" di una squadra durante la mano (per il tabellone). */
export function liveScore(st, t) {
  let v = 0
  for (const m of st.melds[t]) {
    v += sumValues(m.cards)
    if (m.cards.length >= BURRACO_LEN) v += meldInfo(m)?.clean ? POINTS.pulito : POINTS.sporco
  }
  return v
}

// ---------- Partita ----------

/**
 * Nuova partita contro i bot.
 * seats: [{ name, bot }] in ordine di gioco (posto 0 = l'umano, bot null).
 */
export function newMatch({ mode = '1v1', target = 2005, seats, rng = Math.random }) {
  const n = mode === '2v2' ? 4 : 2
  const dealer = Math.floor(rng() * n)
  return {
    v: 1,
    mode,
    n,
    target,
    seats,
    scores: [0, 0],
    history: [],
    dealer,
    handNo: 1,
    hand: newHand({ nPlayers: n, dealer, rng }),
    startedAt: Date.now(),
    winner: null,
    over: false,
  }
}

/** Registra la mano finita nel punteggio. Restituisce il riepilogo della mano. */
export function finishHand(match) {
  const st = match.hand
  if (st.phase !== 'over') fail('La mano non è finita')
  const sc = scoreHand(st)
  match.scores = match.scores.map((s, t) => s + sc[t].totale)
  const entry = { n: match.handNo, score: sc, closer: st.closer, endReason: st.endReason, turns: st.turns }
  match.history.push(entry)
  const [a, b] = match.scores
  if ((a >= match.target || b >= match.target) && a !== b) {
    match.over = true
    match.winner = a > b ? 0 : 1
  }
  return entry
}

export function nextHand(match, rng = Math.random) {
  if (match.over) fail('La partita è finita')
  match.dealer = (match.dealer + 1) % match.n
  match.handNo++
  match.hand = newHand({ nPlayers: match.n, dealer: match.dealer, rng })
}

export const handValue = (cards) => cards.reduce((a, c) => a + cardValue(c), 0)
export { isBurraco }
