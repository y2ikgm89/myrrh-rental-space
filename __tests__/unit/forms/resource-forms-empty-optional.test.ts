/**
 * 回帰テスト: リソース管理フォームの「任意フィールド空欄保存」（conform 整合）
 *
 * 顧客 / クーポン / FAQ / ページ / 分類(taxonomy) / スペースカテゴリ /
 * レビュー返信 / ブロック日 の conform フォームについて、必須項目のみ埋めて
 * 任意項目を空欄にした FormData が parseWithZod で status==="success" になることを
 * 固定する（conform の空→undefined 変換で任意項目が弾かれないことの実測ガード）。
 *
 * event / space / location / reservation の複雑フォーム（cross-field refine・多数の
 * 必須項目）は精読で全任意項目の `.optional()`/`.nullish()`/preprocess 保護を確認済み。
 */
import { describe, test, expect } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import { CouponType } from "@/shared/lib/validations/enums/prisma-types";
import { blockedDateTypeSchema } from "@/shared/lib/validations/blocked-date";
import { customerFormSchema } from "@/shared/lib/validations/customer";
import { couponFormSchema } from "@/shared/lib/validations/coupon";
import { locationFormSchema } from "@/shared/lib/validations/location";
import { spaceCategoryFormSchema } from "@/shared/lib/validations/space-category";
import { reviewReplySchema } from "@/shared/lib/validations/review";
import {
  createPageSchema,
  updatePageSeoSchema,
} from "@/shared/lib/validations/page";
import {
  faqItemFormSchema,
  faqCategoryFormSchema,
} from "@/admin/lib/validations/faq";
import { scopedBlockedDateFormSchema } from "@/admin/lib/validations/blocked-date";
import {
  categoryFormSchema,
  tagFormSchema,
} from "@/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/taxonomy-schema";
import {
  createReservationFormSchema,
  updateReservationFormSchema,
} from "@/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema";
import {
  eventFormSchema,
  EVENT_FORM_NONE_VALUE,
} from "@/app/(admin)/admin/(dashboard)/events/_components/event-form-schema";
import { spaceFormSchema } from "@/admin/lib/validations/space";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import {
  EventScheduleMode,
  EventStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import type { z } from "zod";

const EMPTY_DESC_TICKET = JSON.stringify([
  {
    name: "一般",
    description: null,
    price: 1000,
    capacity: null,
    unitSize: 1,
    isAvailable: true,
  },
]);

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

const UUID = "00000000-0000-4000-8000-000000000000";

function expectSuccess(schema: z.ZodType, fd: FormData, label: string): void {
  const submission = parseWithZod(fd, { schema });
  if (submission.status !== "success") {
    console.log(`${label} errors:`, JSON.stringify(submission.reply().error));
  }
  expect(submission.status).toBe("success");
}

function expectError(schema: z.ZodType, fd: FormData): void {
  const submission = parseWithZod(fd, { schema });
  expect(submission.status).toBe("error");
}

describe("リソースフォーム: 任意空欄保存（conform 整合）", () => {
  test("customer: 任意（カナ/会社/住所/メモ）空欄で保存できる", () => {
    expectSuccess(
      customerFormSchema,
      form({
        lastName: "山田",
        firstName: "太郎",
        email: "taro@example.com",
        lastNameKana: "",
        firstNameKana: "",
        companyName: "",
        phoneNumber: "",
        postalCode: "",
        prefecture: "",
        city: "",
        streetAddress: "",
        building: "",
        notes: "",
      }),
      "customer",
    );
  });

  test("coupon: 任意（説明/上限/期限）空欄で保存できる", () => {
    expectSuccess(
      couponFormSchema,
      form({
        code: "WELCOME10",
        name: "ウェルカムクーポン",
        type: String(Object.values(CouponType)[0]),
        discountValue: "10",
        validFrom: "2026-07-01T09:00",
        description: "",
        minReservationAmount: "",
        maxDiscountAmount: "",
        validUntil: "",
        usageLimit: "",
      }),
      "coupon",
    );
  });

  test("faqItem: 必須のみで保存できる", () => {
    expectSuccess(
      faqItemFormSchema,
      form({ categoryId: UUID, question: "質問", answer: "回答" }),
      "faqItem",
    );
  });

  test("faqItem: 旧 order hidden input は拒否する", () => {
    expectError(
      faqItemFormSchema,
      form({
        categoryId: UUID,
        question: "質問",
        answer: "回答",
        order: "0",
      }),
    );
  });

  test("faqCategory: 任意（説明/アイコン）空欄で保存できる", () => {
    expectSuccess(
      faqCategoryFormSchema,
      form({ name: "一般", slug: "general", description: "", icon: "" }),
      "faqCategory",
    );
  });

  test("faqCategory: 旧 order hidden input は拒否する", () => {
    expectError(
      faqCategoryFormSchema,
      form({
        name: "一般",
        slug: "general",
        description: "",
        icon: "",
        order: "0",
      }),
    );
  });

  test("createPage: 必須のみで保存できる", () => {
    expectSuccess(
      createPageSchema,
      form({ slug: "about", title: "会社概要" }),
      "createPage",
    );
  });

  test("updatePageSeo: 任意（meta/ogp）空欄で保存できる", () => {
    expectSuccess(
      updatePageSeoSchema,
      form({
        title: "タイトル",
        metaDescription: "",
        metaKeywords: "",
        ogpTitle: "",
        ogpDescription: "",
        ogpImageUrl: "",
      }),
      "updatePageSeo",
    );
  });

  test("taxonomy category: 任意（説明/SEO/OGP）空欄で保存できる", () => {
    expectSuccess(
      categoryFormSchema,
      form({
        name: "ニュース",
        slug: "news",
        description: "",
        metaTitle: "",
        metaDescription: "",
        ogpImageUrl: "",
      }),
      "taxonomy-category",
    );
  });

  test("taxonomy category: 旧 order hidden input は拒否する", () => {
    expectError(
      categoryFormSchema,
      form({
        name: "ニュース",
        slug: "news",
        description: "",
        metaTitle: "",
        metaDescription: "",
        ogpImageUrl: "",
        order: "0",
      }),
    );
  });

  test("taxonomy tag: 任意空欄で保存できる", () => {
    expectSuccess(
      tagFormSchema,
      form({
        name: "お知らせ",
        slug: "info",
        description: "",
        metaTitle: "",
        metaDescription: "",
        ogpImageUrl: "",
      }),
      "taxonomy-tag",
    );
  });

  test("taxonomy tag: 旧 order hidden input は拒否する", () => {
    expectError(
      tagFormSchema,
      form({
        name: "お知らせ",
        slug: "info",
        description: "",
        metaTitle: "",
        metaDescription: "",
        ogpImageUrl: "",
        order: "0",
      }),
    );
  });

  test("spaceCategory: 任意（説明/アイコン/色）空欄で保存できる", () => {
    expectSuccess(
      spaceCategoryFormSchema,
      form({ name: "会議室", description: "", icon: "", color: "" }),
      "spaceCategory",
    );
  });

  test("spaceCategory: 旧 sortOrder hidden input は拒否する", () => {
    expectError(
      spaceCategoryFormSchema,
      form({
        name: "会議室",
        description: "",
        icon: "",
        color: "",
        sortOrder: "0",
      }),
    );
  });

  test("location: 必須のみで保存できる", () => {
    expectSuccess(
      locationFormSchema,
      form({
        name: "表参道",
        slug: "omotesando",
        address: "東京都渋谷区神宮前1-1-1",
        imageUrl: "https://example.com/location.jpg",
      }),
      "location",
    );
  });

  test("location: 旧 sortOrder hidden input は拒否する", () => {
    expectError(
      locationFormSchema,
      form({
        name: "表参道",
        slug: "omotesando",
        address: "東京都渋谷区神宮前1-1-1",
        imageUrl: "https://example.com/location.jpg",
        sortOrder: "0",
      }),
    );
  });

  test("reviewReply: 必須のみで保存できる", () => {
    expectSuccess(
      reviewReplySchema,
      form({ reviewId: UUID, replyBody: "ご来店ありがとうございました" }),
      "reviewReply",
    );
  });

  test("blockedDate: reason 空欄で保存できる", () => {
    expectSuccess(
      scopedBlockedDateFormSchema,
      form({
        startDate: "2026-07-01",
        endDate: "2026-07-02",
        reason: "",
        type: blockedDateTypeSchema.options[0],
      }),
      "blockedDate",
    );
  });

  test("予約作成(既存顧客): 料金/クーポン/メモ空欄で保存できる", () => {
    expectSuccess(
      createReservationFormSchema,
      form({
        mode: "existing",
        customerId: UUID,
        spaceId: UUID,
        date: "2026-07-01",
        startTime: "10:00",
        endTime: "12:00",
        totalPrice: "",
        couponCode: "",
        notes: "",
        sendEmail: "",
      }),
      "createReservation",
    );
  });

  test("予約編集: 料金/クーポン/メモ空欄で保存できる", () => {
    expectSuccess(
      updateReservationFormSchema,
      form({
        spaceId: UUID,
        date: "2026-07-01",
        startTime: "10:00",
        endTime: "12:00",
        customerId: UUID,
        totalPrice: "",
        couponCode: "",
        notes: "",
      }),
      "updateReservation",
    );
  });

  // descriptionHtml は server が descriptionJson から派生する。
  test("space: descriptionJson のみで保存できる", () => {
    expectSuccess(
      spaceFormSchema,
      form({
        slug: "meeting-room",
        name: "会議室A",
        descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
        addressDetail: "",
        capacity: "10",
        area: "",
        hourlyPrice: "0",
        dailyPrice: "",
        mainImageUrl: "https://example.com/a.jpg",
        facilities: "",
        locationId: UUID,
        categoryId: "",
        discountValue: "",
        metaDescription: "",
        metaKeywords: "",
        ogpTitle: "",
        ogpDescription: "",
        ogpImageUrl: "",
      }),
      "space",
    );
  });

  test("event: descriptionJson のみで保存できる", () => {
    expectSuccess(
      eventFormSchema,
      form({
        title: "イベント",
        slug: "event-1",
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
        thumbnailUrl: "",
        slots: JSON.stringify([
          {
            startAt: "2026-07-01T10:00",
            endAt: "2026-07-01T12:00",
            capacity: 10,
          },
        ]),
        registrationDeadline: "",
        tickets: EMPTY_DESC_TICKET,
        addressDetail: "",
        locationId: EVENT_FORM_NONE_VALUE,
        spaceId: EVENT_FORM_NONE_VALUE,
        status: String(Object.values(EventStatus)[0]),
        registrationOpen: "",
        ogpImageUrl: "",
        ogpTitle: "",
        ogpDescription: "",
        metaDescription: "",
        metaKeywords: "",
      }),
      "event",
    );
  });

  test("event: チケット JSON の旧 sortOrder は拒否する", () => {
    expectError(
      eventFormSchema,
      form({
        title: "イベント",
        slug: "event-1",
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
        thumbnailUrl: "",
        slots: JSON.stringify([
          {
            startAt: "2026-07-01T10:00",
            endAt: "2026-07-01T12:00",
            capacity: 10,
          },
        ]),
        registrationDeadline: "",
        tickets: JSON.stringify([
          {
            name: "一般",
            description: null,
            price: 1000,
            capacity: null,
            unitSize: 1,
            sortOrder: 0,
            isAvailable: true,
          },
        ]),
        addressDetail: "",
        locationId: EVENT_FORM_NONE_VALUE,
        spaceId: EVENT_FORM_NONE_VALUE,
        status: String(Object.values(EventStatus)[0]),
        registrationOpen: "",
        ogpImageUrl: "",
        ogpTitle: "",
        ogpDescription: "",
        metaDescription: "",
        metaKeywords: "",
      }),
    );
  });
});
