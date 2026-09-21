import { stripVTControlCharacters } from "node:util";
import { encode as toToon } from "@toon-format/toon";
import { consola } from "consola";
import type { ToolResult } from "../tool-operations.ts";

export const formatArgs = {
  json: { type: "boolean" as const, description: "Output as JSON" },
  toon: { type: "boolean" as const, description: "Output as TOON" },
};

type OutputFormat = Readonly<{ json?: boolean; toon?: boolean }>;

/** Control bytes removed from reports because they can echo untrusted configuration values. */
/* oxlint-disable-next-line no-control-regex */
const UNSAFE_TERMINAL_CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
const UNSAFE_UNICODE_FORMATTING = /[\p{Cf}\p{Zl}\p{Zp}]/gu;

function sanitize(text: string | undefined): string {
  return stripVTControlCharacters(text ?? "")
    .replace(UNSAFE_TERMINAL_CONTROLS, " ")
    .replace(UNSAFE_UNICODE_FORMATTING, " ");
}

/**
 * Emits one tool result in the selected machine or human format.
 *
 * @param result - Shared executor result to emit.
 * @param args - Selected output format.
 */
export function report(result: ToolResult<unknown>, args: OutputFormat): void {
  if (args.json) console.log(JSON.stringify(result.details, null, 2));
  else if (args.toon) console.log(toToon(result.details));
  else if (result.isError) consola.error(sanitize(result.content[0]?.text));
  else console.log(sanitize(result.content[0]?.text));

  if (result.isError) process.exitCode = 1;
}
