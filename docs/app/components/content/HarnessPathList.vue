<script setup lang="ts">
import type { PathCandidate } from "#shared/types/registry";

defineProps<{
  group: string;
  entries: readonly PathCandidate[];
  /** Shown beside the group name, e.g. how many entries the platform filter hid. */
  aside?: string;
  /** Show the platform tag; off when the entries are already resolved for one platform. */
  platforms?: boolean;
}>();
</script>

<template>
  <!-- One band per path group: the field name as a rule title, then a row per path with its scope and level. -->
  <div class="harnesses-band paths-band">
    <p class="console-label console-rule-title">
      <span
        ><span class="console-label-key">{{ group }}</span
        ><span v-if="aside" aria-hidden="true"> [ {{ aside }} ]</span></span
      >
      <span class="console-mark" aria-hidden="true" />
    </p>
    <ul v-if="entries.length > 0" class="paths-rows">
      <li v-for="entry in entries" :key="entry.path">
        <code class="paths-path">{{ entry.path }}</code>
        <span class="paths-tags">
          <span class="paths-tag">{{ entry.scope }}</span>
          <span class="paths-tag" :class="{ 'paths-tag-open': entry.level === 'inferred' }">{{
            entry.level
          }}</span>
          <span v-if="platforms" class="paths-tag">{{
            entry.platforms ? entry.platforms.join(", ") : "all"
          }}</span>
        </span>
        <p v-if="entry.note" class="paths-note">{{ entry.note }}</p>
      </li>
    </ul>
    <p v-else class="paths-none">none mapped</p>
  </div>
</template>

<style scoped>
.paths-rows {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.paths-rows > li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 16px;
  align-items: baseline;
  padding: 7px 0;
}
.paths-rows > li + li {
  box-shadow: inset 0 1px 0 var(--console-line);
}
.paths-path {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  overflow-wrap: anywhere;
  color: var(--ui-text-highlighted);
}
.paths-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}
/* Scope, level and platform as boxed words; an inferred level is the one mark worth the accent. */
.paths-tag {
  padding: 0 5px;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.6;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.paths-tag-open {
  color: var(--console-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--console-accent) 55%, transparent);
}
.paths-note {
  grid-column: 1 / -1;
  margin: 2px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.55;
  color: var(--ui-text-muted);
}
.paths-none {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ui-text-dimmed);
}
@media (width < 640px) {
  .paths-rows > li {
    grid-template-columns: minmax(0, 1fr);
  }
  .paths-tags {
    justify-content: flex-start;
  }
}
</style>
