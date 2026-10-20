// Combinazioni: scale (almeno 3 carte consecutive dello stesso seme) e tris/gruppi (almeno 3 carte dello
// stesso valore), con al massimo una matta (jolly o pinella). Il 2 dello stesso seme in posizione naturale
// non conta come matta. L'asso sta sotto il 2 o sopra il re (A-2-3 oppure Q-K-A, non K-A-2).
// Una combinazione si riesamina da capo a ogni aggiunta: se una carta naturale prende il posto della matta,
// la matta si sposta a un'estremità, come da regolamento.
// Burraco = combinazione di almeno 7 carte: pulito senza matte, sporco con una matta.
// Semipulito (regola facoltativa): almeno 7 carte naturali consecutive e poi la matta.
// Ogni analisi riporta "run", la serie più lunga di carte naturali consecutive (senza la matta).
import { isJoker, isWild, rankOf, suitOf } from './cards.js'

export const BURRACO_LEN = 7

/**
 * Esamina una scala. Restituisce null se non valida, altrimenti
 * { type: 'seq', suit, clean, wild (id della matta o null), len, order (id dalla carta più bassa) }.
 */
export function analyzeSeq(cards) {
  const n = cards.length
  if (n < 3 || n > 14) return null
  const nat = []
  const twos = []
  const jokers = []
  for (const c of cards) {
    const r = rankOf(c)
    if (r === 0) jokers.push(c)
    else if (r === 2) twos.push(c)
    else nat.push(c)
  }
  let suit = -1
  for (const c of nat) {
    const s = suitOf(c)
    if (suit === -1) suit = s
    else if (s !== suit) return null
  }
  if (suit === -1) {
    // Solo pinelle e jolly: valida solo se una pinella fa da 2 naturale (es. 2♥ + matte): mai abbastanza.
    return null
  }
  const sameTwos = twos.filter((c) => suitOf(c) === suit)
  const otherWild = [...jokers, ...twos.filter((c) => suitOf(c) !== suit)]
  if (otherWild.length > 1) return null
  const twoOptions = []
  if (otherWild.length === 1) {
    if (sameTwos.length > 1) return null
    twoOptions.push({ natTwo: sameTwos[0] ?? null, wild: otherWild[0] })
  } else if (sameTwos.length === 0) twoOptions.push({ natTwo: null, wild: null })
  else if (sameTwos.length === 1) twoOptions.push({ natTwo: sameTwos[0], wild: null }, { natTwo: null, wild: sameTwos[0] })
  else if (sameTwos.length === 2) twoOptions.push({ natTwo: sameTwos[0], wild: sameTwos[1] })
  else return null

  const aces = nat.filter((c) => rankOf(c) === 1)
  const others = nat.filter((c) => rankOf(c) !== 1)
  if (aces.length > 2) return null
  const aceOptions = aces.length === 0 ? [[]] : aces.length === 1 ? [[1], [14]] : [[1, 14]]

  let best = null
  for (const to of twoOptions) {
    for (const ao of aceOptions) {
      const pos = others.map((c) => [c, rankOf(c)])
      ao.forEach((p, i) => pos.push([aces[i], p]))
      if (to.natTwo != null) pos.push([to.natTwo, 2])
      const ranks = new Set(pos.map((p) => p[1]))
      if (ranks.size !== pos.length) continue
      let min = 99
      let max = -1
      for (const [, r] of pos) { if (r < min) min = r; if (r > max) max = r }
      const gaps = max - min + 1 - pos.length
      const w = to.wild != null ? 1 : 0
      if (gaps > w) continue
      let wildPos = null
      if (w) {
        if (gaps === 1) {
          for (let r = min + 1; r < max; r++) if (!ranks.has(r)) { wildPos = r; break }
        } else if (max < 14) wildPos = max + 1
        else if (min > 1) wildPos = min - 1
        else continue
        pos.push([to.wild, wildPos])
      }
      pos.sort((a, b) => a[1] - b[1])
      const wi = w ? pos.findIndex((p) => p[0] === to.wild) : -1
      const res = {
        type: 'seq', suit, clean: !w, wild: to.wild, len: n,
        low: pos[0][1], high: pos.at(-1)[1], order: pos.map((p) => p[0]),
        run: w ? Math.max(wi, n - wi - 1) : n,
      }
      if (!best || (res.clean && !best.clean) || (res.clean === best.clean && res.run > best.run)) best = res
      if (best.clean) return best
    }
  }
  return best
}

/** Esamina un tris/gruppo: { type: 'set', rank, clean, wild, len, order } o null. */
export function analyzeSet(cards) {
  const n = cards.length
  if (n < 3 || n > 9) return null
  const nat = []
  const wild = []
  for (const c of cards) (isWild(c) ? wild : nat).push(c)
  if (wild.length > 1 || nat.length < 2) return null
  const r = rankOf(nat[0])
  if (nat.some((c) => rankOf(c) !== r)) return null
  const order = [...nat].sort((a, b) => suitOf(a) - suitOf(b) || a - b)
  if (wild.length) order.push(wild[0])
  return { type: 'set', rank: r, clean: !wild.length, wild: wild[0] ?? null, len: n, order, run: nat.length }
}

/** Esamina una combinazione (di tipo dato, oppure scala o tris). */
export function analyzeMeld(cards, type = null) {
  if (type === 'seq') return analyzeSeq(cards)
  if (type === 'set') return analyzeSet(cards)
  return analyzeSeq(cards) ?? analyzeSet(cards)
}

export const isBurraco = (a) => a && a.len >= BURRACO_LEN

/** Tipo di burraco: 'pulito', 'semipulito' (solo se la regola è attiva), 'sporco'; null se non è un burraco. */
export function burracoKind(a, semi = false) {
  if (!isBurraco(a)) return null
  if (a.clean) return 'pulito'
  return semi && a.run >= BURRACO_LEN ? 'semipulito' : 'sporco'
}

/** Matte in mano in ordine di preferenza d'uso: prima le pinelle, poi i jolly. */
function wildsOf(hand) {
  return hand.filter(isWild).sort((a, b) => (isJoker(a) ? 1 : 0) - (isJoker(b) ? 1 : 0))
}

/**
 * Combinazioni nuove che si possono calare con le carte in mano (euristica per i bot e i suggerimenti):
 * scale massimali pulite, scale con una matta (un buco o un'estremità), tris puliti e tris con matta.
 * Restituisce [{ ids, a }] dove a è il risultato di analyzeMeld.
 */
export function findCombos(hand, { withWild = true } = {}) {
  const out = []
  const wilds = withWild ? wildsOf(hand) : []
  const seen = new Set()
  const push = (ids, type) => {
    const key = [...ids].sort((x, y) => x - y).join(',')
    if (seen.has(key)) return
    const a = analyzeMeld(ids, type)
    if (a) { seen.add(key); out.push({ ids, a }) }
  }
  for (let s = 0; s < 4; s++) {
    // una carta per valore; l'asso vale 1 e 14, il 2 del seme vale come naturale
    const byRank = new Array(15).fill(null)
    for (const c of hand) {
      if (isJoker(c) || suitOf(c) !== s) continue
      const r = rankOf(c)
      if (byRank[r] == null) byRank[r] = c
      if (r === 1 && byRank[14] == null) byRank[14] = c
    }
    // segmenti consecutivi
    const segs = []
    let cur = []
    for (let r = 1; r <= 14; r++) {
      if (byRank[r] != null && !cur.includes(byRank[r])) cur.push(byRank[r])
      else { if (cur.length) segs.push({ start: r - cur.length, cards: cur }); cur = [] }
    }
    if (cur.length) segs.push({ start: 15 - cur.length, cards: cur })
    for (const seg of segs) {
      if (seg.cards.length >= 3) push(seg.cards, 'seq')
    }
    if (!wilds.length) continue
    for (let i = 0; i < segs.length; i++) {
      const a = segs[i]
      // matta all'estremità di un segmento di 2 (o più, se serve per un 2 naturale non utilizzabile)
      if (a.cards.length === 2) {
        const w = wilds.find((x) => !a.cards.includes(x))
        if (w != null) push([...a.cards, w], 'seq')
      }
      // due segmenti separati da un solo buco
      const b = segs[i + 1]
      if (b && b.start === a.start + a.cards.length + 1 && a.cards.length + b.cards.length >= 2) {
        const w = wilds.find((x) => !a.cards.includes(x) && !b.cards.includes(x))
        if (w != null) push([...a.cards, w, ...b.cards], 'seq')
      }
    }
  }
  // tris
  const byRank = new Map()
  for (const c of hand) {
    if (isWild(c)) continue
    const r = rankOf(c)
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r).push(c)
  }
  for (const cards of byRank.values()) {
    if (cards.length >= 3) push(cards, 'set')
    else if (cards.length === 2 && wilds.length) push([...cards, wilds[0]], 'set')
  }
  return out
}
