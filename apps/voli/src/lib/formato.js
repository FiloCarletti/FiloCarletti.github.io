// Formattazione specifica dei voli (in italiano). Le date sono 'YYYY-MM-DD' locali: niente fusi orari.
import { caricaAeroporti, perCodice } from './aeroporti.js'

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
export const GIORNI_LUNGHI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

const parse = (iso) => iso.split('-').map(Number)
/** 1 = lunedì … 7 = domenica */
export function dow(iso) {
  const [y, m, d] = parse(iso)
  const g = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return g === 0 ? 7 : g
}
/** '2026-11-12' → 'gio 12 nov' */
export function giorno(iso, { anno = false } = {}) {
  if (!iso) return '—'
  const [y, m, d] = parse(iso)
  return `${GIORNI[dow(iso) - 1]} ${d} ${MESI[m - 1]}${anno ? ` ${y}` : ''}`
}
/** '2026-11-12' → '12/11' */
export const breve = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—')
/** 'dal 5 nov al 20 nov' */
export const periodo = (da, a) => `${giorno(da).slice(4)} – ${giorno(a).slice(4)}`
/** 105 → '1 h 45 min' */
export function durata(min) {
  if (min == null) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}
export const euro0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
export const prezzo = (v) => (v == null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v))
/** Prezzo arrotondato all'euro (griglia, grafici) */
export const prezzoTondo = (v) => (v == null ? '—' : euro0.format(Math.round(v)))

caricaAeroporti() // in background: finché non arriva, i nomi sono i codici
export const aeroporto = (c) => perCodice.value.get(c) ?? { codice: c, nome: c, paese: '', citta: false }
export const nomeAeroporto = (c) => perCodice.value.get(c)?.nome ?? c
/** ['BLQ','BGY'] → 'Bologna, Milano Bergamo' */
export const nomiAeroporti = (list = []) => list.map(nomeAeroporto).join(', ')

/** Riepilogo dei criteri di un monitoraggio in una riga. */
export function criteriBreve(r) {
  const p = [`${(r.origini ?? []).join(' · ')} → ${(r.destinazioni ?? []).join(' · ')}`, periodo(r.partenza_da, r.partenza_a)]
  if (!r.solo_andata) p.push(r.durata_min === r.durata_max ? `${r.durata_min} giorni` : `${r.durata_min}–${r.durata_max} giorni`)
  else p.push('solo andata')
  return p.join(' · ')
}
/** "ven dopo le 17:00" ecc. */
export function fasciaBreve(giorni = [], dopo, prima) {
  const g = giorni?.length ? giorni.map((x) => GIORNI[x - 1]).join(', ') : ''
  const o = [dopo ? `dopo le ${dopo.slice(0, 5)}` : '', prima ? `entro le ${prima.slice(0, 5)}` : ''].filter(Boolean).join(' ')
  return [g, o].filter(Boolean).join(' ')
}
export const GIORNI_BREVI = GIORNI
