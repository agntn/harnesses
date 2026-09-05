<script setup lang="ts">
defineProps<{ detection: { envVars: string[]; projectMarkers: string[] } }>();
</script>

<template>
  <div class="grid sm:grid-cols-2">
    <div class="border-b border-muted px-4 py-3.5 sm:border-r sm:border-b-0">
      <p class="harnesses-eyebrow mb-2">envVars</p>
      <p v-if="detection.envVars.length === 0" class="text-xs text-muted">
        None. Detection is by project markers only.
      </p>
      <p v-else class="flex flex-wrap gap-1.5">
        <span v-for="name in detection.envVars" :key="name" class="harnesses-chip harnesses-chip-ok">{{
          name
        }}</span>
      </p>
    </div>
    <div class="px-4 py-3.5">
      <p class="harnesses-eyebrow mb-2">projectMarkers</p>
      <p class="flex flex-wrap gap-1.5">
        <span v-for="marker in detection.projectMarkers" :key="marker" class="harnesses-chip">{{
          marker
        }}</span>
      </p>
    </div>
  </div>
</template>
