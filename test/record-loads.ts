import { writeSync } from "node:fs";
import { registerHooks } from "node:module";

/**
 * Every module URL Node loaded after this file, reported as one `@loaded [...]` line on stderr at exit.
 * Written synchronously, because a piped stderr flushes asynchronously and the exit handler cannot wait.
 */
const loaded: string[] = [];

registerHooks({
  load(url, context, nextLoad) {
    loaded.push(url);
    return nextLoad(url, context);
  },
});

process.on("exit", () => {
  writeSync(2, `\n@loaded ${JSON.stringify(loaded)}\n`);
});
