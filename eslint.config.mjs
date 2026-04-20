import { defineConfig, globalIgnores } from "eslint/config";
import reactPlugin from "@eslint-react/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import importXPlugin from "eslint-plugin-import-x";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier/flat";

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
    settings: {
      "import-x/resolver": {
        typescript: true,
      },
    },
    rules: {
      // Next.js recommended
      ...nextPlugin.configs.recommended.rules,
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
          paths: [
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
          ],
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
            {
              name: "@/shared/lib/prisma",
              message:
                "Prisma は '@/shared/db' または '@/shared/db/prisma' を使ってください。",
            },
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

  // ファイル固有設定
  {
    name: "console-allowed",
    files: ["src/shared/lib/logger.ts", "prisma/seed.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    name: "auth-lib",
    files: ["src/shared/lib/auth.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Lexical DraggableBlock フォーク（@lexical/react 由来のパターン・@ts-nocheck を許容）
  {
    name: "lexical-draggable-fork",
    files: [
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/lexical-draggable-block-plugin.ts",
    ],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "react-hooks/refs": "off",
      "@eslint-react/use-state": "off",
      "@eslint-react/web-api-no-leaked-event-listener": "off",
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
  ]),
]);

export default eslintConfig;
