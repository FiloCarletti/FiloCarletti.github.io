// Dai voli salvati alle soluzioni di un monitoraggio: filtra le tratte di andata (aeroporti, periodo, giorni, orari,
// scali, compagnie, fonti), per ognuna cerca i ritorni compatibili con la durata e somma i prezzi; aggiunge le
// soluzioni andata e ritorno già complete (Google Flights).
// Modulo puro (niente Vue né browser): lo usano l'app e lo script della routine (scripts/voli/cerca.mjs), così le
// due parti trovano le stesse soluzioni e lo stesso miglior prezzo.
// Un volo ha la forma di una riga di voli_voli (tipo 'tratta' | 'ar', origine, destinazione, data, partenza, …, prezzo).

export const hhmm = (t) => (t ? String(t).slice(0, 5) : '')
export function minuti(t) {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : null
}
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const diffDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
/** 1 = lunedì … 7 = domenica */
export function isoDow(iso) {
  const g = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return g === 0 ? 7 : g
}
export const romeToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())

/** Orario nella fascia [dopo, prima] (anche a cavallo della mezzanotte). Orario sconosciuto = da verificare (passa). */
export function orarioOk(t, dopo, prima) {
  if (!dopo && !prima) return true
  const m = minuti(t)
  if (m == null) return true
  const a = minuti(dopo)
  const b = minuti(prima)
  if (a != null && b != null && a > b) return m >= a || m <= b
  return (a == null || m >= a) && (b == null || m <= b)
}

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
/** "Air Dolomiti, Lufthansa" → ['Air Dolomiti', 'Lufthansa'] */
export const compagnieDi = (s) => String(s ?? '').split(/,|\+|\/| e /).map((x) => x.trim()).filter(Boolean)
export function stessaCompagnia(a, b) {
  const x = norm(a)
  const y = norm(b)
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}
const qualcuna = (nomi, lista) => compagnieDi(nomi).some((n) => lista.some((p) => stessaCompagnia(n, p)))

/** Criteri normalizzati di un monitoraggio; `override` sostituisce alcune opzioni (filtri dell'app). */
export function criteri(r, override = {}) {
  const c = {
    origini: r.origini ?? [],
    destinazioni: r.destinazioni ?? [],
    da: r.partenza_da,
    a: r.partenza_a,
    soloAndata: !!r.solo_andata,
    durMin: r.durata_min ?? 0,
    durMax: Math.max(r.durata_max ?? 0, r.durata_min ?? 0),
    maxScali: r.max_scali ?? null,
    compagnie: r.compagnie ?? [],
    soloCompagnie: !!r.solo_compagnie && (r.compagnie ?? []).length > 0,
    escluse: r.compagnie_escluse ?? [],
    fonti: r.fonti ?? [],
    andata: { giorni: r.giorni_andata ?? [], dopo: r.andata_dopo, prima: r.andata_prima },
    ritorno: { giorni: r.giorni_ritorno ?? [], dopo: r.ritorno_dopo, prima: r.ritorno_prima },
    rientroAltro: !!r.rientro_altro,
    miste: !!r.compagnie_miste,
  }
  return { ...c, ...override }
}

export function compagniaOk(nomi, c) {
  if (!nomi) return !c.soloCompagnie
  if (c.escluse.length && qualcuna(nomi, c.escluse)) return false
  if (c.soloCompagnie && !qualcuna(nomi, c.compagnie)) return false
  return true
}
export const preferita = (nomi, c) => c.compagnie.length > 0 && qualcuna(nomi, c.compagnie)

function fonteOk(fonte, c, attive) {
  if (c.fonti.length && !c.fonti.includes(fonte)) return false
  if (attive && attive[fonte] === false) return false
  return true
}
const giornoOk = (data, giorni) => !giorni?.length || giorni.includes(isoDow(data))
const scaliOk = (n, c) => c.maxScali == null || (n ?? 0) <= c.maxScali

/** Tratta utilizzabile come andata del monitoraggio. */
export function andataOk(v, c, { oggi = romeToday(), attive } = {}) {
  return c.origini.includes(v.origine) && c.destinazioni.includes(v.destinazione)
    && v.data >= c.da && v.data <= c.a && v.data >= oggi
    && giornoOk(v.data, c.andata.giorni) && orarioOk(v.partenza, c.andata.dopo, c.andata.prima)
    && scaliOk(v.scali, c) && compagniaOk(v.compagnia, c) && fonteOk(v.fonte, c, attive)
}
/** Tratta utilizzabile come ritorno (aeroporti e durata li controlla `combina`). */
export function ritornoOk(v, c, { attive } = {}) {
  return c.destinazioni.includes(v.origine) && c.origini.includes(v.destinazione)
    && giornoOk(v.data, c.ritorno.giorni) && orarioOk(v.partenza, c.ritorno.dopo, c.ritorno.prima)
    && scaliOk(v.scali, c) && compagniaOk(v.compagnia, c) && fonteOk(v.fonte, c, attive)
}

const leg = (v) => ({
  id: v.id ?? null, fonte: v.fonte, data: v.data, origine: v.origine, destinazione: v.destinazione,
  partenza: hhmm(v.partenza), arrivo: hhmm(v.arrivo), arrivo_giorni: v.arrivo_giorni ?? 0, volo: v.volo ?? '',
  compagnia: v.compagnia ?? '', scali: v.scali ?? 0, durata_min: v.durata_min ?? null, prezzo: Number(v.prezzo),
})
const round2 = (n) => Math.round(n * 100) / 100

/**
 * Soluzioni del monitoraggio `r` con i voli `voli`, dalla più economica.
 * opts: { oggi, attive: {fonte: bool}, override: {rientroAltro, miste, …}, soloAttivi = true }
 * Soluzione: { key, tipo ('combinata'|'sola'|'ar'), fonte, origine, destinazione, ritorno_a, data, data_ritorno, durata,
 *              andata, ritorno (o null), prezzo, compagnie, preferita, verificare, voli: [id…], url }
 */
export function combina(r, voli, opts = {}) {
  const { oggi = romeToday(), attive, override = {}, soloAttivi = true } = opts
  const c = criteri(r, override)
  const usabili = soloAttivi ? voli.filter((v) => v.attivo !== false) : voli
  const tratte = usabili.filter((v) => v.tipo === 'tratta')
  const out = []

  const andate = tratte.filter((v) => andataOk(v, c, { oggi, attive }))
  if (c.soloAndata) {
    for (const v of andate) {
      const a = leg(v)
      out.push({
        key: `s|${v.id ?? v.chiave ?? `${v.fonte}${v.origine}${v.destinazione}${v.data}${a.partenza}`}`, tipo: 'sola', fonte: v.fonte,
        origine: v.origine, destinazione: v.destinazione, ritorno_a: null, data: v.data, data_ritorno: null, durata: null,
        andata: a, ritorno: null, prezzo: a.prezzo, compagnie: a.compagnia, preferita: preferita(a.compagnia, c),
        verificare: false, voli: [v.id].filter(Boolean), url: v.url || '',
      })
    }
  } else {
    const ritorni = new Map()
    for (const v of tratte) {
      if (!ritornoOk(v, c, { attive })) continue
      const k = `${v.origine}|${v.destinazione}|${v.data}`
      if (!ritorni.has(k)) ritorni.set(k, [])
      ritorni.get(k).push(v)
    }
    for (const va of andate) {
      const a = leg(va)
      const rientri = c.rientroAltro ? c.origini : [va.origine]
      for (let dur = c.durMin; dur <= c.durMax; dur++) {
        const dr = addDays(va.data, dur)
        for (const dest of rientri) {
          for (const vb of ritorni.get(`${va.destinazione}|${dest}|${dr}`) ?? []) {
            if (!c.miste && !stessaCompagnia(va.compagnia, vb.compagnia)) continue
            const b = leg(vb)
            const comp = stessaCompagnia(a.compagnia, b.compagnia) ? a.compagnia : `${a.compagnia} / ${b.compagnia}`
            out.push({
              key: `c|${va.id ?? a.data + a.partenza + va.fonte}|${vb.id ?? b.data + b.partenza + vb.fonte}`, tipo: 'combinata',
              fonte: va.fonte === vb.fonte ? va.fonte : `${va.fonte}+${vb.fonte}`,
              origine: va.origine, destinazione: va.destinazione, ritorno_a: dest, data: va.data, data_ritorno: dr, durata: dur,
              andata: a, ritorno: b, prezzo: round2(a.prezzo + b.prezzo), compagnie: comp,
              preferita: preferita(a.compagnia, c) || preferita(b.compagnia, c), verificare: false,
              voli: [va.id, vb.id].filter(Boolean), url: '',
            })
          }
        }
      }
    }
  }

  // Soluzioni andata e ritorno già complete (Google Flights): il ritorno spesso è senza orario.
  if (!c.soloAndata) {
    for (const v of usabili) {
      if (v.tipo !== 'ar' || !andataOk(v, c, { oggi, attive })) continue
      const dur = diffDays(v.data, v.data_ritorno)
      if (dur < c.durMin || dur > c.durMax) continue
      if (!(c.rientroAltro ? c.origini.includes(v.ritorno_a) : v.ritorno_a === v.origine)) continue
      if (!giornoOk(v.data_ritorno, c.ritorno.giorni)) continue
      if (!orarioOk(v.rit_partenza, c.ritorno.dopo, c.ritorno.prima)) continue
      if (v.rit_compagnia && !compagniaOk(v.rit_compagnia, c)) continue
      if (!c.miste && v.rit_compagnia && !stessaCompagnia(v.compagnia, v.rit_compagnia)) continue
      if (v.rit_scali != null && !scaliOk(v.rit_scali, c)) continue
      const a = leg(v)
      const b = {
        id: null, fonte: v.fonte, data: v.data_ritorno, origine: v.destinazione, destinazione: v.ritorno_a,
        partenza: hhmm(v.rit_partenza), arrivo: hhmm(v.rit_arrivo), arrivo_giorni: 0, volo: '',
        compagnia: v.rit_compagnia ?? '', scali: v.rit_scali ?? null, durata_min: null, prezzo: null,
      }
      const conOrari = c.ritorno.dopo || c.ritorno.prima
      out.push({
        key: `a|${v.id ?? v.chiave}`, tipo: 'ar', fonte: v.fonte,
        origine: v.origine, destinazione: v.destinazione, ritorno_a: v.ritorno_a, data: v.data, data_ritorno: v.data_ritorno,
        durata: dur, andata: a, ritorno: b, prezzo: Number(v.prezzo), compagnie: v.compagnia,
        preferita: preferita(v.compagnia, c), verificare: !!conOrari && !v.rit_partenza,
        voli: [v.id].filter(Boolean), url: v.url || '',
      })
    }
  }

  out.sort((x, y) => x.prezzo - y.prezzo || x.data.localeCompare(y.data) || (x.data_ritorno ?? '').localeCompare(y.data_ritorno ?? ''))
  return out
}

/** Riassunto compatto di una soluzione, per voli_andamento e voli_avvisi (campo `soluzione`). */
export function riassunto(s) {
  if (!s) return {}
  return {
    origine: s.origine, destinazione: s.destinazione, ritorno_a: s.ritorno_a, data: s.data, data_ritorno: s.data_ritorno,
    partenza: s.andata?.partenza || null, rit_partenza: s.ritorno?.partenza || null,
    compagnie: s.compagnie, fonte: s.fonte, prezzo: s.prezzo, url: s.url || undefined,
  }
}

/** Miglior soluzione per data di andata e durata (per la griglia). Chiave `${data}|${durata}`. */
export function perCella(soluzioni) {
  const m = new Map()
  for (const s of soluzioni) {
    const k = `${s.data}|${s.durata ?? 0}`
    if (!m.has(k) || s.prezzo < m.get(k).prezzo) m.set(k, s)
  }
  return m
}
