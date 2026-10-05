<script setup>
import { useAuth } from '../auth.js'

defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  // false sulla dashboard: nasconde il link "torna alla dashboard"
  back: { type: Boolean, default: true },
})
const { email, avatar, signOut } = useAuth()
</script>

<template>
  <div class="shell">
    <header class="shell-header">
      <div class="shell-left">
        <a v-if="back" href="/" class="btn btn-ghost btn-icon" title="Dashboard" aria-label="Torna alla dashboard">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </a>
        <span v-if="icon" class="shell-icon">{{ icon }}</span>
        <h1 class="shell-title">{{ title }}</h1>
      </div>
      <div class="shell-right">
        <slot name="actions" />
        <img v-if="avatar" :src="avatar" :alt="email" :title="email" class="avatar" referrerpolicy="no-referrer" />
        <button class="btn btn-ghost btn-sm" @click="signOut">Esci</button>
      </div>
    </header>
    <main class="shell-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; display: flex; flex-direction: column; }
.shell-header {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px; background: color-mix(in srgb, var(--bg) 85%, transparent);
  backdrop-filter: blur(8px); border-bottom: 1px solid var(--border);
}
.shell-left, .shell-right { display: flex; align-items: center; gap: 8px; min-width: 0; }
.shell-icon { font-size: 1.3rem; }
.shell-title { font-size: 1.05rem; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.avatar { width: 28px; height: 28px; border-radius: 50%; }
.shell-main { width: 100%; max-width: var(--max-w); margin: 0 auto; padding: 20px 16px 48px; flex: 1; }
</style>
