/**
 * 管理フォームの必須テキストで、conform が畳む `undefined` が日本語になること。
 * `.min(1, { error })` だけでは外側 `z.string()` の invalid_type に届かない。
 */

import { describe, expect, test } from "bun:test";
import { smartLockDeviceFormSchema } from "@/admin/lib/validations/smart-lock-device";
import { spaceFormSchema } from "@/admin/lib/validations/space";
import {
  faqCategoryFormSchema,
  faqItemFormSchema,
} from "@/admin/lib/validations/faq";
import { createNewsSchema } from "@/admin/lib/validations/news";
import {
  createPostSchema,
  postCategorySchema,
  postTagSchema,
} from "@/admin/lib/validations/post";
import { locationFormSchema } from "@/shared/lib/validations/location";
import { SmartLockDeviceType } from "@/shared/lib/validations/enums/prisma-types";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/lexical/description-defaults";

function expectUndefinedJapaneseMessage(
  schema: {
    safeParse: (v: unknown) => {
      success: boolean;
      error?: {
        issues: readonly {
          path: readonly PropertyKey[];
          message: string;
        }[];
      };
    };
  },
  valid: Record<string, unknown>,
  fieldName: string,
  message: string,
): void {
  test(`${fieldName} が未入力なら「${message}」`, () => {
    expect(schema.safeParse(valid).success).toBe(true);
    const result = schema.safeParse({ ...valid, [fieldName]: undefined });
    expect(result.success).toBe(false);
    const issue = result.success
      ? undefined
      : result.error?.issues.find((item) => item.path[0] === fieldName);
    expect(issue?.message).toBe(message);
  });
}

const VALID_SPACE = {
  slug: "test-space",
  name: "テストスペース",
  descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
  capacity: 10,
  hourlyPrice: 1000,
  taxRateType: "STANDARD",
  mainImageUrl: "https://example.com/images/main.jpg",
  locationId: "11111111-1111-4111-8111-111111111111",
};

const VALID_LOCATION = {
  name: "施設名",
  slug: "test-location",
  address: "東京都渋谷区1-2-3",
  accessLines: [{ value: "渋谷駅から徒歩5分" }],
  imageUrl: "https://example.com/image.jpg",
  imageUrls: [],
  isPublished: false,
  businessHours: {
    monday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "17:00" }],
    },
    tuesday: { isOpen: false, slots: [] },
    wednesday: { isOpen: false, slots: [] },
    thursday: { isOpen: false, slots: [] },
    friday: { isOpen: false, slots: [] },
    saturday: { isOpen: false, slots: [] },
    sunday: { isOpen: false, slots: [] },
  },
};

describe("管理フォーム必須欄の未入力メッセージ", () => {
  expectUndefinedJapaneseMessage(
    smartLockDeviceFormSchema,
    {
      locationId: "00000000-0000-4000-8000-000000000001",
      deviceId: "AA:BB:CC:DD:EE:FF",
      deviceName: "玄関 Keypad",
      deviceType: SmartLockDeviceType.KEYPAD,
      isActive: true,
    },
    "deviceId",
    "デバイスID（MACアドレス）を入力してください",
  );
  expectUndefinedJapaneseMessage(
    smartLockDeviceFormSchema,
    {
      locationId: "00000000-0000-4000-8000-000000000001",
      deviceId: "AA:BB:CC:DD:EE:FF",
      deviceName: "玄関 Keypad",
      deviceType: SmartLockDeviceType.KEYPAD,
      isActive: true,
    },
    "deviceName",
    "デバイス名を入力してください",
  );

  expectUndefinedJapaneseMessage(
    spaceFormSchema,
    VALID_SPACE,
    "slug",
    "スラッグを入力してください",
  );
  expectUndefinedJapaneseMessage(
    spaceFormSchema,
    VALID_SPACE,
    "name",
    "名前を入力してください",
  );
  expectUndefinedJapaneseMessage(
    spaceFormSchema,
    VALID_SPACE,
    "mainImageUrl",
    "メイン画像URLを入力してください",
  );
  expectUndefinedJapaneseMessage(
    spaceFormSchema,
    VALID_SPACE,
    "locationId",
    "拠点を選択してください",
  );

  expectUndefinedJapaneseMessage(
    faqCategoryFormSchema,
    { name: "よくある質問", slug: "general-faq", isActive: true },
    "name",
    "カテゴリ名を入力してください",
  );
  expectUndefinedJapaneseMessage(
    faqCategoryFormSchema,
    { name: "よくある質問", slug: "general-faq", isActive: true },
    "slug",
    "スラッグを入力してください",
  );
  expectUndefinedJapaneseMessage(
    faqItemFormSchema,
    {
      categoryId: "123e4567-e89b-12d3-a456-426614174000",
      question: "これはテスト質問ですか？",
      answer: "はい、これはテスト回答です。",
      isPublished: true,
    },
    "question",
    "質問を入力してください",
  );
  expectUndefinedJapaneseMessage(
    faqItemFormSchema,
    {
      categoryId: "123e4567-e89b-12d3-a456-426614174000",
      question: "これはテスト質問ですか？",
      answer: "はい、これはテスト回答です。",
      isPublished: true,
    },
    "answer",
    "回答を入力してください",
  );

  expectUndefinedJapaneseMessage(
    createNewsSchema,
    {
      slug: "sample-news",
      title: "サンプルニュース",
      contentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      isPublished: false,
    },
    "slug",
    "スラッグを入力してください",
  );
  expectUndefinedJapaneseMessage(
    createNewsSchema,
    {
      slug: "sample-news",
      title: "サンプルニュース",
      contentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      isPublished: false,
    },
    "title",
    "タイトルは必須です",
  );

  expectUndefinedJapaneseMessage(
    createPostSchema,
    {
      title: "投稿記事タイトル",
      slug: "sample-post",
      excerpt: "記事の抜粋です",
      contentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      thumbnailUrl: "https://example.com/image.jpg",
      categoryId: "123e4567-e89b-12d3-a456-426614174000",
      tags: [],
    },
    "title",
    "タイトルは必須です",
  );
  expectUndefinedJapaneseMessage(
    createPostSchema,
    {
      title: "投稿記事タイトル",
      slug: "sample-post",
      excerpt: "記事の抜粋です",
      contentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      thumbnailUrl: "https://example.com/image.jpg",
      categoryId: "123e4567-e89b-12d3-a456-426614174000",
      tags: [],
    },
    "slug",
    "スラッグは必須です",
  );
  expectUndefinedJapaneseMessage(
    createPostSchema,
    {
      title: "投稿記事タイトル",
      slug: "sample-post",
      excerpt: "記事の抜粋です",
      contentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      thumbnailUrl: "https://example.com/image.jpg",
      categoryId: "123e4567-e89b-12d3-a456-426614174000",
      tags: [],
    },
    "excerpt",
    "抜粋は必須です",
  );
  expectUndefinedJapaneseMessage(
    createPostSchema,
    {
      title: "投稿記事タイトル",
      slug: "sample-post",
      excerpt: "記事の抜粋です",
      contentJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
      thumbnailUrl: "https://example.com/image.jpg",
      categoryId: "123e4567-e89b-12d3-a456-426614174000",
      tags: [],
    },
    "thumbnailUrl",
    "サムネイルURLは必須です",
  );
  expectUndefinedJapaneseMessage(
    postCategorySchema,
    { name: "カテゴリ", slug: "category" },
    "name",
    "カテゴリ名は必須です",
  );
  expectUndefinedJapaneseMessage(
    postCategorySchema,
    { name: "カテゴリ", slug: "category" },
    "slug",
    "スラッグは必須です",
  );
  expectUndefinedJapaneseMessage(
    postTagSchema,
    { name: "タグ", slug: "tag" },
    "name",
    "タグ名は必須です",
  );
  expectUndefinedJapaneseMessage(
    postTagSchema,
    { name: "タグ", slug: "tag" },
    "slug",
    "スラッグは必須です",
  );

  expectUndefinedJapaneseMessage(
    locationFormSchema,
    VALID_LOCATION,
    "name",
    "名前を入力してください",
  );
  expectUndefinedJapaneseMessage(
    locationFormSchema,
    VALID_LOCATION,
    "slug",
    "スラッグは必須です",
  );
  expectUndefinedJapaneseMessage(
    locationFormSchema,
    VALID_LOCATION,
    "address",
    "住所を入力してください",
  );
  expectUndefinedJapaneseMessage(
    locationFormSchema,
    VALID_LOCATION,
    "imageUrl",
    "建物画像URLを入力してください",
  );

  test("accessLines.value が未入力なら「経路を入力してください」", () => {
    expect(locationFormSchema.safeParse(VALID_LOCATION).success).toBe(true);
    const result = locationFormSchema.safeParse({
      ...VALID_LOCATION,
      accessLines: [{ value: undefined }],
    });
    expect(result.success).toBe(false);
    const issue = result.success
      ? undefined
      : result.error.issues.find(
          (item) => item.path[0] === "accessLines" && item.path[2] === "value",
        );
    expect(issue?.message).toBe("経路を入力してください");
  });

  test("openTime が未入力なら「開店時刻を入力してください」", () => {
    expect(locationFormSchema.safeParse(VALID_LOCATION).success).toBe(true);
    const result = locationFormSchema.safeParse({
      ...VALID_LOCATION,
      businessHours: {
        ...VALID_LOCATION.businessHours,
        monday: {
          isOpen: true,
          slots: [{ openTime: undefined, closeTime: "17:00" }],
        },
      },
    });
    expect(result.success).toBe(false);
    const issue = result.success
      ? undefined
      : result.error.issues.find((item) => item.path.includes("openTime"));
    expect(issue?.message).toBe("開店時刻を入力してください");
  });

  test("closeTime が未入力なら「閉店時刻を入力してください」", () => {
    expect(locationFormSchema.safeParse(VALID_LOCATION).success).toBe(true);
    const result = locationFormSchema.safeParse({
      ...VALID_LOCATION,
      businessHours: {
        ...VALID_LOCATION.businessHours,
        monday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: undefined }],
        },
      },
    });
    expect(result.success).toBe(false);
    const issue = result.success
      ? undefined
      : result.error.issues.find((item) => item.path.includes("closeTime"));
    expect(issue?.message).toBe("閉店時刻を入力してください");
  });
});
