// Funzioni comuni alle fonti dei voli (usate dalla skill voli-monitor tramite cerca.mjs). Node 20+, nessuna dipendenza.

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const jitter = (min, max) => sleep(min + Math.random() * (max - min))

/** Errore HTTP con lo stato, per distinguere "rotta inesistente" (4xx attesi) dai blocchi. */
export class HttpError extends Error {
  constructor(status, url, body = '') {
    super(`HTTP ${status} ${url.slice(0, 120)}`)
    this.status = status
    this.body = body
  }
}

/**
 * fetch con timeout e 2 nuovi tentativi su errori di rete, 429 e 5xx.
 * as: 'json' | 'text'. Gli altri 4xx non si ritentano (HttpError con il corpo della risposta).
 */
export async function request(url, { as = 'json', method = 'GET', headers = {}, body, timeout = 30000, retries = 2 } = {}) {
  let last
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { 'user-agent': UA, 'accept-language': 'it-IT,it;q=0.9', ...headers },
        signal: AbortSignal.timeout(timeout),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = new HttpError(res.status, url, text.slice(0, 500))
        if (res.status === 429 || res.status >= 500) throw Object.assign(err, { retry: true })
        throw err
      }
      return as === 'json' ? await res.json() : await res.text()
    } catch (e) {
      last = e
      if (e instanceof HttpError && !e.retry) throw e
      if (i < retries) await sleep(1500 * (i + 1))
    }
  }
  throw last
}

/** Argomenti: posizionali e --chiave valore / --flag */
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const k = a.slice(2)
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i]
      else out[k] = true
    } else out._.push(a)
  }
  return out
}

/** Messaggi di avanzamento su stderr (stdout resta per il riepilogo). */
export const log = (...m) => console.error(...m)

/** 'YYYY-MM-01' dei mesi toccati dall'intervallo [da, a]. */
export function mesi(da, a) {
  const out = []
  let [y, m] = da.split('-').map(Number)
  const [y2, m2] = a.split('-').map(Number)
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}
/** Ultimo giorno del mese di 'YYYY-MM-01'. */
export function fineMese(primo) {
  const [y, m] = primo.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
/** 'HH:MM' (o 'HH:MM+1') da un ISO locale 'YYYY-MM-DDTHH:MM:SS' rispetto alla data di partenza. */
export function oraConGiorni(iso, dataPartenza) {
  if (!iso) return null
  const ora = iso.slice(11, 16)
  const gg = Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${dataPartenza}T00:00:00Z`)) / 86400000)
  return gg > 0 ? `${ora}+${gg}` : ora
}
