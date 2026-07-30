import "server-only";

/**
 * E2E 専用の追加 admin identity（header 選択式）
 *
 * ## 背景
 *
 * 管理 identity は本番では Cloud Run IAP が、E2E では `ADMIN_TEST_IAP_EMAIL` が
 * 供給する。後者は **プロセス全体で 1 つ**しか持てないため、複数 role を扱う spec は
 * DB 上の User 行の `role` を実行時に書き換えるしかなかった。
 * `fullyParallel: true` の下ではこの mutation が他 worker の spec に漏れ、
 * `settings.spec.ts` の `settings:manage` カードが消える / RBAC spec の拒否が
 * 出ないといった双方向の偽陽性を生んでいた（CI run 30569714860 / 30577092619）。
 *
 * ## 方式
 *
 * 実際の IAP と同じく **リクエストヘッダー**で identity を渡す。ヘッダーが運ぶのは
 * email ではなく下記の **固定ラベル**で、email はここで解決する。攻撃者が任意の
 * アドレスを注入する余地を作らないため。未知のラベルは fallback せず null にする
 * （fail-closed。typo を静かに既定 identity へ落とさない）。
 *
 * ゲート条件は既存の test-IAP と同一（loopback Host かつ 非 production または
 * localhost production E2E）に `E2E_RUNTIME=1` を追加した AND 条件で、
 * `session.ts` の `getTestIapEmail` が適用する。
 *
 * これらの identity は `scripts/e2e/ensure-admin-user.ts` が upsert する。
 */

/** identity ラベルを運ぶリクエストヘッダー名（小文字固定）。 */
export const E2E_ADMIN_IDENTITY_HEADER = "x-e2e-admin-identity";

/**
 * ラベル → email の SSoT。
 *
 * 既定 identity（ラベル無し）は `serverEnv.ADMIN_TEST_IAP_EMAIL` が担うため
 * ここには含めない。
 */
export const E2E_ADMIN_IDENTITIES = {
  viewer: "e2e-viewer@example.com",
} as const satisfies Record<string, string>;

export type E2EAdminIdentityLabel = keyof typeof E2E_ADMIN_IDENTITIES;

/** ラベル文字列を検証して email に解決する。未知のラベルは null（fail-closed）。 */
export function resolveE2EAdminIdentityEmail(label: string): string | null {
  return Object.hasOwn(E2E_ADMIN_IDENTITIES, label)
    ? E2E_ADMIN_IDENTITIES[label as E2EAdminIdentityLabel]
    : null;
}

/** email が E2E 専用 identity か（Google Group sync bypass の判定に使う）。 */
export function isE2EAdminIdentityEmail(email: string): boolean {
  return Object.values<string>(E2E_ADMIN_IDENTITIES).includes(email);
}
