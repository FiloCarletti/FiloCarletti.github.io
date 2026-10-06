import { ref } from 'vue'

// Tema reattivo: i colori dei grafici si ricalcolano al cambio chiaro/scuro.
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
export const isDark = ref(!!mq?.matches)
mq?.addEventListener('change', (e) => { isDark.value = e.matches })

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Palette categoriale validata (ordine fisso) [chiaro, scuro]: una serie per supermercato nei grafici.
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
export const seriesColor = (i) => PALETTE[i % PALETTE.length][isDark.value ? 1 : 0]
