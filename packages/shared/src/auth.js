import { ref, computed, readonly } from 'vue'
import { supabase } from './supabase.js'

const session = ref(null)
const allowed = ref(false)
const ready = ref(false)
const error = ref(null)
let initPromise = null

async function refreshAllowed() {
  if (!session.value) {
    allowed.value = false
    return
  }
  // Controllo lato DB: l'email deve essere in private.allowed_emails.
  const { data, error: err } = await supabase.rpc('is_allowed')
  if (err) error.value = err.message
  allowed.value = data === true
}

function cleanAuthParams() {
  const url = new URL(window.location.href)
  let changed = false
  for (const p of ['code', 'error', 'error_code', 'error_description', 'state']) {
    if (url.searchParams.has(p)) {
      if (p === 'error_description') error.value = url.searchParams.get(p)
      url.searchParams.delete(p)
      changed = true
    }
  }
  if (changed) window.history.replaceState(window.history.state, '', url.toString())
}

export function initAuth() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      const { data } = await supabase.auth.getSession() // completa anche lo scambio ?code=
      session.value = data.session
      await refreshAllowed()
    } catch (e) {
      error.value = e.message ?? String(e)
    } finally {
      cleanAuthParams()
      ready.value = true
    }
    supabase.auth.onAuthStateChange((event, s) => {
      session.value = s
      // Mai chiamare Supabase in modo sincrono dentro il callback.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(refreshAllowed, 0)
      }
    })
  })()
  return initPromise
}

export async function signInWithGoogle() {
  error.value = null
  const redirectTo = window.location.origin + window.location.pathname
  const { error: err } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } },
  })
  if (err) error.value = err.message
}

export async function signOut() {
  await supabase.auth.signOut()
  session.value = null
  allowed.value = false
}

export function useAuth() {
  return {
    ready: readonly(ready),
    session: readonly(session),
    allowed: readonly(allowed),
    error: readonly(error),
    user: computed(() => session.value?.user ?? null),
    userId: computed(() => session.value?.user?.id ?? null),
    email: computed(() => session.value?.user?.email ?? ''),
    avatar: computed(() => session.value?.user?.user_metadata?.avatar_url ?? ''),
    signInWithGoogle,
    signOut,
  }
}
