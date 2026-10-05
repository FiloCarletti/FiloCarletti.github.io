import { isDark } from './theme.js'

// Categorie in ordine fisso: il colore segue la categoria, mai la posizione nel grafico.
export const CATEGORIE = ['Forza gambe', 'Pliometria', 'Core', 'Parte superiore', 'Cardio', 'Mobilità', 'Altro']

const COLORS = {
  'Forza gambe': ['#2a78d6', '#3987e5'],
  Pliometria: ['#eb6834', '#d95926'],
  Core: ['#1baf7a', '#199e70'],
  'Parte superiore': ['#eda100', '#c98500'],
  Cardio: ['#e87ba4', '#d55181'],
  Mobilità: ['#008300', '#008300'],
  Altro: ['#8a8f98', '#7b818c'],
}
const EXTRA = [['#4a3aa7', '#9085e9'], ['#e34948', '#e66767']]

export function catColor(cat) {
  const pair = COLORS[cat] ?? EXTRA[Math.abs(hash(cat)) % EXTRA.length]
  return pair[isDark.value ? 1 : 0]
}

/** Ordina un elenco di categorie secondo l'ordine fisso, le sconosciute in fondo. */
export function sortCats(list) {
  const idx = (c) => (CATEGORIE.includes(c) ? CATEGORIE.indexOf(c) : CATEGORIE.length)
  return [...list].sort((a, b) => idx(a) - idx(b) || a.localeCompare(b, 'it'))
}

/** Normalizza una categoria scritta a mano ("Forza Gambe" → "Forza gambe"). */
export function normCat(raw) {
  const s = (raw ?? '').trim()
  if (!s) return null
  const hit = CATEGORIE.find((c) => c.toLowerCase() === s.toLowerCase())
  return hit ?? s.charAt(0).toUpperCase() + s.slice(1)
}

// L'ordine conta: la prima regola che corrisponde vince ("Leg press" è gambe, non spinta).
const RULES = [
  ['Cardio', /cyclette|bike|corsa|tapis|ellittic|vogator|camminat|nuoto|spinning/i],
  ['Mobilità', /stretch|mobilit|yoga|foam/i],
  ['Core', /plank|crunch|addom|\babs\b|abdominal|sit.?up|russian|hollow|dead.?bug|leg raise/i],
  ['Pliometria', /jump|salt|pogo|esplosiv|box|balz|burpee|skip/i],
  ['Forza gambe', /squat|affond|lunge|\bleg\b|calf|polpacc|stacc|deadlift|hip thrust|step|glute|femoral|quadric|bulgarian/i],
  ['Parte superiore', /press|panca|bench|\blat\b|traz|pull|push|row|curl|tricip|bicip|spalle|shoulder|chest|dip|alzate|vertical|military|rematore/i],
]

export function guessCategory(nome) {
  return RULES.find(([, re]) => re.test(nome))?.[0] ?? 'Altro'
}

export function guessUnit(nome) {
  if (/plank|hold|isometr|wall sit|hollow/i.test(nome)) return 'sec'
  if (RULES[0][1].test(nome)) return 'cardio'
  return 'rip'
}

export const UNITA = [
  { value: 'rip', label: 'Serie × ripetizioni' },
  { value: 'sec', label: 'Serie × secondi' },
  { value: 'cardio', label: 'Cardio (min / km)' },
]

function hash(s) {
  let h = 0
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0
  return h
}
