import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildImportGraph,
  checkCircularImports,
  findCycles,
  runtimeImports,
} from "../../../.agents/skills/cris-doctor/scripts/lib/import-graph";
import { parseMypyJson } from "../../../.agents/skills/cris-doctor/scripts/lib/tool-checks";

const file = (p: string, content: string) => ({ path: p, content });

describe("runtimeImports", () => {
  it("keeps runtime imports and re-exports, drops type-only and dynamic imports", () => {
    const content = [
      'import a from "./a";',
      'import { b, type B } from "./b";',
      'import type { C } from "./c";',
      'import { type D } from "./d";',
      'import "./side-effect";',
      'export { e } from "./e";',
      'export type { F } from "./f";',
      "const g = await import('./g');",
    ].join("\n");
    expect(runtimeImports(file("lib/x.ts", content))).toEqual(["./a", "./b", "./side-effect", "./e"]);
  });
});

describe("findCycles", () => {
  it("returns each strongly connected component once, sorted", () => {
    const graph = new Map([
      ["c.ts", ["a.ts"]],
      ["a.ts", ["b.ts"]],
      ["b.ts", ["c.ts", "d.ts"]],
      ["d.ts", []],
      ["e.ts", ["f.ts"]],
      ["f.ts", ["e.ts"]],
    ]);
    expect(findCycles(graph)).toEqual([
      ["a.ts", "b.ts", "c.ts"],
      ["e.ts", "f.ts"],
    ]);
  });

  it("finds nothing in an acyclic graph", () => {
    expect(findCycles(new Map([["a.ts", ["b.ts"]], ["b.ts", []]]))).toEqual([]);
  });
});

describe("buildImportGraph", () => {
  let root = "";
  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("resolves tsconfig path aliases and reports a runtime cycle", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-graph-"));
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] }, moduleResolution: "bundler", module: "esnext" } })
    );
    const files = [
      file("lib/a.ts", 'import { b } from "@/lib/b";\nexport const a = () => b;'),
      file("lib/b.ts", 'import { a } from "./a";\nimport type { T } from "./t";\nexport const b = () => a;'),
      file("lib/t.ts", 'import { a } from "./a";\nexport type T = string;'),
    ];
    fs.mkdirSync(path.join(root, "lib"));
    for (const f of files) fs.writeFileSync(path.join(root, f.path), f.content);

    expect(buildImportGraph(root, files)).toEqual(
      new Map([
        ["lib/a.ts", ["lib/b.ts"]],
        ["lib/b.ts", ["lib/a.ts"]],
        ["lib/t.ts", ["lib/a.ts"]],
      ])
    );
    expect(checkCircularImports(root, files).map((f) => [f.file, f.message])).toEqual([
      ["lib/a.ts", "2 file import vòng lẫn nhau lúc chạy: lib/a.ts, lib/b.ts"],
    ]);
  });
});

describe("parseMypyJson", () => {
  it("keeps errors, prefixes the service dir and drops line numbers from messages", () => {
    const output = [
      JSON.stringify({ file: "svc_pkg/a.py", line: 4, message: 'Name "x" already defined on line 2', code: "no-redef", severity: "error" }),
      JSON.stringify({ file: "svc_pkg/a.py", line: 9, message: "See docs", code: null, severity: "note" }),
      "",
    ].join("\n");
    expect(parseMypyJson(output, "svc")).toEqual([
      {
        checkId: "PY-MYPY",
        severity: "risk",
        file: path.join("svc", "svc_pkg/a.py"),
        line: 4,
        message: 'no-redef: Name "x" already defined on line N',
      },
    ]);
  });
});
