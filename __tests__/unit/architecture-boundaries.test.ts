import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

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
const APP_ROUTE_ROOT = join(SRC_ROOT, "app");
const API_CRON_ROUTE_ROOT = join(SRC_ROOT, "app", "api", "cron");
const API_WEBHOOK_ROUTE_ROOT = join(SRC_ROOT, "app", "api", "webhooks");
const PUBLIC_APP_ROOT = join(SRC_ROOT, "app", "(public)");
const PUBLIC_LAYOUT_FILE = join(PUBLIC_APP_ROOT, "layout.tsx");
const PACKAGE_JSON_FILE = join(ROOT, "package.json");
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
    "api-keys",
    "queries.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "api-keys",
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
    "audit-log.ts",
  ),
  join(
    SRC_ROOT,
    "app",
    "(admin)",
    "admin",
    "(dashboard)",
    "_shared",
    "actions",
    "dashboard.ts",
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
    "post-comment.ts",
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
    "queries.ts",
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
    "staff-invitation.ts",
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
    "user.ts",
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
    "page.ts",
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
    "queries.ts",
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

function collectSourceFiles(dir: string): string[] {
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
    expect(source).not.toContain("admin-login-tokens/commands");
    expect(source).not.toContain("consumeAdminLoginToken");
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
    const offenders = THIN_ADMIN_ACTION_FILES.filter(existsSync)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          source.includes("@/shared/db/prisma") ||
          source.includes('from "@/shared/db"') ||
          source.includes("@generated/prisma")
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test("public root layout に NuqsAdapter が配置されている", () => {
    const source = readFileSync(PUBLIC_LAYOUT_FILE, "utf8");

    expect(source).toContain("NuqsAdapter");
  });

  test("Better Auth は静的 adminAuth export を使い、動的 getAuth を再導入しない", () => {
    const source = readFileSync(
      join(SRC_ROOT, "shared", "lib", "admin-auth.ts"),
      "utf8",
    );

    expect(source).toContain("export const adminAuth = createAdminAuth();");
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

  test("type-check は clean checkout 前提で増分 build state に依存しない", () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_FILE, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["type-check"]).toContain(
      "--incremental false",
    );
    expect(packageJson.scripts?.["type-check"]).toContain(
      "bun run db:generate",
    );
    expect(packageJson.scripts?.["build"]).toContain("bun run db:generate");
    expect(packageJson.scripts?.["test:unit"]).toContain("bun run db:generate");
  });

  test("Cloud Run deploy は Server Actions encryption key を runtime にも注入する", () => {
    const source = readFileSync(CLOUDBUILD_FILE, "utf8");

    expect(source).toContain(
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:${_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY_SECRET_VERSION}",
    );
  });

  test("Better Auth の canonical route handler を app/api/auth/[...all] に固定する", () => {
    expect(existsSync(AUTH_ROUTE_FILE)).toBe(true);

    const source = readFileSync(AUTH_ROUTE_FILE, "utf8");
    expect(source).toContain(
      'import { adminAuth } from "@/shared/lib/admin-auth"',
    );
    expect(source).toContain("toNextJsHandler(adminAuth)");
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
        "page.ts",
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
        const dir = stack.pop()!;
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
        const value = (empty.data as Record<string, unknown>)[field];
        expect(Array.isArray(value)).toBe(true);
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
        const value = (empty.data as Record<string, unknown>)[field];
        expect(Array.isArray(value)).toBe(true);
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

  test("Phase 1 Prisma JSON cast は asPrismaInputJsonValue helper 経由（as Prisma.InputJsonValue 0 件）", () => {
    // Prisma JSON 型 — `as Prisma.InputJsonValue` は禁止（方針: .claude/rules/type-safety.md）
    // helper: asPrismaInputJsonValue / parsePrismaInputJson / clonePrismaInputJson (@/shared/db/prisma-input-json)
    // `as Prisma.InputJsonObject` (data field) と `satisfies + as Prisma.InputJsonArray` (navigation token) のみ許容
    const sourceFiles = collectSourceFiles(SRC_ROOT);
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /\bas\s+Prisma\.InputJsonValue\b/u,
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
        const value = (empty.data as Record<string, unknown>)[field];
        expect(Array.isArray(value)).toBe(true);
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
        const value = (valid.data as Record<string, unknown>)["description"];
        expect(Array.isArray(value)).toBe(true);
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

describe("conform FieldMetadata generic invariance gate（方針: .claude/rules/type-safety.md）", () => {
  test("`as unknown as FieldMetadata` cast は typed-input-control helper 内部のみ許可", () => {
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const allowedFile = join(
      SRC_ROOT,
      "shared",
      "lib",
      "conform",
      "typed-input-control.ts",
    );
    const pattern = /as\s+unknown\s+as\s+FieldMetadata\b/;
    const offenders: string[] = [];
    for (const rel of glob.scanSync({ cwd: SRC_ROOT })) {
      const abs = join(SRC_ROOT, rel);
      if (abs === allowedFile) continue;
      const content = readFileSync(abs, "utf-8");
      if (pattern.test(content)) {
        offenders.push(relative(ROOT, abs));
      }
    }
    expect(offenders).toEqual([]);
  }, 30000);

  test("updateTag/revalidateTag する CACHE_TAGS は cacheTag producer を持つ（または invalidation-only 許可リスト）", () => {
    // updateTag / revalidateTag に渡す CACHE_TAGS は、いずれかの use cache 関数が cacheTag で
    // 生成していなければ no-op の死んだ無効化になり、「存在しない契約」を匂わせて将来の保守者を
    // 惑わせる。下記は「管理エンティティの一覧が現状あえて未キャッシュ（admin は都度フレッシュ
    // 取得）で、mutation 時の無効化のみ前方互換として置いている」意図的な invalidation-only タグ。
    // この集合を機械的に固定し、(a) 新たな未生成タグの無効化が紛れ込む（producer を足すか本リストに
    // 意図を明記するか二択を強制）/ (b) 既存 invalidation-only にキャッシュを足したのに本リストの
    // 除去を忘れる、の双方向ドリフトを検出する。
    const INVALIDATION_ONLY = [
      "BLOCK_TEMPLATES",
      "COUPONS",
      "CUSTOMERS",
      "INQUIRIES",
      "MEDIA",
      "POST_COMMENTS",
      "RESERVATIONS",
      "STAFF",
    ].sort();

    const files = collectSourceFiles(SRC_ROOT);
    const produced = new Set<string>();
    const consumed = new Set<string>();
    const TAG_RE = /CACHE_TAGS\.([A-Z_]+)/gu;

    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/u);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        const isProducer = /\bcacheTag\(/u.test(line);
        const isConsumer = /\b(?:updateTag|revalidateTag)\(/u.test(line);
        if (!isProducer && !isConsumer) continue;
        for (const match of line.matchAll(TAG_RE)) {
          const tag = match[1];
          if (!tag) continue;
          if (isProducer) produced.add(tag);
          if (isConsumer) consumed.add(tag);
        }
      }
    }

    const unproducedConsumed = [...consumed]
      .filter((tag) => !produced.has(tag))
      .sort();

    expect(unproducedConsumed).toEqual(INVALIDATION_ONLY);
  });
});

describe("SectionConfig union widening cast 構造解消済（方針: .claude/rules/type-safety.md）", () => {
  test("`as SectionConfig` cast は src/ 全体で 0 件", () => {
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const pattern = /\bas\s+SectionConfig\b/;
    const offenders: string[] = [];
    for (const rel of glob.scanSync({ cwd: SRC_ROOT })) {
      const abs = join(SRC_ROOT, rel);
      const content = readFileSync(abs, "utf-8");
      if (pattern.test(content)) {
        offenders.push(relative(ROOT, abs));
      }
    }
    expect(offenders).toEqual([]);
  }, 30000);
});

import nextConfig from "../../next.config";
import {
  SITE_WIDE_CDN_TAGS,
  PRIVATE_NO_TAG_PREFIXES,
} from "@/shared/lib/constants/cdn-cache-tags";

type HeaderEntry = { key: string; value: string };
type SourceEntry = { source: string; headers: HeaderEntry[] };

async function getHeaders(): Promise<SourceEntry[]> {
  // next.config.ts exports default the config object; headers() is an async fn.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = nextConfig as any;
  const headers = await (cfg.headers?.() ?? Promise.resolve([]));
  return headers as SourceEntry[];
}

describe("next.config Cache-Tag emission contract", () => {
  test("headers() returns at least one source entry", async () => {
    const headers = await getHeaders();
    expect(headers.length).toBeGreaterThan(0);
  });

  test("every per-public-collection Cache-Tag value contains the full site-wide set", async () => {
    const headers = await getHeaders();
    const publicCollections = [
      "/blog/:path*",
      "/category/:path*",
      "/tag/:path*",
      "/spaces/:path*",
      "/news/:path*",
      "/events/:path*",
      "/faq/:path*",
      "/terms/:path*",
    ];
    for (const source of publicCollections) {
      const entry = headers.find((h) => h.source === source);
      expect(entry, source).toBeDefined();
      const tagHeader = entry!.headers.find((h) => h.key === "Cache-Tag");
      expect(tagHeader, `${source} must have Cache-Tag`).toBeDefined();
      const tags = tagHeader!.value.split(",");
      for (const siteWide of SITE_WIDE_CDN_TAGS) {
        expect(tags, `${source} missing site-wide tag ${siteWide}`).toContain(
          siteWide,
        );
      }
    }
  });

  test("home (/) and /about emit home-marketing-v1 in their Cache-Tag value", async () => {
    const headers = await getHeaders();
    for (const source of ["/", "/about"]) {
      const entry = headers.find((h) => h.source === source);
      expect(entry, source).toBeDefined();
      const tagHeader = entry!.headers.find((h) => h.key === "Cache-Tag");
      expect(tagHeader).toBeDefined();
      expect(tagHeader!.value.split(",")).toContain("home-marketing-v1");
    }
  });

  test("private blocklist sources NEVER emit Cache-Tag", async () => {
    const headers = await getHeaders();
    for (const prefix of PRIVATE_NO_TAG_PREFIXES) {
      const source = `${prefix}/:path*`;
      const entry = headers.find((h) => h.source === source);
      expect(entry, source).toBeDefined();
      const tagHeader = entry!.headers.find((h) => h.key === "Cache-Tag");
      expect(
        tagHeader,
        `${source} must NOT have Cache-Tag (PII path)`,
      ).toBeUndefined();
      const ccHeader = entry!.headers.find((h) => h.key === "Cache-Control");
      expect(ccHeader?.value).toBe("private, no-store");
    }
  });

  test("blanket /:path* emits Cache-Control only (no Cache-Tag) so private match-wins inherits no tag", async () => {
    const headers = await getHeaders();
    const blanket = headers.find((h) => h.source === "/:path*");
    expect(blanket).toBeDefined();
    const tag = blanket!.headers.find((h) => h.key === "Cache-Tag");
    expect(tag).toBeUndefined();
    const cc = blanket!.headers.find((h) => h.key === "Cache-Control");
    // canonical: public, max-age=0, must-revalidate, s-maxage=..., stale-while-revalidate=...
    expect(cc?.value).toMatch(/^public, max-age=0, must-revalidate, s-maxage=/);
  });

  test("/sitemap.xml emits SITEMAP Cache-Tag only (purge target for site-wide co-purge)", async () => {
    const headers = await getHeaders();
    const entry = headers.find((h) => h.source === "/sitemap.xml");
    expect(entry, "/sitemap.xml entry must exist").toBeDefined();
    const tag = entry!.headers.find((h) => h.key === "Cache-Tag");
    expect(tag?.value).toBe("sitemap-v1");
    // Cache-Control inherited from blanket public (no per-source override).
    const cc = entry!.headers.find((h) => h.key === "Cache-Control");
    expect(cc).toBeUndefined();
  });

  test("/sitemap.xml SITEMAP tag is NOT in any other public source (site-wide invalidation must only purge sitemap)", async () => {
    const headers = await getHeaders();
    const SITEMAP_TAG = "sitemap-v1";
    for (const entry of headers) {
      if (entry.source === "/sitemap.xml") continue;
      const tag = entry.headers.find((h) => h.key === "Cache-Tag");
      if (!tag) continue;
      expect(
        tag.value.split(","),
        `${entry.source} must NOT contain SITEMAP tag`,
      ).not.toContain(SITEMAP_TAG);
    }
  });

  test("/sitemap.xml source appears exactly once (Next.js headers() は last-match-wins、複数 source は Cache-Tag を上書きする)", async () => {
    const headers = await getHeaders();
    const sitemapSources = headers.filter((h) => h.source === "/sitemap.xml");
    expect(
      sitemapSources,
      "/sitemap.xml は exactly 1 つの source entry のみ持つこと（複製で SITEMAP tag 上書き bug 防止）",
    ).toHaveLength(1);
  });
});
