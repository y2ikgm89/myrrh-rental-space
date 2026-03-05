import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  // Next.js 16 official recommendation
  // core-web-vitals: includes recommended + stricter severity for CWV metrics
  // typescript: includes @typescript-eslint/recommended
  ...nextVitals,
  ...nextTs,
  // React Compiler strict mode
  // eslint-plugin-react-hooks v7 integrates all Compiler rules (eslint-config-next uses
  // the 'recommended' preset). We promote two rules from warn→error and add void-use-memo
  // from the 'recommended-latest' preset to block non-Compiler-compatible code at lint time.
  {
    rules: {
      // warn→error: libraries that break React Compiler's memoization model
      "react-hooks/incompatible-library": "error",
      // warn→error: syntax the Compiler cannot process (generators, async components, etc.)
      "react-hooks/unsupported-syntax": "error",
      // recommended-latest addition: useMemo called without a return value
      "react-hooks/void-use-memo": "error",
    },
  },
  // Prettier compatibility (disables conflicting rules)
  prettier,
  // Global TypeScript rules
  {
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
  // Custom rules for specific files
  {
    files: ["src/shared/lib/auth.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Media components: Allow <img> for dynamic URLs, blob URLs, and external URLs
  // These cannot be optimized by Next.js Image (user uploads, external sources, local previews)
  {
    files: [
      "src/app/(admin)/admin/(dashboard)/media/_components/**/*.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/**/*.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/**/*.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  // Ignored paths
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
