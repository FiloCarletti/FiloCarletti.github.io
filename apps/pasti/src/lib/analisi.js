// Analisi dei pasti registrati: "giornata tipo", frequenze settimanali e semaforo di carenze/eccessi.
// Logica pura (niente Vue né Supabase), così è facile da verificare.
//
// I dati sono quasi sempre incompleti (es. solo i pranzi in mensa). Per non confondere "non registrato"
// con "non mangiato" l'analisi segue l'ipotesi "se gli altri pasti fossero simili":
//  - giornata tipo = media delle colazioni + media dei pranzi + media delle cene (+ spuntini medi al giorno);
//    un tipo di pasto senza dati è segnalato come mancante e non conta;
//  - frequenze settimanali (legumi, pesce, carni, fritti) = porzioni per pasto principale × 14
//    (pranzi e cene della settimana).

export const TIPI = [
  { key: 'colazione', label: 'Colazione', icon: '☕' },
  { key: 'pranzo', label: 'Pranzo', icon: '🍝' },
  { key: 'cena', label: 'Cena', icon: '🍽️' },
  { key: 'spuntino', label: 'Spuntino', icon: '🍎' },
]
export const TIPO = Object.fromEntries(TIPI.map((t) => [t.key, t]))
const PRINCIPALI = ['colazione', 'pranzo', 'cena']
// Quota indicativa della giornata per tipo di pasto: con pasti mancanti gli obiettivi giornalieri si
// riducono alla quota dei pasti registrati (es. solo pranzi → 40% degli obiettivi).
export const QUOTE = { colazione: 0.2, pranzo: 0.4, cena: 0.35, spuntino: 0.05 }

// Grammi "nel piatto" (cotti) di una porzione standard, da linee guida CREA/LARN.
export const GRUPPI = {
  verdura: { label: 'Verdura', porzione: 200 },
  frutta: { label: 'Frutta', porzione: 150 },
  legumi: { label: 'Legumi', porzione: 150 },
  cereali_integrali: { label: 'Cereali integrali', porzione: 200 },
  cereali_raffinati: { label: 'Cereali raffinati', porzione: 200 },
  patate: { label: 'Patate', porzione: 200 },
  carne_bianca: { label: 'Carne bianca', porzione: 100 },
  carne_rossa: { label: 'Carne rossa', porzione: 100 },
  carne_processata: { label: 'Salumi e carni lavorate', porzione: 50 },
  pesce: { label: 'Pesce', porzione: 150 },
  uova: { label: 'Uova', porzione: 60 },
  latticini: { label: 'Latte e yogurt', porzione: 125 },
  formaggi: { label: 'Formaggi', porzione: 50 },
  frutta_secca: { label: 'Frutta secca', porzione: 30 },
  dolci: { label: 'Dolci e biscotti', porzione: 50 },
}

export const NUTRIENTI = [
  { key: 'kcal', label: 'Energia', unit: 'kcal', dec: 0 },
  { key: 'proteine_g', label: 'Proteine', unit: 'g', dec: 0 },
  { key: 'carboidrati_g', label: 'Carboidrati', unit: 'g', dec: 0 },
  { key: 'zuccheri_g', label: 'Zuccheri liberi', unit: 'g', dec: 0 },
  { key: 'grassi_g', label: 'Grassi', unit: 'g', dec: 0 },
  { key: 'grassi_saturi_g', label: 'Grassi saturi', unit: 'g', dec: 0 },
  { key: 'fibre_g', label: 'Fibre', unit: 'g', dec: 0 },
  { key: 'sodio_mg', label: 'Sodio', unit: 'mg', dec: 0 },
]

export const DEFAULT_OBIETTIVI = {
  kcal: 2300, proteine_g: 90, fibre_min_g: 30, zuccheri_max_g: 50, saturi_max_g: 25, sodio_max_mg: 2000,
  verdura_min_g: 400, frutta_min_g: 300,
  legumi_min_sett: 3, pesce_min_sett: 2, carne_rossa_max_sett: 2, processata_max_sett: 1, fritti_max_sett: 2,
  profilo: {}, note: '',
}

const num = (v) => (v == null || v === '' ? null : Number(v))
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
const g = (p, k) => Number(p.gruppi?.[k] ?? 0) || 0

/** Media dei nutrienti e dei gruppi su un insieme di pasti (ignora i valori mancanti). */
function media(rows) {
  const out = { nutrienti: {}, gruppi: {} }
  for (const n of NUTRIENTI) out.nutrienti[n.key] = avg(rows.map((r) => num(r[n.key])).filter((v) => v != null))
  for (const k of Object.keys(GRUPPI)) out.gruppi[k] = avg(rows.map((r) => g(r, k)))
  return out
}

/**
 * Valutazione rispetto a un obiettivo.
 * tipo 'min' (almeno), 'max' (al massimo), 'range' (intorno a). Livello: ok | warn | bad.
 */
export function livello(valore, obiettivo, tipo) {
  if (valore == null || !obiettivo) return null
  const r = valore / obiettivo
  if (tipo === 'min') return r >= 1 ? 'ok' : r >= 0.7 ? 'warn' : 'bad'
  if (tipo === 'max') return r <= 1 ? 'ok' : r <= 1.3 ? 'warn' : 'bad'
  return r >= 0.9 && r <= 1.1 ? 'ok' : r >= 0.8 && r <= 1.2 ? 'warn' : 'bad'
}

const CONSIGLI = {
  kcal: { basso: 'Pasti più completi o uno spuntino (yogurt, frutta secca).', alto: 'Riduci le porzioni di pasta e patate, che sono la parte più calorica del vassoio.' },
  proteine: { basso: 'Aggiungi legumi, uova, yogurt greco o pesce.' },
  fibre: { basso: 'Più verdura, legumi e cereali integrali al posto di quelli raffinati.' },
  zuccheri: { alto: 'Meno dolci, biscotti, cereali zuccherati, bibite e succhi (anche fatti in casa).' },
  saturi: { alto: 'Meno fritti, salumi, formaggi e carni grasse; olio d\'oliva a crudo al loro posto.' },
  sodio: { alto: 'Meno salumi, formaggi stagionati, grissini e piatti pronti.' },
  verdura: { basso: 'Contorno di verdura cotta a ogni pasto principale e più insalata.' },
  frutta: { basso: 'Un frutto a colazione o come spuntino.' },
  legumi: { basso: 'Legumi a cena 2–3 volte a settimana (anche come primo: pasta e ceci, zuppe).' },
  pesce: { basso: 'Scegli il pesce in mensa quando c\'è, oppure a cena.' },
  carne_rossa: { alto: 'Alterna con carne bianca, pesce e legumi.' },
  processata: { alto: 'Limita salumi, pancetta e würstel: meglio occasionali.' },
  fritti: { alto: 'Preferisci grigliato, al forno o al vapore.' },
  amidi: { alto: 'Pasta e patate nello stesso pasto: tieni uno dei due e metti verdura al posto dell\'altro.' },
  integrali: { basso: 'Pane, pasta o avena integrali almeno in metà dei pasti.' },
}

/**
 * Analizza i pasti del periodo [dal, al] rispetto agli obiettivi.
 * Restituisce copertura, medie per tipo, giornata tipo, frequenze settimanali, ripartizione macro e controlli.
 */
export function analizza(pasti, ob = DEFAULT_OBIETTIVI, dal = null, al = null) {
  const rows = pasti.filter((p) => (!dal || p.data >= dal) && (!al || p.data <= al))
  const giorni = [...new Set(rows.map((p) => p.data))].sort()
  const perTipo = {}
  for (const t of TIPI) {
    const r = rows.filter((p) => p.tipo === t.key)
    perTipo[t.key] = { n: r.length, ...media(r), punteggio: avg(r.map((p) => p.punteggio).filter((v) => v != null)) }
  }
  const mancanti = PRINCIPALI.filter((k) => !perTipo[k].n)
  const complete = giorni.filter((d) => PRINCIPALI.every((k) => rows.some((p) => p.data === d && p.tipo === k))).length

  // Giornata tipo: somma delle medie dei pasti principali con dati + spuntini medi al giorno.
  const spuntini = rows.filter((p) => p.tipo === 'spuntino')
  const giornata = { nutrienti: {}, gruppi: {} }
  for (const n of NUTRIENTI) {
    let s = null
    for (const k of PRINCIPALI) if (perTipo[k].nutrienti[n.key] != null) s = (s ?? 0) + perTipo[k].nutrienti[n.key]
    if (s != null && giorni.length) s += spuntini.reduce((a, p) => a + (num(p[n.key]) ?? 0), 0) / giorni.length
    giornata.nutrienti[n.key] = s
  }
  for (const k of Object.keys(GRUPPI)) {
    let s = 0
    for (const t of PRINCIPALI) if (perTipo[t].n) s += perTipo[t].gruppi[k]
    if (giorni.length) s += spuntini.reduce((a, p) => a + g(p, k), 0) / giorni.length
    giornata.gruppi[k] = s
  }

  // Frequenze settimanali stimate dai pasti principali (pranzi e cene): porzioni per pasto × 14.
  const pc = rows.filter((p) => p.tipo === 'pranzo' || p.tipo === 'cena')
  const perPasto = (fn) => (pc.length ? pc.reduce((a, p) => a + fn(p), 0) / pc.length : null)
  const porz = (k) => (p) => g(p, k) / GRUPPI[k].porzione
  const settimana = {
    legumi: perPasto(porz('legumi')),
    pesce: perPasto(porz('pesce')),
    carne_rossa: perPasto(porz('carne_rossa')),
    processata: perPasto(porz('carne_processata')),
    fritti: perPasto((p) => (p.fritto ? 1 : 0)),
  }
  for (const k in settimana) if (settimana[k] != null) settimana[k] *= 14

  const amidiDoppi = perPasto((p) => (g(p, 'patate') > 0 && g(p, 'cereali_raffinati') + g(p, 'cereali_integrali') > 0 ? 1 : 0))
  const cer = rows.reduce((a, p) => a + g(p, 'cereali_integrali') + g(p, 'cereali_raffinati'), 0)
  const quotaIntegrali = cer ? rows.reduce((a, p) => a + g(p, 'cereali_integrali'), 0) / cer : null

  // Ripartizione dell'energia tra i macronutrienti (giornata tipo).
  const n = giornata.nutrienti
  const kMacro = (n.proteine_g ?? 0) * 4 + (n.carboidrati_g ?? 0) * 4 + (n.grassi_g ?? 0) * 9
  const macro = kMacro
    ? { proteine: (n.proteine_g * 4) / kMacro, carboidrati: (n.carboidrati_g * 4) / kMacro, grassi: (n.grassi_g * 9) / kMacro }
    : null

  // Controlli: un elemento per voce, con livello, valore, obiettivo e consiglio.
  const quota = Math.min(1, PRINCIPALI.reduce((a, k) => a + (perTipo[k].n ? QUOTE[k] : 0), 0) + (spuntini.length ? QUOTE.spuntino : 0))
  const scala = mancanti.length ? quota : 1
  const controlli = []
  const add = (key, area, label, valore, obiettivoPieno, tipo, unit, consiglio) => {
    const obiettivo = area === 'giorno' ? obiettivoPieno * scala : obiettivoPieno
    const lv = livello(valore, obiettivo, tipo)
    if (!lv) return
    const basso = tipo === 'min' || (tipo === 'range' && valore < obiettivo)
    const tip = lv === 'ok' ? '' : (basso ? CONSIGLI[consiglio]?.basso : CONSIGLI[consiglio]?.alto) ?? ''
    controlli.push({ key, area, label, valore, obiettivo, tipo, unit, livello: lv, direzione: basso ? 'poco' : 'troppo', consiglio: tip })
  }
  if (mancanti.length < 3) {
    add('kcal', 'giorno', 'Energia', n.kcal, ob.kcal, 'range', 'kcal', 'kcal')
    add('proteine', 'giorno', 'Proteine', n.proteine_g, ob.proteine_g, 'min', 'g', 'proteine')
    add('fibre', 'giorno', 'Fibre', n.fibre_g, ob.fibre_min_g, 'min', 'g', 'fibre')
    add('zuccheri', 'giorno', 'Zuccheri liberi', n.zuccheri_g, ob.zuccheri_max_g, 'max', 'g', 'zuccheri')
    add('saturi', 'giorno', 'Grassi saturi', n.grassi_saturi_g, ob.saturi_max_g, 'max', 'g', 'saturi')
    add('sodio', 'giorno', 'Sodio', n.sodio_mg, ob.sodio_max_mg, 'max', 'mg', 'sodio')
    add('verdura', 'giorno', 'Verdura', giornata.gruppi.verdura, ob.verdura_min_g, 'min', 'g', 'verdura')
    add('frutta', 'giorno', 'Frutta', giornata.gruppi.frutta, ob.frutta_min_g, 'min', 'g', 'frutta')
  }
  if (pc.length) {
    add('legumi', 'settimana', 'Legumi', settimana.legumi, ob.legumi_min_sett, 'min', 'porz.', 'legumi')
    add('pesce', 'settimana', 'Pesce', settimana.pesce, ob.pesce_min_sett, 'min', 'porz.', 'pesce')
    add('carne_rossa', 'settimana', 'Carne rossa', settimana.carne_rossa, ob.carne_rossa_max_sett, 'max', 'porz.', 'carne_rossa')
    add('processata', 'settimana', 'Salumi e carni lavorate', settimana.processata, ob.processata_max_sett, 'max', 'porz.', 'processata')
    add('fritti', 'settimana', 'Fritti e impanati', settimana.fritti, ob.fritti_max_sett, 'max', 'volte', 'fritti')
    // Legumi o pesce a zero: livello() con valore 0 dà 'bad', va bene così.
    if (amidiDoppi != null) add('amidi', 'abitudini', 'Pasta + patate nello stesso pasto', amidiDoppi * 100, 30, 'max', '% pasti', 'amidi')
  }
  if (quotaIntegrali != null) add('integrali', 'abitudini', 'Cereali integrali', quotaIntegrali * 100, 50, 'min', '% cereali', 'integrali')

  const ordine = { bad: 0, warn: 1, ok: 2 }
  controlli.sort((a, b) => ordine[a.livello] - ordine[b.livello])

  return {
    rows, giorni, complete, perTipo, mancanti, scala, giornata, settimana, macro, controlli,
    amidiDoppi, quotaIntegrali,
    punteggio: avg(rows.map((p) => p.punteggio).filter((v) => v != null)),
  }
}

/** Formatta un numero all'italiana con `dec` decimali (— se manca). */
const fmts = {}
export function fmt(v, dec = 0) {
  if (v == null || Number.isNaN(v)) return '—'
  fmts[dec] ??= new Intl.NumberFormat('it-IT', { maximumFractionDigits: dec, minimumFractionDigits: 0 })
  return fmts[dec].format(v)
}
