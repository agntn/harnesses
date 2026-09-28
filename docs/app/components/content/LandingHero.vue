<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import {
  HARNESSES,
  LIBRARY_VERSION,
  PLATFORMS,
  allPaths,
  levelCounts,
} from "../../utils/harnesses";
import { countWord } from "../../utils/format";

defineProps<{ sample: HarnessEntry; tick: number }>();

const emit = defineEmits<{ step: [delta: number]; pause: [paused: boolean] }>();

const INSTALL = "pnpm add @agntn/harnesses";

const pathTotal = HARNESSES.reduce((sum, harness) => sum + allPaths(harness).length, 0);
const headless = HARNESSES.filter((harness) => harness.invocation !== null).length;
const levels = levelCounts(HARNESSES);
const checked = levels.official + levels.community;

const { copied, copy } = useCopied();
</script>

<template>
  <header class="harnesses-hero hero-page">
    <div class="hero-zone">
      <span class="hero-cross hero-cross-tl" aria-hidden="true">+</span>
      <span class="hero-cross hero-cross-tr" aria-hidden="true">+</span>
      <span class="hero-bracket hero-bracket-l" aria-hidden="true" />
      <span class="hero-bracket hero-bracket-r" aria-hidden="true" />

      <p class="console-id">
        <span class="console-id-tag">ID</span>
        <span>@agntn/harnesses</span>
        <span class="console-id-sep" aria-hidden="true">/</span>
        <span>v{{ LIBRARY_VERSION }}</span>
      </p>

      <h1 class="hero-title">{{ countWord(HARNESSES.length) }} agents. <span>One map.</span></h1>
      <p class="hero-lead">
        Where each coding agent keeps its config, sessions, instructions, skills and hooks, per
        platform, with an evidence level on every path. Detect the one you're inside, run a prompt
        through another, keep every MCP list and AGENTS.md in sync from one file.
      </p>

      <dl class="hero-metrics">
        <div>
          <dt>Harnesses</dt>
          <dd>{{ HARNESSES.length }}</dd>
          <dd class="hero-metric-sub">
            {{ PLATFORMS.map((platform) => platform.label).join(" · ") }}
          </dd>
        </div>
        <div>
          <dt>Paths</dt>
          <dd>{{ pathTotal }}</dd>
          <dd class="hero-metric-sub">each with its evidence</dd>
        </div>
        <div>
          <dt>Headless</dt>
          <dd class="hero-metric-accent">
            {{ headless }} <span>of {{ HARNESSES.length }}</span>
          </dd>
          <dd class="hero-metric-sub">invoke() spawns them</dd>
        </div>
      </dl>
      <div class="hero-share" aria-hidden="true">
        <span class="hero-share-closed" :style="{ flex: checked }" />
        <span class="hero-share-open" :style="{ flex: levels.inferred }" />
      </div>
      <p class="hero-share-read">
        <span>{{ checked }} checked against the CLI</span>
        <span>{{ levels.inferred }} inferred</span>
      </p>

      <div class="console-actions">
        <UButton
          to="/guide"
          color="primary"
          variant="solid"
          trailing-icon="i-lucide-arrow-right"
          label="Get started"
        />
        <UButton
          to="https://github.com/agntn/harnesses"
          target="_blank"
          color="neutral"
          variant="outline"
          icon="i-simple-icons-github"
          label="Star on GitHub"
        />
      </div>
      <div class="console-install">
        <span class="console-install-tag">Install</span>
        <code><span class="console-install-prompt">$</span> {{ INSTALL }}</code>
        <UButton
          color="neutral"
          variant="subtle"
          :icon="copied === 'install' ? 'i-lucide-check' : 'i-lucide-copy'"
          :aria-label="copied === 'install' ? 'Copied' : 'Copy install command'"
          @click="copy('install', INSTALL)"
        />
      </div>
    </div>

    <div class="hero-instrument">
      <svg class="hero-circuit" viewBox="0 0 160 56" aria-hidden="true">
        <path class="hero-circuit-rail" d="M80 0V16L96 32V56" />
        <path :key="tick" class="hero-circuit-live" d="M80 0V16L96 32V56" pathLength="1" />
        <path class="hero-circuit-seg" d="M96 38V48" />
        <rect class="hero-circuit-node" x="92.5" y="52.5" width="7" height="7" />
      </svg>
      <span class="hero-circuit-tag" aria-hidden="true">getHarness(id)</span>
      <LandingMap :sample="sample" @step="emit('step', $event)" @pause="emit('pause', $event)" />
    </div>
  </header>
</template>
