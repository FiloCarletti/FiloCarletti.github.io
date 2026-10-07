// Ricerca dei voli per la skill voli-monitor (routine di Claude).
//
//   node scripts/voli/cerca.mjs <config.json> [--out <cartella>] [--google-max 30] [--fascia-max 150]
//                               [--max-righe 400] [--solo <id monitoraggio>]
//
// config.json: il risultato di public.voli_config(<spazio>), oppure un array di questi (più spazi).
// Per ogni spazio scrive in --out (default: <tmp>/voli) uno o più file nel formato di public.voli_registra
// (voli-<spazio>-<n>.json) e stampa un riepilogo. Le tratte comuni a più monitoraggi o spazi si scaricano una volta.
//
// Strategia:
//  1. Ryanair e Wizz Air: prezzo minimo di ogni giorno per ogni tratta (una richiesta al mese), andata e ritorno.
//     Se il volo più economico di un giorno non rispetta gli orari, Ryanair cerca il migliore nella fascia (--fascia-max
//     richieste al massimo); Wizz salta i giorni con più voli di cui solo alcuni nella fascia.
//  2. Combinazioni andata + ritorno con apps/voli/src/lib/combina.js (la stessa logica dell'app).
//  3. Google Flights (tutte le compagnie): al massimo --google-max richieste, sulle date più convenienti trovate al
//     punto 1 più alcune date a rotazione su tutto il periodo (così nel tempo si copre tutto).
//  4. Miglior soluzione per monitoraggio → "migliori" (la funzione del DB genera andamento e avvisi). Se una fonte
//     richiesta è fallita del tutto, il miglior prezzo di quel monitoraggio non si aggiorna (eviterebbe falsi avvisi).
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { args, jitter, log } from './common.mjs'
import * as ryanair from './ryanair.mjs'
import * as wizz from './wizz.mjs'
import * as google from './google.mjs'
import { addDays, combina, criteri, hhmm, isoDow, orarioOk, riassunto, romeToday } from '../../apps/voli/src/lib/combina.js'
import { fontiRicerca } from '../../apps/voli/src/lib/fonti.js'

const opt = args()
if (!opt._[0]) {
  console.error('Uso: node scripts/voli/cerca.mjs <config.json> [--out dir] [--google-max 30] [--fascia-max 150] [--max-righe 400] [--solo id]')
  process.exit(1)
}
const GOOGLE_MAX = Number(opt['google-max'] ?? 30)
const FASCIA_MAX = Number(opt['fascia-max'] ?? 150)
const MAX_RIGHE = Number(opt['max-righe'] ?? 400)
const OUT = path.resolve(opt.out ?? path.join(os.tmpdir(), 'voli'))
const oggi = romeToday()

const configs = [].concat(JSON.parse(readFileSync(opt._[0], 'utf8'))).filter((c) => c?.space_id)
const LOWCOST = { ryanair, wizz }
const NOME = { ryanair: 'Ryanair', wizz: 'Wizz Air' }
const maxDate = (a, b) => (a > b ? a : b)
const minDate = (a, b) => (a < b ? a : b)

const stats = {}
const stat = (f) => (stats[f] ??= { ok: true, richieste: 0, riuscite: 0, voli: 0, errori: 0, errore: '' })
const fail = (f, e) => {
  const s = stat(f)
  s.errori++
  s.errore ||= String(e?.message ?? e).slice(0, 200)
  log(`  ! ${f}: ${e?.message ?? e}`)
}
const note = []

/* ---------- 1. Tratte richieste da tutti i monitoraggi ---------- */

const ricerche = [] // { space, r, c, fonti }
const needs = new Map() // `${fonte}|${o}|${d}` → { fonte, o, d, da, a, usi: [{ space, da, a, giorni, dopo, prima }] }
function need(fonte, o, d, da, a, f, space) {
  if (a < da || o === d) return
  const k = `${fonte}|${o}|${d}`
  const n = needs.get(k) ?? { fonte, o, d, da, a, usi: [] }
  n.da = minDate(n.da, da)
  n.a = maxDate(n.a, a)
  n.usi.push({ space, da, a, giorni: f.giorni ?? [], dopo: hhmm(f.dopo) || null, prima: hhmm(f.prima) || null })
  needs.set(k, n)
}
for (const cfg of configs) {
  for (const r of cfg.ricerche ?? []) {
    if (opt.solo && r.id !== opt.solo) continue
    const c = criteri(r)
    const da = maxDate(c.da, oggi)
    if (da > c.a) continue
    const fonti = fontiRicerca(r, cfg.fonti ?? {})
    ricerche.push({ space: cfg.space_id, attive: cfg.fonti ?? {}, r, c, fonti })
    for (const f of fonti.filter((x) => LOWCOST[x])) {
      stat(f)
      for (const o of c.origini) for (const d of c.destinazioni) need(f, o, d, da, c.a, c.andata, cfg.space_id)
      if (!c.soloAndata) {
        for (const d of c.destinazioni) for (const o of c.origini) need(f, d, o, addDays(da, c.durMin), addDays(c.a, c.durMax), c.ritorno, cfg.space_id)
      }
    }
    if (fonti.includes('google')) stat('google')
  }
}
log(`${ricerche.length} monitoraggi in ${configs.length} spazi, ${needs.size} tratte low cost da scaricare`)

/* ---------- 2. Prezzi minimi giornalieri (Ryanair, Wizz Air) ---------- */

const raw = new Map()
for (const [k, n] of needs) {
  const s = stat(n.fonte)
  try {
    const res = await LOWCOST[n.fonte].minimiGiornalieri(n.o, n.d, n.da, n.a)
    s.richieste += res.richieste
    s.riuscite += res.richieste
    raw.set(k, res.giorni)
    log(`  ${n.fonte} ${n.o}→${n.d} ${n.da}…${n.a}: ${res.giorni.size} giorni con voli`)
  } catch (e) {
    s.richieste++
    fail(n.fonte, e)
  }
}

/* ---------- 3. Tratte per spazio, con i filtri di giorni e orari ---------- */

const perSpazio = new Map() // space → { tratte: Map(chiave → riga), ar: Map, coperture: Map, gq: Set }
const spazio = (id) => {
  if (!perSpazio.has(id)) perSpazio.set(id, { tratte: new Map(), ar: new Map(), coperture: new Map() })
  return perSpazio.get(id)
}
const fascia = new Map()
let fasciaUsate = 0
let fasciaSaltate = 0
let wizzSaltati = 0

function riga(fonte, o, d, x, extra = {}) {
  const [arr, gg] = String(x.arrivo ?? '').split('+')
  return {
    tipo: 'tratta', fonte, origine: o, destinazione: d, data: x.data, partenza: x.partenza, arrivo: arr || null,
    arrivo_giorni: Number(gg ?? 0) || 0, volo: x.volo ?? '', compagnia: NOME[fonte] ?? x.compagnia ?? '', scali: 0,
    prezzo: x.prezzo, attivo: true, ...extra,
  }
}
const chiave = (v) => [v.fonte, v.tipo, v.origine, v.destinazione, v.data, v.partenza, v.compagnia.toLowerCase(), v.ritorno_a, v.data_ritorno]
  .filter((x) => x != null && x !== '').join('|')
function aggiungi(space, v) {
  v.id = chiave(v)
  const sp = spazio(space)
  const map = v.tipo === 'ar' ? sp.ar : sp.tratte
  if (!map.has(v.id) || v.prezzo < map.get(v.id).prezzo) map.set(v.id, v)
}
/** Copertura: tratta e date cercate con successo. Low cost: un intervallo per tratta; Google: una per ricerca. */
function copri(space, cop) {
  const sp = spazio(space)
  const esatta = cop[0] === 'google'
  const k = esatta ? cop.join('|') : cop.slice(0, 3).join('|')
  const prev = sp.coperture.get(k)
  if (prev && !esatta) { prev[3] = minDate(prev[3], cop[3]); prev[4] = maxDate(prev[4], cop[4]) } else sp.coperture.set(k, [...cop])
}

for (const [k, n] of needs) {
  const giorni = raw.get(k)
  if (!giorni) continue
  const s = stat(n.fonte)
  for (const u of n.usi) {
    let routeOk = true
    for (let day = u.da; day <= u.a; day = addDays(day, 1)) {
      if (u.giorni.length && !u.giorni.includes(isoDow(day))) continue
      const g = giorni.get(day)
      if (!g) continue
      if (n.fonte === 'ryanair') {
        if (orarioOk(g.partenza, u.dopo, u.prima)) { aggiungi(u.space, riga('ryanair', n.o, n.d, g)); continue }
        const fk = `${n.o}|${n.d}|${day}|${u.dopo}|${u.prima}`
        if (!fascia.has(fk)) {
          if (fasciaUsate >= FASCIA_MAX) { fasciaSaltate++; continue }
          fasciaUsate++
          s.richieste++
          try {
            fascia.set(fk, await ryanair.migliorNellaFascia(n.o, n.d, day, u.dopo, u.prima))
            s.riuscite++
          } catch (e) {
            fascia.set(fk, undefined)
            routeOk = false
            fail('ryanair', e)
          }
        }
        const f = fascia.get(fk)
        if (f) aggiungi(u.space, riga('ryanair', n.o, n.d, f))
      } else {
        const ok = g.partenze.filter((t) => orarioOk(t, u.dopo, u.prima))
        if (!ok.length) continue
        if (ok.length < g.partenze.length) { wizzSaltati++; continue } // prezzo del giorno forse di un volo fuori fascia
        aggiungi(u.space, riga('wizz', n.o, n.d, { data: day, partenza: ok[0], arrivo: null, prezzo: g.prezzo }))
      }
    }
    if (routeOk) copri(u.space, [n.fonte, n.o, n.d, u.da, u.a])
  }
}
if (fasciaSaltate) note.push(`Ryanair: ${fasciaSaltate} giorni senza ricerca per fascia oraria (limite di ${FASCIA_MAX} richieste).`)
if (wizzSaltati) note.push(`Wizz Air: ${wizzSaltati} giorni saltati (più voli, solo alcuni negli orari).`)

/* ---------- 4. Google Flights sulle date più promettenti ---------- */

const ora = new Date()
const seme = Math.floor((ora - new Date(ora.getFullYear(), 0, 0)) / 86400000) * 2 + (ora.getHours() >= 12 ? 1 : 0)
/** k elementi distribuiti su tutta la lista, con partenza diversa a ogni ricerca. */
function aRotazione(list, k) {
  if (list.length <= k) return list
  const passo = Math.floor(list.length / k)
  const start = seme % passo
  return Array.from({ length: k }, (_, i) => list[start + i * passo])
}
const code = [] // per monitoraggio: query candidate { o, d, data, dr }
for (const x of ricerche) {
  if (!x.fonti.includes('google')) continue
  const { c, r } = x
  const sp = spazio(x.space)
  const righe = [...sp.tratte.values()]
  const q = []
  const add = (o, d, data, dr) => {
    if (!q.some((y) => y.o === o && y.d === d && y.data === data && y.dr === dr)) q.push({ o, d, data, dr, spaces: [x.space] })
  }
  const low = combina(r, righe, { oggi, attive: x.attive })
  for (const s of low) {
    if (q.length >= 4) break
    if (c.soloAndata) add(s.origine, s.destinazione, s.data, null)
    else if (s.ritorno_a === s.origine) add(s.origine, s.destinazione, s.data, s.data_ritorno)
  }
  // date a rotazione su tutto il periodo (anche per le compagnie non low cost)
  const celle = []
  for (let day = maxDate(c.da, oggi); day <= c.a; day = addDays(day, 1)) {
    if (c.andata.giorni.length && !c.andata.giorni.includes(isoDow(day))) continue
    for (const o of c.origini) {
      for (const d of c.destinazioni) {
        if (c.soloAndata) { celle.push([o, d, day, null]); continue }
        for (let dur = c.durMin; dur <= c.durMax; dur++) {
          const dr = addDays(day, dur)
          if (c.ritorno.giorni.length && !c.ritorno.giorni.includes(isoDow(dr))) continue
          celle.push([o, d, day, dr])
        }
      }
    }
  }
  for (const [o, d, data, dr] of aRotazione(celle, low.length ? 3 : 8)) add(o, d, data, dr)
  code.push(q)
}
const gq = new Map() // `${o}|${d}|${data}|${dr}` → { …, spaces }
for (let i = 0; gq.size < GOOGLE_MAX && code.some((q) => q.length); i++) {
  const q = code[i % code.length]
  const x = q.shift()
  if (!x) continue
  const k = `${x.o}|${x.d}|${x.data}|${x.dr}`
  if (gq.has(k)) gq.get(k).spaces.push(...x.spaces)
  else gq.set(k, x)
}
let googleVuote = 0
let googleStop = false
for (const x of gq.values()) {
  if (googleStop) break
  const s = stat('google')
  s.richieste++
  try {
    const { voli, url } = await google.cerca(x.o, x.d, x.data, x.dr)
    s.riuscite++
    log(`  google ${x.o}→${x.d} ${x.data}${x.dr ? `…${x.dr}` : ''}: ${voli.length} voli`)
    if (!voli.length) { googleVuote++; continue }
    for (const space of new Set(x.spaces)) {
      for (const v of voli) {
        const base = {
          fonte: 'google', origine: x.o, destinazione: x.d, data: x.data, partenza: v.partenza, arrivo: v.arrivo,
          arrivo_giorni: v.arrivo_giorni, volo: '', compagnia: v.compagnia, scali: v.scali, durata_min: v.durata,
          prezzo: v.prezzo, attivo: true, url,
        }
        aggiungi(space, x.dr ? { ...base, tipo: 'ar', ritorno_a: x.o, data_ritorno: x.dr } : { ...base, tipo: 'tratta' })
      }
      copri(space, ['google', x.o, x.d, x.data, x.data, x.dr ?? null])
    }
  } catch (e) {
    fail('google', e)
    if (/captcha/i.test(e.message)) { googleStop = true; note.push('Google Flights: captcha, ricerche interrotte.') }
  }
  await jitter(1500, 3000)
}
if (googleVuote) note.push(`Google Flights: ${googleVuote} ricerche senza risultati leggibili.`)

/* ---------- 5. Migliori soluzioni e file per voli_registra ---------- */

for (const [f, s] of Object.entries(stats)) {
  s.ok = s.errori === 0
  s.voli = [...perSpazio.values()].reduce((n, sp) => n + [...sp.tratte.values(), ...sp.ar.values()].filter((v) => v.fonte === f).length, 0)
}
const fallita = (f) => stats[f] && stats[f].richieste > 0 && stats[f].riuscite === 0

const compatta = (v) => {
  const arrivo = v.arrivo ? `${v.arrivo}${v.arrivo_giorni ? `+${v.arrivo_giorni}` : ''}` : ''
  const out = [v.fonte, v.origine, v.destinazione, v.data, v.partenza ?? '', arrivo, v.volo ?? '', v.prezzo]
  if (v.fonte !== 'ryanair' && v.fonte !== 'wizz') out.push(v.compagnia, v.scali ?? 0, v.durata_min ?? null)
  return out
}
// L'url di Google non si salva: l'app lo ricostruisce (lib/link.js) e il payload resta piccolo.
const compattaAr = (v) => [
  v.fonte, v.origine, v.destinazione, v.data, v.partenza ?? '', v.arrivo ? `${v.arrivo}${v.arrivo_giorni ? `+${v.arrivo_giorni}` : ''}` : '',
  v.compagnia, v.scali ?? 0, v.durata_min ?? null, v.ritorno_a, v.data_ritorno, v.prezzo,
]
const fmt = (n) => (n == null ? '—' : `${Number(n).toFixed(2).replace('.', ',')} €`)
const descr = (s) => {
  const a = `${s.origine}→${s.destinazione} ${s.data.slice(8)}/${s.data.slice(5, 7)} ${s.andata.partenza} ${s.andata.compagnia}`
  if (!s.ritorno) return a
  return `${a}, ritorno ${s.data_ritorno.slice(8)}/${s.data_ritorno.slice(5, 7)} ${s.ritorno.partenza || '(orario da scegliere)'} → ${s.ritorno_a} ${s.ritorno.compagnia || ''}`.trim()
}

mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (/^voli-.*\.json$/.test(f)) rmSync(path.join(OUT, f))

const fontiOut = Object.fromEntries(Object.entries(stats).map(([f, s]) => [f, { ok: s.ok, richieste: s.richieste, voli: s.voli, errori: s.errori, errore: s.errore }]))
const riepilogo = []
for (const cfg of configs) {
  const sp = spazio(cfg.space_id)
  const righe = [...sp.tratte.values(), ...sp.ar.values()]
  const mine = ricerche.filter((x) => x.space === cfg.space_id)
  if (!mine.length) continue
  const migliori = []
  const testo = [`Spazio ${cfg.space_id}: ${mine.length} monitoraggi, ${sp.tratte.size} tratte, ${sp.ar.size} andata e ritorno (Google)`]
  const noteSpazio = [...note]
  for (const x of mine) {
    const ko = x.fonti.filter(fallita)
    const sol = combina(x.r, righe, { oggi, attive: x.attive })
    // Le soluzioni con l'orario del ritorno da verificare (Google, con fascia oraria del ritorno) non fanno avvisi.
    const best = sol.find((s) => !s.verificare) ?? null
    if (ko.length) {
      noteSpazio.push(`${x.r.nome}: miglior prezzo non aggiornato (fonti non raggiungibili: ${ko.join(', ')}).`)
      testo.push(`  - ${x.r.nome}: NON aggiornato, fonti fallite ${ko.join(', ')} (migliore trovato ${fmt(best?.prezzo)})`)
      continue
    }
    migliori.push({ ricerca: x.r.id, prezzo: best?.prezzo ?? null, soluzione: riassunto(best) })
    const extra = [
      x.r.minimo_storico != null ? `minimo storico ${fmt(x.r.minimo_storico)}` : null,
      x.r.prezzo_obiettivo != null ? `obiettivo ${fmt(x.r.prezzo_obiettivo)}` : null,
      x.r.migliore != null ? `prima ${fmt(x.r.migliore)}` : null,
    ].filter(Boolean).join(' · ')
    testo.push(`  - ${x.r.nome}: ${best ? `${fmt(best.prezzo)} (${descr(best)})` : 'nessuna soluzione'} · ${sol.length} soluzioni${extra ? ` · ${extra}` : ''}`)
  }

  // Parti: tratte low cost raggruppate per tratta (con le loro coperture); Google (tratte, andata e ritorno e le loro
  // coperture) e migliori nell'ultima. Ogni parte è una transazione: una copertura deve stare con i suoi voli.
  const gruppi = new Map()
  for (const v of sp.tratte.values()) {
    if (v.fonte === 'google') continue
    const k = `${v.fonte}|${v.origine}|${v.destinazione}`
    if (!gruppi.has(k)) gruppi.set(k, [])
    gruppi.get(k).push(v)
  }
  const coperture = [...sp.coperture.values()]
  const parti = [{ tratte: [], coperture: [] }]
  for (const [k, list] of gruppi) {
    let p = parti.at(-1)
    if (p.tratte.length && p.tratte.length + list.length > MAX_RIGHE) parti.push((p = { tratte: [], coperture: [] }))
    p.tratte.push(...list.map(compatta))
    p.coperture.push(...coperture.filter((c) => c[0] !== 'google' && `${c[0]}|${c[1]}|${c[2]}` === k))
  }
  // coperture di tratte senza voli trovati (rotte non operate nel periodo): nella prima parte
  const usate = new Set(gruppi.keys())
  parti[0].coperture.push(...coperture.filter((c) => c[0] !== 'google' && !usate.has(`${c[0]}|${c[1]}|${c[2]}`)))
  const last = parti.at(-1)
  last.tratte.push(...[...sp.tratte.values()].filter((v) => v.fonte === 'google').map(compatta))
  last.ar = [...sp.ar.values()].map(compattaAr)
  last.coperture.push(...coperture.filter((c) => c[0] === 'google'))
  last.migliori = migliori

  const nomeBase = `voli-${cfg.space_id.slice(0, 8)}`
  const esecuzione = randomUUID() // stessa riga del registro per tutte le parti
  parti.forEach((p, i) => {
    const dati = { esecuzione, ...p, fonti: i === 0 ? fontiOut : {}, note: i === 0 ? noteSpazio.join(' ') : '' }
    const file = path.join(OUT, `${nomeBase}-${i + 1}.json`)
    writeFileSync(file, JSON.stringify(dati))
    testo.push(`  file ${i + 1}/${parti.length}: ${file} (${Math.round(JSON.stringify(dati).length / 1024)} KB)`)
  })
  riepilogo.push(testo.join('\n'))
}

console.log(riepilogo.join('\n\n') || 'Nessun monitoraggio attivo da cercare.')
console.log(`\nFonti: ${Object.entries(stats).map(([f, s]) => `${f} ${s.ok ? 'ok' : `ERRORI ${s.errori} (${s.errore})`}, ${s.richieste} richieste, ${s.voli} voli`).join(' · ') || 'nessuna'}`)
if (note.length) console.log(`Note: ${note.join(' ')}`)
