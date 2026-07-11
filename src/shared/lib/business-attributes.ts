/**
 * 施設属性（amenity）の SSoT
 *
 * Settings.businessAttributes（全社共通）と Location.amenities（拠点ごと）
 * の両方で使用される共通定義。
 */

export const BUSINESS_ATTRIBUTE_OPTIONS = [
  { key: "wifi", label: "Wi-Fi" },
  { key: "parking", label: "駐車場" },
  { key: "barrier_free", label: "バリアフリー" },
  { key: "elevator", label: "エレベーター" },
  { key: "smoking_area", label: "喫煙所" },
  { key: "food_allowed", label: "飲食可" },
  { key: "photography_allowed", label: "撮影可" },
  { key: "music_allowed", label: "楽器演奏可" },
] as const;
