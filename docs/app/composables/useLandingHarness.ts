import { HARNESSES, type HarnessEntry } from "../utils/harnesses";

/** The order the landing walks the harnesses in. Neighbours differ in what they can do. */
const WALK = [
  "claude",
  "codex",
  "pi",
  "gemini",
  "opencode",
  "grok",
  "omp",
  "cursor",
  "antigravity",
  "github-copilot",
  "mastracode",
  "freebuff",
] as const;

/** One clock for every landing panel. Values come from the snapshot, at build and live. */
export function useLandingHarness() {
  const samples: HarnessEntry[] = WALK.map(
    (id) => HARNESSES.find((entry) => entry.id === id) ?? HARNESSES[0]!,
  );
  const tick = ref(0);
  const paused = ref(false);
  const index = computed(() => tick.value % samples.length);
  const current = computed(() => samples[index.value]!);

  let timer: number | undefined;

  function step(delta: number) {
    tick.value = Math.max(0, tick.value + delta);
  }

  function stopWalk() {
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  }

  function startWalk() {
    stopWalk();
    if (!import.meta.client || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    timer = window.setInterval(() => {
      if (!paused.value && !document.hidden) {
        step(1);
      }
    }, 4200);
  }

  onMounted(startWalk);
  onUnmounted(stopWalk);

  return { samples, tick, index, paused, current, step };
}
