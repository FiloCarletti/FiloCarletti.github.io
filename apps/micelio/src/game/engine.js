// Motore del gioco: funzioni pure sullo stato (oggetto JSON semplice), senza Vue né browser.
// Lo usano sia l'app sia il simulatore di bilanciamento (tools/simula.mjs).
import {
  ACH_BONUS, ACHIEVEMENTS, BIOMES, BUILDINGS, DEFAULT_RESERVE, EXP_TERR, FAR_BONUS, FAR_COST, GENOME, RELIC_MAX, RELICS,
  RESEARCH, RESOURCES, RING_MILESTONES, RING_TRAITS, RINGS, SEASONS, STORAGE_COST, TERRITORIES, TREE, WEATHER,
} from './data.js'

// v1: gioco base · v2: meteo, anelli, spedizioni, reperti, diario (i v1 si caricano con migrate)
export const SAVE_VERSION = 2
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
export const TRAIT = index(RING_TRAITS)
export const BIOME = index(BIOMES)
export const RELIC = index(RELICS)
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
    life: { earned: zeros(), clicks: 0, spor: 0, sporeTot: 0, bestRun: null, exp: 0, maxTerr: 0 },
    spore: 0,
    gen: {},
    tree: 0,
    ach: {},
    seen: {},
    seasonsSeen: [],
    // v2 — tutto ciò che segue sopravvive alla sporulazione
    seed: randomSeed(), // meteo, tratti proposti e reperti dipendono da qui: ricaricare non cambia l'esito
    rng: 0, // contatore delle estrazioni
    weatherSeen: [],
    rings: 0, // anelli formati
    ringsReady: 0, // anelli maturi da formare
    traits: {}, // tratto → copie
    exp: [], // spedizioni in corso: { b, start, end, relic }
    relics: {}, // reperto → livello
    log: { ev: [], snap: [], snapAt: 0 }, // diario (visibile in debug)
  }
  startRun(s)
  return s
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

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
  const from = raw?.v ?? 1
  merge(s, raw)
  s.life.maxTerr = Math.max(s.life.maxTerr, s.terr)
  // Albero già adulto prima degli anelli: il primo è subito disponibile.
  if (from < 2 && s.tree >= TREE.stages && !s.rings && !s.ringsReady) s.ringsReady = 1
  if (from < SAVE_VERSION) logEvent(s, s.t, 'migr', [from, SAVE_VERSION])
  s.v = SAVE_VERSION
  return s
}

// ---------------------------------------------------------------- diario (debug)
// Eventi: [t, tipo, dati] · istantanee orarie: [t, albero, terr, spor, anelli, log10 nutrienti, log10 luce,
// log10 moltiplicatore, spore totali, tocchi, spedizioni]. Limitati per non pesare su localStorage
// (~50 KB al massimo): gli eventi più vecchi si scartano, le istantanee si diradano.
const LOG_EV_MAX = 500
const LOG_SNAP_MAX = 400
const LOG_SNAP_MS = 3600e3

export function logEvent(s, t, type, data) {
  const ev = s.log.ev
  ev.push(data === undefined ? [Math.round(t), type] : [Math.round(t), type, data])
  if (ev.length > LOG_EV_MAX) ev.splice(0, ev.length - LOG_EV_MAX)
}

function logSnapshot(s, t) {
  const l10 = (x) => Math.round(Math.log10(Math.max(1, x)) * 100) / 100
  const snap = s.log.snap
  snap.push([
    Math.round(t), s.tree, s.terr, s.life.spor, s.rings, l10(s.life.earned.nutrienti), l10(s.life.earned.luce),
    l10(derive(s).all), Math.round(s.life.sporeTot), s.life.clicks, s.life.exp,
  ])
  s.log.snapAt = t
  // Pieno: tiene la metà più recente intatta e dirada la più vecchia (una istantanea su due).
  if (snap.length > LOG_SNAP_MAX) {
    const half = Math.floor(snap.length / 2)
    s.log.snap = [...snap.slice(0, half).filter((_, i) => i % 2 === 0), ...snap.slice(half)]
  }
}

// ---------------------------------------------------------------- casualità riproducibile

function hash(a) {
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
/** Numero in [0, 1) dalla sequenza del salvataggio. */
function rand(s) {
  s.rng++
  return hash(s.seed ^ Math.imul(s.rng, 0x9e3779b1))
}
function pickWeighted(weights, u) {
  const tot = weights.reduce((a, b) => a + b, 0)
  let x = u * tot
  for (let i = 0; i < weights.length; i++) {
    if ((x -= weights[i]) < 0) return i
  }
  return weights.length - 1
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
/** Meteo del giorno (indice in WEATHER): dipende dalla data locale e dal seme del salvataggio. */
export function weatherAt(s, t) {
  const d = new Date(t)
  const day = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  return pickWeighted(WEATHER.map((w) => w.w), hash(day ^ s.seed))
}
/** Mezzanotte successiva (ora locale). */
export function nextDayAt(t) {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
}

/** Moltiplicatore di stagione e meteo per le strutture che producono `res`; i malus sono ridotti di `reduction`. */
export function climateMult(si, wi, res, reduction) {
  const adj = (f) => (f < 1 ? 1 - (1 - f) * (1 - reduction) : f)
  const sf = SEASONS[si].fx
  const wf = WEATHER[wi].fx
  return adj(sf['*'] ?? 1) * adj(sf[res] ?? 1) * adj(wf['*'] ?? 1) * adj(wf[res] ?? 1)
}
/** Moltiplicatori climatici per tutte le risorse all'istante t. */
export function climateAt(s, t, d) {
  const si = seasonAt(t)
  const wi = weatherAt(s, t)
  return Object.fromEntries(RES_IDS.map((r) => [r, climateMult(si, wi, r, d.season)]))
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
  const d = { all: 1, b: {}, res: {}, click: 1, cap: 1, spore: 1, season: 0, cost: 1, slot: 0, expTime: 1, luck: 1 }
  // n = quante volte si applica l'effetto (copie di un tratto, livello di un reperto)
  const apply = (fx, n = 1) => {
    if (!n) return
    for (const f of fx) {
      if (f.t === 'all') d.all *= f.x ** n
      else if (f.t === 'b') d.b[f.id] = (d.b[f.id] ?? 1) * f.x ** n
      else if (f.t === 'res') d.res[f.id] = (d.res[f.id] ?? 1) * f.x ** n
      else if (f.t === 'click') d.click *= f.x ** n
      else if (f.t === 'cap') d.cap *= f.x ** n
      else if (f.t === 'spore') d.spore *= f.x ** n
      else if (f.t === 'season') d.season = 1 - (1 - d.season) * (1 - f.x) ** n
      else if (f.t === 'cost') d.cost *= f.x ** n
      else if (f.t === 'slot') d.slot += f.x * n
      else if (f.t === 'expTime') d.expTime *= f.x ** n
      else if (f.t === 'luck') d.luck *= f.x ** n
    }
  }
  for (const id of Object.keys(s.rs)) if (RSC[id]) apply(RSC[id].fx)
  for (let i = 1; i <= s.terr; i++) apply(territoryAt(i).fx)
  for (const [id, n] of Object.entries(s.traits)) if (TRAIT[id]) apply(TRAIT[id].fx, n)
  for (const [id, n] of Object.entries(s.relics)) if (RELIC[id]) apply(RELIC[id].fx, n)
  for (const m of RING_MILESTONES) if (s.rings >= m.n && m.fx) apply(m.fx)
  d.slots = 1 + d.slot

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

/** Moltiplicatore di una struttura (senza stagione e meteo). */
export const buildingMult = (d, id) => d.all * (d.b[id] ?? 1) * (d.res[BLD[id].main] ?? 1)

// ---------------------------------------------------------------- simulazione

/**
 * Un passo di dt secondi: prima i produttori, poi i convertitori (limitati da ciò che c'è),
 * infine i depositi tagliano l'eccesso. `out` (facoltativo) raccoglie flussi ed efficienze.
 */
function step(s, d, dt, clim, out) {
  const res = s.res
  const before = { ...res }
  const used = zeros()
  for (const b of PRODUCERS) {
    const n = s.b[b.id]
    if (!n) continue
    const k = n * buildingMult(d, b.id) * clim[b.main] * dt
    for (const r in b.out) res[r] += b.out[r] * k
  }
  for (const b of CONVERTERS) {
    const n = s.b[b.id]
    if (!n || s.off[b.id]) continue
    let k = n * buildingMult(d, b.id) * clim[b.main] * dt
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
 * Porta la simulazione fino all'istante `to` (ms), spezzandola ai cambi di stagione (e quindi di giorno,
 * col suo meteo). A ogni mezzanotte, se l'Albero Madre è adulto, matura un anello.
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
    const wi = weatherAt(s, t)
    if (!s.seasonsSeen.includes(si)) s.seasonsSeen.push(si)
    if (!s.weatherSeen.includes(wi)) s.weatherSeen.push(wi)
    const clim = climateAt(s, t, d)
    const boundary = nextSeasonAt(t)
    const end = Math.min(to, boundary)
    const span = (end - t) / 1000
    const n = Math.min(perSeason, Math.max(1, Math.ceil(span)))
    for (let i = 0; i < n; i++) step(s, d, span / n, clim, out)
    if (end === boundary && seasonAt(end) === 0 && s.tree >= TREE.stages) {
      s.ringsReady++
      logEvent(s, end, 'anello_maturo', s.rings + s.ringsReady)
    }
    t = end
  }
  s.t = to
  return out
}

/** Ritmo teorico di produzione di una risorsa dai soli produttori (per il tocco). */
function producerRate(s, d, clim, r) {
  let v = 0
  for (const b of PRODUCERS) if (b.out[r] && s.b[b.id]) v += b.out[r] * s.b[b.id] * buildingMult(d, b.id) * clim[b.main]
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
  return d.click + d.clickShare * producerRate(s, d, climateAt(s, now, d), 'nutrienti')
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
  logEvent(s, s.t, 'terr', s.terr)
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
  logEvent(s, now, 'spor', [gain, Math.round(runMs / 60e3), s.terr])
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
  logEvent(s, s.t, 'albero', s.tree)
  if (s.tree === TREE.stages) s.ringsReady++ // l'Albero adulto inizia subito il primo anello
  return true
}

// ---------------------------------------------------------------- anelli

export function ringCost(s) {
  return RINGS.cost(s.rings)
}
/** I tre tratti proposti per il prossimo anello (fissi finché non lo si forma). */
export function ringChoices(s) {
  const ids = RING_TRAITS.map((x) => x.id)
  const out = []
  for (let i = 0; out.length < RINGS.choices && i < 50; i++) {
    const id = ids[Math.floor(hash(s.seed ^ Math.imul(s.rings + 1, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35)) * ids.length)]
    if (!out.includes(id)) out.push(id)
  }
  return out
}
export function formRing(s, traitId) {
  if (s.ringsReady < 1 || !ringChoices(s).includes(traitId)) return false
  const c = ringCost(s)
  if (!canAfford(s, c)) return false
  pay(s, c)
  s.rings++
  s.ringsReady--
  s.traits[traitId] = (s.traits[traitId] ?? 0) + 1
  logEvent(s, s.t, 'anello', [s.rings, traitId])
  return true
}

// ---------------------------------------------------------------- spedizioni e reperti

export const expUnlocked = (s) => s.life.maxTerr >= EXP_TERR
export const biomeAvailable = (s, b) => !b.req || !!b.req(s)
export function biomeCost(b, d) {
  return mapObj(b.cost, (f, r) => f * d.caps[r])
}
export const biomeMs = (b, d) => Math.round(b.ms * d.expTime)
/** Probabilità di ogni rarità (somma 1), con la fortuna che pesa di più sulle rarità alte. */
export function biomeOdds(b, d) {
  const w = b.odds.map((x, i) => x * d.luck ** i)
  const tot = w.reduce((a, c) => a + c, 0)
  return w.map((x) => x / tot)
}
export const relicMax = (r) => r.max ?? RELIC_MAX

/** Parte una spedizione: il reperto si estrae subito (ricaricare la pagina non lo cambia). */
export function startExpedition(s, biomeId, now) {
  const b = BIOME[biomeId]
  const d = derive(s)
  if (!b || !expUnlocked(s) || !biomeAvailable(s, b) || s.exp.length >= d.slots) return false
  const c = biomeCost(b, d)
  if (!canAfford(s, c)) return false
  pay(s, c)
  const rarity = pickWeighted(biomeOdds(b, d), rand(s))
  const pool = RELICS.filter((r) => r.r === rarity)
  const relic = pool[Math.floor(rand(s) * pool.length)].id
  s.exp.push({ b: biomeId, start: now, end: now + biomeMs(b, d), relic })
  logEvent(s, now, 'exp', biomeId)
  return true
}
/** Raccoglie la spedizione i (se è tornata). Un reperto già al massimo diventa spore (√spore totali × rarità). */
export function collectExpedition(s, i, now) {
  const e = s.exp[i]
  if (!e || now < e.end) return null
  s.exp.splice(i, 1)
  s.life.exp++
  const r = RELIC[e.relic]
  const cur = s.relics[r.id] ?? 0
  let spore = 0
  if (cur < relicMax(r)) s.relics[r.id] = cur + 1
  else {
    spore = Math.max(1, Math.round(Math.sqrt(s.life.sporeTot) * (r.r + 1))) // non composto: niente crescita esponenziale
    s.spore += spore
    s.life.sporeTot += spore
  }
  logEvent(s, now, 'reperto', [r.id, s.relics[r.id], spore])
  return { relic: r, lvl: s.relics[r.id], isNew: cur === 0, spore }
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
  if (s.terr > s.life.maxTerr) s.life.maxTerr = s.terr
  if (now - s.log.snapAt >= LOG_SNAP_MS) logSnapshot(s, now)
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
