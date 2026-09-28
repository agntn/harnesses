<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import { HARNESSES, PLATFORMS } from "../../utils/harnesses";

defineProps<{ sample: HarnessEntry }>();
</script>

<template>
  <section class="tool-console landing-registry" aria-label="Every harness in the registry">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title"><span class="console-tag">Call</span>listHarnesses()</span>
      <span class="console-meta"
        >{{ HARNESSES.length }} ids · {{ PLATFORMS.length }} platforms</span
      >
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="sample.id" class="console-cursor" />
    </div>

    <div class="registry-body">
      <!-- A cell per harness: glyph, name, id, node. The node says which one the other panels show now. -->
      <ul class="registry-cells">
        <li v-for="harness in HARNESSES" :key="harness.id">
          <UTooltip :text="harness.blurb">
            <NuxtLink
              :to="harness.to"
              class="registry-cell"
              :data-state="harness.id === sample.id ? 'current' : undefined"
            >
              <UIcon :name="harness.icon" class="registry-icon" aria-hidden="true" />
              <span class="registry-text">
                <span class="registry-name">{{ harness.short }}</span>
                <span class="registry-id">{{ harness.id }}</span>
              </span>
              <span class="registry-node" aria-hidden="true" />
            </NuxtLink>
          </UTooltip>
        </li>
      </ul>
    </div>

    <footer class="console-footer console-footer-plain">
      <span class="registry-legend"
        ><span class="registry-node" data-state="current" aria-hidden="true" /> in the panels
        now</span
      >
      <NuxtLink to="/harnesses" class="registry-link"
        ><span aria-hidden="true">→ </span>every harness</NuxtLink
      >
    </footer>
  </section>
</template>

<style scoped>
.landing-registry {
  container-type: inline-size;
}
.registry-body {
  padding: 14px 20px 18px;
}
.registry-cells {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.registry-cell {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 6px;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  box-shadow: inset 0 0 0 1px var(--console-line);
  transition: box-shadow 0.3s ease;
}
.registry-icon {
  width: 14px;
  height: 14px;
  color: var(--ui-text-dimmed);
  transition: color 0.3s ease;
}
.registry-text {
  display: grid;
  min-width: 0;
}
.registry-name,
.registry-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.registry-name {
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.4;
  color: var(--ui-text-highlighted);
}
.registry-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ui-text-dimmed);
}
.registry-node {
  display: inline-block;
  width: 6px;
  height: 6px;
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.registry-cell[data-state="current"] {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--console-accent) 55%, transparent);
}
.registry-cell[data-state="current"] .registry-icon {
  color: var(--console-accent);
}
.registry-node[data-state="current"],
.registry-cell[data-state="current"] .registry-node {
  background: var(--console-accent);
  box-shadow: none;
}
.registry-cell:hover {
  box-shadow: inset 0 0 0 1px var(--console-accent);
}
.registry-cell:hover .registry-name {
  color: var(--console-accent);
}
.registry-cell:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
.registry-legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.registry-link {
  margin-left: auto;
  color: var(--ui-text-highlighted);
}
.registry-link:hover {
  color: var(--console-accent);
}
.registry-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 3px;
}
/* Narrow, a cell keeps the name; the id is on the page it links to. */
@container (width < 30rem) {
  .registry-id {
    display: none;
  }
}
@media (width < 400px) {
  .registry-body {
    padding-inline: 14px;
  }
  .registry-cells {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .registry-cell,
  .registry-icon {
    transition: none;
  }
}
</style>
