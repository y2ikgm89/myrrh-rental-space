import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { Glob } from "bun";

/**
 * 管理ページの認可チェックは `<Suspense>` 境界より前で解決する（ratchet）。
 *
 * ## なぜ
 *
 * Next.js 公式の逐語仕様:
 * - redirect API リファレンス (v16.2.12): 「When used in a streaming context,
 *   this will insert a meta tag to emit the redirect on the client side.」
 * - streaming ガイド: 「Once streaming begins, the HTTP response headers
 *   (including the status code) have already been sent to the client.
 *   **You cannot change the status code or headers after streaming starts.**」
 * - 同ガイド: 「To get a real HTTP status code for errors, place `notFound()`
 *   **before** any `await` or `<Suspense>` boundary」
 * - ストリーミング開始点も公式定義: 「when a Suspense fallback renders ... or
 *   when a Server Component suspends under a `Suspense` boundary」
 *
 * 本 repo の認可拒否は `redirectToAdminHome()` = `redirect("/admin")`。これを
 * Suspense の内側で踏むと HTTP 3xx を返せず meta タグ redirect に劣化し、
 * axe の `meta-refresh` critical (WCAG 2.2.1 / 2.2.4) に当たる。実際 CI run
 * 30577092619 で監査ログページが `meta-refresh` critical を出していた
 * (当時は E2E identity が ADMIN で `auditLog:read` を持たなかったため露出した)。
 *
 * ## 採用しなかった代替
 *
 * `forbidden()` / `unauthorized()` は v16.2.12 に存在するが
 * **`experimental.authInterrupts` 必須の experimental で「本番非推奨」**と
 * 公式に明記されており、authentication / data-security ガイドも一切言及しない。
 * よって公式推奨ではないため採らない。
 *
 * ## ratchet 運用
 *
 * 既存違反は `PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST` に凍結する。新規追加は fail。
 * 解消したら allowlist から削除する（残したままだと stale として fail する）。
 * allowlist を触る PR は同時 OPEN 1 本まで（`.claude/rules/architecture-allowlist.md`）。
 */

const root = process.cwd();

/** ページ本体（default export）で認可を解決する helper 群 */
const PAGE_GUARD_PATTERN =
  /require(AdminDashboardPage|AdminListPage|AdminDetailPage|AdminSettingsPage|AdminPermission|AdminResourcePermission)\s*\(/u;

/**
 * 未解消の既存違反（凍結）。減らす方向にのみ更新する。
 */
const PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST: readonly string[] = [
  "src/app/(admin)/admin/(dashboard)/coupons/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/coupons/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/coupons/page.tsx",
  "src/app/(admin)/admin/(dashboard)/customers/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/customers/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/customers/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/[id]/broadcast/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/[id]/check-in/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/[id]/waitlist/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/categories/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/seo/page.tsx",
  "src/app/(admin)/admin/(dashboard)/faq/[categoryId]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/faq/page.tsx",
  "src/app/(admin)/admin/(dashboard)/faq/review/page.tsx",
  "src/app/(admin)/admin/(dashboard)/faq/seo/page.tsx",
  "src/app/(admin)/admin/(dashboard)/faq/trash/page.tsx",
  "src/app/(admin)/admin/(dashboard)/inquiries/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/inquiries/page.tsx",
  "src/app/(admin)/admin/(dashboard)/inquiries/tags/page.tsx",
  "src/app/(admin)/admin/(dashboard)/locations/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/locations/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/locations/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/media/page.tsx",
  "src/app/(admin)/admin/(dashboard)/news/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/news/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/news/page.tsx",
  "src/app/(admin)/admin/(dashboard)/notifications/page.tsx",
  "src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/pages/[slug]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/pages/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/categories/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/tags/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/trash/page.tsx",
  "src/app/(admin)/admin/(dashboard)/receipts/[serialNo]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/reservations/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/reservations/new-recurring/page.tsx",
  "src/app/(admin)/admin/(dashboard)/reservations/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/spaces/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/spaces/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/spaces/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/spaces/page.tsx",
  "src/app/(admin)/admin/(dashboard)/terms/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/terms/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/terms/page.tsx",
  "src/app/(admin)/admin/(dashboard)/terms/trash/page.tsx",
];

/** default export の本体のうち、最初の `<Suspense` より前の部分を返す */
function pageBodyBeforeSuspense(source: string): string {
  const match =
    /export default async function \w+\([\s\S]*?\)\s*(?::[^{]*)?\{([\s\S]*)$/u.exec(
      source,
    );
  const body = match?.[1] ?? "";
  return body.split("<Suspense")[0] ?? "";
}

function listDashboardPages(): string[] {
  const glob = new Glob("src/app/(admin)/admin/(dashboard)/**/page.tsx");
  return [...glob.scanSync(root)]
    .map((p) => p.split(sep).join("/"))
    .sort((a, b) => a.localeCompare(b));
}

function findViolations(): string[] {
  return listDashboardPages().filter((rel) => {
    const source = readFileSync(join(root, ...rel.split("/")), "utf8");
    return !PAGE_GUARD_PATTERN.test(pageBodyBeforeSuspense(source));
  });
}

describe("admin ページの認可は Suspense 境界より前で解決する", () => {
  test("allowlist 外の新規違反が無い", () => {
    // gate 自体が空振りしていないことの sanity check
    expect(listDashboardPages().length).toBeGreaterThan(0);

    const unexpected = findViolations().filter(
      (rel) => !PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST.includes(rel),
    );

    expect(unexpected).toEqual([]);
  });

  test("allowlist に解消済み entry が残っていない（ratchet）", () => {
    const violations = new Set(findViolations());
    const stale = PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST.filter(
      (rel) => !violations.has(rel),
    );

    expect(stale).toEqual([]);
  });

  test("監査ログページは解消済み（回帰防止）", () => {
    const rel = "src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx";

    expect(PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST).not.toContain(rel);
    expect(findViolations()).not.toContain(rel);
  });
});
