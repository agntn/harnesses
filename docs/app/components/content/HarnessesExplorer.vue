<script setup lang="ts">
import {
  HARNESSES,
  MODES,
  PATH_GROUPS,
  PLATFORMS,
  buildCommand,
  harnessEntry,
  invocationError,
  modeSpec,
  resolveGroup,
  shellLine,
  type ModeKey,
  type Platform,
} from "../../utils/harnesses";

const route = useRoute();
const router = useRouter();

const id = ref("claude");
const platform = ref<Platform>("linux");
const homeDir = ref("/home/dev");
const projectRoot = ref("/srv/app");
const mode = ref<ModeKey>("advisor");
const model = ref("");
const prompt = ref("Review this patch");

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
    return { group, entries, aside: hidden > 0 ? `${hidden} hidden on ${platform.value}` : undefined };
  }),
);

const built = computed(() =>
  buildCommand(harness.value, mode.value, prompt.value, model.value || undefined),
);

const invokeError = computed(() => invocationError(harness.value, mode.value, model.value));

const tsSnippet = computed(() => {
  const opts = modeSpec(mode.value).fields;
  const modelPart = model.value ? `model: ${JSON.stringify(model.value)}` : "";
  const merged = [opts, modelPart].filter(Boolean).join(", ");
  return `import { getHarness } from "@agntn/harnesses";

const harness = getHarness(${JSON.stringify(harness.value.id)});
const paths = harness.resolve({
  platform: ${JSON.stringify(platform.value)},
  homeDir: ${JSON.stringify(homeDir.value)},
  projectRoot: ${JSON.stringify(projectRoot.value)},
});

const result = await harness.invoke(${JSON.stringify(prompt.value)}${merged ? `, { ${merged} }` : ""});
result.exitCode; // number, or null when stopped`;
});

const cliSnippet = computed(() => {
  const flags: string[] = [];
  if (mode.value === "readOnly" || mode.value === "readOnlyStructured") flags.push("--read-only");
  else if (mode.value === "agent" || mode.value === "agentStructured") flags.push("--tools");
  if (mode.value.endsWith("Structured")) flags.push("--json");
  if (model.value) flags.push(`--model ${model.value}`);
  return `harnesses paths ${harness.value.id} --json
harnesses run ${harness.value.id}${flags.length ? ` ${flags.join(" ")}` : ""} ${JSON.stringify(prompt.value)}`;
});

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

watch([id, platform, homeDir, projectRoot, mode, model, prompt], () => {
  if (!syncing) return;
  void router.replace({
    query: {
      id: id.value,
      platform: platform.value,
      home: homeDir.value,
      root: projectRoot.value,
      mode: mode.value,
      ...(model.value ? { model: model.value } : {}),
      ...(prompt.value !== "Review this patch" ? { prompt: prompt.value } : {}),
    },
  });
});
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
    <aside class="harnesses-frame h-fit overflow-hidden rounded-xl">
      <div class="border-b border-muted px-4 py-3">
        <p class="harnesses-eyebrow">harness</p>
      </div>
      <ul class="max-h-[22rem] overflow-y-auto p-1.5 lg:max-h-none">
        <li v-for="entry in HARNESSES" :key="entry.id">
          <button
            type="button"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
            :class="entry.id === harness.id ? 'harnesses-cell-active text-highlighted' : 'text-muted hover:bg-muted hover:text-highlighted'"
            :aria-pressed="entry.id === harness.id"
            @click="pick(entry.id)"
          >
            <UIcon :name="entry.icon" class="size-4 shrink-0" :class="entry.id === harness.id ? 'text-primary' : ''" />
            <span class="flex-1 truncate">{{ entry.short }}</span>
            <span class="font-mono text-[10px] text-dimmed">{{ entry.id }}</span>
          </button>
        </li>
      </ul>
    </aside>

    <div class="min-w-0 space-y-6">
      <div class="harnesses-frame overflow-hidden rounded-xl">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-muted px-4 py-3">
          <p class="font-mono text-xs text-muted">
            <span class="text-dimmed">resolve</span>
            <span class="ms-2 text-highlighted">{{ harness.name }}</span>
          </p>
          <div class="harnesses-seg" role="group" aria-label="Platform">
            <button
              v-for="entry in PLATFORMS"
              :key="entry.id"
              type="button"
              :aria-pressed="platform === entry.id"
              @click="usePlatformHome(entry.id)"
            >
              {{ entry.label }}
            </button>
          </div>
        </div>
        <div class="grid gap-3 border-b border-muted px-4 py-4 sm:grid-cols-2">
          <label class="block">
            <span class="harnesses-eyebrow mb-2">homeDir</span>
            <input v-model="homeDir" class="harnesses-field font-mono text-[13px]" spellcheck="false" />
          </label>
          <label class="block">
            <span class="harnesses-eyebrow mb-2">projectRoot</span>
            <input v-model="projectRoot" class="harnesses-field font-mono text-[13px]" spellcheck="false" />
          </label>
        </div>
        <div class="divide-y divide-muted">
          <HarnessPathList v-for="row in groups" :key="row.group" :group="row.group" :entries="row.entries" :aside="row.aside" />
        </div>
      </div>

      <div class="harnesses-frame overflow-hidden rounded-xl">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-muted px-4 py-3">
          <p class="font-mono text-xs text-muted">
            <span class="text-dimmed">invoke</span>
            <span class="ms-2 text-highlighted">{{ harness.invocation ? (harness.invocation.binary ?? harness.binaries[0]) : "no headless mode" }}</span>
          </p>
          <p class="font-mono text-[11px] text-dimmed">
            {{ MODES.filter((m) => harness.invocationModes[m.key]).length }} of {{ MODES.length }} modes
          </p>
        </div>
        <div class="grid gap-3 border-b border-muted px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
          <label class="block">
            <span class="harnesses-eyebrow mb-2">mode</span>
            <select v-model="mode" class="harnesses-field text-[13px]">
              <option v-for="entry in MODES" :key="entry.key" :value="entry.key">
                {{ entry.label }}{{ harness.invocationModes[entry.key] ? "" : " (rejected)" }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="harnesses-eyebrow mb-2">model</span>
            <input v-model="model" class="harnesses-field font-mono text-[13px]" placeholder="optional" spellcheck="false" />
          </label>
          <label class="block">
            <span class="harnesses-eyebrow mb-2">prompt</span>
            <input v-model="prompt" class="harnesses-field text-[13px]" />
          </label>
        </div>
        <div class="divide-y divide-muted">
          <div class="px-4 py-3.5">
            <p class="harnesses-eyebrow mb-2">{{ built ? "spawned" : "rejected before spawn" }}</p>
            <pre class="harnesses-tool"><code>{{ built ? shellLine(built) : invokeError }}</code></pre>
          </div>
          <div class="grid sm:grid-cols-2">
            <div class="border-b border-muted sm:border-r sm:border-b-0">
              <p class="harnesses-eyebrow px-4 pt-3.5">TypeScript</p>
              <CodeSnippet :code="tsSnippet" lang="ts" />
            </div>
            <div>
              <p class="harnesses-eyebrow px-4 pt-3.5">CLI</p>
              <CodeSnippet :code="cliSnippet" lang="shell" />
            </div>
          </div>
        </div>
      </div>

      <div class="harnesses-frame overflow-hidden rounded-xl">
        <div class="border-b border-muted px-4 py-3">
          <p class="font-mono text-xs text-muted">
            <span class="text-dimmed">detection</span>
            <span class="ms-2 text-highlighted">{{ harness.detection.envVars.length > 0 ? "env, then project" : "project markers only" }}</span>
          </p>
        </div>
        <HarnessDetection :detection="harness.detection" />
      </div>
    </div>
  </div>
</template>
