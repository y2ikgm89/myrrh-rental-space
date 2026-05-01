/**
 * 顧客住所 SSoT
 *
 * - `PREFECTURES`: 47 都道府県の固定 const tuple（Select の options ソース）
 * - `Prefecture`: 上記から派生した型（Zod schema や form value の narrowing に使用）
 * - `formatCustomerAddress`: 構造化住所を 1 行文字列にフォーマット（CSV / メール / 監査ログ用）
 */

export const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const;

export type Prefecture = (typeof PREFECTURES)[number];

const PREFECTURE_SET = new Set<string>(PREFECTURES);

export function isPrefecture(value: string): value is Prefecture {
  return PREFECTURE_SET.has(value);
}

export type CustomerAddressParts = {
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  building: string | null;
};

/**
 * 構造化住所を表示用の 1 行文字列にフォーマット。
 * 全フィールドが空なら空文字列を返す。
 *
 * 例: `〒150-0001 東京都渋谷区神宮前1-1-1 サンプルビル 2F`
 */
export function formatCustomerAddress(parts: CustomerAddressParts): string {
  const segments: string[] = [];
  if (parts.postalCode) {
    segments.push(`〒${parts.postalCode}`);
  }
  const locality = [
    parts.prefecture,
    parts.city,
    parts.streetAddress,
    parts.building,
  ]
    .filter((s): s is string => Boolean(s))
    .join(" ");
  if (locality) {
    segments.push(locality);
  }
  return segments.join(" ");
}
