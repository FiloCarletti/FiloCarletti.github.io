<script setup>
// Pattern tipico (da adattare quando esistono le tabelle in src/db.js):
//
// import { onMounted, ref } from 'vue'
// import { supabase, unwrap, toast } from '@shared'
// import { T } from '../db.js'
//
// const rows = ref([]); const loading = ref(true)
// async function load() {
//   try { rows.value = unwrap(await supabase.from(T.items).select('*').order('created_at', { ascending: false })) }
//   catch (e) { toast.error(e) } finally { loading.value = false }
// }
// async function add(payload) {           // owner_id lo mette il DB (default auth.uid())
//   try { unwrap(await supabase.from(T.items).insert(payload)); toast.ok('Salvato'); await load() }
//   catch (e) { toast.error(e) }
// }
// onMounted(load)
</script>

<template>
  <div class="card empty">
    <p style="font-size: 2rem; margin: 0">__ICON__</p>
    <p>__DESCRIPTION__</p>
  </div>
</template>
