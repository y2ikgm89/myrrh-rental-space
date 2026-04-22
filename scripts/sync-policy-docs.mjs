/**
 * Canonical source（`.claude/rules/**`）から mirror（`docs/reference/codex-rules/**`）を
 * 再生成する。ADR-0013 の N-to-1 concat モード対応。
 *
 * 使い方:
 *   node scripts/sync-policy-docs.mjs          # 全 pair を再生成
 *   node scripts/sync-policy-docs.mjs --check  # dry-run（verify-policy-docs.mjs と等価）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAIRS, buildMirrorContent } from "./policy-docs-pairs.mjs";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(scriptDir, "..");

const checkOnly = process.argv.includes("--check");
let changed = 0;
let mismatched = 0;

for (const pair of PAIRS) {
  const mirrorPath = resolve(root, pair.mirror);
  const expected = buildMirrorContent(pair, root);

  let current;
  try {
    current = readFileSync(mirrorPath);
  } catch {
    current = Buffer.alloc(0);
  }

  if (current.equals(expected)) {
    continue;
  }

  if (checkOnly) {
    console.error(
      `[drift] ${pair.mirror}\n  run \`node scripts/sync-policy-docs.mjs\` to regenerate`,
    );
    mismatched += 1;
    continue;
  }

  writeFileSync(mirrorPath, expected);
  console.log(`[synced] ${pair.mirror} (${pair.sources.length} source(s))`);
  changed += 1;
}

if (checkOnly) {
  if (mismatched > 0) {
    process.exit(1);
  }
  console.log(`policy docs: ${PAIRS.length} mirror(s) already in sync`);
} else {
  console.log(
    `policy docs: ${changed} mirror(s) regenerated, ${PAIRS.length - changed} already in sync`,
  );
}
