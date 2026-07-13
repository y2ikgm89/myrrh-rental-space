import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { expectRecord } from "../helpers/type-assertions";
import { collectSourceFiles } from "../helpers/architecture-fs";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");
const SCRIPTS_ROOT = join(ROOT, "scripts");
const SHARED_DB_ROOT = join(SRC_ROOT, "shared", "db");
const ENUMS_GATEWAY_ROOT = join(
  SRC_ROOT,
  "shared",
  "lib",
  "validations",
  "enums",
);
const SHARED_DOMAIN_ROOT = join(SRC_ROOT, "shared", "domain");
const APP_ROUTE_ROOT = join(SRC_ROOT, "app");
const API_CRON_ROUTE_ROOT = join(SRC_ROOT, "app", "api", "cron");
const API_WEBHOOK_ROUTE_ROOT = join(SRC_ROOT, "app", "api", "webhooks");
const PUBLIC_APP_ROOT = join(SRC_ROOT, "app", "(public)");
const PUBLIC_LAYOUT_FILE = join(PUBLIC_APP_ROOT, "layout.tsx");
const PACKAGE_JSON_FILE = join(ROOT, "package.json");
const BUN_LOCK_FILE = join(ROOT, "bun.lock");
const TYPE_CHECK_SCRIPT_FILE = join(ROOT, "scripts", "type-check.ts");
const VALIDATE_SCRIPT_FILE = join(ROOT, "scripts", "validate.ts");
const LINT_FORMAT_SCRIPT_FILE = join(ROOT, "scripts", "lint-format.ts");
const PRETTIER_SCRIPT_FILE = join(ROOT, "scripts", "prettier.ts");
const LHCI_START_SCRIPT_FILE = join(ROOT, "scripts", "lhci-start.ts");
const NEXT_CONFIG_FILE = join(ROOT, "next.config.ts");
const CLOUDBUILD_FILE = join(ROOT, "cloudbuild.yaml");
const AUTH_ROUTE_FILE = join(
  SRC_ROOT,
  "app",
  "api",
  "auth",
  "[...all]",
  "route.ts",
);

function expectRecordFieldArray(data: unknown, field: string): void {
  expectRecord(data);
  const value = data[field];
  expect(Array.isArray(value)).toBe(true);
}
const CALENDAR_SYNC_CRON_ROUTE_FILE = join(
  SRC_ROOT,
  "app",
  "api",
  "cron",
  "calendar-sync",
  "route.ts",
);
const INSTAGRAM_REFRESH_CRON_ROUTE_FILE = join(
  SRC_ROOT,
  "app",
  "api",
  "cron",
  "instagram-refresh",
  "route.ts",
);
const GOOGLE_CALENDAR_WEBHOOK_ROUTE_FILE = join(
  SRC_ROOT,
  "app",
  "api",
  "webhooks",
  "google-calendar",
  "route.ts",
);
const GOOGLE_SERVICE_ACCOUNT_BOUNDARY_FILES = [
  join(SRC_ROOT, "shared", "domain", "settings", "commands.ts"),
  join(SRC_ROOT, "shared", "lib", "analytics", "ga-data-api.ts"),
  join(SRC_ROOT, "shared", "lib", "google-calendar", "service-account.ts"),
];
const REACT_COMPILER_MEMO_EXEMPT_FILES = [
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "components",
    "editor",
    "lexical",
    "plugins",
    "lexical-draggable-block-plugin.ts",
  ),
];
const THIN_ADMIN_ACTION_FILES = [
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "navigation.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "announcement-bar.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "block-template.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "coupon.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "faq.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "customer.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "inquiry.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "location.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "instagram.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "news.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "post",
    "mutations.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "space-category.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "basic.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "business.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "email.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "other.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "discount.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "tax.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "google-calendar.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "settings",
    "stripe.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "editor-comment.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "media.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "pages.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "page-section.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "space.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "reservation",
    "mutations.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "reservation",
    "admin.ts",
  ),
];
/**
 * `@/shared/db/prisma` を import する src 配下の全ファイルを動的に列挙する。
 *
 * 旧実装は手書き allowlist だったが、追加ファイルが allowlist に登録されない限り
 * gate が dead になる drift があり 58+ ファイルが未保護だった。
 * import 検出ベースに切り替えて drift gate を回復する。
 *
 * prisma.ts / better-auth-adapter.ts は自身を import しないため明示的に含める
 * （これらは Prisma client を直接ホストするため当然 server-only 必須）。
 */
function collectPrismaImportingFiles(): string[] {
  const importRe = /from\s+["']@\/shared\/db\/prisma["']/u;
  const hits = collectSourceFiles(SRC_ROOT).filter((file) => {
    const source = readFileSync(file, "utf8");
    return importRe.test(source);
  });
  const seed = [
    join(SRC_ROOT, "shared", "db", "prisma.ts"),
    join(SRC_ROOT, "shared", "db", "better-auth-adapter.ts"),
  ];
  const set = new Set<string>([...seed, ...hits]);
  return [...set].sort();
}

/** TS / TSX / CSS を再帰収集（design token 廃止の横断 grep 用） */
function collectStyleSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectStyleSourceFiles(fullPath));
      continue;
    }

    if (
      entry.name.endsWith(".ts") ||
      entry.name.endsWith(".tsx") ||
      entry.name.endsWith(".css")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

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

describe("architecture boundaries", () => {
  test("proxy.ts は DB-backed module を import しない", () => {
    const source = readFileSync(join(SRC_ROOT, "proxy.ts"), "utf8");

    expect(source).not.toContain("@/shared/db/prisma");
    expect(source).not.toContain("@/shared/lib/prisma");
    expect(source).not.toContain("@generated/prisma");
    expect(source).not.toMatch(/shared\/domain\/.*\/commands/u);
  });

  test("src/shared/ は @/admin・@/public を import しない（依存方向の保護）", () => {
    // shared は admin / public の双方から参照される下層。逆 import は
    // 依存方向の逆転（特に値 import は実行時依存）になり shared の再利用性を
    // 壊す。複数モデル横断の論理種別等の共有 SSoT は shared/domain 側に置く。
    const offenders = collectNonCommentOffenders(
      collectSourceFiles(join(SRC_ROOT, "shared")),
      /from\s+["']@\/(?:admin|public)(?:\/|["'])/u,
    );

    expect(offenders).toEqual([]);
  });

  test("shared/domain は bare な Date.toLocale* を使わず date-format SSoT を経由する", () => {
    // Cloud Run のプロセス TZ は UTC。timeZone 指定なしの toLocale*String は JST 想定の
    // 時刻を 9h ずらして整形し、reservation.notes 等に永続保存される（#418 サガで根絶した
    // TZ ドリフトの再発）。日付/時刻整形は Asia/Tokyo を固定した @/shared/lib/date-format の
    // ヘルパーに一本化する。Number.toLocaleString()（通貨整形・引数なし）は対象外。
    const offenders = collectNonCommentOffenders(
      collectSourceFiles(join(SRC_ROOT, "shared", "domain")),
      /\.toLocale(?:Date|Time)String\(|\.toLocaleString\(\s*["']ja/u,
    );

    expect(offenders).toEqual([]);
  });

  test("next.config.ts は stable typedRoutes を有効にする", () => {
    const source = readFileSync(NEXT_CONFIG_FILE, "utf8");

    expect(source).toContain("typedRoutes: true");
    expect(source).not.toContain("experimental: { typedRoutes");
  });

  test("next.config.ts は TypeScript build errors を無視しない", () => {
    const source = readFileSync(NEXT_CONFIG_FILE, "utf8");

    expect(source).not.toMatch(/ignoreBuildErrors\s*:\s*true/u);
  });

  test("admin _shared は App Router special file names を使わない", () => {
    const adminSharedRoot = join(
      APP_ROUTE_ROOT,
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
    );
    const appRouterSpecialFiles = new Set([
      "default.ts",
      "default.tsx",
      "error.ts",
      "error.tsx",
      "layout.ts",
      "layout.tsx",
      "loading.ts",
      "loading.tsx",
      "not-found.ts",
      "not-found.tsx",
      "page.ts",
      "page.tsx",
      "route.ts",
      "route.tsx",
      "template.ts",
      "template.tsx",
    ]);
    const offenders = collectSourceFiles(adminSharedRoot)
      .filter((file) =>
        appRouterSpecialFiles.has(file.split(/[\\/]/u).at(-1) ?? ""),
      )
      .map((file) => relative(ROOT, file))
      .sort();

    expect(offenders).toEqual([]);
  });

  test("public route-level loading/error/not-found は layout の main landmark を重複させない", () => {
    const publicSpecialFiles = collectSourceFiles(PUBLIC_APP_ROOT).filter(
      (file) =>
        /(?:^|[\\/])(?:loading|error|not-found)\.tsx$/u.test(file) &&
        file !== PUBLIC_LAYOUT_FILE,
    );
    const offenders = collectNonCommentOffenders(
      publicSpecialFiles,
      /<main\b|id=["']main-content["']/u,
    );

    expect(publicSpecialFiles.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  // 全 app route file fs traverse + regex で 5s default timeout を超えるため 30s に延長
  test("cacheComponents 有効時は route segment config export を残さない", () => {
    const nextConfigSource = readFileSync(NEXT_CONFIG_FILE, "utf8");
    expect(nextConfigSource).toContain("cacheComponents: true");

    const offenders = collectNonCommentOffenders(
      collectSourceFiles(APP_ROUTE_ROOT),
      /export\s+const\s+(?:dynamic|dynamicParams|revalidate|fetchCache|runtime|preferredRegion|maxDuration)\b/u,
    );

    expect(offenders).toEqual([]);
  }, 30000);

  test("next.config.ts の Cache-Control: catch-all を先頭に、認証/PII ルートを後勝ち no-store にする", () => {
    const source = readFileSync(NEXT_CONFIG_FILE, "utf8");

    // 指定位置の直後にある Cache-Control の value 文字列を取り出す
    const valueAfter = (fromIndex: number): string => {
      const valueIndex = source.indexOf("value:", fromIndex);
      const open = source.indexOf('"', valueIndex);
      const close = source.indexOf('"', open + 1);
      return source.slice(open + 1, close);
    };

    const catchAllIndex = source.indexOf('source: "/:path*"');
    expect(catchAllIndex).toBeGreaterThanOrEqual(0);
    // catch-all は公開キャッシュ（エッジキャッシュ維持のため no-store にしない）。
    // max-age=0+must-revalidate でブラウザを毎回 CF edge へ revalidate させ、
    // s-maxage=3600 で CF が 1 時間キャッシュ。canonical Cloudflare pattern。
    expect(valueAfter(catchAllIndex)).toBe(
      "public, max-age=0, must-revalidate, s-maxage=3600, stale-while-revalidate=3600",
    );

    // 認証・個人情報を含むルートは origin で no-store（RFC 9111 / MDN）。
    // Cloudflare 除外ルールへの単一依存を排除する defense-in-depth。
    // すべて catch-all より後ろに定義し last-match-wins で上書きさせる。
    for (const specificSource of [
      'source: "/admin/:path*"',
      'source: "/reservation/:path*"',
      'source: "/mypage/:path*"',
      'source: "/login/:path*"',
      'source: "/preview/:path*"',
      'source: "/contact/:path*"',
    ]) {
      const specificIndex = source.indexOf(specificSource);
      expect(specificIndex).toBeGreaterThanOrEqual(0);
      expect(catchAllIndex).toBeLessThan(specificIndex);
      expect(valueAfter(specificIndex)).toBe("private, no-store");
    }

    // API も origin で no-store。Next.js の precedence 上 next.config headers() が
    // Route Handler の Cache-Control を上書きする（実証済: config > route handler）ため、
    // API の Cache-Control 方針は next.config を SSoT とする。catch-all より後ろに定義する。
    const apiIndex = source.indexOf('source: "/api/:path*"');
    expect(apiIndex).toBeGreaterThanOrEqual(0);
    expect(catchAllIndex).toBeLessThan(apiIndex);
    expect(valueAfter(apiIndex)).toBe("private, no-store");
  });

  test("media.example.com placeholder を runtime 設定に残さない", () => {
    const offenders = collectNonCommentOffenders(
      [NEXT_CONFIG_FILE, join(SRC_ROOT, "proxy.ts")],
      /media\.example\.com/u,
    );

    expect(offenders).toEqual([]);
  });

  test("本番 source は next/font/google の build-time fetch に依存しない", () => {
    const offenders = collectNonCommentOffenders(
      collectSourceFiles(APP_ROUTE_ROOT),
      /from\s+["']next\/font\/google["']/u,
    );

    expect(offenders).toEqual([]);
  });

  test("source theme は配信していない Web font 名を参照しない", () => {
    const offenders = collectNonCommentOffenders(
      collectStyleSourceFiles(SRC_ROOT),
      /(?:Noto Sans JP|Cormorant Garamond)/u,
    );

    expect(offenders).toEqual([]);
  });

  test("React Compiler 対象コードは useMemo / useCallback import を残さない", () => {
    const offenders = collectNonCommentOffenders(
      collectSourceFiles(SRC_ROOT).filter(
        (file) => !REACT_COMPILER_MEMO_EXEMPT_FILES.includes(file),
      ),
      /import\s+\{[^}]*\buse(?:Memo|Callback)\b/u,
    );

    expect(offenders).toEqual([]);
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
  });

  test("enums gateway は @generated/prisma/client を import しない（参照同一性フットガン排除）", () => {
    // gateway は client-safe である必要があるため、server-only な
    // `@generated/prisma/client` から値を re-export してはならない。
    // Prisma.JsonNull / DbNull は browser entry と client entry で
    // 異なる runtime モジュール（runtime/index-browser vs runtime/client）を
    // 参照しており、unique object として実装されているため両者で別オブジェクト
    // 参照になる。Prisma client は identity 比較で sentinel を判定するため、
    // gateway 経由（browser 由来）の sentinel を渡すと検出されない。
    // gateway は browser entry の type 再 export と enums の値再 export のみ。
    const gatewayFile = join(ENUMS_GATEWAY_ROOT, "prisma-types.ts");
    if (!existsSync(gatewayFile)) return;

    // コメント・blank 行を除外した実コード行のみで検査
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

    // server-only の client entry import を禁止
    expect(codeSource).not.toMatch(
      /from\s+["']@generated\/prisma\/client["']/u,
    );
    // 値としての Prisma re-export を禁止（type-only に限定）
    expect(codeSource).not.toMatch(/^export\s+\{\s*Prisma\b/mu);
    // PrismaClient 自体の re-export を禁止（型・値とも）
    expect(codeSource).not.toMatch(/\bPrismaClient\b/u);
    // gateway は browser entry または enums entry のみから import 可能
    // （models / internal 等の他 entry は禁止）
    const importLines = codeLines.filter((line) =>
      line.includes("@generated/prisma"),
    );
    for (const line of importLines) {
      expect(line).toMatch(/@generated\/prisma\/(browser|enums)["']/u);
    }
  });

  test("PrismaClient のインスタンス化は shared/db/prisma.ts のみ", () => {
    // `new PrismaClient(...)` が許される唯一のファイルは shared/db/prisma.ts
    // それ以外で見つかった場合は singleton 規約違反
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const allowedFile = join(SHARED_DB_ROOT, "prisma.ts");
    const offenders = sourceFiles
      .filter((file) => file !== allowedFile)
      .filter((file) => {
        const lines = readFileSync(file, "utf8").split(/\r?\n/u);
        return lines.some((line) => {
          const trimmed = line.trim();
          // コメント行は除外
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

  test("shared/db/prisma.ts は basePrisma と prisma の両方を export する", () => {
    // basePrisma: Better Auth アダプター専用（$extends 前）→ `export { basePrisma }` 形式
    // prisma:     アプリ本体用（$extends 適用済み）       → `export const prisma = createAppPrismaClient(...)` 形式
    // 両方が export されていることが singleton 規約の前提
    const prismaFile = join(SHARED_DB_ROOT, "prisma.ts");
    const source = readFileSync(prismaFile, "utf8");
    expect(source).toMatch(/export\s+\{\s*basePrisma\s*\}/u);
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
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          source.includes('from "@/shared/db/prisma"') ||
          source.includes('from "@/shared/lib/prisma"')
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("deprecated spacing-section CSS variables は src 以下に残さない（Phase A: --space-* へ移行済み）", () => {
    const files = collectStyleSourceFiles(SRC_ROOT);
    const offenders = files
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes("--spacing-section");
      })
      .map((filePath) => relative(ROOT, filePath));

    expect(offenders).toEqual([]);
  });

  test("deprecated --container-max トークン (Tailwind v4 built-in w-max 衝突) は src 以下に残さない", () => {
    // Tailwind v4 の @theme `--container-*` は max-w-{name} / w-{name} を自動生成し、
    // `--container-max` は built-in `w-max` / `max-w-max` (= max-content) と silently 衝突する。
    // 命名を `--container-site` に統一済 (PR: refactor(public,mypage)!: --container-site rename)。
    // 過去のコメント / docstring 参照は collectNonCommentOffenders で除外する。
    const files = collectStyleSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(files, /--container-max\b/u);
    expect(offenders).toEqual([]);
  });

  test("deprecated getContainerMaxCss export は src 以下に残さない", () => {
    // `getContainerMaxCss` → `getContainerSiteCss` rename と同型のドリフト防止。
    const files = collectSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(
      files,
      /\bgetContainerMaxCss\b/u,
    );
    expect(offenders).toEqual([]);
  });

  test("deprecated terms requiredAt* 3 boolean は src 以下に残さない (TermsScope[] へ移行済み)", () => {
    // 旧 `requiredAtReservation` / `requiredAtInquiry` / `requiredAtSignup` 3 boolean は
    // `TermsScope[]` array column に統合された (PR: terms-domain overhaul)。
    // コメント・docstring の歴史的言及は collectNonCommentOffenders で除外する。
    const files = collectStyleSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(
      files,
      /\b(requiredAtReservation|requiredAtInquiry|requiredAtSignup)\b/u,
    );
    expect(offenders).toEqual([]);
  });

  test("TermsAgreement は append-only — UPDATE/DELETE/upsert を src 以下で禁止", () => {
    // TermsAgreement は法務証跡なので append-only。事後改竄を ESLint/test 双方で
    // 物理的に塞ぐ。Prisma の update / updateMany / delete / deleteMany / upsert /
    // deleteMany を src/ 配下から grep gate する。restore など意図的な再有効化は
    // 別 model (TermsDocument) の操作で行うので本 gate は terms_agreement のみ。
    const files = collectSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(
      files,
      /prisma\.termsAgreement\.(update|updateMany|delete|deleteMany|upsert)\b/u,
    );
    expect(offenders).toEqual([]);
  });

  test("TERMS_AGREEMENT_CONTEXT VARCHAR ラベルは src 以下に残さない (TermsScope enum へ移行済み)", () => {
    // `TERMS_AGREEMENT_CONTEXT` const は TermsScope enum に統合済 (PR: terms-domain overhaul)。
    const files = collectStyleSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(
      files,
      /\bTERMS_AGREEMENT_CONTEXT\b/u,
    );
    expect(offenders).toEqual([]);
  });

  test("mypage-nav.tsx は <select> mobile picker を再導入しない", () => {
    // PR #605 の妥協 native <select> 撤去後、4 NAV_ITEMS を grid grid-cols-4 md:flex で
    // 単一 DOM 統一。<select> の再導入を deny-list で防ぐ (情報設計破綻 + 3-tap 動線回避)。
    // collectNonCommentOffenders で JSDoc 内の言及 (例: 「PR #605 の妥協 native <select> 撤去」) は除外する。
    const mypageNavFile = join(
      PUBLIC_APP_ROOT,
      "mypage",
      "_components",
      "mypage-nav.tsx",
    );
    expect(existsSync(mypageNavFile)).toBe(true);
    const offenders = collectNonCommentOffenders(
      [mypageNavFile],
      /<select[\s>]/u,
    );
    expect(offenders).toEqual([]);
  });

  test("public セクション系 surface は px-4 / px-6 の横パディングを直書きしない（Container / SectionWrapper トークン経由）", () => {
    const sectionRoots = [
      join(PUBLIC_APP_ROOT, "_shared", "components", "sections"),
      join(PUBLIC_APP_ROOT, "_shared", "components", "page-hero"),
      join(PUBLIC_APP_ROOT, "_components", "homepage"),
    ];
    const files = sectionRoots
      .filter((dir) => existsSync(dir))
      .flatMap((dir) => collectSourceFiles(dir));
    const px4 = collectNonCommentOffenders(files, /\bpx-4\b/u);
    const px6 = collectNonCommentOffenders(files, /\bpx-6\b/u);

    expect({ px4, px6 }).toEqual({ px4: [], px6: [] });
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
    // app 層からの Prisma 直 import 禁止（CLAUDE.md のアーキテクチャ境界）
    // (calendar-sync $queryRaw は @/shared/domain/calendar-sync/locks helper に集約済、例外なし)
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = sourceFiles
      .filter((file) => !file.startsWith(SHARED_ROOT))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes('from "@/shared/db/prisma"');
      })
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
    // CLAUDE.md コア規約「DB query / command は src/shared/domain/<entity>/{queries,commands}.ts に置く」を
    // 機械強制する。shared/ 配下で prisma facade を import し、かつ `prisma.<model>.<method>` の形で
    // 実際に DB 呼出をしているファイルは原則 domain/db 配下に限る。
    // ALLOWLIST: domain/db に切り出すと過剰な抽象になる正当な lib 境界の例外のみ列挙する。
    const SHARED_ROOT = join(SRC_ROOT, "shared");
    const ALLOWLIST = new Set(
      [
        join(SRC_ROOT, "shared", "lib", "calendar-sync", "event-inbound.ts"),
        join(SRC_ROOT, "shared", "lib", "email", "event-emails.ts"),
        join(SRC_ROOT, "shared", "lib", "email", "inquiry-emails.ts"),
        join(
          SRC_ROOT,
          "shared",
          "lib",
          "google-business-profile",
          "location-sync.ts",
        ),
      ].map((file) => relative(ROOT, file)),
    );
    const importsPrisma = (source: string) =>
      /from\s+["']@\/shared\/db\/prisma["']/u.test(source);
    // `prisma.<model>.<method>` のみを「DB 呼出」とみなす。
    // prisma を delegate として下層 command に渡すだけのファイル（bootstrap / section-defaults）は
    // 二段目のドット参照を持たないため自然に除外される。
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
        return importsPrisma(source) && containsPrismaModelCall(source);
      })
      .map((file) => relative(ROOT, file))
      .filter((rel) => !ALLOWLIST.has(rel));

    expect(offenders).toEqual([]);
  });

  test("`@/shared/db/prisma` を import する全ファイルが server-only を明示する", () => {
    // 動的列挙: 手書き allowlist は追加ファイルが登録されない限り gate が dead になり、
    // 実際に 58+ ファイルが未保護で drift していた。`from "@/shared/db/prisma"` を持つ
    // ファイルを毎回走査して server-only 強制する canonical 方式に切り替えた。
    const files = collectPrismaImportingFiles();
    // sanity: 少なくとも prisma.ts + better-auth-adapter.ts + 主要 domain は検出される
    expect(files.length).toBeGreaterThan(10);

    const offenders = files
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return !/import\s+["']server-only["'];?/.test(source);
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("移行済み admin action は Prisma を直接 import しない", () => {
    // drift gate: 旧実装は `.filter(existsSync)` で不在 path を silent drop し、
    // リファクタで path が変わった THIN_ADMIN_ACTION_FILES エントリが vacuous test
    // 化していた（6 件が drop されても test は緑のままだった）。不在 path は
    // hard-fail させ、配列の更新漏れを機械検知する。
    const missing = THIN_ADMIN_ACTION_FILES.filter(
      (file) => !existsSync(file),
    ).map((file) => relative(ROOT, file));
    expect(missing).toEqual([]);

    const offenders = THIN_ADMIN_ACTION_FILES.filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        source.includes("@/shared/db/prisma") ||
        source.includes('from "@/shared/db"') ||
        source.includes("@generated/prisma")
      );
    }).map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("public root layout に NuqsAdapter が配置されている", () => {
    const source = readFileSync(PUBLIC_LAYOUT_FILE, "utf8");

    expect(source).toContain("NuqsAdapter");
  });

  test("管理 auth は IAP-only で Better Auth admin instance を再導入しない", () => {
    const source = readFileSync(
      join(SRC_ROOT, "shared", "lib", "admin-auth.ts"),
      "utf8",
    );

    expect(source).toContain("resolveIapIdentity");
    expect(source).not.toContain("createAdminAuth");
    expect(source).not.toContain("betterAuth");
    expect(source).not.toContain("export const adminAuth");
    expect(source).not.toContain("export async function getAuth");
    expect(source).not.toContain("resetAuthInstance");
  });

  test("Google OAuth の DB 管理 helper を再導入しない", () => {
    expect(
      existsSync(
        join(
          SRC_ROOT,
          "shared",
          "lib",
          "auth-config",
          "google-oauth-credentials.ts",
        ),
      ),
    ).toBe(false);
  });

  test("bun.lock の root package metadata は package.json と一致する", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(PACKAGE_JSON_FILE, "utf8"),
    );
    const bunLockSource = readFileSync(BUN_LOCK_FILE, "utf8");
    expectRecord(packageJson);

    expect(bunLockSource).toContain(`"name": "${packageJson["name"]}"`);
    expect(bunLockSource).not.toContain('"name": "myrrh-temp"');
  });

  test("@lexical/overflow は @lexical/react の推移依存に任せ、直接依存しない", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(PACKAGE_JSON_FILE, "utf8"),
    );
    expectRecord(packageJson);
    const dependencies = packageJson["dependencies"];
    expectRecord(dependencies);

    expect(dependencies["@lexical/overflow"]).toBeUndefined();
  });

  test("type-check は clean checkout 前提で増分 build state に依存しない", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(PACKAGE_JSON_FILE, "utf8"),
    );
    expectRecord(packageJson);
    const scripts = packageJson["scripts"];
    expectRecord(scripts);
    const typeCheckSource = readFileSync(TYPE_CHECK_SCRIPT_FILE, "utf8");

    expect(scripts["type-check"]).toBe("bun scripts/type-check.ts");
    expect(typeCheckSource).toContain('name: "prisma:generate"');
    expect(typeCheckSource).toContain('name: "next:typegen"');
    expect(typeCheckSource).toContain('name: "next:ensure-types"');
    expect(typeCheckSource).toContain('name: "next:clean-dev-types"');
    expect(typeCheckSource.match(/"--incremental"/gu)?.length).toBe(2);
    expect(typeCheckSource.match(/"false"/gu)?.length).toBe(2);
    expect(typeCheckSource).toContain('"tsconfig.test.json"');
    expect(scripts["build"]).toContain("bun run db:generate");
    expect(scripts["test:unit"]).toContain("bun run db:generate");
  });

  test("prepared skip-env build は Prisma client generation 済み CI job で再生成しない", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(PACKAGE_JSON_FILE, "utf8"),
    );
    expectRecord(packageJson);
    const scripts = packageJson["scripts"];
    expectRecord(scripts);
    const lhciStartSource = readFileSync(LHCI_START_SCRIPT_FILE, "utf8");

    expect(scripts["build:skip-env"]).toBe(
      "bun run toolchain:check && bun run db:generate && bun scripts/clean-next-dev-types.ts && bun run build:skip-env:next",
    );
    expect(scripts["build:skip-env:prepared"]).toBe(
      "bun run toolchain:check && bun scripts/clean-next-dev-types.ts && bun run build:skip-env:next",
    );
    expect(scripts["build:skip-env:next"]).toContain(
      "SKIP_ENV_VALIDATION=true next build",
    );
    expect(scripts["build:skip-env:prepared"]).not.toContain(
      "bun run db:generate",
    );
    expect(lhciStartSource).toContain('process.env["CI"]');
    expect(lhciStartSource).toContain('"build:skip-env:prepared"');
    expect(lhciStartSource).toContain('"build:skip-env"');
  });

  test("test scripts run real-DB integration tests only after test DB migrations", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(PACKAGE_JSON_FILE, "utf8"),
    );
    expectRecord(packageJson);
    const scripts = packageJson["scripts"];
    expectRecord(scripts);

    expect(scripts["test:db:migrate"]).toBe("bun scripts/migrate-test-db.ts");
    expect(scripts["test:integration"]).toBe(
      "bun run db:generate && bun run test:db:migrate && bun scripts/run-tests.ts __tests__/integration",
    );
    expect(scripts["test:all"]).toBe(
      "bun run db:generate && bun scripts/run-tests.ts __tests__/unit && bun run test:db:migrate && bun scripts/run-tests.ts __tests__/integration",
    );
    expect(scripts["test:all"]).not.toContain("bun run test:unit");
    expect(scripts["test:all"]).not.toContain("bun run test:integration");
  });

  test("db:reset は Prisma v7 の明示 seed workflow を使う", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(PACKAGE_JSON_FILE, "utf8"),
    );
    expectRecord(packageJson);
    const scripts = packageJson["scripts"];
    expectRecord(scripts);

    expect(scripts["db:seed"]).toBe("bunx --bun prisma db seed");
    expect(scripts["db:reset"]).toBe(
      "bunx --bun prisma migrate reset --force && bun run db:seed",
    );
  });

  test("production seed は運用時点データ（お知らせ帯・SNSリンク・News）と架空の法人情報を投入しない", () => {
    const source = readFileSync(join(ROOT, "prisma", "seed.ts"), "utf8");
    const devSeed = source.match(
      /async function seedDev\(\) \{[\s\S]*?\n\}/u,
    )?.[0];
    const productionSeed = source.match(
      /async function seedProduction\([\s\S]*?\n\}/u,
    )?.[0];

    expect(devSeed).toContain("await seedAnnouncementBar();");
    expect(productionSeed).not.toContain("await seedAnnouncementBar();");

    expect(devSeed).toContain("await seedSocialLinks();");
    expect(productionSeed).not.toContain("await seedSocialLinks();");

    expect(devSeed).toContain("await seedNews();");
    expect(productionSeed).not.toContain("await seedNews(");

    expect(productionSeed).toContain(
      "await seedSettings({ includeBusinessPlaceholders: false });",
    );
  });

  test("validate は type-check と lint を並列化し、lint concurrency を明示する", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(PACKAGE_JSON_FILE, "utf8"),
    );
    expectRecord(packageJson);
    const scripts = packageJson["scripts"];
    expectRecord(scripts);
    const validateSource = readFileSync(VALIDATE_SCRIPT_FILE, "utf8");

    expect(scripts["lint"]).toBe("eslint . --concurrency 4");
    expect(scripts["validate"]).toBe("bun scripts/validate.ts");
    expect(validateSource).toContain('name: "type-check"');
    expect(validateSource).toContain('command: ["bun", "run", "type-check"]');
    expect(validateSource).toContain('name: "lint"');
    expect(validateSource).toContain('command: ["bun", "run", "lint"]');
  });

  test("CI lint-format runner は format check と lint を並列化する", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(PACKAGE_JSON_FILE, "utf8"),
    );
    expectRecord(packageJson);
    const scripts = packageJson["scripts"];
    expectRecord(scripts);
    const lintFormatSource = readFileSync(LINT_FORMAT_SCRIPT_FILE, "utf8");

    expect(scripts["lint-format"]).toBe("bun scripts/lint-format.ts");
    expect(lintFormatSource).toContain('name: "format:check"');
    expect(lintFormatSource).toContain(
      'command: ["bun", "run", "format:check"]',
    );
    expect(lintFormatSource).toContain('name: "lint"');
    expect(lintFormatSource).toContain('command: ["bun", "run", "lint"]');
  });

  test("format scripts は対象指定時に repo 全体を追加チェックしない", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(PACKAGE_JSON_FILE, "utf8"),
    );
    expectRecord(packageJson);
    const scripts = packageJson["scripts"];
    expectRecord(scripts);
    const prettierSource = readFileSync(PRETTIER_SCRIPT_FILE, "utf8");

    expect(scripts["format"]).toBe("bun scripts/prettier.ts --write");
    expect(scripts["format:check"]).toBe("bun scripts/prettier.ts --check");
    expect(prettierSource).toContain('targets.length > 0 ? targets : ["."]');
    expect(prettierSource).toContain('"bunx", "prettier"');
  });

  test("Cloud Run deploy は Server Actions encryption key を runtime にも注入する", () => {
    const source = readFileSync(CLOUDBUILD_FILE, "utf8");

    expect(source).toContain(
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:${_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY_SECRET_VERSION}",
    );
  });

  test("cloudbuild.yaml: --set-secrets= と grant-secret-access step の SECRETS list は drift しない", () => {
    // Cloud Run `--set-secrets=` に新規 secret を追加した際、`grant-secret-access`
    // step の SECRETS list への追加を忘れると、初回 deploy 時に runtime SA が
    // その secret を読めず Permission denied で silent に revision 作成が失敗する
    // (実例: PR #982 で SECONDARY_ENCRYPTION_KEYS を追加した際に発生し、
    // deploy が 3 回連続で失敗した)。両 list を CI で drift 監視する。
    const source = readFileSync(CLOUDBUILD_FILE, "utf8");

    // deploy-public / deploy-admin 両方の `--set-secrets=` を集約する。
    // pattern: ENV_NAME=SECRET_NAME:${_VERSION_VAR}
    const setSecretsLines = [...source.matchAll(/--set-secrets=([^\n]+)/g)];
    expect(setSecretsLines.length).toBeGreaterThan(0);
    const secretsInDeploy = new Set<string>();
    for (const match of setSecretsLines) {
      const line = match[1] ?? "";
      for (const entry of line.matchAll(
        /[A-Z][A-Z0-9_]*=([A-Z][A-Z0-9_]*):/g,
      )) {
        secretsInDeploy.add(entry[1] ?? "");
      }
    }
    secretsInDeploy.delete("");

    // grant-secret-access step 内の SECRETS='...' whitespace-separated list を抽出する
    // (bracket 記法だと deploy-workflow の ${...} drift gate と衝突するため、両ゲート
    // 互換の bracketless single-quoted 記法で保持)。
    const grantMatch = source.match(/SECRETS='([\s\S]*?)'/);
    expect(grantMatch).not.toBeNull();
    const secretsInGrant = new Set(
      (grantMatch?.[1] ?? "")
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );

    // build 時に availableSecrets 経由で BUILD_SA に読ませる secret は runtime SA の
    // IAM 対象ではないので除外する (Cloud Build image build で読む、Cloud Run runtime
    // では読まない)。
    const BUILD_ONLY_SECRETS = new Set(["NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"]);
    for (const s of BUILD_ONLY_SECRETS) {
      // NEXT_SERVER_ACTIONS_ENCRYPTION_KEY は Cloud Run runtime にも注入されるため
      // 実は runtime SA でも読まれる。grant list にも含める契約が正しい。除外しない。
      void s;
    }

    expect([...secretsInGrant].sort()).toEqual([...secretsInDeploy].sort());
  });

  test("管理 Better Auth canonical route handler は削除済み", () => {
    expect(existsSync(AUTH_ROUTE_FILE)).toBe(false);
  });

  test("cache tag invalidation は CACHE_TAGS / getCacheTag を経由し、タグ文字列を直書きしない", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT).filter(
      (file) => !file.endsWith(join("shared", "lib", "constants", "cache.ts")),
    );
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /\b(?:cacheTag|updateTag|revalidateTag)\(\s*["'][^"']+["']/u,
    );

    expect(offenders).toEqual([]);
  });

  test("cron route は shared helper 経由で認証する", () => {
    for (const file of [
      CALENDAR_SYNC_CRON_ROUTE_FILE,
      INSTAGRAM_REFRESH_CRON_ROUTE_FILE,
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("authorizeCronRequest");
    }
  });

  test("Google Calendar webhook route は Zod schema でヘッダーを検証する", () => {
    const source = readFileSync(GOOGLE_CALENDAR_WEBHOOK_ROUTE_FILE, "utf8");

    expect(source).toContain("googleCalendarWebhookHeadersSchema");
    expect(source).toContain(".safeParse(");
  });

  test("サービスアカウント JSON は shared validation helper 経由で検証する", () => {
    const offenders = collectNonCommentOffenders(
      GOOGLE_SERVICE_ACCOUNT_BOUNDARY_FILES,
      /JSON\.parse\(/u,
    );

    expect(offenders).toEqual([]);
  });

  test("route handler は legacy success wrapper を返さない", () => {
    const routeFiles = collectSourceFiles(APP_ROUTE_ROOT).filter((file) =>
      file.endsWith(join("route.ts")),
    );
    const offenders = routeFiles
      .filter((file) => readFileSync(file, "utf8").includes("createSuccess("))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("admin route handler は success boolean payload と fieldErrors を返さない", () => {
    const adminRouteRoot = join(SRC_ROOT, "app", "(admin)", "admin", "api");
    const routeFiles = collectSourceFiles(adminRouteRoot).filter((file) =>
      file.endsWith(join("route.ts")),
    );
    const offenders = collectNonCommentOffenders(
      routeFiles,
      /\bsuccess\s*:\s*(?:true|false)\b|\bfieldErrors\b/u,
    );

    expect(offenders).toEqual([]);
  });

  test("cron / webhook route handler は legacy success boolean payload を返さない", () => {
    const routeFiles = [
      ...collectSourceFiles(API_CRON_ROUTE_ROOT),
      ...collectSourceFiles(API_WEBHOOK_ROUTE_ROOT),
    ].filter((file) => file.endsWith(join("route.ts")));
    const offenders = routeFiles
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /return\s+NextResponse\.json\(\s*\{\s*success\s*:\s*(?:true|false)\b/u.test(
          source,
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("route handler は request.json の parse error を catch(null) で握りつぶさない", () => {
    const routeFiles = collectSourceFiles(APP_ROUTE_ROOT).filter((file) =>
      file.endsWith(join("route.ts")),
    );
    const offenders = collectNonCommentOffenders(
      routeFiles,
      /request\.json\(\)\.catch\(\(\)\s*=>\s*null\)/u,
    );

    expect(offenders).toEqual([]);
  });

  test("admin app は JSON.parse(JSON.stringify(...)) による型逃がしを再導入しない", () => {
    const adminAppRoot = join(SRC_ROOT, "app", "(admin)");
    const offenders = collectNonCommentOffenders(
      collectSourceFiles(adminAppRoot),
      /JSON\.parse\(\s*JSON\.stringify\(/u,
    );

    expect(offenders).toEqual([]);
  });

  test("announcement-bar mutation action は legacy success wrapper を使わない", () => {
    const source = readFileSync(
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "announcement-bar.ts",
      ),
      "utf8",
    );

    expect(source).not.toContain("createSuccess(");
    expect(source).toContain("executeAdminMutationResult(");
  });

  test("settings basic/business/other mutation action は legacy success wrapper を使わない", () => {
    const files = [
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "basic.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "business.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "other.ts",
      ),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("createSuccess(");
      expect(source).not.toContain("type ActionResult");
      expect(source).not.toContain("executeAdminMutation(");
      expect(source).toContain("executeAdminMutationResult(");
    }
  });

  test("navigation mutation action は legacy success wrapper を使わない", () => {
    const files = [
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "navigation.ts",
      ),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("createSuccess(");
      expect(source).not.toContain("type ActionResult");
      expect(source).not.toContain("executeAdminMutation(");
      expect(source).toContain("executeAdminMutationResult(");
    }
  });

  test("external integration mutation action は legacy success wrapper を使わない", () => {
    const files = [
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "api-keys",
        "index.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "google-calendar.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "stripe.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "instagram.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "email.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "discount.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "settings",
        "tax.ts",
      ),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("createSuccess(");
      expect(source).not.toContain("type ActionResult");
      expect(source).not.toContain("executeAdminMutation(");
      expect(source).toContain("executeAdminMutationResult(");
    }
  });

  test("post/news/reservation/page/coupon/customer/faq/block-template mutation action は legacy success wrapper を使わない", () => {
    const files = [
      // post/ は mutation 実体ファイルを直接検証（index.ts は re-export barrel）
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "post",
        "mutations.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "post",
        "taxonomy.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "post",
        "bulk.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "news.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "reservation",
        "admin.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "reservation",
        "mutations.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "pages.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "coupon.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "customer.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "faq.ts",
      ),
      join(
        SRC_ROOT,
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "actions",
        "block-template.ts",
      ),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("createSuccess(");
      expect(source).not.toContain("type ActionResult");
      expect(source).not.toContain("executeAdminMutation(");
      expect(source).toContain("executeAdminMutationResult(");
    }
  });

  test("Phase 0 で削除済の旧 ButtonLabelToken / RichLabelInput / TokenLabel symbol が src/ に残存しない", () => {
    const FORBIDDEN_PATTERNS = [
      "ButtonLabelToken",
      "buttonLabelSchema",
      "buttonLabelTokenSchema",
      "createTextToken",
      "createIconToken",
      "labelToPlainText",
      "isTextToken",
      "isIconToken",
      "TokenLabel",
      "RichLabelInput",
      "rich-label-input",
      "serialize-tokens",
      "/_shared/button-label",
    ] as const;

    function walk(dir: string, files: string[] = []): string[] {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path, files);
        } else if (/\.(ts|tsx)$/u.test(entry.name)) {
          files.push(path);
        }
      }
      return files;
    }

    const violations: string[] = [];
    for (const path of walk(SRC_ROOT)) {
      const source = readFileSync(path, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (source.includes(pattern)) {
          violations.push(`${relative(ROOT, path)}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('Phase 0 で廃止された旧 token shape (`type:"text"|"icon"`) が __tests__/ の fixture に残存しない', () => {
    // Phase 0 (commit `2c8c86b9`) で `ButtonLabelToken` の `type` discriminator は
    // Sanity Portable Text 公式の `_type` discriminator + `text` field に rename された。
    // src/ は別 test (`Phase 0 で削除済の...`) がカバーするが、`__tests__/` の fixture が
    // 旧 shape のまま放置されると test:integration / test:unit で silent fail を起こす
    // （実例: 2026-05-10 navigation.test.ts / homepage-settings.test.ts で発生）。
    //
    // 検出パターン:
    //   - `type: "text" as const, value:` (旧 TextToken)
    //   - `type: "icon" as const, name:` (旧 IconToken — name 単体は inline icon と
    //     共有のため context で限定)
    //   - `, type: "text",` / `, type: "icon",` (短縮形)
    const PATTERNS: readonly RegExp[] = [
      /\btype:\s*"text"\s+as\s+const\s*,\s*value:/,
      /\btype:\s*"icon"\s+as\s+const\s*,\s*name:/,
      /\btype:\s*"text"\s*,\s*value:\s*"/,
    ] as const;

    const TESTS_ROOT = join(ROOT, "__tests__");
    const E2E_ROOT = join(ROOT, "e2e");
    const violations: string[] = [];

    function walkSpec(root: string): string[] {
      if (!existsSync(root)) return [];
      const out: string[] = [];
      const stack = [root];
      while (stack.length > 0) {
        const dir = stack.pop();
        if (dir === undefined) break;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) {
            stack.push(path);
          } else if (/\.(ts|tsx)$/u.test(entry.name)) {
            out.push(path);
          }
        }
      }
      return out;
    }

    // 旧 shape を「reject される」negative test fixture として **意図的に**
    // 残している schema 検証 spec のみ allowlist に追加。
    const ALLOWLIST: readonly string[] = [
      // PortableTextSpanSchema の「旧 type:'text' は受け付けない」 negative test
      "__tests__/unit/lib/portable-text/schema.test.ts",
    ] as const;

    for (const root of [TESTS_ROOT, E2E_ROOT]) {
      for (const path of walkSpec(root)) {
        // 自分自身の test ファイルはパターン文字列を含むため除外
        if (path.endsWith("architecture-boundaries.test.ts")) continue;
        const rel = relative(ROOT, path).replaceAll("\\", "/");
        if (ALLOWLIST.includes(rel)) continue;
        const source = readFileSync(path, "utf8");
        for (const re of PATTERNS) {
          if (re.test(source)) {
            violations.push(`${relative(ROOT, path)}: matches ${re.source}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  // ──────────────────────────────────────────────────────────────
  // CSP nonce-gap structural prevention helpers
  // ──────────────────────────────────────────────────────────────
  //
  // 背景: Next.js 16 (cacheComponents:true) の static shell `◐` ページは build 時に prerender
  // されるため、生成 HTML に焼かれる `<script src="/_next/static/chunks/app-client-...js">` には
  // per-request nonce が付与されない。strict-dynamic CSP 配下では nonce 無し chunk が全て
  // evaluation block される。trigger は「'use client' file の barrel value-import で Zod-heavy
  // schema module が client-reference として `entryJSFiles[<page>]` に列挙される」こと。
  // type-only import / deep import は client-reference を増やさない。
  //
  // 防衛: 'use client' を含む public file × Zod-heavy module deny-list の value-import を grep
  // gate で 0 件強制する。multi-line import (prettier printWidth=80 改行) も逃さないため source
  // を「import 文の `{...}` 内部改行のみ空白化」してから line 評価する。
  //
  // admin scope は対象外: admin layout が PR #604 で `generateViewport + connection() +
  // <Suspense><html>` により全 71 route を `ƒ` 化済 (詳細は `.claude/rules/app-structure.md` の
  // 「cacheComponents + strict-dynamic CSP」節)。runtime nonce で全 chunk 保護されるため
  // admin client が zod を value-import しても CSP block は起きない。

  /**
   * import / export 文の `{...}` 内部改行を畳んで line-based 検査を安全化する。
   *
   * line-by-line の正規表現 (`import\s+\{[^}]*\bxxx\b/`) は prettier printWidth=80 で
   * 改行された多行 import を silently miss する。例:
   *   import {
   *     useCallback,
   *   } from "react";
   * は 1 行も pattern 全体にマッチせず false-negative になる。
   *
   * 対策: source を改行前に「import/export 文の `{...}` 内部改行のみ空白化」してから既存
   * line-based 評価に渡す。
   */
  function collapseMultilineImports(source: string): string {
    const MULTILINE_BRACE_IMPORT =
      /^(?<head>(?:import|export)(?:\s+type)?\s*)\{(?<body>[^{}]*)\}(?<tail>\s*from\s*["'][^"']+["'][^\n]*)/gmu;
    return source.replace(MULTILINE_BRACE_IMPORT, (_m, head, body, tail) => {
      const oneLineBody = body
        .replace(/\s*\r?\n\s*/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
      return `${head}{ ${oneLineBody} }${tail}`;
    });
  }

  /**
   * inline-type 形式 (`import { type X, Y } from "m"`) の binding が全て `type` 接頭辞かを判定。
   * 全件 type-only なら `verbatimModuleSyntax` で物理 erase されるため value-import 扱いしない。
   * 1 つでも値 binding (`Y`) があれば value-import (= chunk 化対象)。
   */
  function isInlineTypeOnly(importLine: string): boolean {
    const match = importLine.match(/\{\s*([^}]*)\s*\}/u);
    if (!match || !match[1]) return false;
    const bindings = match[1]
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    if (bindings.length === 0) return false;
    return bindings.every((b) => /^type\s+\w/u.test(b));
  }

  test("portable-text barrel は schema 値を re-export しない (CSP nonce gap 構造予防)", () => {
    const barrelPath = join(
      SRC_ROOT,
      "shared",
      "lib",
      "portable-text",
      "index.ts",
    );
    const source = collapseMultilineImports(readFileSync(barrelPath, "utf8"));
    const lines = source.split(/\r?\n/u);
    const violations: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      if (/^export\s+type[\s{]/u.test(trimmed)) continue;
      if (/from\s+["']\.\/schema["']/u.test(trimmed)) {
        violations.push(
          `portable-text/index.ts: schema value re-export found: ${trimmed}`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  test("page-hero barrel は schema 値を re-export しない (CSP nonce gap 構造予防)", () => {
    // portable-text と同型: section 定義 barrel から `*Schema` 値を撤去し deep-import 強制。
    // EditorialSplitHero / CompactHero / MinimalHero / MediaHero は 'use client' だが全て
    // barrel から type のみ import (verbatimModuleSyntax で erase)。PageHero.tsx (Server
    // Component) のみ schema 値を `./schema` から deep-import する。
    const barrelPath = join(
      SRC_ROOT,
      "shared",
      "lib",
      "sections",
      "definitions",
      "page-hero",
      "index.ts",
    );
    const source = collapseMultilineImports(readFileSync(barrelPath, "utf8"));
    const lines = source.split(/\r?\n/u);
    const violations: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      if (
        /^export\s*\{[^}]*\bpageHeroConfigSchema\b[^}]*\}\s*from\s+["']\.\/schema["']/u.test(
          trimmed,
        )
      ) {
        violations.push(
          `page-hero/index.ts: pageHeroConfigSchema value re-export found: ${trimmed}`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  test("portable-text/schema.ts は型を re-export しない (barrel SSoT 純化)", () => {
    // schema.ts は Zod schema 値のみを export する責務に純化。型は `./types` (SSoT) と
    // barrel `./index` 経由で公開する。schema 経由の type re-export は dead surface area
    // で、再導入されると future barrel hygiene gate 拡張時の判定簡略化を阻害する。
    const schemaPath = join(
      SRC_ROOT,
      "shared",
      "lib",
      "portable-text",
      "schema.ts",
    );
    const source = collapseMultilineImports(readFileSync(schemaPath, "utf8"));
    const lines = source.split(/\r?\n/u);
    const violations: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      if (
        /^export\s+type\s*\{[^}]*\}\s*from\s+["']\.\/types["']/u.test(trimmed)
      ) {
        violations.push(
          `portable-text/schema.ts: type re-export found: ${trimmed}`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  test("src/app/(public)/ 'use client' は Zod-heavy module を value-import しない (CSP nonce gap 構造予防)", () => {
    // deny-list は enumerate ベース (scan-based は section.ts 等 server-only 経路を巻き込む)。
    // 各 module は public 'use client' から value-import 0 件を実測確認済 (DISCOVERY 5)。
    // 新規 Zod-heavy public-facing module を追加する際は ここに 1 行追加する。
    //
    // scope は 'use client' directive を含む public file のみ。Server Component (default)
    // は client bundle に焼かれないため value-import しても CSP nonce gap を trigger しない。
    const ZOD_HEAVY_DENY_MODULES: readonly string[] = [
      "@/shared/lib/portable-text/schema",
      "@/shared/lib/sections/definitions/page-hero/schema",
      "@/shared/lib/sections/registry",
      "@/shared/lib/sections/field-registry",
      "@/shared/lib/validations/section",
      "@/shared/lib/validations/section-defaults",
    ] as const;

    function walkPublic(dir: string): string[] {
      const out: string[] = [];
      const stack: string[] = [dir];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur || !existsSync(cur)) continue;
        for (const entry of readdirSync(cur, { withFileTypes: true })) {
          const p = join(cur, entry.name);
          if (entry.isDirectory()) stack.push(p);
          else if (/\.(ts|tsx)$/u.test(entry.name)) out.push(p);
        }
      }
      return out;
    }

    /**
     * `'use client'` directive がファイル冒頭 (shebang/コメント/空行を許容して) に
     * 配置されているか判定。Next.js 公式仕様で `'use client'` は file の very first
     * statement (コメント・空行・他の directive は許容) でなければならないため、
     * 安全策として先頭 30 行のみ検査する (現存 file で 30 行を超える header は無い)。
     */
    function hasUseClientDirective(source: string): boolean {
      const head = source.split(/\r?\n/u).slice(0, 30);
      for (const raw of head) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith("//") || line.startsWith("/*")) continue;
        if (line.startsWith("*") || line.startsWith("*/")) continue;
        // Next.js 公式: `'use client'` または `"use client"` を許容 (;あり/なし両方)
        if (/^["']use client["']\s*;?\s*$/u.test(line)) return true;
        // 最初の non-comment / non-blank が directive でなければ Server Component
        return false;
      }
      return false;
    }

    const denyAlt = ZOD_HEAVY_DENY_MODULES.map((m) =>
      m.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
    ).join("|");
    const FROM_DENY = new RegExp(`from\\s+["'](?:${denyAlt})["']`, "u");

    const violations: string[] = [];
    for (const path of walkPublic(PUBLIC_APP_ROOT)) {
      const source = readFileSync(path, "utf8");
      if (!hasUseClientDirective(source)) continue;
      const collapsed = collapseMultilineImports(source);
      const lines = collapsed.split(/\r?\n/u);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        if (!/^(?:import|export)\b/u.test(trimmed)) continue;
        if (!FROM_DENY.test(trimmed)) continue;
        // top-level type-only (`import type { ... } from "<deny>"`) は erase されるので許可
        if (/^(?:import|export)\s+type[\s{]/u.test(trimmed)) continue;
        // inline-type 形式 (`import { type X, type Y } from "<deny>"`) で全件 type なら許可
        if (isInlineTypeOnly(trimmed)) continue;
        violations.push(`${relative(ROOT, path)}:${i + 1}: ${trimmed}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("Phase 1 で PortableTextSpan[] 化済の見出しフィールドは schema で string を受け付けない", async () => {
    const { validateSectionConfig } =
      await import("@/shared/lib/validations/section");
    const targets: { type: string; field: string }[] = [
      { type: "concept", field: "heading" },
      { type: "cta", field: "title" },
      { type: "hero", field: "title" },
      { type: "features", field: "title" },
      { type: "testimonial", field: "title" },
    ];
    for (const { type, field } of targets) {
      // 空 config は default で [] になる（safeParse({}) 契約）
      const empty = validateSectionConfig(type, {});
      expect(empty.success).toBe(true);
      if (empty.success) {
        expectRecordFieldArray(empty.data, field);
      }
      // string 入力は配列要求で fail
      const stringInput = validateSectionConfig(type, {
        [field]: "string-not-array",
      });
      expect(stringInput.success).toBe(false);
    }
  });

  test("Phase 2 で PortableTextSpan[] 化済の items[] 見出しフィールドは schema で string を受け付けない", async () => {
    const { validateSectionConfig } =
      await import("@/shared/lib/validations/section");
    type ItemTarget = {
      type: string;
      field: string;
      itemTemplate?: Record<string, unknown>;
    };
    const targets: ItemTarget[] = [
      { type: "features", field: "title" },
      { type: "testimonial", field: "authorName" },
      { type: "testimonial", field: "authorTitle" },
      { type: "faq-list", field: "question" },
      {
        type: "value-props",
        field: "title",
        itemTemplate: { icon: "IconClock", eyebrow: "Speed" },
      },
    ];
    for (const { type, field, itemTemplate } of targets) {
      const stringInItem = validateSectionConfig(type, {
        items: [{ ...(itemTemplate ?? {}), [field]: "string-not-array" }],
      });
      expect(stringInItem.success).toBe(false);
    }
  });

  test("Phase 3 で PortableTextSpan[] 化済のリンク/ボタンテキストは schema で string を受け付けない", async () => {
    const { validateSectionConfig } =
      await import("@/shared/lib/validations/section");
    const targets: { type: string; field: string }[] = [
      { type: "contact-form", field: "submitButtonText" },
      { type: "faq-list", field: "viewAllText" },
      { type: "news-list", field: "viewAllText" },
      { type: "post-list", field: "viewAllText" },
      { type: "space-list", field: "viewAllText" },
    ];
    for (const { type, field } of targets) {
      // 空 config は default で [] になる
      const empty = validateSectionConfig(type, {});
      expect(empty.success).toBe(true);
      if (empty.success) {
        expectRecordFieldArray(empty.data, field);
      }
      // string 入力は配列要求で fail
      const stringInput = validateSectionConfig(type, {
        [field]: "string-not-array",
      });
      expect(stringInput.success).toBe(false);
    }
  });

  test("react-hook-form / @hookform は src/ から import されていない（Phase 3-C 完遂後の不可逆規律）", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = sourceFiles
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /from\s+["']react-hook-form["']|from\s+["']@hookform\//u.test(
          source,
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("src/scripts は explicit any と TypeScript suppression を使わない", () => {
    const sourceFiles = [
      ...collectSourceFiles(SRC_ROOT),
      ...collectSourceFiles(SCRIPTS_ROOT),
    ];
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /\bas\s+any\b|<any>|:\s*any\b|Promise<any>|Record<string,\s*any>|@ts-(?:ignore|expect-error)/u,
    );

    expect(offenders).toEqual([]);
  });

  test("datetime-local を new Date(`${d}T${t}`) で naive parse しない (JST SSoT 強制)", () => {
    // Cloud Run (TZ=UTC) 上で `new Date(`${date}T${time}:00`)` や
    // `new Date(`${date}T${time}`)` は server-local として parse され、JST 意図の入力を
    // +9h ずらして DB に保存する silent bug (predicate: 予約書込 4 経路の PR#1 fix)。
    // SSoT は `src/shared/lib/date-format.ts:parseDateTimeLocalAsJst` (+09:00 offset を
    // 明示付与)。予約経路 (public/admin/customer commands + mypage action) は
    // `buildDateTime` ラッパーを廃止し、この helper を直接呼ぶ。
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /new Date\(\s*`[^`]*T\$\{[^`]*\}(?::\d{2})?\s*`\s*\)/u,
    );

    expect(offenders).toEqual([]);
  });

  test("Phase 1 SDK 境界 cast は Zod z.custom<T> helper 経由（呼び出し側 cast 0 件）", () => {
    // SDK 境界 cast の helper 強制（方針: .claude/rules/type-safety.md）
    // - LocationSchema.parse (googleapis Schema$Location)
    // - CreateEmailOptionsSchema.parse (resend CreateEmailOptions)
    // - toAppRoute / safeToAppRoute (Next.js Route<string>)
    // SSoT helper 内部の z.custom<T> 1 箇所だけが許可、caller 側 cast は 0 件必須
    const ALLOWED_HELPER_FILES = [
      join(SRC_ROOT, "shared", "lib", "google-business-profile", "schemas.ts"),
      join(SRC_ROOT, "shared", "lib", "email", "schemas.ts"),
      join(SRC_ROOT, "shared", "lib", "routes", "to-app-route.ts"),
    ];
    const sourceFiles = collectSourceFiles(SRC_ROOT).filter(
      (file) => !ALLOWED_HELPER_FILES.includes(file),
    );
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /\bas\s+unknown\s+as\s+Schema\$Location\b|\bas\s+CreateEmailOptions\b|\bas\s+Route<string>/u,
    );

    expect(offenders).toEqual([]);
  });

  test("Phase 1 Prisma JSON cast は asPrismaInputJsonValue helper 経由（as Prisma.(Input)?Json* 直書き 0 件）", () => {
    // Prisma JSON 型 — `as Prisma.InputJsonValue` / `as Prisma.JsonArray` / `as Prisma.JsonObject` / `as Prisma.JsonValue`
    // の直書きは禁止（方針: .claude/rules/type-safety.md）。
    // helper: asPrismaInputJsonValue / parsePrismaInputJson / clonePrismaInputJson (@/shared/db/prisma-input-json)
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /\bas\s+Prisma\.(Input)?Json(Value|Array|Object)\b/u,
    );

    expect(offenders).toEqual([]);
  });

  test("unknown object の Record narrowing は isRecord helper 経由（as Record<string, unknown> 直書き 0 件）", () => {
    // TypeScript 公式の narrowing 方針に合わせ、`typeof value === "object"` 後の
    // `as Record<string, unknown>` は散らさず type guard に集約する。
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /\bas\s+Record<string,\s*unknown>/u,
    );

    expect(offenders).toEqual([]);
  });

  test("unknown/error object の structural property cast は isRecord helper 経由（as { ... } 直書き 0 件）", () => {
    // error / JSON payload など unknown 境界のプロパティ読み取りは
    // `as { code?: ... }` ではなく isRecord + 段階的 narrowing で行う。
    const allowedFiles = [
      join(SRC_ROOT, "shared", "lib", "conform", "typed-input-control.ts"),
    ];
    const sourceFiles = [
      ...collectSourceFiles(SRC_ROOT),
      ...collectSourceFiles(SCRIPTS_ROOT),
    ].filter((file) => !allowedFiles.includes(file));
    const offenders = collectNonCommentOffenders(sourceFiles, /\bas\s+\{/u);

    expect(offenders).toEqual([]);
  });

  test("call-site の as never は残さない（動的 registry 境界は helper に集約）", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /\bas\s+never\b/u,
    );

    expect(offenders).toEqual([]);
  });

  test("literal union / enum / CSSProperties の call-site cast は型ガードか明示型で置き換える", () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /\bas\s+(?:TermsScope|TemplateKey|readonly string\[\]|string\[\]|CSSProperties|\(typeof TERMS_TYPE_VALUES\)\[number\])/u,
    );

    expect(offenders).toEqual([]);
  });

  test("廃止済の型安全 ledger / assertion-bans を再導入しない（方針は .claude/rules/type-safety.md に集約）", () => {
    // 2026-05-18 に旧 .claude/rules/type-safety/{documented-exceptions-ledger,assertion-bans}.md を廃止。
    // SDK / Prisma JSON / Route cast の構造解消 + RHF 完全削除に伴い、型アサーション方針は
    // .claude/rules/type-safety.md（単一ファイル）に一本化済み。旧ファイルの復活を gate する。
    const retiredDocs = [
      join(
        ROOT,
        ".claude",
        "rules",
        "type-safety",
        "documented-exceptions-ledger.md",
      ),
      join(ROOT, ".claude", "rules", "type-safety", "assertion-bans.md"),
    ];

    expect(retiredDocs.filter(existsSync)).toEqual([]);
    // 後継 SSoT は存在すること
    expect(existsSync(join(ROOT, ".claude", "rules", "type-safety.md"))).toBe(
      true,
    );
  });

  test("Phase 4 で PortableTextBlock[] 化済の long-form フィールドは schema で string を受け付けない", async () => {
    const { validateSectionConfig } =
      await import("@/shared/lib/validations/section");
    // root-level fields (空 config で default 適用が成立する section types)
    const rootTargets: { type: string; field: string }[] = [
      { type: "concept", field: "body" },
      { type: "contact-form", field: "description" },
      { type: "cta", field: "description" },
      { type: "event-calendar", field: "description" },
      { type: "hero", field: "subtitle" },
      { type: "hero-parallax", field: "subtitle" },
      { type: "map", field: "address" },
      { type: "reservation-form", field: "description" },
    ];
    for (const { type, field } of rootTargets) {
      const empty = validateSectionConfig(type, {});
      expect(empty.success).toBe(true);
      if (empty.success) {
        expectRecordFieldArray(empty.data, field);
      }
      const stringInput = validateSectionConfig(type, {
        [field]: "string-not-array",
      });
      expect(stringInput.success).toBe(false);
    }

    // page-hero は discriminated union のため variant 指定で 3 variants を個別検証
    for (const variant of ["editorial-split", "compact", "minimal"] as const) {
      const valid = validateSectionConfig("page-hero", { variant });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expectRecordFieldArray(valid.data, "description");
      }
      const stringInput = validateSectionConfig("page-hero", {
        variant,
        description: "string-not-array",
      });
      expect(stringInput.success).toBe(false);
    }

    // items[] inner fields (faq-list / features / testimonial)
    const itemTargets: {
      type: string;
      field: string;
      itemTemplate?: Record<string, unknown>;
    }[] = [
      {
        type: "faq-list",
        field: "answer",
        itemTemplate: { question: [] },
      },
      {
        type: "features",
        field: "description",
        itemTemplate: { title: [] },
      },
      {
        type: "testimonial",
        field: "content",
        itemTemplate: {
          authorName: [],
          authorTitle: [],
          authorImage: { url: "", alt: "" },
        },
      },
    ];
    for (const { type, field, itemTemplate } of itemTargets) {
      const stringInItem = validateSectionConfig(type, {
        items: [{ ...(itemTemplate ?? {}), [field]: "string-not-array" }],
      });
      expect(stringInItem.success).toBe(false);
    }
  });
});

// 元 architecture-boundaries.test.ts の末尾にあった 3 describe は per-concern に
// 分離済み (2490 行 → 2263 行にスリム化。merge conflict hotspot 緩和が目的)。
// 引継ぎ先:
//   - __tests__/unit/architecture/type-safety-cast-and-cache-tag-drift.test.ts
//     (conform FieldMetadata cast gate + CACHE_TAGS producer/consumer drift)
//   - __tests__/unit/architecture/section-config-widening-cast.test.ts
//     (as SectionConfig cast の 0 件強制)
//   - __tests__/unit/architecture/next-config-cache-tag-emission.test.ts
//     (next.config headers() Cache-Tag / Cache-Control 契約 8 test)
