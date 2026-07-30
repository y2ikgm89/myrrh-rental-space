import { defineConfig, globalIgnores } from "eslint/config";
import reactPlugin from "@eslint-react/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import importXPlugin from "eslint-plugin-import-x";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier/flat";
import localPlugin from "./eslint-rules/index.mjs";
import { CDN_MAPPED_CACHE_TAGS_KEYS } from "./eslint-rules/cdn-mapped-cache-tag-drift-gate-config.mjs";

const reactCompilerRestrictedImports = [
  {
    name: "react",
    importNames: ["forwardRef"],
    message:
      "React 19 では forwardRef を使わず、ref prop を通常の props として渡してください。",
  },
  {
    name: "react",
    importNames: ["useMemo", "useCallback"],
    message:
      "React Compiler 前提のコードベースです。外部ライブラリ要件がない限り useMemo / useCallback は使わないでください。",
  },
];

// `@/shared/lib/prisma` は既に削除済みの legacy shim（現在このパスに実体はない）。
// 再導入を防ぐための forward-guard として残す。
const legacyPrismaRestrictedImport = {
  name: "@/shared/lib/prisma",
  message:
    "Prisma は '@/shared/db' または '@/shared/db/prisma' を使ってください。",
};

// db barrel `@/shared/db`（現在 index.ts は存在しない）は db 層（src/shared/db/**）の
// 外から import 禁止。利用側は `@/shared/db/prisma` を直接 import する。
// このバレル import 禁止自体は ESLint 固有の予防ガードであり、.claude/rules/db-domain.md
// が説明するのは別の制約（architecture-boundaries.test.ts の placement-gate
// ALLOWLIST による prisma.<model>.<method> 呼出し可能箇所の制限）。
const dbBarrelRestrictedImport = {
  name: "@/shared/db",
  message:
    "barrel '@/shared/db' は db 層の外から import しないでください。'@/shared/db/prisma' を使ってください。",
};

const publicDbRestrictedImports = [
  {
    name: "@/shared/db",
    message:
      "public app layer は shared/db ではなく shared/domain を経由してください。",
  },
  {
    name: "@/shared/db/prisma",
    message:
      "public app layer は Prisma facade を直接参照せず shared/domain を経由してください。",
  },
  {
    name: "@/shared/lib/prisma",
    message:
      "legacy prisma shim は使用禁止です。shared/domain を経由してください。",
  },
];

const eslintConfig = defineConfig([
  // @eslint-react: ESLint 10 ネイティブ React ルール（TypeScript 最適化プリセット）
  // プリセットが plugins / rules / settings をセットで定義するため単体エントリとして展開
  reactPlugin.configs["recommended-typescript"],

  // Base: Next.js + Accessibility + Import + React Hooks
  {
    name: "base",
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: {
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
      "import-x": importXPlugin,
      "jsx-a11y": jsxA11yPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Next.js core-web-vitals
      // configs["core-web-vitals"].rules は内部で {...recommendedRules, ...coreWebVitalsRules}
      // と展開され recommended を完全に内包するため、recommended.rules の spread は冗長。
      ...nextPlugin.configs["core-web-vitals"].rules,

      // React Hooks (React Compiler ルール含む)
      ...reactHooksPlugin.configs.recommended.rules,
      // warn→error: libraries that break React Compiler's memoization model
      "react-hooks/incompatible-library": "error",
      // warn→error: syntax the Compiler cannot process (generators, async components, etc.)
      "react-hooks/unsupported-syntax": "error",
      // recommended-latest addition: useMemo called without a return value
      "react-hooks/void-use-memo": "error",

      // Import
      "import-x/no-anonymous-default-export": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: reactCompilerRestrictedImports,
        },
      ],

      // Console
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],

      // jsx-a11y
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },

  // TypeScript 専用設定
  // .mts も対象に含める（下の type-checked ブロックが .mts にも型付きルールを
  // 適用するため、パーサー自体もここで .mts をカバーしないと parserServices が
  // 得られず型付きルールが機能しない。Codex レビュー指摘、PR #1657）。
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
  })),

  // 型情報を使う lint（typed linting）の配線。単一ファイル lint が 58ms → 30.5s に
  // 悪化するため、lefthook pre-commit の eslint-fix にだけ ESLINT_SKIP_TYPE_CHECK=1
  // を付けてこのブロック自体を無効化する（package.json の lint 系スクリプトや CI は
  // 有効のまま）。Phase D 計画: P0 は tseslint.configs.recommendedTypeChecked のうち
  // recommended（型情報不要版）に無い新規ルールだけを個別列挙する
  // （プリセット spread は既存カスタム no-unused-vars と衝突し、base 版
  // require-await 等を誤って有効化すると 544 件出るため不採用）。
  ...(process.env.ESLINT_SKIP_TYPE_CHECK === "1"
    ? []
    : [
        {
          name: "typescript-type-checked-wiring",
          files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
          languageOptions: {
            parserOptions: {
              projectService: true,
              tsconfigRootDir: import.meta.dirname,
            },
          },
        },
        {
          // P0: recommendedTypeChecked が recommended に対して新規追加するルールの
          // うち、現時点で違反 0 件の 10 ルール + no-floating-promises（4 件、修正済み）。
          // P1: require-await（Next.js 契約ファイルは下の exempt ブロックで個別 off）。
          // 残り（no-unsafe-* / no-misused-promises / no-unnecessary-type-assertion 等）
          // は P2〜P4 で個別に段階導入する。
          name: "typescript-type-checked-rules-p0-p1",
          files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
          rules: {
            "@typescript-eslint/await-thenable": "error",
            "@typescript-eslint/no-array-delete": "error",
            "@typescript-eslint/no-duplicate-type-constituents": "error",
            "@typescript-eslint/no-for-in-array": "error",
            "@typescript-eslint/no-implied-eval": "error",
            "@typescript-eslint/no-unsafe-enum-comparison": "error",
            "@typescript-eslint/no-unsafe-unary-minus": "error",
            "@typescript-eslint/only-throw-error": "error",
            "@typescript-eslint/prefer-promise-reject-errors": "error",
            "@typescript-eslint/restrict-plus-operands": "error",
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/require-await": "error",
            // P2: no-unsafe-* 5ルール。any 由来の値の安全でない
            // assignment/call/member-access/argument/return を検出する。
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-return": "error",
            // P3: no-misused-promises。JSX イベントハンドラ属性（onClick 等）に
            // Promise 返却関数を渡す誤用を検出する（void 属性を期待する箇所への
            // async 関数の直接指定は unhandled rejection の温床になるため）。
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/no-unnecessary-type-assertion": "error",
            "@typescript-eslint/no-base-to-string": "error",
            "@typescript-eslint/no-redundant-type-constituents": "error",
            "@typescript-eslint/restrict-template-expressions": "error",
            "@typescript-eslint/unbound-method": "error",
          },
        },
        {
          // Next.js の App Router 特殊ファイル規約（page/layout/route の
          // デフォルトエクスポート・route.ts の HTTP メソッド export・
          // next.config.ts の headers() 等）はフレームワーク側が async 関数の
          // シグネチャを要求する契約であり、実装が await を使うかどうかは
          // 呼び出し側では制御できない。require-await のみここで off にする
          // （他の型付きルールは通常通り適用したままにする）。
          name: "typescript-require-await-nextjs-contract-exempt",
          files: [
            "next.config.ts",
            "**/page.tsx",
            "**/layout.tsx",
            "**/route.ts",
          ],
          rules: {
            "@typescript-eslint/require-await": "off",
          },
        },
        {
          // インターフェース契約（呼び出し元・フレームワークが Promise 返却を
          // 要求）により async を維持する関数を含むファイル。
          // `eslint-disable-next-line` によるコメント単位の除外は、lefthook
          // pre-commit の eslint-fix が ESLINT_SKIP_TYPE_CHECK=1
          // （型付きルール自体が読み込まれない）で `--fix` を実行するたびに
          // 「unused disable directive」として自動削除されてしまい安定しない
          // （実際に発生し CI failure を引き起こした）。ファイル単位で off に
          // することで --fix による誤削除を構造的に防ぐ。
          // - cache-helpers.ts: afterSuccess（Promise<void> | void）・
          //   呼び出し元の無条件 await の両方に対応する Cloudflare purge
          //   ヘルパー群（全関数が同型）
          // - cancel.ts: GuestTokenMutationConfig.afterEntityIdMatch の
          //   Promise 返却型契約
          // - customer-auth.ts: Better Auth 公式 deleteUser.afterDelete の
          //   Promise<void> 返却型契約
          name: "typescript-require-await-interface-contract-exempt",
          files: [
            "src/app/(admin)/admin/(dashboard)/_shared/actions/post/cache-helpers.ts",
            "src/app/(public)/reservation/cancel/_actions/cancel.ts",
            "src/shared/lib/customer-auth.ts",
          ],
          rules: {
            "@typescript-eslint/require-await": "off",
          },
        },
      ]),
  {
    name: "typescript-rules",
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Allow unused parameters prefixed with underscore (common pattern for HOF callbacks)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // 型アサーション規律の構造固定（type 情報不要な構文ルール）。
      // 方針の SSoT は .claude/rules/type-safety.md。`as` 型アサーションの
      // SSoT helper 集約は __tests__/unit/architecture-boundaries.test.ts の
      // grep gate が担保し、こちらは「非null assertion 禁止」「angle-bracket
      // assertion 禁止」を lint で前倒し検出する ratchet（現状 0 違反）。
      // 注: assertionStyle:"never" にすると正当な `as` literal narrowing が
      //     一律違反化し disable 散布を招くため採用しない（as は許可）。
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "allow",
        },
      ],
    },
  },
  {
    name: "prisma-import-boundaries",
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["src/shared/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...reactCompilerRestrictedImports,
            legacyPrismaRestrictedImport,
            dbBarrelRestrictedImport,
          ],
        },
      ],
    },
  },
  {
    name: "public-app-boundaries",
    files: ["src/app/(public)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...reactCompilerRestrictedImports,
            ...publicDbRestrictedImports,
          ],
        },
      ],
    },
  },
  {
    // cache タグ直書き禁止 + prisma.$transaction([...]) 配列形式禁止
    //
    // $transaction の配列形式は adapter-pg / pg 8.x の
    // "client is already executing a query" deprecation を誘発する
    // （BEGIN + N queries + COMMIT が pinned PoolClient に 3 つ以上積まれる瞬間がある）。
    // 原子性不要なら Promise.all、必要なら interactive transaction
    // `prisma.$transaction(async (tx) => { ... })` を使う。
    name: "cache-tag-boundaries",
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/shared/lib/constants/cache.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name=/^(cacheTag|updateTag|revalidateTag)$/] > Literal:first-child",
          message:
            "cacheTag / updateTag / revalidateTag のタグ名は直書きせず、CACHE_TAGS または getCacheTag を使ってください。",
        },
        {
          selector:
            "CallExpression[callee.property.name='$transaction'] > ArrayExpression",
          message:
            "prisma.$transaction([...]) の配列形式は pg deprecation 'client is already executing a query' を誘発するため禁止。原子性不要なら Promise.all([...])、必要なら interactive transaction `prisma.$transaction(async (tx) => { ... })` を使ってください。",
        },
        {
          // items.map(...) 等の動的配列形式も同じく禁止
          selector:
            "CallExpression[callee.property.name='$transaction'] > CallExpression[callee.property.name='map']",
          message:
            "prisma.$transaction(items.map(...)) の動的配列形式も pg deprecation 'client is already executing a query' を誘発するため禁止。原子性不要なら Promise.all(items.map(...))、必要なら interactive transaction `prisma.$transaction(async (tx) => { ... })` を使ってください。",
        },
      ],
    },
  },

  // CDN-mapped CACHE_TAGS drift-gate.
  //
  // Raw `updateTag(CACHE_TAGS.X)` / `revalidateTag(CACHE_TAGS.X)` only invalidate
  // the Next.js Data Cache — Cloudflare CDN is left stale for tags that map to
  // a CDN cache tag in NEXTJS_TAG_TO_CDN_TAG. The rule forces those call sites
  // through invalidateSiteWideCache / invalidateSiteWideCacheFromRouteHandler
  // so the Cloudflare purge is enqueued alongside the Next.js update.
  //
  // The site-wide.ts helper itself is the sanctioned entry point — it wraps
  // updateTag / revalidateTag internally and is the file this rule is designed
  // to funnel callers into. It is excluded from the rule for that reason.
  //
  // SSoT for the mapped-key list: src/shared/lib/constants/cdn-cache-tags.ts
  // NEXTJS_TAG_TO_CDN_TAG. Drift is caught by
  // __tests__/unit/architecture/eslint-cdn-mapped-tag-rule.test.ts.
  {
    name: "cdn-mapped-cache-tag-drift-gate",
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/shared/lib/cache/site-wide.ts"],
    plugins: {
      local: localPlugin,
    },
    rules: {
      "local/no-raw-updatetag-for-cdn-mapped-cache-tag": [
        "error",
        { mappedKeys: CDN_MAPPED_CACHE_TAGS_KEYS },
      ],
    },
  },

  // (Legacy grandfather block removed — all 4 files migrated by
  // CACHE-DRIFT-SETTLE. `LEGACY_RAW_UPDATETAG_FILES` is now empty and the
  // drift gate is fully enforced.)

  // Stripe webhook helpers: ban sync constructEvent / generateTestHeaderString.
  // Bun runtime（Web Crypto / SubtleCryptoProvider 経路）では sync 版が
  // `Error: Stripe is unable to perform synchronous crypto operations in this environment.`
  // を投げる。stripe-node 公式が edge runtime 向けに `*Async` 版を提供しているため
  // Bun 上では async 版のみ使う。型レベル封印は src/shared/lib/stripe.ts
  // (AsyncOnlyStripe / Omit) で行い、ここは「直接呼出」を機械的に弾く 2 段防御。
  //
  // SDK 内部実装 (createWebhooks など) は除外する必要があるが、
  // node_modules は globalIgnores で外れているため対象外。
  //
  // @see https://github.com/stripe/stripe-node/blob/master/src/Webhooks.ts
  // @see https://github.com/stripe/stripe-node/blob/master/testProjects/cloudflare-pages/functions/index.js
  {
    name: "stripe-webhook-async-only",
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name=/^(constructEvent|generateTestHeaderString)$/]",
          message:
            "Stripe webhook の sync helpers (constructEvent / generateTestHeaderString) は Bun runtime (Web Crypto) で throw する。constructEventAsync / generateTestHeaderStringAsync を使ってください。型封印は src/shared/lib/stripe.ts の AsyncOnlyStripe を参照。",
        },
      ],
    },
  },

  // ファイル固有設定
  {
    name: "console-allowed",
    // logger / seed / scripts は CLI・出力用途で console を許可する。
    files: [
      "src/shared/lib/errors/logger-core.ts",
      "prisma/seed.ts",
      "scripts/**/*.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
  // Lexical DraggableBlock フォーク（@lexical/react 由来のパターンを許容）。
  // fork コードが React Compiler / @eslint-react ルールに抵触するため緩和する。
  {
    name: "lexical-draggable-fork",
    files: [
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/lexical-draggable-block-plugin.ts",
    ],
    rules: {
      "react-hooks/refs": "off",
      "@eslint-react/use-state": "off",
      "@eslint-react/web-api-no-leaked-event-listener": "off",
      "no-restricted-imports": "off",
    },
  },

  // Media components: Allow <img> for dynamic URLs, blob URLs, and external URLs
  // These cannot be optimized by Next.js Image (user uploads, external sources, local previews)
  {
    name: "media-components",
    files: [
      "src/app/(admin)/admin/(dashboard)/media/_components/**/*.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/**/*.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/**/*.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },

  // E2E 規約 (Playwright 公式の DISCOURAGED パターンを機械ブロック)
  // SSoT: .claude/rules/testing-e2e.md
  // - waitForTimeout: 公式 "discouraged for production use ... inherently flaky"
  // - waitForLoadState("networkidle"): 公式 "DISCOURAGED. Don't use for testing,
  //   rely on web assertions to assess readiness instead."
  // - waitForURL: App Router soft navigation で load event 不発火＝silent timeout。
  //   expect(page).toHaveURL() に統一する。
  {
    name: "e2e-playwright-discouraged",
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='waitForTimeout']",
          message:
            "page.waitForTimeout は Playwright 公式で discouraged (flaky)。expect(locator).toBeVisible() 等の web-first assertion を使ってください。SSoT: .claude/rules/testing-e2e.md",
        },
        {
          selector:
            "CallExpression[callee.property.name='waitForLoadState'] > Literal[value='networkidle']",
          message:
            "waitForLoadState('networkidle') は Playwright 公式で DISCOURAGED。web assertion (expect(locator).toBeVisible() / expect(page).toHaveURL() 等) で readiness を待ってください。SSoT: .claude/rules/testing-e2e.md",
        },
        {
          selector: "CallExpression[callee.property.name='waitForURL']",
          message:
            "page.waitForURL は App Router の soft navigation で silent timeout する。expect(page).toHaveURL() に置換してください。SSoT: .claude/rules/testing-e2e.md",
        },
        {
          // `if ((await x.count()) > 0) { ... }` 条件アサーション禁止。
          // 要素が存在しなければ assertion が走らず silent pass する false-positive coverage。
          // seed-guaranteed なら条件無しで assert、optional なら test ごと削除する。
          selector:
            "IfStatement[test.type='BinaryExpression'][test.operator='>'][test.right.value=0] AwaitExpression > CallExpression[callee.property.name='count']",
          message:
            "if ((await x.count()) > 0) は silent-pass の false coverage を生む。seed-guaranteed なら無条件 assert、optional UI なら test ごと削除してください。SSoT: .claude/rules/testing-e2e.md",
        },
      ],
    },
  },

  // next.config.ts: ban raw string literals as Cache-Tag values.
  // CDN cache tags MUST come from src/shared/lib/constants/cdn-cache-tags.ts.
  {
    name: "next-config-cache-tag-ssot",
    files: ["next.config.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Target: an ObjectExpression that contains BOTH
          //   { key: 'key', value: Literal 'Cache-Tag' }
          //   AND { key: 'value', value: Literal (raw string) }
          // The selector matches the inner Literal so the error points there.
          selector:
            "ObjectExpression:has(Property[key.name='key'][value.value='Cache-Tag']) > Property[key.name='value'] > Literal",
          message:
            "Cache-Tag values MUST come from CDN_CACHE_TAGS via joinCacheTags(). See src/shared/lib/constants/cdn-cache-tags.ts.",
        },
      ],
    },
  },

  // Prettier（末尾: 競合ルール無効化）
  prettier,

  // グローバル除外
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "generated/**",
    "__tests__/**",
    // .claude は設定・スキル・git worktree 置き場で lint 対象外。worktree 内に
    // 別 tsconfig が同梱されると `eslint .` 時に typescript-eslint が
    // tsconfigRootDir を一意に決められず全ファイル parse error になるため必須。
    ".claude/**",
    // Cursor / agent worktrees（同様に別 tsconfig が混ざると eslint . が壊れる）
    ".worktrees/**",
    // scratch / 生成物（lint 対象外）
    ".remember/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
