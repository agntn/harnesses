import { defineTool, Type } from "@agntn/tools";
import { entry, header, print, printed, s, wantsJson } from "./output.ts";

export default defineTool({
  name: "harnesses_list",
  title: "List Harnesses",
  description: "List all known harnesses",
  effect: "read",
  input: Type.Object({}),
  async execute(_input, { host }) {
    const { getAllHarnesses } = await import("../registry.ts");
    const data = getAllHarnesses().map((harness) => ({ id: harness.id, name: harness.name }));
    if (wantsJson(host)) return printed(data);

    print(header("Harnesses"));
    print();
    const width = Math.max(...data.map((row) => row.id.length));
    for (const { id, name } of data) print(entry(`${s.hi(id.padEnd(width))}  ${name}`));
    print();
    return printed(data);
  },
});
