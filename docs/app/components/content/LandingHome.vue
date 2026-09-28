<script setup lang="ts">
import { HARNESSES, PLATFORMS, TOOLS } from "../../utils/harnesses";
import { countWord } from "../../utils/format";

const { samples, tick, paused, current, step } = useLandingHarness();

const harnessWord = countWord(HARNESSES.length);
const toolWord = countWord(TOOLS.length);
</script>

<template>
  <div class="harnesses-landing not-prose">
    <LandingHero :sample="current" :tick="tick" @step="step" @pause="paused = $event" />

    <LandingFeature
      title="Every path, with its evidence"
      to="/guide/registry"
      link="Registry and paths"
      :checks="[
        'Each entry carries scope (user, project, system, data) and level (official, community, inferred)',
        'resolve({ platform, homeDir, projectRoot }) expands ~, ${HOME} and %VAR% and drops paths for other platforms',
        'A note where the path needs one: dash-encoded cwd, XDG on every platform, deprecated location',
      ]"
    >
      <code class="harnesses-code">getHarness("codex")</code> is one object with config, sessions,
      instructions, skills, commands, prompt templates and hooks. Nothing is fetched or scanned;
      it's a table someone checked against the CLI's own docs, source, or a local probe, and wrote
      the level down. <code class="harnesses-code">inferred</code> means exactly that. This panel
      walks through {{ samples.length }} harnesses, values expanded the way the library expands
      them.
      <template #visual>
        <div
          @mouseenter="paused = true"
          @mouseleave="paused = false"
          @focusin="paused = true"
          @focusout="paused = false"
        >
          <LandingRotatingCode :sample="current" @step="step" />
        </div>
      </template>
    </LandingFeature>

    <LandingFeature
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
      <code class="harnesses-code">invoke(prompt, options)</code> expands one argument template per
      mode and spawns the binary. A harness whose CLI cannot switch tools off rejects advisor mode
      instead of pretending. The panel shows what would run for the current harness, and the error
      you get for a mode it doesn't have.
      <template #visual>
        <div
          @mouseenter="paused = true"
          @mouseleave="paused = false"
          @focusin="paused = true"
          @focusout="paused = false"
        >
          <LandingModes :sample="current" />
        </div>
      </template>
    </LandingFeature>

    <LandingFeature
      title="One list, every dialect"
      to="/guide/mcp-servers"
      link="Syncing MCP servers"
      :checks="[
        'listMcpServers reads JSON and TOML, standard, OpenCode, VS Code and Antigravity shapes, into one McpServerConfig',
        'sync makes each user scope config exactly the master list; extras are removed, not merged around',
        'excludes keeps a harness\'s own servers, but names on the master list are withdrawn from it',
      ]"
    >
      <code class="harnesses-code">~/.config/agntn/mcp.jsonc</code> is the only place a server is
      declared. <code class="harnesses-code">~</code> and
      <code class="harnesses-code">${HOME}</code> expand at sync time because harnesses spawn MCP
      servers without a shell, and a tilde in a config is a server that silently never starts. TOML
      files get a surgical edit that keeps their comments. JSON files are rewritten.
      <template #visual>
        <div
          @mouseenter="paused = true"
          @mouseleave="paused = false"
          @focusin="paused = true"
          @focusout="paused = false"
        >
          <LandingSync :sample="current" />
        </div>
      </template>
    </LandingFeature>

    <LandingFeature
      :title="`${harnessWord} harnesses, ${countWord(PLATFORMS.length).toLowerCase()} platforms`"
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
      Cursor and Copilot scan <code class="harnesses-code">.claude/skills/</code>, Grok loads
      <code class="harnesses-code">CLAUDE.md</code>. That's written down too, because it decides
      where your file has to live.
      <template #visual>
        <LandingRegistry :sample="current" />
      </template>
    </LandingFeature>

    <LandingFeature
      :title="`${toolWord} tools, three hosts`"
      to="/guide/agents"
      link="MCP, Pi and OMP"
      :checks="[
        'harnesses_detect, harnesses_info, harnesses_models, harnesses_run, and seven for MCP configuration, AGENTS.md, prompts and skills',
        'harnesses_run makes the model choose tools explicitly; unsupported modes never widen access',
        'The host\'s own request signal cancels a run, not a JSON argument the model could forget',
      ]"
    >
      <code class="harnesses-code">harnesses mcp</code> serves the tools over stdio, the Pi and OMP
      extensions render the same executors in the terminal. So Claude can ask Codex for a second
      opinion on a patch, read-only, and get the answer back as one tool result. That's what the
      tools are for; the table of paths alone wouldn't need a server.
      <template #visual>
        <div
          @mouseenter="paused = true"
          @mouseleave="paused = false"
          @focusin="paused = true"
          @focusout="paused = false"
        >
          <LandingToolCall :sample="current" />
        </div>
      </template>
    </LandingFeature>

    <LandingFeature
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
      <code class="harnesses-code">Harness</code>. Yours is the same shape, one file. Put
      <code class="harnesses-code">level: "inferred"</code> on a path you haven't checked and change
      it when you have. The type won't let you skip the field, which is the point.
      <template #visual>
        <LandingCustom />
      </template>
    </LandingFeature>

    <section class="harnesses-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-20 sm:px-12 lg:px-16">
        <LandingStart />
      </div>
    </section>
  </div>
</template>
