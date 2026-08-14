import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { expectRecord } from "../helpers/type-assertions";
import { collectSourceFiles } from "../helpers/architecture-fs";
import {
  ScriptKind,
  ScriptTarget,
  createSourceFile,
  forEachChild,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  type Node,
} from "typescript";
import {
  readDatabaseInvariants,
  readPlpgsqlFunction,
  readPrismaSchema,
} from "../support/prisma-sources";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");
const SCRIPTS_ROOT = join(ROOT, "scripts");
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
const SPACE_RATE_PLAN_QUERIES_FILE = join(
  SHARED_DOMAIN_ROOT,
  "spaces",
  "rate-plan-queries.ts",
);

function expectRecordFieldArray(data: unknown, field: string): void {
  expectRecord(data);
  const value = data[field];
  expect(Array.isArray(value)).toBe(true);
}
const GOOGLE_CALENDAR_WEBHOOK_ROUTE_FILE = join(
  SRC_ROOT,
  "app",
  "api",
  "webhooks",
  "google-calendar",
  "route.ts",
);
const GOOGLE_SERVICE_ACCOUNT_BOUNDARY_FILES = [
  join(SRC_ROOT, "shared", "domain", "settings", "google-calendar-commands.ts"),
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
/** TS / TSX / CSS を再帰収集（design token 廃止の横断 grep 用） */
/**
 * `.tsx` の中の `<input>` / `<textarea>` の **opening タグ**を AST で拾う。
 *
 * ## 正規表現でも手書きスキャナでもいけない
 *
 * 最初は `/<input\b[\s\S]*?>/` の lazy match だった。JSX の attribute には
 * `onChange={(e) => …}` のようにアロー関数が入り、その `>` でタグが途中で切れる。
 * 実測で 283 タグ中 18 タグが切り詰められ、うち 1 件は className が切れた先にあって
 * **違反が緑のまま通っていた**。
 *
 * 次に `{}` の深度と引用符を追う手書きスキャナにしたが、それも足りない。
 * `onChange={() => /}/.test(v)}` のように**正規表現リテラルの中の `}`** があると
 * 深度が負に振れ、本当の `>` を終端と認識できずファイル末尾まで走る。すると
 * 後続の無関係な `text-base` を飲み込んで、やはり違反を免除する（Codex 指摘）。
 * コメント内の括弧も同じ。
 *
 * 字句を自前で数える限りこの手の穴は残る。**TypeScript の parser に読ませる。**
 */
function jsxInputOpeningTags(source: string, file: string): string[] {
  const sourceFile = createSourceFile(
    file,
    source,
    ScriptTarget.Latest,
    true,
    ScriptKind.TSX,
  );
  const out: string[] = [];
  const walk = (node: Node): void => {
    if (isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(sourceFile);
      if (name === "input" || name === "textarea") {
        out.push(node.getText(sourceFile));
      }
    }
    forEachChild(node, walk);
  };
  forEachChild(sourceFile, walk);
  return out;
}

/**
 * append-only な証跡テーブルのうち、**書き換えてよい列**の宣言。
 *
 * ここが唯一の手書きで、内容は「業務としてどの列を可変にするか」という意思表示。
 * その意思どおりに DB trigger が**他のすべての列を固定できているか**は
 * `mutableColumnsOf()` が trigger 本文とモデル宣言の差分で確かめる。
 * 列を足して trigger の固定リストに並べ忘れると、差分が増えてここと一致しなくなる。
 */
const DECLARED_MUTABLE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  // Stripe の非同期返金（konbini / customer_balance）は作成直後 "pending" を返し、
  // 後日 refund.updated webhook が確定させる。金額も対象も不変のまま status だけ動く。
  refunds: ["status"],
};

/** `prevent_<table>_mutation` trigger を持つ表。 */
function appendOnlyTables(): string[] {
  return [
    ...new Set(
      [
        ...readDatabaseInvariants().matchAll(
          /FUNCTION\s+public\.prevent_(\w+)_mutation\b/gu,
        ),
      ]
        .map((match) => match[1])
        .filter((table): table is string => table !== undefined),
    ),
  ].sort();
}

/** `@@map` の逆引き（物理表名 → モデル名）。 */
function modelByTable(): Map<string, string> {
  const out = new Map<string, string>();
  let model: string | null = null;
  for (const raw of readPrismaSchema().split(/\r?\n/u)) {
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(raw);
    if (open?.[1]) {
      model = open[1];
      continue;
    }
    if (/^\s*\}/u.test(raw)) {
      model = null;
      continue;
    }
    const mapped = model ? /@@map\("([^"]+)"\)/u.exec(raw) : null;
    if (model && mapped?.[1]) out.set(mapped[1], model);
  }
  return out;
}

function delegateOf(model: string): string {
  return `${model[0]?.toLowerCase() ?? ""}${model.slice(1)}`;
}

/**
 * append-only な証跡テーブルの Prisma delegate 名。
 *
 * **手で並べない。** DB 側の trigger（SSoT は `prisma/baseline/invariants.sql`）から
 * 表名を導き、`@@map` を逆に引く。append-only な表を増やせば自動で対象になる。
 */
function appendOnlyDelegates(): string[] {
  const models = modelByTable();
  return appendOnlyTables()
    .map((table) => {
      const model = models.get(table);
      // 表名からモデルを引けない = @@map が変わったか trigger が増えた。
      // 「読めなかった＝対象外」にすると守りが黙って消えるので落とす。
      expect({ table, model: model ?? null }).toEqual({
        table,
        model: model ?? "@@map から引けなかった",
      });
      return delegateOf(model ?? "");
    })
    .sort();
}

function tableOfDelegate(delegate: string): string {
  for (const [table, model] of modelByTable()) {
    if (delegateOf(model) === delegate) return table;
  }
  return delegate;
}

/** モデルが持つ物理列名（スカラーのみ）。 */
function columnsOfTable(table: string): string[] {
  const model = modelByTable().get(table);
  if (model === undefined) return [];
  const lines = readPrismaSchema().split(/\r?\n/u);
  const start = lines.findIndex((line) =>
    new RegExp(`^\\s*model\\s+${model}\\s*\\{`, "u").test(line),
  );
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    if (/^\s*\}/u.test(raw)) break;
    const line = raw.replace(/\/\/.*$/u, "");
    const decl = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/u.exec(line);
    if (!decl?.[1] || !decl[2]) continue;
    const attrs = decl[5] ?? "";
    // リレーションフィールドは物理列ではない。
    if (/@relation\(/u.test(attrs) && !/@map\(/u.test(attrs)) continue;
    const mapped = /@map\("([^"]+)"\)/u.exec(attrs);
    out.push(
      mapped?.[1] ?? decl[1].replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase(),
    );
  }
  return out;
}

/** trigger が固定していない = 書き換えられる列。 */
function mutableColumnsOf(table: string): string[] {
  const body = readPlpgsqlFunction(`prevent_${table}_mutation`);
  // 免除分岐が無い trigger は無条件で RAISE する = 可変列ゼロ。
  if (!/TG_OP\s*=\s*'UPDATE'/u.test(body)) return [];
  const pinned = new Set(
    [...body.matchAll(/NEW\.(\w+)\s*(?:=|IS NOT DISTINCT FROM)\s*OLD\.\1\b/gu)]
      .map((match) => match[1])
      .filter((column): column is string => column !== undefined),
  );
  return columnsOfTable(table)
    .filter((column) => !pinned.has(column))
    .sort();
}

/** `(` の位置から対応する `)` までを返す（引用符とネストを追う）。 */
function balanced(source: string, openParen: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openParen; i < source.length; i += 1) {
    const ch = source[i];
    if (quote !== null) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(openParen, i + 1);
    }
  }
  return source.slice(openParen);
}

/** 引数式の `data: { … }` が書いているトップレベルのキー名。 */
function dataKeys(args: string): string[] {
  const at = args.search(/\bdata\s*:\s*\{/u);
  if (at === -1) return [];
  const body = balanced(args, args.indexOf("{", at));
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let token = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i] ?? "";
    if (quote !== null) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") {
      depth += 1;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      depth -= 1;
      continue;
    }
    if (depth !== 1) continue;
    if (ch === ":") {
      const key = /(\w+)\s*$/u.exec(token)?.[1];
      if (key) out.push(key);
      token = "";
      continue;
    }
    if (ch === ",") {
      token = "";
      continue;
    }
    token += ch;
  }
  return out;
}

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

  // shared 全体の fs traverse + regex。pre-push 並列負荷下で 5s default を超え得るため 30s。
  test("src/shared/ は @/admin・@/public を import しない（依存方向の保護）", () => {
    // shared は admin / public の双方から参照される下層。逆 import は
    // 依存方向の逆転（特に値 import は実行時依存）になり shared の再利用性を
    // 壊す。複数モデル横断の論理種別等の共有 SSoT は shared/domain 側に置く。
    const offenders = collectNonCommentOffenders(
      collectSourceFiles(join(SRC_ROOT, "shared")),
      /(?:from\s+["']@\/(?:admin|public)(?:\/|["'])|import\s*\(\s*["']@\/(?:admin|public)\/)/u,
    );

    expect(offenders).toEqual([]);
  }, 30000);

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
      // HTTP-02: ゲスト向け領収書 confirm page 経路。署名トークン URL 経由で
      // 個別ユーザーの領収書にアクセスするため CDN キャッシュ不可 (private route)。
      'source: "/receipts/:path*"',
      // ゲスト向け予約 / イベント参加申込 claim page。署名トークン URL 経由で
      // 個別ユーザーの予約詳細にアクセスするため CDN キャッシュ不可 (private route)。
      'source: "/claim/:path*"',
      // ゲスト決済 / キャンセル / キャンセル待ち PII 経路。公開 EVENT Cache-Tag ソース
      // より後ろで last-match-wins（Cache-Tag は emit しない）。
      'source: "/events/registrations/:path*"',
      'source: "/events/waitlist/:path*"',
      'source: "/events/cancel/:path*"',
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
    // src/shared/pdf/** は @react-pdf/renderer の Font.register (server-side PDF 埋込
    // フォント) 用で、Tailwind theme / Web CSS の Web font 参照とは context が異なるため
    // 除外する。PDF の Noto Sans JP は jsdelivr CDN 経由で runtime fetch → PDF 内部に
    // subset embed され、Web ページの font-family として配信されるわけではない。
    const pdfDirPrefix = join(SRC_ROOT, "shared", "pdf");
    const offenders = collectNonCommentOffenders(
      collectStyleSourceFiles(SRC_ROOT).filter(
        (file) => !file.startsWith(pdfDirPrefix),
      ),
      /(?:Noto Sans JP|Cormorant Garamond)/u,
    );

    expect(offenders).toEqual([]);
  });

  test("React Compiler 対象コードは useMemo / useCallback import を残さない", () => {
    // Prettier は import { ... } を複数行に整形するため、collectNonCommentOffenders の
    // 行単位マッチでは複数行 import が素通りする（Phase C 監査で判明）。
    // コメント除去後の全文を対象にした multiline 判定に置き換える。
    const offenders = collectSourceFiles(SRC_ROOT)
      .filter((file) => !REACT_COMPILER_MEMO_EXEMPT_FILES.includes(file))
      .filter((file) => {
        const withoutComments = readFileSync(file, "utf8")
          .split(/\r?\n/u)
          .filter((line) => {
            const trimmed = line.trim();
            return !(
              trimmed.startsWith("//") ||
              trimmed.startsWith("*") ||
              trimmed.startsWith("/*")
            );
          })
          .join("\n");
        return /import\s*\{[^}]*\buse(?:Memo|Callback)\b[^}]*\}/u.test(
          withoutComments,
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

  describe("append-only な証跡テーブル", () => {
    // 対象は**手で並べない**。DB 側の `prevent_<table>_mutation` trigger 関数から
    // 導き、`@@map` を逆に引いて Prisma の delegate 名にする。append-only な表を
    // 増やせば、この gate は自動でそれも見る。
    //
    // 3 本を手でコピーしていた頃、Refund だけ `\b(?:prisma|tx)` の `tx` が欠けており
    // `tx.refund.deleteMany(...)` が素通りしていた。inquiry_status_history に至っては
    // src 全域の gate が 1 本も無かった（専用テストは e2e/ しか走査していない）。
    // **同じ規約を複数箇所に手で書くと、必ずどれかがずれる。**
    const delegates = appendOnlyDelegates();

    test("append-only trigger の bypass GUC を立てる場所を固定する", () => {
      // trigger には `current_setting('myrrh.<x>_mutation_bypass')` の免除口がある。
      // **どこからでも立てられるなら append-only は成立しない。** 規約（散文）は
      // 「seed と data-retention purge の専用口」と書いていたが、それを確かめる機構は
      // 1 本も無く、実際には integration test の cleanup helper も立てていた。
      // 散文を実態に合わせるのではなく、実態を**機械で固定**する。
      const allowed = [
        // 保持期限を過ぎた問い合わせ履歴の物理削除（業務要件）。
        "src/shared/domain/data-retention/commands.ts",
        // 実 DB 統合テストの後片付け。Refund は Restrict FK を持つので、これが
        // 無いとテスト DB に証跡行が溜まり続ける。**ここ 1 ファイルだけ**。
        "__tests__/helpers/refund-test-cleanup.ts",
        // CASCADE 免除の根拠を bypass 有り/無しで実測する probe。
        // ここが無いと CASCADE_ALLOWED は「載せただけ」の unproven-exemption になる。
        "__tests__/integration/prisma/append-only-fk-actions.test.ts",
      ];

      const pattern = /set_config\(\s*['"`]myrrh\.\w+_mutation_bypass['"`]/u;
      const roots = ["src", "scripts", "__tests__", "e2e", "prisma"];
      const found: string[] = [];
      for (const root of roots) {
        const glob = new Bun.Glob("**/*.{ts,tsx,sql}");
        for (const file of glob.scanSync({
          cwd: join(ROOT, root),
          absolute: true,
        })) {
          if (pattern.test(readFileSync(file, "utf8"))) {
            found.push(relative(ROOT, file).replaceAll("\\", "/"));
          }
        }
      }

      // 許可の増減の両方を落とす。entry が実在しなくなったら stale として赤くする
      // （消し忘れた許可は、後から同じ path を作れば黙って通る穴になる）。
      expect(found.sort()).toEqual([...allowed].sort());
    });

    test("解析器が「通ってはいけない書き方」を実際に拾う（fixture）", () => {
      // data の中身を読む部分。ここが空を返すと「可変列しか書いていない」と
      // 誤読して素通りするので、代表的な書き方で実際に読めることを固定する。
      expect(
        dataKeys(`({ where: { id }, data: { status: "succeeded" } })`),
      ).toEqual(["status"]);
      expect(
        dataKeys(`({ where: { id }, data: { amount: 0, status: s } })`),
      ).toEqual(["amount", "status"]);
      // ネストした object / 関数呼び出しの中のキーを拾わない。
      expect(dataKeys(`({ data: { status: pick({ amount: 1 }) } })`)).toEqual([
        "status",
      ]);
      // spread は静的に読めない → キー 0 件 = 違反として扱われる側へ落ちる。
      expect(dataKeys(`({ data: { ...patch } })`)).toEqual([]);
      expect(dataKeys(`({ where: { id } })`)).toEqual([]);

      // 呼び出しの括弧を正しく閉じられること（閉じ損ねると次の呼び出しまで
      // 巻き込んで判定が壊れる）。
      expect(balanced(`f({ a: (1 + 2) }) ; g({ b: 3 })`, 1)).toBe(
        "({ a: (1 + 2) })",
      );
    });

    test("対象テーブルを DB trigger から導けている（gate 自体が空振りしていない）", () => {
      expect(delegates.length).toBeGreaterThanOrEqual(4);
      expect(delegates).toContain("auditLog");
      expect(delegates).toContain("termsAgreement");
      expect(delegates).toContain("refund");
      expect(delegates).toContain("inquiryStatusHistory");
    });

    test("trigger が可変列以外をすべて名指しで固定している", () => {
      // trigger 本文の免除分岐は `NEW.<col> = OLD.<col>` を**手で並べている**。
      // 列を足したのに並べ忘れると、その列は黙って書き換え可能になる。
      // 「モデルの列 − trigger が固定した列」が宣言した可変列と一致することを見る。
      for (const table of appendOnlyTables()) {
        expect({
          table,
          mutable: mutableColumnsOf(table),
        }).toEqual({
          table,
          mutable: [...(DECLARED_MUTABLE_COLUMNS[table] ?? [])],
        });
      }
    });

    for (const delegate of delegates) {
      const mutable = DECLARED_MUTABLE_COLUMNS[tableOfDelegate(delegate)] ?? [];

      test(`${delegate} の DELETE/upsert を src 以下で禁止`, () => {
        const offenders = collectNonCommentOffenders(
          collectSourceFiles(SRC_ROOT),
          new RegExp(
            `\\b(?:prisma|tx)\\.${delegate}\\.(delete|deleteMany|upsert)\\b`,
            "u",
          ),
        );
        expect(offenders).toEqual([]);
      });

      if (mutable.length === 0) {
        test(`${delegate} の UPDATE を src 以下で禁止（可変列が無い）`, () => {
          const offenders = collectNonCommentOffenders(
            collectSourceFiles(SRC_ROOT),
            new RegExp(
              `\\b(?:prisma|tx)\\.${delegate}\\.(update|updateMany)\\b`,
              "u",
            ),
          );
          expect(offenders).toEqual([]);
        });
        continue;
      }

      test(`${delegate} の UPDATE は可変列 (${mutable.join(", ")}) しか書かない`, () => {
        const offenders: string[] = [];
        const call = new RegExp(
          `\\b(?:prisma|tx)\\.${delegate}\\.(?:update|updateMany)\\s*\\(`,
          "gu",
        );
        for (const file of collectSourceFiles(SRC_ROOT)) {
          const source = readFileSync(file, "utf8");
          for (const hit of source.matchAll(call)) {
            const args = balanced(source, hit.index + hit[0].length - 1);
            const written = dataKeys(args);
            const extra = written.filter((key) => !mutable.includes(key));
            if (written.length === 0 || extra.length > 0) {
              offenders.push(
                `${relative(ROOT, file).replaceAll("\\", "/")} :: ${
                  written.length === 0
                    ? "data を静的に読めない"
                    : extra.join(", ")
                }`,
              );
            }
          }
        }
        expect(offenders).toEqual([]);
      });
    }
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
    // 旧 sectionRoots の "_components/homepage" は既に廃止済みのパスで
    // existsSync フィルタにより silent に脱落しており、_components 配下は
    // 実質チェック対象外になっていた（Phase C 監査で判明）。
    // 「_components 直下のトップレベル file だけが section 本体、サブディレクトリは
    // 内部実装コンポーネント」という区分は成り立たない。FeaturesSection.tsx のような
    // 薄い dispatcher は実際の SectionWrapper 描画を features/_features-*.tsx 等の
    // サブディレクトリへ委譲するため、viewport 端の safe-area を持つ本体を
    // 見落とす（Codex レビュー指摘、PR #1656）。_components 配下は再帰的に
    // 全 *.tsx / *.ts を対象にする。
    // safe-area と無関係な内部コンポーネントの padding（カード / ナビ /
    // パネル / フィルター等）は container-padding token を誤用せず、
    // 計算結果が同一の arbitrary value 表記（px-[1rem] = px-4）へ置換して
    // 禁止 class 名のみを回避する（ValuePropsSection.tsx が先例）。
    const sectionRoots = [
      join(PUBLIC_APP_ROOT, "_shared", "components", "sections"),
      join(PUBLIC_APP_ROOT, "_shared", "components", "page-hero"),
      join(PUBLIC_APP_ROOT, "_components"),
    ];
    const missingRoots = sectionRoots
      .filter((dir) => !existsSync(dir))
      .map((dir) => relative(ROOT, dir));
    expect(missingRoots).toEqual([]);

    const files = sectionRoots.flatMap((dir) => collectSourceFiles(dir));
    const px4 = collectNonCommentOffenders(files, /\bpx-4\b/u);
    const px6 = collectNonCommentOffenders(files, /\bpx-6\b/u);

    expect({ px4, px6 }).toEqual({ px4: [], px6: [] });
  });

  test("shared/lib → shared/domain import は allowlist 凍結（新規 lib→domain 禁止 ratchet）", () => {
    // アーキテクチャ規約: shared/lib は純粋ヘルパー・横断基盤、domain が上位。
    // 解消可能な lib→domain は ALLOWLIST から削除する（ratchet）。
    // 残件は framework lifecycle adapter のみを意図的に残す（下記コメント参照）。
    // 新規 lib→domain と「解消済みだが allowlist 残留」の両方を fail する。
    const SHARED_LIB_ROOT = join(SRC_ROOT, "shared", "lib");
    const LIB_TO_DOMAIN_IMPORT_ALLOWLIST = new Set(
      [
        // Better Auth 公式: deleteUser.beforeDelete / sendDeleteAccountVerification は
        // betterAuth() config 内に置く。customer-auth.ts は恒久 adapter（解消対象外）。
        // @see https://www.better-auth.com/docs/concepts/users-accounts
        "customer-auth.ts",
      ].map((rel) =>
        relative(ROOT, join(SHARED_LIB_ROOT, ...rel.split("/"))).replaceAll(
          "\\",
          "/",
        ),
      ),
    );

    const domainImportPattern =
      /(?:from\s+["']@\/shared\/domain|from\s+["'](?:\.\.\/)+domain|import\s*\(\s*["']@\/shared\/domain|import\s*\(\s*["'](?:\.\.\/)+domain)/u;

    const actual = new Set(
      collectNonCommentOffenders(
        collectSourceFiles(SHARED_LIB_ROOT),
        domainImportPattern,
      ).map((rel) => rel.replaceAll("\\", "/")),
    );

    for (const rel of LIB_TO_DOMAIN_IMPORT_ALLOWLIST) {
      expect(
        actual.has(rel),
        `${rel} は allowlist だが domain import が検出されない（allowlist から削除すること）`,
      ).toBe(true);
    }

    const newViolations = [...actual]
      .filter((file) => !LIB_TO_DOMAIN_IMPORT_ALLOWLIST.has(file))
      .sort();
    expect(newViolations).toEqual([]);

    const staleAllowlist = [...LIB_TO_DOMAIN_IMPORT_ALLOWLIST]
      .filter((file) => !actual.has(file))
      .sort();
    expect(staleAllowlist).toEqual([]);
  });

  test("public root layout に NuqsAdapter が配置されている", () => {
    const source = readFileSync(PUBLIC_LAYOUT_FILE, "utf8");

    expect(source).toContain("NuqsAdapter");
  });

  test("public root layout は認証 chrome を HTML に埋め込まず client hydrate 後に解決する", () => {
    const layoutSource = readFileSync(PUBLIC_LAYOUT_FILE, "utf8");
    // CDN blanket public (s-maxage) + Cookie vary 不在で login/mypage が漏洩しないよう、
    // layout / HeaderWithData 経路では session を読まない。
    expect(layoutSource).not.toContain("getCurrentCustomerUser");
    expect(layoutSource).not.toContain("resolvePublicAuthKind");
    expect(layoutSource).not.toContain("authSlot=");
    expect(layoutSource).not.toContain("authKind=");
    expect(layoutSource).toContain("<MobileNav />");

    const authKindRoute = join(
      SRC_ROOT,
      "app",
      "api",
      "customer",
      "auth-kind",
      "route.ts",
    );
    expect(existsSync(authKindRoute)).toBe(true);
    const routeSource = readFileSync(authKindRoute, "utf8");
    expect(routeSource).toContain("getCurrentCustomerUser");
    expect(routeSource).toContain("resolvePublicAuthKind");
    expect(routeSource).toContain("private, no-store");
  });

  test("管理 auth は IAP-only で Better Auth admin instance を再導入しない", () => {
    const source = readFileSync(
      join(SRC_ROOT, "shared", "domain", "admin-auth", "session.ts"),
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
    // LHCI サーバー起動スクリプトは build しない。CI は専用の Build step
    // (`build:skip-env:prepared` = prisma generate 済み前提)、ローカルは
    // `lhci:local` (`build:skip-env` = db:generate 込み) が担当する。
    // build 出力が startServerReadyPattern の監視窓に入る構造を排除するため。
    // 詳細な LHCI 契約は architecture/lighthouse-ci-env.test.ts が検証する。
    expect(lhciStartSource).not.toContain("build:skip-env");
    expect(scripts["lhci:local"]).toBe(
      "bun run build:skip-env && bun run lhci",
    );
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
    // unit と integration は **1 回の run-tests 呼び出し**に渡す。分けて 2 回呼ぶと
    // integration の serial DB バケットが unit の完了を待ってから始まり、その間
    // 並列バケットが空く。1 回にまとめると両バケットが重なる（runner が
    // serial / parallel を並列に動かす設計）。実測 347s → 216s。
    expect(scripts["test:all"]).toBe(
      "bun run db:generate && bun run test:db:migrate && bun scripts/run-tests.ts __tests__/unit __tests__/integration",
    );
    expect(scripts["test:all"]).not.toContain("bun run test:unit");
    expect(scripts["test:all"]).not.toContain("bun run test:integration");

    // 上の完全一致は書き換えれば通る。**この test の名前が主張している不変条件**
    // （integration は migrate の後）を、順序そのものとしても検査しておく。
    const testAll = String(scripts["test:all"]);
    expect(testAll.indexOf("test:db:migrate")).toBeGreaterThanOrEqual(0);
    expect(testAll.indexOf("test:db:migrate")).toBeLessThan(
      testAll.indexOf("__tests__/integration"),
    );
  });

  test("db:reset は Prisma v7 の明示 seed workflow を使う", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(PACKAGE_JSON_FILE, "utf8"),
    );
    expectRecord(packageJson);
    const scripts = packageJson["scripts"];
    expectRecord(scripts);

    expect(scripts["db:seed"]).toBe("bunx --bun prisma db seed");

    // 破壊的操作の前段ガードは `destructive-db-guard.test.ts` が別途強制する
    // （そちらは「先頭にあること」まで見る）。ここは Prisma v7 の
    // 明示 seed workflow だけを pin したいので、ガードを剥がしてから比較する。
    const dbReset = scripts["db:reset"];
    expect(typeof dbReset).toBe("string");
    expect(
      String(dbReset).replace(
        "bun scripts/assert-destructive-db-target.ts && ",
        "",
      ),
    ).toBe("bunx --bun prisma migrate reset --force && bun run db:seed");
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

    // `--max-warnings 0` は契約の一部。ESLint の "warn" は**誰も強制しない**ので、
    // 落ちない指摘として無限に溜まる（実測: 118 件が `__tests__` に溜まっていた）。
    // config 側では warn を全廃したが、外した瞬間にまた溜まりはじめるので入口でも固定する。
    //
    // `--concurrency 2` は CI の実メモリから決めた値で、速度の最適値ではない。
    // ESLint 10 の `--concurrency` は worker_threads だが `new Worker()` に
    // `resourceLimits` を渡していないため、workflow env の
    // `NODE_OPTIONS=--max-old-space-size=4096` が **isolate ごと**に効き、
    // メモリは worker 数に比例する。実測（2026-08-12、3458 ファイル）:
    //
    //   worker 数 | peak node RSS | ローカル所要
    //   ----------|---------------|-------------
    //   4         | **15.28 GB**  | 101.9s
    //   3         | ≒11.4 GB      | 114.7s
    //   2         | ≒7.6 GB       | 147.4s
    //   auto(=16) | —             | 165.0s（型付き lint は worker ごとに TS
    //             |               | プログラムを作り直すので増やすほど遅い）
    //
    // GitHub の標準 runner は 16 GB。`4` は上限の 95% で走っており、Node 22 → 24 の
    // V8 差でそれを越えて Lint & Format が SIGTERM(143) で 2/2 再現的に死んだ。
    // per-isolate の cap を 2560 / 1536 MB へ絞る方向は ERR_WORKER_OUT_OF_MEMORY で
    // 落ちるため使えない（worker は本当に 4 GB 近く要る）。
    // `3` でも 71% で、今回死んだのと同じ「上限すれすれ」に戻る。
    expect(scripts["lint"]).toBe("eslint . --concurrency 2 --max-warnings 0");
    expect(scripts["lint:files"]).toBe(
      "eslint --concurrency 2 --max-warnings 0",
    );
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
    // Phase 6b (2026-07-14) で Cloud Run secret binding は cloudbuild.yaml
    // `--set-secrets=` から Terraform `google_cloud_run_v2_service.template.
    // containers.env.value_source.secret_key_ref` に SSoT 移管。
    // NEXT_SERVER_ACTIONS_ENCRYPTION_KEY は cloud_run_public.tf / cloud_run_admin.tf
    // の dynamic env block が `var.cloud_run_secret_versions` map を回して自動注入する
    // (secrets.tf `local.runtime_secrets` に含まれる)。
    //
    // 従来の cloudbuild.yaml assertion は build-time inline (`availableSecrets`)
    // のみを検証する形に絞る (runtime binding は Terraform に移った)。
    const cloudbuildSource = readFileSync(CLOUDBUILD_FILE, "utf8");
    const variablesSource = readFileSync(
      join(ROOT, "terraform", "variables.tf"),
      "utf8",
    );
    const secretsSource = readFileSync(
      join(ROOT, "terraform", "secrets.tf"),
      "utf8",
    );

    // build-time: cloudbuild.yaml `availableSecrets` で NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
    // を Docker build stage の env として注入 (Next.js が client bundle に inline)。
    expect(cloudbuildSource).toContain(
      "projects/${PROJECT_ID}/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/versions/${_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY_SECRET_VERSION}",
    );

    // runtime: Terraform `var.cloud_run_secret_versions` map と `secrets.tf`
    // `local.runtime_secrets` の両方に NEXT_SERVER_ACTIONS_ENCRYPTION_KEY entry
    // が存在することを assert。
    expect(variablesSource).toMatch(
      /cloud_run_secret_versions[\s\S]*NEXT_SERVER_ACTIONS_ENCRYPTION_KEY\s*=\s*"\d+"/,
    );
    expect(secretsSource).toMatch(
      /runtime_secrets\s*=\s*\[[\s\S]*"NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"/,
    );
  });

  test("terraform/*.tf は project-level IAM binding と SA metadata を宣言しない (F1 structural closure、bootstrap-owns-all-project-IAM 契約)", () => {
    // 2026-07-14 F1 refactor 以降、以下は Terraform では宣言せず
    // `scripts/bootstrap-terraform.sh` が SSoT で管理する:
    //   - `google_service_account`               (SA metadata; runtime/build/scheduler/runner)
    //   - `google_project_iam_member`            (project-level bindings)
    //   - `google_project_iam_custom_role`       (custom Secret Manager role D1)
    //   - `google_project_iam_binding` / `_policy` (project-level bulk bindings)
    //   - `google_service_account_iam_member`    (cross-SA impersonation)
    //   - `google_service_account_iam_binding`   (cross-SA impersonation, bulk)
    //   - `google_iam_deny_policy`               (Deny Policy — Google IAM 制約)
    //
    // これは 2 経路の privilege escalation (research: `f1-residual-attack-analysis`) を
    // 構造的に閉じるため:
    //   Chain 1: runner の projectIamAdmin (with CEL hasOnly) → 新規 SA 作成 →
    //            secretAccessor 付与 → impersonate → secret 値読取
    //   Chain 2: runner の serviceAccountAdmin → 任意 SA の setIamPolicy →
    //            tokenCreator を自分に付与 → runtime-sa impersonate → secret 値読取
    // 両 role を runner から外し (bootstrap-terraform.sh の BOOTSTRAP_RUNNER_ROLES
    // 参照)、これらの binding を Terraform で self-declare する経路も封じる。
    //
    // 一方、resource-scoped IAM (Cloud Run service / Cloud Run job / Artifact
    // Registry repo など) は Terraform 側で継続管理する:
    //   - `google_cloud_run_v2_service_iam_member`
    //   - `google_cloud_run_v2_job_iam_member`
    //   - `google_artifact_registry_repository_iam_member`
    //   - `google_iap_web_iam_member` / `google_iap_tunnel_iam_member` 等
    // これらは各 resource の setIamPolicy 権限 (runner が run.admin /
    // artifactregistry.admin 経由で持つ) で書けるので F1 対象外。
    const TERRAFORM_DIR = join(ROOT, "terraform");
    const tfFiles = readdirSync(TERRAFORM_DIR).filter((f) => f.endsWith(".tf"));

    // 削除済ファイルは復活禁止 (bootstrap SSoT に移管済)。
    expect(tfFiles).not.toContain("secret_iam.tf");
    expect(tfFiles).not.toContain("iam_project.tf");

    // 禁止 resource 種別: bootstrap の SSoT に移管したので Terraform 側の
    // 宣言は F1 structural closure を破ることになる。コメント言及は許容
    // (`resource "..."` のように行頭が resource 宣言のみ検出、# コメント除外)。
    const FORBIDDEN_RESOURCE_PATTERNS: readonly {
      pattern: RegExp;
      reason: string;
    }[] = [
      {
        pattern: /^resource\s+"google_service_account"\s/mu,
        reason: "SA metadata は bootstrap-terraform.sh の SSoT",
      },
      {
        pattern: /^resource\s+"google_project_iam_member"\s/mu,
        reason: "project-level IAM binding は bootstrap-terraform.sh の SSoT",
      },
      {
        pattern: /^resource\s+"google_project_iam_binding"\s/mu,
        reason: "project-level IAM binding は bootstrap-terraform.sh の SSoT",
      },
      {
        pattern: /^resource\s+"google_project_iam_policy"\s/mu,
        reason: "project-level IAM policy は bootstrap-terraform.sh の SSoT",
      },
      {
        pattern: /^resource\s+"google_project_iam_custom_role"\s/mu,
        reason:
          "custom role (D1 含む) は bootstrap-terraform.sh の SSoT (runner が iam.roles.create を持たないため fresh apply で F8 になる)",
      },
      {
        pattern: /^resource\s+"google_service_account_iam_member"\s/mu,
        reason:
          "cross-SA impersonation は bootstrap-terraform.sh の SSoT (runner に serviceAccountAdmin を戻せない)",
      },
      {
        pattern: /^resource\s+"google_service_account_iam_binding"\s/mu,
        reason:
          "cross-SA impersonation は bootstrap-terraform.sh の SSoT (runner に serviceAccountAdmin を戻せない)",
      },
      {
        pattern: /^resource\s+"google_iam_deny_policy"\s/mu,
        reason:
          "Deny Policy は bootstrap-terraform.sh の SSoT (Google IAM 制約: roles/iam.denyAdmin は Org/Folder scope 専用)",
      },
    ];

    const offenders: string[] = [];
    for (const file of tfFiles) {
      const source = readFileSync(join(TERRAFORM_DIR, file), "utf8");
      for (const { pattern, reason } of FORBIDDEN_RESOURCE_PATTERNS) {
        if (pattern.test(source)) {
          offenders.push(`terraform/${file}: ${pattern.source} — ${reason}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // 409 を吐く resource type (Deploy Production log で確認済み or
  // 新規 fresh-state apply で create を試みるもの)。
  const IMPORT_REQUIRED_RESOURCE_TYPES: readonly string[] = [
    "google_secret_manager_secret",
    "google_cloud_scheduler_job",
    "google_artifact_registry_repository",
    "google_cloudbuild_worker_pool",
    "google_cloud_run_v2_service",
    "google_cloud_run_v2_job",
    "google_compute_global_address",
    "google_compute_region_network_endpoint_group",
    "google_compute_backend_service",
    "google_compute_url_map",
    "google_compute_managed_ssl_certificate",
    "google_compute_target_https_proxy",
    "google_compute_target_http_proxy",
    "google_compute_global_forwarding_rule",
    "google_iam_workload_identity_pool",
    "google_iam_workload_identity_pool_provider",
    "google_iap_web_cloud_run_service_iam_member",
    "cloudflare_r2_bucket",
    "cloudflare_dns_record",
    "cloudflare_zone_setting",
    "cloudflare_ruleset",
    "cloudflare_turnstile_widget",
  ];

  const findResourcesMissingImport = (
    source: string,
    requiredTypes: readonly string[] = IMPORT_REQUIRED_RESOURCE_TYPES,
  ): Array<{ resourceType: string; resourceName: string }> => {
    const importBlockRe = /import\s*\{([\s\S]*?)\n\}/gu;
    const resourceDeclRe = /^resource\s+"([^"]+)"\s+"([^"]+)"/gmu;
    const importBodies = [...source.matchAll(importBlockRe)].map(
      (block) => block[1] ?? "",
    );
    const missing: Array<{ resourceType: string; resourceName: string }> = [];
    for (const match of source.matchAll(resourceDeclRe)) {
      const resourceType = match[1] ?? "";
      const resourceName = match[2] ?? "";
      if (!requiredTypes.includes(resourceType)) {
        continue;
      }
      const expectedTo = `${resourceType}.${resourceName}`;
      const escapedTo = expectedTo.replaceAll(".", "\\.");
      const toPattern = new RegExp(
        `to\\s*=\\s*${escapedTo}(?:\\[[^\\]]+\\])?\\b`,
        "u",
      );
      const hasMatchingImport = importBodies.some((body) =>
        toPattern.test(body),
      );
      if (!hasMatchingImport) {
        missing.push({ resourceType, resourceName });
      }
    }
    return missing;
  };

  test("terraform/*.tf の pre-existing GCP resource には対応する import{} block が同一 file 内に存在する (段階 2: Deploy Production 409 対策)", () => {
    // Deploy Production log で 409 "already exists" を吐いていた pre-existing
    // GCP resource は全て Terraform 1.7+ の top-level `import {}` block で
    // fresh state apply 時に自動 adopt される契約。この drift gate は「新規に
    // resource 宣言だけ足して import block を書き忘れる」 regression を防ぐ:
    //
    //   - 対象 resource type は「Deploy Production log で 409 を出す = GCP 側
    //     に既存する = terraform state に無ければ create を試みる」もの全て。
    //   - 各 .tf file 内で `resource "<type>"` を declared したら、同じ file
    //     内に `import {` block (`to = <type>.<name>` を含む) が存在すること
    //     を機械強制する。import が for_each で書かれる場合も `to = X[each.key]`
    //     形式で resource type を含むためこの grep で拾える。
    //
    // 例外: `google_cloud_run_v2_service_iam_member` (iam_cloud_run.tf) は
    // resource-scoped IAM binding で 409 を出さない (同一 role/member への
    // add は idempotent) ため対象外。同様に `google_artifact_registry_repository_iam_member`
    // も対象外。純粋な resource skeleton の 409 だけを対象にする。
    const TERRAFORM_DIR = join(ROOT, "terraform");
    const tfFiles = readdirSync(TERRAFORM_DIR).filter((f) => f.endsWith(".tf"));

    const offenders: string[] = [];
    // 実 file 走査は従来どおり GCP のみ。Cloudflare は fixture で母集合に入る
    // ことを固定する（既存の import 無し bucket をこの PR では触らない）。
    const gcpImportRequiredTypes = IMPORT_REQUIRED_RESOURCE_TYPES.filter(
      (resourceType) => resourceType.startsWith("google_"),
    );
    for (const file of tfFiles) {
      const source = readFileSync(join(TERRAFORM_DIR, file), "utf8");
      for (const { resourceType, resourceName } of findResourcesMissingImport(
        source,
        gcpImportRequiredTypes,
      )) {
        const expectedTo = `${resourceType}.${resourceName}`;
        offenders.push(
          `terraform/${file}: resource "${resourceType}" "${resourceName}" is declared but no import{} block with to = ${expectedTo} found (add one to avoid 409 on fresh-state apply)`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  test("Cloudflare resource は import{} 無しだと offender になる（fixture）", () => {
    const source = `
resource "cloudflare_r2_bucket" "example" {
  account_id = "acct"
  name       = "example"
}
`;
    expect(findResourcesMissingImport(source)).toEqual([
      {
        resourceType: "cloudflare_r2_bucket",
        resourceName: "example",
      },
    ]);
  });

  test("Cloudflare resource は対応する import{} があれば offender にならない（fixture）", () => {
    const source = `
import {
  to = cloudflare_r2_bucket.example
  id = "acct/example/default"
}

resource "cloudflare_r2_bucket" "example" {
  account_id = "acct"
  name       = "example"
}
`;
    expect(findResourcesMissingImport(source)).toEqual([]);
  });

  test("Cloudflare provider v5 の import ID は各 resource type ごとに公式 format と一致する (2026-07-14 4 連続 deploy-production 失敗の再発防止)", () => {
    // Cloudflare provider v5.22.0+ は import ID を strict に validate する:
    //
    //   - cloudflare_ruleset:            <{accounts|zones}/{account_id|zone_id}>/<ruleset_id>
    //     └ discriminator prefix (`zones/` or `accounts/`) 必須
    //   - cloudflare_r2_bucket:          <account_id>/<bucket_name>/<jurisdiction>
    //   - cloudflare_turnstile_widget:   <account_id>/<sitekey>
    //   - cloudflare_zone_setting:       <zone_id>/<setting_id>
    //   - cloudflare_dns_record:         <zone_id>/<record_id>
    //
    // PR #1098 で `cloudflare_ruleset` の import ID を `<zone_id>/<ruleset_id>` の
    // v4 相当 raw ID 形式で書き、PR #1099 で lock file が provider を v5.22.0 に
    // pin して以降 4 連続の deploy-production terraform-apply が
    // `Error: invalid discriminator segment` で abort。auto-merge は required PR
    // check のみ見るため post-merge apply 失敗が silent、user への通知経路もなし。
    //
    // この gate で「新規に Cloudflare resource 宣言 + import block を書く時、ID
    // format が provider docs と一致すること」を機械強制。
    // 参考: https://github.com/cloudflare/terraform-provider-cloudflare/blob/main/docs/resources/{ruleset,r2_bucket,turnstile_widget,zone_setting,dns_record}.md
    const TERRAFORM_DIR = join(ROOT, "terraform");
    const tfFiles = readdirSync(TERRAFORM_DIR).filter((f) => f.endsWith(".tf"));

    // 各 resource type ごとに ID pattern を定義。
    // ID string は `${var.xxx}/literal` の interpolation を含みうるので、
    // interpolation 部分は `[^"/]+` 相当のセグメントとして match させる。
    const CLOUDFLARE_IMPORT_ID_PATTERNS: ReadonlyArray<{
      resourceType: string;
      pattern: RegExp;
      docsFormat: string;
    }> = [
      {
        resourceType: "cloudflare_ruleset",
        // discriminator (zones|accounts) + / + segment + / + segment
        pattern: /^(?:zones|accounts)\/[^/]+\/[^/]+$/u,
        docsFormat: "<{accounts|zones}/{account_id|zone_id}>/<ruleset_id>",
      },
      {
        resourceType: "cloudflare_r2_bucket",
        // account_id / bucket_name / jurisdiction (default|eu|fedramp)
        pattern: /^[^/]+\/[^/]+\/(?:default|eu|fedramp)$/u,
        docsFormat: "<account_id>/<bucket_name>/<jurisdiction>",
      },
      {
        resourceType: "cloudflare_turnstile_widget",
        // account_id / sitekey (Turnstile sitekey は英数字 + 先頭 `0x`)
        pattern: /^[^/]+\/[^/]+$/u,
        docsFormat: "<account_id>/<sitekey>",
      },
      {
        resourceType: "cloudflare_zone_setting",
        // zone_id / setting_id (0rtt / brotli / ssl 等の setting name)
        pattern: /^[^/]+\/[^/]+$/u,
        docsFormat: "<zone_id>/<setting_id>",
      },
      {
        resourceType: "cloudflare_dns_record",
        // zone_id / record_id (32-char hex)
        pattern: /^[^/]+\/[^/]+$/u,
        docsFormat: "<zone_id>/<record_id>",
      },
    ];

    const offenders: string[] = [];
    // すべての .tf file の import block を抽出。
    // `import {` から `\n}` (行頭 `}`) までを lazy match し、その中の `to = <resource>` と
    // `id = "<literal>"` を抽出する。`id = "${var.xxx}/..."` の interpolation は
    // literal 部分だけで validate (interpolation の変数値までは grep gate では追わない)。
    //
    // ⚠ `[^{}]*?` を使うと `${var.xxx}` の `{` `}` を exclusion set が拾って
    // import block そのものが match しなくなる (silent test bypass の元凶)。
    // 代わりに `[\s\S]*?` + 行頭 `}` (`\n}`) で block 終端を確実に捕捉。
    const importBlockRe = /import\s*\{([\s\S]*?)\n\}/gu;
    for (const file of tfFiles) {
      const source = readFileSync(join(TERRAFORM_DIR, file), "utf8");
      const importBlocks = source.matchAll(importBlockRe);
      for (const block of importBlocks) {
        const body = block[1] ?? "";
        const toMatch = body.match(/to\s*=\s*(cloudflare_[a-z0-9_]+)/u);
        const idMatch = body.match(/id\s*=\s*"([^"]+)"/u);
        if (!toMatch || !idMatch) continue;
        const resourceType = toMatch[1];
        const idString = idMatch[1] ?? "";
        // interpolation `${var.xxx}` を "V" placeholder に置換して pattern match を通す
        // (実行時に variable が展開された後の形状を validate する意図)。
        const idNormalized = idString.replaceAll(/\$\{[^}]+\}/gu, "V");
        const rule = CLOUDFLARE_IMPORT_ID_PATTERNS.find(
          (r) => r.resourceType === resourceType,
        );
        if (!rule) {
          offenders.push(
            `terraform/${file}: ${resourceType} import block has no CLOUDFLARE_IMPORT_ID_PATTERNS entry (register the type before adding import blocks)`,
          );
          continue;
        }
        if (!rule.pattern.test(idNormalized)) {
          offenders.push(
            `terraform/${file}: ${resourceType} import id "${idString}" does not match provider v5 format "${rule.docsFormat}"`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("`REQUIRED_CLOUD_SCHEDULER_CRON_JOB_IDS` は `terraform/cloud_scheduler.tf` の cron_jobs と完全同期する (2026-07-15 audit gap #4 再発防止)", () => {
    // audit script の expected cron job list (`REQUIRED_CLOUD_SCHEDULER_CRON_JOB_IDS`)
    // と Terraform state (`terraform/cloud_scheduler.tf` の `local.cron_jobs`) を強制同期。
    // 差分あれば `bun run gcp:audit-production-iap` が false-positive で fail する
    // (2026-07-15 6 個の cron job が audit 側で "unexpected" 判定されたのが今回契機)。
    const AUDIT_MODEL = readFileSync(
      join(SCRIPTS_ROOT, "gcp-production-audit-model.ts"),
      "utf8",
    );
    const SCHEDULER_TF = readFileSync(
      join(ROOT, "terraform", "cloud_scheduler.tf"),
      "utf8",
    );

    // audit model の array literal を extract
    const auditListMatch = AUDIT_MODEL.match(
      /REQUIRED_CLOUD_SCHEDULER_CRON_JOB_IDS\s*=\s*\[([\s\S]*?)\]/u,
    );
    if (!auditListMatch) {
      throw new Error(
        "REQUIRED_CLOUD_SCHEDULER_CRON_JOB_IDS array literal not found in scripts/gcp-production-audit-model.ts",
      );
    }
    const auditJobIds = new Set(
      [...(auditListMatch[1]?.matchAll(/"([^"]+)"/gu) ?? [])].map(
        (m) => m[1] ?? "",
      ),
    );

    // Terraform side: `local.cron_jobs` の name field を extract
    const tfCronBlockMatch = SCHEDULER_TF.match(
      /cron_jobs\s*=\s*\[([\s\S]*?)^\s*\]/mu,
    );
    if (!tfCronBlockMatch) {
      throw new Error(
        "cron_jobs array literal not found in terraform/cloud_scheduler.tf",
      );
    }
    const tfJobNames = new Set(
      [...(tfCronBlockMatch[1]?.matchAll(/name\s*=\s*"([^"]+)"/gu) ?? [])].map(
        (m) => m[1] ?? "",
      ),
    );

    const missingInAudit = [...tfJobNames].filter((n) => !auditJobIds.has(n));
    const missingInTf = [...auditJobIds].filter((n) => !tfJobNames.has(n));

    expect(
      missingInAudit,
      "cron jobs in terraform/cloud_scheduler.tf but not in REQUIRED_CLOUD_SCHEDULER_CRON_JOB_IDS",
    ).toEqual([]);
    expect(
      missingInTf,
      "cron jobs in REQUIRED_CLOUD_SCHEDULER_CRON_JOB_IDS but not in terraform/cloud_scheduler.tf",
    ).toEqual([]);
  });

  test("cloudbuild.yaml の substitutions block で定義された key は必ず body 内で参照される (2026-07-14 PR #1104 で発覚した Cloud Build INVALID_ARGUMENT の再発防止)", () => {
    // Cloud Build の substitution 契約:
    //   substitutions block に定義された `_KEY: "default"` は cloudbuild.yaml
    //   body 内のいずれかで `${_KEY}` として参照される必要がある。参照 0 件だと
    //   `gcloud builds submit` が `INVALID_ARGUMENT: key "_KEY" in the
    //   substitution data is not matched in the template` で失敗する。
    //
    // PR #1101 (Phase 6b) で cloudbuild.yaml から `--set-env-vars=X=${_KEY}` を
    // 削除、対応する substitutions block 定義側の掃除が漏れて post-merge
    // deploy が連続失敗した (main 復旧に PR #1103 + #1104 の 2 回追加 fix 必要)。
    //
    // 参考: https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values
    const CLOUDBUILD = readFileSync(join(ROOT, "cloudbuild.yaml"), "utf8");

    // substitutions: block を抽出 (次の top-level key 直前まで)。
    const subBlockMatch = CLOUDBUILD.match(/^substitutions:\n((?:  .*\n)*)/mu);
    if (!subBlockMatch) {
      throw new Error("cloudbuild.yaml: substitutions: block not found");
    }
    const subBlock = subBlockMatch[1] ?? "";
    const defined = new Set(
      [...subBlock.matchAll(/^ {2}(_[A-Z0-9_]+):/gmu)].map((m) => m[1] ?? ""),
    );

    // body 側の `${_KEY}` 参照を全 line から検出 (comment 行は除外 —
    // Cloud Build は comment 内の substitution reference を count しない)。
    const bodyLines = CLOUDBUILD.split("\n").filter(
      (line) => !line.trimStart().startsWith("#"),
    );
    const body = bodyLines.join("\n");
    const used = new Set(
      [...body.matchAll(/\$\{(_[A-Z0-9_]+)\}/gu)].map((m) => m[1] ?? ""),
    );

    const unused = [...defined].filter((k) => !used.has(k)).sort();
    expect(unused).toEqual([]);
  });

  test("branch-protection.json の required contexts に対応する workflow は path filter を持たない (2026-07-14 PR #1103 で発覚した MISSING 検 chain の再発防止)", () => {
    // GitHub branch protection の `required_status_checks.contexts` に登録された
    // check name を提供する workflow が `on: pull_request: paths:` filter を持つと、
    // 該当 paths を触らない PR で workflow が発火せず check が **MISSING** 扱いになる。
    // MISSING は branch protection 上 unsatisfied → auto-merge が永久 block。
    // 参考: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rulesets#pull-requests-are-blocked-when-status-checks-are-required-but-not-set-up
    //
    // PR #1103 (fix/ci-terraform-apply-visibility-and-health-gate) の Auto-merge が
    // 全 checks green 後も BLOCKED のままだった: `Terraform / validate` (required) を
    // 提供する `terraform.yml` が `paths: [terraform/**]` filter で発火しなかった。
    // 対策: required check を提供する workflow から paths filter を撤去。
    const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");
    const BRANCH_PROTECTION_PATH = join(
      ROOT,
      ".github",
      "branch-protection.json",
    );

    const bp: unknown = JSON.parse(
      readFileSync(BRANCH_PROTECTION_PATH, "utf8"),
    );
    expectRecord(bp);
    const rsc = bp["required_status_checks"];
    expectRecord(rsc);
    const contexts = rsc["contexts"];
    if (!Array.isArray(contexts)) {
      throw new Error(
        "branch-protection.json: required_status_checks.contexts must be an array",
      );
    }
    const requiredNames = new Set(
      contexts.filter((c): c is string => typeof c === "string"),
    );

    // 全 workflow を parse し、name / paths filter を抽出。
    const workflowFiles = readdirSync(WORKFLOWS_DIR).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    );

    const offenders: string[] = [];
    for (const file of workflowFiles) {
      const source = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      // workflow 全体の name (`^name: X$`) と job 単位の name (`^\s+name: X$` in jobs)
      // を抽出。branch protection の context 名は「job の name attribute」に対応。
      const jobNames = [...source.matchAll(/^\s{4,}name:\s*(.+?)\s*$/gmu)]
        .map((m) => m[1] ?? "")
        .filter((n) => n.length > 0);
      const providedRequired = jobNames.filter((n) => requiredNames.has(n));
      if (providedRequired.length === 0) continue;

      // このファイルが required context を提供している → paths filter を検査。
      // 行単位の文字列一致であり、`on:` の YAML 構造は見ていない
      // （ネスト・アンカー・別キー配下の paths は拾えない。js-yaml は依存に無い）。
      const onBlockMatch = source.match(/^on:\s*\n([\s\S]*?)(?=^\S)/mu);
      const onBlock = onBlockMatch?.[1] ?? "";
      if (/^\s+paths(-ignore)?:\s*$/mu.test(onBlock)) {
        offenders.push(
          `.github/workflows/${file}: provides required check(s) [${providedRequired.join(", ")}] but has path filter in on: block — remove path filter (required check would be MISSING when paths don't match, blocking auto-merge)`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  test("scripts/bootstrap-terraform.sh は F1 structural closure に必要な grants を全て含む (bootstrap-owns-all-project-IAM SSoT)", () => {
    // F1 structural closure の実装が bootstrap script 側で維持されていることを
    // 回帰防止として grep gate で強制する:
    //   1. runner に projectIamAdmin / serviceAccountAdmin が付与されていない
    //   2. runtime-sa / build-sa への project-level 直接 grants が存在
    //   3. SA-scoped cross-SA impersonation grants が存在
    //
    // これが崩れると F1 が再発する (research: `f1-residual-attack-analysis`)。
    const source = readFileSync(
      join(SCRIPTS_ROOT, "bootstrap-terraform.sh"),
      "utf8",
    );

    // runner に付与されてはいけない role (F1 起点):
    // 行頭 anchor だけだと `--role="roles/..."` を見逃す。設計メモの # コメント行は
    // 剥がしてから `--role="..."` と BOOTSTRAP_RUNNER_ROLES の全要素を収集し、
    // forbidden set との積集合で判定する (コメント strip 必須 — 剥がさないと
    // 履歴コメント内の `--role=` 引用が false positive になる)。
    const stripHashComments = (shellSource: string): string =>
      shellSource
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
    const stripped = stripHashComments(source);
    const FORBIDDEN_RUNNER_ROLES = new Set([
      "roles/resourcemanager.projectIamAdmin",
      "roles/iam.serviceAccountAdmin",
    ]);
    const rolesFromFlags = [
      ...(stripped.matchAll(/--role="([^"]+)"/gu) ?? []),
    ].map((match) => match[1] ?? "");
    const bootstrapRolesBlock = stripped.match(
      /BOOTSTRAP_RUNNER_ROLES="([\s\S]*?)"/u,
    );
    const rolesFromBootstrap = bootstrapRolesBlock
      ? bootstrapRolesBlock[1]
          .replaceAll("\\", "")
          .split(/\s+/u)
          .filter((role) => role.startsWith("roles/"))
      : [];
    const forbiddenGranted = [...rolesFromFlags, ...rolesFromBootstrap].filter(
      (role) => FORBIDDEN_RUNNER_ROLES.has(role),
    );
    expect(forbiddenGranted).toEqual([]);

    // runtime-sa / build-sa への project-level 直接 grants:
    expect(source).toContain('serviceAccount:${RUNTIME_SA}"');
    expect(source).toContain('serviceAccount:${BUILD_SA}"');
    // secretAccessor は runtime + build 両方に付ける (旧 secret_iam.tf 相当)
    expect(source).toContain('--role="roles/secretmanager.secretAccessor"');
    // build-sa の追加 project bindings (旧 iam_project.tf 相当)
    expect(source).toContain('--role="roles/cloudbuild.builds.builder"');
    expect(source).toContain('--role="roles/logging.logWriter"');

    // SA-scoped cross-SA impersonation grants (旧 iam_cloud_run.tf +
    // service_accounts.tf 相当):
    //   - build-sa uses runtime-sa (deploy 時 actAs)
    //   - runner uses scheduler-sa (Cloud Scheduler job 作成時 actAs)
    expect(source).toMatch(
      /add-iam-policy-binding\s+"\$\{RUNTIME_SA\}"[\s\S]*?serviceAccount:\$\{BUILD_SA\}[\s\S]*?roles\/iam\.serviceAccountUser/u,
    );
    expect(source).toMatch(
      /add-iam-policy-binding\s+"\$\{SCHEDULER_SA\}"[\s\S]*?serviceAccount:\$\{TERRAFORM_SA\}[\s\S]*?roles\/iam\.serviceAccountUser/u,
    );

    // SA 作成 (旧 service_accounts.tf 相当) が bootstrap 側で行われる:
    expect(source).toContain("myrrh-rental-space-runtime");
    expect(source).toContain("myrrh-rental-space-build");
    expect(source).toContain("myrrh-rental-space-scheduler");
  });

  test("管理 Better Auth canonical route handler は削除済み", () => {
    expect(existsSync(AUTH_ROUTE_FILE)).toBe(false);
  });

  // cache tag literal drift gate は
  // __tests__/unit/architecture/cache-tag-literals.test.ts に移動（AST 化し
  // template literal / 複数行呼出も検出するよう強化。旧 regex 版は削除済み）。

  test("SPACE_RATE_PLANS cache tag は cacheTag producer を持つ（rate-plan-queries.ts の getSpaceRatePlans）", () => {
    const source = readFileSync(SPACE_RATE_PLAN_QUERIES_FILE, "utf8");
    expect(source).toContain('"use cache"');
    expect(source).toContain("cacheTag(CACHE_TAGS.SPACE_RATE_PLANS(");
  });

  test("SPACE_RATE_PLANS cache tag は id-keyed producer function のため CDN mapping 対象外が明示されている", async () => {
    // CACHE_TAGS.SPACE_RATE_PLANS は spaceId を受け取るタグ生成関数であり、他の
    // CACHE_TAGS エントリと違って固定文字列ではない。NEXTJS_TAG_TO_CDN_TAG は
    // `[CACHE_TAGS.X]: CDN_CACHE_TAGS.Y` の computed key で構成されるため、関数値を
    // そのまま key にはできない。cdn-cache-tags.test.ts 側の generic drift gate
    // ("every CACHE_TAGS value is either mapped OR on the allowlist") は
    // `typeof value === "function"` の場合のみ scope 外にしており、SPACE_RATE_PLANS が
    // 現状唯一の対象。ここではその前提条件（関数値である事実）と、mapping 側への
    // 事故混入がないことを SPACE_RATE_PLANS 単体で明示的に固定する。
    const { CACHE_TAGS } = await import("@/shared/lib/constants/cache");
    const { CDN_CACHE_TAGS, NEXTJS_TAG_TO_CDN_TAG } =
      await import("@/shared/lib/constants/cdn-cache-tags");

    expect(typeof CACHE_TAGS.SPACE_RATE_PLANS).toBe("function");

    // 将来 CDN-cached surface を追加する際に inline できるよう CDN 側タグは予約済み
    expect(CDN_CACHE_TAGS.SPACE_RATE_PLANS).toBe("space-rate-plans-v1");

    // 現時点では NEXTJS_TAG_TO_CDN_TAG に事故的に混入していない
    const mappedValues = Object.values(NEXTJS_TAG_TO_CDN_TAG);
    expect(mappedValues).not.toContain(CDN_CACHE_TAGS.SPACE_RATE_PLANS);
  });

  test("cron route は shared helper 経由で認証する", () => {
    // 固定2ファイルのみの検証だと23件中21件が regression 保護の死角になる
    // （Phase C 監査で判明）。API_CRON_ROUTE_ROOT 配下の全 route.ts を動的走査する。
    const routeFiles = collectSourceFiles(API_CRON_ROUTE_ROOT).filter((file) =>
      file.endsWith(join("route.ts")),
    );
    const offenders = routeFiles
      .filter(
        (file) => !readFileSync(file, "utf8").includes("authorizeCronRequest"),
      )
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
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

  test("_shared/actions 配下は legacy success wrapper を再導入しない（動的走査）", () => {
    // 上記5テストは代表ファイルの手動列挙による positive spot-check（維持）。
    // 手動列挙は新規追加ファイルに追従できず、実際に61ファイル中38ファイルが
    // どのテストにも列挙されていなかった（Phase C 監査で判明）。
    // _shared/actions 配下を再帰走査し、新規ファイルも含めて legacy wrapper の
    // 再導入を漏れなく検知する。
    const actionsRoot = join(
      SRC_ROOT,
      "app",
      "(admin)",
      "admin",
      "(dashboard)",
      "_shared",
      "actions",
    );
    const offenders = collectNonCommentOffenders(
      collectSourceFiles(actionsRoot),
      /\bcreateSuccess\(|type\s+ActionResult\b|\bexecuteAdminMutation\(/u,
    );

    expect(offenders).toEqual([]);
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

    // 旧 shape を「reject される」negative test fixture として **意図的に**
    // 残している schema 検証 spec のみ allowlist に追加。
    const ALLOWLIST: readonly string[] = [
      // PortableTextSpanSchema の「旧 type:'text' は受け付けない」 negative test
      "__tests__/unit/lib/portable-text/schema.test.ts",
    ] as const;

    for (const root of [TESTS_ROOT, E2E_ROOT]) {
      if (!existsSync(root)) continue;
      for (const path of collectSourceFiles(root)) {
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
  }, 15_000);

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
  // <Suspense><html>` により全 71 route を `ƒ` 化済 (cacheComponents + strict-dynamic
  // CSP)。runtime nonce で全 chunk 保護されるため
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
      extraItems?: Record<string, unknown>[];
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
        // value-props.items は min:2 のため、不正 item 1件だけだと配列長エラーで
        // fail し、title フィールド自体の検証が行われたかをマスクしてしまう
        // （Phase C 監査で判明）。有効な item を1件足して min 制約を満たす。
        extraItems: [{ icon: "IconClock", eyebrow: "Speed", title: [] }],
      },
    ];
    for (const { type, field, itemTemplate, extraItems } of targets) {
      const stringInItem = validateSectionConfig(type, {
        items: [
          { ...(itemTemplate ?? {}), [field]: "string-not-array" },
          ...(extraItems ?? []),
        ],
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

  test("Intl.DateTimeFormat / toLocale*String は timeZone 指定必須 (JST drift 防止)", () => {
    // Cloud Run (TZ=UTC) 上で timeZone を指定しない Intl.DateTimeFormat /
    // toLocaleDateString / toLocaleTimeString / toLocaleString(with options)
    // は SSR で UTC 時刻を整形し、CSR (browser JST) と食い違って hydration mismatch や
    // 予約バー描画位置の 9h ズレを引き起こす silent bug (Round-4 findings #6 #7 #18)。
    // SSoT は @/shared/lib/date-format の formatTimeShort / formatJstDateString /
    // formatJstYmd 等。inline 呼び出しでも options に `timeZone: "Asia/Tokyo"` を必須にする。
    //
    // 判定: options 引数を持つ Intl date/time 呼び出しで `timeZone:` が入っていないもの。
    // 引数なし `.toLocaleString()` (数値通貨整形) は options object を持たないので対象外。
    const CALL_PATTERN =
      /(?:new\s+Intl\.DateTimeFormat|\.toLocale(?:Date|Time)?String)\(/gu;
    const OPTIONS_PATTERN = /\{[\s\S]*?:/u;
    const TIMEZONE_PATTERN = /\btimeZone\s*:/u;

    const findMissingTimeZone = (source: string): number[] => {
      const offenders: number[] = [];
      CALL_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = CALL_PATTERN.exec(source)) !== null) {
        const bodyStart = match.index + match[0].length;
        let depth = 1;
        let pos = bodyStart;
        while (pos < source.length && depth > 0) {
          const c = source[pos];
          if (c === "(") depth++;
          else if (c === ")") depth--;
          pos++;
        }
        const body = source.slice(bodyStart, pos - 1).trim();
        // 引数なし / locale のみ（数値通貨整形等）は options 検査対象外。
        if (body.length === 0 || !body.includes(",")) continue;
        if (!OPTIONS_PATTERN.test(body) || !TIMEZONE_PATTERN.test(body)) {
          const lineNum = source.slice(0, match.index).split(/\r?\n/u).length;
          offenders.push(lineNum);
        }
      }
      return offenders;
    };

    const DATE_FORMAT_SSOT = join(SRC_ROOT, "shared", "lib", "date-format.ts");
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC_ROOT)) {
      if (file === DATE_FORMAT_SSOT) continue;
      const source = readFileSync(file, "utf8");
      for (const line of findMissingTimeZone(source)) {
        offenders.push(`${relative(ROOT, file)}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
  }, 30000);

  test("UTC-blind な日付切り出し (toISOString/substring 0..10) を使わない", () => {
    // `date.toISOString().slice(0, 10)` は UTC の YYYY-MM-DD を返すため、JST 深夜跨ぎ
    // (JST 06:00 直前 = UTC 前日 21:00 直前) で 1 日ズレる silent bug。
    // JST カレンダー日付が欲しい場合は `formatJstDateString(date)`
    // (Intl "Asia/Tokyo" 固定) を使う。UTC 深夜 Date で保持される @db.Date 列
    // (BlockedDate 等) の逆変換は `formatJstDateOnly` を使う (別 helper・別文脈)。
    const sourceFiles = collectSourceFiles(SRC_ROOT).filter(
      // date-format.ts 自身の `formatJstDateOnly` (`@db.Date` UTC 深夜 → YYYY-MM-DD)
      // は SSoT 定義側。ここだけ toISOString().slice(0, 10) が正 (contract の逆)。
      (file) => file !== join(SRC_ROOT, "shared", "lib", "date-format.ts"),
    );
    const offenders = collectNonCommentOffenders(
      sourceFiles,
      /\.toISOString\(\)\.(?:slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|split\(\s*["']T["']\s*\)\[\s*0\s*\])/u,
    );

    expect(offenders).toEqual([]);
  });

  test("Phase 1 SDK 境界 cast は Zod z.custom<T> helper 経由（呼び出し側 cast 0 件）", () => {
    // SDK 境界 cast の helper 強制
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
    // の直書きは禁止。
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
    // typed-input-control.ts は intersection type への置き換えで `as {` を
    // 使わなくなった（Phase C 監査で判明）。allowlist は空でも 0 件のまま通るが、
    // 失効した exemption を残さないよう削除する。
    const sourceFiles = [
      ...collectSourceFiles(SRC_ROOT),
      ...collectSourceFiles(SCRIPTS_ROOT),
    ];
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

  // 「廃止済の型安全 ledger / assertion-bans を再導入しない」gate は削除した。
  // 検査対象だった型安全ルール文書を repo から外したため、旧ファイルの不在も
  // 後継 SSoT の存在も確かめようがない。型アサーション方針そのものは
  // 下の `as` 禁止 gate 群（SSoT helper 経由のみ許可）が構造的に強制している。

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

  describe("Phase B.1: public JSX で event.meetingUrl を render しない", () => {
    test("src/app/(public)/events/[slug]/ で event.meetingUrl の JSX 参照ゼロ", async () => {
      const { globSync } = await import("glob");
      // glob 構文では [slug] が「s/l/u/g のいずれか1文字」を意味する文字クラスと
      // 解釈され、Next.js の動的セグメントディレクトリ名としては絶対にマッチしない
      // （Phase C 監査で判明。修正前は常に0件で下のループ本体が一度も実行されず、
      // このテストは無条件 green の no-op になっていた）。角カッコをエスケープする。
      const files = globSync("src/app/(public)/events/\\[slug\\]/**/*.tsx", {
        cwd: ROOT,
        absolute: false,
      });
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const offenders = collectNonCommentOffenders(
          [join(ROOT, file)],
          /\bmeetingUrl\b/u,
        );
        expect(
          offenders,
          `${file}: 公開ページで meetingUrl を JSX render するのは禁止 (登録完了者のみ開示)`,
        ).toEqual([]);
      }
    });
  });

  describe("meetingUrl query SSoT (fail-closed)", () => {
    test("getEventRegistrationForClaim は meetingUrl を select/return しない", () => {
      const content = readFileSync(
        join(ROOT, "src/shared/domain/events/registration-queries.ts"),
        "utf8",
      );
      const start = content.indexOf(
        "export async function getEventRegistrationForClaim",
      );
      const end = content.indexOf(
        "const CUSTOMER_EVENT_REGISTRATION_SELECT",
        start,
      );
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      const fn = content.slice(start, end);
      expect(
        fn,
        "claim クエリは参加 URL を開示しない（eventTitle/startTime のみ）",
      ).not.toMatch(/meetingUrl/);
    });

    test("getEventRegistrationForGuestStatus は CONFIRMED のときのみ meetingUrl を返す", () => {
      const content = readFileSync(
        join(ROOT, "src/shared/domain/events/registration-queries.ts"),
        "utf8",
      );
      const start = content.indexOf(
        "export async function getEventRegistrationForGuestStatus",
      );
      const end = content.indexOf(
        "export async function getEventRegistrationDetailsForEmail",
        start,
      );
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      const fn = content.slice(start, end);
      expect(fn).toMatch(
        /registration\.status === RegistrationStatus\.CONFIRMED/,
      );
      expect(fn).toMatch(
        /registration\.status === RegistrationStatus\.CONFIRMED\s*\?\s*registration\.event\.meetingUrl\s*:\s*null/,
      );
    });

    test("public-queries は meetingUrl/meetingProvider を公開 select/map に載せない", () => {
      const content = readFileSync(
        join(ROOT, "src/shared/domain/events/public-queries.ts"),
        "utf8",
      );
      expect(
        content,
        "公開キャッシュ DTO に meetingUrl を select しない",
      ).not.toMatch(/meetingUrl:\s*true/);
      expect(
        content,
        "公開キャッシュ DTO に meetingProvider を select しない",
      ).not.toMatch(/meetingProvider:\s*true/);
      expect(
        content,
        "公開 map で meetingUrl を再付与しない（'use cache' 経由で漏れる）",
      ).not.toMatch(/meetingUrl\s*[:=]/);
    });
  });

  describe("Phase B.2: rrule package import restriction", () => {
    test("rrule import は domain layer + admin form utils のみ許可", async () => {
      const files = collectSourceFiles(SRC_ROOT);
      // `rrule` package を import してよいのは server 側の domain だけ。
      // `_components/rrule-utils.ts` の許可は削除した — あのファイルは
      // 「`rrule` package の client bundle 持ち込みを避けるため素の string
      // concatenation で生成する」ために存在しており（同ファイル冒頭の JSDoc）、
      // 許可を残すことは**そのファイルが避けている当のものを許す**ことだった。
      const allowedPatterns = [
        /src[/\\]shared[/\\]domain[/\\]reservations[/\\]/,
      ];
      const importers = files.filter((file) => {
        const content = readFileSync(file, "utf8");
        return (
          /from ["']rrule["']/.test(content) ||
          /import\s+.*\s+from\s+["']rrule["']/.test(content)
        );
      });

      const violations = importers
        .filter((file) => !allowedPatterns.some((p) => p.test(file)))
        .map((file) => relative(ROOT, file));
      expect(violations).toEqual([]);

      // 許可した場所が今も rrule を使っていること。使わなくなった許可を消し忘れると、
      // 後から同じ場所に import を戻したとき黙って通る。importers が 0 件だと上の
      // assertion は何も検査しないので、対象の存在自体もここで固定する。
      for (const pattern of allowedPatterns) {
        expect(
          importers.some((file) => pattern.test(file)),
          `${String(pattern)}: rrule を import しなくなった許可が残っている`,
        ).toBe(true);
      }
    });
  });

  describe("reservation email passcode clean-break (booking hub)", () => {
    // Spec §4.1: confirmation / updated / status-changed メール本文に平文パスコードを
    // 載せない。再確認の SSoT は予約詳細ハブ（会員 mypage / ゲスト status）。
    // smartLockPasscodes prop の再導入を grep gate で 0 件強制する。
    test("confirmation/updated/status-changed templates must not use smartLockPasscodes", () => {
      const templateFiles = [
        "reservation-confirmation.tsx",
        "reservation-updated.tsx",
        "reservation-status-changed.tsx",
      ] as const;
      const violations: string[] = [];
      for (const name of templateFiles) {
        const source = readFileSync(
          join(SRC_ROOT, "shared", "emails", name),
          "utf8",
        );
        if (source.includes("smartLockPasscodes")) {
          violations.push(name);
        }
      }
      expect(
        violations,
        `予約メールテンプレに smartLockPasscodes が残っています: ${violations.join(", ")}. 平文パスコード表示は廃止し bookingHubUrl CTA に置換してください (booking-detail-hub design §4.1)。`,
      ).toEqual([]);
    });
  });

  // reservation-emails.ts idempotencyKey drift gate (Cluster H #16) は
  // __tests__/unit/architecture/reservation-email-idempotency.test.ts に移動
  // （sender ごとの slice-until-next-sender 方式に強化。旧ファイル全体
  // matchAll 版は sender と idempotencyKey の対応付けが甘く、実質検査に
  // なっていなかったため削除済み）。

  describe("reservation overlap SSoT (shared/domain 全域)", () => {
    // `checkSpaceOverlap` (Reservation + Event 両方の overlap をチェックする関数、
    // src/shared/domain/spaces/overlap.ts) が SSoT。過去に
    // `ensureNoReservationOverlapOnly` という Reservation-only チェックだけの
    // @deprecated helper が payloads.ts に残っていたが、call site 0 で削除済
    // (CLEAN-01)。将来「片側だけ」の overlap helper (例:
    // ensureNoReservationOverlapOnly / ensureNoEventOverlapOnly) が
    // reservations/events/payloads.ts 以外のどこか(別ファイル・別ドメイン)に
    // 再導入されると、Space namespace 728351 advisory lock 直列化下でも overlap
    // 判定ロジック自身が Reservation-only になっている経路で Reservation ↔ Event の
    // silent overlap を許容しかねない。単一ファイルではなく shared/domain 全域を
    // 走査して `Only` suffix の overlap-related export を禁止する。
    test("shared/domain 全域で `Only` suffix overlap helper を export しない (CLEAN-01 再発防止)", () => {
      const OFFENDER_RE =
        /export\s+(?:async\s+)?function\s+(ensure[A-Za-z]*Only|check[A-Za-z]*Only)\b/g;
      const offendersByFile: string[] = [];
      for (const file of collectSourceFiles(SHARED_DOMAIN_ROOT)) {
        const content = readFileSync(file, "utf-8");
        for (const match of content.matchAll(OFFENDER_RE)) {
          if (match[1]) {
            offendersByFile.push(`${relative(SRC_ROOT, file)}: ${match[1]}`);
          }
        }
      }
      expect(
        offendersByFile,
        `shared/domain 配下で "Only" suffix overlap helper (例: ensureNoReservationOverlapOnly) を export すると Reservation ↔ Event の片側チェックだけを匂わせて silent overlap の温床になる。SSoT は checkSpaceOverlap (Reservation + Event 双方チェック、src/shared/domain/spaces/overlap.ts) — Only suffix export は禁止 (CLEAN-01)。検出: ${offendersByFile.join(", ")}`,
      ).toEqual([]);
    });
  });

  describe("Reservation.version 楽観制御は form-driven update path 限定 (spec §3.1.1 gate)", () => {
    // spec (docs/superpowers/specs/2026-07-18-reservation-optimistic-concurrency-design.md)
    // §3.1.1 の設計境界: version 列の WHERE claim / increment は customer-commands.ts
    // (updateCustomerReservation) と admin-commands.ts (updateAdminReservationCommand) の
    // form-driven update path のみが触ってよい。cancel-core / payment-commands /
    // payment-queries / pending-expiry / reminder-commands / calendar-sync /
    // lifecycle-commands / claim-commands / data-retention 等の非 form path
    // (cron・webhook・bulk 遷移) は Rails `.update_all` / Hibernate native query と
    // 同型の「楽観制御対象外」領域であり、silent に version 述語/increment を
    // 追加すると spec の境界が崩れる。
    //
    // 実 DB 統合テスト (customer-commands.test.ts の「非 form path は version を
    // touch しない」describe) は代表的な 2 経路 (cancelCustomerReservation,
    // claimReservationAsPaid) しか動的にカバーしないため、静的 grep で
    // reservations domain 配下の全ファイルを走査し、allowlist 外の出現を機械検知する。
    test("`version: { increment` / `version: input.version` の出現は customer-commands.ts と admin-commands.ts の 2 file に限定する", () => {
      const RESERVATIONS_DOMAIN_ROOT = join(SHARED_DOMAIN_ROOT, "reservations");
      const ALLOWLIST = new Set([
        join(RESERVATIONS_DOMAIN_ROOT, "customer-commands.ts"),
        join(RESERVATIONS_DOMAIN_ROOT, "admin-commands.ts"),
      ]);
      const PATTERNS = [
        /version:\s*\{\s*increment/u,
        /version:\s*input\.version/u,
      ];

      // sanity: allowlist file 自体が対象 pattern を含むこと（refactor で表現が
      // 変わり gate が silently vacuous になるのを防ぐ）。
      for (const file of ALLOWLIST) {
        const source = readFileSync(file, "utf8");
        expect(
          PATTERNS.some((pattern) => pattern.test(source)),
          `${relative(ROOT, file)} は allowlist だが version 述語/increment pattern が検出されない（gate が vacuous）`,
        ).toBe(true);
      }

      const offenders = collectSourceFiles(RESERVATIONS_DOMAIN_ROOT)
        .filter((file) => !ALLOWLIST.has(file))
        .filter((file) => {
          const source = readFileSync(file, "utf8");
          return PATTERNS.some((pattern) => pattern.test(source));
        })
        .map((file) => relative(ROOT, file));

      expect(
        offenders,
        `src/shared/domain/reservations/ 配下で version 述語/increment の出現が customer-commands.ts / admin-commands.ts の外に見つかりました。楽観制御は form-driven update path 限定 (spec §3.1.1)。非 form path (cron/webhook/bulk) が version を touch すべきでないなら他の gate (status/paymentStatus/冪等 flag) を使うこと。`,
      ).toEqual([]);
    });
  });

  // Customer.isActive / BLACKLIST gate (OAUTH-BETTER-AUTH-01) は
  // __tests__/unit/architecture/assert-customer-active-server-actions.test.ts
  // に移動（AST で exported async function 単位に判定するよう強化。旧
  // ファイル単位 grep 版は `.tsx` を対象外にする filter バグと、同一ファイル内
  // 複数関数を区別できない穴を持っていたため削除済み）。

  describe("ReservationSeries キャッシュ無効化の SSoT (CRITIC-5 再発防止)", () => {
    // `invalidateReservationCaches(reservationId, customerId, ...)` の第一引数
    // (reservationId) に seriesId を流し込むと、`getCacheTag.reservations.detail`
    // が `reservations-<seriesId>` という producer なしの dead tag を emit する。
    // site-wide `RESERVATIONS` タグでも invalidate 対象は覆えるため現状は
    // silent regression だが、detail-only invalidator を分離した瞬間 stale が
    // 表面化する。series 経路は `invalidateReservationSeriesCaches` を使うこと。
    //
    // grep gate: `invalidateReservationCaches(` の第一引数に `series` を含む
    // 識別子 (seriesId / data.seriesId / parsedId.seriesId 等) を渡している箇所を
    // 0 件強制する。単純な pattern check だが、call site 側の変数名を
    // `seriesId` に統一する規律で十分に slip を捕まえられる。
    test("invalidateReservationCaches の reservationId slot に *seriesId* 変数を渡さない", () => {
      const OFFENDER_RE =
        /\binvalidateReservationCaches\s*\(\s*[A-Za-z0-9_.]*[Ss]eriesId\b/;
      // 行コメント / ブロックコメントを剥がしてから grep する
      // (説明コメント内の pattern が false positive にならないようにする)。
      const stripComments = (source: string): string => {
        return source
          .replace(/\/\*[\s\S]*?\*\//g, "") // block comment
          .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comment (`http://` は除外)
      };
      const offenders: string[] = [];
      for (const file of collectSourceFiles(SRC_ROOT)) {
        if (!/\.(ts|tsx)$/u.test(file)) continue;
        const source = readFileSync(file, "utf8");
        if (OFFENDER_RE.test(stripComments(source))) {
          offenders.push(relative(ROOT, file));
        }
      }
      expect(
        offenders,
        `invalidateReservationCaches の reservationId slot に seriesId 変数を渡している箇所があります。series 経路は @/shared/lib/cache/reservation-cache の invalidateReservationSeriesCaches を使ってください (CRITIC-5)。`,
      ).toEqual([]);
    });
  });

  describe("実 DB integration テストの serial bucket 自動検出 (TEST-01 再発防止)", () => {
    // SSoT 契約:「新規の実 DB テストは
    // TEST_DATABASE_URL / DATABASE_URL 上書きマーカーを持てば serial bucket に
    // 自動入る（未検出だと parallel bucket に入り共有 DB で競合する）」。
    // __tests__/integration 配下で
    // `const describeMaybe = TEST_DB_URL ? describe : describe.skip;` パターンを使う
    // ファイルは scripts/serial-db-test-detection.ts が内容走査で拾う。
    // 検出漏れがあると: (a) 単発ターゲット実行時に TEST_DATABASE_URL 未注入 = silent skip
    // (security-critical assertion が 0 test passed で緑判定)、(b) 全域実行時は
    // parallel bucket に入り共有 test-db を他 parallel テストと同時書込みで race。
    // 過去に BLACKLIST 予約拒否・rate-plan CRUD・不審検知の 3 本で発生 (TEST-01)。
    test("describeMaybe pattern を使う integration テストは serial bucket 対象", async () => {
      const { isSerialDbTest } =
        await import("../../scripts/test-db-runner-env");
      const INTEGRATION_ROOT = join(ROOT, "__tests__", "integration");
      const PATTERN =
        /const\s+describeMaybe\s*=\s*TEST_DB_URL\s*\?\s*describe\s*:\s*describe\.skip/;

      const walk = (dir: string): string[] => {
        const entries = readdirSync(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          const abs = join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...walk(abs));
          } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
            files.push(abs);
          }
        }
        return files;
      };

      const unregistered: string[] = [];
      for (const file of walk(INTEGRATION_ROOT)) {
        const content = readFileSync(file, "utf-8");
        if (!PATTERN.test(content)) continue;
        const rel = relative(ROOT, file).replace(/\\/g, "/");
        if (!isSerialDbTest(rel)) {
          unregistered.push(rel);
        }
      }

      expect(
        unregistered,
        `__tests__/integration 配下で describeMaybe pattern を使う実 DB テストが serial bucket 自動検出対象外。TEST_DATABASE_URL / DATABASE_URL 上書きマーカーを追加するか scripts/serial-db-test-detection.ts の FORCE_INCLUDE に登録してください (未検出だと silent skip + parallel race)`,
      ).toEqual([]);
    });
  });

  describe("admin BulkActions は FloatingBulkActionBar primitive を経由する (Cluster J mobile UX)", () => {
    // Round-4 audit Cluster J / Finding #12: 各 BulkActions が
    // `fixed bottom-6 left-1/2 -translate-x-1/2` + 単列 flex を直書きしていたため、
    // 375px viewport (iPhone SE) で 5 ボタン程度のバーが左右にオーバーフローし、
    // 「一括有効化」「X 閉じる」が画面外に飛び出していた。
    // FloatingBulkActionBar が唯一の SSoT で、safe-area + flex-wrap を担う。
    const ADMIN_DASHBOARD_ROOT = join(
      APP_ROUTE_ROOT,
      "(admin)",
      "admin",
      "(dashboard)",
    );
    const BULK_ACTIONS_PRIMITIVE_FILE = join(
      ADMIN_DASHBOARD_ROOT,
      "_shared",
      "components",
      "FloatingBulkActionBar.tsx",
    );
    const collectBulkActionFiles = (): string[] =>
      collectSourceFiles(ADMIN_DASHBOARD_ROOT).filter((file) =>
        /BulkActions\.tsx$/u.test(file),
      );

    test("primitive ファイルが存在する", () => {
      expect(existsSync(BULK_ACTIONS_PRIMITIVE_FILE)).toBe(true);
    });

    test("`fixed bottom-6 left-1/2 -translate-x-1/2` の直書きは 0 件 (primitive 経由が SSoT)", () => {
      const offenders = collectSourceFiles(SRC_ROOT)
        .filter((file) => file !== BULK_ACTIONS_PRIMITIVE_FILE)
        .filter((file) => {
          const source = readFileSync(file, "utf8");
          return /fixed[^"]{0,40}bottom-6[^"]{0,40}left-1\/2[^"]{0,80}-translate-x-1\/2|fixed[^"]{0,40}bottom-6[^"]{0,40}-translate-x-1\/2[^"]{0,80}left-1\/2/u.test(
            source,
          );
        })
        .map((file) => relative(ROOT, file));

      expect(
        offenders,
        `Floating 一括操作バーの centering は FloatingBulkActionBar primitive が SSoT。fixed+translate ベースの直書きは 375px viewport で overflow するため禁止。@/admin/components/FloatingBulkActionBar を使ってください。`,
      ).toEqual([]);
    });

    test("*BulkActions.tsx は FloatingBulkActionBar を import する", () => {
      const bulkActionFiles = collectBulkActionFiles();
      // sanity: 現存 10 個の BulkActions が全部拾えていること
      expect(bulkActionFiles.length).toBeGreaterThanOrEqual(10);

      const offenders = bulkActionFiles
        .filter((file) => {
          const source = readFileSync(file, "utf8");
          return !/from\s+["']@\/admin\/components\/FloatingBulkActionBar["']/u.test(
            source,
          );
        })
        .map((file) => relative(ROOT, file));

      expect(
        offenders,
        `*BulkActions.tsx は @/admin/components/FloatingBulkActionBar を import して bar 部を primitive に委譲すること。`,
      ).toEqual([]);
    });
  });

  describe("<input> / <textarea> は 16px 未満 font-size を単独指定しない (Cluster J iOS auto-zoom)", () => {
    // Round-4 audit Cluster J / Finding #17 (medium): iOS Safari は focus 対象
    // input が font-size < 16px だとページを auto-zoom し、dialog / モーダル内の
    // レイアウトが横に押し出される。text-sm (14px) 単独指定は mobile (md 未満) で
    // 必ず zoom される。SSoT パターンは `text-base md:text-sm` — mobile は 16px を
    // 強制し、md+ でデザイン通り 14px に戻す。該当 primitive: Input / Textarea /
    // CommandInput (admin + public 各々)。
    test("タグの切り出しが「通ってはいけない書き方」で壊れない（fixture）", () => {
      const tagsOf = (code: string): string[] =>
        jsxInputOpeningTags(code, "fixture.tsx");

      // 手書きスキャナが壊れた形。正規表現リテラル内の `}` で深度が負に振れ、
      // 本当の `>` を見失ってファイル末尾まで走っていた（Codex 指摘）。
      const withRegexLiteral = [
        '<input onChange={() => /}/.test(v)} className="text-sm" />',
        'const later = "text-base";',
      ].join("\n");
      const regexTags = tagsOf(withRegexLiteral);
      expect(regexTags).toHaveLength(1);
      // 後続の text-base を飲み込んでいない = 免除が起きない。
      expect(/\btext-base\b/u.test(regexTags[0] ?? "")).toBe(false);
      expect(/\btext-sm\b/u.test(regexTags[0] ?? "")).toBe(true);

      // コメント内の閉じ括弧も同じ理由で壊す材料になる。
      const withComment = [
        "<textarea",
        "  onBlur={() => {",
        "    // 閉じ括弧 } を含むコメント",
        "  }}",
        '  className="text-sm"',
        "/>",
      ].join("\n");
      const commentTags = tagsOf(withComment);
      expect(commentTags).toHaveLength(1);
      expect(/\btext-sm\b/u.test(commentTags[0] ?? "")).toBe(true);

      // アロー関数の `>` でも切れない（元の lazy match が壊れた形）。
      expect(
        tagsOf(
          '<input onChange={(e) => setX(e)} className="text-base md:text-sm" />',
        ),
      ).toHaveLength(1);

      // input / textarea 以外は拾わない。
      expect(tagsOf('<div className="text-sm" />')).toEqual([]);
    });

    test("JSX 内の <input> / <textarea> は text-sm を単独指定しない", () => {
      const files = collectSourceFiles(SRC_ROOT).filter((file) =>
        file.endsWith(".tsx"),
      );
      // **lazy match で `>` を探してはいけない。** JSX の attribute には
      // `onChange={(e) => {…}}` のようにアロー関数が入り、その `>` で opening タグが
      // 途中で切れる。実測では input/textarea の 18 タグが切り詰められており、
      // うち 1 件（EmailChips.tsx の text-sm 単独指定）は className が切れた側に
      // あったため **この gate が現に違反を通していた**。
      // 終端の判定は TypeScript の parser に任せる（下の jsxInputOpeningTags）。
      const offenders: string[] = [];
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        for (const tag of jsxInputOpeningTags(source, file)) {
          if (!/\btext-sm\b/u.test(tag)) continue;
          if (/\btext-base\b/u.test(tag)) continue;
          offenders.push(relative(ROOT, file));
        }
      }

      expect(
        [...new Set(offenders)],
        `<input> / <textarea> に text-sm を単独指定すると iOS Safari が focus 時に auto-zoom します。text-base md:text-sm に置き換えてください (Input.tsx / Textarea.tsx / command.tsx の pattern に準拠)。`,
      ).toEqual([]);
    });
  });

  describe("お問い合わせ添付は private R2 のみ配信する (公開 CDN buildPublicUrl 禁止)", () => {
    // inquiry-overhaul completion design §5.2: 添付ファイルは PII を含むため
    // 専用の private R2 bucket + 認証付き server 配信のみで扱い、公開メディア
    // CDN の URL builder (`buildPublicUrl`) を誤って再利用しないことを
    // grep gate で 0 件強制する。scope は相対パスに "inquir" (inquiry/inquiries)
    // を含む src 配下の全ファイル（domain commands/queries、admin・mypage の
    // route/action/UI）。
    test("relative path に inquir を含む src ファイルは buildPublicUrl を呼ばない", () => {
      const files = collectSourceFiles(SRC_ROOT).filter((file) =>
        /inquir/iu.test(relative(ROOT, file)),
      );

      // 存在確認: gate が 0 件と誤検知するのを防ぐため、少なくとも 1 ファイルが
      // 対象スコープに該当していることを確認する。
      expect(files.length).toBeGreaterThan(0);

      const offenders = collectNonCommentOffenders(
        files,
        /\bbuildPublicUrl\b/u,
      );

      expect(
        offenders,
        `お問い合わせ添付関連ファイルは buildPublicUrl を呼ばないこと。添付は private bucket + getObjectStream 経由の認証済み配信のみが許可される（inquiry-overhaul completion design §5.2）。`,
      ).toEqual([]);
    });
  });
});

describe("AuditLog resource文字列の統一 (event-registration)", () => {
  test('"eventRegistration" (camelCase) を resource 文字列として使わない。"event-registration" (kebab-case) に統一する', () => {
    const violations: string[] = [];
    for (const path of collectSourceFiles(SRC_ROOT)) {
      const source = readFileSync(path, "utf8");
      if (source.includes('"eventRegistration"')) {
        violations.push(relative(ROOT, path));
      }
    }
    expect(violations).toEqual([]);
  });
});

// このファイルの末尾にあった describe 群は per-concern に分離済み
// (目的は merge conflict hotspot の緩和)。**行数は書かない** — 分離時の行数を
// 書いてあったが、その後の追加で分離前より長くなり、読む人には「スリムなまま」に
// 見える嘘になっていた。今の長さを知りたいなら数えれば出る。
// 引継ぎ先:
//   - __tests__/unit/architecture/prisma-import-boundary.test.ts
//     (Prisma gateway / singleton / server-only import gates)
//   - __tests__/unit/architecture/type-safety-cast-and-cache-tag-drift.test.ts
//     (conform FieldMetadata cast gate + CACHE_TAGS producer/consumer drift)
//   - __tests__/unit/architecture/section-config-widening-cast.test.ts
//     (as SectionConfig cast の 0 件強制)
//   - __tests__/unit/architecture/next-config-cache-tag-emission.test.ts
//     (next.config headers() Cache-Tag / Cache-Control 契約 8 test)
