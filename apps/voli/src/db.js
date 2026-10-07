// Nomi delle tabelle di questa app. Tutte iniziano con il prefisso "voli_"
// perché il database Supabase è condiviso con le altre app.
export const T = {
  ricerche: 'voli_ricerche', // monitoraggi (criteri, soglie) + miglior prezzo e minimo storico scritti dalla routine
  fonti: 'voli_fonti', // siti attivi o no per lo spazio (catalogo in lib/fonti.js)
  voli: 'voli_voli', // prezzi attuali: tratte di sola andata e soluzioni andata e ritorno; ripulibile
  prezzi: 'voli_prezzi', // storico prezzi di ogni volo; ripulibile (con i voli)
  andamento: 'voli_andamento', // miglior prezzo di ogni monitoraggio a ogni ricerca
  avvisi: 'voli_avvisi', // obiettivo raggiunto, nuovo minimo storico, calo forte
  esecuzioni: 'voli_esecuzioni', // registro delle ricerche; ripulibile
}
