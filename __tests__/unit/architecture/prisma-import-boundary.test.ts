/**
 * Prisma import / gateway / singleton boundary gates.
 *
 * Extracted from `architecture-boundaries.test.ts` (first themed chunk) to shrink
 * the merge-conflict hotspot while keeping pre-push coverage via lefthook's
 * `__tests__/unit/architecture` directory run.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  collectSourceFiles,
  resolveModuleSpecifier,
} from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");
const SHARED_DB_ROOT = join(SRC_ROOT, "shared", "db");
const ENUMS_GATEWAY_ROOT = join(
  SRC_ROOT,
  "shared",
  "lib",
  "validations",
  "enums",
);
const SHARED_DOMAIN_ROOT = join(SRC_ROOT, "shared", "domain");
const PUBLIC_APP_ROOT = join(SRC_ROOT, "app", "(public)");

function collectNonCommentOffenders(
  files: string[],
  pattern: RegExp,
): string[] {
  return files
    .filter((file) => {
      const lines = readFileSync(file, "utf8").split(/\r?\n/u);
      return lines.some((line) => {
        const trimmed = line.trim();
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*")
        ) {
          return false;
        }
        return pattern.test(line);
      });
    })
    .map((file) => relative(ROOT, file));
}

/** prisma facade の repo ルート相対パス（拡張子なし）。 */
const PRISMA_FACADE = "src/shared/db/prisma";
/** 削除済み legacy shim。同じ経路で「復活していない」ことを見る。 */
const LEGACY_PRISMA_SHIM = "src/shared/lib/prisma";

/** import / export / 動的 import / require のどれでもモジュール指定子を拾う。 */
const MODULE_SPECIFIER =
  /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/gu;

function toRelPosix(absPath: string): string {
  return relative(ROOT, absPath).replaceAll("\\", "/");
}

/**
 * そのソースが `targets`（repo ルート相対・拡張子なし）のどれかを import して
 * いるか。**綴りではなく解決後のパスで判定する** — `@/shared/db/prisma` と
 * `./prisma` は同じモジュールなので、文字列一致では後者が素通りする
 * （第6次監査 M-16。実物は src/shared/db/better-auth-adapter.ts:12）。
 * コメント行は数えない。
 *
 * 限界: `@generated/` 配下は `resolveModuleSpecifier` が external として
 * 捨てるため、この経路では判定できない。generated 系の判定は文字列一致のまま。
 */
function importsResolvedModule(
  fromRelPath: string,
  source: string,
  targets: readonly string[],
): boolean {
  return source.split(/\r?\n/u).some((line) => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      return false;
    }
    for (const match of line.matchAll(MODULE_SPECIFIER)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const resolved = resolveModuleSpecifier(fromRelPath, specifier);
      if (resolved.kind === "internal" && targets.includes(resolved.relPath)) {
        return true;
      }
    }
    return false;
  });
}

/** 絶対パスのファイルが `targets` のどれかを import しているか。 */
function fileImportsResolvedModule(
  absFile: string,
  targets: readonly string[],
): boolean {
  return importsResolvedModule(
    toRelPosix(absFile),
    readFileSync(absFile, "utf8"),
    targets,
  );
}

function collectPrismaImportingFiles(): string[] {
  const hits = collectSourceFiles(SRC_ROOT).filter((file) =>
    fileImportsResolvedModule(file, [PRISMA_FACADE]),
  );
  // prisma.ts 自身は import 側に現れないが、singleton 定義そのものが
  // server-only を要求されるので母集合に固定で加える。
  const set = new Set<string>([join(SHARED_DB_ROOT, "prisma.ts"), ...hits]);
  return [...set].sort();
}

describe("prisma import boundary", () => {
  test("fixture: prisma facade を相対パスで import するファイルも母集合に入る", () => {
    const files = collectPrismaImportingFiles().map((file) =>
      relative(ROOT, file).replaceAll("\\", "/"),
    );

    // 落ちるべき形（第6次監査 M-16 の実物）:
    // src/shared/db/better-auth-adapter.ts:12 は `import { prisma } from "./prisma";`。
    // 綴り一致の判定では母集合から漏れ、server-only 強制が効かない。
    expect(files).toContain("src/shared/db/better-auth-adapter.ts");

    // 落ちてはいけない形: 同じディレクトリの別モジュール。
    // src/shared/db/prisma-input-json.ts は prisma facade を import しない
    // （`@generated/prisma/client` の型と DomainError だけ）。
    // 解決後パスの前方一致で書くとここが誤検知になる。
    expect(files).not.toContain("src/shared/db/prisma-input-json.ts");
  });

  test("generated Prisma import は shared/db の外に残さない", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = sourceFiles
      .filter((file) => !file.startsWith(SHARED_DB_ROOT))
      .filter((file) => !file.startsWith(ENUMS_GATEWAY_ROOT))
      .filter((file) => !file.startsWith(SHARED_DOMAIN_ROOT))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          source.includes("@generated/prisma") ||
          source.includes("shared/generated/prisma")
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  }, 30000);

  test("shared/domain は @generated/prisma/enums を直接 import しない（prisma-types SSoT）", () => {
    const DOMAIN_ENUM_IMPORT_ALLOWLIST = new Set<string>();

    const domainFiles = collectSourceFiles(SHARED_DOMAIN_ROOT).filter(
      (file) => {
        const rel = relative(ROOT, file).replace(/\\/g, "/");
        return !DOMAIN_ENUM_IMPORT_ALLOWLIST.has(rel);
      },
    );

    const offenders = collectNonCommentOffenders(
      domainFiles,
      /@generated\/prisma\/enums/u,
    );

    expect(offenders).toEqual([]);
  }, 30000);

  test("enums gateway は @generated/prisma/client を import しない（参照同一性フットガン排除）", () => {
    const gatewayFiles = collectSourceFiles(ENUMS_GATEWAY_ROOT).filter((file) =>
      file.endsWith(".ts"),
    );
    expect(gatewayFiles.length).toBeGreaterThan(0);

    for (const gatewayFile of gatewayFiles) {
      const codeLines = readFileSync(gatewayFile, "utf8")
        .split(/\r?\n/u)
        .filter((line) => {
          const trimmed = line.trim();
          return (
            trimmed.length > 0 &&
            !trimmed.startsWith("//") &&
            !trimmed.startsWith("*") &&
            !trimmed.startsWith("/*")
          );
        });
      const codeSource = codeLines.join("\n");

      expect(codeSource).not.toMatch(
        /from\s+["']@generated\/prisma\/client["']/u,
      );
      expect(codeSource).not.toMatch(/^export\s+\{\s*Prisma\b/mu);
      expect(codeSource).not.toMatch(/\bPrismaClient\b/u);

      const importLines = codeLines.filter((line) =>
        line.includes("@generated/prisma"),
      );
      for (const line of importLines) {
        expect(line).toMatch(/@generated\/prisma\/(browser|enums)["']/u);
      }
    }
  });

  test("PrismaClient のインスタンス化は shared/db/prisma.ts のみ", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const allowedFile = join(SHARED_DB_ROOT, "prisma.ts");
    const offenders = sourceFiles
      .filter((file) => file !== allowedFile)
      .filter((file) => {
        const lines = readFileSync(file, "utf8").split(/\r?\n/u);
        return lines.some((line) => {
          const trimmed = line.trim();
          if (
            trimmed.startsWith("//") ||
            trimmed.startsWith("*") ||
            trimmed.startsWith("/*")
          ) {
            return false;
          }
          return /\bnew\s+PrismaClient\s*\(/u.test(line);
        });
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("shared/db/prisma.ts は prisma singleton を export する", () => {
    const prismaFile = join(SHARED_DB_ROOT, "prisma.ts");
    const source = readFileSync(prismaFile, "utf8");
    expect(source).toMatch(/export\s+const\s+prisma\s*=/u);
  });

  test("legacy prisma shim import は残さない", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = sourceFiles
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes('from "@/shared/lib/prisma"');
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("public app layer は prisma facade を直接 import しない", () => {
    const sourceFiles = collectSourceFiles(PUBLIC_APP_ROOT);
    const offenders = sourceFiles
      .filter((file) =>
        fileImportsResolvedModule(file, [PRISMA_FACADE, LEGACY_PRISMA_SHIM]),
      )
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("app layer は generated Prisma model/client type を直接 import しない", () => {
    const appRoot = join(SRC_ROOT, "app");
    const sourceFiles = collectSourceFiles(appRoot);
    const offenders = sourceFiles
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          source.includes("@/shared/db/models") ||
          source.includes("@/shared/db/client")
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("shared/ の外に Prisma 直 import を残さない", () => {
    const SHARED_ROOT = join(SRC_ROOT, "shared");
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    // `from "…"` の文字列一致だと動的 import も相対 import も素通りする。
    // どれも「app 層が Prisma を直に握る」形なので解決後パスで同じ扱いにする。
    const offenders = sourceFiles
      .filter((file) => !file.startsWith(SHARED_ROOT))
      .filter((file) => fileImportsResolvedModule(file, [PRISMA_FACADE]))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("shared/db barrel は shared/db の外から import しない", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = sourceFiles
      .filter((file) => !file.startsWith(SHARED_DB_ROOT))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes('from "@/shared/db"');
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("legacy db shim files を再導入しない", () => {
    expect(existsSync(join(SRC_ROOT, "shared", "db", "index.ts"))).toBe(false);
    expect(existsSync(join(SRC_ROOT, "shared", "db", "client.ts"))).toBe(false);
    expect(
      existsSync(join(SRC_ROOT, "shared", "db", "models", "Page.ts")),
    ).toBe(false);
  });

  test("shared/ 内の Prisma 直 import / model 呼出は domain・db 配下に限定する（placement gate）", () => {
    const SHARED_ROOT = join(SRC_ROOT, "shared");
    const ALLOWLIST = new Set<string>();
    const containsPrismaModelCall = (source: string) =>
      /\bprisma\.\w+\.\w+/u.test(source);

    const offenders = collectSourceFiles(SHARED_ROOT)
      .filter(
        (file) =>
          !file.startsWith(SHARED_DOMAIN_ROOT) &&
          !file.startsWith(SHARED_DB_ROOT),
      )
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          importsResolvedModule(toRelPosix(file), source, [PRISMA_FACADE]) &&
          containsPrismaModelCall(source)
        );
      })
      .map((file) => relative(ROOT, file))
      .filter((rel) => !ALLOWLIST.has(rel));

    expect(offenders).toEqual([]);
  });

  test("`@/shared/db/prisma` を import する全ファイルが server-only を明示する", () => {
    const files = collectPrismaImportingFiles();
    expect(files.length).toBeGreaterThan(10);

    const offenders = files
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return !/import\s+["']server-only["'];?/.test(source);
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
