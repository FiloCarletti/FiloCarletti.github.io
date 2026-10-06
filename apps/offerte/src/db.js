// Nomi delle tabelle di questa app. Tutte iniziano con il prefisso "offerte_"
// perché il database Supabase è condiviso con le altre app.
export const T = {
  supermercati: 'offerte_supermercati', // supermercati seguiti (la routine cerca solo quelli attivi)
  prodotti: 'offerte_prodotti', // prodotti di interesse, riconosciuti nelle offerte per parole
  offerte: 'offerte_offerte', // una riga per offerta: supermercato + nome/marca/formato + inizio validità
  storico: 'offerte_storico', // prezzi passati, scritti da un trigger; ripulibile
  ricerche: 'offerte_ricerche', // registro delle ricerche; ripulibile
}
