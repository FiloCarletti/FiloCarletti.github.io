// Catalogo dei siti su cui la routine di Claude può cercare (verificati il 2026-10-07).
// Modulo puro: lo usano l'app (pagina Fonti, modulo del monitoraggio) e lo script scripts/voli/cerca.mjs.
// In voli_fonti si salva solo se una fonte supportata è attiva o no per lo spazio (default: `predefinita`).

export const FONTI = [
  {
    codice: 'ryanair',
    nome: 'Ryanair',
    tipo: 'Compagnia',
    supportata: true,
    predefinita: true,
    affidabilita: 'alta',
    metodo: 'API delle tariffe del sito (JSON)',
    copre: 'Solo voli Ryanair',
    note: 'Prezzo più basso di ogni giorno per tratta, senza bagagli. Se il volo più economico non rispetta gli orari impostati, cerca il migliore tra quelli che li rispettano.',
  },
  {
    codice: 'wizz',
    nome: 'Wizz Air',
    tipo: 'Compagnia',
    supportata: true,
    predefinita: true,
    affidabilita: 'alta',
    metodo: 'API degli orari del sito (JSON)',
    copre: 'Solo voli Wizz Air',
    note: 'Prezzo più basso del giorno e orario di partenza (non quello di arrivo). Se in un giorno ci sono più voli e solo alcuni rispettano gli orari, quel giorno viene saltato.',
  },
  {
    codice: 'google',
    nome: 'Google Flights',
    tipo: 'Aggregatore',
    supportata: true,
    predefinita: true,
    affidabilita: 'media',
    metodo: 'Pagina dei risultati (HTML)',
    copre: 'Tutte le compagnie (ITA, Vueling, easyJet, Lufthansa…), anche con scalo',
    note: 'Prezzo totale andata e ritorno; l’orario del ritorno si sceglie sul sito. Interrogato solo sulle date più promettenti (al massimo 30 richieste per ricerca). Formato non ufficiale: può smettere di funzionare.',
  },
  {
    codice: 'kayak',
    nome: 'Kayak',
    tipo: 'Aggregatore',
    supportata: false,
    affidabilita: 'media',
    copre: 'Tutte le compagnie',
    note: 'Funziona solo con un browser vero: la routine in cloud non lo usa. Propone anche scali su biglietti separati.',
  },
  {
    codice: 'kiwi',
    nome: 'Kiwi.com',
    tipo: 'Aggregatore',
    supportata: false,
    affidabilita: 'bassa',
    copre: 'Tutte le compagnie, combinazioni “virtuali”',
    note: 'Prezzi più alti delle altre fonti nella prova (commissioni) e caricamento lento.',
  },
  {
    codice: 'edreams',
    nome: 'eDreams',
    tipo: 'Agenzia',
    supportata: false,
    affidabilita: 'bassa',
    copre: 'Tutte le compagnie',
    note: 'Risultati non caricati in tempi utili nella prova.',
  },
  {
    codice: 'skyscanner',
    nome: 'Skyscanner',
    tipo: 'Aggregatore',
    supportata: false,
    affidabilita: 'bloccata',
    copre: 'Tutte le compagnie',
    note: 'Blocca gli accessi automatici con un captcha.',
  },
  {
    codice: 'easyjet',
    nome: 'easyJet',
    tipo: 'Compagnia',
    supportata: false,
    affidabilita: 'bloccata',
    copre: 'Solo voli easyJet',
    note: 'Accesso negato (protezione Akamai) anche da browser: i voli easyJet arrivano da Google Flights.',
  },
]

export const FONTI_SUPPORTATE = FONTI.filter((f) => f.supportata)
export const fonteNome = (codice) => FONTI.find((f) => f.codice === codice)?.nome ?? codice

/** La fonte è attiva per lo spazio? `attive`: { codice: boolean } da voli_fonti (assente = predefinita). */
export function fonteAttiva(codice, attive = {}) {
  const f = FONTI.find((x) => x.codice === codice)
  if (!f?.supportata) return false
  return attive[codice] ?? f.predefinita
}

/** Fonti da usare per un monitoraggio: quelle scelte (o tutte) tra le attive. */
export function fontiRicerca(r, attive = {}) {
  const scelte = r.fonti?.length ? r.fonti : FONTI_SUPPORTATE.map((f) => f.codice)
  return scelte.filter((c) => fonteAttiva(c, attive))
}
