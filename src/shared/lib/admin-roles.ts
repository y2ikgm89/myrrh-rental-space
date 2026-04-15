/**
 * 管理者ロールの Single Source of Truth（client-safe）
 *
 * admin-auth.ts は server-only のため、client component からは import できない。
 * このモジュールは server-only を持たず、ロール定数・ラベル・説明を一元管理する。
 *
 * - `DASHBOARD_ROLES` — 管理画面アクセス可能なロール（admin-auth が再 export）
 * - `STAFF_INVITABLE_ROLES` — スタッフ招待フォームで選択可能なロール（SUPER_ADMIN 除く）
 * - `ROLE_LABELS` — 日本語ラベル（permissions.ts が再 export）
 * - `ROLE_DESCRIPTIONS` — UI 表示用のロール説明
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

/**
 * スタッフ招待フォームで割り当て可能なロール
 *
 * SUPER_ADMIN は招待経由で付与できない（システム初期化時のみ作成可）。
 * DASHBOARD_ROLES から SUPER_ADMIN を除外した派生定数。
 */
export const STAFF_INVITABLE_ROLES = [
  Role.ADMIN,
  Role.EDITOR,
  Role.VIEWER,
] as const satisfies readonly Role[];

export type DashboardRole = (typeof DASHBOARD_ROLES)[number];
export type StaffInvitableRole = (typeof STAFF_INVITABLE_ROLES)[number];

const DASHBOARD_ROLE_SET = new Set<Role>(DASHBOARD_ROLES);

/** `role` がダッシュボードアクセス可能かを判定する型ガード */
export function isDashboardRole(role: Role): role is DashboardRole {
  return DASHBOARD_ROLE_SET.has(role);
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
  SUPER_ADMIN: "システム全体の管理権限（ユーザー管理、監査ログ含む）",
  ADMIN: "コンテンツ管理全般（ユーザー管理除く）",
  EDITOR: "割り当てられたページのみ編集可能",
  VIEWER: "閲覧のみ（編集不可）",
  USER: "公開ユーザー（管理画面アクセス不可）",
  CUSTOMER: "ソーシャルログイン顧客（マイページのみアクセス可）",
};
