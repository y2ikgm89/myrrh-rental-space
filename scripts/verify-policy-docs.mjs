/**
 * docs/reference/codex-rules と .claude/rules/frontend の政策ファイルが同一バイト列か検証する。
 * CI / ローカル共通（Node のみ）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(scriptDir, "..");
const pairs = [
  [
    "docs/reference/codex-rules/lexical-patterns.md",
    ".claude/rules/frontend/lexical-patterns.md",
  ],
  [
    "docs/reference/codex-rules/admin-inline-editor-patterns.md",
    ".claude/rules/frontend/admin-inline-editor-patterns.md",
  ],
];

let failed = false;
for (const [a, b] of pairs) {
  const pa = resolve(root, a);
  const pb = resolve(root, b);
  const ba = readFileSync(pa);
  const bb = readFileSync(pb);
  if (!ba.equals(bb)) {
    console.error(`Policy doc mismatch:\n  ${a}\n  ${b}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("policy docs: codex-rules and .claude/rules are in sync");
