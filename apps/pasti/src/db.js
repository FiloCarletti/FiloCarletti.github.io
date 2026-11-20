// Nomi delle tabelle di questa app. Tutte iniziano con il prefisso "pasti_"
// perché il database Supabase è condiviso con le altre app.
export const T = {
  pasti: 'pasti_pasti', // un pasto per riga, con stime nutrizionali e grammi per gruppo alimentare
  obiettivi: 'pasti_obiettivi', // una riga per spazio: obiettivi giornalieri/settimanali e profilo
  report: 'pasti_report', // analisi periodiche scritte da Claude
}
