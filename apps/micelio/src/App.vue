<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ToastHost from '@shared/components/ToastHost.vue'
import { DEBUG, away, game, importSave, loadError, now, resetGame, start, status } from './game/store.js'
import { SPORE_TERR, expUnlocked } from './game/engine.js'
import SidePanel from './components/SidePanel.vue'
import BuildingsTab from './components/BuildingsTab.vue'
import ResearchTab from './components/ResearchTab.vue'
import TerritoryTab from './components/TerritoryTab.vue'
import SporeTab from './components/SporeTab.vue'
import TreeTab from './components/TreeTab.vue'
import ExpeditionsTab from './components/ExpeditionsTab.vue'
import AchievementsTab from './components/AchievementsTab.vue'
import OptionsTab from './components/OptionsTab.vue'
import AwayModal from './components/AwayModal.vue'

const TABS = [
  { id: 'rete', label: 'Rete', icon: '🕸️', comp: BuildingsTab, show: () => true },
  { id: 'ricerca', label: 'Ricerca', icon: '🔬', comp: ResearchTab, show: (s) => s.seen.segnali },
  { id: 'territori', label: 'Territori', icon: '🗺️', comp: TerritoryTab, show: () => true },
  { id: 'spore', label: 'Spore', icon: '🌬️', comp: SporeTab, show: (s) => s.terr >= SPORE_TERR - 1 || s.life.spor > 0 },
  { id: 'albero', label: 'Albero Madre', icon: '🌳', comp: TreeTab, show: (s) => s.seen.luce || s.tree > 0, badge: (s) => s.ringsReady },
  { id: 'spedizioni', label: 'Spedizioni', icon: '🎒', comp: ExpeditionsTab, show: expUnlocked, badge: (s, t) => s.exp.filter((e) => e.end <= t).length },
  { id: 'traguardi', label: 'Traguardi', icon: '🏆', comp: AchievementsTab, show: () => true },
  { id: 'opzioni', label: 'Opzioni', icon: '⚙️', comp: OptionsTab, show: () => true },
]
const tabs = computed(() => (game.value ? TABS.filter((t) => t.show(game.value)) : []))
const tab = ref(readTab())
function readTab() {
  try { return localStorage.getItem('micelio-ui-tab') ?? 'rete' } catch { return 'rete' }
}
watch(tab, (v) => {
  try { localStorage.setItem('micelio-ui-tab', v) } catch { /* storage non disponibile */ }
})
const current = computed(() => tabs.value.find((t) => t.id === tab.value) ?? tabs.value[0])

onMounted(start)

const importText = ref('')
async function doImport() {
  try {
    await importSave(importText.value)
  } catch (e) {
    loadError.value = e.message
  }
}
const reload = () => window.location.reload()
async function doReset() {
  if (confirm('Il salvataggio illeggibile verrà messo da parte e si ricomincia da capo. Continuare?')) await resetGame()
}
</script>

<template>
  <div class="mc">
    <header class="mc-head">
      <a href="/" class="btn btn-ghost btn-icon" title="Dashboard" aria-label="Torna alla dashboard">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </a>
      <span class="mc-logo">🍄</span>
      <h1>Micelio</h1>
      <span v-if="DEBUG" class="badge" title="Salvataggi in chiaro e strumenti di debug in Opzioni">debug</span>
    </header>

    <div v-if="status === 'loading'" class="mc-center">
      <div class="spinner" />
      <p class="muted small">Calcolo di quello che è cresciuto mentre eri via…</p>
    </div>

    <div v-else-if="status === 'error'" class="mc-center">
      <div class="card stack" style="max-width: 520px">
        <h2>Salvataggio illeggibile</h2>
        <p class="error-text">{{ loadError }}</p>
        <label class="field">
          <span>Incolla un salvataggio esportato</span>
          <textarea v-model="importText" class="textarea" spellcheck="false" />
        </label>
        <div class="row">
          <button class="btn btn-primary" :disabled="!importText.trim()" @click="doImport">Importa</button>
          <button class="btn btn-danger" @click="doReset">Ricomincia da capo</button>
        </div>
      </div>
    </div>

    <div v-else-if="game" class="mc-main">
      <SidePanel class="mc-side" />
      <section class="mc-content">
        <nav class="mc-tabs" role="tablist">
          <button
            v-for="t in tabs" :key="t.id" role="tab" class="mc-tab" :class="{ on: current?.id === t.id }"
            :aria-selected="current?.id === t.id" @click="tab = t.id"
          >
            <span aria-hidden="true">{{ t.icon }}</span> {{ t.label }}
            <span v-if="t.badge?.(game, now)" class="mc-badge" :title="`${t.badge(game, now)} da fare`">{{ t.badge(game, now) }}</span>
          </button>
        </nav>
        <component :is="current.comp" v-if="current" />
      </section>
    </div>

    <AwayModal v-if="away && status === 'ready'" />

    <div v-if="status === 'elsewhere'" class="mc-overlay">
      <div class="card stack" style="max-width: 400px; text-align: center">
        <p style="font-size: 2rem; margin: 0">🍄</p>
        <p>Micelio è aperto in un’altra scheda: qui il gioco è in pausa per non sovrascrivere i progressi.</p>
        <button class="btn btn-primary" style="align-self: center" @click="reload">Gioca qui</button>
      </div>
    </div>
    <ToastHost />
  </div>
</template>

<style scoped>
.mc { min-height: 100vh; display: flex; flex-direction: column; }
.mc-head {
  position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 85%, transparent); backdrop-filter: blur(8px);
}
.mc-head h1 { font-size: 1.05rem; margin: 0; }
.mc-logo { font-size: 1.3rem; }
.mc-center { flex: 1; display: grid; place-items: center; align-content: center; gap: 12px; padding: 24px 16px; }
.mc-main {
  width: 100%; max-width: 1180px; margin: 0 auto; padding: 16px 16px 48px;
  display: grid; gap: 16px; grid-template-columns: 300px minmax(0, 1fr); align-items: start;
}
.mc-side { position: sticky; top: 64px; min-width: 0; }
.mc-content { min-width: 0; }
.mc-tabs { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 14px; padding-bottom: 2px; scrollbar-width: thin; }
.mc-tab {
  flex-shrink: 0; border: 1px solid var(--border); background: var(--surface); color: var(--muted);
  border-radius: 999px; padding: 6px 12px; font: inherit; font-size: .9rem; cursor: pointer; white-space: nowrap;
}
.mc-badge { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 2px; border-radius: 999px; background: var(--warn); color: #fff; font-size: .72rem; font-weight: 700; }
.mc-tab.on { background: var(--primary-soft); color: var(--primary); border-color: transparent; font-weight: 600; }
.mc-overlay { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / .55); }
@media (max-width: 820px) {
  .mc-main { grid-template-columns: minmax(0, 1fr); }
  .mc-side { position: static; }
}
</style>
