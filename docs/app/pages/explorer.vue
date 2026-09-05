<script setup lang="ts">
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
  "Docs",
  { headline: "Explorer", title, description },
  { alt: "Explorer: every harness's paths resolved in the page" },
);
</script>

<template>
  <div class="harnesses-landing not-prose">
    <ToolHero
      eyebrow="explorer"
      title="Any harness."
      accent="Resolved in the page."
      description="The page reads the same registry the library ships, expands the templates the way resolve() does, and builds the command line invoke() would run. Nothing is spawned, nothing is read from your machine, and every state is a link."
    >
      <p
        class="harnesses-enter harnesses-enter-3 mx-auto mt-5 inline-flex max-w-xl items-start gap-2 text-left text-sm leading-6 text-dimmed"
      >
        <UIcon name="i-solar-info-circle-linear" class="mt-1 size-4 shrink-0 text-primary" />
        <span
          >Paths are a snapshot of the published registry, not a scan of your disk. For the real
          thing on your machine run <code class="font-mono text-highlighted">harnesses paths</code>.</span
        >
      </p>
    </ToolHero>

    <section class="harnesses-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-12 sm:px-12 lg:px-16">
        <HarnessesExplorer />
      </div>
    </section>
  </div>
</template>
