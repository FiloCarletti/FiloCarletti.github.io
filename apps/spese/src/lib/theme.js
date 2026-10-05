import { ref } from 'vue'

// Tema reattivo: i colori dei grafici si ricalcolano al cambio chiaro/scuro.
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
export const isDark = ref(!!mq?.matches)
mq?.addEventListener('change', (e) => { isDark.value = e.matches })

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Palette categoriale validata (ordine fisso) [chiaro, scuro]. Nel DB si salva il valore chiaro;
// in dark si usa il gemello. Oltre l'ottava categoria i grafici raggruppano in "Altre".
export const PALETTE = [
  ['#2a78d6', '#3987e5'],
  ['#eb6834', '#d95926'],
  ['#1baf7a', '#199e70'],
  ['#eda100', '#c98500'],
  ['#e87ba4', '#d55181'],
  ['#008300', '#008300'],
  ['#4a3aa7', '#9085e9'],
  ['#e34948', '#e66767'],
]
export const NONE_COLOR = ['#9aa0a8', '#6b717c']
const DARK_OF = new Map(PALETTE.map(([l, d]) => [l.toLowerCase(), d]))

/** Colore di una categoria (riga di spese_categorie, o null = senza categoria). */
export function catColor(cat) {
  if (!cat) return NONE_COLOR[isDark.value ? 1 : 0]
  const c = (cat.colore ?? PALETTE[hash(cat.nome) % PALETTE.length][0]).toLowerCase()
  return isDark.value ? DARK_OF.get(c) ?? c : c
}
/** Primo colore della palette non ancora usato (per le nuove categorie). */
export function nextColor(used = []) {
  const set = new Set(used.filter(Boolean).map((c) => c.toLowerCase()))
  return (PALETTE.find(([l]) => !set.has(l)) ?? PALETTE[set.size % PALETTE.length])[0]
}
function hash(s = '') {
  let h = 7
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

export const posColor = () => (isDark.value ? '#51cf66' : '#2f9e44')
export const negColor = () => (isDark.value ? '#ff6b6b' : '#e03131')
export const netColor = () => (isDark.value ? '#7aa2ff' : '#3b5bdb')
