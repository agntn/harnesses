import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEventBus,
  discoverAndLoadExtensions,
  ExtensionRunner,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  type ExtensionContextActions,
} from "@earendil-works/pi-coding-agent";
import { expect, it, onTestFinished } from "vite-plus/test";

it("refreshes the selected model without changing Pi's other prompt sections", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "harnesses-pi-"));
  onTestFinished(() => rmSync(cwd, { recursive: true, force: true }));
  const path = fileURLToPath(new URL("../extensions/pi/harnesses.ts", import.meta.url));
  const loaded = await discoverAndLoadExtensions([path], cwd, cwd, createEventBus());
  expect(loaded.errors).toEqual([]);
  const modelRuntime = await ModelRuntime.create({
    authPath: join(cwd, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(cwd, "models-store.json"),
    refreshOnCreate: false,
  });
  const registry = new ModelRegistry(modelRuntime);
  const base = registry.getAll()[0];
  if (!base) throw new Error("The Pi test registry has no models");
  const first = { ...base, provider: "fixture", id: "first" };
  const second = { ...base, provider: "fixture", id: "second" };
  let selected: ReturnType<ExtensionContextActions["getModel"]> = first;
  const runner = new ExtensionRunner(
    loaded.extensions,
    loaded.runtime,
    cwd,
    SessionManager.inMemory(cwd),
    registry,
  );
  runner.bindCore(loaded.runtime, {
    getModel: () => selected,
    getScopedModels: () => [],
    isIdle: () => false,
    isProjectTrusted: () => true,
    getSignal: () => undefined,
    abort() {},
    hasPendingMessages: () => false,
    shutdown() {},
    getContextUsage: () => undefined,
    compact() {},
    getSystemPrompt: () => "",
  });

  const trigger = { messageType: "user", prompt: "Check model" } as const;
  const options = { cwd, sections: { other: "Existing guidance" } };
  const started = await runner.emitBeforeAgentStart(trigger, options);
  const guidance = started.systemPromptOptions.sections.active_session_model;
  expect(guidance).toContain('"fixture/first"');
  expect(guidance).toContain("pick a known different model explicitly");
  expect(started.systemPromptOptions.sections.other).toBe("Existing guidance");
  expect(started.messages).toEqual([]);

  const systemMessage = {
    role: "system",
    content: "",
    timestamp: 0,
    sections: {
      other: "<other>\nExisting guidance\n</other>",
      active_session_model: `<active_session_model>\n${guidance}\n</active_session_model>`,
    },
  } as const;
  expect(await runner.emitContext([systemMessage])).toEqual([systemMessage]);
  selected = second;
  const refreshed = await runner.emitContext([systemMessage]);
  const effective = refreshed[0];
  if (effective?.role !== "system") throw new Error("Pi lost the system message");
  expect(refreshed).toHaveLength(1);
  expect(effective.sections?.active_session_model).toContain('"fixture/second"');
  expect(effective.sections?.active_session_model).not.toContain('"fixture/first"');
  expect(effective.sections?.other).toBe("<other>\nExisting guidance\n</other>");
  expect(systemMessage.sections.active_session_model).toContain('"fixture/first"');
  const next = await runner.emitBeforeAgentStart(trigger, options);
  expect(next.systemPromptOptions.sections.active_session_model).toContain('"fixture/second"');

  selected = undefined;
  const unknown = await runner.emitBeforeAgentStart(trigger, options);
  expect(unknown.systemPromptOptions.sections.active_session_model).toContain("request: unknown.");
});
