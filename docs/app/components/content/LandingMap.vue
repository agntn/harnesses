<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import {
  HARNESSES,
  LANDING_RESOLVE,
  MODES,
  PATH_GROUPS,
  allPaths,
  modeList,
  resolveGroup,
  userMcpConfig,
} from "../../utils/harnesses";
import { filePosition } from "../../utils/format";

const props = defineProps<{ sample: HarnessEntry }>();

const emit = defineEmits<{ step: [delta: number]; pause: [paused: boolean] }>();

const CALL = `resolve({ platform: "linux", homeDir: "~", projectRoot: "." })`;

const position = computed(() => HARNESSES.findIndex((entry) => entry.id === props.sample.id));

/** One row per path group, always all of them, so the map keeps one height across the walk. */
const rows = computed(() =>
  PATH_GROUPS.map((group) => {
    const entries = resolveGroup(props.sample[group], LANDING_RESOLVE);
    return {
      group,
      entries,
      first: entries[0],
      inferred: entries.some((entry) => entry.level === "inferred"),
    };
  }),
);

const paths = computed(() => allPaths(props.sample));
const inferred = computed(() => paths.value.filter((entry) => entry.level === "inferred").length);
const modes = computed(() => modeList(props.sample).length);
const mcp = computed(() => userMcpConfig(props.sample));
</script>

<template>
  <section
    class="tool-console console-wide landing-map"
    aria-label="Where one harness keeps its files"
    @mouseenter="emit('pause', true)"
    @mouseleave="emit('pause', false)"
    @focusin="emit('pause', true)"
    @focusout="emit('pause', false)"
  >
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip :text="`getHarness(&quot;${sample.id}&quot;).${CALL}`">
        <span class="console-title" tabindex="0"
          ><span class="console-tag">Call</span>getHarness(<span class="tok-str"
            >"{{ sample.id }}"</span
          >).resolve(…)<span class="console-file">{{
            filePosition(position, HARNESSES.length)
          }}</span></span
        >
      </UTooltip>
      <span class="console-meta">linux · {{ paths.length }} paths</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="sample.id" class="console-cursor" />
    </div>

    <div class="console-band console-subject-band map-subject">
      <div :key="sample.id" class="console-scan" aria-hidden="true" />
      <div class="map-left">
        <div class="console-identity-block">
          <ConsoleReticle :key="sample.id" :icon="sample.icon" />
          <div class="console-name">
            <span class="console-label"
              >Harness / <span class="console-label-key">{{ sample.id }}</span></span
            >
            <h3>{{ sample.name }}</h3>
            <p class="console-about map-about">{{ sample.blurb }}</p>
          </div>
        </div>

        <p class="console-label console-rule-title map-title">
          <span>Map <span aria-hidden="true">[ ~ and . on linux ]</span></span>
          <span class="console-mark" aria-hidden="true" />
        </p>
        <ul :key="sample.id" class="map-rows console-animate">
          <li v-for="row in rows" :key="row.group" :class="{ 'map-row-empty': !row.first }">
            <span class="console-tag map-group">{{ row.group }}</span>
            <UTooltip v-if="row.first" :content="{ side: 'top' }">
              <span class="map-path" tabindex="0">{{ row.first.path }}</span>
              <template #content>
                <span class="map-tip">
                  <span v-for="entry in row.entries" :key="entry.path" class="map-tip-row">
                    <span class="harnesses-tooltip-value">{{ entry.path }}</span>
                    <span class="harnesses-tooltip-sep"> · {{ entry.scope }} · </span>
                    <span :class="{ 'harnesses-tooltip-open': entry.level === 'inferred' }">{{
                      entry.level
                    }}</span>
                  </span>
                </span>
              </template>
            </UTooltip>
            <span v-else class="map-path">none mapped</span>
            <span class="map-leader" aria-hidden="true" />
            <span class="map-count">{{
              row.entries.length > 1 ? `+${row.entries.length - 1}` : ""
            }}</span>
            <span
              class="map-node"
              :class="{ 'map-node-open': row.inferred, 'map-node-none': !row.first }"
              :aria-label="
                row.first
                  ? row.inferred
                    ? 'has an inferred path'
                    : 'every path checked'
                  : undefined
              "
            />
          </li>
        </ul>
      </div>

      <div class="console-readout map-readout">
        <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
          <circle cx="3" cy="12" r="2.5" />
          <path d="M5.5 12H14L22 20H32" />
        </svg>
        <dl class="console-readout-rows">
          <div>
            <dt>Binary</dt>
            <dd>
              <span class="map-line">{{ sample.invocation?.binary ?? sample.binaries[0] }}</span>
            </dd>
          </div>
          <div>
            <dt>Invoke</dt>
            <dd :class="modes > 0 ? 'console-accent' : 'map-dim'">
              <span class="map-line">{{
                modes > 0 ? `${modes} of ${MODES.length} modes` : "no headless mode"
              }}</span>
            </dd>
          </div>
          <div>
            <dt>Models</dt>
            <dd :class="{ 'map-dim': !sample.modelListing }">
              <span class="map-line">{{
                sample.modelListing ? "native listing" : "no listing"
              }}</span>
            </dd>
          </div>
          <div>
            <dt>MCP</dt>
            <dd :class="{ 'map-dim': !mcp }">
              <span class="map-line">{{
                mcp ? `${mcp.format} · ${mcp.dialect}` : "not mapped"
              }}</span>
            </dd>
          </div>
          <div>
            <dt>Agents file</dt>
            <dd :class="{ 'map-dim': !sample.agentsFile }">
              <UTooltip v-if="sample.agentsFile" :text="sample.agentsFile">
                <span class="map-line" tabindex="0">{{ sample.agentsFile }}</span>
              </UTooltip>
              <span v-else class="map-line">none stable</span>
            </dd>
          </div>
        </dl>
        <div class="console-gauge">
          <span :key="sample.id" class="console-ticks">
            <span
              v-for="(entry, index) in paths"
              :key="index"
              :class="entry.level === 'inferred' ? 'console-tick-open' : 'console-tick-closed'"
              :style="{ animationDelay: `${Math.min(index * 12, 720)}ms` }"
            />
          </span>
          <span class="console-gauge-read">Inferred {{ inferred }} / {{ paths.length }}</span>
        </div>
      </div>
    </div>

    <footer class="console-footer console-footer-plain">
      <NuxtLink :to="sample.to" class="map-link"
        ><span aria-hidden="true">→ </span>{{ sample.name }}</NuxtLink
      >
      <div class="console-controls" aria-label="Sample harnesses">
        <UButton
          color="neutral"
          variant="subtle"
          square
          icon="i-lucide-chevron-left"
          aria-label="Previous harness"
          @click="emit('step', -1)"
        />
        <span>Harness</span>
        <UButton
          color="neutral"
          variant="subtle"
          square
          icon="i-lucide-chevron-right"
          aria-label="Next harness"
          @click="emit('step', 1)"
        />
      </div>
    </footer>
  </section>
</template>

<style scoped>
.map-subject {
  align-items: stretch;
}
.map-left {
  display: grid;
  align-content: start;
  min-width: 0;
}
.map-about {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.map-title {
  margin: 20px 0 6px;
}
/* One row per path group: the field name, the first path, a leader, how many more, the evidence node. */
.map-rows {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.map-rows > li {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, auto) minmax(16px, 1fr) 2rem 7px;
  gap: 10px;
  align-items: center;
  padding: 5px 0;
  font-family: var(--font-mono);
  font-size: 12px;
}
.map-group {
  margin: 0;
  text-align: center;
  text-transform: none;
  letter-spacing: 0.02em;
}
.map-path {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.map-path:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
.map-row-empty .map-path,
.map-row-empty .map-group {
  color: var(--ui-text-dimmed);
}
.map-leader {
  height: 1px;
  border-bottom: 1px dotted var(--console-line);
}
.map-count {
  font-size: 11px;
  text-align: right;
  color: var(--ui-text-dimmed);
}
.map-node {
  width: 7px;
  height: 7px;
  background: repeating-linear-gradient(135deg, var(--console-corner) 0 1px, transparent 1px 3px);
  box-shadow: inset 0 0 0 1px var(--console-corner);
}
.map-node-open {
  background: none;
  box-shadow: inset 0 0 0 1px var(--console-accent);
}
.map-node-none {
  background: none;
  box-shadow: inset 0 0 0 1px var(--console-line);
}
/* The readout runs as tall as the map beside it: its rows share the height, the gauge sits at the bottom. */
.map-readout {
  align-self: stretch;
  display: grid;
  grid-template-rows: 1fr auto;
}
.map-readout > .console-readout-rows {
  grid-auto-rows: minmax(2.5rem, 1fr);
  align-content: stretch;
}
.map-readout > .console-readout-rows > div {
  grid-template-columns: 6.5rem minmax(0, 1fr);
  align-items: center;
}
.map-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.map-dim {
  color: var(--ui-text-dimmed);
}
.map-tip {
  display: grid;
  gap: 2px;
}
.map-link {
  color: var(--ui-text-highlighted);
}
.map-link:hover {
  color: var(--console-accent);
}
.map-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 3px;
}
@media (width < 64rem) {
  .map-subject {
    grid-template-columns: minmax(0, 1fr);
  }
  .map-readout .console-link {
    display: none;
  }
}
</style>
