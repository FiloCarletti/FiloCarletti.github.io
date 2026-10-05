<script setup>
import { computed, watch } from 'vue'
import { useAuth } from '../auth.js'
import { initSpaces, useSpace } from '../spaces.js'
import { LINK_TOKEN } from '../url.js'

const { ready, session, allowed, email, error, signInWithGoogle, signOut } = useAuth()
const { status: spaceStatus, error: spaceError, viaLink } = useSpace()
// La dashboard non ha dati propri; le app caricano lo spazio e verificano l'accesso.
const isApp = __APP_SLUG__ !== 'dashboard'

watch([ready, session, allowed], () => {
  if (!isApp || !ready.value) return
  if (session.value && allowed.value) initSpaces({ loggedIn: true })
  else if (LINK_TOKEN) initSpaces({ loggedIn: false }) // link pubblico: lettura anche senza login
}, { immediate: true })

// Con il link pubblico si entra anche senza login (o con un account non abilitato).
const linkOk = computed(() => isApp && spaceStatus.value === 'ok' && viaLink.value)
const linkPending = computed(() => isApp && LINK_TOKEN && !(session.value && allowed.value) && ['idle', 'loading'].includes(spaceStatus.value))
</script>

<template>
  <div v-if="!ready || linkPending" class="gate">
    <div class="spinner" aria-label="Caricamento" />
  </div>

  <slot v-else-if="linkOk" />

  <div v-else-if="!session" class="gate">
    <div class="card gate-card stack">
      <div class="gate-logo">🔒</div>
      <h1>Area personale</h1>
      <p class="muted">{{ LINK_TOKEN ? 'Il link non è più valido. Accedi per continuare.' : 'Accedi per continuare.' }}</p>
      <button class="btn btn-primary btn-lg" @click="signInWithGoogle">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Accedi con Google
      </button>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>
  </div>

  <div v-else-if="!allowed" class="gate">
    <div class="card gate-card stack">
      <div class="gate-logo">⛔</div>
      <h1>Accesso non autorizzato</h1>
      <p class="muted">L'account <strong>{{ email }}</strong> non è abilitato.</p>
      <button class="btn" @click="signOut">Esci</button>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>
  </div>

  <div v-else-if="isApp && ['idle', 'loading'].includes(spaceStatus)" class="gate">
    <div class="spinner" aria-label="Caricamento" />
  </div>

  <div v-else-if="isApp && spaceStatus !== 'ok'" class="gate">
    <div class="card gate-card stack">
      <div class="gate-logo">{{ spaceStatus === 'error' ? '⚠️' : '🚪' }}</div>
      <h1>{{ { denied: 'App non abilitata', forbidden: 'Spazio non accessibile', empty: 'Nessun dato condiviso' }[spaceStatus] ?? 'Errore' }}</h1>
      <p v-if="spaceStatus === 'denied'" class="muted">L'account <strong>{{ email }}</strong> non ha accesso a questa app.</p>
      <p v-else-if="spaceStatus === 'forbidden'" class="muted">Questi dati non sono condivisi con <strong>{{ email }}</strong>, o il link è scaduto.</p>
      <p v-else-if="spaceStatus === 'empty'" class="muted">Nessuno spazio di questa app è ancora condiviso con te.</p>
      <p v-else class="error-text">{{ spaceError }}</p>
      <div class="row" style="justify-content: center">
        <a href="/" class="btn">Torna alla dashboard</a>
        <button v-if="spaceStatus === 'error'" class="btn btn-primary" @click="initSpaces({ loggedIn: true, force: true })">Riprova</button>
      </div>
    </div>
  </div>

  <slot v-else />
</template>

<style scoped>
.gate { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
.gate-card { width: min(380px, 100%); text-align: center; align-items: center; padding: 32px 24px; }
.gate-card h1 { font-size: 1.35rem; margin: 0; }
.gate-logo { font-size: 2.2rem; }
.btn-lg { width: 100%; justify-content: center; padding: 12px 16px; }
</style>
