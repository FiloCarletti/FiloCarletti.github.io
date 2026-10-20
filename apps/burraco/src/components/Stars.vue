<script setup>
defineProps({ n: { type: Number, required: true } })
</script>

<template>
  <span class="stars" :aria-label="`Difficoltà ${n} su 5`" :title="`Difficoltà ${n} su 5`">
    <span v-for="i in 5" :key="i" :class="{ on: i <= n }">★</span>
  </span>
</template>

<style scoped>
.stars { letter-spacing: 1px; font-size: .9rem; white-space: nowrap; }
.stars span { color: var(--border); }
.stars .on { color: #f59f00; }
</style>
