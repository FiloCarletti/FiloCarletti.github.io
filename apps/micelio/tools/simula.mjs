// Simulatore di bilanciamento: un giocatore "ragionevole" gioca a Micelio per N giorni.
//   node apps/micelio/tools/simula.mjs [giorni=40] [sessioni al giorno=4]
//   PROFILO=attivo node …  → gioca come un umano assiduo: 4 ore il primo giorno, poi 20 minuti ogni 2 ore
// Il primo giorno gioca un'ora di fila, poi qualche minuto per sessione; tra una sessione
// e l'altra il gioco avanza offline. Stampa i traguardi principali e un riepilogo per giorno.
// Riferimento (v2, PROFILO=attivo): Albero Madre completo ~g 7, ~22 anelli e collezione dei reperti ~g 30;
// un giocatore reale assiduo ha completato l'Albero in ~3 giorni, quindi i contenuti lunghi sono legati al tempo reale.
// Un giocatore umano attento è più veloce del bot: l'obiettivo è che il gioco duri ben oltre 30 giorni.
import { BUILDINGS, GENOME, RESEARCH, TERRITORIES, TREE } from '../src/game/data.js'
import {
  advance, buildingCost, buyBuilding, buyGenome, buyResearch, canAfford, checkProgress, click, conquer,
  derive, genomeCost, genomeMaxed, growTree, newState, researchAvailable, researchCost, sporeGain, sporulate,
  territoryAt, treeCost, upgradeStorage, RES_IDS, buildingVisible,
  BIOME, biomeAvailable, collectExpedition, expUnlocked, formRing, ringChoices, startExpedition,
} from '../src/game/engine.js'
import { BIOMES } from '../src/game/data.js'

const ACTIVE = process.env.PROFILO === 'attivo'
// Tratti preferiti dal bot, in ordine
const TRAIT_PREF = ['luminoso', 'rigoglio', 'fortuna', 'passo', 'catalisi', 'capienza']

const DAYS = Number(process.argv[2] ?? 40)
const SESSIONS = Number(process.argv[3] ?? 4)
const HOUR = 3600e3
const start = new Date(2026, 0, 5, 10, 0).getTime()
const s = newState(start)
let now = start
let flow = { flow: {}, eff: {} }
const log = []
const day = (t) => ((t - start) / 86400e3).toFixed(2)
const note = (msg) => log.push(`g ${day(now).padStart(6)}  ${msg}`)
const fmt = (n) => (n < 1e3 ? n.toFixed(0) : n.toExponential(2))

function tick(ms) {
  flow = advance(s, now + ms)
  now += ms
  for (const a of checkProgress(s, now)) if (/^(terr|spor_|tree_|days_30)/.test(a.id)) note(`🏆 ${a.name}`)
}

function act() {
  // spedizioni: raccogli quelle tornate, poi parti verso il bioma più lungo disponibile
  for (let i = s.exp.length - 1; i >= 0; i--) {
    const r = collectExpedition(s, i, now)
    if (r && r.isNew && r.relic.r >= 2) note(`🏺 ${r.relic.name} (${['comune', 'raro', 'epico', 'leggendario'][r.relic.r]})`)
  }
  if (expUnlocked(s)) for (const b of [...BIOMES].reverse()) if (biomeAvailable(s, b) && startExpedition(s, b.id, now)) break
  // anelli: il tratto preferito tra quelli proposti
  while (s.ringsReady > 0) {
    const ch = ringChoices(s)
    const pick = TRAIT_PREF.find((x) => ch.includes(x)) ?? ch[0]
    if (!formRing(s, pick)) break
    if (s.rings % 5 === 0 || s.rings === 1) note(`🪵 Anello ${s.rings}`)
  }
  let any = true
  let guard = 0
  while (any && guard++ < 500) {
    any = false
    const d = derive(s)
    // ricerche
    const rs = RESEARCH.filter((r) => researchAvailable(s, r.id)).sort((a, b) => sumCost(researchCost(a.id, d)) - sumCost(researchCost(b.id, d)))
    for (const r of rs) if (buyResearch(s, r.id)) { any = true; break }
    if (any) continue
    if (treeCost(s) && growTree(s)) { note(`🌳 Albero stadio ${s.tree}`); any = true; continue }
    if (conquer(s)) { note(`🗺️  ${territoryAt(s.terr).name} (${s.terr})`); any = true; continue }
    // genoma
    const gs = GENOME.filter((g) => !genomeMaxed(s, g.id)).sort((a, b) => genomeCost(s, a.id) - genomeCost(s, b.id))
    if (gs[0] && buyGenome(s, gs[0].id)) { any = true; continue }
    // depositi pieni → ingrandisci
    for (const r of RES_IDS) {
      if (s.res[r] >= d.caps[r] * 0.9 && upgradeStorage(s, r)) { any = true; break }
    }
    if (any) continue
    // strutture: la più economica rispetto ai depositi, senza affamare i convertitori
    const opts = BUILDINGS.filter((b) => buildingVisible(s, b)).map((b) => ({ b, c: buildingCost(s, b.id, d) }))
      .filter(({ b, c }) => canAfford(s, c) && (!b.in || Object.entries(b.in).every(([r, v]) => (s.b[b.id] ?? 0) < 3 || (flow.flow[r] ?? 0) > v * d.all * (d.b[b.id] ?? 1) * 0.5 || s.res[r] > d.caps[r] * 0.5)))
      .sort((x, y) => rel(x.c, d) - rel(y.c, d))
    if (opts[0] && buyBuilding(s, opts[0].b.id)) { any = true; continue }
  }
  // sporulazione: quando raddoppia le spore raccolte finora (o la partita è lunga)
  const d = derive(s)
  const g = sporeGain(s, d)
  const runDays = (now - s.run.start) / 86400e3
  if (g >= 1 && (g >= Math.max(5, s.life.sporeTot) || (runDays > 2.5 && g >= s.life.sporeTot * 0.5))) {
    note(`🌬️  Sporulazione #${s.life.spor + 1}: +${g} spore (partita di ${runDays.toFixed(1)} g, terr ${s.terr})`)
    sporulate(s, now)
    act()
  }
}
const sumCost = (c) => Object.values(c).reduce((a, b) => a + b, 0)
const rel = (c, d) => Math.max(...Object.entries(c).map(([r, v]) => v / d.caps[r]))

function session(minutes, clicks) {
  for (let t = 0; t < minutes * 60; t += 5) {
    if (clicks) for (let i = 0; i < 10; i++) click(s, now)
    tick(5000)
    act()
  }
}

// giorno 0: un'ora di gioco attivo (con tocchi per i primi 10 minuti); 4 ore per il profilo attivo
session(10, true)
session(ACTIVE ? 230 : 50, false)
const hours = ACTIVE ? [8, 10, 12, 14, 16, 18, 20, 22] : [8, 13, 19, 22.5].slice(0, SESSIONS)
const summary = []
for (let dd = 0; dd < DAYS; dd++) {
  const base = new Date(2026, 0, 6 + dd).getTime()
  for (const h of hours) {
    const at = base + h * HOUR
    if (at > now) tick(at - now)
    session(ACTIVE ? 20 : 5, false)
  }
  const d = derive(s)
  summary.push(
    `g ${String(dd + 1).padStart(3)}  terr ${String(s.terr).padStart(2)}  rs ${String(Object.keys(s.rs).length).padStart(2)}/${RESEARCH.length}`
    + `  spor ${String(s.life.spor).padStart(2)}  spore ${fmt(s.life.sporeTot).padStart(8)}  albero ${String(s.tree).padStart(2)}/${TREE.stages}`
    + `  ach ${String(Object.keys(s.ach).length).padStart(3)}  mult ${fmt(d.all).padStart(8)}  nutr ${fmt(s.run.earned.nutrienti).padStart(9)}`
    + `  anelli ${String(s.rings).padStart(3)}+${s.ringsReady}  reperti ${Object.keys(s.relics).length}/${Object.values(s.relics).reduce((a, b) => a + b, 0)}  sped ${s.life.exp}`,
  )
}
// DIAG=1: depositi, risorse, flussi e costi alla fine (per capire dove si blocca)
if (process.env.DIAG) {
  const d = derive(s)
  const round = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toPrecision(3)])))
  console.log('caps ', round(d.caps))
  console.log('res  ', round(s.res))
  console.log('flow ', round(flow.flow))
  console.log('eff  ', JSON.stringify(flow.eff))
  console.log('store', JSON.stringify(s.store))
  for (const b of BUILDINGS) console.log(b.id.padEnd(14), String(s.b[b.id] ?? 0).padStart(4), round(buildingCost(s, b.id, d)))
}
console.log(log.join('\n'))
console.log('\n' + summary.join('\n'))
console.log(`\nTerritori con nome: ${TERRITORIES.length - 1}, ricerche: ${RESEARCH.length}`)
// DUMP=file.json: stato finale, da incollare in localStorage come 'MIC1J.' + JSON (modalità debug)
if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(s))
