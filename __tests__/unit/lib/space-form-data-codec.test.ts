import { describe, expect, test } from "bun:test";
import { spaceFormSchema } from "@/admin/lib/validations/space";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@generated/prisma/enums";
import {
  SPACE_FORM_META_CLIENT_NONCE,
  SPACE_FORM_META_INTENT,
  SPACE_FORM_META_SPACE_ID,
  parseSpaceFormFromFormData,
  readSpaceFormActionMeta,
  spaceFormDataToFormData,
} from "@/admin/lib/space-form-data-codec";

/** `defaultSpaceFormValues` は空スラッグ等で `spaceFormSchema` に通らないため、テスト用に最小の合法値を組み立てる */
function minimalValidSpaceFormPayload() {
  const parsed = spaceFormSchema.safeParse({
    slug: "demo-space",
    name: "デモスペース",
    description: "12345678901234567890",
    addressDetail: "",
    access: "",
    capacity: 10,
    area: null,
    hourlyPrice: 1000,
    dailyPrice: null,
    mainImageUrl: "https://example.com/space.jpg",
    imageUrls: [],
    facilities: [],
    isPublished: false,
    reviewsEnabled: true,
    termsId: null,
    locationId: "22222222-2222-4222-8222-222222222222",
    categoryId: null,
    discountType: DiscountType.none,
    discountValue: null,
    durationDiscountOverride: DurationDiscountOverride.inherit,
    taxRateType: TaxRateType.standard,
    metaDescription: null,
    metaKeywords: null,
    ogpTitle: null,
    ogpDescription: null,
    ogpImageUrl: null,
  });
  expect(parsed.success).toBe(true);
  if (!parsed.success) {
    throw new Error("fixture parse failed");
  }
  return parsed.data;
}

describe("space-form-data-codec", () => {
  test("roundtrip: SpaceFormData → FormData → parse matches spaceFormSchema", () => {
    const parsedInput = minimalValidSpaceFormPayload();

    const fd = spaceFormDataToFormData(parsedInput, {
      intent: "create",
      clientNonce: 7,
    });

    const meta = readSpaceFormActionMeta(fd);
    expect(meta.intent).toBe("create");
    expect(meta.spaceId).toBe(null);
    expect(meta.clientNonce).toBe(7);

    const again = parseSpaceFormFromFormData(fd);
    expect(again.success).toBe(true);
    if (!again.success) return;

    expect(again.data.slug).toBe(parsedInput.slug);
    expect(again.data.imageUrls).toEqual(parsedInput.imageUrls);
    expect(again.data.facilities).toEqual(parsedInput.facilities);
    expect(again.data.isPublished).toBe(parsedInput.isPublished);
    expect(again.data.reviewsEnabled).toBe(parsedInput.reviewsEnabled);
  });

  test("parse rejects invalid numeric field with NaN from codec", () => {
    const parsedInput = minimalValidSpaceFormPayload();

    const fd = spaceFormDataToFormData(parsedInput, {
      intent: "update",
      spaceId: "00000000-0000-4000-8000-000000000001",
      clientNonce: 1,
    });
    fd.set("capacity", "not-a-number");

    const again = parseSpaceFormFromFormData(fd);
    expect(again.success).toBe(false);
  });

  test("readSpaceFormActionMeta reads intent, spaceId, and client nonce", () => {
    const fd = new FormData();
    fd.set(SPACE_FORM_META_INTENT, "update");
    fd.set(SPACE_FORM_META_SPACE_ID, "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee");
    fd.set(SPACE_FORM_META_CLIENT_NONCE, "42");

    const meta = readSpaceFormActionMeta(fd);
    expect(meta.intent).toBe("update");
    expect(meta.spaceId).toBe("aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee");
    expect(meta.clientNonce).toBe(42);
  });
});
