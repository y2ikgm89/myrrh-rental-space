/**
 * `.claude/rules/**` の canonical と `docs/reference/codex-rules/**` の mirror が
 * バイト単位で同期しているか検証する。CI と lefthook 共通（Node stdlib のみ）。
 *
 * Pair 定義:
 *   - sources.length === 1: mirror は canonical と byte-identical（frontmatter 含む）
 *   - sources.length >= 2: mirror は各 source の frontmatter を剥がし source marker を
 *                          挿入して concat した結果と byte-identical
 *
 * Mirror を再生成するには `node scripts/sync-policy-docs.mjs` を実行する。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAIRS, buildMirrorContent } from "./policy-docs-pairs.mjs";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(scriptDir, "..");

let failed = false;
for (const pair of PAIRS) {
  const mirrorPath = resolve(root, pair.mirror);
  const expected = buildMirrorContent(pair, root);
  const actual = readFileSync(mirrorPath);
  if (!actual.equals(expected)) {
    console.error(
      `Policy doc mismatch:\n  mirror:  ${pair.mirror}\n  sources: ${pair.sources.join(", ")}\n  hint:    run \`node scripts/sync-policy-docs.mjs\` to regenerate`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `policy docs: ${PAIRS.length} mirror(s) in sync with canonical sources`,
);
