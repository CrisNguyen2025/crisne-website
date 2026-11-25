/**
 * CIRCULAR-IMPORT: runtime import graph of the TS sources, resolved with the TypeScript compiler API
 * (already a devDependency) so `@/…` aliases follow tsconfig.json exactly. Type-only imports and
 * dynamic import() are left out: they do not run at module load, so they cannot cause an init-order bug.
 */
import * as path from "path";
import * as ts from "typescript";
import type { Finding, SourceFile } from "./types";

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false; // side-effect import runs at load time
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return (
    !clause.name &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  return (
    clause !== undefined &&
    ts.isNamedExports(clause) &&
    clause.elements.length > 0 &&
    clause.elements.every((element) => element.isTypeOnly)
  );
}

/** Module specifiers a file loads at runtime (top-level import/export … from) */
export function runtimeImports(file: SourceFile): string[] {
  const kind = file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, false, kind);
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && !isTypeOnlyImport(statement)) {
      if (ts.isStringLiteral(statement.moduleSpecifier)) specifiers.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !isTypeOnlyExport(statement)) {
      if (ts.isStringLiteral(statement.moduleSpecifier)) specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

/** Repo-relative file → repo-relative files it imports at runtime (only files inside `files`) */
export function buildImportGraph(repoRoot: string, files: SourceFile[]): Map<string, string[]> {
  const config = ts.readConfigFile(path.join(repoRoot, "tsconfig.json"), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, repoRoot).options;
  const cache = ts.createModuleResolutionCache(repoRoot, (name) => name, options);
  const known = new Set(files.map((file) => file.path));
  const graph = new Map<string, string[]>();

  for (const file of files) {
    const absolute = path.join(repoRoot, file.path);
    const targets = new Set<string>();
    for (const specifier of runtimeImports(file)) {
      const resolved = ts.resolveModuleName(specifier, absolute, options, ts.sys, cache).resolvedModule;
      if (!resolved || resolved.isExternalLibraryImport) continue;
      const target = path.relative(repoRoot, resolved.resolvedFileName);
      if (known.has(target) && target !== file.path) targets.add(target);
    }
    graph.set(file.path, [...targets].sort());
  }
  return graph;
}

/** Strongly connected components with more than one file (Tarjan), each sorted, list sorted */
export function findCycles(graph: Map<string, string[]>): string[][] {
  let index = 0;
  const indexOf = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const visit = (node: string) => {
    indexOf.set(node, index);
    lowLink.set(node, index);
    index++;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!indexOf.has(next)) {
        visit(next);
        lowLink.set(node, Math.min(lowLink.get(node) ?? 0, lowLink.get(next) ?? 0));
      } else if (onStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node) ?? 0, indexOf.get(next) ?? 0));
      }
    }
    if (lowLink.get(node) === indexOf.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) cycles.push(component.sort());
    }
  };

  for (const node of [...graph.keys()].sort()) {
    if (!indexOf.has(node)) visit(node);
  }
  return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

export function checkCircularImports(repoRoot: string, files: SourceFile[]): Finding[] {
  const tsFiles = files.filter((file) => /\.tsx?$/.test(file.path));
  return findCycles(buildImportGraph(repoRoot, tsFiles)).map((cycle) => ({
    checkId: "CIRCULAR-IMPORT",
    severity: "risk" as const,
    file: cycle[0],
    message: `${cycle.length} file import vòng lẫn nhau lúc chạy: ${cycle.join(", ")}`,
  }));
}
