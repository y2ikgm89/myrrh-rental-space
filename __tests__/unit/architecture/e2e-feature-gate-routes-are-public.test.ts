import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `feature-module-off-gate.spec.ts` が検証するルートは **未認証で到達できる**もの
 * だけに限る、という gate。
 *
 * ## なぜ
 *
 * この spec は `chromium` project で走り、`playwright.config.ts` の同 project は
 * `storageState` を持たない ＝ **未認証の訪問者**として実行される。
 *
 * 一方 `(public)/mypage/layout.tsx` は `requireMypageSession()` を呼び、**layout は
 * page より先に評価される**。したがって `/mypage/**` を対象に入れると、layout の
 * 認証が先に `/login` へ送り、page 本体の `requireFeatureEnabled(...)` に
 * **構造的に到達できない**。feature gate の可否とは無関係に必ず失敗する。
 *
 * さらにストリーミング下の `redirect()` は client-side redirect へ劣化するため、
 * 初期 HTML は mypage layout のもの（`<title>マイページ | …`）のまま残り、
 * 「gate は効いているのに title が変わらない」という**誤診を誘発**する。
 *
 * 実測 (CI run 30670082842): #1760 が soft assertion 化して全 9 ルートの結果が
 * 揃った結果、落ちたのは `/mypage/inquiries` のみ。他の 8 本（`/contact` `/blog`
 * `/reservation` `/reservation/complete` `/claim/reservation` `/events`
 * `/claim/event-registration` `/spaces`）は全て通過した。**認証が要る唯一の
 * ルートだけが落ちていた**。
 *
 * ## 何がカバーを失うか（失わない）
 *
 * gate 呼び出しが存在することは `public-route-gates.test.ts` が静的に守る。
 * 認証付き route のランタイム検証が必要になったら、storageState を持つ
 * `chromium-customer` project 側の spec に置くこと。この gate はそれを
 * 「public spec に混ぜない」ためのもので、検証をやめる口実ではない。
 */

const root = process.cwd();

const SPEC_PATH = "e2e/public/feature-module-off-gate.spec.ts";

/**
 * 未認証では到達できない URL 接頭辞（layout / proxy が先に認証する）。
 *
 * `/reservation/complete?token=` や `/claim/*?token=` は **token 認可**であって
 * セッション認証ではないため対象外。実際に CI で通過している。
 */
const SESSION_AUTHENTICATED_PREFIXES = [
  "/mypage",
  "/admin",
  "/preview",
] as const;

function readSpec(): string {
  return readFileSync(join(root, ...SPEC_PATH.split("/")), "utf8");
}

/** `MODULE_CASES` の `routes: [...]` に現れるルート指定を集める。 */
function collectModuleCaseRoutes(source: string): string[] {
  const start = source.indexOf("const MODULE_CASES");
  expect(start).toBeGreaterThan(-1);

  const end = source.indexOf("\n];", start);
  expect(end).toBeGreaterThan(start);

  // コメントは **split より前に** 落とす。後から `startsWith("//")` の要素を捨てる
  // 方式だと、配列内で route の直前に `//` コメントを置いたとき
  // `"// …\n  urls.x"` が 1 要素になり、**route ごと丸ごと捨てられて gate を
  // すり抜ける**（Codex P2 指摘）。
  const block = source.slice(start, end).replace(/\/\/.*$/gmu, "");

  return [...block.matchAll(/routes:\s*\[([\s\S]*?)\]/gu)].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * `urls.foo` 表記を `e2e/fixtures/test-data.ts` の実 path へ解決する。
 * テンプレートリテラル（`/claim/reservation?token=...`）はそのまま返す。
 */
function resolveRoute(entry: string, urlsSource: string): string {
  const named = /^urls\.(?<key>\w+)$/u.exec(entry)?.groups?.["key"];
  if (named === undefined) return entry;

  const value = new RegExp(`\\b${named}:\\s*"(?<path>[^"]+)"`, "u").exec(
    urlsSource,
  )?.groups?.["path"];
  expect(value).toBeDefined();
  return value ?? entry;
}

/**
 * 判定本体（1）: spec source から違反ルートを列挙する。
 *
 * 実走査も fixture も**この関数だけ**を呼ぶ。走査対象（spec / urls の中身）は
 * 必須引数で受け、読み込みは呼び出し側の境界でだけ行う。
 */
function sessionAuthenticatedRouteOffenders(
  specSource: string,
  urlsSource: string,
): string[] {
  const entries = collectModuleCaseRoutes(specSource);
  if (entries.length === 0) {
    return [
      "MODULE_CASES から route を 1 件も抽出できていない（gate の空振り）",
    ];
  }

  return entries
    .map((entry) => ({ entry, path: resolveRoute(entry, urlsSource) }))
    .filter(({ path }) =>
      SESSION_AUTHENTICATED_PREFIXES.some((prefix) => path.includes(prefix)),
    )
    .map(
      ({ entry, path }) =>
        `${entry} (${path}) は layout の認証が先に走るため未認証 project では検証できない`,
    );
}

/**
 * 判定本体（2）: `chromium` project が**未認証のまま**かを playwright.config.ts の
 * source から判定する。
 *
 * project ブロック直下だけを見てはいけない。Playwright の project は
 * `defineConfig` 直下の `use` を**継承する**ため、そちらに `storageState` が入ると
 * chromium も認証済みになるのに project だけ見る検査は通ってしまい、
 * 「未認証である」と**誤って証明する**（Codex P2 指摘）。`projects:` より前が
 * defineConfig 直下の設定なので、その範囲も検査する。
 */
function anonymousChromiumProjectViolations(config: string): string[] {
  const violations: string[] = [];

  const chromium = /name:\s*"chromium",([\s\S]{0,300}?)\},/u.exec(config)?.[1];
  if (chromium === undefined) {
    violations.push(
      'playwright.config.ts に `name: "chromium"` project が見つからない',
    );
  } else if (chromium.includes("storageState")) {
    violations.push(
      "`chromium` project 自身に storageState が付いている（この spec の前提が崩れる）",
    );
  }

  const projectsAt = config.indexOf("projects:");
  if (projectsAt < 0) {
    violations.push("playwright.config.ts に `projects:` が見つからない");
  } else if (config.slice(0, projectsAt).includes("storageState")) {
    violations.push(
      "defineConfig 直下の `use` に storageState がある（全 project が継承して認証済みになる）",
    );
  }

  return violations;
}

describe("feature-module OFF gate は未認証で到達できるルートだけを検証する", () => {
  test("MODULE_CASES にセッション認証が要るルートが混ざっていない", () => {
    const urlsSource = readFileSync(
      join(root, "e2e", "fixtures", "test-data.ts"),
      "utf8",
    );

    expect(sessionAuthenticatedRouteOffenders(readSpec(), urlsSource)).toEqual(
      [],
    );
  });

  test("この spec が未認証 project で走っている前提が保たれている", () => {
    const config = readFileSync(join(root, "playwright.config.ts"), "utf8");

    expect(anonymousChromiumProjectViolations(config)).toEqual([]);
  });
});

/**
 * gate 自身の検出力を fixture で固定する。
 *
 * 実ファイルへ違反を注入する probe は「今このリポジトリで落ちること」しか示さない。
 * 上の 2 test と**同じ判定関数**へ合成文字列を流し、
 * 1. 新しく検出したい形（コメント隠し / トップレベル `use` の storageState）が落ちる
 * 2. 前から検出していた形（素のセッション認証 route / project 直下の storageState）を今も落とす
 * 3. 正当な形が通る
 * の 3 方向を CI が毎回検証する。
 */
describe("gate 自身の検出力", () => {
  const FIXTURE_URLS = `export const urls = {
  contact: "/contact",
  mypageInquiries: "/mypage/inquiries",
} as const;
`;

  /** MODULE_CASES 1 件だけの最小 spec。`routes` の中身だけを差し替える。 */
  function fixtureSpec(routesBody: string): string {
    return `const MODULE_CASES: readonly ModuleCase[] = [
  {
    module: "contact",
    label: "お問い合わせ",
    routes: [${routesBody}],
  },
];
`;
  }

  /** playwright.config.ts の最小形。トップレベル `use` と chromium の `use` を差し替える。 */
  function fixtureConfig(topLevelUse: string, chromiumUse: string): string {
    return `export default defineConfig({
  testDir: "./e2e",
  use: {
${topLevelUse}
  },

  projects: [
    {
      name: "chromium",
      use: {${chromiumUse} },
      testMatch: [/e2e\\/public\\/.*\\.spec\\.ts/],
    },
    {
      name: "chromium-customer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/customer.json",
      },
      testMatch: /e2e\\/authenticated\\/customer\\/.*\\.spec\\.ts/,
    },
  ],
});
`;
  }

  const ANONYMOUS_TOP_LEVEL_USE = `    baseURL: "http://localhost:3000",
    trace: "on-first-retry",`;
  const ANONYMOUS_CHROMIUM_USE = ` ...devices["Desktop Chrome"],`;

  test("route の直前に `//` コメントを置いても認証 route は隠れない", () => {
    const source = fixtureSpec(`
      urls.contact,
      // このコメントで隠せてはいけない
      urls.mypageInquiries,
    `);

    expect(sessionAuthenticatedRouteOffenders(source, FIXTURE_URLS)).toEqual([
      "urls.mypageInquiries (/mypage/inquiries) は layout の認証が先に走るため未認証 project では検証できない",
    ]);
  });

  test("コメント無しのセッション認証 route も今までどおり落とす", () => {
    const source = fixtureSpec("urls.contact, urls.mypageInquiries");

    expect(sessionAuthenticatedRouteOffenders(source, FIXTURE_URLS)).toEqual([
      "urls.mypageInquiries (/mypage/inquiries) は layout の認証が先に走るため未認証 project では検証できない",
    ]);
  });

  test("公開 route だけの MODULE_CASES は通る", () => {
    expect(
      sessionAuthenticatedRouteOffenders(
        fixtureSpec("urls.contact"),
        FIXTURE_URLS,
      ),
    ).toEqual([]);
  });

  test("トップレベル `use` の storageState を検出する", () => {
    const config = fixtureConfig(
      `${ANONYMOUS_TOP_LEVEL_USE}
    storageState: "playwright/.auth/customer.json",`,
      ANONYMOUS_CHROMIUM_USE,
    );

    expect(anonymousChromiumProjectViolations(config)).toEqual([
      "defineConfig 直下の `use` に storageState がある（全 project が継承して認証済みになる）",
    ]);
  });

  test("chromium project 直下の storageState も今までどおり落とす", () => {
    const config = fixtureConfig(
      ANONYMOUS_TOP_LEVEL_USE,
      `${ANONYMOUS_CHROMIUM_USE}
        storageState: "playwright/.auth/customer.json",`,
    );

    expect(anonymousChromiumProjectViolations(config)).toEqual([
      "`chromium` project 自身に storageState が付いている（この spec の前提が崩れる）",
    ]);
  });

  test("未認証 chromium + 認証は他 project だけ、の正当な config は通る", () => {
    expect(
      anonymousChromiumProjectViolations(
        fixtureConfig(ANONYMOUS_TOP_LEVEL_USE, ANONYMOUS_CHROMIUM_USE),
      ),
    ).toEqual([]);
  });
});
