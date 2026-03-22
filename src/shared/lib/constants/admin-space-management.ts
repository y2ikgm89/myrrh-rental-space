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

/**
 * スペース一覧の「カテゴリ未設定のみ」フィルタ（URL `spCategoryId` 用）
 */
export const ADMIN_SPACE_LIST_CATEGORY_UNASSIGNED = "_unassigned" as const;

/** スペース一覧ソート列（URL `spSortBy` と Prisma `orderBy` で共有） */
export const ADMIN_SPACE_LIST_SORT_BY = [
  "createdAt",
  "updatedAt",
  "name",
  "hourlyPrice",
] as const;

export type AdminSpaceListSortBy =
  (typeof ADMIN_SPACE_LIST_SORT_BY)[number];
