import { defineConfig, globalIgnores } from "eslint/config";
import reactPlugin from "@eslint-react/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import importPlugin from "eslint-plugin-import";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  // Base: React + Next.js + Accessibility + Import
  {
    name: "base",
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: {
      // @eslint-react registers all sub-plugins (@eslint-react/dom, /rsc, /web-api, etc.)
      ...reactPlugin.configs["recommended-typescript"].plugins,
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
      import: importPlugin,
      "jsx-a11y": jsxA11yPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      // @eslint-react: detect React version automatically
      ...reactPlugin.configs["recommended-typescript"].settings,
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".mts", ".cts", ".tsx", ".d.ts"],
      },
      "import/resolver": {
        node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
        typescript: { alwaysTryTypes: true },
      },
    },
    rules: {
      // Next.js recommended + core-web-vitals rules
      // core-web-vitals contains all recommended rules with stricter severity for some
      ...nextPlugin.configs["core-web-vitals"].rules,

      // @eslint-react: ESLint 10 native React rules (replaces eslint-plugin-react)
      ...reactPlugin.configs["recommended-typescript"].rules,

      // React Hooks (includes all React Compiler rules: purity, refs, immutability, etc.)
      ...reactHooksPlugin.configs.recommended.rules,
      // warn→error: libraries that break React Compiler's memoization model
      "react-hooks/incompatible-library": "error",
      // warn→error: syntax the Compiler cannot process (generators, async components, etc.)
      "react-hooks/unsupported-syntax": "error",
      // recommended-latest addition: useMemo called without a return value
      "react-hooks/void-use-memo": "error",

      // Import
      "import/no-anonymous-default-export": "warn",

      // jsx-a11y (subset from eslint-config-next)
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },

  // TypeScript: typescript-eslint recommended rules
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
  })),
  {
    name: "typescript-rules",
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    rules: {
      // Allow unused parameters/variables prefixed with underscore (HOF callback pattern)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // File-specific overrides
  {
    name: "auth-lib",
    files: ["src/shared/lib/auth.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
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

  // Prettier compatibility (disables conflicting formatting rules — must be last)
  prettier,

  // Global ignores
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/shared/generated/**",
    "__tests__/**",
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
