// Nomi delle tabelle di questa app. Tutte iniziano con il prefisso "spese_"
// perché il database Supabase è condiviso con le altre app.
export const T = {
  categorie: 'spese_categorie', // enum espandibile: livello 'principale' | 'secondaria'
  movimenti: 'spese_movimenti', // importo < 0 uscita, > 0 entrata
}
