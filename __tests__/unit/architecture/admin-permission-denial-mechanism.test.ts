import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";
import { join, sep } from "node:path";

/**
 * 管理画面の権限拒否は `notFound()` で「その場に描画」する（`redirect()` 禁止）。
 *
 * ## なぜ
 *
 * `(dashboard)/layout.tsx` は `children` を `<Suspense>` の内側に置き、
 * `DashboardChromeResolved` が `connection()` で suspend する。fallback が
 * 描画された時点で公式定義上ストリーミングが開始するため、その後の `redirect()` は
 * HTTP 3xx を返せず meta タグに劣化する:
 *
 * > When used in a streaming context, this will insert a meta tag to emit the
 * > redirect on the client side. — redirect API リファレンス (v16.2.12)
 *
 * 劣化した meta refresh は axe の `meta-refresh` critical (WCAG 2.2.1 / 2.2.4)。
 * **ページ本体のどこにガードを置いても layout の境界は越えられない**ので、
 * redirect である限りこの劣化は避けられない（PR #1704 に対する Codex P1 指摘）。
 *
 * `notFound()` は遷移ではなく最寄りの `not-found.tsx` をその場に描画するため
 * meta タグ自体が出ない。ストリーミング下でも公式に成立する経路。
 *
 * `forbidden()` は採らない — v16.2.12 でも `experimental.authInterrupts` 必須の
 * experimental で「本番非推奨」と明記され、公式ガイドも一切言及しないため。
 *
 * E2E 側の実測は
 * `e2e/authenticated/admin-viewer/axe-admin-viewer-pages.spec.ts` が担う。
 */

const root = process.cwd();

const HELPERS_FILE =
  "src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts";
const NOT_FOUND_BOUNDARY = "src/app/(admin)/admin/(dashboard)/not-found.tsx";

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

/** 散文の言及を違反に数えないようコメントを落とす */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

describe("管理画面の権限拒否は notFound() で表現する", () => {
  test("_helpers.ts は redirect を使わない", () => {
    const source = stripComments(read(HELPERS_FILE));

    expect(source).not.toMatch(/\bredirect\s*\(/u);
    expect(source).not.toMatch(/from\s+"next\/navigation"[\s\S]*redirect/u);
  });

  test("_helpers.ts は notFound を import して拒否経路で呼ぶ", () => {
    const source = stripComments(read(HELPERS_FILE));

    expect(source).toMatch(
      /import\s*\{\s*notFound\s*\}\s*from\s+"next\/navigation"/u,
    );
    expect(source).toMatch(
      /function denyAdminAccess\(\)\s*:\s*never\s*\{\s*notFound\(\);/u,
    );

    // hasPermission / userHasResourceAccess の両拒否分岐が経由すること
    const calls = [...source.matchAll(/denyAdminAccess\(\)/gu)].length;
    expect(calls).toBeGreaterThanOrEqual(3); // 定義 1 + 呼び出し 2
  });

  test("verifyAdminSession も notFound() で拒否する（redirect 禁止）", () => {
    // dashboard role を持たない場合の拒否。呼び出し元は admin layout と
    // (public)/preview の双方で、いずれも Suspense 内で評価されるため
    // redirect では meta タグに劣化する。
    const source = stripComments(
      read("src/shared/domain/admin-auth/session.ts"),
    );

    expect(source).toMatch(
      /import\s*\{\s*notFound\s*\}\s*from\s+"next\/navigation"/u,
    );
    expect(source).not.toMatch(/\bredirect\s*\(/u);
    expect(source).toMatch(
      /isDashboardRole\(user\.role\)[\s\S]{0,80}notFound\(\)/u,
    );
  });

  test("layout が投げる notFound() を受ける親境界が /admin にある", () => {
    // segment 自身の not-found.tsx は **その segment の子ルート**しか包まない。
    // `verifyAdminSession()` は `(dashboard)/layout.tsx` から呼ばれるため、
    // その拒否は `(dashboard)/not-found.tsx` を飛び越えて親へ抜ける。
    // 親に境界が無いと global-not-found（ルーティング外 URL 専用）へ落ちる。
    const parent = read("src/app/(admin)/admin/not-found.tsx");

    expect(parent).toContain("アクセス権限がない可能性があります");
  });

  test("拒否時に描画される not-found 境界が存在し、権限不足に言及する", () => {
    // `notFound()` は最寄りの not-found.tsx を描画する。dashboard 配下に無いと
    // global-not-found へ落ち、管理画面 chrome の外に飛ぶ。
    const boundary = read(NOT_FOUND_BOUNDARY);

    expect(boundary).toContain("アクセス権限がない可能性があります");
  });
});

/**
 * 静的な URL エイリアスは `next.config.ts` の `redirects()` で表現する（ratchet）。
 *
 * dashboard 配下の `page.tsx` 本体で `redirect()` を呼ぶと、layout の Suspense
 * 内で評価されるためストリーミング開始後になり、実 3xx を返せず meta タグに
 * 劣化する。`redirects()` は公式 "Execution order"（headers → redirects → proxy →
 * filesystem routes）でレンダリング前に走るので実 308 を返せる。
 *
 * ここに残すのは DB / 実行時条件に依存し config で表現できないものだけ。**件数は
 * 書かない**（数は drift する）。載せた entry が本当に今も `redirect()` を呼んで
 * いるかは下の staleness test が実測する — 移行や削除が済んだ entry を消し忘れると、
 * 後から同じパスへ `redirect()` が戻ったときに黙って免除してしまう。
 */
const CONDITIONAL_PAGE_REDIRECT_ALLOWLIST: readonly string[] = [
  // slug から編集ページへ解決する動的エイリアス
  "src/app/(admin)/admin/(dashboard)/pages/[slug]/page.tsx",
  // 連携状態に応じた canonical URL への正規化
  "src/app/(admin)/admin/(dashboard)/settings/integrations/page.tsx",
];

/** dashboard 配下で `redirect()` を呼んでいる page.tsx（repo 相対・`/` 区切り）。 */
function dashboardPagesCallingRedirect(): string[] {
  const glob = new Glob("src/app/(admin)/admin/(dashboard)/**/page.tsx");
  return [...glob.scanSync(root)]
    .map((p) => p.split(sep).join("/"))
    .filter((rel) => {
      const source = stripComments(
        readFileSync(join(root, ...rel.split("/")), "utf8"),
      );
      return /\bredirect\s*\(/u.test(source);
    })
    .sort((a, b) => a.localeCompare(b));
}

describe("admin の静的エイリアスは next.config redirects で表現する", () => {
  test("走査対象の page.tsx が実在する（gate が空振りしていない）", () => {
    const glob = new Glob("src/app/(admin)/admin/(dashboard)/**/page.tsx");
    expect([...glob.scanSync(root)].length).toBeGreaterThan(10);
  });

  test("dashboard の page.tsx は redirect() を呼ばない（allowlist 除く）", () => {
    const offenders = dashboardPagesCallingRedirect().filter(
      (rel) => !CONDITIONAL_PAGE_REDIRECT_ALLOWLIST.includes(rel),
    );

    expect(offenders).toEqual([]);
  });

  test("allowlist の entry は今も redirect() を呼んでいる（陳腐化した免除を残さない）", () => {
    const actual = new Set(dashboardPagesCallingRedirect());
    const stale = CONDITIONAL_PAGE_REDIRECT_ALLOWLIST.filter(
      (rel) => !actual.has(rel),
    );

    expect({
      stale,
      hint:
        stale.length > 0
          ? "この entry はもう redirect() を呼んでいない（移行済み or 削除済み）。allowlist から外す。残すと、後から同じパスへ redirect() が戻ったときに黙って免除される"
          : "",
    }).toEqual({ stale: [], hint: "" });
  });

  test("エイリアスは proxy が surface 判定の後に処理する", () => {
    // next.config の redirects() は `next build` 時に routes manifest へ焼き込まれるが、
    // APP_SURFACE は Cloud Run の **runtime** 変数で 1 イメージを両サービスへ配る
    // (terraform/locals_cloud_run.tf、Dockerfile は APP_SURFACE を設定しない)。
    // build 時に surface で分岐しても効かないため proxy で処理する。
    const proxy = stripComments(read("src/proxy.ts"));

    expect(proxy).toMatch(/resolveAdminAliasRedirect\(pathname\)/u);

    // public surface の 404 blocklist より **後** に評価されること
    const blocklist = proxy.indexOf("isBlockedOnPublicSurface(pathname)");
    const alias = proxy.indexOf("resolveAdminAliasRedirect(pathname)");
    expect(blocklist).toBeGreaterThan(-1);
    expect(alias).toBeGreaterThan(blocklist);

    // next.config には戻さない
    expect(stripComments(read("next.config.ts"))).not.toMatch(
      /async redirects\(\)/u,
    );
  });
});
