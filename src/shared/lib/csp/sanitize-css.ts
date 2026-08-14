/**
 * CSP nonce <style> block sanitization.
 * Only `[data-style-id="…"] { … }` rules with safe custom properties / values.
 */

import { z } from "zod";

export const DATA_STYLE_ID_ATTR = "data-style-id";

const STYLE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

const CSS_VAR_NAME = z
  .string()
  .regex(/^--[a-zA-Z0-9_-]+$/, "Invalid CSS custom property name");

/** Disallow injection vectors in declaration values. */
const SAFE_DECL_VALUE = z
  .string()
  .trim()
  .max(512)
  .regex(
    /^[^;{}@]*$/,
    "CSS value must not contain ; { } @ (url/import injection)",
  );

const DeclarationsSchema = z.record(
  // camelCase は**許可しない**（監査 F-15）。キーは変換せずそのまま `<style>` へ
  // 出るので、`marginTop:` を通すとブラウザが宣言を破棄する（型検査も lint も
  // ビルドも通り、壊れているのは公開画面だけになる）。
  z.union([CSS_VAR_NAME, z.literal("margin-top")]),
  SAFE_DECL_VALUE,
);

export type SafeCssDeclarations = z.infer<typeof DeclarationsSchema>;

function assertStyleId(styleId: string): string {
  if (!STYLE_ID_PATTERN.test(styleId)) {
    throw new Error(`Invalid style id: ${styleId}`);
  }
  return styleId;
}

/** Build a single scoped rule for `[data-style-id="…"]`. */
export function buildDataStyleRule(
  styleId: string,
  declarations: Record<string, string | number | undefined | null>,
): string {
  const id = assertStyleId(styleId);
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(declarations)) {
    if (value !== undefined && value !== null && value !== "") {
      filtered[key] = String(value);
    }
  }
  if (Object.keys(filtered).length === 0) return "";

  const parsed = DeclarationsSchema.safeParse(filtered);
  if (!parsed.success) {
    throw new Error(
      `Unsafe CSS declarations for style id ${id}: ${parsed.error.message}`,
    );
  }

  const body = Object.entries(parsed.data)
    .map(([prop, val]) => `${prop}: ${val};`)
    .join(" ");

  return `[${DATA_STYLE_ID_ATTR}="${id}"] { ${body} }`;
}

/** Sanitize concatenated CSS rules (throws on unsafe content). */
export function sanitizeCss(css: string): string {
  if (!css.trim()) return "";
  const rules = css
    .split("}")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `${chunk}}`);

  for (const rule of rules) {
    const match = rule.match(
      /^\[data-style-id="([a-zA-Z0-9_-]{1,128})"\]\s*\{\s*(.*)\s*\}$/,
    );
    if (!match) {
      throw new Error(`Disallowed CSS rule shape: ${rule.slice(0, 80)}`);
    }
    const body = match[2];
    if (body === undefined) {
      throw new Error(`Empty CSS rule body: ${rule.slice(0, 80)}`);
    }
    const decls = body
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean);
    for (const decl of decls) {
      const colon = decl.indexOf(":");
      if (colon <= 0) {
        throw new Error(`Invalid declaration: ${decl}`);
      }
      const prop = decl.slice(0, colon).trim();
      const val = decl.slice(colon + 1).trim();
      DeclarationsSchema.parse({ [prop]: val });
    }
  }
  return css;
}
