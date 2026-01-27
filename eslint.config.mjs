import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  // Next.js recommended configs (includes eslint-plugin-react-hooks@7.x with React Compiler rules)
  ...nextVitals,
  ...nextTs,
  // Prettier compatibility (disables conflicting rules)
  prettier,
  // Global TypeScript rules
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Allow unused parameters prefixed with underscore (common pattern for HOF callbacks)
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  // Custom rules for specific files
  {
    files: ["src/lib/auth.ts"],
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
  ]),
]);

export default eslintConfig;
