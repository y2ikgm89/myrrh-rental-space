/**
 * 管理者ロールの Single Source of Truth（client-safe）
 *
 * admin-auth.ts は server-only のため、client component からは import できない。
 * このモジュールは server-only を持たず、ロール定数・ラベル・説明・階層制御を一元管理する。
 *
 * - `DASHBOARD_ROLES` — 管理画面アクセス可能なロール（admin-auth が再 export）
 * - `ROLE_LABELS` — 日本語ラベル（permissions.ts が再 export）
 * - `ROLE_DESCRIPTIONS` — UI 表示用のロール説明
 * - `INVITABLE_BY` — 階層制御マップ（誰が誰を招待/編集できるか）
 * - `getInvitableRoles()` / `canInviteRole()` / `canModifyUser()` — 階層ヘルパー
 */

import { Role } from "@/shared/lib/validations/enums/prisma-types";

/**
 * ダッシュボードアクセス可能なロール（Single Source of Truth）
 *
 * tuple として宣言することで `z.enum(DASHBOARD_ROLES)` に直接渡せる。
 */
export const DASHBOARD_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.EDITOR,
  Role.VIEWER,
] as const satisfies readonly Role[];

export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

const DASHBOARD_ROLE_SET = new Set<Role>(DASHBOARD_ROLES);

/** `role` がダッシュボードアクセス可能かを判定する型ガード */
export function isDashboardRole(role: Role): role is DashboardRole {
  return DASHBOARD_ROLE_SET.has(role);
}

/**
 * 管理者相当ロール（ADMIN / SUPER_ADMIN）の SSoT
 *
 * EDITOR / VIEWER を除外して「全機能アクセス可能な上位管理者」を表す。
 * `isAdmin()` 等の権限ガードで Role 直比較を回避するために使用。
 */
export const ADMIN_OR_HIGHER_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
] as const satisfies readonly DashboardRole[];

export type AdminOrHigherRole = (typeof ADMIN_OR_HIGHER_ROLES)[number];

const ADMIN_OR_HIGHER_ROLE_SET = new Set<Role>(ADMIN_OR_HIGHER_ROLES);

/**
 * `role` が ADMIN または SUPER_ADMIN かを判定する型ガード
 *
 * `role === Role.ADMIN || role === Role.SUPER_ADMIN` の冗長記述を排し、
 * 新規上位ロール追加時の修正点を ADMIN_OR_HIGHER_ROLES 1 箇所に集約する。
 */
export function isAdminOrHigherRole(role: Role): role is AdminOrHigherRole {
  return ADMIN_OR_HIGHER_ROLE_SET.has(role);
}

/**
 * ロール階層制御マップ
 *
 * 「誰が誰を招待・作成・ロール変更できるか」の正。
 * GitHub / Slack / Shopify の階層モデル準拠:
 * - SUPER_ADMIN → ADMIN / EDITOR / VIEWER を招待/操作可
 * - ADMIN → EDITOR / VIEWER のみ招待/操作可（同格以上は不可、特権昇格攻撃の防止）
 * - EDITOR / VIEWER → 他ユーザー管理不可
 *
 * SUPER_ADMIN は招待経由で付与できない（システム初期化時のみ作成可、seed / 直接 DB 操作）。
 */
export const INVITABLE_BY: Record<DashboardRole, readonly Role[]> = {
  SUPER_ADMIN: [Role.ADMIN, Role.EDITOR, Role.VIEWER],
  ADMIN: [Role.EDITOR, Role.VIEWER],
  EDITOR: [],
  VIEWER: [],
};

/**
 * 指定ロールが招待/付与可能なロール一覧を返す
 *
 * UI のロール選択肢フィルタリングに使う。
 * 例: ADMIN ログイン時は EDITOR / VIEWER のみ Select に表示。
 */
export function getInvitableRoles(actorRole: DashboardRole): readonly Role[] {
  return INVITABLE_BY[actorRole];
}

/**
 * `actorRole` が `targetRole` を招待/付与できるかを判定
 *
 * Server Action / ドメインコマンド層での defense-in-depth チェックに使う。
 * UI フィルタだけでなくサーバー側でも検証することで、直接 API 呼び出し経由の
 * 特権昇格（ADMIN が別 ADMIN を作成する等）を防ぐ。
 */
export function canInviteRole(actorRole: Role, targetRole: Role): boolean {
  if (!isDashboardRole(actorRole)) return false;
  return INVITABLE_BY[actorRole].includes(targetRole);
}

/**
 * `actorRole` が `targetCurrentRole` のユーザーを編集/削除できるかを判定
 *
 * 既存ユーザーのロール変更・プロフィール編集・削除の権限チェックに使う。
 * - SUPER_ADMIN は全ユーザーを操作可
 * - ADMIN は EDITOR / VIEWER のみ操作可（別 ADMIN / SUPER_ADMIN は不可）
 * - EDITOR / VIEWER は他ユーザーを操作不可
 */
export function canModifyUser(
  actorRole: Role,
  targetCurrentRole: Role,
): boolean {
  if (!isDashboardRole(actorRole)) return false;
  return INVITABLE_BY[actorRole].includes(targetCurrentRole);
}

/** ロール日本語ラベル（UI 表示用） */
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "スーパー管理者",
  ADMIN: "管理者",
  EDITOR: "編集者",
  VIEWER: "閲覧者",
  USER: "ユーザー",
  CUSTOMER: "顧客",
};

/** ロール説明（ロール選択 UI のヘルプテキスト用） */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN:
    "システム全体の管理権限（ユーザー管理・監査ログ・統合設定を含む）。システム初期化時のみ作成されます",
  ADMIN:
    "コンテンツ管理全般と、編集者・閲覧者のスタッフ管理。監査ログ・統合設定は除く",
  EDITOR: "割り当てられたページのみ編集可能",
  VIEWER: "閲覧のみ（編集不可）",
  USER: "公開ユーザー（管理画面アクセス不可）",
  CUSTOMER: "ソーシャルログイン顧客（マイページのみアクセス可）",
};
