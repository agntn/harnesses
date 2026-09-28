<script setup lang="ts">
import { MODES, PATH_GROUPS, allPaths, harnessEntry } from "../../utils/harnesses";

const props = defineProps<{ id: string }>();

const harness = computed(() => harnessEntry(props.id));

const groups = computed(() =>
  harness.value
    ? PATH_GROUPS.map((group) => ({ group, entries: harness.value![group] })).filter(
        (row) => row.entries.length > 0,
      )
    : [],
);

const emptyGroups = computed(() =>
  harness.value ? PATH_GROUPS.filter((group) => harness.value![group].length === 0) : [],
);

const modes = computed(() =>
  harness.value
    ? MODES.map((mode) => {
        const template = harness.value!.invocation?.[mode.template];
        return { ...mode, template: Array.isArray(template) ? template.join(" ") : null };
      })
    : [],
);
const supported = computed(() => modes.value.filter((mode) => mode.template).length);
</script>

<template>
  <div v-if="harness">
    <ProseH2 id="capabilities">Capabilities and invocation</ProseH2>
    <ul class="sheet-caps not-prose" aria-label="Capabilities">
      <li v-for="(value, key) in harness.capabilities" :key="key">
        <UBadge
          color="neutral"
          :variant="value ? 'subtle' : 'outline'"
          :label="`${key}: ${value ? 'yes' : 'no'}`"
        />
      </li>
    </ul>
    <template v-if="harness.invocation">
      <ProseP>
        Binary <ProseCode>{{ harness.invocation.binary ?? harness.binaries[0] }}</ProseCode
        >, evidence <ProseCode>{{ harness.invocation.level }}</ProseCode
        >.
        <template v-if="harness.invocation.note">{{ harness.invocation.note }} </template>
        <template v-if="harness.invocation.modelArgs">
          Model selection appends
          <ProseCode>{{ harness.invocation.modelArgs.join(" ") }}</ProseCode
          >.
        </template>
        <template v-else
          >No model selection: a <ProseCode>model</ProseCode> option is rejected.</template
        >
      </ProseP>
      <ConsolePanel
        tag="Call"
        :title="`invoke(prompt, options)`"
        :meta="`${supported} of ${MODES.length} modes`"
        label="Invocation templates"
      >
        <ul class="harnesses-rows sheet-modes">
          <li v-for="mode in modes" :key="mode.key" :class="{ 'sheet-mode-off': !mode.template }">
            <span class="sheet-mode">
              <span class="sheet-mode-label">{{ mode.label }}</span>
              <span class="harnesses-dim">{{ mode.options }}</span>
            </span>
            <code v-if="mode.template" class="sheet-template">{{ mode.template }}</code>
            <span v-else class="harnesses-dim">rejected</span>
          </li>
        </ul>
      </ConsolePanel>
    </template>
    <ProseP v-else>
      No non-interactive invocation is recorded, so <ProseCode>invoke()</ProseCode> rejects before
      spawning anything and every invocation mode reports <ProseCode>false</ProseCode>.
    </ProseP>
    <ProseP v-if="harness.modelListing">
      Model listing runs
      <ProseCode>{{ harness.binaries[0] }} {{ harness.modelListing.args.join(" ") }}</ProseCode
      ><template v-if="harness.modelListing.searchArgs">
        and <ProseCode>{{ harness.modelListing.searchArgs.join(" ") }}</ProseCode> with a
        filter</template
      ><template v-else>, and a filter matches the ids locally</template>.
      {{ harness.modelListing.note }}
    </ProseP>

    <ProseH2 id="paths">Paths</ProseH2>
    <ProseP>
      Templates as the registry stores them. <ProseCode>~</ProseCode>,
      <ProseCode>${HOME}</ProseCode>, <ProseCode>${TMPDIR}</ProseCode> and
      <ProseCode>%VAR%</ProseCode> expand in <ProseCode>resolve()</ProseCode>; entries tagged with a
      platform are dropped on the others.
      <ProseA :href="`/explorer?id=${harness.id}`">Open in the explorer</ProseA> to see them
      expanded for a home directory of your choice.
    </ProseP>
    <ConsolePanel
      tag="Paths"
      :title="`getHarness(&quot;${harness.id}&quot;)`"
      :meta="`${allPaths(harness).length} templates · ${groups.length} groups`"
      label="Path templates"
    >
      <HarnessPathList
        v-for="row in groups"
        :key="row.group"
        :group="row.group"
        :entries="row.entries"
        platforms
      />
      <div v-if="emptyGroups.length > 0" class="harnesses-band">
        <p class="console-label console-rule-title">
          <span>Empty <span aria-hidden="true">[ no known location ]</span></span>
          <span class="console-mark" aria-hidden="true" />
        </p>
        <p class="sheet-empty">
          <code v-for="group in emptyGroups" :key="group" class="sheet-empty-name">{{
            group
          }}</code>
          <span>That is not the same as the feature being missing.</span>
        </p>
      </div>
    </ConsolePanel>

    <template v-if="harness.envOverrides.length > 0">
      <ProseH3 id="env-overrides">Env overrides</ProseH3>
      <ProseP>
        Variables the harness reads to move a root. The path is the default while the variable is
        unset; <ProseCode>resolve()</ProseCode> applies a set one to <ProseCode>temp</ProseCode>.
      </ProseP>
      <ConsolePanel
        tag="Env"
        title="envOverrides"
        :meta="`${harness.envOverrides.length} variables`"
        label="Env overrides"
      >
        <ul class="harnesses-rows sheet-env">
          <li v-for="item in harness.envOverrides" :key="`${item.variable}-${item.path}`">
            <code class="sheet-var">{{ item.variable }}</code>
            <code class="sheet-default">{{ item.path }}</code>
            <span class="sheet-relocates"
              >{{ item.relocates.join(" · ")
              }}<template v-if="item.platforms"> · {{ item.platforms.join(", ") }}</template></span
            >
            <p v-if="item.note" class="sheet-note">{{ item.note }}</p>
          </li>
        </ul>
      </ConsolePanel>
    </template>

    <ProseH2 id="mcp">MCP servers</ProseH2>
    <ConsolePanel
      v-if="harness.mcpConfigs.length > 0"
      tag="File"
      title="mcpConfigs"
      :meta="`${harness.mcpConfigs.length} ${harness.mcpConfigs.length === 1 ? 'file' : 'files'}`"
      label="MCP config files"
    >
      <ul class="harnesses-rows sheet-mcp">
        <li v-for="file in harness.mcpConfigs" :key="file.path">
          <code class="sheet-var">{{ file.path }}</code>
          <span class="sheet-relocates"
            >{{ file.scope }} · {{ file.format }} · {{ file.dialect }} ·
            {{ file.key.join(".") }}</span
          >
        </li>
      </ul>
    </ConsolePanel>
    <ProseP v-else>
      No MCP config file is mapped, so <ProseCode>listMcpServers</ProseCode> returns nothing for it
      and <ProseCode>syncMcpServers</ProseCode> skips it.
    </ProseP>

    <ProseH2 id="detection">Detection</ProseH2>
    <ConsolePanel
      tag="Call"
      title="detectHarness()"
      :meta="harness.detection.envVars.length > 0 ? 'env, then project' : 'project markers only'"
      label="Detection markers"
    >
      <HarnessDetection :detection="harness.detection" />
    </ConsolePanel>

    <ProseH2 id="persistence">Persistence</ProseH2>
    <ProseUl>
      <ProseLi v-for="item in harness.persistence" :key="`${item.format}-${item.note}`">
        <ProseStrong>{{ item.format }}</ProseStrong
        ><template v-if="item.note"> - {{ item.note }}</template>
        <span class="text-dimmed"> ({{ item.level }})</span>
      </ProseLi>
    </ProseUl>
    <ProseP v-if="harness.agentsFile">
      <ProseCode>syncAgentsFiles</ProseCode> links <ProseCode>{{ harness.agentsFile }}</ProseCode>
      to the master bundle.
    </ProseP>
    <ProseP v-else>
      No stable user-scope instructions file, so <ProseCode>syncAgentsFiles</ProseCode> skips this
      harness.
    </ProseP>
  </div>
</template>

<style scoped>
.sheet-caps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 16px 0;
  padding: 0;
  list-style: none;
}
.sheet-modes > li {
  grid-template-columns: 11rem minmax(0, 1fr);
}
.sheet-mode {
  display: grid;
  gap: 2px;
}
.sheet-mode-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-highlighted);
}
.sheet-mode-off .sheet-mode-label {
  color: var(--ui-text-dimmed);
}
.sheet-template {
  font-size: 13px;
  overflow-wrap: anywhere;
  color: var(--ui-text-highlighted);
}
.sheet-env > li,
.sheet-mcp > li {
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
}
.sheet-var {
  font-size: 13px;
  overflow-wrap: anywhere;
  color: var(--ui-text-highlighted);
}
.sheet-default {
  font-size: 13px;
  overflow-wrap: anywhere;
  color: var(--ui-text-muted);
}
.sheet-relocates {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-align: right;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}
.sheet-mcp > li {
  grid-template-columns: minmax(0, 1fr) auto;
}
.sheet-note {
  grid-column: 1 / -1;
  margin: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.55;
  color: var(--ui-text-muted);
}
.sheet-empty {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--ui-text-muted);
}
.sheet-empty-name {
  padding: 1px 7px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
@media (width < 640px) {
  .sheet-modes > li,
  .sheet-env > li,
  .sheet-mcp > li {
    grid-template-columns: minmax(0, 1fr);
  }
  .sheet-relocates {
    text-align: left;
  }
}
</style>
