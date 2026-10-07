// Prompt per far cercare i voli a Claude con la skill voli-monitor (routine o "Cerca ora").
// La ricerca esegue gli script della repo (scripts/voli): serve Claude Code o la routine, con il connettore Supabase.

export const SKILL = 'voli-monitor'
export const APP_URL = 'https://filocarletti.github.io/voli/'

/** Prompt per una ricerca subito: tutto lo spazio o un solo monitoraggio. */
export function promptCercaOra({ spaceId, ricerca = null }) {
  const righe = [
    `Usa la skill ${SKILL} per aggiornare i prezzi dei voli dell'app Voli (${APP_URL}).`,
    `Spazio: ${spaceId}.`,
  ]
  if (ricerca) righe.push(`Solo il monitoraggio «${ricerca.nome}» (id ${ricerca.id}).`)
  righe.push('Alla fine dimmi i prezzi migliori e gli avvisi nuovi.')
  return righe.join('\n')
}

/** Prompt della routine pianificata: tutti gli spazi con monitoraggi attivi. */
export function promptRoutine() {
  return [
    `Usa la skill ${SKILL} per aggiornare i prezzi dei voli dell'app Voli (${APP_URL}):`,
    'tutti gli spazi con monitoraggi attivi (i miei e quelli condivisi con me).',
    'Registra i risultati, pulisci i dati vecchi e rispondi in breve con i prezzi migliori, gli avvisi nuovi e i problemi delle fonti.',
  ].join('\n')
}

/** Apre Claude con il prompt già scritto (se il sito non lo precompila, il prompt è comunque copiato). */
export const claudeUrl = (prompt) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
