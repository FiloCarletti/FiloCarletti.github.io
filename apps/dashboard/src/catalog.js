// App visibili all'utente: manifest generato in build ∩ permessi dal DB (rpc my_apps).
import { computed, reactive } from 'vue'
import { supabase, unwrap, toast } from '@shared'
// Generato da scripts/build-all.mjs leggendo apps/*/app.json
import manifest from './apps.generated.json'

const state = reactive({ loaded: false, loading: false, admin: false, grants: [], recent: [], community: [] })

export async function loadCatalog() {
  if (state.loading) return
  state.loading = true
  try {
    const [res, community] = await Promise.all([
      supabase.rpc('my_apps').then(unwrap),
      supabase.rpc('my_community').then(unwrap),
    ])
    Object.assign(state, {
      admin: !!res?.admin, grants: res?.grants ?? [], recent: res?.recent ?? [], community: community ?? [], loaded: true,
    })
  } catch (e) {
    toast.error(e)
  } finally {
    state.loading = false
  }
}

export const MODES = {
  personal: { label: 'Personale', icon: '👤', hint: 'ognuno ha i propri dati' },
  shared: { label: 'Condivisa', icon: '👥', hint: 'dati unici per chi è abilitato' },
  mixed: { label: 'Mista', icon: '🔀', hint: 'dati personali e spazi condivisi' },
}

export function useCatalog() {
  const usage = computed(() => new Map(state.recent.map((r) => [r.slug, r])))
  const apps = computed(() =>
    manifest
      .filter((a) => !a.hidden && a.kind !== 'game' && (state.admin || state.grants.includes(a.slug)))
      .map((a) => ({ ...a, lastOpened: usage.value.get(a.slug)?.at ?? null, opens: usage.value.get(a.slug)?.n ?? 0 })),
  )
  const recent = computed(() =>
    state.recent.map((r) => apps.value.find((a) => a.slug === r.slug)).filter(Boolean).slice(0, 10),
  )
  // Amici: chi ha condiviso qualcosa con me; per ogni spazio l'app corrispondente.
  const bySlug = new Map(manifest.map((a) => [a.slug, a]))
  const friends = computed(() =>
    state.community.map((f) => ({
      ...f,
      spaces: f.spaces.map((s) => ({ ...s, app: bySlug.get(s.app_slug) ?? { name: s.app_slug, icon: '🧩', slug: s.app_slug } })),
    })),
  )
  // Giochi: niente dati sul DB, quindi niente permessi: li vede chiunque entri nella dashboard.
  const games = manifest.filter((a) => !a.hidden && a.kind === 'game')
  return { state, apps, recent, friends, games, all: manifest }
}

const rtf = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' })
/** "oggi", "ieri", "3 giorni fa", "2 settimane fa"… */
export function fmtRelative(iso) {
  if (!iso) return ''
  const days = Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
  if (days > -7) return rtf.format(days, 'day')
  if (days > -60) return rtf.format(Math.round(days / 7), 'week')
  return rtf.format(Math.round(days / 30), 'month')
}
