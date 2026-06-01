/**
 * check-stale-paths.ts — path-scoped rule の `paths:` glob が実在ファイルに
 * マッチするかを検証する（audit-claude-config SKILL Phase 1 の stale glob 検出）。
 *
 * 公式仕様 (code.claude.com/docs/en/memory#path-specific-rules) では `paths:` の
 * glob にマッチするファイルを編集したときだけ rule が auto-load される。glob が
 * 実在ファイルにマッチしなければ「dead-weight」（rule は他の有効 glob で load される
 * が、その行は無意味）か、全 glob が dead なら「auto-load 不発」になる。
 *
 * 大規模リファクタ（ディレクトリ移動・ファイル rename）で specific path glob は
 * 容易に stale 化するため、定期監査で検出する。
 *
 * 実行: bun .claude/skills/audit-claude-config/scripts/check-stale-paths.ts
 * 判定: git tracked file を ground truth とする（gitignored な生成物・ローカル設定は
 *       rule の対象外という前提）。Bun.Glob でマッチ判定し、`()` を含む literal path は
 *       prefix 存在チェックで補完する。
 */
import { Glob } from "bun";
import { join } from "node:path";

const root = new TextDecoder()
  .decode(Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]).stdout)
  .trim();
const files = new TextDecoder()
  .decode(Bun.spawnSync(["git", "-C", root, "ls-files"]).stdout)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const hasPrefix = (p: string) =>
  files.some((f) => f === p || f.startsWith(p.endsWith("/") ? p : `${p}/`));

function frontmatter(content: string): string | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

function extractPaths(fm: string): string[] | null {
  const idx = fm.search(/^paths:/m);
  if (idx === -1) return null;
  const after = fm.slice(idx).replace(/^paths:/, "");
  const firstLine = after.split("\n")[0].trim();
  // inline form: `paths: a, b`
  if (firstLine && !firstLine.startsWith("-")) {
    return firstLine
      .replace(/^["']|["']$/g, "")
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  // block list form
  const out: string[] = [];
  for (const ln of after.split("\n").slice(1)) {
    const t = ln.trim();
    if (t.startsWith("- "))
      out.push(
        t
          .slice(2)
          .trim()
          .replace(/^["']|["']$/g, ""),
      );
    else break;
  }
  return out;
}

// `()` をリテラル扱いするため、metachar prefix で実在確認のフォールバックを行う
const literalPrefix = (g: string) => {
  const i = g.search(/[*?{}\[\]!]/);
  return i === -1 ? g : g.slice(0, i);
};

const ruleFiles = files.filter(
  (f) => f.startsWith(".claude/rules/") && f.endsWith(".md"),
);

let deadRule = 0;
let deadGlob = 0;
let noPaths = 0;

for (const rf of ruleFiles) {
  const fm = frontmatter(await Bun.file(join(root, rf)).text());
  if (!fm) {
    console.info(`NO_FRONTMATTER: ${rf}`);
    continue;
  }
  const globs = extractPaths(fm);
  if (!globs || globs.length === 0) {
    console.info(`NO_PATHS (常時ロード=禁止): ${rf}`);
    noPaths++;
    continue;
  }
  const stale: string[] = [];
  const ok: string[] = [];
  for (const g of globs) {
    const gl = new Glob(g);
    const prefix = literalPrefix(g);
    const matched =
      files.some((f) => gl.match(f)) ||
      (prefix.length >= 3 && hasPrefix(prefix));
    (matched ? ok : stale).push(g);
  }
  if (stale.length) {
    const allDead = ok.length === 0;
    if (allDead) deadRule++;
    else deadGlob++;
    console.info(
      `${allDead ? "DEAD_RULE (auto-load 不発)" : "DEAD_GLOB (dead-weight)"}: ${rf}`,
    );
    for (const s of stale) console.info(`      ✗ ${s}`);
  }
}

console.info("");
console.info(
  `== stale paths 監査: ${ruleFiles.length} rules / DEAD_RULE=${deadRule} DEAD_GLOB=${deadGlob} NO_PATHS=${noPaths} ==`,
);
if (deadRule === 0 && deadGlob === 0 && noPaths === 0) {
  console.info("✅ 全 rule の paths: glob が実在ファイルにマッチ");
}
// DEAD_RULE / NO_PATHS は auto-load を壊すため exit 1、DEAD_GLOB は dead-weight 警告のみ
process.exit(deadRule > 0 || noPaths > 0 ? 1 : 0);
