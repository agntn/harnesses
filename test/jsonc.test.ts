import { describe, expect, it } from "vite-plus/test";
import { parseJsonc } from "../src/index.ts";

describe("parseJsonc", () => {
  it("drops line and block comments", () => {
    const text = `{
      // a line comment
      "a": 1, /* a block
      comment */ "b": [2] // after the value
    }`;
    expect(parseJsonc(text)).toEqual({ a: 1, b: [2] });
  });

  it("drops trailing commas, also when a comment follows them", () => {
    const text = `{
      "list": [1, 2, /* three */],
      "nested": { "x": true, // last one
      },
    }`;
    expect(parseJsonc(text)).toEqual({ list: [1, 2], nested: { x: true } });
  });

  it("leaves comment and comma lookalikes inside strings alone", () => {
    const text = String.raw`{
      "url": "https://example.com/a//b",
      "block": "/* not a comment */",
      "comma": "a,]",
      "quote": "say \"hi\", // still text",
      "path": "C:\\" // the backslash is escaped, so the string ends here
    }`;
    expect(parseJsonc(text)).toEqual({
      url: "https://example.com/a//b",
      block: "/* not a comment */",
      comma: "a,]",
      quote: 'say "hi", // still text',
      path: "C:\\",
    });
  });

  it("still throws on broken JSON", () => {
    expect(() => parseJsonc('{ "a": }')).toThrow(SyntaxError);
  });
});
