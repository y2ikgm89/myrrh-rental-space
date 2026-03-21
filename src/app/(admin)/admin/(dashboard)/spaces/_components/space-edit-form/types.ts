/**
 * スペース編集フォーム共有型（タブパネル・親フォームで共用）
 */

export const SELECT_NONE_VALUE = "__none__";

export type SpaceEditTermsOption = {
  id: string;
  title: string;
  type: string;
};

export type SpaceEditLocationOption = {
  id: string;
  name: string;
  address: string;
};

export type SpaceEditCategoryOption = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};
