/**
 * 回帰テスト: settings フォームスキーマの空欄保存
 *
 * conform の `parseWithZod`（@conform-to/zod/v4）は空入力を `undefined` に変換する。
 * フォームスキーマが必須の `z.string()` のままだと、空欄保存が
 * 「Invalid input: expected string, received undefined」で全項目弾かれる。
 * 任意項目は `.optional()` で undefined を許容する必要があるため、ここで固定する
 * （`.optional()` を外すと本テストが落ちる）。
 *
 * 既存の settings-business.test.ts はスキーマをインライン再宣言し object 入力で
 * 検証していたため、この conform 経由の空→undefined 変換を捕捉できなかった。
 * 本テストは実体のフォームスキーマを import し、FormData 経由で検証する。
 */
import { describe, test, expect } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  businessInfoFormSchema,
  contactInfoFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-brand-contact";

function emptyFormData(keys: readonly string[]): FormData {
  const fd = new FormData();
  for (const k of keys) fd.set(k, "");
  return fd;
}

const BUSINESS_KEYS = [
  "businessName",
  "businessNameKana",
  "representativeName",
  "businessType",
  "industryType",
  "establishedDate",
  "registrationNumber",
  "invoiceNumber",
  "businessDescription",
] as const;

const CONTACT_KEYS = [
  "phoneNumber",
  "faxNumber",
  "email",
  "postalCode",
  "prefecture",
  "city",
  "streetAddress",
  "buildingName",
] as const;

describe("settings フォームスキーマ: 空欄保存（conform の空→undefined 変換）", () => {
  test("事業者情報: 全項目空欄でも success（個人事業主は法人番号・インボイス番号なし）", () => {
    const s = parseWithZod(emptyFormData(BUSINESS_KEYS), {
      schema: businessInfoFormSchema,
    });
    expect(s.status).toBe("success");
  });

  test("連絡先情報: 全項目空欄でも success（FAX 等が空でも保存可）", () => {
    const s = parseWithZod(emptyFormData(CONTACT_KEYS), {
      schema: contactInfoFormSchema,
    });
    expect(s.status).toBe("success");
  });

  test("事業者情報: 実値の max 制約は依然有効（invoiceNumber 21文字はエラー）", () => {
    const fd = emptyFormData(BUSINESS_KEYS);
    fd.set("invoiceNumber", "T".repeat(21));
    const s = parseWithZod(fd, { schema: businessInfoFormSchema });
    expect(s.status).toBe("error");
  });

  test("連絡先情報: email は不正値でエラー（任意だが形式は検証）", () => {
    const fd = emptyFormData(CONTACT_KEYS);
    fd.set("email", "invalid-email");
    const s = parseWithZod(fd, { schema: contactInfoFormSchema });
    expect(s.status).toBe("error");
  });
});
