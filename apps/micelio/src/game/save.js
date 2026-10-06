// Salvataggi in localStorage, cifrati con AES-GCM (Web Crypto).
// In debug (npm run dev, oppure ?debug nell'URL) si salva in chiaro, per leggere e modificare lo stato.
// La chiave sta nel codice (il repo è pubblico): la cifratura scoraggia le modifiche a mano
// e rileva i salvataggi alterati (GCM è autenticato), non protegge segreti.
import { migrate } from './engine.js'

const KEY = 'micelio-save'
const BACKUP = 'micelio-save-backup'
const ENC = 'MIC1.' // + base64(iv[12] + ciphertext)
const TXT = 'MIC1J.' // + JSON in chiaro
const PASSPHRASE = 'micelio · rete del bosco · v1'

export const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).has('debug')
const canEncrypt = () => !!globalThis.crypto?.subtle

let keyPromise
function aesKey() {
  keyPromise ??= crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(PASSPHRASE))
    .then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']))
  return keyPromise
}

const toB64 = (bytes) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/** Stato → stringa (cifrata, o in chiaro in debug / se Web Crypto non c'è, es. http su LAN). */
export async function encode(state, { plain = DEBUG } = {}) {
  const json = JSON.stringify(state)
  if (plain || !canEncrypt()) return TXT + json
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), new TextEncoder().encode(json)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return ENC + toB64(out)
}

/** Stringa → stato. Accetta sempre entrambi i formati; lancia un errore se è illeggibile. */
export async function decode(str) {
  str = String(str ?? '').trim()
  let json
  if (str.startsWith(TXT)) json = str.slice(TXT.length)
  else if (str.startsWith(ENC)) {
    if (!canEncrypt()) throw new Error('Questo browser non può leggere i salvataggi cifrati (serve https).')
    const bytes = fromB64(str.slice(ENC.length))
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, await aesKey(), bytes.subarray(12))
      json = new TextDecoder().decode(pt)
    } catch {
      throw new Error('Salvataggio danneggiato o modificato.')
    }
  } else throw new Error('Non è un salvataggio di Micelio.')
  const raw = JSON.parse(json)
  if (!raw || typeof raw !== 'object' || !raw.res) throw new Error('Salvataggio non valido.')
  return migrate(raw)
}

export async function saveGame(state) {
  const str = await encode(state)
  localStorage.setItem(KEY, str)
  return str
}

/** null se non c'è nessun salvataggio. Se quello principale è rovinato prova il backup. */
export async function loadGame() {
  const str = localStorage.getItem(KEY)
  if (!str) return null
  try {
    return await decode(str)
  } catch (e) {
    const bak = localStorage.getItem(BACKUP)
    if (bak) return decode(bak)
    throw e
  }
}

/** Copia di sicurezza (prima di sporulare, importare o ricominciare). */
export function backupGame() {
  const str = localStorage.getItem(KEY)
  if (str) localStorage.setItem(BACKUP, str)
}

export function wipeGame() {
  backupGame()
  localStorage.removeItem(KEY)
}
