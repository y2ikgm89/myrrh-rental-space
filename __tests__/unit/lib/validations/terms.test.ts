/**
 * 利用規約バリデーションテスト
 *
 * src/lib/validations/terms.ts のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import {
  createTermsSchema,
  updateTermsSchema,
  createTermsVersionSchema,
  publishTermsVersionSchema,
  updateTermsVersionSchema,
  recordTermsAgreementSchema,
  getTermsForSpaceSchema,
  agreeToTermsSchema,
  parseTermsType,
  getTermsTypeDefaults,
  serializeTermsWithVersion,
  TERMS_TYPES,
} from "@/shared/lib/validations/terms";
import { isValidTermsType } from "@/shared/lib/validations/enums/guards";
import type { TermsWithVersion } from "@/shared/lib/validations/terms";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

const VALID_LEXICAL_JSON = EMPTY_LEXICAL_EDITOR_STATE_JSON;

// 有効な規約作成データ
const VALID_CREATE_TERMS = {
  type: "TERMS_OF_USE" as const,
  title: "利用規約",
  slug: "terms-of-use",
  isActive: true,
};

describe("createTermsSchema", () => {
  describe("正常系", () => {
    test("有効なデータは検証を通過", () => {
      const result = createTermsSchema.safeParse(VALID_CREATE_TERMS);
      expect(result.success).toBe(true);
    });

    test("デフォルト値が適用される", () => {
      const result = createTermsSchema.safeParse({
        type: "PRIVACY_POLICY",
        title: "プライバシーポリシー",
        slug: "privacy",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isActive).toBe(true);
      }
    });
  });

  describe("type", () => {
    test("有効なTermsType値は許可", () => {
      const validTypes = [
        "TERMS_OF_USE",
        "PRIVACY_POLICY",
        "CANCELLATION",
        "PAYMENT",
        "CUSTOM",
      ];

      for (const type of validTypes) {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS,
          type,
        });
        expect(result.success).toBe(true);
      }
    });

    test("無効なtype値はエラー", () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        type: "INVALID",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("title", () => {
    test("空文字はエラー", () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        title: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("タイトル");
      }
    });

    test("100文字超過はエラー", () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        title: "あ".repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("100文字以内");
      }
    });

    test("100文字ちょうどは許可", () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        title: "あ".repeat(100),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("slug", () => {
    test("空文字はエラー", () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        slug: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("スラッグ");
      }
    });

    test("50文字超過はエラー", () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        slug: "a".repeat(51),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("50文字以内");
      }
    });

    test("無効なスラッグ形式はエラー", () => {
      const invalidSlugs = ["Test", "test_slug", "test slug", "テスト"];

      for (const slug of invalidSlugs) {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS,
          slug,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain(
            "小文字英数字とハイフン",
          );
        }
      }
    });

    test("有効なスラッグ形式は許可", () => {
      const validSlugs = [
        "terms",
        "terms-of-use",
        "privacy-policy-2024",
        "123",
      ];

      for (const slug of validSlugs) {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS,
          slug,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("isActive", () => {
    test("true/falseは許可", () => {
      for (const isActive of [true, false]) {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS,
          isActive,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});

describe("updateTermsSchema", () => {
  test("空オブジェクトは許可", () => {
    const result = updateTermsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("部分的な更新は許可", () => {
    const result = updateTermsSchema.safeParse({ title: "新しいタイトル" });
    expect(result.success).toBe(true);
  });

  test("全フィールド更新は許可", () => {
    const result = updateTermsSchema.safeParse(VALID_CREATE_TERMS);
    expect(result.success).toBe(true);
  });

  test("無効なtype値はエラー", () => {
    const result = updateTermsSchema.safeParse({ type: "INVALID" });
    expect(result.success).toBe(false);
  });
});

describe("createTermsVersionSchema", () => {
  describe("正常系", () => {
    test("有効なデータは検証を通過", () => {
      const result = createTermsVersionSchema.safeParse({
        termsId: "123e4567-e89b-12d3-a456-426614174000",
        contentJson: VALID_LEXICAL_JSON,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("termsId", () => {
    test("無効なUUIDはエラー", () => {
      const result = createTermsVersionSchema.safeParse({
        termsId: "invalid-uuid",
        contentJson: VALID_LEXICAL_JSON,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("規約IDが無効");
      }
    });
  });

  describe("contentJson", () => {
    test("空文字はエラー", () => {
      const result = createTermsVersionSchema.safeParse({
        termsId: "123e4567-e89b-12d3-a456-426614174000",
        contentJson: "",
      });
      expect(result.success).toBe(false);
    });

    test("無効なJSONはエラー", () => {
      const result = createTermsVersionSchema.safeParse({
        termsId: "123e4567-e89b-12d3-a456-426614174000",
        contentJson: "これは規約の内容です。",
      });
      expect(result.success).toBe(false);
    });

    test("rootプロパティがないJSONはエラー", () => {
      const result = createTermsVersionSchema.safeParse({
        termsId: "123e4567-e89b-12d3-a456-426614174000",
        contentJson: '{"data":"test"}',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("publishTermsVersionSchema", () => {
  test("有効なUUIDは許可", () => {
    const result = publishTermsVersionSchema.safeParse({
      versionId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  test("無効なUUIDはエラー", () => {
    const result = publishTermsVersionSchema.safeParse({
      versionId: "invalid-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("バージョンIDが無効");
    }
  });
});

describe("updateTermsVersionSchema", () => {
  test("有効なLexical JSONは許可", () => {
    const result = updateTermsVersionSchema.safeParse({
      contentJson: VALID_LEXICAL_JSON,
    });
    expect(result.success).toBe(true);
  });

  test("空文字はエラー", () => {
    const result = updateTermsVersionSchema.safeParse({
      contentJson: "",
    });
    expect(result.success).toBe(false);
  });

  test("無効なJSONはエラー", () => {
    const result = updateTermsVersionSchema.safeParse({
      contentJson: "更新されたコンテンツ",
    });
    expect(result.success).toBe(false);
  });
});

describe("recordTermsAgreementSchema", () => {
  const VALID_AGREEMENT = {
    termsId: "123e4567-e89b-12d3-a456-426614174000",
    versionId: "123e4567-e89b-12d3-a456-426614174001",
  };

  describe("正常系", () => {
    test("最小限のデータは検証を通過", () => {
      const result = recordTermsAgreementSchema.safeParse(VALID_AGREEMENT);
      expect(result.success).toBe(true);
    });

    test("全フィールド指定も許可", () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        reservationId: "123e4567-e89b-12d3-a456-426614174002",
        userId: "123e4567-e89b-12d3-a456-426614174003",
        guestName: "ゲスト",
        guestEmail: "guest@example.com",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("termsId", () => {
    test("無効なUUIDはエラー", () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        termsId: "invalid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("規約IDが無効");
      }
    });
  });

  describe("versionId", () => {
    test("無効なUUIDはエラー", () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        versionId: "invalid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("バージョンIDが無効");
      }
    });
  });

  describe("reservationId", () => {
    test("undefinedは許可", () => {
      const result = recordTermsAgreementSchema.safeParse(VALID_AGREEMENT);
      expect(result.success).toBe(true);
    });

    test("無効なUUIDはエラー", () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        reservationId: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("userId", () => {
    test("undefinedは許可", () => {
      const result = recordTermsAgreementSchema.safeParse(VALID_AGREEMENT);
      expect(result.success).toBe(true);
    });

    test("無効なUUIDはエラー", () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        userId: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("guestEmail", () => {
    test("undefinedは許可", () => {
      const result = recordTermsAgreementSchema.safeParse(VALID_AGREEMENT);
      expect(result.success).toBe(true);
    });

    test("無効なメールアドレスはエラー", () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        guestEmail: "invalid-email",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("getTermsForSpaceSchema", () => {
  test("有効なUUIDは許可", () => {
    const result = getTermsForSpaceSchema.safeParse({
      spaceId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  test("無効なUUIDはエラー", () => {
    const result = getTermsForSpaceSchema.safeParse({
      spaceId: "invalid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("スペースIDが無効");
    }
  });
});

describe("agreeToTermsSchema", () => {
  test("有効なUUID配列は許可", () => {
    const result = agreeToTermsSchema.safeParse({
      versionIds: [
        "123e4567-e89b-12d3-a456-426614174000",
        "123e4567-e89b-12d3-a456-426614174001",
      ],
    });
    expect(result.success).toBe(true);
  });

  test("空配列はエラー", () => {
    const result = agreeToTermsSchema.safeParse({
      versionIds: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("規約に同意");
    }
  });

  test("無効なUUIDを含むとエラー", () => {
    const result = agreeToTermsSchema.safeParse({
      versionIds: ["123e4567-e89b-12d3-a456-426614174000", "invalid"],
    });
    expect(result.success).toBe(false);
  });
});

describe("TERMS_TYPES", () => {
  test("規約タイプが正しく定義されている", () => {
    expect(TERMS_TYPES).toEqual([
      {
        value: "TERMS_OF_USE",
        label: "利用規約",
        defaultTitle: "利用規約",
        defaultSlug: "terms-of-use",
      },
      {
        value: "PRIVACY_POLICY",
        label: "プライバシーポリシー",
        defaultTitle: "プライバシーポリシー",
        defaultSlug: "privacy-policy",
      },
      {
        value: "CANCELLATION",
        label: "キャンセルポリシー",
        defaultTitle: "キャンセルポリシー",
        defaultSlug: "cancellation-policy",
      },
      {
        value: "PAYMENT",
        label: "支払い規約",
        defaultTitle: "支払い規約",
        defaultSlug: "payment-terms",
      },
      {
        value: "RENTAL_TERMS",
        label: "施設利用規約",
        defaultTitle: "施設利用規約",
        defaultSlug: "rental-terms",
      },
      {
        value: "CUSTOM",
        label: "カスタム規約",
        defaultTitle: "カスタム規約",
        defaultSlug: "custom-terms",
      },
    ]);
  });
});

// =============================================================================
// isValidTermsType
// =============================================================================

describe("isValidTermsType", () => {
  test("有効なTermsType値はtrueを返す", () => {
    const validTypes = [
      "TERMS_OF_USE",
      "PRIVACY_POLICY",
      "CANCELLATION",
      "PAYMENT",
      "RENTAL_TERMS",
      "CUSTOM",
    ];
    for (const type of validTypes) {
      expect(isValidTermsType(type)).toBe(true);
    }
  });

  test("無効な文字列はfalseを返す", () => {
    expect(isValidTermsType("INVALID")).toBe(false);
    expect(isValidTermsType("terms_of_use")).toBe(false);
    expect(isValidTermsType("")).toBe(false);
  });

  test("文字列以外はfalseを返す", () => {
    expect(isValidTermsType(null)).toBe(false);
    expect(isValidTermsType(undefined)).toBe(false);
    expect(isValidTermsType(123)).toBe(false);
    expect(isValidTermsType(true)).toBe(false);
    expect(isValidTermsType({})).toBe(false);
  });
});

// =============================================================================
// parseTermsType
// =============================================================================

describe("parseTermsType", () => {
  test("有効なTermsType値はそのまま返す", () => {
    expect(parseTermsType("TERMS_OF_USE")).toBe("TERMS_OF_USE");
    expect(parseTermsType("PRIVACY_POLICY")).toBe("PRIVACY_POLICY");
    expect(parseTermsType("CANCELLATION")).toBe("CANCELLATION");
    expect(parseTermsType("PAYMENT")).toBe("PAYMENT");
    expect(parseTermsType("CUSTOM")).toBe("CUSTOM");
  });

  test("無効な値はundefinedを返す", () => {
    expect(parseTermsType("INVALID")).toBeUndefined();
    expect(parseTermsType("")).toBeUndefined();
    expect(parseTermsType(null)).toBeUndefined();
    expect(parseTermsType(undefined)).toBeUndefined();
    expect(parseTermsType(123)).toBeUndefined();
  });
});

// =============================================================================
// getTermsTypeDefaults
// =============================================================================

describe("getTermsTypeDefaults", () => {
  test("TERMS_OF_USEのデフォルト値を返す", () => {
    const result = getTermsTypeDefaults("TERMS_OF_USE");
    expect(result).toEqual({ title: "利用規約", slug: "terms-of-use" });
  });

  test("PRIVACY_POLICYのデフォルト値を返す", () => {
    const result = getTermsTypeDefaults("PRIVACY_POLICY");
    expect(result).toEqual({
      title: "プライバシーポリシー",
      slug: "privacy-policy",
    });
  });

  test("CANCELLATIONのデフォルト値を返す", () => {
    const result = getTermsTypeDefaults("CANCELLATION");
    expect(result).toEqual({
      title: "キャンセルポリシー",
      slug: "cancellation-policy",
    });
  });

  test("PAYMENTのデフォルト値を返す", () => {
    const result = getTermsTypeDefaults("PAYMENT");
    expect(result).toEqual({ title: "支払い規約", slug: "payment-terms" });
  });

  test("CUSTOMのデフォルト値を返す", () => {
    const result = getTermsTypeDefaults("CUSTOM");
    expect(result).toEqual({ title: "カスタム規約", slug: "custom-terms" });
  });

  test("無効なtype値はnullを返す", () => {
    expect(getTermsTypeDefaults("INVALID")).toBeNull();
    expect(getTermsTypeDefaults("")).toBeNull();
  });
});

// =============================================================================
// serializeTermsWithVersion
// =============================================================================

describe("serializeTermsWithVersion", () => {
  test("nullを渡すとnullを返す", () => {
    expect(serializeTermsWithVersion(null)).toBeNull();
  });

  test("currentVersionがnullの場合も正しくシリアライズする", () => {
    const terms: TermsWithVersion = {
      id: "terms-1",
      type: "TERMS_OF_USE" as TermsWithVersion["type"],
      title: "利用規約",
      slug: "terms-of-use",
      isActive: true,
      requiredAtReservation: false,
      showInFooter: false,
      currentVersion: null,
      _count: { spaces: 0 },
    };
    const result = serializeTermsWithVersion(terms);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.id).toBe("terms-1");
      expect(result.type).toBe("TERMS_OF_USE");
      expect(result.title).toBe("利用規約");
      expect(result.slug).toBe("terms-of-use");
      expect(result.isActive).toBe(true);
      expect(result.currentVersion).toBeNull();
    }
  });

  test("currentVersionがある場合、DateをISO文字列に変換する", () => {
    const publishedAt = new Date("2026-01-15T10:30:00Z");
    const terms: TermsWithVersion = {
      id: "terms-2",
      type: "PRIVACY_POLICY" as TermsWithVersion["type"],
      title: "プライバシーポリシー",
      slug: "privacy-policy",
      isActive: true,
      requiredAtReservation: false,
      showInFooter: false,
      currentVersion: {
        id: "version-1",
        version: 1,
        contentHtml: "<p>ポリシー内容</p>",
        contentJson: VALID_LEXICAL_JSON,
        publishedAt,
      },
      _count: { spaces: 2 },
    };
    const result = serializeTermsWithVersion(terms);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.currentVersion).not.toBeNull();
      if (result.currentVersion) {
        expect(result.currentVersion.id).toBe("version-1");
        expect(result.currentVersion.version).toBe(1);
        expect(result.currentVersion.contentHtml).toBe("<p>ポリシー内容</p>");
        expect(result.currentVersion.publishedAt).toBe(
          "2026-01-15T10:30:00.000Z",
        );
        // publishedAtがstring型であること
        expect(typeof result.currentVersion.publishedAt).toBe("string");
      }
    }
  });

  test("Prisma enumがプレーン文字列に変換される", () => {
    const terms: TermsWithVersion = {
      id: "terms-3",
      type: "CUSTOM" as TermsWithVersion["type"],
      title: "カスタム規約",
      slug: "custom",
      isActive: false,
      requiredAtReservation: false,
      showInFooter: false,
      currentVersion: null,
      _count: { spaces: 0 },
    };
    const result = serializeTermsWithVersion(terms);
    if (result) {
      expect(typeof result.type).toBe("string");
      expect(result.type).toBe("CUSTOM");
    }
  });
});
