/**
 * 管理画面「スペース管理」ページのタブ値（URL `tab` とサーバー/クライアントパーサで共有）
 */
export const ADMIN_SPACE_MANAGEMENT_TABS = [
  "spaces",
  "locations",
  "categories",
] as const;

export type AdminSpaceManagementTab =
  (typeof ADMIN_SPACE_MANAGEMENT_TABS)[number];
