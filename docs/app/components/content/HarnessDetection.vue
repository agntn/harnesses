<script setup lang="ts">
defineProps<{ detection: { envVars: string[]; projectMarkers: string[] } }>();
</script>

<template>
  <!-- Env vars are checked first, project markers second; each column a rule title and its boxed names. -->
  <div class="harnesses-band detection-band">
    <div>
      <p class="console-label console-rule-title">
        <span
          ><span class="console-label-key">envVars</span>
          <span aria-hidden="true">[ first ]</span></span
        >
      </p>
      <p v-if="detection.envVars.length === 0" class="detection-none">
        None. Detection is by project markers only.
      </p>
      <ul v-else class="detection-names">
        <li v-for="name in detection.envVars" :key="name" class="detection-name">{{ name }}</li>
      </ul>
    </div>
    <div>
      <p class="console-label console-rule-title">
        <span
          ><span class="console-label-key">projectMarkers</span>
          <span aria-hidden="true">[ then ]</span></span
        >
      </p>
      <ul class="detection-names">
        <li v-for="marker in detection.projectMarkers" :key="marker" class="detection-name">
          {{ marker }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.detection-band {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 32px;
}
.detection-band .console-rule-title {
  margin: 0 0 10px;
}
.detection-names {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.detection-name {
  padding: 1px 7px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.detection-none {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--ui-text-muted);
}
@media (width < 640px) {
  .detection-band {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
