import { ref } from 'vue'

// Tema reattivo: i colori dei grafici vengono ricalcolati quando cambia la modalità chiara/scura.
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
export const isDark = ref(!!mq?.matches)
mq?.addEventListener('change', (e) => { isDark.value = e.matches })

/** Legge una variabile CSS del design system condiviso (es. '--muted'). */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Rampa sequenziale (blu) per la heatmap: chiaro → scuro in light, invertita in dark.
const SEQ_LIGHT = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab']
const SEQ_DARK = ['#184f95', '#256abf', '#3987e5', '#86b6ef']
export const seqColor = (step) => (isDark.value ? SEQ_DARK : SEQ_LIGHT)[step]

export const accent = () => (isDark.value ? '#3987e5' : '#2a78d6')
export const accent2 = () => (isDark.value ? '#d95926' : '#eb6834')
