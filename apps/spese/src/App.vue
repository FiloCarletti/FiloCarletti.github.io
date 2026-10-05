<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { AuthGate, AppShell, ToastHost } from '@shared'
import { openEditor, useData } from './store.js'
import SpacePicker from './components/SpacePicker.vue'
import QuickAdd from './components/QuickAdd.vue'

const { editor, defaultTarget } = useData()

const tabs = [
  { to: '/', label: 'Movimenti' },
  { to: '/statistiche', label: 'Statistiche' },
  { to: '/riclassifica', label: 'Riclassifica' },
  { to: '/gestisci', label: 'Gestisci' },
]

// Da tastiera (desktop): "-" nuova spesa, "+" nuova entrata, fuori dai campi di testo.
function onKey(e) {
  if (editor.open || !defaultTarget.value || e.ctrlKey || e.metaKey || e.altKey) return
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return
  if (e.key === '-') { e.preventDefault(); openEditor({ segno: -1 }) }
  if (e.key === '+') { e.preventDefault(); openEditor({ segno: 1 }) }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <AuthGate>
    <AppShell title="Spese" icon="💶">
      <SpacePicker />
      <nav class="tabs" aria-label="Sezioni">
        <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" :class="{ exact: t.to === '/' }">{{ t.label }}</RouterLink>
      </nav>
      <RouterView />
      <div v-if="defaultTarget" class="fab-pad" />
    </AppShell>

    <!-- Inserimento rapido: due bottoni sempre a portata di pollice -->
    <div v-if="defaultTarget && !editor.open" class="fab" role="group" aria-label="Nuovo movimento">
      <button class="fab-btn out" title="Nuova spesa (tasto -)" @click="openEditor({ segno: -1 })">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>
        Spesa
      </button>
      <button class="fab-btn in" title="Nuova entrata (tasto +)" @click="openEditor({ segno: 1 })">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Entrata
      </button>
    </div>
    <QuickAdd v-if="editor.open" />
  </AuthGate>
  <ToastHost />
</template>

<style scoped>
.tabs { display: flex; gap: 4px; margin: 0 0 16px; padding: 3px; background: var(--surface-2); border-radius: var(--radius); overflow-x: auto; scrollbar-width: none; }
.tab { flex: 1 0 auto; text-align: center; padding: 7px 10px; border-radius: 8px; color: var(--muted); text-decoration: none; font-weight: 500; font-size: .92rem; white-space: nowrap; }
.tab.router-link-active:not(.exact), .tab.exact.router-link-exact-active { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
@media (max-width: 420px) { .tab { font-size: .84rem; padding: 7px 6px; } }

.fab-pad { height: 72px; }
.fab {
  position: fixed; z-index: 20; right: max(16px, calc((100vw - var(--max-w)) / 2 + 16px)); bottom: max(16px, env(safe-area-inset-bottom));
  display: flex; gap: 10px;
}
.fab-btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 14px 20px; border-radius: 999px; border: 0;
  font: inherit; font-weight: 700; font-size: 1rem; cursor: pointer; color: #fff; box-shadow: 0 6px 20px rgb(0 0 0 / .22);
}
.fab-btn:active { transform: scale(.97); }
.fab-btn:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
.fab-btn.out { background: #e03131; }
.fab-btn.in { background: #2f9e44; }
@media (prefers-color-scheme: dark) {
  .fab-btn.out { background: #c92a2a; }
  .fab-btn.in { background: #2b8a3e; }
}
@media (max-width: 420px) {
  .fab { left: 16px; right: 16px; }
  .fab-btn { flex: 1; justify-content: center; }
}
</style>
