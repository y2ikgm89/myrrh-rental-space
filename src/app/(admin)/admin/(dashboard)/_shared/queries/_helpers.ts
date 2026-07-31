import "server-only";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { logPermissionDenied } from "@/admin/lib/audit";
import { userHasResourceAccess } from "@/shared/domain/admin-auth/resource-access";
import { isEditorRole } from "@/shared/lib/admin-role-guards";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { Action, Resource } from "@/shared/lib/admin-resources";
import {
  verifyAdminSession,
  type AdminAuthUser,
} from "@/shared/domain/admin-auth/session";

/**
 * 権限不足を「その場で 404 境界を描画して」表現する。
 *
 * ## なぜ redirect ではないのか
 *
 * 旧実装は `redirect("/admin")` だった。しかし `(dashboard)/layout.tsx` は
 * `children` を `<Suspense>` の内側に置き、`DashboardChromeResolved` が
 * `connection()` で suspend する。fallback が描画された時点で公式定義上
 * **ストリーミングが開始**するため、その後の `redirect()` は HTTP 3xx を返せず
 * meta タグによる client-side redirect に劣化する:
 *
 * > When used in a streaming context, this will insert a meta tag to emit the
 * > redirect on the client side. — redirect API リファレンス (v16.2.12)
 *
 * 劣化した meta refresh は axe の `meta-refresh` critical (WCAG 2.2.1 / 2.2.4)。
 * ページ本体のどこにガードを置いても layout の境界は越えられないため、
 * **redirect である限りこの劣化は避けられない**。
 *
 * `notFound()` は遷移ではなく最寄りの `not-found.tsx` を**その場に描画**する。
 * ナビゲーションが発生しないので meta タグ自体が出ない。ストリーミング下でも
 * 公式に成立する経路（loading.js ドキュメント「The server can still communicate
 * errors or issues to the client within the streamed content itself, for example,
 * when using `redirect` or `notFound`.」）。status は 200 のままだが、これは
 * ストリーミング下では `redirect()` でも同じで失うものは無い。
 *
 * `forbidden()` は採らない。v16.2.12 でも `experimental.authInterrupts` 必須の
 * experimental で「本番非推奨」と明記され、authentication / data-security ガイドも
 * 一切言及しないため公式推奨とは言えない。
 *
 * ## 表示される内容
 *
 * `(dashboard)/not-found.tsx` は元から「お探しの管理ページは存在しないか、
 * **アクセス権限がない可能性があります。**」と書かれており、権限拒否を含む想定。
 * 権限の無いリソースの存在を秘匿する（existence hiding）点でも 404 が適切で、
 * 本 repo の領収書 route が不正 token に 404 を返すのと同じ方針。
 */
function denyAdminAccess(): never {
  notFound();
}

export async function requireAdminDashboardAccess(): Promise<AdminAuthUser> {
  await headers();
  return verifyAdminSession();
}

export async function requireAdminPermission(
  resource: Resource,
  action: Action,
): Promise<AdminAuthUser> {
  await headers();
  const user = await verifyAdminSession();

  if (!hasPermission(user.role, resource, action)) {
    void logPermissionDenied(user.id, resource, action);
    denyAdminAccess();
  }

  return user;
}

export async function requireAdminResourcePermission(
  resource: Resource,
  action: Action,
  resourceId?: string,
): Promise<AdminAuthUser> {
  await headers();
  const user = await requireAdminPermission(resource, action);

  if (!resourceId || !isEditorRole(user.role)) {
    return user;
  }

  if (!(await userHasResourceAccess(user, resource, action, resourceId))) {
    void logPermissionDenied(user.id, resource, action, resourceId);
    denyAdminAccess();
  }

  return user;
}
