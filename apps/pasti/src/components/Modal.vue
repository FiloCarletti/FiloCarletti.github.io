<script setup>
// Finestra modale: foglio dal basso su telefono, finestra centrata da desktop. Esc o clic fuori chiudono.
import { onBeforeUnmount, onMounted } from 'vue'

defineProps({ title: { type: String, required: true } })
const emit = defineEmits(['close'])

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-modal="true" :aria-label="title">
      <header class="head">
        <h2>{{ title }}</h2>
        <button type="button" class="btn btn-ghost btn-icon" aria-label="Chiudi" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </header>
      <div class="body"><slot /></div>
      <footer v-if="$slots.foot" class="foot"><slot name="foot" /></footer>
    </section>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 40; background: rgb(0 0 0 / .4); display: flex; align-items: flex-end; justify-content: center; }
.sheet {
  width: min(560px, 100%); max-height: 94vh; display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--border); border-radius: 18px 18px 0 0; box-shadow: var(--shadow);
}
@media (min-width: 640px) {
  .backdrop { align-items: center; padding: 16px; }
  .sheet { border-radius: var(--radius-lg); }
}
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 12px 4px 16px; }
.head h2 { margin: 0; }
.body { padding: 8px 16px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 16px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); }
</style>
