<script setup>
// Sezione comprimibile. Con `storageKey` ricorda (solo su questo dispositivo) se era aperta o chiusa.
import { ref, watch } from 'vue'
import { pref, savePref } from '../store.js'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  storageKey: { type: String, default: '' },
  defaultOpen: { type: Boolean, default: true },
  card: { type: Boolean, default: true },
})
const saved = props.storageKey ? pref(`open:${props.storageKey}`, null) : null
const open = ref(saved == null ? props.defaultOpen : saved === '1')
watch(open, (v) => { if (props.storageKey) savePref(`open:${props.storageKey}`, v ? '1' : '0') })
</script>

<template>
  <section class="coll" :class="{ card, closed: !open }">
    <header class="coll-head">
      <button type="button" class="coll-toggle" :aria-expanded="open" @click="open = !open">
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        <span class="titles">
          <h3>{{ title }}</h3>
          <span v-if="subtitle" class="muted small sub">{{ subtitle }}</span>
        </span>
      </button>
      <slot name="aside" />
    </header>
    <div v-if="open" class="coll-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.coll { display: flex; flex-direction: column; gap: 12px; }
.coll.closed { gap: 0; }
.coll-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.coll-toggle { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.coll-toggle:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 6px; }
.chev { flex-shrink: 0; color: var(--muted); transition: transform .15s; transform: rotate(90deg); }
.closed .chev { transform: none; }
.titles { display: flex; flex-direction: column; min-width: 0; }
.titles h3 { margin: 0; }
.sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.coll-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
</style>
