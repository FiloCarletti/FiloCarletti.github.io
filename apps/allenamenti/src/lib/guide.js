// Supporto alla vista guidata dell'allenamento: progressi salvati nel browser, recupero consigliato,
// avvisi (suono + vibrazione) e schermo sempre acceso. I timer si basano sugli orari (Date.now()),
// quindi restano giusti anche se il telefono va in standby o la pagina si ricarica.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const key = (id) => `allenamenti-guida-${id}`
export function loadProgress(id) {
  try { return JSON.parse(localStorage.getItem(key(id)) ?? 'null') } catch { return null }
}
export function saveProgress(id, p) {
  try { localStorage.setItem(key(id), JSON.stringify(p)) } catch { /* storage non disponibile */ }
}
export function clearProgress(id) {
  try { localStorage.removeItem(key(id)) } catch { /* storage non disponibile */ }
}

// Recupero tra le serie se né il piano né l'esercizio lo indicano (secondi).
const REST = { 'Forza gambe': 120, 'Parte superiore': 90, Pliometria: 90, Core: 45, Mobilità: 30, Cardio: 60 }
export function restFor(voce) {
  return Number(voce.piano?.recupero_sec ?? voce.esercizio.recupero_sec) || REST[voce.esercizio.categoria] || 60
}

/** L'esercizio (o la descrizione di un piano) ha una scheda da mostrare? */
export const hasInfo = (e) => !!(e && (e.esecuzione || e.attenzione || e.scopo || e.muscoli?.length))

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`
}

// Il browser suona solo dopo un tocco dell'utente: ogni pulsante della vista chiama unlockAudio().
let audio = null
export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)()
    if (audio.state === 'suspended') audio.resume()
  } catch { /* audio non disponibile */ }
}
export function beep(times = 2) {
  try { navigator.vibrate?.(Array.from({ length: times * 2 - 1 }, (_, i) => (i % 2 ? 100 : 200))) } catch { /* niente vibrazione */ }
  if (!audio) return
  for (let i = 0; i < times; i++) {
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.frequency.value = i === times - 1 ? 1175 : 880
    o.connect(g)
    g.connect(audio.destination)
    const t = audio.currentTime + i * 0.28
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    o.start(t)
    o.stop(t + 0.22)
  }
}

/** Orologio reattivo per i timer. */
export function useNow(ms = 250) {
  const now = ref(Date.now())
  let t
  onMounted(() => { t = setInterval(() => { now.value = Date.now() }, ms) })
  onBeforeUnmount(() => clearInterval(t))
  return now
}

/** Tiene lo schermo acceso finché la vista è aperta (dove il browser lo permette). */
export function useWakeLock() {
  let lock = null
  const request = async () => {
    try {
      if (document.visibilityState === 'visible' && navigator.wakeLock) lock = await navigator.wakeLock.request('screen')
    } catch { /* non supportato o negato */ }
  }
  onMounted(() => {
    request()
    document.addEventListener('visibilitychange', request)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', request)
    lock?.release?.().catch(() => {})
  })
}
