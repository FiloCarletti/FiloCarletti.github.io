// Torneo tra le strategie dei bot: girone all'italiana di partite 1 contro 1 (o 2 contro 2) fino all'obiettivo.
//   node apps/burraco/tools/torneo.mjs [partite per coppia=40] [obiettivo=2005] [1v1|2v2]
// Stampa la classifica con percentuale di vittorie, Elo stimato (media 1500) e statistiche di gioco,
// e controlla che le regole tengano (nessuna carta persa, nessun errore). Copia gli Elo in RATINGS (src/game/bots.js).
import { makeRng, N_CARDS } from '../src/game/cards.js'
import { STRATEGIES, STRATEGY_IDS, playBotTurn } from '../src/game/bots.js'
import { finishHand, newMatch, nextHand } from '../src/game/rules.js'

const GAMES = Number(process.argv[2] ?? 40)
const TARGET = Number(process.argv[3] ?? 2005)
const MODE = process.argv[4] ?? '1v1'
const ids = (process.env.BOT ?? STRATEGY_IDS.join(',')).split(',')
// OVR='{"stratega":{"pileBias":8}}' modifica i parametri per provare varianti; COPIA=x:y aggiunge la strategia x come copia di y
for (const pair of (process.env.COPIA ?? '').split(',').filter(Boolean)) { const [x, y] = pair.split(':'); STRATEGIES[x] = { ...STRATEGIES[y], p: { ...STRATEGIES[y].p } } }
for (const [id, o] of Object.entries(JSON.parse(process.env.OVR ?? '{}'))) Object.assign(STRATEGIES[id].p, o)
const rng = makeRng(Number(process.env.SEED ?? 12345))

const stats = Object.fromEntries(ids.map((id) => [id, { games: 0, wins: 0, points: 0, hands: 0, closures: 0, puliti: 0, sporchi: 0, handPts: 0, pozzMissed: 0 }]))
const h2h = {}
let totalHands = 0
let tallone = 0
let turns = 0
let capped = 0

function checkCards(st) {
  const all = [...st.stock, ...st.discard, ...st.hands.flat(), ...st.pozzetti.flat(), ...st.melds.flat().flatMap((m) => m.cards)]
  if (all.length !== N_CARDS || new Set(all).size !== N_CARDS) throw new Error(`carte: ${all.length} / uniche ${new Set(all).size}`)
}

function playMatch(a, b) {
  const n = MODE === '2v2' ? 4 : 2
  const seats = Array.from({ length: n }, (_, i) => ({ name: `p${i}`, bot: i % 2 === 0 ? a : b }))
  const m = newMatch({ mode: MODE, target: TARGET, seats, rng })
  for (let h = 0; h < 60 && !m.over; h++) {
    const st = m.hand
    let guard = 0
    while (st.phase !== 'over') {
      playBotTurn(st, st.turn, seats[st.turn].bot, rng)
      if (++guard > 1000) throw new Error('mano infinita')
    }
    checkCards(st)
    turns += st.turns
    const e = finishHand(m)
    totalHands++
    if (e.endReason === 'tallone') tallone++
    if (e.endReason === 'tallone' && st.stock.length) capped++
    e.score.forEach((s, t) => {
      const S = stats[t === 0 ? a : b]
      S.hands++
      S.handPts += s.totale
      S.puliti += s.puliti
      S.sporchi += s.sporchi
      if (s.chiusura) S.closures++
      if (!s.pozzetto) S.pozzMissed++
    })
    if (!m.over) nextHand(m, rng)
  }
  return m
}

const t0 = Date.now()
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i]
    const b = ids[j]
    for (let g = 0; g < GAMES; g++) {
      const [x, y] = g % 2 ? [b, a] : [a, b]
      const m = playMatch(x, y)
      const win = m.winner === 0 ? x : y
      for (const [id, t] of [[x, 0], [y, 1]]) {
        stats[id].games++
        stats[id].points += m.scores[t]
        if (win === id) stats[id].wins++
      }
      const key = `${a}|${b}`
      h2h[key] ??= 0
      if (win === a) h2h[key]++
    }
  }
}

// Elo dai risultati (massima verosimiglianza, iterativo)
const elo = Object.fromEntries(ids.map((id) => [id, 1500]))
for (let it = 0; it < 2000; it++) {
  for (const a of ids) {
    let exp = 0
    let got = 0
    for (const b of ids) {
      if (a === b) continue
      const key = ids.indexOf(a) < ids.indexOf(b) ? `${a}|${b}` : `${b}|${a}`
      const winsA = ids.indexOf(a) < ids.indexOf(b) ? h2h[key] : GAMES - h2h[key]
      got += winsA
      exp += GAMES / (1 + 10 ** ((elo[b] - elo[a]) / 400))
    }
    elo[a] += (got - exp) * 0.5
  }
  const mean = ids.reduce((s, id) => s + elo[id], 0) / ids.length
  for (const id of ids) elo[id] += 1500 - mean
}

console.log(`\n${MODE} a ${TARGET}, ${GAMES} partite per coppia, ${totalHands} mani (${(totalHands / (stats[ids[0]].games * ids.length / 2) || 0).toFixed(1)} per partita), ${(tallone / totalHands * 100).toFixed(0)}% finite per tallone, ${(turns / totalHands).toFixed(0)} turni a mano, ${capped} mani interrotte al limite di turni, ${((Date.now() - t0) / 1000).toFixed(1)} s\n`)
console.log('strategia       vinte   Elo   pt/mano  chiusure  puliti  sporchi  pozz.mancati')
for (const id of [...ids].sort((x, y) => elo[y] - elo[x])) {
  const s = stats[id]
  console.log(
    id.padEnd(14),
    `${(s.wins / s.games * 100).toFixed(0)}%`.padStart(6),
    String(Math.round(elo[id])).padStart(6),
    (s.handPts / s.hands).toFixed(0).padStart(8),
    `${(s.closures / s.hands * 100).toFixed(0)}%`.padStart(9),
    (s.puliti / s.hands).toFixed(2).padStart(7),
    (s.sporchi / s.hands).toFixed(2).padStart(8),
    `${(s.pozzMissed / s.hands * 100).toFixed(0)}%`.padStart(13),
  )
}
console.log('\nScontri diretti (vittorie della riga):')
for (const a of ids) {
  console.log(a.padEnd(14), ids.map((b) => {
    if (a === b) return '   -'
    const key = ids.indexOf(a) < ids.indexOf(b) ? `${a}|${b}` : `${b}|${a}`
    const w = ids.indexOf(a) < ids.indexOf(b) ? h2h[key] : GAMES - h2h[key]
    return String(w).padStart(4)
  }).join(' '))
}
