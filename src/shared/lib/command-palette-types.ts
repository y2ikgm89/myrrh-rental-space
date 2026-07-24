/**
 * Command Palette 共有型定義（client-safe）
 *
 * admin layer の UI / Server Action と shared/domain layer の query helper
 * （admin-search / audit-recents）の両方から参照されるため shared/lib に集約。
 */

import type { Resource } from "@/shared/lib/admin-resources";
import type { FeatureModule } from "@/shared/lib/features/registry";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  resource: Resource;
  keywords?: string[]; // fuzzy filter のキーワード補強
  /** 公開サイト feature gate 対象。OFF 時は badge 表示（ナビは残す） */
  featureModule?: FeatureModule;
};

export type QuickAction = {
  id: string;
  label: string;
  href: string;
  resource: Resource;
  description?: string;
  /** 公開サイト feature gate 対象。OFF 時は create 不可（disabled） */
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
