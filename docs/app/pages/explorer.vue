<script setup lang="ts">
import { HARNESSES, LIBRARY_VERSION, MODES, PLATFORMS } from "../utils/harnesses";

definePageMeta({ layout: "default" });

const title = "Explorer";
const description =
  "Every path of every harness, expanded for a platform and home directory you pick, and the exact command invoke() would spawn for each mode.";

useSeo({
  title,
  description,
  type: "article",
  breadcrumbs: [{ title, path: "/explorer" }],
});

defineOgImage(
  "Docs.takumi",
  { headline: "Explorer", title, description },
  { alt: "Explorer: every harness's paths resolved in the page" },
);
</script>

<template>
  <div class="harnesses-landing not-prose">
    <header class="harnesses-hero hero-page explorer-hero">
      <div class="hero-zone">
        <span class="hero-cross hero-cross-tl" aria-hidden="true">+</span>
        <span class="hero-cross hero-cross-tr" aria-hidden="true">+</span>
        <span class="hero-bracket hero-bracket-l" aria-hidden="true" />
        <span class="hero-bracket hero-bracket-r" aria-hidden="true" />

        <p class="console-id">
          <span class="console-id-tag">ID</span>
          <span>explorer</span>
          <span class="console-id-sep" aria-hidden="true">/</span>
          <span>v{{ LIBRARY_VERSION }}</span>
        </p>

        <h1 class="hero-title">Any harness. <span>Resolved in the page.</span></h1>
        <p class="hero-lead">
          The page reads the same registry the library ships, expands the templates the way
          resolve() does, and builds the command line invoke() would run. Nothing is spawned,
          nothing is read from your machine, and every state is a link.
        </p>

        <dl class="hero-metrics">
          <div>
            <dt>Harnesses</dt>
            <dd>{{ HARNESSES.length }}</dd>
            <dd class="hero-metric-sub">one registry</dd>
          </div>
          <div>
            <dt>Platforms</dt>
            <dd>{{ PLATFORMS.length }}</dd>
            <dd class="hero-metric-sub">
              {{ PLATFORMS.map((platform) => platform.label).join(" · ") }}
            </dd>
          </div>
          <div>
            <dt>Modes</dt>
            <dd class="hero-metric-accent">{{ MODES.length }}</dd>
            <dd class="hero-metric-sub">per invoke() call</dd>
          </div>
        </dl>

        <p class="explorer-note">
          <span class="console-tag">Note</span>
          <span
            >Paths are a snapshot of the published registry, not a scan of your disk. For the real
            thing on your machine run <code class="harnesses-code">harnesses paths</code>.</span
          >
        </p>
      </div>

      <div class="hero-instrument hero-instrument-keep">
        <svg class="hero-circuit" viewBox="0 0 160 56" aria-hidden="true">
          <path class="hero-circuit-rail" d="M80 0V16L96 32V56" />
          <path class="hero-circuit-live" d="M80 0V16L96 32V56" pathLength="1" />
          <path class="hero-circuit-seg" d="M96 38V48" />
          <rect class="hero-circuit-node" x="92.5" y="52.5" width="7" height="7" />
        </svg>
        <span class="hero-circuit-tag" aria-hidden="true">input</span>
        <HarnessesExplorer />
      </div>
    </header>
  </div>
</template>

<style scoped>
.explorer-hero {
  padding-top: 56px;
  padding-bottom: 72px;
}
.explorer-note {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  max-width: 40rem;
  margin: 22px auto 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
  text-align: left;
  color: var(--ui-text-muted);
}
.explorer-note > .console-tag {
  flex: none;
  margin: 0;
}
</style>
