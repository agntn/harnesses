import { stripVTControlCharacters, styleText } from "node:util";
import type { ToolResult } from "@agntn/tools";

/** `styleText` checks stdout, `NO_COLOR` and `FORCE_COLOR`, so pipes and log files stay plain. */
export const s = {
  cyan: (t: string) => styleText("cyan", t),
  hi: (t: string) => styleText("cyanBright", t),
  green: (t: string) => styleText("green", t),
  red: (t: string) => styleText("red", t),
  dim: (t: string) => styleText("gray", t),
  bold: (t: string) => styleText("bold", t),
  white: (t: string) => styleText("whiteBright", t),
};

/** Control bytes removed from reports because they can echo untrusted configuration values. */
/* oxlint-disable-next-line no-control-regex */
const UNSAFE_TERMINAL_CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
const UNSAFE_UNICODE_FORMATTING = /[\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * Drops terminal sequences, control bytes and Unicode formatting from text meant for a person.
 *
 * @param text - Text that may echo an outside value.
 * @returns {string} The text, safe to print.
 */
export function sanitize(text: string | undefined): string {
  return stripVTControlCharacters(text ?? "")
    .replace(UNSAFE_TERMINAL_CONTROLS, " ")
    .replace(UNSAFE_UNICODE_FORMATTING, " ");
}

/**
 * Writes one line of a listing to stdout.
 *
 * @param line - The line, already styled.
 */
export function print(line = ""): void {
  process.stdout.write(`${line}\n`);
}

/**
 * @param title - Listing title.
 * @returns {string} The title line.
 */
export function header(title: string): string {
  return `\n  ${s.bold(s.cyan(title))}`;
}

/**
 * @param title - Section title.
 * @returns {string} The section line.
 */
export function section(title: string): string {
  return `\n  ${s.cyan("▸")} ${s.white(title)}`;
}

/**
 * @param content - Entry text.
 * @returns {string} The entry, indented under its section.
 */
export function entry(content: string): string {
  return `    ${content}`;
}

/**
 * Whether `--json` came with the command, so the details are the whole answer.
 *
 * @param host - The host `runCli` hands to `execute`.
 * @returns {boolean} True when stdout belongs to the JSON.
 */
export function wantsJson(host: unknown): boolean {
  return typeof host === "object" && host !== null && "json" in host && host.json === true;
}

/**
 * A listing that already went out line by line, or goes out as JSON.
 *
 * @param details - The data behind the listing.
 * @returns {ToolResult} An answer `runCli` prints only under `--json`.
 */
export function printed(details: unknown): ToolResult {
  return { content: [], details };
}

/**
 * A refusal `runCli` writes to stderr with exit code 1.
 *
 * @param message - What went wrong.
 * @returns {ToolResult} The error answer.
 */
export function refusal(message: string): ToolResult {
  return {
    content: [{ type: "text", text: sanitize(message) }],
    details: { error: message },
    isError: true,
  };
}
