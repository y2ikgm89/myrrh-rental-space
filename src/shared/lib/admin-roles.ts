/**
 * 管理者ロールの Single Source of Truth（client-safe）
 *
 * domain/admin-auth/session.ts は server-only のため、client component からは
 * 本ファイル（roles 定数）だけを import する。
 * このモジュールは server-only を持たず、ロール定数・ラベル・説明・階層制御を一元管理する。
 *
 * - `DASHBOARD_ROLES` — 管理画面アクセス可能なロール（caller は admin-roles から直接 import）
 * - `ROLE_LABELS` — 日本語ラベル
 * - `ROLE_DESCRIPTIONS` — UI 表示用のロール説明
 * - `STAFF_ASSIGNABLE_ROLES` — スタッフ管理 UI から付与できるロール
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
 * ロール付与の正本は Google Workspace グループ同期。
 *
 * 監査 A-54 / A-59: 以前はここに階層制御（誰が誰を招待 / 編集できるか）の
 * helper が並んでおり、JSDoc は「Server Action / ドメインコマンド層での
 * defense-in-depth チェックに使う」と述べていたが、**本番コードから一度も
 * 呼ばれていなかった**。アプリ内にロール変更の経路が存在しないためで、
 * `User.role` を書くのは `domain/admin-auth/google-role-sync.ts` だけ。
 *
 * スタッフ管理の mutation をアプリ側に実装するなら、そのときに階層制御を
 * 呼び出し側と一緒に書くこと。先に helper だけを戻すと同じ状態になる。
 */

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
