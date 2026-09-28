<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import { MODES, buildCommand, invocationError, shellLine } from "../../utils/harnesses";
import { shellTokens } from "../../utils/tokens";

const props = defineProps<{ sample: HarnessEntry }>();

const PROMPT = "Review this patch";

const cells = computed(() =>
  MODES.map((mode) => {
    const built = buildCommand(props.sample, mode.key, PROMPT);
    return {
      ...mode,
      supported: props.sample.invocationModes[mode.key],
      line: built ? shellLine(built) : null,
    };
  }),
);

const supported = computed(() => cells.value.filter((cell) => cell.supported).length);
const shown = computed(() => cells.value.find((cell) => cell.supported && cell.line));
const rejected = computed(() => cells.value.find((cell) => !cell.supported));
const rejection = computed(() =>
  rejected.value ? invocationError(props.sample, rejected.value.key) : null,
);
</script>

<template>
  <section class="tool-console landing-modes" aria-label="Invocation modes of one harness">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title"
        ><span class="console-tag">Call</span>invoke(<span class="tok-str">"{{ PROMPT }}"</span>,
        options)</span
      >
      <span class="console-meta">{{ sample.id }} · {{ supported }} of {{ MODES.length }}</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="sample.id" class="console-cursor" />
    </div>

    <div class="modes-body">
      <p class="console-label console-rule-title">
        <span
          >Modes
          <span aria-hidden="true"
            >[ <span class="console-label-key">{{ sample.id }}</span> ]</span
          ></span
        >
        <span class="console-mark" aria-hidden="true" />
      </p>
      <ul :key="sample.id" class="modes-grid console-animate">
        <li v-for="cell in cells" :key="cell.key" :class="{ 'modes-on': cell.supported }">
          <span class="modes-label">{{ cell.label }}</span>
          <span class="modes-options">{{ cell.options }}</span>
          <span class="modes-node" :aria-label="cell.supported ? 'supported' : 'rejected'" />
        </li>
      </ul>

      <p class="console-label console-rule-title modes-rule">
        <span
          >Spawned <span aria-hidden="true">[ {{ shown?.label ?? "none" }} ]</span></span
        >
        <span class="console-mark" aria-hidden="true" />
      </p>
      <UTooltip v-if="shown?.line" :text="shown.line">
        <!-- prettier-ignore -->
        <pre :key="`${sample.id}-line`" class="console-snippet modes-line" tabindex="0"><code><span v-for="(token, part) in shellTokens(shown.line)" :key="part" :class="token.cls">{{ token.text }}</span></code></pre>
      </UTooltip>
      <!-- prettier-ignore -->
      <pre v-else class="console-snippet modes-line"><code class="modes-quiet">no headless mode, invoke() rejects before it spawns</code></pre>

      <p class="console-label console-rule-title modes-rule">
        <span
          >Rejected <span aria-hidden="true">[ {{ rejected?.label ?? "none" }} ]</span></span
        >
        <span class="console-mark" aria-hidden="true" />
      </p>
      <UTooltip v-if="rejection" :text="rejection">
        <p :key="`${sample.id}-error`" class="harnesses-error modes-error" tabindex="0">
          <span class="console-tag">Error</span
          ><span class="modes-error-text">{{ rejection }}</span>
        </p>
      </UTooltip>
      <p v-else class="harnesses-error modes-error modes-quiet">
        <span class="console-tag">None</span
        ><span class="modes-error-text">every mode has a recipe</span>
      </p>
    </div>

    <footer class="console-footer console-footer-plain">
      <span>tools: false unless you ask</span>
      <NuxtLink to="/explorer" class="modes-link"
        ><span aria-hidden="true">→ </span>try a mode</NuxtLink
      >
    </footer>
  </section>
</template>

<style scoped>
.modes-body {
  padding: 14px 20px 18px;
}
.modes-body > .console-rule-title {
  margin: 0 0 10px;
}
.modes-body > .modes-rule {
  margin-top: 16px;
}
/* Six cells, the state on the node: an accent outline where the harness has a recipe, empty where it rejects. */
.modes-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.modes-grid > li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 7px;
  gap: 2px 8px;
  align-items: center;
  padding: 7px 10px;
  box-shadow: inset 0 0 0 1px var(--console-line);
  font-family: var(--font-mono);
}
.modes-label {
  overflow: hidden;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-dimmed);
}
.modes-options {
  grid-column: 1;
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-dimmed);
}
.modes-node {
  grid-column: 2;
  grid-row: 1 / span 2;
  width: 7px;
  height: 7px;
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.modes-on .modes-label {
  color: var(--ui-text-highlighted);
}
.modes-on .modes-options {
  color: var(--ui-text-muted);
}
.modes-on .modes-node {
  box-shadow: inset 0 0 0 1px var(--console-accent);
}
.modes-line {
  margin: 0;
}
.modes-line > code {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
}
.modes-line:focus-visible,
.modes-error:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
.modes-error {
  font-family: var(--font-mono);
  font-size: 12px;
}
.modes-error-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.modes-quiet,
.modes-quiet > .console-tag {
  color: var(--ui-text-dimmed);
  box-shadow: none;
}
.modes-quiet > .console-tag {
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.modes-link {
  margin-left: auto;
  color: var(--ui-text-highlighted);
}
.modes-link:hover {
  color: var(--console-accent);
}
.modes-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 3px;
}
@media (width < 640px) {
  .modes-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (width < 400px) {
  .modes-body {
    padding-inline: 14px;
  }
  .modes-body > .console-rule-title > span:first-child > span {
    display: none;
  }
}
</style>
