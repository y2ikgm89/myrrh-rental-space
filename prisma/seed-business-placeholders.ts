/**
 * dev seed が使う架空の事業者情報 SSoT。
 *
 * ## なぜ 1 箇所に集めるか（監査 A-10）
 *
 * この値は 2 系統から使われる:
 *
 * - `seedSettings` の `SettingsOrganization`（`includeBusinessPlaceholders`）
 * - `seed-terms-documents.ts` の規約本文（`{{businessName}}` 等のトークン置換）
 *
 * **本番 seed はどちらにも入れない。** 特に規約本文は、以前ここの値が
 * literal で埋め込まれたまま `isPublished: true` で投入されており、
 * 新規本番 DB では特定商取引法に基づく表記が
 * 「事業者名称: 株式会社サンプル / 代表者: 山田 太郎 / 法人番号: 1234567890123」
 * という**実在しない事業者の法定表示**として公開されていた。
 * さらに `TermsAgreement.contentSnapshot` に同意のたび凍結され続ける。
 *
 * 手書きのコピーが 2 つあると必ず片方だけが動く。ここを唯一の出どころにして、
 * 「dev だけがこの値を使う」を構造で保つ。
 */

export const DEV_BUSINESS_PLACEHOLDERS = {
  businessName: "株式会社サンプル",
  businessNameKana: "カブシキガイシャサンプル",
  representativeName: "山田 太郎",
  registrationNumber: "1234567890123",
  /**
   * 適格請求書発行事業者登録番号 (T + 13桁)。`issueReceiptForReservation` が
   * `issuerSnapshot` に凍結し、PDF 領収書の「登録番号: T…」欄に出力される。
   * dev の領収書発行を動作確認しやすくするための明示値。
   */
  invoiceNumber: "T1234567890123",
  phoneNumber: "03-1234-5678",
  email: "info@example.com",
  postalCode: "150-0001",
  prefecture: "東京都",
  city: "渋谷区",
  streetAddress: "神宮前1-1-1",
  buildingName: "サンプルビル",
} as const;

/** 規約本文が使う 1 行住所（`〒 + 都道府県 + 市区町村 + 番地 + 建物`）。 */
export const DEV_BUSINESS_ADDRESS_LINE = `〒${DEV_BUSINESS_PLACEHOLDERS.postalCode} ${DEV_BUSINESS_PLACEHOLDERS.prefecture} ${DEV_BUSINESS_PLACEHOLDERS.city} ${DEV_BUSINESS_PLACEHOLDERS.streetAddress} ${DEV_BUSINESS_PLACEHOLDERS.buildingName}`;
