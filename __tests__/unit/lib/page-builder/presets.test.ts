import { describe, expect, test } from "bun:test";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";
import {
  insertPageBuilderPreset,
  PAGE_BUILDER_PRESET_OPTIONS,
  type PageBuilderPresetNodeIdFactory,
} from "@/shared/lib/page-builder/presets";
import { pageBuilderDocumentSchema } from "@/shared/lib/page-builder/schema";

function createSequentialPresetIdFactory(): PageBuilderPresetNodeIdFactory {
  let sequence = 0;
  return (type, role) => {
    sequence += 1;
    return `${type}-${role}-${sequence}`;
  };
}

describe("page-builder presets", () => {
  test("PAGE_BUILDER_PRESET_OPTIONS は公開する preset type を網羅する", () => {
    expect(PAGE_BUILDER_PRESET_OPTIONS.map((option) => option.value)).toEqual([
      "hero-intro",
      "photo-hero",
      "service-list",
      "amenity-grid",
      "usage-steps",
      "pricing-grid",
      "access-map",
      "faq-list",
      "reservation-cta",
      "contact-form",
    ]);
  });

  test("insertPageBuilderPreset は hero preset を親の末尾に挿入する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "hero-intro",
      "root",
      createSequentialPresetIdFactory(),
    );

    expect(insertedId).toBe("frame-hero-1");
    expect(document.nodes["root"]?.children).toEqual([
      "frame-main",
      "frame-hero-1",
    ]);
    expect(document.nodes["frame-hero-1"]?.children).toEqual([
      "text-hero-eyebrow-2",
      "text-hero-title-3",
      "text-hero-body-4",
      "button-hero-cta-5",
    ]);
    expect(document.nodes["text-hero-title-3"]?.parentId).toBe("frame-hero-1");
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("photo-hero preset は画像 placeholder とコピー枠を grid 配下に配置する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "photo-hero",
      "root",
      createSequentialPresetIdFactory(),
    );

    const imageNode = document.nodes["image-photo-hero-image-8"];
    if (!imageNode || imageNode.type !== "image") {
      throw new Error("photo hero image node is missing");
    }

    expect(insertedId).toBe("frame-photo-hero-1");
    expect(document.nodes["frame-photo-hero-1"]?.children).toEqual([
      "grid-photo-hero-grid-2",
    ]);
    expect(document.nodes["grid-photo-hero-grid-2"]?.children).toEqual([
      "frame-photo-hero-copy-3",
      "image-photo-hero-image-8",
    ]);
    expect(imageNode.content.mediaId).toBeNull();
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("insertPageBuilderPreset は children を持てない node への挿入を拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "contact-form",
      "text-title",
      createSequentialPresetIdFactory(),
    );

    expect(insertedId).toBeNull();
    expect(document.nodes["contact-form-1"]).toBeUndefined();
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("service-list preset はカードの親子関係を保つ", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "service-list",
      "frame-main",
      createSequentialPresetIdFactory(),
    );

    expect(insertedId).toBe("frame-services-1");
    expect(document.nodes["frame-main"]?.children).toContain(
      "frame-services-1",
    );
    expect(document.nodes["frame-services-1"]?.children).toEqual([
      "text-services-title-2",
      "text-services-lead-3",
      "grid-services-grid-4",
    ]);
    expect(document.nodes["grid-services-grid-4"]?.type).toBe("grid");
    expect(document.nodes["grid-services-grid-4"]?.children).toEqual([
      "frame-service-card-5",
      "frame-service-card-8",
      "frame-service-card-11",
    ]);
    expect(document.nodes["frame-service-card-5"]?.parentId).toBe(
      "grid-services-grid-4",
    );
    expect(document.nodes["text-service-card-title-6"]?.parentId).toBe(
      "frame-service-card-5",
    );
    expect(document.nodes["frame-service-card-8"]?.parentId).toBe(
      "grid-services-grid-4",
    );
    expect(document.nodes["frame-service-card-11"]?.parentId).toBe(
      "grid-services-grid-4",
    );
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("amenity-grid preset は設備カードを grid 配下に配置する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "amenity-grid",
      "root",
      createSequentialPresetIdFactory(),
    );

    expect(insertedId).toBe("frame-amenities-1");
    expect(document.nodes["frame-amenities-1"]?.children).toEqual([
      "text-amenities-title-2",
      "text-amenities-lead-3",
      "grid-amenities-grid-4",
    ]);
    expect(document.nodes["grid-amenities-grid-4"]?.children).toEqual([
      "frame-amenity-card-5",
      "frame-amenity-card-8",
      "frame-amenity-card-11",
      "frame-amenity-card-14",
    ]);
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("usage-steps preset は利用手順を3ステップで配置する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "usage-steps",
      "root",
      createSequentialPresetIdFactory(),
    );

    expect(insertedId).toBe("frame-usage-steps-1");
    expect(document.nodes["frame-usage-steps-1"]?.children).toEqual([
      "text-usage-steps-title-2",
      "text-usage-steps-lead-3",
      "grid-usage-steps-grid-4",
    ]);
    expect(document.nodes["grid-usage-steps-grid-4"]?.children).toEqual([
      "frame-usage-step-5",
      "frame-usage-step-9",
      "frame-usage-step-13",
    ]);
    expect(document.nodes["frame-usage-step-5"]?.children).toEqual([
      "text-usage-step-number-6",
      "text-usage-step-title-7",
      "text-usage-step-body-8",
    ]);
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("insertPageBuilderPreset は grid node の子として挿入できる", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const idFactory = createSequentialPresetIdFactory();

    insertPageBuilderPreset(document, "service-list", "root", idFactory);
    const insertedId = insertPageBuilderPreset(
      document,
      "hero-intro",
      "grid-services-grid-4",
      idFactory,
    );

    expect(insertedId).toBe("frame-hero-14");
    expect(document.nodes["grid-services-grid-4"]?.children).toContain(
      "frame-hero-14",
    );
    expect(document.nodes["frame-hero-14"]?.parentId).toBe(
      "grid-services-grid-4",
    );
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("pricing-grid preset は料金カードを grid 配下に配置する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "pricing-grid",
      "root",
      createSequentialPresetIdFactory(),
    );

    expect(insertedId).toBe("frame-pricing-1");
    expect(document.nodes["frame-pricing-1"]?.children).toEqual([
      "text-pricing-title-2",
      "text-pricing-lead-3",
      "grid-pricing-grid-4",
    ]);
    expect(document.nodes["grid-pricing-grid-4"]?.children).toEqual([
      "frame-pricing-card-5",
      "frame-pricing-card-9",
      "frame-pricing-card-13",
    ]);
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("access-map preset は地図 embed と案内カードを含む", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "access-map",
      "root",
      createSequentialPresetIdFactory(),
    );

    const mapNode = document.nodes["embed-access-map-11"];
    if (!mapNode || mapNode.type !== "embed") {
      throw new Error("access map embed node is missing");
    }

    expect(insertedId).toBe("frame-access-1");
    expect(document.nodes["grid-access-grid-4"]?.children).toEqual([
      "frame-access-info-5",
      "embed-access-map-11",
    ]);
    expect(mapNode.content.provider).toBe("google-maps");
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("faq-list preset は FAQ item を stack section に配置する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "faq-list",
      "root",
      createSequentialPresetIdFactory(),
    );

    expect(insertedId).toBe("frame-faq-1");
    expect(document.nodes["frame-faq-1"]?.children).toEqual([
      "text-faq-title-2",
      "text-faq-lead-3",
      "frame-faq-item-4",
      "frame-faq-item-7",
      "frame-faq-item-10",
    ]);
    expect(document.nodes["frame-faq-item-4"]?.children).toEqual([
      "text-faq-question-5",
      "text-faq-answer-6",
    ]);
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("reservation-cta preset は予約導線ボタンを含む", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "reservation-cta",
      "root",
      createSequentialPresetIdFactory(),
    );

    const buttonNode = document.nodes["button-reservation-cta-5"];
    if (!buttonNode || buttonNode.type !== "button") {
      throw new Error("reservation cta button node is missing");
    }

    expect(insertedId).toBe("frame-reservation-1");
    expect(document.nodes["frame-reservation-1"]?.children).toEqual([
      "text-reservation-eyebrow-2",
      "text-reservation-title-3",
      "text-reservation-lead-4",
      "button-reservation-cta-5",
    ]);
    expect(buttonNode.content.url).toBe("/reservation");
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });

  test("contact-form preset は form node を含む", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const insertedId = insertPageBuilderPreset(
      document,
      "contact-form",
      "root",
      createSequentialPresetIdFactory(),
    );

    expect(insertedId).toBe("frame-contact-1");
    expect(document.nodes["frame-contact-1"]?.children).toEqual([
      "text-contact-title-2",
      "text-contact-lead-3",
      "form-contact-form-4",
    ]);
    expect(document.nodes["form-contact-form-4"]?.type).toBe("form");
    expect(pageBuilderDocumentSchema.safeParse(document).success).toBe(true);
  });
});
