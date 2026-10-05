<script setup lang="ts">
import {
  HARNESSES,
  MODES,
  PATH_GROUPS,
  PLATFORMS,
  buildCommand,
  harnessEntry,
  invocationError,
  modeList,
  modeSpec,
  resolveGroup,
  shellLine,
  type ModeKey,
} from "../../utils/harnesses";
import type { Platform } from "#shared/types/registry";
import { shellTokens, tokens } from "../../utils/tokens";

const route = useRoute();
const router = useRouter();

const DEFAULT_PROMPT = "Review this patch";

const id = ref("claude");
const platform = ref<Platform>("linux");
const homeDir = ref("/home/dev");
const projectRoot = ref("/srv/app");
const mode = ref<ModeKey>("advisor");
const model = ref("");
const effort = ref("");
const prompt = ref(DEFAULT_PROMPT);

const harness = computed(() => harnessEntry(id.value) ?? HARNESSES[0]!);

const options = computed(() => ({
  platform: platform.value,
  homeDir: homeDir.value,
  projectRoot: projectRoot.value,
}));

const groups = computed(() =>
  PATH_GROUPS.map((group) => {
    const entries = resolveGroup(harness.value[group], options.value);
    const hidden = harness.value[group].length - entries.length;
    return {
      group,
      entries,
      aside: hidden > 0 ? `${hidden} hidden on ${platform.value}` : undefined,
    };
  }),
);
const shownPaths = computed(() => groups.value.reduce((sum, row) => sum + row.entries.length, 0));

const built = computed(() =>
  buildCommand(
    harness.value,
    mode.value,
    prompt.value,
    model.value || undefined,
    effort.value || undefined,
  ),
);
const spawned = computed(() => (built.value ? shellLine(built.value) : null));
const invokeError = computed(() =>
  invocationError(harness.value, mode.value, model.value, effort.value),
);
const effortPlaceholder = computed(() =>
  harness.value.invocation?.effortArgs ? "optional, low keeps it quick" : "no flag for it here",
);

const modeItems = computed(() =>
  MODES.map((entry) => ({
    label: `${entry.label}${harness.value.invocationModes[entry.key] ? "" : " (rejected)"}`,
    value: entry.key,
  })),
);

const tsLines = computed(() => {
  const opts = modeSpec(mode.value).fields;
  const modelPart = model.value ? `model: ${JSON.stringify(model.value)}` : "";
  const effortPart = effort.value ? `effort: ${JSON.stringify(effort.value)}` : "";
  const merged = [opts, modelPart, effortPart].filter(Boolean).join(", ");
  return [
    'import { getHarness } from "@agntn/harnesses";',
    "",
    `const harness = getHarness(${JSON.stringify(harness.value.id)});`,
    "const paths = harness.resolve({",
    `  platform: ${JSON.stringify(platform.value)},`,
    `  homeDir: ${JSON.stringify(homeDir.value)},`,
    `  projectRoot: ${JSON.stringify(projectRoot.value)},`,
    "});",
    "",
    `const result = await harness.invoke(${JSON.stringify(prompt.value)}${merged ? `, { ${merged} }` : ""});`,
    "result.exitCode; // number, or null when stopped",
  ];
});

const cliLines = computed(() => {
  const flags: string[] = [];
  if (mode.value === "readOnly" || mode.value === "readOnlyStructured") flags.push("--read-only");
  else if (mode.value === "agent" || mode.value === "agentStructured") flags.push("--tools");
  if (mode.value.endsWith("Structured")) flags.push("--json");
  if (model.value) flags.push(`--model ${model.value}`);
  if (effort.value) flags.push(`--effort ${effort.value}`);
  return [
    `harnesses paths ${harness.value.id} --json`,
    `harnesses run ${harness.value.id}${flags.length ? ` ${flags.join(" ")}` : ""} ${JSON.stringify(prompt.value)}`,
  ];
});

const { copied, copy } = useCopied();

function pick(next: string) {
  const entry = harnessEntry(next);
  if (entry) id.value = entry.id;
}

function usePlatformHome(next: Platform) {
  const previous = PLATFORMS.find((entry) => entry.id === platform.value);
  platform.value = next;
  const target = PLATFORMS.find((entry) => entry.id === next);
  if (target && (!previous || homeDir.value === previous.home)) homeDir.value = target.home;
}

function readQuery() {
  const query = route.query;
  if (typeof query.id === "string") pick(query.id);
  if (typeof query.platform === "string" && PLATFORMS.some((p) => p.id === query.platform)) {
    usePlatformHome(query.platform as Platform);
  }
  if (typeof query.home === "string" && query.home) homeDir.value = query.home;
  if (typeof query.root === "string" && query.root) projectRoot.value = query.root;
  if (typeof query.mode === "string" && MODES.some((m) => m.key === query.mode)) {
    mode.value = query.mode as ModeKey;
  }
  if (typeof query.model === "string") model.value = query.model;
  if (typeof query.effort === "string") effort.value = query.effort;
  if (typeof query.prompt === "string" && query.prompt) prompt.value = query.prompt;
}

let syncing = false;

onMounted(() => {
  if (Object.keys(route.query).length > 0) {
    readQuery();
  } else {
    /** A prerendered page hydrates with an empty query; Nuxt restores the address afterwards. */
    const stop = watch(
      () => route.query,
      (query) => {
        if (Object.keys(query).length > 0) readQuery();
        stop();
      },
    );
  }
  syncing = true;
});

watch([id, platform, homeDir, projectRoot, mode, model, effort, prompt], () => {
  if (!syncing) return;
  void router.replace({
    query: {
      id: id.value,
      platform: platform.value,
      home: homeDir.value,
      root: projectRoot.value,
      mode: mode.value,
      ...(model.value ? { model: model.value } : {}),
      ...(effort.value ? { effort: effort.value } : {}),
      ...(prompt.value !== DEFAULT_PROMPT ? { prompt: prompt.value } : {}),
    },
  });
});
</script>

<template>
  <div class="explorer">
    <!-- Request: which harness, which platform and roots. Every change lands in the address. -->
    <section class="tool-console console-wide" aria-label="Harness and platform">
      <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
      <span class="console-cross console-cross-br" aria-hidden="true">+</span>
      <header class="console-bar">
        <UTooltip
          :text="`getHarness(&quot;${harness.id}&quot;).resolve({ platform: &quot;${platform}&quot;, homeDir, projectRoot })`"
        >
          <span class="console-title explorer-title" tabindex="0"
            ><span class="console-tag">Call</span>getHarness(<span class="tok-str"
              >"{{ harness.id }}"</span
            >).resolve(…)</span
          >
        </UTooltip>
        <span class="console-meta">{{ HARNESSES.length }} harnesses</span>
        <span class="console-mark" aria-hidden="true" />
      </header>
      <div class="console-ruler" aria-hidden="true">
        <span :key="`${harness.id}-${platform}`" class="console-cursor" />
      </div>

      <div class="harnesses-band explorer-request">
        <div class="explorer-glyph" aria-hidden="true">
          <ConsoleReticle :key="harness.id" :icon="harness.icon" />
        </div>
        <div class="explorer-fields">
          <div class="console-readout">
            <dl class="console-readout-rows">
              <div>
                <dt>Harness</dt>
                <dd class="console-accent">{{ harness.name }} · {{ harness.id }}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd class="explorer-chips" role="group" aria-label="Platform">
                  <UButton
                    v-for="entry in PLATFORMS"
                    :key="entry.id"
                    :color="platform === entry.id ? 'primary' : 'neutral'"
                    variant="chip"
                    :label="entry.label"
                    :aria-pressed="platform === entry.id"
                    @click="usePlatformHome(entry.id)"
                  />
                </dd>
              </div>
              <div>
                <dt><label for="explorer-home">homeDir</label></dt>
                <dd>
                  <UInput
                    id="explorer-home"
                    v-model="homeDir"
                    variant="none"
                    spellcheck="false"
                    autocomplete="off"
                    class="w-full"
                  />
                </dd>
              </div>
              <div>
                <dt><label for="explorer-root">projectRoot</label></dt>
                <dd>
                  <UInput
                    id="explorer-root"
                    v-model="projectRoot"
                    variant="none"
                    spellcheck="false"
                    autocomplete="off"
                    class="w-full"
                  />
                </dd>
              </div>
            </dl>
          </div>
          <div class="explorer-picks" role="group" aria-label="Harness">
            <UButton
              v-for="entry in HARNESSES"
              :key="entry.id"
              :color="entry.id === harness.id ? 'primary' : 'neutral'"
              variant="chip"
              :icon="entry.icon"
              :label="entry.short"
              :aria-pressed="entry.id === harness.id"
              @click="pick(entry.id)"
            />
          </div>
        </div>
      </div>

      <footer class="console-footer console-footer-plain">
        <NuxtLink :to="harness.to" class="explorer-link"
          ><span aria-hidden="true">→ </span>{{ harness.name }} page</NuxtLink
        >
        <span class="console-meta">every state is a link</span>
      </footer>
    </section>

    <ConsolePanel
      tag="List"
      title="paths"
      :meta="`${shownPaths} on ${platform}`"
      label="Resolved paths"
    >
      <template #title
        >paths <span class="harnesses-dim">· {{ harness.name }}</span></template
      >
      <template #cursor
        ><span :key="`${harness.id}-${platform}`" class="console-cursor"
      /></template>
      <HarnessPathList
        v-for="row in groups"
        :key="row.group"
        :group="row.group"
        :entries="row.entries"
        :aside="row.aside"
      />
    </ConsolePanel>

    <ConsolePanel
      tag="Call"
      title="invoke"
      :meta="`${modeList(harness).length} of ${MODES.length} modes`"
      label="Invocation"
    >
      <template #title
        >invoke(<span class="tok-str">{{ JSON.stringify(prompt) }}</span
        >, {{ modeSpec(mode).options }})</template
      >
      <template #cursor><span :key="`${harness.id}-${mode}`" class="console-cursor" /></template>
      <div class="harnesses-band">
        <div class="console-readout">
          <dl class="console-readout-rows explorer-invoke-rows">
            <div>
              <dt><label for="explorer-mode">mode</label></dt>
              <dd>
                <USelectMenu
                  id="explorer-mode"
                  aria-label="Invocation mode"
                  v-model="mode"
                  :items="modeItems"
                  value-key="value"
                  variant="none"
                  :search-input="false"
                  class="w-full"
                />
              </dd>
            </div>
            <div>
              <dt><label for="explorer-model">model</label></dt>
              <dd>
                <UInput
                  id="explorer-model"
                  v-model="model"
                  variant="none"
                  placeholder="optional"
                  spellcheck="false"
                  autocomplete="off"
                  class="w-full"
                />
              </dd>
            </div>
            <div>
              <dt><label for="explorer-effort">effort</label></dt>
              <dd>
                <UInput
                  id="explorer-effort"
                  v-model="effort"
                  variant="none"
                  :placeholder="effortPlaceholder"
                  spellcheck="false"
                  autocomplete="off"
                  class="w-full"
                />
              </dd>
            </div>
            <div>
              <dt><label for="explorer-prompt">prompt</label></dt>
              <dd>
                <UInput id="explorer-prompt" v-model="prompt" variant="none" class="w-full" />
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div class="harnesses-band">
        <p class="console-label console-rule-title">
          <span>{{ spawned ? "Spawned" : "Rejected before spawn" }}</span>
          <span class="console-mark" aria-hidden="true" />
          <UButton
            v-if="spawned"
            color="neutral"
            variant="subtle"
            :icon="copied === 'spawned' ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied === 'spawned' ? 'copied' : 'copy'"
            :aria-label="copied === 'spawned' ? 'Copied' : 'Copy the command line'"
            @click="copy('spawned', spawned)"
          />
        </p>
        <!-- prettier-ignore -->
        <pre v-if="spawned" class="console-snippet explorer-wrap"><code><span v-for="(token, part) in shellTokens(spawned)" :key="part" :class="token.cls">{{ token.text }}</span></code></pre>
        <p v-else class="harnesses-error">
          <span class="console-tag">Error</span><span>{{ invokeError }}</span>
        </p>
      </div>
      <div class="harnesses-band explorer-snippets">
        <div>
          <p class="console-label console-rule-title">
            <span>TypeScript <span aria-hidden="true">[ library ]</span></span>
            <span class="console-mark" aria-hidden="true" />
            <UButton
              color="neutral"
              variant="subtle"
              :icon="copied === 'ts' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'ts' ? 'copied' : 'copy'"
              :aria-label="copied === 'ts' ? 'Copied' : 'Copy the TypeScript'"
              @click="copy('ts', tsLines.join('\n'))"
            />
          </p>
          <!-- prettier-ignore -->
          <pre class="console-snippet console-lines explorer-wrap"><code><span v-for="(line, index) in tsLines" :key="index"><span v-for="(token, part) in tokens(line)" :key="part" :class="token.cls">{{ token.text }}</span></span></code></pre>
        </div>
        <div>
          <p class="console-label console-rule-title">
            <span>CLI <span aria-hidden="true">[ harnesses ]</span></span>
            <span class="console-mark" aria-hidden="true" />
            <UButton
              color="neutral"
              variant="subtle"
              :icon="copied === 'cli' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'cli' ? 'copied' : 'copy'"
              :aria-label="copied === 'cli' ? 'Copied' : 'Copy the CLI lines'"
              @click="copy('cli', cliLines.join('\n'))"
            />
          </p>
          <!-- prettier-ignore -->
          <pre class="console-snippet console-lines explorer-wrap"><code><span v-for="(line, index) in cliLines" :key="index"><span v-for="(token, part) in shellTokens(line)" :key="part" :class="token.cls">{{ token.text }}</span></span></code></pre>
        </div>
      </div>
    </ConsolePanel>

    <ConsolePanel
      tag="Call"
      title="detectHarness()"
      :meta="harness.detection.envVars.length > 0 ? 'env, then project' : 'project markers only'"
      label="Detection"
    >
      <HarnessDetection :detection="harness.detection" />
    </ConsolePanel>
  </div>
</template>

<style scoped>
.explorer {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 28px;
}
.explorer > :deep(.console-panel) {
  margin-block: 0;
}
.explorer-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.explorer-request {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}
.explorer-glyph {
  width: 84px;
}
.explorer-fields {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.explorer-fields .console-readout-rows > div,
.explorer-invoke-rows > div {
  grid-template-columns: 7.5rem minmax(0, 1fr);
  align-items: center;
}
.explorer-fields .console-readout-rows dt,
.explorer-invoke-rows dt {
  text-transform: none;
  letter-spacing: 0.02em;
}
.explorer-chips,
.explorer-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.explorer-wrap {
  margin: 0;
  overflow-wrap: anywhere;
}
.explorer-snippets {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 20px 28px;
}
.explorer-snippets .console-rule-title {
  margin: 0 0 10px;
}
.harnesses-band > .console-rule-title + .harnesses-error,
.harnesses-band > .console-rule-title + pre {
  margin-top: 0;
}
.explorer-link {
  color: var(--ui-text-highlighted);
}
.explorer-link:hover {
  color: var(--console-accent);
}
.explorer-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 3px;
}
@media (width < 56rem) {
  .explorer-snippets {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (width < 640px) {
  .explorer-request {
    grid-template-columns: minmax(0, 1fr);
  }
  .explorer-glyph {
    display: none;
  }
  .explorer-fields .console-readout-rows > div,
  .explorer-invoke-rows > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
</style>
