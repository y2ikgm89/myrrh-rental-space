import { defineConfig, globalIgnores } from "eslint/config";
import reactPlugin from "@eslint-react/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import importXPlugin from "eslint-plugin-import-x";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier/flat";

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

const legacyPrismaRestrictedImport = {
  name: "@/shared/lib/prisma",
  message:
    "Prisma は '@/shared/db' または '@/shared/db/prisma' を使ってください。",
};

// db barrel `@/shared/db` は db 層（src/shared/db/**）の外から import 禁止。
// 利用側は `@/shared/db/prisma` を直接 import する（db-and-domain.md）。
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
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
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
    files: ["src/shared/lib/logger.ts", "prisma/seed.ts", "scripts/**/*.ts"],
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
  // SSoT: .claude/rules/test-quality/e2e.md
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
            "page.waitForTimeout は Playwright 公式で discouraged (flaky)。expect(locator).toBeVisible() 等の web-first assertion を使ってください。SSoT: .claude/rules/test-quality/e2e.md",
        },
        {
          selector:
            "CallExpression[callee.property.name='waitForLoadState'] > Literal[value='networkidle']",
          message:
            "waitForLoadState('networkidle') は Playwright 公式で DISCOURAGED。web assertion (expect(locator).toBeVisible() / expect(page).toHaveURL() 等) で readiness を待ってください。SSoT: .claude/rules/test-quality/e2e.md",
        },
        {
          selector: "CallExpression[callee.property.name='waitForURL']",
          message:
            "page.waitForURL は App Router の soft navigation で silent timeout する。expect(page).toHaveURL() に置換してください。SSoT: .claude/rules/test-quality/e2e.md",
        },
        {
          // `if ((await x.count()) > 0) { ... }` 条件アサーション禁止。
          // 要素が存在しなければ assertion が走らず silent pass する false-positive coverage。
          // seed-guaranteed なら条件無しで assert、optional なら test ごと削除する。
          selector:
            "IfStatement[test.type='BinaryExpression'][test.operator='>'][test.right.value=0] AwaitExpression > CallExpression[callee.property.name='count']",
          message:
            "if ((await x.count()) > 0) は silent-pass の false coverage を生む。seed-guaranteed なら無条件 assert、optional UI なら test ごと削除してください。SSoT: .claude/rules/test-quality/e2e.md",
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
    ".worktrees/**",
    // .claude は設定・スキル・git worktree 置き場で lint 対象外。worktree 内に
    // 別 tsconfig が同梱されると `eslint .` 時に typescript-eslint が
    // tsconfigRootDir を一意に決められず全ファイル parse error になるため必須。
    ".claude/**",
    // scratch / 生成物（lint 対象外）
    ".remember/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
