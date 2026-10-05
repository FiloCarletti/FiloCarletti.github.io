import { computed, readonly, ref } from 'vue'
import { supabase } from './supabase.js'

/**
 * Spazi di dati dell'app corrente (vedi CONVENTIONS.md, "Permessi e spazi").
 *  - personale: uno per utente, creato al primo accesso
 *  - condiviso: creato dall'admin, con membri in lettura (viewer) o scrittura (editor)
 * Ogni riga delle tabelle dell'app ha `space_id`: si legge e si scrive sempre
 * nello spazio corrente (`spaceId`).
 */
const spaces = ref([])
const currentId = ref(null)
const status = ref('idle') // idle | loading | ok | denied | empty | error
const error = ref(null)
let pending = null

const storageKey = () => `filo-space:${__APP_SLUG__}`
function remembered() {
  try { return localStorage.getItem(storageKey()) } catch { return null }
}

/** Chiamata da AuthGate dopo il login. `mode`: 'personal' | 'shared' | 'mixed' (da app.json → dataMode). */
export function initSpaces(slug = __APP_SLUG__, mode = __APP_DATA_MODE__) {
  if (pending) return pending
  status.value = 'loading'
  pending = (async () => {
    const { data, error: err } = await supabase.rpc('my_spaces', { p_app: slug, p_personal: mode !== 'shared' })
    if (err) {
      error.value = err.message
      status.value = err.code === '42501' ? 'denied' : 'error'
      pending = null
      return
    }
    spaces.value = (data ?? []).map((s) => ({
      id: s.space_id, name: s.space_name, kind: s.space_kind, role: s.my_role, ownerName: s.owner_name,
    }))
    const saved = remembered()
    currentId.value = spaces.value.find((s) => s.id === saved)?.id ?? spaces.value[0]?.id ?? null
    status.value = currentId.value ? 'ok' : 'empty'
  })()
  return pending
}

/** Etichetta leggibile: "Personale", "Dati di Marco", "Casa". */
export function spaceLabel(s) {
  if (!s) return ''
  if (s.kind === 'personal') return s.role === 'owner' ? 'Personale' : `Dati di ${s.ownerName}`
  return s.name
}

export function setSpace(id) {
  if (id === currentId.value) return
  try { localStorage.setItem(storageKey(), id) } catch { /* storage non disponibile */ }
  // Ricarica: ogni vista rilegge i dati del nuovo spazio senza logica dedicata.
  window.location.reload()
}

export function useSpace() {
  const current = computed(() => spaces.value.find((s) => s.id === currentId.value) ?? null)
  return {
    spaces: readonly(spaces),
    status: readonly(status),
    error: readonly(error),
    current,
    /** id dello spazio corrente: va messo in ogni insert e usato in ogni select */
    spaceId: computed(() => currentId.value),
    /** false = sola lettura: nascondi i comandi di modifica */
    canWrite: computed(() => ['owner', 'editor'].includes(current.value?.role)),
    label: computed(() => spaceLabel(current.value)),
    setSpace,
  }
}
