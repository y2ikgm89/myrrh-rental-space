/**
 * architecture テスト用の再帰ファイル収集ヘルパー。
 *
 * `architecture-boundaries.test.ts` から抜き出し、split 後の後続 test
 * (`section-config-widening-cast.test.ts` / `type-safety-cast-drift.test.ts` /
 * `next-config-cache-tag-emission.test.ts` etc.) が同じロジックを共有する。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** TS / TSX を再帰収集 (architecture gate の横断 grep 用) */
export function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Module reachability graph (module-reachability.test.ts が使う)
// ---------------------------------------------------------------------------

/** import / export-from / 動的 import の specifier を抽出する。
 * `from "..."` 節（type-only 含む）・`import "..."`（副作用 import）・
 * `import("...")`（動的 import、文字列リテラルのみ）の3形をまとめて拾う。
 * 行コメントとブロックコメント（JSDoc の @example 含む）は走査前に落とす。
 * 文字列リテラル内の `//` / `/*` は触らない。
 */
const IMPORT_SPECIFIER_RE =
  /(?:from\s+|^\s*import\s+|import\s*\(\s*)["']([^"']+)["']/gm;

/** 行・ブロックコメントを除去する。文字列リテラル内は温存する。
 *
 * gate がソースを grep するときはこれを通す。通さないと
 * **「以前はこうだった」と書いた自分のコメントに自分で引っかかる**。 */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = i + 1 < n ? source[i + 1] : "";

    if (c === "/" && next === "/") {
      i += 2;
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i + 1 < n && !(source[i] === "*" && source[i + 1] === "/")) {
        i += 1;
      }
      i = Math.min(i + 2, n);
      out += " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < n) {
        const sc = source[i];
        out += sc;
        if (sc === "\\") {
          if (i + 1 < n) {
            out += source[i + 1] ?? "";
            i += 2;
            continue;
          }
        }
        if (sc === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

export function extractImportSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  for (const match of stripComments(content).matchAll(IMPORT_SPECIFIER_RE)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/** tsconfig.json paths の longest-prefix alias 解決（順序が重要）。 */
const ALIAS_TABLE: readonly {
  readonly prefix: string;
  readonly target: string;
}[] = [
  { prefix: "@/admin/", target: "src/app/(admin)/admin/(dashboard)/_shared/" },
  { prefix: "@/public/", target: "src/app/(public)/_shared/" },
  { prefix: "@/shared/", target: "src/shared/" },
  { prefix: "@/", target: "src/" },
];

export type ResolveResult =
  | { readonly kind: "internal"; readonly relPath: string }
  | { readonly kind: "external" };

/**
 * import specifier を repo ルート相対パス（POSIX区切り、拡張子なし基準）に解決する。
 * `@generated/*` と bare specifier（node_modules）は external として無視する。
 * 拡張子解決は `<base>` → `.ts` → `.tsx` → `/index.ts` → `/index.tsx` の順
 * （moduleResolution: bundler と整合）。存在ファイル集合と照合するのは呼び出し側。
 */
export function resolveModuleSpecifier(
  fromRelPath: string,
  specifier: string,
): ResolveResult {
  if (specifier.startsWith("@generated/")) return { kind: "external" };

  if (specifier.startsWith(".")) {
    const fromDir = fromRelPath.split("/").slice(0, -1);
    const parts = specifier.split("/");
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") fromDir.pop();
      else fromDir.push(part);
    }
    return { kind: "internal", relPath: fromDir.join("/") };
  }

  for (const { prefix, target } of ALIAS_TABLE) {
    if (specifier.startsWith(prefix)) {
      return {
        kind: "internal",
        relPath: target + specifier.slice(prefix.length),
      };
    }
  }

  return { kind: "external" };
}

/** `<base>` / `.ts` / `.tsx` / `/index.ts` / `/index.tsx` の順で実在ファイルを探す。 */
export function resolveToExistingFile(
  relPathNoExt: string,
  existingFiles: ReadonlySet<string>,
): string | null {
  const candidates = [
    relPathNoExt,
    `${relPathNoExt}.ts`,
    `${relPathNoExt}.tsx`,
    `${relPathNoExt}/index.ts`,
    `${relPathNoExt}/index.tsx`,
  ];
  for (const candidate of candidates) {
    if (existingFiles.has(candidate)) return candidate;
  }
  return null;
}

export interface ModuleGraph {
  readonly files: readonly string[];
  readonly edges: ReadonlyMap<string, readonly string[]>;
  readonly unresolvedSpecifiers: readonly string[];
}

/**
 * `src/**\/*.{ts,tsx}` の import グラフを構築する。`repoRoot` からの相対パス
 * （POSIX区切り）をノードキーにする。
 */
export function buildModuleGraph(repoRoot: string): ModuleGraph {
  const absFiles = collectSourceFiles(join(repoRoot, "src"));
  const relFiles = absFiles.map((f) =>
    f.slice(repoRoot.length + 1).replaceAll("\\", "/"),
  );
  const fileSet = new Set(relFiles);

  const edges = new Map<string, string[]>();
  const unresolvedSpecifiers: string[] = [];

  for (const relFile of relFiles) {
    const content = readFileSync(join(repoRoot, relFile), "utf-8");
    const specifiers = extractImportSpecifiers(content);
    const targets: string[] = [];

    for (const specifier of specifiers) {
      const resolved = resolveModuleSpecifier(relFile, specifier);
      if (resolved.kind === "external") continue;

      const target = resolveToExistingFile(resolved.relPath, fileSet);
      if (target === null) {
        unresolvedSpecifiers.push(`${relFile} -> ${specifier}`);
        continue;
      }
      targets.push(target);
    }

    edges.set(relFile, targets);
  }

  return { files: relFiles, edges, unresolvedSpecifiers };
}

/** グラフ上で `roots` から到達可能な全ノードを BFS で求める。 */
export function findReachableFiles(
  graph: ModuleGraph,
  roots: readonly string[],
): Set<string> {
  const reachable = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || reachable.has(current)) continue;
    reachable.add(current);

    const targets = graph.edges.get(current) ?? [];
    for (const target of targets) {
      if (!reachable.has(target)) queue.push(target);
    }
  }

  return reachable;
}
