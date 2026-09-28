<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import { MODES, TOOLS, allPaths, capabilityList, modeList } from "../../utils/harnesses";

const props = defineProps<{ sample: HarnessEntry }>();

const modes = computed(() => modeList(props.sample));
const caps = computed(() => capabilityList(props.sample));
const detection = computed(() => {
  const { envVars, projectMarkers } = props.sample.detection;
  if (envVars.length > 0) return `env ${envVars[0]}, then ${projectMarkers.length} markers`;
  return `${projectMarkers.length} project markers`;
});
</script>

<template>
  <section class="tool-console landing-call" aria-label="One agent tool call">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip :text="`harnesses_info({ id: &quot;${sample.id}&quot; })`">
        <span class="console-title" tabindex="0"
          ><span class="console-tag">Call</span>harnesses_info(<span class="tok-str"
            >"{{ sample.id }}"</span
          >)</span
        >
      </UTooltip>
      <span class="console-meta">{{ TOOLS.length }} tools</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="sample.id" class="console-cursor" />
    </div>

    <!-- The harness it asked about on the crosses grid; the fields the answer carries in the readout. -->
    <div class="call-subject">
      <div :key="sample.id" class="console-scan" aria-hidden="true" />
      <div class="call-identity">
        <ConsoleReticle :key="sample.id" :icon="sample.icon" />
        <div class="call-name">
          <span class="console-label">Tool / read-only</span>
          <h3>{{ sample.name }}</h3>
          <p class="call-note">
            The agent gets the metadata with every path resolved for the machine it runs on.
          </p>
        </div>
      </div>
      <div class="console-readout">
        <dl class="console-readout-rows">
          <div>
            <dt>binaries</dt>
            <dd>
              <span class="call-line">{{ sample.binaries.join(", ") }}</span>
            </dd>
          </div>
          <div>
            <dt>invocationModes</dt>
            <dd :class="modes.length > 0 ? 'console-accent' : 'call-dim'">
              <span class="call-line">{{
                modes.length > 0 ? `${modes.length} of ${MODES.length} true` : "all false"
              }}</span>
            </dd>
          </div>
          <div>
            <dt>capabilities</dt>
            <dd>
              <UTooltip :text="caps.join(', ')">
                <span class="call-line" tabindex="0">{{ caps.join(", ") }}</span>
              </UTooltip>
            </dd>
          </div>
          <div>
            <dt>modelListing</dt>
            <dd :class="{ 'call-dim': !sample.modelListing }">
              <span class="call-line">{{ sample.modelListing !== null }}</span>
            </dd>
          </div>
          <div>
            <dt>detection</dt>
            <dd>
              <span class="call-line">{{ detection }}</span>
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <footer class="console-footer console-footer-plain">
      <span aria-label="Supported hosts: MCP, Pi and OMP">MCP · Pi · OMP</span>
      <span class="console-meta">{{ allPaths(sample).length }} paths resolved</span>
    </footer>
  </section>
</template>

<style scoped>
.call-subject {
  position: relative;
  display: grid;
  gap: 16px;
  padding: 18px 20px 20px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Cpath d='M16 18h4m-2-2v4' fill='none' stroke='%23818a94' stroke-opacity='.1'/%3E%3C/svg%3E");
  background-size: 36px 36px;
  background-position: 24px 20px;
}
.call-subject > :not(.console-scan) {
  position: relative;
}
.call-identity {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
}
.call-name {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.call-name h3 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-sans);
  font-size: 22px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--ui-text-highlighted);
}
.call-note {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.landing-call .console-readout-rows > div {
  grid-template-columns: 8.5rem minmax(0, 1fr);
}
.landing-call .console-readout-rows dt {
  text-transform: none;
  letter-spacing: 0.02em;
}
.call-dim {
  color: var(--ui-text-dimmed);
}
.call-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (width < 400px) {
  .call-subject {
    padding-inline: 14px;
  }
  .call-identity {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
  }
}
</style>
