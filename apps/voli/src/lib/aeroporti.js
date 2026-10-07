// Elenco degli aeroporti (autocompletamento e nomi), caricato in background: sono ~4000 righe (aeroporti-dati.js,
// generato da scripts/voli/genera-aeroporti.mjs) e non servono per il primo disegno della pagina.
// Finché non è caricato, i nomi mostrano il codice IATA; poi le viste si aggiornano da sole (dati reattivi).
import { shallowRef } from 'vue'

/** [{ codice, nome, paese, citta: bool }] in ordine di nome */
export const aeroporti = shallowRef([])
/** Map(codice → aeroporto) */
export const perCodice = shallowRef(new Map())

let pending = null
let paesi = null
const nomePaese = (iso) => {
  try {
    paesi ??= new Intl.DisplayNames(['it'], { type: 'region' })
    return paesi.of(iso) ?? iso
  } catch {
    // codice non riconosciuto dal browser (es. XK): resta il codice
    return iso
  }
}

export function caricaAeroporti() {
  pending ??= import('./aeroporti-dati.js').then(({ default: raw }) => {
    const list = raw.split('\n').map((r) => {
      const [codice, nome, iso, tipo] = r.split('|')
      return { codice, nome: nome || codice, paese: iso ? nomePaese(iso) : '', citta: tipo === 'c' }
    })
    aeroporti.value = list
    perCodice.value = new Map(list.map((a) => [a.codice, a]))
  }).catch(() => { pending = null })
  return pending
}
