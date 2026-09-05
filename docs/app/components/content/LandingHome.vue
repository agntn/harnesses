<script setup lang="ts">
import { HARNESSES, PLATFORMS, TOOLS, countPaths } from "../../utils/harnesses";

const { samples, tick, paused, current, step } = useLandingHarness();

const pathTotal = HARNESSES.reduce((sum, harness) => sum + countPaths(harness), 0);
const headless = HARNESSES.filter((harness) => harness.invocation !== null).length;

const stats = [
  { value: String(HARNESSES.length), label: "harnesses" },
  { value: String(pathTotal), label: "mapped paths" },
  { value: `${headless}`, label: "headless CLIs" },
  { value: String(TOOLS.length), label: "agent tools" },
] as const;

const copied = ref(false);

async function copyInstall() {
  try {
    await navigator.clipboard.writeText("pnpm add @agntn/harnesses");
  } catch {
    return;
  }
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1200);
}

const activeId = computed(() => current.value.id);
</script>

<template>
  <div class="harnesses-landing not-prose">
    <header
      class="harnesses-hero mx-auto w-full max-w-[var(--ui-container)] px-8 pt-24 pb-20 text-center sm:px-12 lg:px-16"
    >
      <h1
        class="harnesses-enter mx-auto max-w-3xl text-4xl leading-[1.08] font-medium tracking-tight text-highlighted sm:text-5xl lg:text-[3.75rem]"
      >
        Twelve agents. <span class="text-primary">One map.</span>
      </h1>
      <p class="harnesses-enter harnesses-enter-2 mx-auto mt-6 max-w-xl text-base leading-7 text-muted">
        Where each harness keeps its config, sessions, instructions, skills and hooks, per platform,
        with an evidence level on every path. Detect which one you're running inside. Run a prompt
        through another one without tools, read-only, or as a full agent. Keep every MCP list and
        AGENTS.md in sync from one file. Library, CLI, MCP server, Pi and OMP extensions.
      </p>
      <div
        class="harnesses-enter harnesses-enter-3 mt-8 flex flex-wrap items-center justify-center gap-2"
      >
        <UButton to="/guide" color="primary" trailing-icon="i-solar-arrow-right-linear">
          Get started
        </UButton>
        <UButton
          to="https://github.com/agntn/harnesses"
          target="_blank"
          color="neutral"
          variant="outline"
          icon="i-simple-icons-github"
        >
          Star on GitHub
        </UButton>
      </div>
      <button
        type="button"
        class="harnesses-enter harnesses-enter-4 harnesses-install mt-5"
        :aria-label="copied ? 'Copied' : 'Copy install command'"
        @click="copyInstall"
      >
        <span class="text-dimmed">$</span>
        <span>pnpm add @agntn/harnesses</span>
        <UIcon :name="copied ? 'i-solar-unread-linear' : 'i-solar-copy-linear'" class="size-3.5 text-dimmed" />
      </button>

      <div
        class="harnesses-enter harnesses-enter-4 mx-auto mt-16 hidden max-w-6xl md:block"
        @mouseenter="paused = true"
        @mouseleave="paused = false"
      >
        <LandingFlow :sample="current" :tick="tick" />
      </div>
    </header>

    <dl class="harnesses-section grid grid-cols-2 sm:grid-cols-4">
      <div
        v-for="(stat, i) in stats"
        :key="stat.label"
        class="border-default px-6 py-7 text-center"
        :class="{ 'border-t sm:border-t-0': i >= 2, 'border-l': i % 2 === 1, 'sm:border-l': i > 0 }"
      >
        <dd class="font-mono text-2xl text-highlighted">{{ stat.value }}</dd>
        <dt class="mt-1 font-mono text-[11px] tracking-[0.12em] text-dimmed uppercase">
          {{ stat.label }}
        </dt>
      </div>
    </dl>

    <LandingFeature
      eyebrow="Paths"
      title="Every path, with its evidence"
      to="/guide/registry"
      link="Registry and paths"
      :checks="[
        'Each entry carries scope (user, project, system, data) and level (official, community, inferred)',
        'resolve({ platform, homeDir, projectRoot }) expands ~, ${HOME} and %VAR% and drops paths for other platforms',
        'A note where the path needs one: dash-encoded cwd, XDG on every platform, deprecated location',
      ]"
    >
      <code class="font-mono text-[13px] text-highlighted">getHarness("codex")</code> is one object
      with config, sessions, instructions, skills, commands and hooks. Nothing is fetched or
      scanned; it's a table someone checked against the CLI's own docs, source, or a local probe,
      and wrote the level down. <code class="font-mono text-[13px] text-highlighted">inferred</code>
      means exactly that. This panel walks through {{ samples.length }} harnesses, values expanded
      the way the library expands them.
      <template #visual>
        <div @mouseenter="paused = true" @mouseleave="paused = false">
          <LandingRotatingCode :sample="current" />
          <div class="mt-3 flex items-center justify-between font-mono text-[11px] text-dimmed">
            <span>{{ current.name }} · {{ countPaths(current) }} paths</span>
            <span class="inline-flex gap-1">
              <button type="button" class="harnesses-copy" aria-label="Previous harness" @click="step(-1)">
                <UIcon name="i-solar-alt-arrow-left-linear" class="size-3.5" />
              </button>
              <button type="button" class="harnesses-copy" aria-label="Next harness" @click="step(1)">
                <UIcon name="i-solar-alt-arrow-right-linear" class="size-3.5" />
              </button>
            </span>
          </div>
        </div>
      </template>
    </LandingFeature>

    <LandingFeature
      eyebrow="Invoke"
      title="Six modes, none of them a fallback"
      to="/guide/invoke"
      link="Running another harness"
      :checks="[
        'tools defaults to false: an advisor with tools removed by a native flag, not by prompt wording',
        'readOnly needs a sandbox the CLI enforces itself. No recipe, no run, and an error that says which retry would work',
        'timeoutMs and signal stop the whole process group; stopped results keep their output',
      ]"
      reverse
    >
      <code class="font-mono text-[13px] text-highlighted">invoke(prompt, options)</code> expands one
      argument template per mode and spawns the binary. A harness whose CLI cannot switch tools off
      rejects advisor mode instead of pretending. The command line below is what would run for the
      current harness, and the second block is the error you get for a mode it doesn't have.
      <template #visual>
        <div @mouseenter="paused = true" @mouseleave="paused = false">
          <LandingModes :sample="current" />
        </div>
      </template>
    </LandingFeature>

    <LandingFeature
      eyebrow="MCP servers"
      title="One list, every dialect"
      to="/guide/mcp-servers"
      link="Syncing MCP servers"
      :checks="[
        'listMcpServers reads JSON and TOML, standard, OpenCode, VS Code and Antigravity shapes, into one McpServerConfig',
        'sync makes each user scope config exactly the master list; extras are removed, not merged around',
        'excludes keeps a harness\'s own servers, but names on the master list are withdrawn from it',
      ]"
    >
      <code class="font-mono text-[13px] text-highlighted">~/.config/agntn/mcp.jsonc</code> is
      the only place a server is declared. <code class="font-mono text-[13px] text-highlighted">~</code>
      and <code class="font-mono text-[13px] text-highlighted">${HOME}</code> expand at sync time
      because harnesses spawn MCP servers without a shell, and a tilde in a config is a server that silently never starts.
      TOML files get a surgical edit that keeps their comments. JSON files are rewritten.
      <template #visual>
        <div @mouseenter="paused = true" @mouseleave="paused = false">
          <LandingSync :sample="current" />
        </div>
      </template>
    </LandingFeature>

    <LandingFeature
      eyebrow="Harnesses"
      title="Twelve harnesses, three platforms"
      to="/harnesses"
      link="All harnesses"
      :checks="[
        `Linux, macOS and Windows: ${PLATFORMS.map((p) => p.label).join(', ')} paths tagged where they differ`,
        'Detection by environment variable first, then by project markers; two matches is null, not a guess',
        'Audio and video mean a verified native route into model context, not a conversion or an MCP tool',
      ]"
      reverse
    >
      Each page lists the binaries, capabilities, invocation templates, every path with its scope
      and level, the MCP config dialect and what the harness reads from other harnesses' folders.
      Cursor and Copilot scan <code class="font-mono text-[13px] text-highlighted">.claude/skills/</code>,
      Grok loads <code class="font-mono text-[13px] text-highlighted">CLAUDE.md</code>. That's
      written down too, because it decides where your file has to live.
      <template #visual>
        <div class="harnesses-frame grid grid-cols-2 overflow-hidden rounded-xl sm:grid-cols-3">
          <NuxtLink
            v-for="(harness, i) in HARNESSES"
            :key="harness.id"
            :to="harness.to"
            class="group flex flex-col gap-2 border-muted px-4 py-3.5 transition-colors duration-500 hover:bg-muted"
            :class="{
              'border-t': i >= 2,
              'sm:border-t-0': i < 3,
              'border-l': i % 2 === 1,
              'sm:border-l': i % 3 !== 0,
              'sm:border-l-0': i % 3 === 0,
              'harnesses-cell-active': harness.id === activeId,
            }"
          >
            <UIcon
              :name="harness.icon"
              class="size-4 text-muted transition-colors duration-500 group-hover:text-primary"
              :class="{ 'text-primary': harness.id === activeId }"
            />
            <span>
              <span class="block text-sm font-medium text-highlighted">{{ harness.short }}</span>
              <span class="mt-0.5 block font-mono text-[11px] text-dimmed">"{{ harness.id }}"</span>
            </span>
          </NuxtLink>
        </div>
      </template>
    </LandingFeature>

    <LandingFeature
      eyebrow="Agents"
      title="Nine tools, three hosts"
      to="/guide/agents"
      link="MCP, Pi and OMP"
      :checks="[
        'harnesses_detect, harnesses_info, harnesses_models, harnesses_run, and five for MCP lists and AGENTS.md',
        'harnesses_run makes the model choose tools explicitly; unsupported modes never widen access',
        'The host\'s own request signal cancels a run, not a JSON argument the model could forget',
      ]"
    >
      <code class="font-mono text-[13px] text-highlighted">harnesses mcp</code> serves the tools over
      stdio, the Pi and OMP extensions render the same executors in the terminal. So Claude can ask
      Codex for a second opinion on a patch, read-only, and get the answer back as one tool result.
      That's what the tools are for; the table of paths alone wouldn't need a server.
      <template #visual>
        <div @mouseenter="paused = true" @mouseleave="paused = false">
          <LandingToolCall :sample="current" />
        </div>
      </template>
    </LandingFeature>

    <LandingFeature
      eyebrow="Your harness"
      title="Extend Harness, call registerHarness"
      to="/guide/custom"
      link="Custom harnesses"
      :checks="[
        'id, name, binaries, the six path groups, capabilities, detection and invocation. Same fields the built-ins fill',
        'registerHarness(Class) makes it visible to getHarness, detectHarness and the CLI in your process',
        'invocation: null is honest for a CLI without a headless mode. invoke() then throws before spawning',
      ]"
      reverse
    >
      Every built-in is a concrete class extending the exported abstract
      <code class="font-mono text-[13px] text-highlighted">Harness</code>. Yours is the same shape,
      one file. Put <code class="font-mono text-[13px] text-highlighted">level: "inferred"</code>
      on a path you haven't checked and change it when you have. The type won't let you skip the
      field, which is the point.
      <template #visual>
        <div class="harnesses-frame overflow-hidden rounded-xl">
          <div class="flex items-center gap-2 border-b border-muted px-4 py-3">
            <span class="font-mono text-[10px] font-bold text-primary">TS</span>
            <span class="text-sm text-default">aider.ts</span>
          </div>
          <pre class="harnesses-rotating harnesses-nowrap"><code><span class="tok-kw">import</span> { Harness, registerHarness, <span class="tok-kw">type</span> HarnessId } <span class="tok-kw">from</span> <span class="tok-str">"@agntn/harnesses"</span>;

<span class="tok-kw">class</span> <span class="tok-fn">Aider</span> <span class="tok-kw">extends</span> Harness {
  <span class="tok-kw">readonly</span> id = <span class="tok-str">"aider"</span> <span class="tok-kw">as</span> HarnessId;
  <span class="tok-kw">readonly</span> name = <span class="tok-str">"Aider"</span>;
  <span class="tok-kw">readonly</span> binaries = [<span class="tok-str">"aider"</span>];
  <span class="tok-kw">readonly</span> capabilities = {
    mcp: <span class="tok-kw">false</span>, vision: <span class="tok-kw">true</span>, audio: <span class="tok-kw">false</span>,
    video: <span class="tok-kw">false</span>, tools: <span class="tok-kw">true</span>, streaming: <span class="tok-kw">true</span>,
  };
  <span class="tok-kw">readonly</span> config = [
    { path: <span class="tok-str">"~/.aider.conf.yml"</span>, scope: <span class="tok-str">"user"</span>, level: <span class="tok-str">"official"</span> },
  ];
  <span class="tok-kw">readonly</span> sessions = [
    { path: <span class="tok-str">".aider.chat.history.md"</span>, scope: <span class="tok-str">"project"</span>, level: <span class="tok-str">"official"</span> },
  ];
  <span class="tok-kw">readonly</span> persistence = [{ format: <span class="tok-str">"YAML"</span>, level: <span class="tok-str">"official"</span> }];
  <span class="tok-kw">readonly</span> instructions = [];
  <span class="tok-kw">readonly</span> skills = [];
  <span class="tok-kw">readonly</span> commands = [];
  <span class="tok-kw">readonly</span> hooks = [];
  <span class="tok-kw">readonly</span> detection = { envVars: [], projectMarkers: [<span class="tok-str">".aider.conf.yml"</span>] };
  <span class="tok-kw">readonly</span> invocation = {
    args: [<span class="tok-str">"--message"</span>, <span class="tok-str">"{prompt}"</span>, <span class="tok-str">"--yes-always"</span>],
    modelArgs: [<span class="tok-str">"--model"</span>, <span class="tok-str">"{model}"</span>],
    level: <span class="tok-str">"inferred"</span>,
  };
}

<span class="tok-fn">registerHarness</span>(Aider);</code></pre>
        </div>
      </template>
    </LandingFeature>

    <section class="harnesses-section">
      <div
        class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-20 text-center sm:px-12 lg:px-16"
      >
        <h2 class="text-2xl font-medium tracking-tight text-highlighted sm:text-3xl">
          Start with one command
        </h2>
        <p class="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
          Pre-1.0, so pin exact versions. Paths follow upstream CLIs, and upstream CLIs move. When
          one does, the fix is a line in a table and a contract test, and I'd rather get the issue.
        </p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-2">
          <UButton to="/guide" color="primary" trailing-icon="i-solar-arrow-right-linear">
            Read the guide
          </UButton>
          <UButton to="/explorer" color="neutral" variant="outline"> Open the explorer </UButton>
        </div>
      </div>
    </section>
  </div>
</template>
