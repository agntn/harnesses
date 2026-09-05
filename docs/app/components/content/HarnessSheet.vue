<script setup lang="ts">
import { MODES, PATH_GROUPS, harnessEntry } from "../../utils/harnesses";

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
</script>

<template>
  <div v-if="harness">
    <ProseH2 id="capabilities">Capabilities and invocation</ProseH2>
    <p class="not-prose flex flex-wrap gap-1.5">
      <span
        v-for="(value, key) in harness.capabilities"
        :key="key"
        class="harnesses-chip"
        :class="{ 'harnesses-chip-ok': value }"
        >{{ key }}: {{ value ? "yes" : "no" }}</span
      >
    </p>
    <template v-if="harness.invocation">
      <ProseP>
        Binary <ProseCode>{{ harness.invocation.binary ?? harness.binaries[0] }}</ProseCode>,
        evidence <ProseCode>{{ harness.invocation.level }}</ProseCode>.
        <template v-if="harness.invocation.note">{{ harness.invocation.note }} </template>
        <template v-if="harness.invocation.modelArgs">
          Model selection appends
          <ProseCode>{{ harness.invocation.modelArgs.join(" ") }}</ProseCode>.
        </template>
        <template v-else>No model selection: a <ProseCode>model</ProseCode> option is rejected.</template>
      </ProseP>
      <div class="harnesses-frame not-prose my-5 divide-y divide-muted overflow-hidden rounded-xl">
        <div
          v-for="mode in modes"
          :key="mode.key"
          class="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]"
        >
          <div>
            <p class="font-mono text-[11px] tracking-[0.08em] uppercase" :class="mode.template ? 'text-primary' : 'text-dimmed'">
              {{ mode.label }}
            </p>
            <p class="font-mono text-[11px] text-dimmed">{{ mode.options }}</p>
          </div>
          <code v-if="mode.template" class="font-mono text-[13px] break-all text-highlighted">{{ mode.template }}</code>
          <span v-else class="font-mono text-[11px] text-dimmed">rejected</span>
        </div>
      </div>
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
      >. {{ harness.modelListing.note }}
    </ProseP>

    <ProseH2 id="paths">Paths</ProseH2>
    <ProseP>
      Templates as the registry stores them. <ProseCode>~</ProseCode>,
      <ProseCode>${HOME}</ProseCode> and <ProseCode>%VAR%</ProseCode> expand in
      <ProseCode>resolve()</ProseCode>; entries tagged with a platform are dropped on the others.
      <ProseA :href="`/explorer?id=${harness.id}`">Open in the explorer</ProseA> to see them
      expanded for a home directory of your choice.
    </ProseP>
    <div class="harnesses-frame not-prose my-5 divide-y divide-muted overflow-hidden rounded-xl">
      <HarnessPathList v-for="row in groups" :key="row.group" :group="row.group" :entries="row.entries" platforms />
      <div v-if="emptyGroups.length > 0" class="px-4 py-3.5">
        <p class="harnesses-eyebrow mb-2">empty</p>
        <p class="text-xs text-muted">
          <code v-for="group in emptyGroups" :key="group" class="me-2 font-mono text-[13px] text-highlighted">{{ group }}</code>
          No known location. That is not the same as the feature being missing.
        </p>
      </div>
    </div>

    <ProseH2 id="mcp">MCP servers</ProseH2>
    <div v-if="harness.mcpConfigs.length > 0" class="harnesses-frame not-prose my-5 divide-y divide-muted overflow-hidden rounded-xl">
      <div v-for="file in harness.mcpConfigs" :key="file.path" class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3">
        <code class="font-mono text-[13px] break-all text-highlighted">{{ file.path }}</code>
        <span class="font-mono text-[10px] tracking-[0.08em] text-dimmed uppercase">{{ file.scope }} · {{ file.format }} · {{ file.dialect }} · {{ file.key.join(".") }}</span>
      </div>
    </div>
    <ProseP v-else>
      No MCP config file is mapped, so <ProseCode>listMcpServers</ProseCode> returns nothing for it
      and <ProseCode>syncMcpServers</ProseCode> skips it.
    </ProseP>

    <ProseH2 id="detection">Detection</ProseH2>
    <div class="harnesses-frame not-prose my-5 overflow-hidden rounded-xl">
      <HarnessDetection :detection="harness.detection" />
    </div>

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
