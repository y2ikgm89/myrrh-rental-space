import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "src", "app");

type QueryImport = {
  readonly modulePath: string;
  readonly localNames: readonly string[];
};

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
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

function normalizePath(file: string): string {
  return relative(ROOT, file).replaceAll("\\", "/");
}

function isClientComponent(source: string): boolean {
  return /^\s*["']use client["'];?/u.test(source);
}

function isServerActionOrRouteHandler(file: string, source: string): boolean {
  const name = basename(file);
  return (
    name === "route.ts" ||
    name === "route.tsx" ||
    /^\s*["']use server["'];?/u.test(source) ||
    normalizePath(file).includes("/_actions/")
  );
}

function isRenderableServerSource(file: string, source: string): boolean {
  if (isClientComponent(source)) return false;
  if (isServerActionOrRouteHandler(file, source)) return false;

  const normalized = normalizePath(file);
  return (
    normalized.endsWith(".tsx") ||
    normalized === "src/app/sitemap.ts" ||
    normalized === "src/app/manifest.ts"
  );
}

function parseQueryImports(source: string): QueryImport[] {
  const imports: QueryImport[] = [];
  const importRe =
    /import\s+(?!type\b)(?<clause>[^;]*?)\s+from\s+["'](?<module>@\/shared\/domain\/[^"']*)["'];?/gu;

  for (const match of source.matchAll(importRe)) {
    const clause = match.groups?.["clause"] ?? "";
    const modulePath = match.groups?.["module"] ?? "";
    const named = /\{(?<imports>[\s\S]*?)\}/u.exec(clause)?.groups?.["imports"];

    if (!named) continue;
    if (!isDbBackedDomainModule(modulePath)) continue;

    const localNames = named
      .split(",")
      .map((rawName) => rawName.trim())
      .filter((rawName) => rawName.length > 0 && !rawName.startsWith("type "))
      .map((rawName) => {
        const withoutInlineComment = rawName.replace(/\/\/.*$/u, "").trim();
        const alias = /\bas\s+(?<alias>[A-Za-z_$][\w$]*)$/u.exec(
          withoutInlineComment,
        )?.groups?.["alias"];
        return alias ?? withoutInlineComment.split(/\s+/u)[0] ?? "";
      })
      .filter((name) => /^[A-Za-z_$][\w$]*$/u.test(name));

    if (localNames.length > 0) {
      imports.push({ modulePath, localNames });
    }
  }

  return imports;
}

function resolveDomainModuleFile(modulePath: string): string | null {
  if (!modulePath.startsWith("@/shared/domain/")) return null;

  const relativePath = modulePath.replace("@/", "");
  const withoutExtension = join(ROOT, "src", relativePath);
  const candidates = [
    `${withoutExtension}.ts`,
    `${withoutExtension}.tsx`,
    join(withoutExtension, "index.ts"),
    join(withoutExtension, "index.tsx"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function isDbBackedDomainModule(modulePath: string): boolean {
  const resolved = resolveDomainModuleFile(modulePath);
  if (!resolved) return false;

  const source = readFileSync(resolved, "utf8");
  return (
    source.includes("@/shared/db/prisma") ||
    /\bprisma\.(?:\$?\w+|\$transaction|\$queryRaw|\$executeRaw)\b/u.test(source)
  );
}

function maskImportDeclarations(source: string): string {
  return source.replace(/import[^;]*;?/gu, (importDeclaration) =>
    " ".repeat(importDeclaration.length),
  );
}

function maskComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/gu, (comment) =>
    " ".repeat(comment.length),
  );
}

function findCallIndex(source: string, name: string): number {
  const callRe = new RegExp(`\\b${name}\\s*\\(`, "u");
  const match = callRe.exec(source);
  return match?.index ?? -1;
}

function firstQueryCallIndex(source: string, imports: readonly QueryImport[]) {
  const calls = imports.flatMap((queryImport) =>
    queryImport.localNames
      .map((name) => ({
        name,
        modulePath: queryImport.modulePath,
        index: findCallIndex(source, name),
      }))
      .filter((call) => call.index >= 0),
  );

  if (calls.length === 0) return null;

  return calls.reduce((earliest, call) =>
    call.index < earliest.index ? call : earliest,
  );
}

describe("Next.js runtime DB boundaries", () => {
  test("detects DB-backed domain imports whose module name does not include queries", () => {
    const imports = parseQueryImports(`
      import { getAnnouncementBars } from "@/shared/domain/settings/announcement-bar";
    `);

    expect(imports).toEqual([
      {
        modulePath: "@/shared/domain/settings/announcement-bar",
        localNames: ["getAnnouncementBars"],
      },
    ]);
  });

  test("server-rendered app sources call connection() before DB-backed query reads", () => {
    const checkedFiles: string[] = [];
    const offenders: string[] = [];

    for (const file of collectSourceFiles(APP_ROOT)) {
      const source = readFileSync(file, "utf8");
      if (normalizePath(file) === "src/app/sitemap.ts") continue;
      if (!isRenderableServerSource(file, source)) continue;

      const queryImports = parseQueryImports(source);
      if (queryImports.length === 0) continue;

      const executableSource = maskComments(maskImportDeclarations(source));
      const firstQueryCall = firstQueryCallIndex(
        executableSource,
        queryImports,
      );
      if (!firstQueryCall) continue;

      checkedFiles.push(normalizePath(file));

      const connectionImportIndex =
        source.match(
          /import\s*\{[^}]*\bconnection\b[^}]*\}\s*from\s*"next\/server";/u,
        )?.index ?? -1;
      const connectionCallIndex = source.indexOf("await connection();");

      if (
        connectionImportIndex < 0 ||
        connectionCallIndex < 0 ||
        connectionCallIndex > firstQueryCall.index
      ) {
        offenders.push(
          `${normalizePath(file)} -> ${firstQueryCall.name} from ${
            firstQueryCall.modulePath
          }`,
        );
      }
    }

    expect(checkedFiles.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  test("sitemap default export calls connection() before its pure builder", () => {
    const source = readFileSync(join(APP_ROOT, "sitemap.ts"), "utf8");
    const defaultExportIndex = source.indexOf(
      "export default async function sitemap",
    );
    const connectionCallIndex = source.indexOf(
      "await connection();",
      defaultExportIndex,
    );
    const builderCallIndex = source.indexOf(
      "return buildSitemap();",
      defaultExportIndex,
    );

    expect(defaultExportIndex).toBeGreaterThanOrEqual(0);
    expect(connectionCallIndex).toBeGreaterThan(defaultExportIndex);
    expect(builderCallIndex).toBeGreaterThan(connectionCallIndex);
  });
});
