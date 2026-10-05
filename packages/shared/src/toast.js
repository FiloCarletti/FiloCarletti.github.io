import { reactive } from 'vue'

// Notifiche minimali: toast.error(e) / toast.ok('Salvato')
export const toasts = reactive([])
let id = 0

function push(kind, text, ms = 3500) {
  const t = { id: ++id, kind, text }
  toasts.push(t)
  setTimeout(() => {
    const i = toasts.indexOf(t)
    if (i > -1) toasts.splice(i, 1)
  }, ms)
}

export const toast = {
  ok: (text) => push('ok', text),
  info: (text) => push('info', text),
  error: (e) => {
    console.error(e)
    push('error', e?.message ?? String(e), 6000)
  },
}
