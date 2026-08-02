/**
 * 必須テキストが「空白だけの入力」を実際に拒否することを、実スキーマで確かめる。
 *
 * ## なぜ静的検査だけでは足りないか
 *
 * `local/require-trimmed-text` が見るのはソースの形であって挙動ではない。実際、
 * 前身の静的 gate は `.trim()` と `.min(1)` の**有無**しか見ておらず、
 * `z.string().min(1).trim()` という**順序の壊れたチェーン**を緑と判定していた
 * （Zod 4 の check は宣言順に走るので、この形は "   " を通して data を "" にする）。
 * 形の検査は形の誤りしか捕まえない。ここでは実スキーマに値を通す。
 *
 * ## probe の作り方
 *
 * **まず完全に有効な payload で `success: true` を確かめ**、そこから対象フィールド
 * だけを差し替える。対象フィールドだけ埋めたオブジェクトを投げると、別の必須項目が
 * 欠けて落ちたのを「対象フィールドが正しく拒否した」と読み違える
 * （この repo で実際に 6 件を「対応済み」と誤判定した）。
 *
 * 全角空白と改行を必ず含める。日本語入力では全角空白が主要なケースで、
 * Postgres の `btrim()` のように ASCII 空白しか落とさない実装だと素通りする。
 */

import { describe, expect, test } from "bun:test";
import { publicInquirySchema } from "@/shared/lib/validations/inquiry";
import { publicReservationSchema } from "@/shared/lib/validations/public-reservation";
import { customerProfileSchema } from "@/shared/lib/validations/customer-profile";
import { facilitiesSchema } from "@/shared/lib/json-validators";
import { field } from "@/shared/lib/sections/field-registry";

/** 見た目が空になる入力。半角・全角・改行・タブ・NBSP を網羅する。 */
const BLANK_INPUTS = [
  ["半角空白", "   "],
  ["全角空白", "　　"],
  ["改行", "\n\n"],
  ["タブ", "\t"],
  ["NBSP", " "],
] as const;

/**
 * `schema` を `valid` で通してから、`field` だけを空白入力に差し替えて拒否を確かめる。
 * 併せて前後空白が正規化されることも見る。
 */
function expectRejectsBlank<T extends Record<string, unknown>>(
  label: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } },
  valid: T,
  field: keyof T & string,
): void {
  describe(`${label}.${field}`, () => {
    test("正常系が通る（これが false なら probe 自体が誤り）", () => {
      expect(schema.safeParse(valid).success).toBe(true);
    });

    for (const [name, blank] of BLANK_INPUTS) {
      test(`${name}だけの入力を拒否する`, () => {
        expect(schema.safeParse({ ...valid, [field]: blank }).success).toBe(
          false,
        );
      });
    }

    test("前後の空白は正規化して受け入れる", () => {
      const raw = valid[field];
      if (typeof raw !== "string") throw new Error("string フィールドのみ対象");
      const result = schema.safeParse({ ...valid, [field]: `  ${raw}  ` });
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)[field]).toBe(raw);
    });
  });
}

const INQUIRY = {
  lastName: "山田",
  firstName: "太郎",
  email: "taro@example.com",
  subject: "設備について",
  message: "利用したいのですが",
};

// 公開問い合わせ — 空白だけの送信が DB に入り、管理者宛メールまで飛んでいた経路
for (const f of ["lastName", "firstName", "subject", "message"] as const) {
  expectRejectsBlank("publicInquirySchema", publicInquirySchema, INQUIRY, f);
}

const RESERVATION = {
  locationId: "00000000-0000-4000-8000-000000000001",
  spaceId: "00000000-0000-4000-8000-000000000002",
  date: "2026-09-01",
  startTime: "10:00",
  endTime: "12:00",
  numberOfGuests: 2,
  customerType: "PERSONAL",
  lastName: "山田",
  firstName: "太郎",
  email: "taro@example.com",
  phoneNumber: "09012345678",
  agreedTermsIds: ["00000000-0000-4000-8000-000000000000"],
};

// 公開予約 — 姓名は共有 helper 経由で定義されており、旧 gate からは見えなかった
for (const f of ["lastName", "firstName"] as const) {
  expectRejectsBlank(
    "publicReservationSchema",
    publicReservationSchema,
    RESERVATION,
    f,
  );
}

for (const f of ["lastName", "firstName"] as const) {
  expectRejectsBlank(
    "customerProfileSchema",
    customerProfileSchema,
    { lastName: "山田", firstName: "太郎", phoneNumber: "09012345678" },
    f,
  );
}

/**
 * `Space.facilities` は書込と読取でスキーマを共用する。空白だけの設備名を弾けないと、
 * 見えない設備が保存され、公開ファセットと DB 絞り込みの食い違いにも波及する。
 */
describe("facilitiesSchema.name", () => {
  test("正常系が通る（これが false なら probe 自体が誤り）", () => {
    expect(
      facilitiesSchema.safeParse([{ name: "Wi-Fi", iconName: "IconWifi" }])
        .success,
    ).toBe(true);
  });

  for (const [name, blank] of BLANK_INPUTS) {
    test(`${name}だけの設備名を拒否する`, () => {
      expect(
        facilitiesSchema.safeParse([{ name: blank, iconName: "" }]).success,
      ).toBe(false);
    });
  }

  test("前後の空白は正規化する", () => {
    const result = facilitiesSchema.safeParse([
      { name: "  椅子  ", iconName: "" },
    ]);
    expect(result.success && result.data[0]?.name).toBe("椅子");
  });
});

/**
 * section フィールドは公開ページ本文の最大の面だが、制約が `applyStringConstraints`
 * の中で後付けされるため ESLint ルールからは見えない。構築点で trim している。
 */
describe("field.text / field.textarea", () => {
  const text = field.text("見出し", { minLength: 1, maxLength: 20 });
  const textarea = field.textarea("本文", { minLength: 1, maxLength: 100 });

  test("正常系が通る（これが false なら probe 自体が誤り）", () => {
    expect(text.safeParse("見出し").success).toBe(true);
    expect(textarea.safeParse("本文").success).toBe(true);
  });

  for (const [name, blank] of BLANK_INPUTS) {
    test(`${name}だけの入力を拒否する`, () => {
      expect(text.safeParse(blank).success).toBe(false);
      expect(textarea.safeParse(blank).success).toBe(false);
    });
  }

  test("前後の空白は正規化する", () => {
    expect(text.safeParse("  見出し  ")).toMatchObject({
      success: true,
      data: "見出し",
    });
  });
});
