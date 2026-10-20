// Conti del segnapunti dal vivo: punti di ogni mano, totali, mancanti all'obiettivo e statistiche.
// Base = burraco puliti e sporchi + chiusura − pozzetto non preso + rettifiche; carte = in tavola − in mano.

export const TEAMS = ['a', 'b']
export const GOAL_PRESETS = [1005, 1505, 2005, 2505, 3005]
export const DEFAULT_VALUES = { punti_pulito: 200, punti_sporco: 100, punti_chiusura: 100, penalita_pozzetto: 100 }

export const emptyRound = () => ({
  chiusura: null,
  puliti_a: 0, sporchi_a: 0, pozzetto_a: true, tavola_a: 0, mano_a: 0, extra_a: 0,
  puliti_b: 0, sporchi_b: 0, pozzetto_b: true, tavola_b: 0, mano_b: 0, extra_b: 0,
  note: '',
})

/** Punti di una mano per le due squadre, con i valori della partita p. */
export function roundPoints(m, p) {
  return TEAMS.map((t) => {
    const puliti = m[`puliti_${t}`] ?? 0
    const sporchi = m[`sporchi_${t}`] ?? 0
    const chiusura = m.chiusura === t
    const pozzetto = m[`pozzetto_${t}`] !== false
    const tavola = m[`tavola_${t}`] ?? 0
    const mano = m[`mano_${t}`] ?? 0
    const extra = m[`extra_${t}`] ?? 0
    const burraco = puliti * p.punti_pulito + sporchi * p.punti_sporco
    const base = burraco + (chiusura ? p.punti_chiusura : 0) - (pozzetto ? 0 : p.penalita_pozzetto) + extra
    const carte = tavola - mano
    return { puliti, sporchi, chiusura, pozzetto, tavola, mano, extra, burraco, base, carte, totale: base + carte }
  })
}

/** Vincitore dopo i totali dati: 0, 1 o null (serve superare l'obiettivo e non essere pari). */
export function winnerOf(tot, goal) {
  if ((tot[0] >= goal || tot[1] >= goal) && tot[0] !== tot[1]) return tot[0] > tot[1] ? 0 : 1
  return null
}

/** Riepilogo completo di una partita dal vivo. */
export function summarize(p, mani) {
  const rounds = [...mani].sort((x, y) => x.numero - y.numero)
  const cum = [0, 0]
  const rows = []
  let winner = null
  let winnerAt = null
  let leader = null
  let leadChanges = 0
  let maxLead = { team: null, value: 0, n: null }
  const team = () => ({ base: 0, carte: 0, totale: 0, puliti: 0, sporchi: 0, chiusure: 0, pozzMancati: 0, tavola: 0, mano: 0, best: null, worst: null, vinte: 0 })
  const st = [team(), team()]
  for (const m of rounds) {
    const pts = roundPoints(m, p)
    pts.forEach((x, i) => {
      cum[i] += x.totale
      const s = st[i]
      s.base += x.base
      s.carte += x.carte
      s.totale += x.totale
      s.puliti += x.puliti
      s.sporchi += x.sporchi
      s.tavola += x.tavola
      s.mano += x.mano
      if (x.chiusura) s.chiusure++
      if (!x.pozzetto) s.pozzMancati++
      if (!s.best || x.totale > s.best.value) s.best = { value: x.totale, n: m.numero }
      if (!s.worst || x.totale < s.worst.value) s.worst = { value: x.totale, n: m.numero }
    })
    if (pts[0].totale !== pts[1].totale) st[pts[0].totale > pts[1].totale ? 0 : 1].vinte++
    const lead = cum[0] === cum[1] ? null : cum[0] > cum[1] ? 0 : 1
    if (lead != null && leader != null && lead !== leader) leadChanges++
    if (lead != null) leader = lead
    const gap = Math.abs(cum[0] - cum[1])
    if (lead != null && gap > maxLead.value) maxLead = { team: lead, value: gap, n: m.numero }
    rows.push({ m, pts, cum: [...cum] })
    if (winner == null) {
      const w = winnerOf(cum, p.obiettivo)
      if (w != null) { winner = w; winnerAt = m.numero }
    }
  }
  const n = rounds.length
  const goal = p.obiettivo
  const teams = st.map((s, i) => {
    const avg = n ? s.totale / n : 0
    const remaining = Math.max(0, goal - cum[i])
    return {
      ...s,
      avg,
      avgBase: n ? s.base / n : 0,
      avgCarte: n ? s.carte / n : 0,
      remaining,
      progress: goal ? Math.max(0, Math.min(1, cum[i] / goal)) : 0,
      // mani che servirebbero ancora con la media attuale
      eta: remaining === 0 ? 0 : avg > 0 ? Math.ceil(remaining / avg) : null,
    }
  })
  return {
    rows,
    n,
    tot: [...cum],
    diff: cum[0] - cum[1],
    leader: cum[0] === cum[1] ? null : cum[0] > cum[1] ? 0 : 1,
    winner,
    winnerAt,
    leadChanges,
    maxLead,
    teams,
  }
}

/** "1 mano", "3 mani" */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export const fmtPts = (v) => (v > 0 ? `+${v}` : String(v))
export const teamName = (p, i) => (i === 0 ? p.nome_a : p.nome_b)
