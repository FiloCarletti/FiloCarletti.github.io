// Riconoscimento dei prodotti seguiti nelle offerte.
// Un prodotto ha più termini (il nome e le parole alternative): un'offerta lo riconosce se contiene
// tutte le parole di almeno un termine, non contiene nessun termine escluso e, se indicata, ha la marca.
// Le parole si confrontano senza accenti né maiuscole e tollerano singolare/plurale
// ("pomodoro" trova "pomodori", "mela" trova "mele").

const STOP = new Set(['a', 'al', 'alla', 'allo', 'ai', 'agli', 'alle', 'con', 'da', 'del', 'della', 'dello', 'dei', 'degli', 'delle',
  'di', 'e', 'gli', 'i', 'il', 'in', 'la', 'le', 'lo', 'per', 'su', 'un', 'una', 'uno'])

export const normalize = (s = '') =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export const tokens = (s) => normalize(s).split(' ').filter((t) => t && !STOP.has(t))

/** Radice per il confronto singolare/plurale: toglie la vocale finale alle parole lunghe. */
export const stem = (t) => (t.length >= 4 ? t.replace(/[aeiou]$/, '') : t)

function hasToken(words, t) {
  const s = stem(t)
  return words.some((w) => w === t || (s.length >= 3 && w.startsWith(s) && w.length - s.length <= 2))
}
const termMatches = (words, term) => term.length > 0 && term.every((t) => hasToken(words, t))

const splitTerms = (list) => list.map(tokens).filter((t) => t.length)

/** Prepara un prodotto per il confronto (una volta sola). */
export function compile(p) {
  return {
    p,
    terms: splitTerms([p.nome, ...(p.parole ?? [])]),
    escludi: splitTerms(p.escludi ?? []),
    marca: tokens(p.marca ?? ''),
  }
}

/** Testo dell'offerta su cui si cerca. */
export const offerText = (o) => `${o.nome} ${o.marca ?? ''} ${o.formato ?? ''}`

/** `words`: tokens(offerText(offerta)); `c`: compile(prodotto). */
export function matches(words, c) {
  if (!c.terms.some((t) => termMatches(words, t))) return false
  if (c.escludi.some((t) => termMatches(words, t))) return false
  if (c.marca.length && !termMatches(words, c.marca)) return false
  return true
}

/** Prezzo da confrontare con la soglia del prodotto: al pezzo, oppure al kg/litro se l'offerta lo indica. */
export function prezzoConfronto(o, per = 'pz') {
  if (per === 'pz') return Number(o.prezzo)
  return o.unita === per && o.prezzo_unitario != null ? Number(o.prezzo_unitario) : null
}

/** Sotto la soglia di "buon prezzo" del prodotto? */
export function buonPrezzo(o, p) {
  if (p?.prezzo_max == null) return false
  const v = prezzoConfronto(o, p.prezzo_per)
  return v != null && v <= Number(p.prezzo_max)
}

export const UNITA = { pz: 'pezzo', kg: 'kg', l: 'litro' }

/** "parola, altra parola" → ['parola', 'altra parola'] */
export const parseList = (s = '') => [...new Set(s.split(/[,;\n]/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean))]
