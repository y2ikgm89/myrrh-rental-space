/**
 * Policy docs sync ペア定義 SSoT。
 *
 * `.claude/rules/**` (canonical) と `docs/reference/codex-rules/**` (mirror) の
 * 対応関係を定義する。verify-policy-docs.mjs と sync-policy-docs.mjs が共通で参照。
 *
 * 設計: ADR-0013 §Decision Outcome（N-to-1 concat 対応）
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** @typedef {{ mirror: string; sources: string[] }} Pair */

/** @type {ReadonlyArray<Pair>} */
export const PAIRS = [
  {
    mirror: "docs/reference/codex-rules/lexical-patterns.md",
    sources: [
      ".claude/rules/frontend/lexical/core.md",
      ".claude/rules/frontend/lexical/nodes.md",
      ".claude/rules/frontend/lexical/plugins.md",
      ".claude/rules/frontend/lexical/toolbar-layout.md",
      ".claude/rules/frontend/lexical/conventions.md",
    ],
  },
  {
    mirror: "docs/reference/codex-rules/admin-inline-editor-patterns.md",
    sources: [".claude/rules/frontend/admin-inline-editor-patterns.md"],
  },
];

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;

/**
 * Canonical ファイルの frontmatter を除去した本文を返す（末尾改行は 1 個に正規化）。
 */
function stripFrontmatter(raw) {
  const body = raw.replace(FRONTMATTER_RE, "");
  return body.replace(/^\n+/, "").replace(/\n*$/, "\n");
}

/**
 * Pair から期待される mirror ファイル内容（Buffer）を構築する。
 *
 * - sources.length === 1: canonical をそのまま返す（frontmatter 含む byte-identical）
 * - sources.length >= 2: 各 source の frontmatter を剥がし、source marker で区切って concat。
 *   先頭に auto-generated notice を挿入し、手動編集を抑止する。
 */
export function buildMirrorContent(pair, root) {
  if (pair.sources.length === 1) {
    return readFileSync(resolve(root, pair.sources[0]));
  }

  const header =
    `<!-- === AUTO-GENERATED: do not edit directly ===\n` +
    `     canonical sources (edit these instead):\n` +
    pair.sources.map((s) => `       - ${s}`).join("\n") +
    `\n` +
    `     regenerate: node scripts/sync-policy-docs.mjs\n` +
    `=== -->\n\n`;

  const parts = pair.sources.map((source) => {
    const raw = readFileSync(resolve(root, source), "utf8");
    const body = stripFrontmatter(raw);
    const marker = `<!-- === source: ${source} === -->\n\n`;
    return marker + body;
  });

  const combined = header + parts.join("\n");
  return Buffer.from(combined, "utf8");
}
