// Carte del burraco: due mazzi da 52 + 4 jolly = 108 carte, rappresentate da interi 0..107.
// Dentro ogni mazzo (54 carte): 0..51 = seme * 13 + (valore - 1), 52 e 53 = jolly.
// Modulo puro (niente Vue né browser): lo usano l'app e lo script del torneo tra bot.

export const N_CARDS = 108
export const SUITS = ['♠', '♥', '♦', '♣']
export const SUIT_NAMES = ['picche', 'cuori', 'quadri', 'fiori']
export const RED = [false, true, true, false]
const RANK_LABELS = ['JK', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

/** Valore: 1 = asso … 13 = re, 0 = jolly. */
export const rankOf = (c) => { const k = c % 54; return k >= 52 ? 0 : (k % 13) + 1 }
/** Seme 0..3, -1 per il jolly. */
export const suitOf = (c) => { const k = c % 54; return k >= 52 ? -1 : Math.floor(k / 13) }
export const isJoker = (c) => c % 54 >= 52
/** Matta: jolly o pinella (il 2). */
export const isWild = (c) => isJoker(c) || rankOf(c) === 2

/** Punti della carta: jolly 30, pinella 20, asso 15, 8…K 10, 3…7 5. */
export function cardValue(c) {
  const r = rankOf(c)
  if (r === 0) return 30
  if (r === 2) return 20
  if (r === 1) return 15
  return r >= 8 ? 10 : 5
}
export const sumValues = (cards) => cards.reduce((a, c) => a + cardValue(c), 0)

export const rankLabel = (c) => RANK_LABELS[rankOf(c)]
export const cardLabel = (c) => (isJoker(c) ? 'Jolly' : `${rankLabel(c)}${SUITS[suitOf(c)]}`)
/** Stessa carta "logica" (stesso seme e valore, mazzo diverso). */
export const sameFace = (a, b) => a % 54 === b % 54 || (isJoker(a) && isJoker(b))

/** Ordina per seme e valore (jolly e pinelle in fondo) o per valore. */
export function sortHand(cards, by = 'suit') {
  const key = (c) => {
    if (isJoker(c)) return 1000
    const r = rankOf(c)
    if (r === 2) return 900 + suitOf(c)
    const rr = r === 1 ? 14 : r
    return by === 'suit' ? suitOf(c) * 20 + rr : rr * 4 + suitOf(c)
  }
  return [...cards].sort((a, b) => key(a) - key(b) || a - b)
}

/** Generatore pseudo-casuale riproducibile (mulberry32). */
export function makeRng(seed = Date.now()) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const newDeck = (rng) => shuffle(Array.from({ length: N_CARDS }, (_, i) => i), rng)
