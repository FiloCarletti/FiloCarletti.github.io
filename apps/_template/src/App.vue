<script setup>
import { AuthGate, AppShell, ToastHost } from '@shared'
</script>

<template>
  <AuthGate>
    <AppShell title="__NAME__" icon="__ICON__">
      <RouterView />
    </AppShell>
  </AuthGate>
  <ToastHost />
</template>
