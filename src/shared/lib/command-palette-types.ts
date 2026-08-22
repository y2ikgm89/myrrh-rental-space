/**
 * Command Palette 共有型定義（client-safe）
 *
 * admin layer の UI / Server Action と shared/domain layer の query helper
 * （admin-search / audit-recents）の両方から参照されるため shared/lib に集約。
 */

import type { Action, Resource } from "@/shared/lib/admin-resources";
import type { FeatureModule } from "@/shared/lib/features/registry";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  resource: Resource;
  /**
   * この遷移先を**開く**のに必要な権限。`resource` とは別に持つ。
   *
   * `resource` は「何についての項目か」（検索語・グルーピング用）で、
   * アクセス要件と一致するとは限らない。例: 「ナビゲーション」「アナウンスバー」は
   * `resource: "navigation" / "announcementBar"` だが、遷移先は
   * `/admin/settings/appearance` で `settings:read` を要求する。
   *
   * **optional にしない（監査 A-01）。** 以前は宣言が `resource` だけで、
   * `getNavItemsForRole` が一律 `"read"` で絞っていた。`settings:manage` を要求する
   * 4 ページ（features / billing / integrations / system）が `settings:read` しか
   * 持たない ADMIN・VIEWER の palette に出続け、選ぶと `notFound()` に落ちていた。
   * 同じ 4 件を設定ハブ（`settings/page.tsx`）は最初から隠している。
   *
   * 既定値を持たせると「書き忘れ = read 扱い」に戻るので全 entry に書かせる。
   * 形は sidebar 側の `requiredPermission` と同じにそろえた。
   */
  requiredPermission: { resource: Resource; action: Action };
  keywords?: string[]; // fuzzy filter のキーワード補強
  /**
   * 公開サイト feature gate 対象。OFF 時は「非公開」badge 表示（ナビは残す）。
   * 一覧・編集は可、新規作成は不可。
   */
  featureModule?: FeatureModule;
};

export type QuickAction = {
  id: string;
  label: string;
  href: string;
  resource: Resource;
  description?: string;
  /** feature OFF 時は palette 上 disabled（create 不可） */
  featureModule?: FeatureModule;
};

export type RecentItem = {
  id: string; // `${resource}:${resourceId}`
  resource: Resource;
  resourceId: string;
  label: string; // "スペース: 渋谷店"
  href: string;
  occurredAt: string; // ISO string (Serialized)
};

export type SearchResultItem = {
  id: string;
  resource: Resource;
  label: string;
  description?: string;
  href: string;
};

export type SearchResultGroup = {
  resource: Resource;
  items: SearchResultItem[];
};
