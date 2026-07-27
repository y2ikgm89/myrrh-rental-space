export const SPACE_EDIT_TAB_VALUES = [
  "basic",
  "pricing",
  "media",
  "details",
  "publish",
  "blocked-dates",
] as const satisfies readonly [string, ...string[]];

export type SpaceEditTabValue = (typeof SPACE_EDIT_TAB_VALUES)[number];

const SPACE_EDIT_TAB_VALUE_SET: ReadonlySet<string> = new Set(
  SPACE_EDIT_TAB_VALUES,
);

export function isSpaceEditTabValue(value: string): value is SpaceEditTabValue {
  return SPACE_EDIT_TAB_VALUE_SET.has(value);
}

export const SPACE_EDIT_TAB_LABELS: Record<SpaceEditTabValue, string> = {
  basic: "基本情報",
  pricing: "料金設定",
  media: "メディア",
  details: "詳細設定",
  publish: "公開・SEO",
  "blocked-dates": "臨時休業",
};

export const SELECT_NONE_VALUE = "__none__";
