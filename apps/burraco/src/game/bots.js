// Bot del burraco: un motore euristico comune con parametri diversi per ogni strategia.
// I bot vedono solo le informazioni pubbliche: combinazioni in tavola, scarti, numero di carte in mano,
// pozzetti presi e (se hanno "memoria") le carte che ognuno ha raccolto dagli scarti.
// Il rating di ogni strategia viene dal torneo simulato (tools/torneo.mjs) e va aggiornato quando cambiano.
import { cardValue, isJoker, isWild, rankOf, suitOf, sumValues } from './cards.js'
import { analyzeMeld, findCombos, BURRACO_LEN } from './melds.js'
import {
  attach, canTakePozzetto, discard, discardError, drawStock, handAfterError, hasBurraco, meldNew,
  takeDiscard, teamOf, POINTS,
} from './rules.js'

/*
 * Parametri:
 *   noise          rumore casuale sulle valutazioni (errori "umani")
 *   pile           'top' = raccoglie gli scarti solo se la carta in cima serve subito; 'eval' = valuta tutto il monte
 *   pileBias       quanto vale ogni carta raccolta in più (positivo = ama i monti grossi)
 *   pileMin        soglia di convenienza per raccogliere
 *   safety         peso degli scarti "pericolosi" (carte che servono agli avversari)
 *   memory         ricorda le carte raccolte dagli avversari
 *   wildKeep       quanto costa usare una matta (preferenza a tenerla)
 *   dirtyPen       quanto costa sporcare una combinazione pulita
 *   progW          spinta ad allungare le combinazioni verso il burraco
 *   riskW          paura di restare con punti in mano quando gli avversari possono chiudere
 *   pozzettoBonus  quanto vale arrivare al pozzetto
 *   meldMin        soglia per calare (più alta = tiene le combinazioni in mano)
 *   delayClose     rimanda la chiusura per cercare un burraco pulito
 */
export const STRATEGIES = {
  novellino: {
    name: 'Novellino', emoji: '🐣',
    style: 'Gioca d’istinto: cala tutto quello che può, raccoglie gli scarti solo se la carta in cima gli serve e scarta quasi a caso.',
    p: { noise: 45, pile: 'top', pileBias: 0, pileMin: 0, safety: 0, memory: false, wildKeep: 0, dirtyPen: 0, progW: 1, riskW: 0, pozzettoBonus: 30, meldMin: -40, keepW: 0.4, delayClose: false },
  },
  ingordo: {
    name: 'Ingordo', emoji: '🐷',
    style: 'Raccoglie gli scarti appena può e punta ai monti grossi per fare tanti punti in tavola, a costo di arrivare tardi al pozzetto.',
    p: { noise: 8, pile: 'eval', pileBias: 9, pileMin: -15, safety: 0.25, memory: false, wildKeep: 8, dirtyPen: 8, progW: 4, riskW: 0.3, pozzettoBonus: 60, meldMin: 0, keepW: 1, delayClose: false },
  },
  prudente: {
    name: 'Prudente', emoji: '🛡️',
    style: 'Difensivo: non regala mai carte agli avversari, ricorda cosa hanno raccolto, cala presto per non restare con punti in mano.',
    p: { noise: 5, pile: 'eval', pileBias: -2, pileMin: 20, safety: 1.6, memory: true, wildKeep: 25, dirtyPen: 20, progW: 4, riskW: 1.4, pozzettoBonus: 90, meldMin: -5, keepW: 1, delayClose: false },
  },
  collezionista: {
    name: 'Collezionista', emoji: '💎',
    style: 'Insegue i burraco puliti: conserva le matte, non sporca le scale lunghe e, se può, rimanda la chiusura per fare un pulito in più.',
    p: { noise: 5, pile: 'eval', pileBias: 4, pileMin: 5, safety: 0.6, memory: false, wildKeep: 55, dirtyPen: 70, progW: 9, riskW: 0.6, pozzettoBonus: 70, meldMin: 0, keepW: 1, delayClose: true },
  },
  stratega: {
    name: 'Stratega', emoji: '🦉',
    style: 'Il più forte: valuta ogni monte e lo raccoglie quando conviene, ricorda le carte raccolte, corre al pozzetto, scarta sicuro e chiude appena può.',
    p: { noise: 0, pile: 'eval', pileBias: 5.5, pileMin: -22, safety: 0.9, memory: true, wildKeep: 7, dirtyPen: 11, progW: 6.5, riskW: 0.8, pozzettoBonus: 180, meldMin: -6, keepW: 1.1, delayClose: false, adaptive: true },
    // in 2 contro 2 le mani sono più corte: raccoglie solo i monti che servono davvero e corre al pozzetto
    p4: { noise: 0, pile: 'eval', pileBias: 6, pileMin: 28, safety: 1.3, memory: true, wildKeep: 0, dirtyPen: 37, progW: 7.5, riskW: 0.9, pozzettoBonus: 170, meldMin: -6, keepW: 1.1, delayClose: false, adaptive: true },
  },
}

/**
 * Valutazione delle strategie dal torneo simulato (tools/torneo.mjs, partite a 2005, 60 per coppia in 1 contro 1
 * e 40 in 2 contro 2): Elo relativo con media 1500. In 2 contro 2 il compagno conta molto e le differenze si riducono.
 */
export const RATINGS = {
  '1v1': { novellino: 975, prudente: 1244, collezionista: 1490, ingordo: 1891, stratega: 1900 },
  '2v2': { novellino: 1325, collezionista: 1458, prudente: 1515, ingordo: 1527, stratega: 1675 },
}
/** Difficoltà da 1 a 5 stelle dall'Elo. */
export const starsOf = (elo) => (elo < 1150 ? 1 : elo < 1400 ? 2 : elo < 1550 ? 3 : elo < 1750 ? 4 : 5)
export function ratingOf(id, mode = '1v1') {
  const elo = RATINGS[mode]?.[id] ?? 1500
  return { elo, stars: starsOf(elo) }
}

export const STRATEGY_IDS = Object.keys(STRATEGIES)
export const strategyOf = (id) => STRATEGIES[id] ?? STRATEGIES.stratega
/** Parametri della strategia per questa mano (alcune hanno parametri diversi in 2 contro 2). */
const paramsFor = (id, st) => { const S = strategyOf(id); return (st.n === 4 && S.p4) || S.p }

// ---------- valutazioni ----------

const opponentsOf = (st, seat) => Array.from({ length: st.n }, (_, i) => i).filter((s) => teamOf(s) !== teamOf(seat))

/** Minaccia di chiusura avversaria: 0 (lontana) … 1.5 (imminente). */
function threat(st, seat) {
  const o = 1 - teamOf(seat)
  let t = 0.15
  if (st.took[o]) t = hasBurraco(st.melds[o]) ? 1 : 0.5
  if (st.took[o] && hasBurraco(st.melds[o])) {
    const minCards = Math.min(...opponentsOf(st, seat).map((s) => st.hands[s].length))
    if (minCards <= 3) t += 0.5
  }
  if (st.stock.length < 8) t += 0.3
  return t
}

function rankDist(a, b) {
  const d = Math.abs(a - b)
  const ah = a === 1 ? 14 : a
  const bh = b === 1 ? 14 : b
  return Math.min(d, Math.abs(ah - bh))
}

/** Quanto vale tenere la carta c (in mano hand) per giocarla più avanti. */
function keepValue(st, seat, c, hand, P, tr) {
  if (isWild(c)) return 60 + P.wildKeep
  const r = rankOf(c)
  const s = suitOf(c)
  let v = 0
  for (const d of hand) {
    if (d === c || isWild(d)) continue
    const rd = rankOf(d)
    const sd = suitOf(d)
    if (rd === r) v += sd === s ? 7 : 14
    if (sd === s) {
      const dist = rankDist(r, rd)
      if (dist === 1) v += 16
      else if (dist === 2) v += 9
    }
  }
  for (const m of st.melds[teamOf(seat)]) {
    if (analyzeMeld([...m.cards, c], m.type)) { v += 30; break }
  }
  v -= cardValue(c) * tr * P.riskW
  return v
}

/** Quanto è pericoloso scartare c: serve agli avversari? */
function danger(st, seat, c, P) {
  let d = 0
  if (isWild(c)) d += 90
  const o = 1 - teamOf(seat)
  for (const m of st.melds[o]) {
    if (analyzeMeld([...m.cards, c], m.type)) {
      d += 55 + (m.cards.length >= 5 ? 35 : 0) + (m.cards.length === 6 ? 60 : 0)
      break
    }
  }
  if (P.memory) {
    const r = rankOf(c)
    const s = suitOf(c)
    for (const os of opponentsOf(st, seat)) {
      for (const k of st.known[os]) {
        if (isWild(k)) continue
        if (rankOf(k) === r) d += 16
        else if (suitOf(k) === s) {
          const dist = rankDist(r, rankOf(k))
          if (dist === 1) d += 14
          else if (dist === 2) d += 7
        }
      }
    }
  }
  return d * (1 + st.discard.length / 8)
}

// ---------- calate ----------

function noiseOf(P, rng) { return P.noise ? (rng() - 0.5) * 2 * P.noise : 0 }

/** Opzioni di gioco (calate e attacchi) con il loro punteggio, solo quelle legali. */
function options(st, seat, P, rng, { minHand = 0 } = {}) {
  const hand = st.hands[seat]
  const t = teamOf(seat)
  const melds = st.melds[t]
  const out = []
  const pozzetto = canTakePozzetto(st, t)
  const late = st.stock.length < 12 || threat(st, seat) >= 1
  const wildCost = late ? P.wildKeep * 0.3 : P.wildKeep
  const consider = (o) => {
    const rest = hand.filter((c) => !o.ids.includes(c))
    if (rest.length < minHand) return
    const after = o.meld
      ? melds.map((m) => (m.id === o.meld.id ? { ...m, cards: [...m.cards, ...o.ids] } : m))
      : [...melds, { cards: o.ids, type: o.a.type }]
    if (handAfterError(st, seat, rest, after)) return
    const before = o.meld ? analyzeMeld(o.meld.cards, o.meld.type) : null
    const len = o.a.len
    const wasLen = before ? before.len : 0
    let sc = sumValues(o.ids)
    if (len >= BURRACO_LEN && wasLen < BURRACO_LEN) sc += o.a.clean ? POINTS.pulito : POINTS.sporco
    if (before && before.clean && !o.a.clean) {
      sc -= before.len >= BURRACO_LEN ? POINTS.pulito - POINTS.sporco + P.dirtyPen : P.dirtyPen * Math.min(1, before.len / 6)
    }
    if (!before && !o.a.clean) sc -= P.dirtyPen * 0.4
    sc += P.progW * (Math.min(len, BURRACO_LEN) - Math.min(wasLen, BURRACO_LEN))
    if (o.a.wild != null && o.ids.includes(o.a.wild)) sc -= wildCost
    if (!rest.length && pozzetto) sc += P.pozzettoBonus
    if (rest.length === 1 && !pozzetto) sc += 100 // chiusura
    if (!o.meld) sc -= P.meldMin
    out.push({ ...o, sc: sc + noiseOf(P, rng) })
  }
  for (const m of melds) {
    const tried = new Set()
    for (const c of hand) {
      const face = isJoker(c) ? 'J' : c % 54
      if (tried.has(face)) continue
      tried.add(face)
      const a = analyzeMeld([...m.cards, c], m.type)
      if (a) consider({ type: 'attach', meld: m, ids: [c], a })
    }
  }
  for (const combo of findCombos(hand)) consider({ type: 'meld', ids: combo.ids, a: combo.a })
  return out
}

/** Il bot vuole chiudere (se ne avrà la possibilità)? */
function wantsClose(st, seat, P) {
  if (!P.delayClose) return true
  const melds = st.melds[teamOf(seat)]
  const clean = melds.some((m) => m.cards.length >= BURRACO_LEN && analyzeMeld(m.cards, m.type)?.clean)
  return clean || threat(st, seat) >= 1 || st.stock.length < 15
}

/** Prossima calata o attacco del bot, o null se ha finito di calare. */
export function botPlayStep(st, seat, id, rng = Math.random) {
  const P = paramsFor(id, st)
  const t = teamOf(seat)
  const minHand = st.took[t] && !wantsClose(st, seat, P) ? 2 : 0
  const opts = options(st, seat, P, rng, { minHand })
  let best = null
  for (const o of opts) if (o.sc > 0 && (!best || o.sc > best.sc)) best = o
  if (!best) return null
  return best.type === 'attach' ? { type: 'attach', meldId: best.meld.id, ids: best.ids } : { type: 'meld', ids: best.ids }
}

/** Valore delle calate che il bot farebbe con questa mano (simulazione su una copia). */
function planValue(st, seat, P, hand, rng) {
  const sim = { ...st, hands: st.hands.map((h, i) => (i === seat ? [...hand] : h)), melds: st.melds.map((ms) => ms.map((m) => ({ ...m, cards: [...m.cards] }))), took: [...st.took], pozzetti: st.pozzetti, phase: 'play', turn: seat }
  let total = 0
  for (let i = 0; i < 30; i++) {
    const opts = options(sim, seat, { ...P, noise: 0 }, rng)
    let best = null
    for (const o of opts) if (o.sc > 0 && (!best || o.sc > best.sc)) best = o
    if (!best) break
    total += best.sc
    const h = sim.hands[seat]
    for (const c of best.ids) h.splice(h.indexOf(c), 1)
    if (best.type === 'attach') sim.melds[teamOf(seat)].find((m) => m.id === best.meld.id).cards.push(...best.ids)
    else sim.melds[teamOf(seat)].push({ id: -1 - i, type: best.a.type, cards: [...best.ids] })
    if (!h.length) break
  }
  // potenziale delle carte che restano
  const rest = sim.hands[seat]
  const tr = threat(st, seat)
  for (const c of rest) total += Math.max(-15, keepValue(sim, seat, c, rest, P, tr)) * 0.25
  return total
}

/** Pesca dal tallone ('stock') o raccoglie gli scarti ('discard')? */
export function botDrawChoice(st, seat, id, rng = Math.random) {
  const P = paramsFor(id, st)
  const pile = st.discard
  if (!pile.length) return 'stock'
  if (!st.stock.length) return 'discard'
  const hand = st.hands[seat]
  if (P.pile === 'top') {
    const top = pile.at(-1)
    const fits = st.melds[teamOf(seat)].some((m) => analyzeMeld([...m.cards, top], m.type)) ||
      findCombos([...hand, top]).some((c) => c.ids.includes(top))
    return fits && rng() < 0.8 ? 'discard' : 'stock'
  }
  const withPile = planValue(st, seat, P, [...hand, ...pile], rng)
  const without = planValue(st, seat, P, hand, rng) + 6
  let v = withPile - without + P.pileBias * (pile.length - 1)
  // più carte in mano = più punti a rischio se gli avversari chiudono
  v -= threat(st, seat) * P.riskW * Math.max(0, pile.length - 2) * 4
  if (P.adaptive && !st.took[teamOf(seat)] && hand.length <= 4 && pile.length > 4) v -= 25 // vicino al pozzetto
  // una sola carta si raccoglie solo se serve davvero: altrimenti meglio scoprirne una nuova dal tallone
  const min = pile.length === 1 ? Math.max(P.pileMin, 12) : P.pileMin
  return v + noiseOf(P, rng) > min ? 'discard' : 'stock'
}

/** Carta da scartare. */
export function botDiscardChoice(st, seat, id, rng = Math.random) {
  const P = paramsFor(id, st)
  const hand = st.hands[seat]
  const legal = hand.filter((c) => !discardError(st, seat, c))
  if (legal.length <= 1) return legal[0] ?? hand[0]
  const tr = threat(st, seat)
  let best = null
  let bestV = Infinity
  for (const c of legal) {
    let v = keepValue(st, seat, c, hand, P, tr) * P.keepW + danger(st, seat, c, P) * P.safety + noiseOf(P, rng)
    if (hand.length === 2 && !isWild(c) && canTakePozzetto(st, teamOf(seat))) v -= 5
    if (v < bestV) { bestV = v; best = c }
  }
  return best
}

/** Turno completo di un bot (per le simulazioni). Restituisce le azioni fatte. */
export function playBotTurn(st, seat, id, rng = Math.random) {
  const actions = []
  const choice = botDrawChoice(st, seat, id, rng)
  if (choice === 'discard') takeDiscard(st, seat)
  else drawStock(st, seat)
  actions.push({ type: 'draw', from: choice })
  for (let i = 0; i < 40; i++) {
    const a = botPlayStep(st, seat, id, rng)
    if (!a) break
    if (a.type === 'attach') attach(st, seat, a.meldId, a.ids)
    else meldNew(st, seat, a.ids)
    actions.push(a)
  }
  const c = botDiscardChoice(st, seat, id, rng)
  discard(st, seat, c)
  actions.push({ type: 'discard', id: c })
  return actions
}
