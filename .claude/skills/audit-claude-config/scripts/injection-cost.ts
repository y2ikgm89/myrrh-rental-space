/**
 * injection-cost.ts — path-scoped rule の「注入コスト」を計測する
 * （audit-claude-config SKILL Phase 1、context/使用量 退行検出）。
 *
 * 公式仕様（code.claude.com/docs/en/context-window）:
 *   path-scoped rule は `paths:` glob にマッチするファイルを Read した瞬間に
 *   message history へ **全文** ロードされ、compaction まで context を占有する。
 *   compaction 後も次に matching file を読むと再注入される。つまり glob が広いほど、
 *   また rule が大きいほど、無関係な編集で大量の token を恒常的に消費する。
 *
 * このスクリプトは代表的な編集シナリオごとに「同時に注入される rule の合計サイズ」を
 * 算出し、context budget を圧迫している cost-driver rule を可視化する。stale-path 監査
 * （check-stale-paths.ts）が "glob が実在するか" を見るのに対し、本スクリプトは
 * "glob が広すぎて高コストでないか" を見る。閾値超過は warn のみ（exit 0、報告型 SKILL）。
 *
 * 実行: bun .claude/skills/audit-claude-config/scripts/injection-cost.ts
 */
import { Glob } from "bun";
import { join } from "node:path";

const root = new TextDecoder()
  .decode(Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]).stdout)
  .trim();
const tracked = new TextDecoder()
  .decode(Bun.spawnSync(["git", "-C", root, "ls-files"]).stdout)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const ruleFiles = tracked.filter(
  (f) => f.startsWith(".claude/rules/") && f.endsWith(".md"),
);

function frontmatter(content: string): string | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

// block list / inline form の paths: を抽出（check-stale-paths.ts と同ロジック）。
// 日本語を含む行は description の折返し等なので glob 扱いしない。
function extractPaths(fm: string): string[] {
  const idx = fm.search(/^paths:/m);
  if (idx === -1) return [];
  const after = fm.slice(idx).replace(/^paths:/, "");
  const firstLine = after.split("\n")[0].trim();
  let raw: string[];
  if (firstLine && !firstLine.startsWith("-")) {
    raw = firstLine
      .replace(/^["']|["']$/g, "")
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""));
  } else {
    raw = [];
    for (const ln of after.split("\n").slice(1)) {
      const t = ln.trim();
      if (t.startsWith("- "))
        raw.push(
          t
            .slice(2)
            .trim()
            .replace(/^["']|["']$/g, ""),
        );
      else break;
    }
  }
  return raw.filter((p) => p && !/[ぁ-んァ-ン一-龥]/.test(p));
}

type RuleInfo = {
  file: string;
  sizeB: number;
  globs: Glob[];
  rawGlobs: string[];
};
const rules: RuleInfo[] = [];
for (const rf of ruleFiles) {
  const text = await Bun.file(join(root, rf)).text();
  const fm = frontmatter(text);
  const rawGlobs = fm ? extractPaths(fm) : [];
  rules.push({
    file: rf.replace(".claude/rules/", ""),
    sizeB: Buffer.byteLength(text, "utf8"),
    globs: rawGlobs.map((g) => new Glob(g)),
    rawGlobs,
  });
}

// 代表的な編集シナリオ（合成 path。実在不要、glob マッチ判定にのみ使う）
const SCENARIOS: Record<string, string> = {
  "管理画面 .tsx component":
    "src/app/(admin)/admin/posts/_components/PostForm.tsx",
  "公開ページ .tsx": "src/app/(public)/spaces/page.tsx",
  "Lexical node .tsx": "src/shared/lib/lexical/nodes/ImageNode.tsx",
  "Server Action .ts": "src/shared/domain/reservations/actions/create.ts",
  "domain query .ts": "src/shared/domain/reservations/queries.ts",
  "prisma schema": "prisma/schema.prisma",
  "API route .ts": "src/app/api/webhooks/stripe/route.ts",
  "shared lib .ts": "src/shared/lib/date-format.ts",
};

const fmtKB = (b: number) => `${(b / 1024).toFixed(0)}KB`;
const fmtTok = (b: number) => `~${Math.round(b / 4 / 1000)}K tok`;

// rule -> その rule が登場するシナリオ数（広さの代理指標）
const breadth = new Map<string, number>();
let worst = 0;

console.info("== 注入コスト監査: path-scoped rule の編集シナリオ別合計 ==\n");
for (const [name, path] of Object.entries(SCENARIOS)) {
  const matched = rules.filter((r) => r.globs.some((g) => g.match(path)));
  const total = matched.reduce((s, r) => s + r.sizeB, 0);
  worst = Math.max(worst, total);
  for (const r of matched) breadth.set(r.file, (breadth.get(r.file) ?? 0) + 1);
  console.info(
    `${name}\n  → ${matched.length} rules / ${fmtKB(total)} / ${fmtTok(total)}`,
  );
}

// cost-driver = サイズ × 広さ（多シナリオに登場する大 rule）
console.info("\n== cost-driver TOP 10 (sizeB × 登場シナリオ数) ==");
const drivers = rules
  .map((r) => ({ file: r.file, sizeB: r.sizeB, n: breadth.get(r.file) ?? 0 }))
  .filter((r) => r.n > 0)
  .sort((a, b) => b.sizeB * b.n - a.sizeB * a.n)
  .slice(0, 10);
for (const d of drivers)
  console.info(`  ${fmtKB(d.sizeB).padStart(6)} ×${d.n}シナリオ  ${d.file}`);

// 閾値: 1 シナリオ合計 >300KB、または単一 rule >40KB で broad glob を warn
const SCENARIO_LIMIT = 300 * 1024;
const RULE_LIMIT = 40 * 1024;
console.info("");
let warn = 0;
if (worst > SCENARIO_LIMIT) {
  console.info(
    `⚠️  最大シナリオ注入 ${fmtKB(worst)} > 閾値 ${fmtKB(SCENARIO_LIMIT)} — broad-glob 大 rule の狭小化 / trim を検討`,
  );
  warn++;
}
for (const r of rules) {
  if (r.sizeB > RULE_LIMIT && (breadth.get(r.file) ?? 0) >= 4) {
    console.info(
      `⚠️  ${r.file} (${fmtKB(r.sizeB)}) が ${breadth.get(r.file)} シナリオに注入 — 単独最大の cost-driver`,
    );
    warn++;
  }
}
if (warn === 0) console.info("✅ 注入コスト閾値内（broad-glob 大 rule なし）");

// 報告型 SKILL のため常に exit 0（warn は stdout で提示）
process.exit(0);
