<script setup>
import { toasts } from '../toast.js'
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast-${t.kind}`">{{ t.text }}</div>
  </div>
</template>

<style scoped>
.toasts { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: grid; gap: 8px; z-index: 100; width: min(420px, calc(100% - 32px)); }
.toast { padding: 10px 14px; border-radius: var(--radius); background: var(--surface-2); border: 1px solid var(--border); box-shadow: var(--shadow); font-size: .92rem; }
.toast-ok { border-color: var(--ok); }
.toast-error { border-color: var(--danger); color: var(--danger); }
</style>
