// Motore del gioco: funzioni pure sullo stato (oggetto JSON semplice), senza Vue né browser.
// Lo usano sia l'app sia il simulatore di bilanciamento (tools/simula.mjs).
import {
  ACH_BONUS, ACHIEVEMENTS, BUILDINGS, DEFAULT_RESERVE, FAR_BONUS, FAR_COST, GENOME, RESEARCH, RESOURCES, SEASONS,
  STORAGE_COST, TERRITORIES, TREE,
} from './data.js'

export const SAVE_VERSION = 1
/** Spore = √(nutrienti prodotti nella partita / SPORE_DIV) · bonus */
export const SPORE_DIV = 2e5
/** Si può sporulare solo dopo aver conquistato questo territorio (Ruscello). */
export const SPORE_TERR = 3
/** Passi massimi per stagione e in tutto: anche mesi di assenza si calcolano in meno di un secondo. */
const MAX_STEPS = 2000
const STEP_BUDGET = 150_000
const SEASON_MS = 6 * 3600e3

export const RES_IDS = RESOURCES.map((r) => r.id)
const index = (list) => Object.fromEntries(list.map((x) => [x.id, x]))
export const RES = index(RESOURCES)
export const BLD = index(BUILDINGS)
export const RSC = index(RESEARCH)
export const GEN = index(GENOME)
const PRODUCERS = BUILDINGS.filter((b) => !b.in)
const CONVERTERS = BUILDINGS.filter((b) => b.in)

const zeros = () => Object.fromEntries(RES_IDS.map((r) => [r, 0]))
const mapObj = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v, k)]))
const lvl = (s, id) => s.gen[id] ?? 0

// ---------------------------------------------------------------- stato

export function newState(now = Date.now()) {
  const s = {
    v: SAVE_VERSION,
    created: now,
    t: now, // ultimo istante simulato: i progressi offline partono da qui
    savedAt: now,
    res: zeros(),
    store: zeros(), // livelli dei depositi
    b: {}, // strutture possedute
    off: {}, // convertitori spenti
    reserve: {}, // per risorsa: frazione del deposito che i convertitori non toccano
    rs: {}, // ricerche completate
    terr: 0, // ultimo territorio conquistato
    run: { start: now, earned: zeros() },
    life: { earned: zeros(), clicks: 0, spor: 0, sporeTot: 0, bestRun: null },
    spore: 0,
    gen: {},
    tree: 0,
    ach: {},
    seen: {},
    seasonsSeen: [],
  }
  startRun(s)
  return s
}

function startRun(s) {
  const g = lvl(s, 'germoglio')
  if (g) {
    s.b.ifa = 5 * g
    s.b.rizomorfo = 3 * g
  }
}

/** Completa un salvataggio (anche di versioni precedenti) con i campi mancanti. */
export function migrate(raw) {
  const s = newState(raw?.created ?? Date.now())
  const merge = (dst, src) => {
    for (const [k, v] of Object.entries(src ?? {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v)
      else dst[k] = v
    }
  }
  merge(s, raw)
  s.v = SAVE_VERSION
  return s
}

// ---------------------------------------------------------------- stagioni (ora locale: 6 ore ciascuna)

export function seasonAt(t) {
  return Math.floor(new Date(t).getHours() / 6)
}
export function nextSeasonAt(t) {
  const d = new Date(t)
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), (Math.floor(d.getHours() / 6) + 1) * 6).getTime()
  return next > t ? next : t + 3600e3 // cambio d'ora legale
}
export function seasonMult(si, res, reduction) {
  const fx = SEASONS[si].fx
  const adj = (f) => (f < 1 ? 1 - (1 - f) * (1 - reduction) : f)
  return adj(fx['*'] ?? 1) * adj(fx[res] ?? 1)
}

// ---------------------------------------------------------------- moltiplicatori

export function territoryAt(i) {
  const last = TERRITORIES.length - 1
  if (i <= last) return TERRITORIES[i]
  const k = i - last
  return {
    name: `Oltre il bosco ${k}`, icon: '🗺️', far: true,
    cost: mapObj(TERRITORIES[last].cost, (v) => v * FAR_COST ** k),
    fx: [{ t: 'all', x: FAR_BONUS }],
    desc: `Produzione +${Math.round((FAR_BONUS - 1) * 100)}%.`,
  }
}

/** Tutti i moltiplicatori derivati dallo stato. Costante finché non si compra qualcosa. */
export function derive(s) {
  const d = { all: 1, b: {}, click: 1, cap: 1, spore: 1, season: 0, cost: 1 }
  const apply = (fx) => {
    for (const f of fx) {
      if (f.t === 'all') d.all *= f.x
      else if (f.t === 'b') d.b[f.id] = (d.b[f.id] ?? 1) * f.x
      else if (f.t === 'click') d.click *= f.x
      else if (f.t === 'cap') d.cap *= f.x
      else if (f.t === 'spore') d.spore *= f.x
      else if (f.t === 'season') d.season = 1 - (1 - d.season) * (1 - f.x)
      else if (f.t === 'cost') d.cost *= f.x
    }
  }
  for (const id of Object.keys(s.rs)) if (RSC[id]) apply(RSC[id].fx)
  for (let i = 1; i <= s.terr; i++) apply(territoryAt(i).fx)

  d.achMult = 1 + ACH_BONUS * Object.keys(s.ach).length
  d.treeMult = TREE.all ** s.tree
  d.genMult = 1 + GEN.vigore.per * lvl(s, 'vigore')
  d.all *= d.achMult * d.treeMult * d.genMult
  d.cap *= 1 + GEN.riserve.per * lvl(s, 'riserve')
  d.spore *= (1 + GEN.fertile.per * lvl(s, 'fertile')) * (1 + TREE.spore * s.tree)
  d.season = 1 - (1 - d.season) * (1 - GEN.resilienza.per * lvl(s, 'resilienza'))
  d.terrCost = 1 - GEN.esplorazione.per * lvl(s, 'esplorazione')
  d.rsCost = 1 - GEN.intuito.per * lvl(s, 'intuito')
  d.click *= 1 + GEN.tocco.per * lvl(s, 'tocco')
  d.clickShare = 0.02 * lvl(s, 'tocco')
  d.caps = Object.fromEntries(RES_IDS.map((r) => [r, RES[r].cap * 2 ** (s.store[r] ?? 0) * d.cap]))
  return d
}

export const reserveOf = (s, r) => s.reserve[r] ?? DEFAULT_RESERVE

/** Moltiplicatore di una struttura (senza stagione). */
export const buildingMult = (d, id) => d.all * (d.b[id] ?? 1)

// ---------------------------------------------------------------- simulazione

/**
 * Un passo di dt secondi: prima i produttori, poi i convertitori (limitati da ciò che c'è),
 * infine i depositi tagliano l'eccesso. `out` (facoltativo) raccoglie flussi ed efficienze.
 */
function step(s, d, dt, si, out) {
  const res = s.res
  const before = { ...res }
  const used = zeros()
  for (const b of PRODUCERS) {
    const n = s.b[b.id]
    if (!n) continue
    const k = n * buildingMult(d, b.id) * seasonMult(si, b.main, d.season) * dt
    for (const r in b.out) res[r] += b.out[r] * k
  }
  for (const b of CONVERTERS) {
    const n = s.b[b.id]
    if (!n || s.off[b.id]) continue
    let k = n * buildingMult(d, b.id) * seasonMult(si, b.main, d.season) * dt
    let f = 1
    for (const r in b.in) f = Math.min(f, (res[r] - reserveOf(s, r) * d.caps[r]) / (b.in[r] * k))
    f = Math.max(0, f)
    if (out) out.eff[b.id] = f
    k *= f
    for (const r in b.in) {
      res[r] -= b.in[r] * k
      used[r] += b.in[r] * k
    }
    for (const r in b.out) res[r] += b.out[r] * k
  }
  for (const r of RES_IDS) {
    if (out) out.flow[r] = (res[r] - before[r]) / dt
    if (res[r] > d.caps[r]) res[r] = d.caps[r]
    if (res[r] < 0) res[r] = 0
    const gain = res[r] - before[r] + used[r]
    if (gain > 0) {
      s.run.earned[r] += gain
      s.life.earned[r] += gain
    }
  }
}

/**
 * Porta la simulazione fino all'istante `to` (ms), spezzandola ai cambi di stagione.
 * Restituisce { flow, eff } dell'ultimo passo (per mostrare i ritmi /s).
 */
export function advance(s, to) {
  const out = { flow: zeros(), eff: {} }
  if (!(to > s.t)) {
    s.t = Math.min(s.t, to) // orologio tornato indietro: nessun progresso
    return out
  }
  const d = derive(s)
  const perSeason = Math.min(MAX_STEPS, Math.max(30, Math.floor(STEP_BUDGET / Math.ceil((to - s.t) / SEASON_MS + 1))))
  let t = s.t
  while (t < to) {
    const si = seasonAt(t)
    if (!s.seasonsSeen.includes(si)) s.seasonsSeen.push(si)
    const end = Math.min(to, nextSeasonAt(t))
    const span = (end - t) / 1000
    const n = Math.min(perSeason, Math.max(1, Math.ceil(span)))
    for (let i = 0; i < n; i++) step(s, d, span / n, si, out)
    t = end
  }
  s.t = to
  return out
}

/** Ritmo teorico di produzione di una risorsa dai soli produttori (per il tocco). */
function producerRate(s, d, si, r) {
  let v = 0
  for (const b of PRODUCERS) if (b.out[r] && s.b[b.id]) v += b.out[r] * s.b[b.id] * buildingMult(d, b.id) * seasonMult(si, b.main, d.season)
  return v
}

// ---------------------------------------------------------------- azioni

export function canAfford(s, cost) {
  return Object.entries(cost).every(([r, v]) => s.res[r] >= v * (1 - 1e-9))
}
/** Il costo sta nei depositi attuali? (altrimenti va ingrandito un deposito) */
export function fitsCaps(cost, d) {
  return Object.entries(cost).every(([r, v]) => v <= d.caps[r] * (1 + 1e-9))
}
function pay(s, cost) {
  for (const [r, v] of Object.entries(cost)) s.res[r] = Math.max(0, s.res[r] - v)
}

export function clickValue(s, d, now) {
  return d.click + d.clickShare * producerRate(s, d, seasonAt(now), 'nutrienti')
}
export function click(s, now) {
  const d = derive(s)
  const v = Math.min(clickValue(s, d, now), Math.max(0, d.caps.nutrienti - s.res.nutrienti))
  s.res.nutrienti += v
  s.run.earned.nutrienti += v
  s.life.earned.nutrienti += v
  s.life.clicks++
  return v
}

export function buildingCost(s, id, d, extra = 0) {
  const b = BLD[id]
  const n = (s.b[id] ?? 0) + extra
  return mapObj(b.cost, (v) => v * b.g ** n * d.cost)
}
/** Compra fino a `qty` strutture; restituisce quante ne ha comprate. */
export function buyBuilding(s, id, qty = 1) {
  if (!buildingVisible(s, BLD[id])) return 0
  const d = derive(s)
  let k = 0
  while (k < qty && k < 1000) {
    const c = buildingCost(s, id, d)
    if (!canAfford(s, c)) break
    pay(s, c)
    s.b[id] = (s.b[id] ?? 0) + 1
    k++
  }
  return k
}
/** Quante strutture si possono comprare adesso. */
export function maxAffordable(s, id, d) {
  const b = BLD[id]
  let k = 0
  const left = { ...s.res }
  while (k < 1000) {
    const c = buildingCost(s, id, d, k)
    if (!Object.entries(c).every(([r, v]) => left[r] >= v * (1 - 1e-9))) break
    for (const [r, v] of Object.entries(c)) left[r] -= v
    k++
  }
  return b ? k : 0
}

export function researchCost(id, d) {
  return mapObj(RSC[id].cost, (v) => v * d.rsCost)
}
export function researchAvailable(s, id) {
  return !s.rs[id] && (RSC[id].need ?? []).every((n) => s.rs[n])
}
export function buyResearch(s, id) {
  const d = derive(s)
  if (!researchAvailable(s, id)) return false
  const c = researchCost(id, d)
  if (!canAfford(s, c)) return false
  pay(s, c)
  s.rs[id] = true
  return true
}

export function territoryCost(s, d) {
  return mapObj(territoryAt(s.terr + 1).cost, (v) => v * d.terrCost)
}
export function conquer(s) {
  const d = derive(s)
  const c = territoryCost(s, d)
  if (!canAfford(s, c)) return false
  pay(s, c)
  s.terr++
  return true
}

export function storageCost(s, r, d) {
  return { [r]: d.caps[r] * STORAGE_COST }
}
export function upgradeStorage(s, r) {
  const d = derive(s)
  const c = storageCost(s, r, d)
  if (!canAfford(s, c)) return false
  pay(s, c)
  s.store[r] = (s.store[r] ?? 0) + 1
  return true
}

export function sporeGain(s, d) {
  if (s.terr < SPORE_TERR) return 0
  return Math.floor(Math.sqrt(s.run.earned.nutrienti / SPORE_DIV) * d.spore)
}
/** Rilascia le spore: si ricomincia da zero tenendo spore, genoma, Albero Madre e traguardi. */
export function sporulate(s, now) {
  const gain = sporeGain(s, derive(s))
  if (gain < 1) return 0
  s.spore += gain
  s.life.spor++
  s.life.sporeTot += gain
  const runMs = now - s.run.start
  if (!s.life.bestRun || runMs < s.life.bestRun) s.life.bestRun = runMs
  Object.assign(s, { res: zeros(), store: zeros(), b: {}, off: {}, rs: {}, terr: 0, run: { start: now, earned: zeros() } })
  startRun(s)
  return gain
}

export function genomeCost(s, id) {
  const g = GEN[id]
  return Math.ceil(g.base * g.g ** lvl(s, id))
}
export function genomeMaxed(s, id) {
  return GEN[id].max != null && lvl(s, id) >= GEN[id].max
}
export function buyGenome(s, id) {
  if (genomeMaxed(s, id)) return false
  const c = genomeCost(s, id)
  if (s.spore < c) return false
  s.spore -= c
  s.gen[id] = lvl(s, id) + 1
  if (id === 'germoglio') {
    s.b.ifa = Math.max(s.b.ifa ?? 0, 5 * s.gen[id])
    s.b.rizomorfo = Math.max(s.b.rizomorfo ?? 0, 3 * s.gen[id])
  }
  return true
}

export function treeCost(s) {
  return s.tree >= TREE.stages ? null : TREE.cost(s.tree)
}
export function growTree(s) {
  const c = treeCost(s)
  if (!c || !canAfford(s, c)) return false
  pay(s, c)
  s.tree++
  return true
}

// ---------------------------------------------------------------- visibilità e traguardi

/** Struttura disponibile nella partita in corso. */
export function buildingVisible(s, b) {
  return !b.req || !!b.req(s)
}
export function resourceVisible(s, r) {
  return !!(s.seen[r] || s.res[r] > 0)
}

/** Aggiorna ciò che è stato scoperto e sblocca i traguardi. Restituisce i traguardi nuovi. */
export function checkProgress(s, now) {
  for (const b of BUILDINGS) {
    if (buildingVisible(s, b)) for (const r of [...Object.keys(b.out), ...Object.keys(b.in ?? {})]) s.seen[r] = true
  }
  for (const r of RES_IDS) if (s.res[r] > 0) s.seen[r] = true
  const fresh = []
  for (const a of ACHIEVEMENTS) {
    if (!s.ach[a.id] && a.test(s, now)) {
      s.ach[a.id] = now
      fresh.push(a)
    }
  }
  return fresh
}
