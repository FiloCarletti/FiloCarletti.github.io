<script setup>
import { computed, ref } from 'vue'
import { AuthGate, AppShell, fmtDate, useAuth } from '@shared'
// Generato da scripts/build-all.mjs leggendo apps/*/app.json
import apps from './apps.generated.json'

const { user } = useAuth()
const q = ref('')
const firstName = computed(() => (user.value?.user_metadata?.full_name ?? '').split(' ')[0])

const visible = computed(() => {
  const s = q.value.trim().toLowerCase()
  return apps
    .filter((a) => !a.hidden)
    .filter((a) => !s || [a.name, a.description, ...(a.tags ?? [])].join(' ').toLowerCase().includes(s))
})
</script>

<template>
  <AuthGate>
    <AppShell title="Le mie app" icon="🏠" :back="false">
      <div class="stack">
        <div class="row-between">
          <div>
            <h2 style="margin: 0">Ciao{{ firstName ? ` ${firstName}` : '' }} 👋</h2>
            <p class="muted small" style="margin: 0">{{ apps.length }} app pubblicate</p>
          </div>
          <input v-if="apps.length > 4" v-model="q" class="input" style="max-width: 260px" placeholder="Cerca…" />
        </div>

        <div v-if="visible.length" class="grid">
          <a v-for="a in visible" :key="a.slug" :href="a.path" class="card app-card">
            <div class="app-icon">{{ a.icon }}</div>
            <div class="stack" style="gap: 4px; min-width: 0">
              <strong>{{ a.name }}</strong>
              <span class="muted small">{{ a.description }}</span>
              <div class="row" style="margin-top: 4px">
                <span v-for="t in a.tags" :key="t" class="badge">{{ t }}</span>
                <span v-if="a.updatedAt" class="badge">agg. {{ fmtDate(a.updatedAt) }}</span>
              </div>
            </div>
          </a>
        </div>
        <div v-else class="card empty">
          <p style="font-size: 2rem; margin: 0">🌱</p>
          <p v-if="q">Nessuna app corrisponde a “{{ q }}”.</p>
          <p v-else>Nessuna app ancora. Chiedi a Claude di crearne una!</p>
        </div>
      </div>
    </AppShell>
  </AuthGate>
</template>

<style scoped>
.app-card { display: flex; gap: 14px; align-items: flex-start; color: inherit; text-decoration: none; transition: transform .15s, border-color .15s; }
.app-card:hover { transform: translateY(-2px); border-color: var(--primary); }
.app-icon { font-size: 1.8rem; width: 44px; height: 44px; display: grid; place-items: center; background: var(--surface-2); border-radius: 12px; flex-shrink: 0; }
</style>
