import { computed, readonly, ref } from 'vue'
import { supabase } from './supabase.js'
import { hashParams, spaceUrl } from './url.js'

/**
 * Spazio di dati dell'app corrente (vedi CONVENTIONS.md, "Permessi e spazi").
 * Lo spazio sta nell'URL (#/…?space=<id>): senza, si apre il proprio spazio personale.
 * Proprietari = titolare + membri "editor"; i "viewer" leggono soltanto;
 * con il link pubblico (&k=<token>) si legge anche senza login.
 */
const info = ref(null) // risultato di rpc('space_info')
const mine = ref([]) // spazi dell'utente in questa app (rpc('my_spaces'))
const status = ref('idle') // idle | loading | ok | login | denied | forbidden | empty | error
const error = ref(null)
let lastKey = null

/** Chiamata da AuthGate. `loggedIn`: utente autenticato e in allowlist. */
export async function initSpaces({ loggedIn, force = false } = {}) {
  const requested = hashParams().get('space')
  const key = `${loggedIn}|${requested}`
  if (!force && key === lastKey && status.value !== 'error') return
  lastKey = key
  status.value = 'loading'
  error.value = null
  try {
    let id = requested
    if (loggedIn) {
      const { data, error: err } = await supabase.rpc('my_spaces', {
        p_app: __APP_SLUG__, p_personal: __APP_DATA_MODE__ !== 'shared',
      })
      if (!err) {
        mine.value = (data ?? []).map((s) => ({ id: s.space_id, name: s.space_name, kind: s.space_kind, role: s.my_role, ownerName: s.owner_name }))
      } else if (!requested) {
        status.value = err.code === '42501' ? 'denied' : 'error'
        error.value = err.message
        return
      }
      id ??= mine.value[0]?.id
      if (!id) { status.value = 'empty'; return }
    } else if (!requested) {
      status.value = 'login'
      return
    }
    const { data: si, error: err } = await supabase.rpc('space_info', { p_space: id })
    if (err) throw err
    if (!si || si.app_slug !== __APP_SLUG__) {
      status.value = loggedIn ? 'forbidden' : 'login'
      return
    }
    info.value = si
    status.value = 'ok'
  } catch (e) {
    error.value = e.message ?? String(e)
    status.value = 'error'
  }
}

/** Ricarica i dettagli dello spazio (dopo una modifica alla condivisione). */
export async function refreshSpace() {
  if (!info.value) return
  const { data, error: err } = await supabase.rpc('space_info', { p_space: info.value.id })
  if (err) throw err
  if (data) info.value = data
}

/**
 * Etichetta dei proprietari dal punto di vista di chi guarda:
 *  - sei tra i proprietari: "Tu", "Tu e Marco", "Tu e altri 3"
 *  - non lo sei: "Marco", "Marco e altri 2"
 */
export function ownersLabel(owners = []) {
  if (!owners.length) return ''
  const others = owners.filter((o) => !o.me)
  if (others.length < owners.length) {
    if (!others.length) return 'Tu'
    return others.length === 1 ? `Tu e ${firstName(others[0].name)}` : `Tu e altri ${others.length}`
  }
  return owners.length === 1 ? owners[0].name : `${firstName(owners[0].name)} e altri ${owners.length - 1}`
}
const firstName = (n = '') => n.split(' ')[0]

export function useSpace() {
  const role = computed(() => info.value?.my_role ?? null)
  return {
    status: readonly(status),
    error: readonly(error),
    info: readonly(info),
    mine: readonly(mine),
    /** id dello spazio corrente: va messo in ogni insert e usato in ogni select */
    spaceId: computed(() => info.value?.id ?? null),
    /** false = sola lettura: nascondi i comandi di modifica */
    canWrite: computed(() => role.value === 'owner' || role.value === 'editor'),
    /** può condividere lo spazio (proprietari e admin) */
    canManage: computed(() => !!info.value?.can_manage),
    /** arrivato dal link pubblico (eventualmente senza login) */
    viaLink: computed(() => role.value === 'link'),
    owners: computed(() => info.value?.owners ?? []),
    ownersLabel: computed(() => ownersLabel(info.value?.owners ?? [])),
    shareUrl: (withToken = false) => (info.value ? spaceUrl(__APP_SLUG__, info.value.id, withToken ? info.value.link_token : null) : ''),
  }
}
