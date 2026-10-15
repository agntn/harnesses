/** Comments and trailing commas out, JSON.parse in: the whole JSONC story for agntn configs. */
type JsoncState = "code" | "string" | "escape" | "line-comment" | "block-comment";

type JsoncContext = Readonly<{
  text: string;
  index: number;
  character: string;
  next: string | undefined;
}>;

type JsoncStep = Readonly<{
  state: JsoncState;
  output: string;
  advance: number;
}>;

type JsoncScanner = (context: JsoncContext) => JsoncStep;

function trailingJsoncComma(text: string, index: number): boolean {
  const rest = text.slice(index + 1);
  const significant = rest.replaceAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\s+/g, "");
  return significant.startsWith("}") || significant.startsWith("]");
}

function scanJsoncCode(context: JsoncContext): JsoncStep {
  const { character, next } = context;
  if (character === '"') return { state: "string", output: character, advance: 0 };
  if (character === "/" && next === "/") {
    return { state: "line-comment", output: "", advance: 1 };
  }
  if (character === "/" && next === "*") {
    return { state: "block-comment", output: "", advance: 1 };
  }
  if (character === "," && trailingJsoncComma(context.text, context.index)) {
    return { state: "code", output: "", advance: 0 };
  }
  return { state: "code", output: character, advance: 0 };
}

function scanJsoncString({ character }: JsoncContext): JsoncStep {
  if (character === "\\") return { state: "escape", output: character, advance: 0 };
  if (character === '"') return { state: "code", output: character, advance: 0 };
  return { state: "string", output: character, advance: 0 };
}

function scanJsoncEscape({ character }: JsoncContext): JsoncStep {
  return { state: "string", output: character, advance: 0 };
}

function scanJsoncLineComment({ character }: JsoncContext): JsoncStep {
  if (character === "\n") return { state: "code", output: character, advance: 0 };
  return { state: "line-comment", output: "", advance: 0 };
}

function scanJsoncBlockComment({ character, next }: JsoncContext): JsoncStep {
  if (character === "*" && next === "/") {
    return { state: "code", output: "", advance: 1 };
  }
  return { state: "block-comment", output: "", advance: 0 };
}

const JSONC_SCANNERS: Record<JsoncState, JsoncScanner> = {
  code: scanJsoncCode,
  string: scanJsoncString,
  escape: scanJsoncEscape,
  "line-comment": scanJsoncLineComment,
  "block-comment": scanJsoncBlockComment,
};

/**
 * Parses JSONC, the JSON with comments and trailing commas that mcp.jsonc and agents.jsonc use.
 *
 * @param text - JSONC source text.
 * @returns {unknown} The parsed JSON value.
 */
export function parseJsonc(text: string): unknown {
  let out = "";
  let state: JsoncState = "code";
  for (let index = 0; index < text.length; index++) {
    const character = text[index] as string;
    const step: JsoncStep = JSONC_SCANNERS[state]({
      text,
      index,
      character,
      next: text[index + 1],
    });
    out += step.output;
    state = step.state;
    index += step.advance;
  }
  return JSON.parse(out);
}
