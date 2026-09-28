<script setup lang="ts">
import {
  HARNESSES,
  LIBRARY_VERSION,
  MODES,
  allPaths,
  harnessEntry,
  modeList,
  userMcpConfig,
} from "../../utils/harnesses";
import { filePosition } from "../../utils/format";

const props = defineProps<{ id: string }>();

const harness = computed(() => harnessEntry(props.id));
const position = computed(() => HARNESSES.findIndex((entry) => entry.id === props.id));
const modes = computed(() => (harness.value ? modeList(harness.value) : []));
const paths = computed(() => (harness.value ? allPaths(harness.value) : []));
const inferred = computed(() => paths.value.filter((entry) => entry.level === "inferred").length);
const mcp = computed(() => (harness.value ? userMcpConfig(harness.value) : undefined));
</script>

<template>
  <section
    v-if="harness"
    class="tool-console console-wide not-prose my-6"
    aria-label="Harness record"
  >
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title"
        ><span class="console-tag">ID</span>{{ harness.id
        }}<span class="console-file">{{ filePosition(position, HARNESSES.length) }}</span></span
      >
      <span class="console-meta"
        >{{ paths.length }} paths ·
        {{ harness.detection.envVars.length > 0 ? "env + project" : "project" }}</span
      >
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true"><span class="console-cursor" /></div>

    <div class="console-band console-subject-band">
      <div class="console-scan" aria-hidden="true" />
      <div class="console-identity-block">
        <ConsoleReticle :key="harness.id" :icon="harness.icon" />
        <div class="console-name">
          <span class="console-label">Harness</span>
          <h3>{{ harness.name }}</h3>
          <ul class="facts-aliases" aria-label="Binaries">
            <li v-for="binary in harness.binaries" :key="binary">
              <span class="facts-alias">{{ binary }}</span>
            </li>
          </ul>
          <p class="console-about">{{ harness.blurb }}</p>
        </div>
      </div>

      <div class="console-readout facts-readout">
        <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
          <circle cx="3" cy="12" r="2.5" />
          <path d="M5.5 12H14L22 20H32" />
        </svg>
        <dl class="console-readout-rows">
          <div>
            <dt>Invoke</dt>
            <dd :class="modes.length > 0 ? 'console-accent' : 'facts-dim'">
              {{
                modes.length > 0
                  ? `${modes.length} of ${MODES.length} · ${harness.invocation?.level}`
                  : "no headless mode"
              }}
            </dd>
          </div>
          <div>
            <dt>Models</dt>
            <dd :class="{ 'facts-dim': !harness.modelListing }">
              {{ harness.modelListing ? "native listing" : "no listing" }}
            </dd>
          </div>
          <div>
            <dt>MCP</dt>
            <dd :class="{ 'facts-dim': !mcp }">
              {{ mcp ? `${mcp.format} · ${mcp.dialect}` : "not mapped" }}
            </dd>
          </div>
          <div>
            <dt>Agents file</dt>
            <dd :class="{ 'facts-dim': !harness.agentsFile }">
              <UTooltip v-if="harness.agentsFile" :text="harness.agentsFile">
                <span class="facts-line" tabindex="0">{{ harness.agentsFile }}</span>
              </UTooltip>
              <span v-else class="facts-line">none stable</span>
            </dd>
          </div>
        </dl>
        <div class="console-gauge">
          <span class="console-ticks">
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

    <div class="console-band">
      <p class="console-label console-rule-title">
        <span>Access <span aria-hidden="true">[ library · CLI · explorer ]</span></span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <dl class="facts-access">
        <dd class="console-lead">
          <span class="console-tag">Get</span>
          <code class="facts-code"
            ><span class="tok-fn">getHarness</span>(<span class="tok-str">"{{ harness.id }}"</span
            >)</code
          >
          <span class="console-leader" aria-hidden="true" />
        </dd>
        <dd class="console-lead">
          <span class="console-tag">CLI</span>
          <code class="facts-code"
            ><span class="tok-fn">harnesses</span> paths {{ harness.id }}
            <span class="tok-kw">--json</span></code
          >
          <span class="console-leader" aria-hidden="true" />
        </dd>
        <dd class="console-lead">
          <span class="console-tag">Try</span>
          <NuxtLink :to="{ path: '/explorer', query: { id: harness.id } }"
            >{{ harness.id }}<span class="facts-dim"> in the explorer</span></NuxtLink
          >
          <span class="console-leader" aria-hidden="true" />
        </dd>
      </dl>
    </div>

    <footer class="console-footer console-footer-plain">
      <ul class="console-links">
        <li>
          <NuxtLink to="/harnesses"><span aria-hidden="true">→ </span>All harnesses</NuxtLink>
        </li>
      </ul>
      <span class="console-meta">registry v{{ LIBRARY_VERSION }} · no network</span>
    </footer>
  </section>
</template>

<style scoped>
/* Values stay on one line whatever the harness; a long one ends in an ellipsis with the whole in a tooltip. */
.facts-readout .console-readout-rows > div {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
.facts-readout .console-readout-rows dd {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.facts-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.facts-line:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
.facts-aliases {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 10px;
  padding: 0;
  list-style: none;
}
.facts-alias {
  display: inline-flex;
  padding: 1px 7px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.facts-dim {
  color: var(--ui-text-dimmed);
}
.console-lead > a:hover .facts-dim {
  color: inherit;
}
.facts-code {
  font: inherit;
  color: var(--ui-text-highlighted);
}
.facts-access {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: 0 28px;
  margin: 0;
}
.facts-access > .console-lead {
  margin: 0 0 8px;
  flex-wrap: nowrap;
  min-width: 0;
}
.facts-access .facts-code,
.facts-access .console-lead > a {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
@media (width < 640px) {
  .facts-access .console-leader {
    display: none;
  }
}
</style>
