/**
 * cron route は副作用をレスポンス前に待ち合わせる
 *
 * ## なぜ
 *
 * cron service (`terraform/cloud_run_cron.tf`) は `cpu_idle = true`
 * （request 課金）で動く。レスポンス送信後は CPU がスロットルされるため、
 * `fireAndForget` が既定で使う Next.js の `after()` は完走が保証されない。
 * `src/shared/lib/async-utils.ts` の `fireAndForget` の docblock が
 * `--no-cpu-throttling` を明示的な前提にしているのはそのため。
 *
 * **落ちたときの見え方が無い。** 副作用が落ちても `logError` は呼ばれない
 * （インスタンスごと消えるので記録する主体がいない）。ログにも監視にも出ない
 * まま予約確認メールが飛ばない。
 *
 * ## 何を見るか
 *
 * `src/app/api/cron/*\/route.ts` の `export async function GET` が
 * `withAwaitedSideEffects` に委譲していること。
 *
 * ## なぜ「fireAndForget を使う route だけ」にしないか
 *
 * `fireAndForget` への到達は import グラフ越しに起きる。cron route が直接
 * import する共有ドメイン層のうち 4 モジュール
 * （`reservation-calendar-outbound` など）が内部で使っており、深さ 2 以上にも
 * 増えうる。「全 route が包む」なら深さ解析が要らず、共有層に import が
 * 1 本増えただけで壊れることもない。
 *
 * ## 手法の限界
 *
 * テキスト検査なので、`withAwaitedSideEffects` を呼びさえすれば通る。
 * 「handler 全体を包んでいるか」までは見ていない（AST が要る）。
 * 包み忘れという実際の失敗の形は捉えられるが、部分的にしか包まない
 * 書き方は素通りする。
 *
 * ## 直し方
 *
 *   async function handleGet(request: Request) { ...元の body... }
 *
 *   export async function GET(request: Request) {
 *     return withAwaitedSideEffects(() => handleGet(request));
 *   }
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CRON_ROOT = join(ROOT, "src", "app", "api", "cron");

function listCronRouteFiles(): string[] {
  return readdirSync(CRON_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `src/app/api/cron/${entry.name}/route.ts`)
    .sort();
}

/** GET の宣言から、列 0 の `}` までを切り出す。見つからなければ null。 */
function extractGetBody(source: string): string | null {
  const start = source.indexOf("export async function GET");
  if (start < 0) return null;
  const rest = source.slice(start);
  const end = rest.search(/\n\}/u);
  return end < 0 ? rest : rest.slice(0, end);
}

/** 副作用の待ち合わせが無ければ true（= 違反）。 */
export function missesSideEffectWait(source: string): boolean {
  const imported =
    /import\s*\{[^}]*\bwithAwaitedSideEffects\b[^}]*\}\s*from\s*"@\/shared\/lib\/async-utils"/u.test(
      source,
    );
  if (!imported) return true;

  const body = extractGetBody(source);
  if (body === null) return true;
  return !body.includes("withAwaitedSideEffects(");
}

describe("cron route は副作用をレスポンス前に待ち合わせる", () => {
  const routeFiles = listCronRouteFiles();

  test("走査対象の cron route が存在する", () => {
    // 走査が 0 件でも緑になる形を避けるための下限。
    expect(routeFiles.length).toBeGreaterThan(20);
  });

  test("全ての cron route が withAwaitedSideEffects に委譲している", () => {
    const offenders = routeFiles.filter((path) =>
      missesSideEffectWait(readFileSync(join(ROOT, path), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  test("実在の route は違反にならない（witness）", () => {
    // 合成 fixture ではなくツリー内の実例で「落ちてはいけない形」を固定する。
    const witness = readFileSync(
      join(ROOT, "src/app/api/cron/waitlist-expire/route.ts"),
      "utf8",
    );
    expect(missesSideEffectWait(witness)).toBe(false);
  });

  test("包み忘れは違反になる（fixture）", () => {
    // 包み忘れの実例はツリーに 0 件なので合成する。
    const source = `import { jsonSuccess } from "@/shared/lib/route-responses";

export async function GET(request: Request) {
  void request;
  return jsonSuccess({ ok: true });
}
`;
    expect(missesSideEffectWait(source)).toBe(true);
  });

  test("import だけあって GET が呼んでいない形は違反になる（fixture）", () => {
    // import の有無だけを見る実装への退行を捕まえる。
    const source = `import { withAwaitedSideEffects } from "@/shared/lib/async-utils";
import { jsonSuccess } from "@/shared/lib/route-responses";

void withAwaitedSideEffects;

export async function GET(request: Request) {
  void request;
  return jsonSuccess({ ok: true });
}
`;
    expect(missesSideEffectWait(source)).toBe(true);
  });
});
