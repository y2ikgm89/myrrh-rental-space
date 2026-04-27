import type { Resource } from "@/admin/lib/admin-resources";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  resource: Resource;
  keywords?: string[]; // fuzzy filter のキーワード補強
};

export type QuickAction = {
  id: string;
  label: string;
  href: string;
  resource: Resource;
  description?: string;
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
