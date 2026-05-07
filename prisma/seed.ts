/**
 * Prisma Seed Script
 *
 * 初期データを作成する（Prisma 7 ベストプラクティス準拠）
 *
 * 使用方法:
 *   bun prisma/seed.ts                                      # 引数なし = --demo（migrate reset の既定）
 *   bun prisma/seed.ts --admin <email> <password> [name]  # 管理者のみ
 *   bun prisma/seed.ts --demo                              # デモデータ生成（既存スキップ）
 *   bun prisma/seed.ts --fresh <email> <password> [name]   # 全削除 + 再作成
 *   bun prisma/seed.ts --all <email> <password> [name]     # 全て生成
 *
 * 例:
 *   bun prisma/seed.ts --admin admin@example.com mypassword123 "Administrator"
 *   bun prisma/seed.ts --demo
 *   bun prisma/seed.ts --fresh admin@example.com mypassword123
 *   bun prisma/seed.ts --all admin@example.com mypassword123
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  Prisma,
  Role,
  CustomerType,
  EventStatus,
  RegistrationStatus,
} from "../generated/prisma/client";
import { createAppPrismaClient } from "@/shared/db/create-app-prisma-client";
import { hashPassword } from "better-auth/crypto";
import { createAdminGateToken } from "@/shared/lib/admin-login-gate";
import { DEFAULT_PAGE_SECTIONS } from "../src/shared/lib/constants/default-page-sections";
import { DEFAULT_PAGE_HERO } from "../src/shared/lib/sections/definitions/page-hero";
import {
  buildInitialFeatureModules,
  parseDisabledFeatureModulesEnv,
} from "../src/shared/lib/features/registry";
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "../src/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "../src/shared/lib/lexical/html-to-plain-text";

/**
 * seed 用ヘルパー: プレーンテキストから 3 カラム同時生成（Lexical JSON / HTML / Plain）。
 * 改行は単一段落に折り畳む（seed 簡易版）。
 */
function buildSeedDescription(text: string) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const descriptionHtml = buildParagraphHtml(collapsed);
  return {
    descriptionJson: JSON.parse(
      buildParagraphEditorStateJson(collapsed),
    ) as Prisma.InputJsonValue,
    descriptionHtml,
    descriptionPlainText: stripHtmlToText(descriptionHtml, 200),
  };
}

/**
 * 単純な Lexical JSON / HTML を改行保持で生成（seedTerms 用）
 */
function buildLexicalContent(text: string) {
  const paragraphs = text.split(/\n+/u).filter((line) => line.length > 0);
  const html = paragraphs.map((p) => buildParagraphHtml(p)).join("");
  const json = paragraphs[0]
    ? buildParagraphEditorStateJson(paragraphs.join(" "))
    : buildParagraphEditorStateJson(text);
  return {
    json: JSON.parse(json) as Prisma.InputJsonValue,
    html,
  };
}

// Prisma アダプター（PrismaPg が Pool ライフサイクルを内部管理）
const adapter = new PrismaPg({
  connectionString: process.env["DATABASE_URL"],
});

// Prisma Client（アプリ本番と同じ Decimal→number 拡張を適用）
const prisma = createAppPrismaClient(
  new PrismaClient({
    adapter,
  }),
);

// =============================================================================
// Helper: Clear All Data (--fresh用)
// =============================================================================

async function clearAllData() {
  console.log("🗑️  Clearing all data...");
  console.log("");

  // 依存関係の逆順で削除（interactive transaction — gotchas.md §トランザクション準拠）
  await prisma.$transaction(async (tx) => {
    // SpaceReview（FK: reservation / customer / space / user）
    await tx.spaceReview.deleteMany();

    // AdminNotification（管理画面通知）
    await tx.adminNotification.deleteMany();

    // BlockTemplate（Lexical 再利用ブロック）
    await tx.blockTemplate.deleteMany();

    // コメント・バージョン履歴
    await tx.postComment.deleteMany();
    await tx.postVersion.deleteMany();
    await tx.newsVersion.deleteMany();

    // 予約関連
    await tx.termsAgreement.deleteMany();
    await tx.termsDocument.deleteMany();
    await tx.reservation.deleteMany();

    // コンテンツ
    await tx.post.deleteMany();
    await tx.postCategory.deleteMany();
    await tx.postTag.deleteMany();
    await tx.faqItem.deleteMany();
    await tx.faqCategory.deleteMany();
    await tx.news.deleteMany();
    await tx.section.deleteMany();
    await tx.userPageAssignment.deleteMany();
    await tx.page.deleteMany();

    // 顧客・問い合わせ
    await tx.inquiry.deleteMany();
    await tx.customer.deleteMany();

    // イベント申込（FK: EventRegistration → Event）
    await tx.eventRegistration.deleteMany();
    await tx.event.deleteMany();

    // スペース関連
    await tx.iCalToken.deleteMany();
    await tx.space.deleteMany();
    await tx.spaceCategory.deleteMany();
    await tx.location.deleteMany();

    // クーポン
    await tx.coupon.deleteMany();

    // サイト設定
    await tx.navigationItem.deleteMany();
    await tx.announcementBar.deleteMany();
    await tx.socialLink.deleteMany();

    // 認証関連
    await tx.auditLog.deleteMany();
    await tx.session.deleteMany();
    await tx.verification.deleteMany();
    await tx.loginToken.deleteMany();
    await tx.staffInvitation.deleteMany();
    await tx.account.deleteMany();
    await tx.user.deleteMany();

    // Media
    await tx.media.deleteMany();

    // Settings は削除しない（upsertで更新）
  });

  console.log("✅ All data cleared");
  console.log("");
}

// =============================================================================
// Helper: Generate and print login URL
// =============================================================================

async function generateAndPrintLoginUrl() {
  const { token, expiresAt } = await createAdminGateToken();

  await prisma.loginToken.create({
    data: { token, expiresAt },
  });

  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
  const loginUrl = `${baseUrl}/admin/login?token=${token}`;

  console.log("");
  console.log("🔑 ログインURL（30日間有効）:");
  console.log(`   ${loginUrl}`);
  console.log("");
}

// =============================================================================
// Helper: Create or Update User with Credential
// =============================================================================

interface CreateUserOptions {
  email: string;
  password: string;
  name: string;
  role: Role;
  pageIds?: string[];
}

async function createOrUpdateUserWithCredential(
  options: CreateUserOptions,
): Promise<boolean> {
  const { email, password, name, role, pageIds = [] } = options;
  const hashedPassword = await hashPassword(password);

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { accounts: true },
  });

  if (existingUser) {
    // ユーザー更新
    await prisma.user.update({
      where: { email },
      data: {
        role,
        name,
        pageAssignments: {
          deleteMany: {},
          create: pageIds.map((pageId) => ({ pageId })),
        },
      },
    });

    // credential account のパスワード更新 or 作成
    const credentialAccount = existingUser.accounts.find(
      (acc) => acc.providerId === "credential",
    );
    if (credentialAccount) {
      await prisma.account.update({
        where: { id: credentialAccount.id },
        data: { password: hashedPassword },
      });
    } else {
      await prisma.account.create({
        data: {
          userId: existingUser.id,
          accountId: existingUser.id,
          providerId: "credential",
          password: hashedPassword,
        },
      });
    }

    return false; // updated
  }

  // ユーザーと credential account を同時作成
  const userId = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      email,
      name,
      role,
      emailVerified: true,
      pageAssignments: {
        create: pageIds.map((pageId) => ({ pageId })),
      },
      accounts: {
        create: {
          accountId: userId,
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
  });

  return true; // created
}

// =============================================================================
// Admin User
// =============================================================================

async function seedAdmin(
  email: string,
  password: string,
  name: string = "Administrator",
) {
  const created = await createOrUpdateUserWithCredential({
    email,
    password,
    name,
    role: Role.ADMIN,
  });

  if (created) {
    console.log(`✅ Created new admin user: ${email}`);
  } else {
    console.log(`✅ Updated existing admin user: ${email}`);
  }

  // ログインURLを生成して表示
  await generateAndPrintLoginUrl();
}

// =============================================================================
// Staff Users (Demo: RBAC roles)
// =============================================================================

async function seedStaffUsers() {
  const staffUsers: Array<{
    email: string;
    name: string;
    role: Role;
    password: string;
  }> = [
    {
      email: "superadmin@example.com",
      name: "スーパー管理者",
      role: Role.SUPER_ADMIN,
      password: "superadmin123",
    },
    {
      email: "editor@example.com",
      name: "田中編集者",
      role: Role.EDITOR,
      password: "editor123",
    },
    {
      email: "viewer@example.com",
      name: "鈴木閲覧者",
      role: Role.VIEWER,
      password: "viewer123",
    },
  ];

  for (const staff of staffUsers) {
    const existing = await prisma.user.findUnique({
      where: { email: staff.email },
    });
    if (existing) {
      console.log(`⏭️ Skipped existing staff: ${staff.email}`);
      continue;
    }

    await createOrUpdateUserWithCredential(staff);
    console.log(`✅ Created staff user: ${staff.name} (${staff.role})`);
  }
}

// =============================================================================
// Settings (Singleton - upsert)
// =============================================================================

/**
 * 新規 install 時の Feature Module 初期値を解決する。
 *
 * SSoT: `FEATURE_MODULES_LIST`（registry）。全 module を ON で初期化するのが
 * rental space SaaS template の標準構成。個別環境で初期 OFF にしたい module は
 * env var で指定する:
 *
 *   SEED_FEATURE_MODULES_DISABLED=events,faq
 *
 * 既存 install では re-seed しても feature toggle はリセットされない
 * （`update` 経路に featureModules を含めないため、管理画面 /admin/settings/features
 * で行ったユーザー編集が保持される）。
 */
function resolveSeedFeatureModules(): Record<string, boolean> {
  const disabled = parseDisabledFeatureModulesEnv(
    process.env["SEED_FEATURE_MODULES_DISABLED"],
  );
  return buildInitialFeatureModules(disabled);
}

async function seedSettings() {
  const settingsData = {
    siteName: "Myrrh Rental Space",
    siteDescription:
      "ビジネスからプライベートまで、様々な用途に対応したレンタルスペース",
    businessName: "株式会社サンプル",
    businessNameKana: "カブシキガイシャサンプル",
    representativeName: "山田 太郎",
    businessType: "法人",
    industryType: "レンタルスペース運営",
    registrationNumber: "1234567890123",
    phoneNumber: "03-1234-5678",
    email: "info@example.com",
    postalCode: "150-0001",
    prefecture: "東京都",
    city: "渋谷区",
    streetAddress: "神宮前1-1-1",
    buildingName: "サンプルビル",
    // 交通案内・駐車場案内は Location 単位（Location.accessLines / Location.parkingInfo）
    footerCopyright: "© 2025 Myrrh Rental Space. All rights reserved.",
    cancellationDeadlineHours: 24,
    modificationDeadlineHours: 24,

    // ロゴ・OGP（公開ページ表示用）
    faviconUrl: "/favicon.ico",
    defaultOgpImageUrl: "/images/seed/ogp-default.svg",
    headerLogoUrl: "/images/seed/logo-header.svg",
    footerLogoUrl: "/images/seed/logo-footer.svg",

    // メール送信設定（Resend 統合時必須）
    senderEmail: "noreply@example.com",
    senderName: "Myrrh Rental Space",
    replyToEmail: "support@example.com",
  };

  // featureModules は「create only」で書き込む（既存 install の toggle 編集を保持）。
  // SSoT: FEATURE_MODULES_LIST registry + SEED_FEATURE_MODULES_DISABLED env var。
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: settingsData,
    create: {
      id: "singleton",
      ...settingsData,
      featureModules: resolveSeedFeatureModules(),
    },
  });

  console.log("✅ Settings configured");
}

// =============================================================================
// Locations
// =============================================================================

async function seedLocations() {
  const locations = [
    {
      name: "本館",
      slug: "honkan",
      description: "表参道駅から徒歩5分の好立地。全フロアにWi-Fi完備。",
      address: "東京都渋谷区神宮前1-1-1 サンプルビル",
      postalCode: "150-0001",
      prefecture: "東京都",
      city: "渋谷区",
      streetAddress: "神宮前1-1-1",
      buildingName: "サンプルビル",
      accessLines: [
        "東京メトロ「表参道駅」A1出口より徒歩5分",
        "JR「原宿駅」表参道口より徒歩8分",
      ],
      parkingInfo:
        "専用駐車場 3台（要事前予約）\n近隣コインパーキング: タイムズ神宮前（徒歩1分・24時間）",
      amenities: {
        wifi: true,
        parking: true,
        barrier_free: true,
        elevator: true,
        food_allowed: true,
      },
      imageUrl: "/images/seed/location-main.svg",
      sortOrder: 0,
      isPublished: true,
      latitude: 35.6651,
      longitude: 139.7119,
      phoneNumber: "03-1234-5678",
      email: "honkan@example.com",
      googleBusinessPlaceId: null,
      googleReviewUrl: null,
      priceRange: "¥1,000〜¥5,000/時間",
      paymentAccepted: "現金, クレジットカード, 電子マネー",
      specialHolidays: Prisma.JsonNull,
    },
    {
      name: "別館",
      slug: "bekkan",
      description: "落ち着いた雰囲気の別館。少人数のミーティングに最適。",
      address: "東京都渋谷区神宮前1-2-3 別館ビル",
      postalCode: "150-0001",
      prefecture: "東京都",
      city: "渋谷区",
      streetAddress: "神宮前1-2-3",
      buildingName: "別館ビル",
      accessLines: ["本館より徒歩2分", "表参道駅A1出口より徒歩7分"],
      parkingInfo: "専用駐車場はございません。本館駐車場をご利用ください。",
      amenities: {
        wifi: true,
        elevator: false,
        food_allowed: true,
        photography_allowed: true,
      },
      imageUrl: "/images/seed/location-annex.svg",
      sortOrder: 1,
      isPublished: true,
      latitude: 35.6653,
      longitude: 139.7121,
      phoneNumber: "03-1234-5679",
      email: "bekkan@example.com",
      googleBusinessPlaceId: null,
      googleReviewUrl: null,
      priceRange: "¥800〜¥3,000/時間",
      paymentAccepted: "現金, クレジットカード",
      specialHolidays: Prisma.JsonNull,
    },
    {
      name: "新宿支店",
      slug: "shinjuku-ten",
      description: "新宿駅直結でアクセス抜群。大人数のセミナーにも対応。",
      address: "東京都新宿区西新宿1-1-1 新宿タワー",
      postalCode: "160-0023",
      prefecture: "東京都",
      city: "新宿区",
      streetAddress: "西新宿1-1-1",
      buildingName: "新宿タワー",
      accessLines: [
        "JR「新宿駅」西口直結",
        "都営大江戸線「新宿西口駅」D5出口直結",
      ],
      parkingInfo: "新宿タワー地下駐車場（有料・先着順）",
      amenities: {
        wifi: true,
        parking: true,
        barrier_free: true,
        elevator: true,
        smoking_area: true,
        food_allowed: true,
        photography_allowed: true,
        music_allowed: true,
      },
      imageUrl: "/images/seed/location-shinjuku.svg",
      sortOrder: 2,
      isPublished: false,
      latitude: 35.6896,
      longitude: 139.6917,
      phoneNumber: "03-9876-5432",
      email: "shinjuku@example.com",
      googleBusinessPlaceId: null,
      googleReviewUrl: null,
      priceRange: "¥1,500〜¥8,000/時間",
      paymentAccepted: "現金, クレジットカード, 電子マネー, QRコード決済",
      specialHolidays: Prisma.JsonNull,
    },
  ];

  // upsert で idempotent 化（name @unique が SSoT キー）
  for (const loc of locations) {
    await prisma.location.upsert({
      where: { name: loc.name },
      create: loc,
      update: loc,
    });
  }

  console.log("✅ Upserted locations");
}

// =============================================================================
// Space Categories
// =============================================================================

async function seedSpaceCategories() {
  const categories = [
    {
      name: "会議室",
      description: "少人数から中規模のミーティングに最適",
      icon: "Users",
      color: "#3B82F6",
      sortOrder: 0,
    },
    {
      name: "セミナールーム",
      description: "大人数の講義やワークショップ向け",
      icon: "Presentation",
      color: "#8B5CF6",
      sortOrder: 1,
    },
    {
      name: "コワーキング",
      description: "自由席で気軽に作業できるスペース",
      icon: "Laptop",
      color: "#10B981",
      sortOrder: 2,
    },
    {
      name: "イベントスペース",
      description: "パーティーや展示会などの特別なイベントに",
      icon: "PartyPopper",
      color: "#F59E0B",
      sortOrder: 3,
    },
  ];

  // upsert で idempotent 化（name @unique が SSoT キー）
  for (const cat of categories) {
    await prisma.spaceCategory.upsert({
      where: { name: cat.name },
      create: cat,
      update: cat,
    });
  }

  console.log("✅ Upserted space categories");
}

// =============================================================================
// Spaces (with Location/Category relations)
// =============================================================================

async function seedSpaces() {
  // 先にLocation/Categoryを取得
  const locations = await prisma.location.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const categories = await prisma.spaceCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const mainBuilding = locations.find((l) => l.name === "本館");
  const annex = locations.find((l) => l.name === "別館");
  const meetingRoom = categories.find((c) => c.name === "会議室");
  const seminarRoom = categories.find((c) => c.name === "セミナールーム");
  const coworking = categories.find((c) => c.name === "コワーキング");

  const spaces = [
    {
      slug: "meeting-room-a",
      name: "ミーティングルーム A",
      ...buildSeedDescription(
        "明るく開放的なミーティングルームです。最大8名様までご利用いただけます。プロジェクター、ホワイトボード、Wi-Fi完備。ビジネスミーティング、少人数の研修、面接などに最適です。",
      ),
      addressDetail: "3F",
      capacity: 8,
      area: new Prisma.Decimal(25.5),
      hourlyPrice: new Prisma.Decimal(3000),
      dailyPrice: new Prisma.Decimal(20000),
      mainImageUrl: "/images/seed/meeting-room.svg",
      imageUrls: [],
      facilities: [
        { name: "Wi-Fi", iconName: "IconWifi" },
        { name: "プロジェクター", iconName: "IconPresentation" },
        { name: "ホワイトボード", iconName: "IconBulb" },
        { name: "空調", iconName: "IconAirConditioning" },
        { name: "電源タップ", iconName: "IconChargingPile" },
      ],
      isPublished: true,
      isActive: true,
      ...(mainBuilding?.id != null ? { locationId: mainBuilding.id } : {}),
      ...(meetingRoom?.id != null ? { categoryId: meetingRoom.id } : {}),
    },
    {
      slug: "seminar-room",
      name: "セミナールーム",
      ...buildSeedDescription(
        "最大30名収容可能なセミナールームです。セミナー、ワークショップ、説明会、発表会などに最適。スクール形式、シアター形式など、用途に合わせてレイアウト変更可能です。",
      ),
      addressDetail: "4F",
      capacity: 30,
      area: new Prisma.Decimal(60.0),
      hourlyPrice: new Prisma.Decimal(8000),
      dailyPrice: new Prisma.Decimal(50000),
      mainImageUrl: "/images/seed/seminar-room.svg",
      imageUrls: [],
      facilities: [
        { name: "Wi-Fi", iconName: "IconWifi" },
        { name: "プロジェクター", iconName: "IconPresentation" },
        { name: "大型スクリーン", iconName: "IconPresentation" },
        { name: "マイク", iconName: "IconMicrophone" },
        { name: "空調", iconName: "IconAirConditioning" },
        { name: "可動式テーブル", iconName: "IconArmchair" },
      ],
      isPublished: true,
      isActive: true,
      ...(mainBuilding?.id != null ? { locationId: mainBuilding.id } : {}),
      ...(seminarRoom?.id != null ? { categoryId: seminarRoom.id } : {}),
    },
    {
      slug: "coworking-space",
      name: "コワーキングスペース",
      ...buildSeedDescription(
        "フリーアドレスのコワーキングスペースです。集中して作業したい方、気分転換に場所を変えて仕事したい方におすすめ。ドリンクバー、軽食販売あり。",
      ),
      addressDetail: "2F",
      capacity: 20,
      area: new Prisma.Decimal(80.0),
      hourlyPrice: new Prisma.Decimal(500),
      dailyPrice: new Prisma.Decimal(3000),
      mainImageUrl: "/images/seed/coworking.svg",
      imageUrls: [],
      facilities: [
        { name: "Wi-Fi", iconName: "IconWifi" },
        { name: "電源", iconName: "IconChargingPile" },
        { name: "ロッカー", iconName: "IconKey" },
        { name: "ドリンクバー", iconName: "IconCoffee" },
        { name: "複合機", iconName: "IconCamera" },
        { name: "空調", iconName: "IconAirConditioning" },
      ],
      isPublished: true,
      isActive: true,
      ...(annex?.id != null ? { locationId: annex.id } : {}),
      ...(coworking?.id != null ? { categoryId: coworking.id } : {}),
    },
  ];

  for (const space of spaces) {
    const existing = await prisma.space.findFirst({
      where: { slug: space.slug },
    });
    if (!existing) {
      await prisma.space.create({ data: space });
      console.log(`✅ Created space: ${space.name}`);
    } else {
      console.log(`⏭️ Skipped existing space: ${space.name}`);
    }
  }
}

// =============================================================================
// Coupons (新規追加)
// =============================================================================

async function seedCoupons() {
  const now = new Date();
  const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const sixMonthsLater = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

  const coupons: Prisma.CouponCreateInput[] = [
    {
      code: "WELCOME10",
      name: "初回限定10%OFF",
      description: "初めてのご利用で10%割引。新規のお客様限定クーポンです。",
      type: "PERCENTAGE",
      discountValue: new Prisma.Decimal(10),
      validFrom: now,
      validUntil: sixMonthsLater,
      usageLimit: 100,
      isActive: true,
      canCombineWithDurationDiscount: true,
    },
    {
      code: "SUMMER2026",
      name: "夏季キャンペーン15%OFF",
      description: "期間限定の夏季キャンペーン。全スペース15%割引。",
      type: "PERCENTAGE",
      discountValue: new Prisma.Decimal(15),
      validFrom: now,
      validUntil: threeMonthsLater,
      usageLimit: 50,
      isActive: true,
      canCombineWithDurationDiscount: false,
    },
    {
      code: "FIXED1000",
      name: "1,000円割引",
      description: "5,000円以上のご利用で1,000円割引。",
      type: "FIXED_AMOUNT",
      discountValue: new Prisma.Decimal(1000),
      minReservationAmount: new Prisma.Decimal(5000),
      validFrom: now,
      validUntil: threeMonthsLater,
      isActive: true,
      canCombineWithDurationDiscount: true,
    },
    {
      code: "LONGUSE20",
      name: "長時間利用割引20%OFF",
      description: "4時間以上のご利用で20%割引。",
      type: "PERCENTAGE",
      discountValue: new Prisma.Decimal(20),
      minReservationAmount: new Prisma.Decimal(10000),
      maxDiscountAmount: new Prisma.Decimal(5000),
      validFrom: now,
      validUntil: sixMonthsLater,
      isActive: true,
      canCombineWithDurationDiscount: false,
    },
    {
      code: "VIP30",
      name: "VIP会員様専用30%OFF",
      description: "VIP会員様限定の特別クーポン。",
      type: "PERCENTAGE",
      discountValue: new Prisma.Decimal(30),
      maxDiscountAmount: new Prisma.Decimal(10000),
      validFrom: now,
      validUntil: oneMonthLater,
      usageLimit: 20,
      isActive: true,
      canCombineWithDurationDiscount: true,
    },
  ];

  for (const coupon of coupons) {
    const existing = await prisma.coupon.findUnique({
      where: { code: coupon.code },
    });
    if (!existing) {
      await prisma.coupon.create({ data: coupon });
      console.log(`✅ Created coupon: ${coupon.code}`);
    } else {
      console.log(`⏭️ Skipped existing coupon: ${coupon.code}`);
    }
  }
}

// =============================================================================
// Blog Tags (新規追加)
// =============================================================================

async function seedBlogTags() {
  const tags = [
    { name: "ビジネス", slug: "business" },
    { name: "働き方", slug: "work-style" },
    { name: "活用事例", slug: "case-study" },
    { name: "セミナー", slug: "seminar" },
    { name: "会議", slug: "meeting" },
    { name: "リモートワーク", slug: "remote-work" },
    { name: "コワーキング", slug: "coworking" },
    { name: "イベント", slug: "event" },
    { name: "初心者向け", slug: "beginner" },
    { name: "お知らせ", slug: "announcement" },
  ];

  await prisma.postTag.createMany({
    data: tags,
    skipDuplicates: true,
  });

  console.log("✅ Created blog tags");
}

// =============================================================================
// Customers
// =============================================================================

async function seedCustomers() {
  const customers = [
    // PERSONAL customers (3) — CustomerType.PERSONAL の enum カバレッジ
    {
      lastName: "渡部",
      firstName: "亮",
      customerType: CustomerType.PERSONAL,
      email: "watabe.ryo@example.com",
      phoneNumber: "090-5555-1111",
      status: "NEW" as const,
    },
    {
      lastName: "近藤",
      firstName: "綾",
      customerType: CustomerType.PERSONAL,
      email: "kondo.aya@example.com",
      phoneNumber: "090-5555-2222",
      status: "REGULAR" as const,
      totalReservations: 2,
      totalSpent: 20000,
    },
    {
      lastName: "浅野",
      firstName: "真一",
      customerType: CustomerType.PERSONAL,
      email: "asano.shinichi@example.com",
      phoneNumber: "090-5555-3333",
      status: "REGULAR" as const,
      totalReservations: 4,
      totalSpent: 42000,
    },
    // NEW customers (5)
    {
      lastName: "田中",
      firstName: "太郎",
      email: "tanaka.taro@example.com",
      phoneNumber: "090-1111-1111",
      status: "NEW" as const,
    },
    {
      lastName: "山田",
      firstName: "花子",
      email: "yamada.hanako@example.com",
      phoneNumber: "090-1111-2222",
      status: "NEW" as const,
    },
    {
      lastName: "佐藤",
      firstName: "一郎",
      email: "sato.ichiro@example.com",
      phoneNumber: "090-1111-3333",
      status: "NEW" as const,
    },
    {
      lastName: "木村",
      firstName: "優子",
      email: "kimura.yuko@example.com",
      phoneNumber: "090-1111-4444",
      status: "NEW" as const,
    },
    {
      lastName: "林",
      firstName: "大介",
      email: "hayashi.daisuke@example.com",
      phoneNumber: "090-1111-5555",
      status: "NEW" as const,
    },
    // REGULAR customers (12)
    {
      lastName: "鈴木",
      firstName: "美咲",
      email: "suzuki.misaki@example.com",
      phoneNumber: "090-2222-1111",
      status: "REGULAR" as const,
      totalReservations: 5,
      totalSpent: 50000,
    },
    {
      lastName: "高橋",
      firstName: "健太",
      email: "takahashi.kenta@example.com",
      phoneNumber: "090-2222-2222",
      status: "REGULAR" as const,
      totalReservations: 3,
      totalSpent: 30000,
    },
    {
      lastName: "伊藤",
      firstName: "さくら",
      email: "ito.sakura@example.com",
      phoneNumber: "090-2222-3333",
      status: "REGULAR" as const,
      totalReservations: 7,
      totalSpent: 70000,
    },
    {
      lastName: "渡辺",
      firstName: "大輔",
      email: "watanabe.daisuke@example.com",
      phoneNumber: "090-2222-4444",
      status: "REGULAR" as const,
      totalReservations: 4,
      totalSpent: 40000,
    },
    {
      lastName: "小林",
      firstName: "真由",
      email: "kobayashi.mayu@example.com",
      phoneNumber: "090-2222-5555",
      status: "REGULAR" as const,
      totalReservations: 6,
      totalSpent: 60000,
    },
    {
      lastName: "松本",
      firstName: "直樹",
      email: "matsumoto.naoki@example.com",
      phoneNumber: "090-2222-6666",
      status: "REGULAR" as const,
      totalReservations: 8,
      totalSpent: 80000,
    },
    {
      lastName: "井上",
      firstName: "美香",
      email: "inoue.mika@example.com",
      phoneNumber: "090-2222-7777",
      status: "REGULAR" as const,
      totalReservations: 4,
      totalSpent: 45000,
    },
    {
      lastName: "斎藤",
      firstName: "拓也",
      email: "saito.takuya@example.com",
      phoneNumber: "090-2222-8888",
      status: "REGULAR" as const,
      totalReservations: 9,
      totalSpent: 95000,
    },
    {
      lastName: "清水",
      firstName: "由美",
      email: "shimizu.yumi@example.com",
      phoneNumber: "090-2222-9999",
      status: "REGULAR" as const,
      totalReservations: 3,
      totalSpent: 35000,
    },
    {
      lastName: "山口",
      firstName: "翔",
      email: "yamaguchi.sho@example.com",
      phoneNumber: "090-2222-0000",
      status: "REGULAR" as const,
      totalReservations: 5,
      totalSpent: 55000,
    },
    {
      lastName: "石田",
      firstName: "愛",
      email: "ishida.ai@example.com",
      phoneNumber: "090-2223-1111",
      status: "REGULAR" as const,
      totalReservations: 6,
      totalSpent: 65000,
    },
    {
      lastName: "前田",
      firstName: "健一",
      email: "maeda.kenichi@example.com",
      phoneNumber: "090-2223-2222",
      status: "REGULAR" as const,
      totalReservations: 7,
      totalSpent: 75000,
    },
    // VIP customers (6)
    {
      lastName: "加藤",
      firstName: "誠",
      email: "kato.makoto@example.com",
      phoneNumber: "090-3333-1111",
      status: "VIP" as const,
      totalReservations: 20,
      totalSpent: 500000,
    },
    {
      lastName: "吉田",
      firstName: "美穂",
      email: "yoshida.miho@example.com",
      phoneNumber: "090-3333-2222",
      status: "VIP" as const,
      totalReservations: 15,
      totalSpent: 400000,
    },
    {
      lastName: "山本",
      firstName: "翔太",
      email: "yamamoto.shota@example.com",
      phoneNumber: "090-3333-3333",
      status: "VIP" as const,
      totalReservations: 25,
      totalSpent: 600000,
    },
    {
      lastName: "中島",
      firstName: "裕子",
      email: "nakajima.yuko@example.com",
      phoneNumber: "090-3333-4444",
      status: "VIP" as const,
      totalReservations: 18,
      totalSpent: 450000,
    },
    {
      lastName: "小野",
      firstName: "雄大",
      email: "ono.yudai@example.com",
      phoneNumber: "090-3333-5555",
      status: "VIP" as const,
      totalReservations: 22,
      totalSpent: 550000,
    },
    {
      lastName: "藤田",
      firstName: "恵",
      email: "fujita.megumi@example.com",
      phoneNumber: "090-3333-6666",
      status: "VIP" as const,
      totalReservations: 30,
      totalSpent: 700000,
    },
    // INACTIVE customers (3)
    {
      lastName: "中村",
      firstName: "恵子",
      email: "nakamura.keiko@example.com",
      phoneNumber: "090-4444-1111",
      status: "INACTIVE" as const,
      isActive: false,
    },
    {
      lastName: "小川",
      firstName: "裕介",
      email: "ogawa.yusuke@example.com",
      phoneNumber: "090-4444-2222",
      status: "INACTIVE" as const,
      isActive: false,
    },
    {
      lastName: "岡田",
      firstName: "真理",
      email: "okada.mari@example.com",
      phoneNumber: "090-4444-3333",
      status: "INACTIVE" as const,
      isActive: false,
    },
    // BLACKLIST customer (1)
    {
      lastName: "問題",
      firstName: "発生",
      email: "blacklist.user@example.com",
      phoneNumber: "090-9999-9999",
      status: "BLACKLIST" as const,
      notes: "重大なトラブル履歴あり。予約受付停止中。",
      isActive: false,
    },
    // Corporate customers (4)
    {
      lastName: "田村",
      firstName: "健一",
      customerType: CustomerType.CORPORATE,
      companyName: "株式会社ABC",
      email: "tamura@abc-corp.example.com",
      phoneNumber: "03-1234-5678",
      status: "REGULAR" as const,
      totalReservations: 10,
      totalSpent: 200000,
    },
    {
      lastName: "森田",
      firstName: "裕子",
      customerType: CustomerType.CORPORATE,
      companyName: "合同会社XYZ",
      email: "morita@xyz-llc.example.com",
      phoneNumber: "03-9876-5432",
      status: "VIP" as const,
      totalReservations: 30,
      totalSpent: 800000,
    },
    {
      lastName: "西村",
      firstName: "誠",
      customerType: CustomerType.CORPORATE,
      companyName: "有限会社サンプル",
      email: "nishimura@sample.example.com",
      phoneNumber: "03-1111-2222",
      status: "REGULAR" as const,
      totalReservations: 12,
      totalSpent: 250000,
    },
    {
      lastName: "村上",
      firstName: "恵美",
      customerType: CustomerType.CORPORATE,
      companyName: "NPO法人地域支援",
      email: "murakami@npo.example.com",
      phoneNumber: "03-3333-4444",
      status: "REGULAR" as const,
      totalReservations: 8,
      totalSpent: 120000,
    },
  ];

  for (const customer of customers) {
    const existing = await prisma.customer.findUnique({
      where: { email: customer.email },
    });

    if (!existing) {
      await prisma.customer.create({
        data: {
          ...customer,
          totalSpent: customer.totalSpent
            ? new Prisma.Decimal(customer.totalSpent)
            : null,
        },
      });
      console.log(
        `✅ Created customer: ${customer.lastName} ${customer.firstName}`,
      );
    } else {
      console.log(
        `⏭️ Skipped existing customer: ${customer.lastName} ${customer.firstName}`,
      );
    }
  }
}

// =============================================================================
// Inquiries
// =============================================================================

async function seedInquiries() {
  const inquiries = [
    {
      name: "山田 一郎",
      email: "yamada@example.com",
      subject: "予約について",
      message:
        "来週の土曜日に会議室を予約したいのですが、空き状況を教えていただけますか？",
      status: "NEW" as const,
    },
    {
      name: "佐藤 花子",
      email: "sato@example.com",
      subject: "設備について",
      message: "プロジェクターの解像度を教えてください。4K対応ですか？",
      status: "NEW" as const,
    },
    {
      name: "田中 太郎",
      email: "tanaka@example.com",
      subject: "料金プラン",
      message: "長期利用の割引プランはありますか？月契約を検討しています。",
      status: "IN_PROGRESS" as const,
    },
    {
      name: "鈴木 美咲",
      email: "suzuki@example.com",
      subject: "キャンセルについて",
      message: "明日の予約をキャンセルしたいのですが、手続きを教えてください。",
      status: "IN_PROGRESS" as const,
    },
    {
      name: "高橋 健太",
      email: "takahashi@example.com",
      subject: "アクセス方法",
      message: "最寄り駅からの詳しい道順を教えていただけますか？",
      status: "RESOLVED" as const,
    },
    {
      name: "伊藤 さくら",
      email: "ito@example.com",
      subject: "備品レンタル",
      message: "ホワイトボードマーカーは用意されていますか？",
      status: "RESOLVED" as const,
    },
    {
      name: "渡辺 大輔",
      email: "watanabe@example.com",
      subject: "法人契約について",
      message: "法人での利用を検討しています。請求書払いは可能ですか？",
      status: "RESOLVED" as const,
    },
    {
      name: "小林 真由",
      email: "kobayashi@example.com",
      subject: "見学希望",
      message: "利用前にスペースを見学することは可能ですか？",
      status: "CLOSED" as const,
    },
    {
      name: "田村 健一",
      companyName: "株式会社ABC",
      email: "tamura@abc.example.com",
      subject: "定期利用",
      message: "毎週水曜日の定期利用を希望します。優先予約は可能ですか？",
      status: "NEW" as const,
    },
    {
      name: "森田 裕介",
      email: "morita@example.com",
      subject: "Wi-Fiについて",
      message:
        "Wi-Fiの通信速度はどのくらいですか？オンライン会議で使用予定です。",
      status: "NEW" as const,
    },
    {
      name: "中村 恵子",
      email: "nakamura.keiko@example.com",
      subject: "飲食の持ち込み",
      message:
        "軽食の持ち込みは可能でしょうか？ランチミーティングを予定しています。",
      status: "NEW" as const,
    },
    {
      name: "加藤 誠",
      email: "kato.makoto@example.com",
      subject: "延長料金",
      message: "予約時間を延長した場合の追加料金を教えてください。",
      status: "NEW" as const,
    },
    {
      name: "吉田 美穂",
      email: "yoshida.miho@example.com",
      subject: "駐車場について",
      message: "近隣に駐車場はありますか？提携駐車場があれば教えてください。",
      status: "IN_PROGRESS" as const,
    },
    {
      name: "山本 翔太",
      email: "yamamoto.shota@example.com",
      subject: "撮影利用",
      message: "商品撮影でスペースを使いたいのですが、撮影は可能でしょうか？",
      status: "IN_PROGRESS" as const,
    },
    {
      name: "合同会社XYZ 森田",
      email: "morita.xyz@example.com",
      subject: "大人数利用",
      message:
        "50名規模のセミナーを開催予定です。対応可能なスペースはありますか？",
      status: "IN_PROGRESS" as const,
    },
    {
      name: "中島 裕子",
      email: "nakajima.yuko@example.com",
      subject: "予約変更",
      message:
        "来週の予約を別の日に変更したいのですが、手続き方法を教えてください。",
      status: "RESOLVED" as const,
    },
    {
      name: "小野 雄大",
      email: "ono.yudai@example.com",
      subject: "深夜利用",
      message:
        "22時以降の利用は可能でしょうか？夜間のミーティングを予定しています。",
      status: "RESOLVED" as const,
    },
    {
      name: "藤田 恵",
      email: "fujita.megumi@example.com",
      subject: "イベント利用",
      message: "商品発表会を開催したいのですが、イベント利用は可能ですか？",
      status: "RESOLVED" as const,
    },
    {
      name: "村上 恵美",
      companyName: "NPO法人地域支援",
      email: "murakami.npo@example.com",
      subject: "非営利団体割引",
      message:
        "NPO法人向けの割引プランはありますか？地域イベントで利用したいです。",
      status: "CLOSED" as const,
    },
    {
      name: "石田 愛",
      email: "ishida.ai@example.com",
      subject: "レイアウト変更",
      message: "テーブルや椅子のレイアウトを自由に変更することは可能ですか？",
      status: "CLOSED" as const,
    },
  ];

  for (const inquiry of inquiries) {
    const existing = await prisma.inquiry.findFirst({
      where: { email: inquiry.email, subject: inquiry.subject },
    });

    if (!existing) {
      await prisma.inquiry.create({ data: inquiry });
      console.log(`✅ Created inquiry: ${inquiry.subject}`);
    } else {
      console.log(`⏭️ Skipped existing inquiry: ${inquiry.subject}`);
    }
  }
}

// =============================================================================
// Reservations (with Coupon relations)
// =============================================================================

async function seedReservations() {
  const spaces = await prisma.space.findMany({ where: { isActive: true } });
  const customers = await prisma.customer.findMany({
    where: { isActive: true },
  });
  const coupons = await prisma.coupon.findMany({ where: { isActive: true } });

  if (spaces.length === 0 || customers.length === 0) {
    console.log("⚠️ No spaces or customers found. Skipping reservations seed.");
    return;
  }

  const welcomeCoupon = coupons.find((c) => c.code === "WELCOME10");
  const now = new Date();

  const reservations: Array<{
    spaceIndex: number;
    customerIndex: number;
    daysOffset: number;
    startHour: number;
    duration: number;
    status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
    notes?: string;
    applyCoupon?: boolean;
    paymentStatus?: "UNPAID" | "PENDING" | "PAID" | "REFUNDED" | "FAILED";
  }> = [
    // Past reservations
    {
      spaceIndex: 0,
      customerIndex: 0,
      daysOffset: -60,
      startHour: 10,
      duration: 2,
      status: "COMPLETED",
      notes: "電話予約",
      paymentStatus: "PAID", // PaymentStatus.PAID カバレッジ
    },
    {
      spaceIndex: 1,
      customerIndex: 1,
      daysOffset: -55,
      startHour: 14,
      duration: 3,
      status: "COMPLETED",
      paymentStatus: "PAID",
    },
    {
      spaceIndex: 2,
      customerIndex: 2,
      daysOffset: -50,
      startHour: 9,
      duration: 4,
      status: "COMPLETED",
      notes: "研修で利用",
    },
    {
      spaceIndex: 0,
      customerIndex: 3,
      daysOffset: -45,
      startHour: 13,
      duration: 2,
      status: "NO_SHOW",
      notes: "連絡なし不来店",
    },
    {
      spaceIndex: 1,
      customerIndex: 4,
      daysOffset: -40,
      startHour: 15,
      duration: 3,
      status: "CANCELLED",
      notes: "天候不良でキャンセル",
      paymentStatus: "REFUNDED", // PaymentStatus.REFUNDED カバレッジ
    },
    {
      spaceIndex: 2,
      customerIndex: 5,
      daysOffset: -35,
      startHour: 10,
      duration: 5,
      status: "COMPLETED",
      notes: "セミナー開催",
    },
    {
      spaceIndex: 0,
      customerIndex: 6,
      daysOffset: -30,
      startHour: 11,
      duration: 2,
      status: "COMPLETED",
    },
    {
      spaceIndex: 1,
      customerIndex: 7,
      daysOffset: -28,
      startHour: 16,
      duration: 2,
      status: "CANCELLED",
      notes: "お客様都合",
    },
    {
      spaceIndex: 2,
      customerIndex: 8,
      daysOffset: -25,
      startHour: 9,
      duration: 3,
      status: "COMPLETED",
    },
    {
      spaceIndex: 0,
      customerIndex: 9,
      daysOffset: -22,
      startHour: 14,
      duration: 4,
      status: "NO_SHOW",
      notes: "面接会場として予約も当日不来店",
    },
    {
      spaceIndex: 1,
      customerIndex: 10,
      daysOffset: -20,
      startHour: 10,
      duration: 2,
      status: "COMPLETED",
    },
    {
      spaceIndex: 2,
      customerIndex: 11,
      daysOffset: -18,
      startHour: 13,
      duration: 3,
      status: "CANCELLED",
      notes: "日程変更",
    },
    {
      spaceIndex: 0,
      customerIndex: 12,
      daysOffset: -15,
      startHour: 15,
      duration: 2,
      status: "COMPLETED",
    },
    {
      spaceIndex: 1,
      customerIndex: 13,
      daysOffset: -12,
      startHour: 9,
      duration: 6,
      status: "COMPLETED",
      notes: "ワークショップ",
    },
    {
      spaceIndex: 2,
      customerIndex: 14,
      daysOffset: -10,
      startHour: 11,
      duration: 2,
      status: "COMPLETED",
    },
    {
      spaceIndex: 0,
      customerIndex: 15,
      daysOffset: -9,
      startHour: 14,
      duration: 3,
      status: "CANCELLED",
      notes: "体調不良",
    },
    {
      spaceIndex: 1,
      customerIndex: 16,
      daysOffset: -8,
      startHour: 10,
      duration: 4,
      status: "COMPLETED",
    },
    {
      spaceIndex: 2,
      customerIndex: 17,
      daysOffset: -7,
      startHour: 16,
      duration: 2,
      status: "COMPLETED",
    },
    {
      spaceIndex: 0,
      customerIndex: 18,
      daysOffset: -5,
      startHour: 9,
      duration: 3,
      status: "CANCELLED",
      notes: "会議延期",
    },
    {
      spaceIndex: 1,
      customerIndex: 19,
      daysOffset: -3,
      startHour: 13,
      duration: 2,
      status: "COMPLETED",
      notes: "打ち合わせ",
    },
    // Today
    {
      spaceIndex: 0,
      customerIndex: 20,
      daysOffset: 0,
      startHour: 9,
      duration: 2,
      status: "CONFIRMED",
      notes: "本日のご予約",
    },
    {
      spaceIndex: 1,
      customerIndex: 21,
      daysOffset: 0,
      startHour: 10,
      duration: 3,
      status: "CONFIRMED",
    },
    {
      spaceIndex: 2,
      customerIndex: 22,
      daysOffset: 0,
      startHour: 14,
      duration: 4,
      status: "CONFIRMED",
    },
    {
      spaceIndex: 0,
      customerIndex: 23,
      daysOffset: 0,
      startHour: 15,
      duration: 2,
      status: "CONFIRMED",
    },
    {
      spaceIndex: 1,
      customerIndex: 24,
      daysOffset: 0,
      startHour: 17,
      duration: 2,
      status: "PENDING",
      notes: "当日予約",
      paymentStatus: "PENDING", // PaymentStatus.PENDING カバレッジ（Stripe Checkout 開始直後）
    },
    // Future confirmed (with some coupon usage)
    {
      spaceIndex: 0,
      customerIndex: 0,
      daysOffset: 1,
      startHour: 10,
      duration: 2,
      status: "CONFIRMED",
      applyCoupon: true,
    },
    {
      spaceIndex: 1,
      customerIndex: 1,
      daysOffset: 2,
      startHour: 13,
      duration: 3,
      status: "CONFIRMED",
      notes: "Web予約",
      applyCoupon: true,
    },
    {
      spaceIndex: 2,
      customerIndex: 2,
      daysOffset: 3,
      startHour: 9,
      duration: 8,
      status: "CONFIRMED",
      notes: "終日利用",
    },
    {
      spaceIndex: 0,
      customerIndex: 3,
      daysOffset: 4,
      startHour: 14,
      duration: 2,
      status: "CONFIRMED",
      applyCoupon: true,
    },
    {
      spaceIndex: 1,
      customerIndex: 4,
      daysOffset: 5,
      startHour: 10,
      duration: 4,
      status: "CONFIRMED",
    },
    {
      spaceIndex: 2,
      customerIndex: 5,
      daysOffset: 7,
      startHour: 11,
      duration: 3,
      status: "CONFIRMED",
      notes: "定例会議",
    },
    {
      spaceIndex: 0,
      customerIndex: 6,
      daysOffset: 8,
      startHour: 15,
      duration: 2,
      status: "CONFIRMED",
    },
    {
      spaceIndex: 1,
      customerIndex: 7,
      daysOffset: 10,
      startHour: 9,
      duration: 5,
      status: "CONFIRMED",
      notes: "社内研修",
    },
    {
      spaceIndex: 2,
      customerIndex: 8,
      daysOffset: 12,
      startHour: 13,
      duration: 3,
      status: "CONFIRMED",
    },
    {
      spaceIndex: 0,
      customerIndex: 9,
      daysOffset: 14,
      startHour: 10,
      duration: 2,
      status: "CONFIRMED",
    },
    {
      spaceIndex: 1,
      customerIndex: 10,
      daysOffset: 17,
      startHour: 14,
      duration: 4,
      status: "CONFIRMED",
      notes: "プレゼン練習",
    },
    {
      spaceIndex: 2,
      customerIndex: 11,
      daysOffset: 20,
      startHour: 9,
      duration: 6,
      status: "CONFIRMED",
    },
    {
      spaceIndex: 0,
      customerIndex: 12,
      daysOffset: 25,
      startHour: 11,
      duration: 2,
      status: "CONFIRMED",
    },
    {
      spaceIndex: 1,
      customerIndex: 13,
      daysOffset: 28,
      startHour: 15,
      duration: 3,
      status: "CONFIRMED",
      notes: "月末会議",
    },
    {
      spaceIndex: 2,
      customerIndex: 14,
      daysOffset: 30,
      startHour: 10,
      duration: 4,
      status: "CONFIRMED",
    },
    // Future pending
    {
      spaceIndex: 0,
      customerIndex: 15,
      daysOffset: 2,
      startHour: 16,
      duration: 2,
      status: "PENDING",
      notes: "確認待ち",
    },
    {
      spaceIndex: 2,
      customerIndex: 16,
      daysOffset: 4,
      startHour: 11,
      duration: 3,
      status: "PENDING",
    },
    {
      spaceIndex: 1,
      customerIndex: 17,
      daysOffset: 6,
      startHour: 14,
      duration: 2,
      status: "PENDING",
    },
    {
      spaceIndex: 0,
      customerIndex: 18,
      daysOffset: 9,
      startHour: 9,
      duration: 3,
      status: "PENDING",
    },
    {
      spaceIndex: 2,
      customerIndex: 19,
      daysOffset: 11,
      startHour: 13,
      duration: 4,
      status: "PENDING",
      notes: "新規お客様",
      paymentStatus: "FAILED", // PaymentStatus.FAILED カバレッジ（Stripe 決済失敗）
    },
    {
      spaceIndex: 1,
      customerIndex: 20,
      daysOffset: 15,
      startHour: 10,
      duration: 2,
      status: "PENDING",
    },
    {
      spaceIndex: 0,
      customerIndex: 21,
      daysOffset: 18,
      startHour: 15,
      duration: 3,
      status: "PENDING",
      notes: "仮予約",
    },
    {
      spaceIndex: 2,
      customerIndex: 22,
      daysOffset: 22,
      startHour: 11,
      duration: 2,
      status: "PENDING",
    },
    {
      spaceIndex: 1,
      customerIndex: 23,
      daysOffset: 26,
      startHour: 14,
      duration: 4,
      status: "PENDING",
    },
    {
      spaceIndex: 0,
      customerIndex: 24,
      daysOffset: 29,
      startHour: 9,
      duration: 3,
      status: "PENDING",
      notes: "来月の予約",
    },
  ];

  for (const res of reservations) {
    const space = spaces[res.spaceIndex % spaces.length];
    const customer = customers[res.customerIndex % customers.length];
    if (!space || !customer) continue;

    const date = new Date(now);
    date.setDate(date.getDate() + res.daysOffset);
    date.setHours(res.startHour, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(endDate.getHours() + res.duration);

    const existing = await prisma.reservation.findFirst({
      where: {
        spaceId: space.id,
        customerId: customer.id,
        startTime: date,
      },
    });

    if (!existing) {
      const basePrice = Number(space.hourlyPrice) * res.duration;
      let couponDiscountAmount: number | null = null;
      let couponId: string | null = null;

      // クーポン適用（一部の予約にのみ）
      if (res.applyCoupon && welcomeCoupon) {
        couponId = welcomeCoupon.id;
        couponDiscountAmount =
          basePrice * (Number(welcomeCoupon.discountValue) / 100);
      }

      const totalPrice = basePrice - (couponDiscountAmount ?? 0);

      await prisma.reservation.create({
        data: {
          spaceId: space.id,
          customerId: customer.id,
          startTime: date,
          endTime: endDate,
          status: res.status,
          basePrice: new Prisma.Decimal(basePrice),
          totalPrice: new Prisma.Decimal(totalPrice),
          couponId,
          couponDiscountAmount: couponDiscountAmount
            ? new Prisma.Decimal(couponDiscountAmount)
            : null,
          ...(res.notes != null ? { notes: res.notes } : {}),
          ...(res.paymentStatus !== undefined
            ? { paymentStatus: res.paymentStatus }
            : {}),
        },
      });
      console.log(
        `✅ Created reservation: ${space.name} - ${customer.lastName} (${res.status})`,
      );
    } else {
      console.log(`⏭️ Skipped existing reservation`);
    }
  }
}

// =============================================================================
// News
// =============================================================================

async function seedNews() {
  const newsItems: Prisma.NewsCreateInput[] = [
    {
      slug: "year-end-business-hours",
      title: "【重要】年末年始の営業について",
      contentHtml: `いつもMyrrh Rental Spaceをご利用いただきありがとうございます。

年末年始の営業日程についてお知らせいたします。

【休業期間】
12月29日（日）〜 1月3日（金）

【通常営業開始】
1月4日（土）より通常営業

休業期間中にいただいたお問い合わせは、1月4日以降順次ご対応させていただきます。
ご不便をおかけいたしますが、何卒よろしくお願いいたします。`,
      isPublished: true,
      publishedAt: new Date(),
    },
    {
      slug: "new-seminar-room-open",
      title: "新スペース「セミナールーム」オープンのお知らせ",
      contentHtml: `この度、最大30名収容可能な「セミナールーム」を新たにオープンいたしました。

セミナー、ワークショップ、説明会、発表会など、様々な用途でご利用いただけます。

【特徴】
・最大30名収容
・大型スクリーン＆プロジェクター完備
・ワイヤレスマイク2本付き
・可動式テーブル・椅子でレイアウト自由

オープン記念として、1月末まで全日20%OFFでご提供いたします。
この機会にぜひご利用ください。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "wifi-upgrade",
      title: "Wi-Fi回線を増強しました",
      contentHtml: `より快適にご利用いただけるよう、全スペースのWi-Fi回線を増強いたしました。

これにより、オンライン会議や大容量データの送受信もストレスなく行えるようになりました。

ぜひご利用ください。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "website-renewal",
      title: "ホームページをリニューアルしました",
      contentHtml: `Myrrh Rental Spaceのホームページをリニューアルいたしました。

より見やすく、使いやすいデザインに生まれ変わりました。
スペースの検索・予約もスムーズに行えるようになっています。

今後ともMyrrh Rental Spaceをよろしくお願いいたします。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "spring-campaign-draft",
      title: "【未公開】春のキャンペーン企画中",
      contentHtml: `春のキャンペーンを企画中です。詳細は後日公開予定。`,
      isPublished: false,
      publishedAt: null,
    },
    {
      slug: "corporate-monthly-plan",
      title: "法人向け月額プランを開始しました",
      contentHtml: `法人のお客様向けに、お得な月額プランを開始いたしました。

【プラン内容】
・月10時間プラン: 20,000円（税込）
・月20時間プラン: 35,000円（税込）
・月40時間プラン: 60,000円（税込）

【特典】
・通常料金より最大25%お得
・請求書払い対応
・優先予約（1週間前から予約可能）
・専任サポート

詳細はお問い合わせください。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "credit-card-payment",
      title: "クレジットカード決済に対応しました",
      contentHtml: `ご要望の多かったクレジットカード決済に対応いたしました。

【対応カード】
・Visa
・Mastercard
・American Express
・JCB

予約時にオンラインで決済いただけるようになり、より便利にご利用いただけます。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "media-coverage-newspaper",
      title: "【メディア掲載】〇〇新聞に紹介されました",
      contentHtml: `2025年12月の〇〇新聞「注目のレンタルスペース特集」にて、当スペースが紹介されました。

「駅近でアクセス抜群、設備も充実した使いやすいスペース」としてご紹介いただきました。

記事の詳細はこちらから（リンク）

引き続きサービス向上に努めてまいります。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "users-1000-milestone",
      title: "ご利用者数1000名を突破しました",
      contentHtml: `おかげさまで、累計ご利用者数が1000名を突破いたしました。

日頃よりご愛顧いただき、誠にありがとうございます。

これを記念して、期間限定で以下のキャンペーンを実施いたします。

【キャンペーン内容】
・ご利用料金10%OFF（2月末まで）
・リピーター様限定：次回予約時に使える500円クーポン進呈

今後とも変わらぬご愛顧のほど、よろしくお願いいたします。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "hvac-renewal",
      title: "空調設備をリニューアルしました",
      contentHtml: `全スペースの空調設備をリニューアルいたしました。

【改善点】
・最新型のエアコンに入れ替え
・個別温度調整が可能に
・静音性の向上
・省エネ対応

より快適な環境でご利用いただけるようになりました。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 55 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "terms-revision-notice",
      title: "【重要】利用規約改定のお知らせ",
      contentHtml: `2026年1月1日より、利用規約を一部改定いたします。

【主な変更点】
・キャンセルポリシーの明確化
・禁止事項の追加
・個人情報の取り扱いに関する記載の更新

詳細は「利用規約」ページをご確認ください。

今後ともよろしくお願いいたします。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "reservation-system-update",
      title: "オンライン予約システムをアップデートしました",
      contentHtml: `オンライン予約システムをアップデートいたしました。

【改善点】
・スマートフォンでの操作性向上
・予約カレンダーの視認性改善
・複数日予約に対応
・予約確認メールのデザイン刷新

より使いやすくなったシステムをぜひお試しください。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "temporary-closure-staff-training",
      title: "スタッフ研修のため臨時休業のお知らせ",
      contentHtml: `下記日程におきまして、スタッフ研修のため臨時休業とさせていただきます。

【臨時休業日】
3月15日（土）終日

ご不便をおかけいたしますが、何卒ご了承ください。

3月16日（日）より通常営業いたします。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "parking-partnership",
      title: "駐車場提携を開始しました",
      contentHtml: `近隣の駐車場「〇〇パーキング」との提携を開始いたしました。

【特典】
当スペースをご利用の方は、駐車料金が最大3時間無料になります。

【利用方法】
1. 駐車時に駐車券を受け取る
2. スペース利用後、スタッフに駐車券を提示
3. 割引処理後、お車でお帰りください

お車でお越しの方もご利用しやすくなりました。`,
      isPublished: true,
      publishedAt: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000),
    },
    {
      slug: "new-service-coming-soon",
      title: "【未公開】新サービス準備中",
      contentHtml: `2026年春に向けて、新サービスを準備中です。

詳細は後日発表いたします。お楽しみに！`,
      isPublished: false,
      publishedAt: null,
    },
  ];

  for (const news of newsItems) {
    const existing = await prisma.news.findUnique({
      where: { slug: news.slug },
    });
    if (!existing) {
      // Lexical JSON 同時保存（CLAUDE.md ハードルール: contentHtml 単独禁止）
      const plainText = stripHtmlToText(news.contentHtml, 4000);
      const contentJson = JSON.parse(
        buildParagraphEditorStateJson(plainText),
      ) as Prisma.InputJsonValue;
      await prisma.news.create({
        data: {
          ...news,
          contentHtml: buildParagraphHtml(plainText),
          contentJson,
        },
      });
      console.log(`✅ Created news: ${news.title.slice(0, 30)}...`);
    } else {
      console.log(`⏭️ Skipped existing news: ${news.title.slice(0, 30)}...`);
    }
  }
}

// =============================================================================
// Pages
// =============================================================================

async function seedPages() {
  const { bootstrapSystemPagesCommand } =
    await import("@/shared/domain/pages/system-pages-commands");
  await bootstrapSystemPagesCommand(prisma);
  console.log("✅ System pages ensured");

  // ホームページに page-hero セクション（order=-1）を idempotent に挿入
  const homePage = await prisma.page.findUnique({
    where: { slug: "home" },
    select: { id: true },
  });
  if (homePage) {
    const existingHero = await prisma.section.findFirst({
      where: { pageId: homePage.id, type: "page-hero" },
      select: { id: true },
    });
    if (!existingHero) {
      await prisma.section.create({
        data: {
          pageId: homePage.id,
          type: "page-hero",
          config: DEFAULT_PAGE_HERO,
          order: -1,
          isActive: true,
        },
      });
      console.log("✅ Inserted page-hero section for home page");
    }
  }
}

// =============================================================================
// Terms (clean-break rebuild — VARCHAR type, single document per type)
// =============================================================================

async function seedTerms() {
  const settings = await prisma.settings.findFirst();
  const businessName = settings?.businessName ?? "Myrrh Rental Space";

  const terms = [
    {
      type: "terms-of-use",
      slug: "terms-of-use",
      title: "利用規約",
      contentText: `${businessName}の利用規約\n\n本規約は、${businessName}が提供するサービスのご利用条件を定めるものです。\n本サービスをご利用いただくお客様には、本規約に同意していただくものとします。`,
      requiredAtReservation: true,
      requiredAtInquiry: false,
      requiredAtSignup: true,
      footerOrder: 0,
    },
    {
      type: "privacy-policy",
      slug: "privacy-policy",
      title: "プライバシーポリシー",
      contentText: `${businessName}のプライバシーポリシー\n\n本ポリシーは、${businessName}が取得する個人情報の取り扱いについて定めるものです。\nお客様の個人情報は、関連法令に従い適切に管理いたします。`,
      requiredAtReservation: false,
      requiredAtInquiry: true,
      requiredAtSignup: true,
      footerOrder: 1,
    },
    {
      type: "cancellation",
      slug: "cancellation-policy",
      title: "キャンセルポリシー",
      contentText: `${businessName}のキャンセルポリシー\n\n予約のキャンセルについては、以下の条件に従って対応いたします。\n詳細は管理画面で編集してください。`,
      requiredAtReservation: true,
      requiredAtInquiry: false,
      requiredAtSignup: false,
      footerOrder: 2,
    },
    {
      type: "commercial-transaction",
      slug: "commercial-transaction",
      title: "特定商取引法に基づく表記",
      contentText: `特定商取引法に基づく表記\n\n販売事業者: ${businessName}\nその他の表記事項は管理画面で編集してください。`,
      requiredAtReservation: false,
      requiredAtInquiry: false,
      requiredAtSignup: false,
      footerOrder: 3,
    },
  ];

  for (const t of terms) {
    const { json: contentJson, html: contentHtml } = buildLexicalContent(
      t.contentText,
    );
    await prisma.termsDocument.upsert({
      where: { slug: t.slug },
      update: {
        type: t.type,
        title: t.title,
        contentJson,
        contentHtml,
        requiredAtReservation: t.requiredAtReservation,
        requiredAtInquiry: t.requiredAtInquiry,
        requiredAtSignup: t.requiredAtSignup,
        footerOrder: t.footerOrder,
      },
      create: {
        type: t.type,
        slug: t.slug,
        title: t.title,
        contentJson,
        contentHtml,
        isPublished: true,
        publishedAt: new Date(),
        requiredAtReservation: t.requiredAtReservation,
        requiredAtInquiry: t.requiredAtInquiry,
        requiredAtSignup: t.requiredAtSignup,
        showInFooter: true,
        footerOrder: t.footerOrder,
      },
    });
    console.log(`✅ Upserted terms: ${t.title}`);
  }
}

// =============================================================================
// FAQ
// =============================================================================

async function seedFaq() {
  const faqData = [
    {
      category: {
        name: "ご予約について",
        slug: "reservation",
        description: "予約に関するよくあるご質問",
        order: 0,
      },
      items: [
        {
          question: "予約はどのくらい前からできますか？",
          answer: "ご予約は3ヶ月前から承っております。",
        },
        {
          question: "予約のキャンセルはできますか？",
          answer:
            "はい、可能です。キャンセル規定は7日前まで無料、3日前まで50%、前日・当日100%となります。",
        },
        {
          question: "予約の変更はできますか？",
          answer: "日時・スペースの変更は3日前まで無料で承ります。",
        },
        {
          question: "当日予約は可能ですか？",
          answer:
            "空き状況によっては可能です。お電話にてお問い合わせください。",
        },
        {
          question: "定期利用の割引はありますか？",
          answer: "月4回以上のご利用で10%OFF、月8回以上で15%OFFとなります。",
        },
      ],
    },
    {
      category: {
        name: "お支払いについて",
        slug: "payment",
        description: "料金・お支払いに関するご質問",
        order: 1,
      },
      items: [
        {
          question: "支払い方法は何がありますか？",
          answer:
            "クレジットカード、銀行振込、請求書払い（法人のみ）に対応しております。",
        },
        {
          question: "領収書は発行できますか？",
          answer: "はい、マイページよりダウンロードいただけます。",
        },
        {
          question: "請求書払いは可能ですか？",
          answer: "法人のお客様に限り対応しております。",
        },
        {
          question: "延長料金はいくらですか？",
          answer: "30分単位で、通常の時間料金の50%となります。",
        },
      ],
    },
    {
      category: {
        name: "設備・備品について",
        slug: "facilities",
        description: "スペースの設備に関するご質問",
        order: 2,
      },
      items: [
        {
          question: "Wi-Fiは利用できますか？",
          answer: "はい、全スペースで高速Wi-Fiを無料でご利用いただけます。",
        },
        {
          question: "プロジェクターの持ち込みは可能ですか？",
          answer: "可能ですが、各スペースにプロジェクターを完備しております。",
        },
        {
          question: "飲食の持ち込みはできますか？",
          answer: "はい、可能です。ゴミはお持ち帰りください。",
        },
        {
          question: "ホワイトボードはありますか？",
          answer: "全ての会議室・セミナールームに完備しております。",
        },
        {
          question: "電源・延長コードは使えますか？",
          answer:
            "各席に電源コンセントを完備しております。延長コードも無料貸出しております。",
        },
      ],
    },
  ];

  for (const { category, items } of faqData) {
    let faqCategory = await prisma.faqCategory.findUnique({
      where: { slug: category.slug },
    });

    if (!faqCategory) {
      faqCategory = await prisma.faqCategory.create({ data: category });
      console.log(`✅ Created FAQ category: ${category.name}`);
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      const existing = await prisma.faqItem.findFirst({
        where: { categoryId: faqCategory.id, question: item.question },
      });

      if (!existing) {
        await prisma.faqItem.create({
          data: {
            categoryId: faqCategory.id,
            question: item.question,
            answer: item.answer,
            order: i,
            isPublished: true,
            publishedAt: new Date(),
          },
        });
        console.log(`✅ Created FAQ item: ${item.question.slice(0, 30)}...`);
      }
    }
  }
}

// =============================================================================
// Blog Categories & Posts
// =============================================================================

async function seedBlog() {
  const author = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!author) {
    console.log("⚠️ No admin user found. Skipping blog seed.");
    return;
  }

  // Create categories (未分類はマイグレーションで作成済み)
  const categories = [
    {
      name: "活用事例",
      slug: "case-study",
      description: "スペースの活用事例をご紹介",
    },
    { name: "お役立ち情報", slug: "tips", description: "ビジネスに役立つ情報" },
    {
      name: "スタッフブログ",
      slug: "staff-blog",
      description: "スタッフの日常やお知らせ",
    },
  ];

  for (const category of categories) {
    const existing = await prisma.postCategory.findUnique({
      where: { slug: category.slug },
    });
    if (!existing) {
      await prisma.postCategory.create({ data: category });
      console.log(`✅ Created post category: ${category.name}`);
    }
  }

  const caseStudyCategory = await prisma.postCategory.findUnique({
    where: { slug: "case-study" },
  });
  const tipsCategory = await prisma.postCategory.findUnique({
    where: { slug: "tips" },
  });

  if (!caseStudyCategory || !tipsCategory) {
    console.log("⚠️ Categories not found. Skipping blog posts.");
    return;
  }

  const posts: (Prisma.PostUncheckedCreateInput & { tagNames: string[] })[] = [
    {
      title: "レンタルスペースを活用したセミナー開催のコツ",
      slug: "seminar-tips",
      excerpt:
        "セミナーを成功させるための会場選びと準備のポイントをご紹介します。",
      contentHtml: `# レンタルスペースを活用したセミナー開催のコツ

セミナーを開催する際、会場選びは成功の鍵を握る重要な要素です。

## 1. 適切な広さを選ぶ
参加者数の1.5倍程度の収容人数を目安に選びましょう。

## 2. 設備をチェック
プロジェクター、スクリーン、マイク、Wi-Fiの有無を確認しましょう。

## 3. アクセスの良さ
駅から徒歩5分以内がおすすめです。`,
      thumbnailUrl: "/images/seed/blog.svg",
      categoryId: tipsCategory.id,
      authorId: author.id,
      tagNames: ["セミナー", "会場選び", "ビジネス"],
      status: "PUBLISHED",
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      title: "会議室の上手な使い方 - 生産性を上げる5つのポイント",
      slug: "meeting-room-productivity",
      excerpt: "会議の生産性を高めるための会議室の使い方をご紹介します。",
      contentHtml: `# 会議室の上手な使い方

会議が長引いてしまう、なかなか結論が出ない...そんなお悩みを解決します。

## 1. 適切なサイズの部屋を選ぶ
## 2. ホワイトボードを活用する
## 3. タイムキーパーを設ける
## 4. スタンディングミーティングを取り入れる
## 5. 会議後の片付けまで時間に含める`,
      thumbnailUrl: "/images/seed/meeting-room.svg",
      categoryId: tipsCategory.id,
      authorId: author.id,
      tagNames: ["会議", "生産性", "ビジネス"],
      status: "PUBLISHED",
      publishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
    {
      title: "【活用事例】IT企業様の社内研修でご利用いただきました",
      slug: "case-study-it-training",
      excerpt:
        "セミナールームを社内研修でご利用いただいたIT企業様の事例をご紹介します。",
      contentHtml: `# IT企業様の社内研修でご利用いただきました

先日、IT企業のA社様に社内研修でセミナールームをご利用いただきました。

## ご利用の背景
急成長中のスタートアップ企業で、オフィスには研修用の大きな部屋がなく外部会場を探されていました。

## 選んでいただいた理由
- 駅から近くアクセス抜群
- 30名収容可能な広さ
- プロジェクター・マイク完備`,
      thumbnailUrl: "/images/seed/blog-case-study.svg",
      categoryId: caseStudyCategory.id,
      authorId: author.id,
      tagNames: ["活用事例", "研修", "IT企業"],
      status: "PUBLISHED",
      publishedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    },
    {
      title: "リモートワーク時代のコワーキングスペース活用術",
      slug: "remote-work-coworking",
      excerpt:
        "リモートワークの普及に伴い、コワーキングスペースの需要が高まっています。",
      contentHtml: `# リモートワーク時代のコワーキングスペース活用術

## なぜコワーキングスペースが選ばれるのか
1. 集中できる環境
2. 設備が整っている
3. 気分転換になる
4. 人との出会い`,
      thumbnailUrl: "/images/seed/coworking.svg",
      categoryId: tipsCategory.id,
      authorId: author.id,
      tagNames: ["リモートワーク", "コワーキング", "働き方"],
      status: "PUBLISHED",
      publishedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
    },
    {
      title: "2026年のオフィストレンドとレンタルスペースの役割",
      slug: "office-trends-2026",
      excerpt:
        "2026年のオフィストレンドを予測し、レンタルスペースの可能性を探ります。",
      contentHtml: `# 2026年のオフィストレンドとレンタルスペースの役割

## トレンド1: ハイブリッドワークの定着
## トレンド2: フレキシブルオフィスの増加
## トレンド3: コラボレーションスペースの重視`,
      thumbnailUrl: "/images/seed/blog.svg",
      categoryId: tipsCategory.id,
      authorId: author.id,
      tagNames: ["トレンド", "オフィス", "働き方改革"],
      status: "DRAFT",
      publishedAt: null,
    },
    {
      // PostStatus.ARCHIVED カバレッジ
      title: "【アーカイブ】旧サービス案内（2025年3月まで）",
      slug: "archived-legacy-service",
      excerpt: "現行サービスに移行済みの旧案内記事のアーカイブです。",
      contentHtml: `# 旧サービス案内（アーカイブ）

2025年4月より、当記事で紹介していたサービスはリニューアルされました。

現行のサービス案内は新しい記事をご参照ください。`,
      thumbnailUrl: "/images/seed/blog.svg",
      categoryId: tipsCategory.id,
      authorId: author.id,
      tagNames: ["アーカイブ", "サービス変更"],
      status: "ARCHIVED",
      publishedAt: new Date("2025-01-15T00:00:00+09:00"),
    },
  ];

  for (const { tagNames, ...postData } of posts) {
    const existing = await prisma.post.findUnique({
      where: { slug: postData.slug },
    });
    if (!existing) {
      // タグを先にfindOrCreate
      const tagIds = await Promise.all(
        tagNames.map(async (name: string) => {
          let tag = await prisma.postTag.findFirst({ where: { name } });
          if (!tag) {
            tag = await prisma.postTag.create({ data: { name, slug: name } });
          }
          return tag.id;
        }),
      );

      // Lexical JSON 同時保存（CLAUDE.md ハードルール: contentHtml 単独禁止）。
      // Markdown 風の # 見出しは段落テキストに平坦化（seed 簡易版、管理画面で再編集可能）
      const rawContent =
        typeof postData.contentHtml === "string" ? postData.contentHtml : "";
      const plainText = stripHtmlToText(rawContent, 4000);
      const contentJson = JSON.parse(
        buildParagraphEditorStateJson(plainText),
      ) as Prisma.InputJsonValue;

      await prisma.post.create({
        data: {
          ...postData,
          contentHtml: buildParagraphHtml(plainText),
          contentJson,
          postTags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
      });
      console.log(`✅ Created blog post: ${postData.title.slice(0, 30)}...`);
    } else {
      console.log(
        `⏭️ Skipped existing blog post: ${postData.title.slice(0, 30)}...`,
      );
    }
  }
}

// =============================================================================
// Blog Comments
// =============================================================================

async function seedBlogComments() {
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    take: 3,
  });
  if (posts.length === 0) {
    console.log("⚠️ No published blog posts found. Skipping comments seed.");
    return;
  }

  const comments = [
    {
      guestName: "山田太郎",
      guestEmail: "yamada@example.com",
      content: "とても参考になりました！",
    },
    {
      guestName: "鈴木花子",
      guestEmail: "suzuki@example.com",
      content: "会議室選びで悩んでいたので助かりました。",
    },
    {
      guestName: "田中一郎",
      guestEmail: "tanaka@example.com",
      content: "実際に利用してみて、記事の通りでした！",
    },
    {
      guestName: "佐藤美咲",
      guestEmail: "sato@example.com",
      content: "もう少し詳しく知りたいです。",
    },
    {
      guestName: "高橋健太",
      guestEmail: "takahashi@example.com",
      content: "素晴らしい記事ですね。",
    },
  ];

  for (let i = 0; i < comments.length; i++) {
    const post = posts[i % posts.length];
    const comment = comments[i];
    if (!post || !comment) continue;

    const existing = await prisma.postComment.findFirst({
      where: { postId: post.id, guestEmail: comment.guestEmail },
    });

    if (!existing) {
      await prisma.postComment.create({
        data: { postId: post.id, ...comment },
      });
      console.log(`✅ Created blog comment by ${comment.guestName}`);
    }
  }
}

// =============================================================================
// Navigation
// =============================================================================

async function seedNavigation() {
  const headerItems = [
    { label: "ホーム", url: "/", order: 0 },
    { label: "スペース", url: "/spaces", order: 1 },
    { label: "イベント", url: "/events", order: 2 },
    { label: "ブログ", url: "/posts", order: 3 },
    { label: "お知らせ", url: "/news", order: 4 },
    { label: "よくある質問", url: "/faq", order: 5 },
    { label: "アクセス", url: "/access", order: 6 },
    { label: "お問い合わせ", url: "/contact", order: 7 },
  ];

  const footerItems = [
    { label: "規約一覧", url: "/terms", order: 0 },
    { label: "会社概要", url: "/about", order: 1 },
    { label: "お問い合わせ", url: "/contact", order: 2 },
  ];

  for (const item of headerItems) {
    const existing = await prisma.navigationItem.findFirst({
      where: { type: "HEADER_DESKTOP", url: item.url },
    });
    if (!existing) {
      await prisma.navigationItem.create({
        data: { ...item, type: "HEADER_DESKTOP" },
      });
    }
  }

  for (const item of headerItems) {
    const existing = await prisma.navigationItem.findFirst({
      where: { type: "HEADER_MOBILE", url: item.url },
    });
    if (!existing) {
      await prisma.navigationItem.create({
        data: { ...item, type: "HEADER_MOBILE" },
      });
    }
  }

  for (const item of footerItems) {
    const existing = await prisma.navigationItem.findFirst({
      where: { type: "FOOTER", url: item.url },
    });
    if (!existing) {
      await prisma.navigationItem.create({ data: { ...item, type: "FOOTER" } });
    }
  }

  console.log("✅ Created navigation items");
}

// =============================================================================
// Announcement Bar
// =============================================================================

async function seedAnnouncementBar() {
  const announcements = [
    {
      message: "【お知らせ】年末年始の営業日程を掲載しました",
      type: "info" as const,
      linkUrl: "/news",
      linkText: "詳細を見る",
      priority: 0,
    },
    {
      message: "オープン記念！今月末まで全スペース20%OFF",
      type: "promo" as const,
      linkUrl: "/spaces",
      linkText: "スペースを見る",
      priority: 1,
    },
    {
      message: "1月15日（水）は設備点検のため休館いたします",
      type: "warning" as const,
      priority: 2,
      isActive: false,
    },
  ];

  for (const announcement of announcements) {
    const existing = await prisma.announcementBar.findFirst({
      where: { message: announcement.message },
    });

    if (!existing) {
      await prisma.announcementBar.create({ data: announcement });
      console.log(
        `✅ Created announcement: ${announcement.message.slice(0, 30)}...`,
      );
    }
  }
}

// =============================================================================
// Social Links
// =============================================================================

async function seedSocialLinks() {
  const socialLinks = [
    {
      platform: "TWITTER" as const,
      url: "https://twitter.com/myrrh_rental",
      order: 0,
    },
    {
      platform: "INSTAGRAM" as const,
      url: "https://instagram.com/myrrh_rental",
      order: 1,
    },
    {
      platform: "FACEBOOK" as const,
      url: "https://facebook.com/myrrh.rental",
      order: 2,
    },
    {
      platform: "LINE" as const,
      url: "https://line.me/R/ti/p/@myrrh-rental",
      order: 3,
    },
    {
      platform: "YOUTUBE" as const,
      url: "https://youtube.com/@myrrh-rental",
      order: 4,
      showOnMobile: false,
    },
  ];

  for (const link of socialLinks) {
    const existing = await prisma.socialLink.findFirst({
      where: { platform: link.platform },
    });

    if (!existing) {
      await prisma.socialLink.create({ data: link });
      console.log(`✅ Created social link: ${link.platform}`);
    }
  }
}

// =============================================================================
// System Page Sections (All Pages including Homepage)
// =============================================================================

async function seedSystemPageSections() {
  // Seed homepage sections (linked to Page record with slug "home")
  const homePage = await prisma.page.findUnique({
    where: { slug: "home" },
    select: { id: true },
  });

  if (!homePage) {
    console.log(
      "⚠️ Homepage Page record not found, skipping homepage sections",
    );
  } else {
    const existingHomepageCount = await prisma.section.count({
      where: { pageId: homePage.id },
    });
    if (existingHomepageCount > 0) {
      console.log("⏭️ Homepage sections already exist");
    } else {
      const homeSections = DEFAULT_PAGE_SECTIONS["home"];
      if (homeSections) {
        for (const section of homeSections) {
          const plain = section.content?.trim() ?? "";
          const contentJson = plain
            ? (JSON.parse(
                buildParagraphEditorStateJson(plain),
              ) as Prisma.InputJsonValue)
            : null;
          await prisma.section.create({
            data: {
              pageId: homePage.id,
              type: section.type,
              title: section.title,
              config: section.config,
              contentHtml: plain ? buildParagraphHtml(plain) : section.content,
              ...(contentJson !== null ? { contentJson } : {}),
              order: section.order,
              isActive: section.isActive,
            },
          });
        }
        console.log("✅ Created homepage sections");
      }
    }
  }

  // Seed system page sections (for pages that exist in Page table)
  const systemPageSlugs = [
    "about",
    "contact",
    "faq",
    "news",
    "posts",
    "reservation",
    "spaces",
  ];

  let createdCount = 0;
  for (const slug of systemPageSlugs) {
    const page = await prisma.page.findFirst({ where: { slug } });
    if (!page) continue;

    const existingCount = await prisma.section.count({
      where: { pageId: page.id },
    });
    if (existingCount > 0) continue;

    const defaults = DEFAULT_PAGE_SECTIONS[slug];
    if (!defaults || defaults.length === 0) continue;

    for (const section of defaults) {
      const plain = section.content?.trim() ?? "";
      const contentJson = plain
        ? (JSON.parse(
            buildParagraphEditorStateJson(plain),
          ) as Prisma.InputJsonValue)
        : null;
      await prisma.section.create({
        data: {
          pageId: page.id,
          type: section.type,
          title: section.title,
          config: section.config,
          contentHtml: plain ? buildParagraphHtml(plain) : section.content,
          ...(contentJson !== null ? { contentJson } : {}),
          order: section.order,
          isActive: section.isActive,
        },
      });
    }
    createdCount++;
  }

  if (createdCount > 0) {
    console.log(`✅ Created sections for ${createdCount} system pages`);
  } else {
    console.log("⏭️ System page sections already exist or no pages found");
  }
}

// =============================================================================
// Seed: Events
// =============================================================================

async function seedEvents() {
  // Location は seedLocations で先に作られている前提（seedAll / seedDemo で呼び出し順保証）
  const locationsByName = new Map(
    (await prisma.location.findMany({ select: { id: true, name: true } })).map(
      (l) => [l.name, l.id],
    ),
  );
  const honkanId = locationsByName.get("本館") ?? null;
  const bekkanId = locationsByName.get("別館") ?? null;

  const eventSeedSource: Array<{
    title: string;
    slug: string;
    description: string;
    startTime: Date;
    endTime: Date;
    capacity: number;
    price: number;
    addressDetail?: string;
    locationId?: string | null;
    status: EventStatus;
    registrationOpen: boolean;
    publishedAt?: Date;
  }> = [
    {
      title: "ヨガ＆マインドフルネス体験会",
      slug: "yoga-mindfulness-workshop",
      description:
        "初心者歓迎のヨガ体験会です。心身のリラクゼーションを体験しましょう。",
      startTime: new Date("2026-05-15T10:00:00+09:00"),
      endTime: new Date("2026-05-15T12:00:00+09:00"),
      capacity: 15,
      price: 2000,
      locationId: honkanId,
      addressDetail: "3F スタジオA",
      status: EventStatus.PUBLISHED,
      registrationOpen: true,
      publishedAt: new Date(),
    },
    {
      title: "写真撮影ワークショップ",
      slug: "photography-workshop",
      description:
        "プロカメラマンによる撮影テクニック講座。カメラをお持ちください。",
      startTime: new Date("2026-05-20T14:00:00+09:00"),
      endTime: new Date("2026-05-20T17:00:00+09:00"),
      capacity: 10,
      price: 5000,
      locationId: bekkanId,
      addressDetail: "ギャラリールーム",
      status: EventStatus.PUBLISHED,
      registrationOpen: true,
      publishedAt: new Date(),
    },
    {
      title: "ビジネスネットワーキングイベント",
      slug: "business-networking",
      description: "地域のビジネスオーナーが集まる交流会。軽食付き。",
      startTime: new Date("2026-06-01T18:00:00+09:00"),
      endTime: new Date("2026-06-01T20:00:00+09:00"),
      capacity: 30,
      price: 0,
      locationId: honkanId,
      addressDetail: "1F メインホール",
      status: EventStatus.DRAFT,
      registrationOpen: false,
    },
    {
      title: "キッズアートスクール",
      slug: "kids-art-school",
      description: "お子様向けのアート教室。絵の具や材料は全てご用意します。",
      startTime: new Date("2026-04-10T10:00:00+09:00"),
      endTime: new Date("2026-04-10T12:00:00+09:00"),
      capacity: 8,
      price: 1500,
      // 外部会場（location なし、addressDetail も空）の例
      status: EventStatus.CANCELLED,
      registrationOpen: false,
    },
    {
      title: "【開催終了】春の書道教室",
      slug: "spring-calligraphy-archived",
      description:
        "過去に開催した書道教室のアーカイブです。次回開催をお待ちください。",
      startTime: new Date("2026-03-05T10:00:00+09:00"),
      endTime: new Date("2026-03-05T12:00:00+09:00"),
      capacity: 10,
      price: 3000,
      addressDetail: "渋谷区文化総合センター大和田 和室",
      status: EventStatus.ARCHIVED,
      registrationOpen: false,
      publishedAt: new Date("2026-02-15T09:00:00+09:00"),
    },
  ];

  const events = eventSeedSource.map(({ description, ...rest }) => ({
    ...rest,
    ...buildSeedDescription(description),
  }));

  let createdCount = 0;
  for (const eventData of events) {
    await prisma.event.upsert({
      where: { slug: eventData.slug },
      update: {},
      create: eventData,
    });
    createdCount++;
  }

  // PUBLISHED イベントにサンプル申込を追加
  const publishedEvents = await prisma.event.findMany({
    where: { status: EventStatus.PUBLISHED },
    select: { id: true, slug: true },
  });

  const sampleRegistrations = [
    {
      name: "田中太郎",
      email: "tanaka@example.com",
      phone: null,
      numberOfPeople: 2,
      status: RegistrationStatus.CONFIRMED,
    },
    {
      name: "佐藤花子",
      email: "sato@example.com",
      phone: "090-1234-5678",
      numberOfPeople: 1,
      status: RegistrationStatus.CONFIRMED,
    },
    {
      name: "鈴木一郎",
      email: "suzuki@example.com",
      phone: "080-9876-5432",
      numberOfPeople: 3,
      status: RegistrationStatus.CANCELLED,
    },
  ];

  let registrationCount = 0;
  for (const event of publishedEvents) {
    // idempotent: 既存申込がある場合はスキップ（EventRegistration に unique 制約がないため）
    const existingCount = await prisma.eventRegistration.count({
      where: { eventId: event.id },
    });
    if (existingCount > 0) continue;

    for (const reg of sampleRegistrations) {
      await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          name: reg.name,
          email: reg.email,
          phone: reg.phone,
          numberOfPeople: reg.numberOfPeople,
          status: reg.status,
        },
      });
      registrationCount++;
    }
  }

  console.log(`✅ Upserted ${createdCount.toString()} events`);
  console.log(`✅ Created ${registrationCount.toString()} event registrations`);
}

// =============================================================================
// Space Reviews（予約完了後レビュー）
// =============================================================================

async function seedSpaceReviews() {
  // COMPLETED 予約の先頭 6 件にレビューを紐付け（reservationId が @unique）
  const completedReservations = await prisma.reservation.findMany({
    where: { status: "COMPLETED" },
    orderBy: { startTime: "asc" },
    take: 6,
    select: {
      id: true,
      spaceId: true,
      customerId: true,
    },
  });

  if (completedReservations.length === 0) {
    console.log("⚠️ No completed reservations. Skipping space reviews seed.");
    return;
  }

  const replyAuthor = await prisma.user.findFirst({
    where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
    select: { id: true },
  });

  const reviewTemplates: Array<{
    rating: number;
    title: string;
    comment: string;
    isPublished: boolean;
    replyBody?: string;
  }> = [
    {
      rating: 5,
      title: "最高の空間でした",
      comment:
        "想像以上に綺麗で、設備も充実していました。また利用したいと思います。",
      isPublished: true,
      replyBody:
        "嬉しいお言葉ありがとうございます。またのご利用を心よりお待ちしております。",
    },
    {
      rating: 5,
      title: "セミナー開催に最適",
      comment:
        "受講者から「集中できる環境」と好評でした。プロジェクターも見やすく大満足です。",
      isPublished: true,
    },
    {
      rating: 4,
      title: "立地が良い",
      comment:
        "駅からも近く便利でした。ただエアコンの効きがもう少し強いと嬉しいです。",
      isPublished: true,
      replyBody:
        "貴重なご意見ありがとうございます。空調設定を見直してまいります。",
    },
    {
      rating: 4,
      title: "コストパフォーマンス良好",
      comment:
        "価格に対して設備が充実しており満足です。Wi-Fi も安定していました。",
      isPublished: true,
    },
    {
      rating: 3,
      title: "悪くない",
      comment:
        "清掃状態は概ね問題ありませんでしたが、一部細かい箇所に汚れがありました。",
      isPublished: true,
    },
    {
      rating: 2,
      title: "（非公開）要確認",
      comment: "備品が一部不足していました。管理者による確認をお願いします。",
      isPublished: false,
    },
  ];

  let created = 0;
  for (const [index, reservation] of completedReservations.entries()) {
    const template = reviewTemplates[index] ?? reviewTemplates[0];
    if (!template) continue;

    await prisma.spaceReview.upsert({
      where: { reservationId: reservation.id },
      update: {},
      create: {
        reservationId: reservation.id,
        spaceId: reservation.spaceId,
        customerId: reservation.customerId,
        rating: template.rating,
        title: template.title,
        comment: template.comment,
        isPublished: template.isPublished,
        ...(template.replyBody && replyAuthor
          ? {
              replyBody: template.replyBody,
              repliedAt: new Date(),
              repliedById: replyAuthor.id,
            }
          : {}),
      },
    });
    created++;
  }

  console.log(`✅ Upserted ${created.toString()} space reviews`);
}

// =============================================================================
// Admin Notifications（管理画面通知ベル）
// =============================================================================

async function seedAdminNotifications() {
  // 既存通知ゼロの時のみ作成（upsert 用の unique 制約が無いため count でガード）
  const existingCount = await prisma.adminNotification.count();
  if (existingCount > 0) {
    console.log(
      `⏭️ Skipped admin notifications (${existingCount.toString()} already exist)`,
    );
    return;
  }

  const latestReservation = await prisma.reservation.findFirst({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      customer: { select: { lastName: true, firstName: true } },
    },
  });
  const latestInquiry = await prisma.inquiry.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  const latestReview = await prisma.spaceReview.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, rating: true },
  });
  const latestEvent = await prisma.event.findFirst({
    where: { status: EventStatus.PUBLISHED },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });
  const latestRegistration = await prisma.eventRegistration.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  const notifications: Array<{
    type: string;
    title: string;
    message: string;
    resourceType?: string;
    resourceId?: string;
    isRead: boolean;
    createdAt: Date;
  }> = [];

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

  if (latestReservation?.customer) {
    notifications.push({
      type: "RESERVATION_CREATED",
      title: "新規予約",
      message: `${latestReservation.customer.lastName} ${latestReservation.customer.firstName}様から新規予約が入りました`,
      resourceType: "reservation",
      resourceId: latestReservation.id,
      isRead: false,
      createdAt: hoursAgo(1),
    });
  }
  if (latestInquiry) {
    notifications.push({
      type: "INQUIRY_RECEIVED",
      title: "新着お問い合わせ",
      message: `${latestInquiry.name}様からお問い合わせが届いています`,
      resourceType: "inquiry",
      resourceId: latestInquiry.id,
      isRead: false,
      createdAt: hoursAgo(3),
    });
  }
  if (latestReview) {
    notifications.push({
      type: "REVIEW_POSTED",
      title: "新規レビュー投稿",
      message: `${latestReview.rating.toString()}星のレビューが投稿されました`,
      resourceType: "review",
      resourceId: latestReview.id,
      isRead: false,
      createdAt: hoursAgo(6),
    });
  }
  if (latestRegistration) {
    // Event / EventRegistration は cuid なので AdminNotification.resourceId（@db.Uuid）に入れない
    notifications.push({
      type: "EVENT_REGISTERED",
      title: "イベント申込",
      message: `${latestRegistration.name}様からイベント申込が入りました`,
      isRead: false,
      createdAt: hoursAgo(12),
    });
  }
  if (latestEvent) {
    notifications.push({
      type: "EVENT_PUBLISHED",
      title: "イベント公開",
      message: `「${latestEvent.title}」が公開されました`,
      isRead: true,
      createdAt: hoursAgo(24),
    });
  }

  // 既読済み・アーカイブされた通知も追加（UI デモで既読/未読フィルタを確認可能にする）
  notifications.push(
    {
      type: "RESERVATION_CANCELLED",
      title: "予約キャンセル",
      message: "予約 #a1b2c3d4 がキャンセルされました",
      isRead: true,
      createdAt: hoursAgo(48),
    },
    {
      type: "CUSTOMER_CREATED",
      title: "新規顧客登録",
      message: "新しい顧客が登録されました（ゲスト予約経由）",
      isRead: true,
      createdAt: hoursAgo(72),
    },
    {
      type: "SYSTEM",
      title: "システム通知",
      message: "定期メンテナンスを実施しました",
      isRead: true,
      createdAt: hoursAgo(96),
    },
  );

  if (notifications.length === 0) {
    console.log("⚠️ No dependencies found for admin notifications.");
    return;
  }

  await prisma.adminNotification.createMany({
    data: notifications,
  });

  console.log(
    `✅ Created ${notifications.length.toString()} admin notifications`,
  );
}

// =============================================================================
// Media（メディアライブラリ）
// =============================================================================

async function seedMedia() {
  const existingCount = await prisma.media.count();
  if (existingCount > 0) {
    console.log(`⏭️ Skipped media (${existingCount.toString()} already exist)`);
    return;
  }

  const uploader = await prisma.user.findFirst({
    where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
    select: { id: true },
  });

  const mediaEntries: Array<{
    filename: string;
    url: string;
    mimeType: string;
    size: number;
    type: "IMAGE" | "VIDEO" | "DOCUMENT" | "OTHER";
    usage: "SPACE" | "SITE" | "POST" | "NEWS" | "PAGE" | "EVENT" | "GENERAL";
    alt: string;
    title: string;
    tags: string[];
  }> = [
    {
      filename: "space-meeting-a.svg",
      url: "/images/seed/space-meeting-a.svg",
      mimeType: "image/svg+xml",
      size: 8192,
      type: "IMAGE",
      usage: "SPACE",
      alt: "ミーティングルーム A の内観",
      title: "ミーティングルーム A",
      tags: ["space", "meeting"],
    },
    {
      filename: "space-seminar.svg",
      url: "/images/seed/space-seminar.svg",
      mimeType: "image/svg+xml",
      size: 9216,
      type: "IMAGE",
      usage: "SPACE",
      alt: "セミナールームの内観",
      title: "セミナールーム",
      tags: ["space", "seminar"],
    },
    {
      filename: "space-coworking.svg",
      url: "/images/seed/space-coworking.svg",
      mimeType: "image/svg+xml",
      size: 7680,
      type: "IMAGE",
      usage: "SPACE",
      alt: "コワーキングスペースの内観",
      title: "コワーキングスペース",
      tags: ["space", "coworking"],
    },
    {
      filename: "logo-header.svg",
      url: "/images/seed/logo-header.svg",
      mimeType: "image/svg+xml",
      size: 2048,
      type: "IMAGE",
      usage: "SITE",
      alt: "サイトロゴ（ヘッダー用）",
      title: "ヘッダーロゴ",
      tags: ["logo", "header"],
    },
    {
      filename: "logo-footer.svg",
      url: "/images/seed/logo-footer.svg",
      mimeType: "image/svg+xml",
      size: 2048,
      type: "IMAGE",
      usage: "SITE",
      alt: "サイトロゴ（フッター用）",
      title: "フッターロゴ",
      tags: ["logo", "footer"],
    },
    {
      filename: "ogp-default.svg",
      url: "/images/seed/ogp-default.svg",
      mimeType: "image/svg+xml",
      size: 4096,
      type: "IMAGE",
      usage: "SITE",
      alt: "OGP デフォルト画像",
      title: "OGP 画像",
      tags: ["ogp", "social"],
    },
    {
      filename: "blog-thumbnail-1.svg",
      url: "/images/seed/blog-thumbnail-1.svg",
      mimeType: "image/svg+xml",
      size: 5120,
      type: "IMAGE",
      usage: "POST",
      alt: "ブログ記事サムネイル",
      title: "ブログサムネイル 01",
      tags: ["blog", "thumbnail"],
    },
    {
      filename: "blog-thumbnail-2.svg",
      url: "/images/seed/blog-thumbnail-2.svg",
      mimeType: "image/svg+xml",
      size: 5120,
      type: "IMAGE",
      usage: "POST",
      alt: "ブログ記事サムネイル",
      title: "ブログサムネイル 02",
      tags: ["blog", "thumbnail"],
    },
    // MediaType: VIDEO（動画）
    {
      filename: "space-tour-intro.mp4",
      url: "/images/seed/space-tour-intro.mp4",
      mimeType: "video/mp4",
      size: 5_242_880,
      type: "VIDEO",
      usage: "SPACE",
      alt: "スペース紹介動画",
      title: "スペース紹介ツアー",
      tags: ["space", "video", "tour"],
    },
    // MediaType: DOCUMENT（PDF）
    {
      filename: "space-guide.pdf",
      url: "/images/seed/space-guide.pdf",
      mimeType: "application/pdf",
      size: 1_048_576,
      type: "DOCUMENT",
      usage: "GENERAL",
      alt: "利用ガイド PDF",
      title: "スペース利用ガイド",
      tags: ["guide", "pdf"],
    },
    // MediaType: OTHER（その他）
    {
      filename: "floorplan.dwg",
      url: "/images/seed/floorplan.dwg",
      mimeType: "application/octet-stream",
      size: 524_288,
      type: "OTHER",
      usage: "GENERAL",
      alt: "フロアプラン図面",
      title: "フロアプラン",
      tags: ["floorplan", "cad"],
    },
    // MediaUsage: NEWS
    {
      filename: "news-announcement.svg",
      url: "/images/seed/news-announcement.svg",
      mimeType: "image/svg+xml",
      size: 4096,
      type: "IMAGE",
      usage: "NEWS",
      alt: "お知らせ記事のカバー画像",
      title: "お知らせ用カバー",
      tags: ["news", "cover"],
    },
    // MediaUsage: PAGE
    {
      filename: "page-about-hero.svg",
      url: "/images/seed/page-about-hero.svg",
      mimeType: "image/svg+xml",
      size: 6144,
      type: "IMAGE",
      usage: "PAGE",
      alt: "About ページのヒーロー画像",
      title: "About ヒーロー",
      tags: ["page", "about"],
    },
    // MediaUsage: EVENT
    {
      filename: "event-workshop-hero.svg",
      url: "/images/seed/event-workshop-hero.svg",
      mimeType: "image/svg+xml",
      size: 6144,
      type: "IMAGE",
      usage: "EVENT",
      alt: "イベント告知用ヒーロー画像",
      title: "イベントヒーロー",
      tags: ["event", "workshop"],
    },
  ];

  for (const entry of mediaEntries) {
    await prisma.media.create({
      data: {
        filename: entry.filename,
        storagePath: `seed/${entry.filename}`,
        url: entry.url,
        bucket: "seed",
        mimeType: entry.mimeType,
        size: entry.size,
        type: entry.type,
        usage: entry.usage,
        alt: entry.alt,
        title: entry.title,
        tags: entry.tags as Prisma.InputJsonValue,
        ...(uploader ? { uploadedBy: uploader.id } : {}),
      },
    });
  }

  console.log(`✅ Created ${mediaEntries.length.toString()} media entries`);
}

// =============================================================================
// Block Templates（Lexical 再利用ブロック）
// =============================================================================

async function seedBlockTemplates() {
  const existingCount = await prisma.blockTemplate.count();
  if (existingCount > 0) {
    console.log(
      `⏭️ Skipped block templates (${existingCount.toString()} already exist)`,
    );
    return;
  }

  const creator = await prisma.user.findFirst({
    where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
    select: { id: true },
  });

  const templates = [
    {
      name: "お知らせブロック",
      description: "重要なお知らせを目立たせるためのテンプレート",
      content: "【お知らせ】本日の営業時間は通常通りです。",
    },
    {
      name: "料金案内ブロック",
      description: "スペース料金の定型文",
      content:
        "ご利用料金は時間単位となります。詳細は各スペースページをご覧ください。",
    },
    {
      name: "キャンセル案内ブロック",
      description: "キャンセルポリシーの定型文",
      content:
        "キャンセルは利用日の前日までは無料です。それ以降は所定のキャンセル料が発生します。",
    },
  ];

  for (const template of templates) {
    await prisma.blockTemplate.create({
      data: {
        name: template.name,
        description: template.description,
        nodeJson: JSON.parse(
          buildParagraphEditorStateJson(template.content),
        ) as Prisma.InputJsonValue,
        ...(creator ? { createdBy: creator.id } : {}),
      },
    });
  }

  console.log(`✅ Created ${templates.length.toString()} block templates`);
}

// =============================================================================
// Audit Logs（監査ログ・全 AuditAction カバレッジ）
// =============================================================================

async function seedAuditLog() {
  const existingCount = await prisma.auditLog.count();
  if (existingCount > 0) {
    console.log(
      `⏭️ Skipped audit logs (${existingCount.toString()} already exist)`,
    );
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
    select: { id: true },
  });
  if (!admin) {
    console.log("⚠️ No admin user found. Skipping audit log seed.");
    return;
  }

  const firstPost = await prisma.post.findFirst({
    select: { id: true, title: true },
  });
  const firstSpace = await prisma.space.findFirst({
    select: { id: true, name: true },
  });
  const firstReservation = await prisma.reservation.findFirst({
    select: { id: true },
  });

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  // AuditAction 全 12 値（schema.prisma L1504-1517 と一致）:
  // CREATE / UPDATE / DELETE / PUBLISH / UNPUBLISH / LOGIN_SUCCESS / LOGIN_FAILED /
  // LOGOUT / PERMISSION_DENIED / PASSWORD_CHANGE / PASSWORD_RESET_REQUEST / ROLE_CHANGE
  const entries: Array<{
    action:
      | "CREATE"
      | "UPDATE"
      | "DELETE"
      | "PUBLISH"
      | "UNPUBLISH"
      | "LOGIN_SUCCESS"
      | "LOGIN_FAILED"
      | "LOGOUT"
      | "PERMISSION_DENIED"
      | "PASSWORD_CHANGE"
      | "PASSWORD_RESET_REQUEST"
      | "ROLE_CHANGE";
    resource: string;
    resourceId?: string;
    metadata?: Prisma.InputJsonValue;
    createdAt: Date;
    userId: string | null;
  }> = [
    {
      action: "CREATE",
      resource: "space",
      ...(firstSpace?.id ? { resourceId: firstSpace.id } : {}),
      userId: admin.id,
      createdAt: hoursAgo(72),
    },
    {
      action: "UPDATE",
      resource: "post",
      ...(firstPost?.id ? { resourceId: firstPost.id } : {}),
      userId: admin.id,
      createdAt: hoursAgo(60),
    },
    {
      action: "DELETE",
      resource: "post",
      userId: admin.id,
      createdAt: hoursAgo(48),
    },
    {
      action: "PUBLISH",
      resource: "post",
      ...(firstPost?.id ? { resourceId: firstPost.id } : {}),
      userId: admin.id,
      createdAt: hoursAgo(40),
    },
    {
      action: "UNPUBLISH",
      resource: "post",
      ...(firstPost?.id ? { resourceId: firstPost.id } : {}),
      userId: admin.id,
      createdAt: hoursAgo(36),
    },
    {
      action: "LOGIN_SUCCESS",
      resource: "auth",
      userId: admin.id,
      metadata: { ip: "203.0.113.10", userAgent: "Mozilla/5.0" },
      createdAt: hoursAgo(24),
    },
    {
      action: "LOGIN_FAILED",
      resource: "auth",
      userId: null,
      metadata: { ip: "203.0.113.99", reason: "invalid_password" },
      createdAt: hoursAgo(18),
    },
    {
      action: "LOGOUT",
      resource: "auth",
      userId: admin.id,
      createdAt: hoursAgo(12),
    },
    {
      action: "PERMISSION_DENIED",
      resource: "user",
      userId: admin.id,
      metadata: { attempted: "user:delete", reason: "insufficient_role" },
      createdAt: hoursAgo(8),
    },
    {
      action: "PASSWORD_CHANGE",
      resource: "auth",
      userId: admin.id,
      createdAt: hoursAgo(6),
    },
    {
      action: "PASSWORD_RESET_REQUEST",
      resource: "auth",
      userId: null,
      metadata: { email: "forgot@example.com" },
      createdAt: hoursAgo(4),
    },
    {
      action: "ROLE_CHANGE",
      resource: "user",
      userId: admin.id,
      metadata: { target: "editor@example.com", from: "VIEWER", to: "EDITOR" },
      createdAt: hoursAgo(2),
    },
  ];

  // 最新の予約 CREATE をさらに 1 件（resource バラエティ）
  if (firstReservation?.id) {
    entries.push({
      action: "CREATE",
      resource: "reservation",
      resourceId: firstReservation.id,
      userId: admin.id,
      createdAt: hoursAgo(1),
    });
  }

  for (const entry of entries) {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        resource: entry.resource,
        userId: entry.userId,
        ...(entry.resourceId !== undefined
          ? { resourceId: entry.resourceId }
          : {}),
        ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
        createdAt: entry.createdAt,
      },
    });
  }

  console.log(
    `✅ Created ${entries.length.toString()} audit log entries (all 12 AuditAction values)`,
  );
}

// =============================================================================
// Editor Comments（Lexical MarkNode コメント・全 EditorCommentStatus カバレッジ）
// =============================================================================

async function seedEditorComments() {
  const existingCount = await prisma.editorCommentThread.count();
  if (existingCount > 0) {
    console.log(
      `⏭️ Skipped editor comments (${existingCount.toString()} threads already exist)`,
    );
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
    select: { id: true },
  });
  if (!admin) {
    console.log("⚠️ No admin user found. Skipping editor comments seed.");
    return;
  }

  const posts = await prisma.post.findMany({
    take: 3,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (posts.length < 3) {
    console.log(
      "⚠️ Fewer than 3 posts available. Skipping editor comments seed.",
    );
    return;
  }

  // EditorCommentStatus 全 3 値: ACTIVE / RESOLVED / DELETED
  const threads: Array<{
    markId: string;
    contentType: "post";
    contentId: string;
    quotedText: string;
    status: "ACTIVE" | "RESOLVED" | "DELETED";
    comments: { content: string; isDeleted?: boolean }[];
  }> = [
    {
      markId: "seed-mark-active",
      contentType: "post",
      contentId: posts[0]!.id,
      quotedText: "セミナーを開催する際、会場選びは成功の鍵",
      status: "ACTIVE",
      comments: [
        { content: "ここ、もう少し具体例を足しませんか？" },
        { content: "過去の成功事例を 1 つ挟むと説得力が出ます。" },
      ],
    },
    {
      markId: "seed-mark-resolved",
      contentType: "post",
      contentId: posts[1]!.id,
      quotedText: "会議が長引いてしまう、なかなか結論が出ない",
      status: "RESOLVED",
      comments: [
        { content: "この一文、読み手目線でわかりにくい気がします。" },
        { content: "修正しました。ご確認ください。" },
      ],
    },
    {
      markId: "seed-mark-deleted",
      contentType: "post",
      contentId: posts[2]!.id,
      quotedText: "IT企業様の社内研修",
      status: "DELETED",
      comments: [
        { content: "（削除済み：別ブロックへ移動）", isDeleted: true },
      ],
    },
  ];

  for (const t of threads) {
    const thread = await prisma.editorCommentThread.create({
      data: {
        markId: t.markId,
        contentType: t.contentType,
        contentId: t.contentId,
        quotedText: t.quotedText,
        status: t.status,
        ...(t.status === "RESOLVED"
          ? { resolvedAt: new Date(), resolvedBy: admin.id }
          : {}),
        createdBy: admin.id,
      },
    });
    for (const c of t.comments) {
      await prisma.editorComment.create({
        data: {
          threadId: thread.id,
          content: c.content,
          createdBy: admin.id,
          ...(c.isDeleted
            ? {
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: admin.id,
              }
            : {}),
        },
      });
    }
  }

  console.log(
    `✅ Created ${threads.length.toString()} editor comment threads (ACTIVE / RESOLVED / DELETED)`,
  );
}

// =============================================================================
// Instagram Posts（公開フィード mock データ）
// =============================================================================

async function seedInstagramPosts() {
  const existingCount = await prisma.instagramPost.count();
  if (existingCount > 0) {
    console.log(
      `⏭️ Skipped instagram posts (${existingCount.toString()} already exist)`,
    );
    return;
  }

  // 全 InstagramMediaType（IMAGE / VIDEO / CAROUSEL_ALBUM）を網羅
  const posts: Array<{
    postId: string;
    postUrl: string;
    mediaUrl: string;
    thumbnailUrl: string | null;
    caption: string;
    mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
    permalink: string;
    sortOrder: number;
  }> = [
    {
      postId: "seed-ig-001",
      postUrl: "https://www.instagram.com/p/seed-ig-001/",
      mediaUrl: "/images/seed/space-meeting-a.svg",
      thumbnailUrl: null,
      caption: "本日の会議室A。午後のご予約受付中です。#レンタルスペース",
      mediaType: "IMAGE",
      permalink: "https://www.instagram.com/p/seed-ig-001/",
      sortOrder: 0,
    },
    {
      postId: "seed-ig-002",
      postUrl: "https://www.instagram.com/p/seed-ig-002/",
      mediaUrl: "/images/seed/space-tour-intro.mp4",
      thumbnailUrl: "/images/seed/space-meeting-a.svg",
      caption: "スペース紹介ツアー動画を公開しました。",
      mediaType: "VIDEO",
      permalink: "https://www.instagram.com/p/seed-ig-002/",
      sortOrder: 1,
    },
    {
      postId: "seed-ig-003",
      postUrl: "https://www.instagram.com/p/seed-ig-003/",
      mediaUrl: "/images/seed/space-seminar.svg",
      thumbnailUrl: null,
      caption: "セミナールーム 新レイアウト公開。",
      mediaType: "CAROUSEL_ALBUM",
      permalink: "https://www.instagram.com/p/seed-ig-003/",
      sortOrder: 2,
    },
    {
      postId: "seed-ig-004",
      postUrl: "https://www.instagram.com/p/seed-ig-004/",
      mediaUrl: "/images/seed/space-coworking.svg",
      thumbnailUrl: null,
      caption: "コワーキングスペース、Wi-Fi 増強完了。",
      mediaType: "IMAGE",
      permalink: "https://www.instagram.com/p/seed-ig-004/",
      sortOrder: 3,
    },
    {
      postId: "seed-ig-005",
      postUrl: "https://www.instagram.com/p/seed-ig-005/",
      mediaUrl: "/images/seed/event-workshop-hero.svg",
      thumbnailUrl: null,
      caption: "イベント告知：ヨガ＆マインドフルネス体験会",
      mediaType: "IMAGE",
      permalink: "https://www.instagram.com/p/seed-ig-005/",
      sortOrder: 4,
    },
    {
      postId: "seed-ig-006",
      postUrl: "https://www.instagram.com/p/seed-ig-006/",
      mediaUrl: "/images/seed/blog-thumbnail-1.svg",
      thumbnailUrl: null,
      caption: "ブログ更新：レンタルスペースを活用したセミナー開催のコツ",
      mediaType: "IMAGE",
      permalink: "https://www.instagram.com/p/seed-ig-006/",
      sortOrder: 5,
    },
  ];

  for (const p of posts) {
    await prisma.instagramPost.upsert({
      where: { postId: p.postId },
      update: {},
      create: p,
    });
  }

  console.log(`✅ Upserted ${posts.length.toString()} instagram posts`);
}

// =============================================================================
// Login Attempts（レートリミット・認証追跡）
// =============================================================================

async function seedLoginAttempts() {
  const existingCount = await prisma.loginAttempt.count();
  if (existingCount > 0) {
    console.log(
      `⏭️ Skipped login attempts (${existingCount.toString()} already exist)`,
    );
    return;
  }

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  // 識別子はハッシュ化済み IP の mock（実運用は `hashForKey` の結果）
  const attempts: Array<{
    identifier: string;
    email: string;
    success: boolean;
    createdAt: Date;
  }> = [
    // 成功 3 件
    {
      identifier: "hash-ip-203-0-113-10",
      email: "admin@example.com",
      success: true,
      createdAt: minutesAgo(5),
    },
    {
      identifier: "hash-ip-203-0-113-11",
      email: "editor@example.com",
      success: true,
      createdAt: minutesAgo(30),
    },
    {
      identifier: "hash-ip-203-0-113-12",
      email: "viewer@example.com",
      success: true,
      createdAt: minutesAgo(90),
    },
    // 失敗 3 件（レートリミット検証用・同一 IP 連続失敗を含む）
    {
      identifier: "hash-ip-198-51-100-99",
      email: "bruteforce@example.com",
      success: false,
      createdAt: minutesAgo(2),
    },
    {
      identifier: "hash-ip-198-51-100-99",
      email: "bruteforce@example.com",
      success: false,
      createdAt: minutesAgo(3),
    },
    {
      identifier: "hash-ip-198-51-100-77",
      email: "typo-address@example.com",
      success: false,
      createdAt: minutesAgo(60),
    },
  ];

  for (const a of attempts) {
    await prisma.loginAttempt.create({ data: a });
  }

  console.log(
    `✅ Created ${attempts.length.toString()} login attempts (3 success / 3 failed)`,
  );
}

// =============================================================================
// Post / News Versions（記事バージョン履歴・version 1 スナップショット）
// =============================================================================

async function seedPostVersions() {
  const existingCount = await prisma.postVersion.count();
  if (existingCount > 0) {
    console.log(
      `⏭️ Skipped post versions (${existingCount.toString()} already exist)`,
    );
    return;
  }

  const posts = await prisma.post.findMany({
    select: {
      id: true,
      title: true,
      contentHtml: true,
      contentJson: true,
      authorId: true,
    },
  });

  if (posts.length === 0) {
    console.log("⚠️ No posts found. Skipping post versions seed.");
    return;
  }

  let created = 0;
  for (const post of posts) {
    // `@@unique([postId, version])` があるため upsert で idempotent 化
    await prisma.postVersion.upsert({
      where: { postId_version: { postId: post.id, version: 1 } },
      update: {},
      create: {
        postId: post.id,
        version: 1,
        contentHtml: post.contentHtml,
        ...(post.contentJson !== null
          ? { contentJson: post.contentJson as Prisma.InputJsonValue }
          : {}),
        ...(post.authorId !== null ? { createdBy: post.authorId } : {}),
      },
    });
    created++;
  }

  console.log(`✅ Upserted ${created.toString()} post versions (version 1)`);
}

async function seedNewsVersions() {
  const existingCount = await prisma.newsVersion.count();
  if (existingCount > 0) {
    console.log(
      `⏭️ Skipped news versions (${existingCount.toString()} already exist)`,
    );
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
    select: { id: true },
  });

  const newsItems = await prisma.news.findMany({
    select: {
      id: true,
      title: true,
      contentHtml: true,
      contentJson: true,
    },
  });

  if (newsItems.length === 0) {
    console.log("⚠️ No news found. Skipping news versions seed.");
    return;
  }

  let created = 0;
  for (const news of newsItems) {
    await prisma.newsVersion.upsert({
      where: { newsId_version: { newsId: news.id, version: 1 } },
      update: {},
      create: {
        newsId: news.id,
        version: 1,
        contentHtml: news.contentHtml,
        ...(news.contentJson !== null
          ? { contentJson: news.contentJson as Prisma.InputJsonValue }
          : {}),
        ...(admin?.id ? { createdBy: admin.id } : {}),
      },
    });
    created++;
  }

  console.log(`✅ Upserted ${created.toString()} news versions (version 1)`);
}

// =============================================================================
// User Page Assignments（EDITOR のページ別編集権限）
// =============================================================================

async function seedUserPageAssignments() {
  const editor = await prisma.user.findFirst({
    where: { role: Role.EDITOR },
    select: { id: true },
  });
  if (!editor) {
    console.log("⚠️ No EDITOR user found. Skipping user page assignments.");
    return;
  }

  const assignablePages = await prisma.page.findMany({
    where: { slug: { in: ["about", "contact"] } },
    select: { id: true, slug: true },
  });

  let assigned = 0;
  for (const page of assignablePages) {
    await prisma.userPageAssignment.upsert({
      where: {
        userId_pageId: { userId: editor.id, pageId: page.id },
      },
      update: {},
      create: {
        userId: editor.id,
        pageId: page.id,
      },
    });
    assigned++;
  }

  console.log(
    `✅ Assigned ${assigned.toString()} pages to EDITOR (${assignablePages.map((p) => p.slug).join(", ")})`,
  );
}

// =============================================================================
// Main
// =============================================================================

async function seedAll(email: string, password: string, name: string) {
  await seedAdmin(email, password, name);
  await seedStaffUsers();

  console.log("");
  console.log("📦 Creating demo data...");
  console.log("");

  // Phase 1: 基本設定
  await seedSettings();

  // Phase 2: マスターデータ
  await seedLocations();
  await seedSpaceCategories();

  // Phase 3: スペース（リレーション設定）
  await seedSpaces();

  // Phase 4: 顧客・問い合わせ・クーポン
  await seedCustomers();
  await seedInquiries();
  await seedCoupons();

  // Phase 5: 予約（クーポン適用例含む）
  await seedReservations();

  // Phase 6: コンテンツ
  await seedNews();
  await seedPages();
  await seedFaq();
  await seedTerms();
  await seedBlogTags();
  await seedBlog();
  await seedBlogComments();

  // Phase 7: サイト設定
  await seedNavigation();
  await seedAnnouncementBar();
  await seedSocialLinks();
  await seedSystemPageSections();

  // Phase 8: イベント
  await seedEvents();

  // Phase 9: 新機能（レビュー・通知・メディア・ブロック・ページ権限）
  await seedSpaceReviews();
  await seedAdminNotifications();
  await seedMedia();
  await seedBlockTemplates();
  await seedUserPageAssignments();

  // Phase 10: 監査・バージョン履歴・規約同意・レートリミット・Instagram
  await seedPostVersions();
  await seedNewsVersions();
  await seedAuditLog();
  await seedLoginAttempts();
  await seedEditorComments();
  await seedInstagramPosts();
}

async function seedDemo() {
  console.log("📦 Creating demo data (skip existing)...");
  console.log("");

  // 基本設定
  await seedSettings();

  // マスターデータ
  await seedLocations();
  await seedSpaceCategories();

  // スペース
  await seedSpaces();

  // コンテンツ
  await seedNews();
  await seedPages();
  await seedFaq();
  await seedTerms();
  await seedSystemPageSections();
  await seedNavigation();
  await seedAnnouncementBar();
  await seedSocialLinks();

  // 顧客・問い合わせ・クーポン
  await seedCustomers();
  await seedInquiries();
  await seedCoupons();

  // スタッフユーザー・ブログ (admin必須)
  const adminUser = await prisma.user.findFirst({
    where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
  });
  if (adminUser) {
    await seedStaffUsers();
    await seedBlogTags();
    await seedBlog();
    await seedBlogComments();
  } else {
    console.log("⚠️ No admin user found. Skipping staff users and blog seed.");
    console.log(
      "   Create an admin first: bun prisma/seed.ts --admin <email> <password>",
    );
  }

  // 予約
  await seedReservations();

  // イベント
  await seedEvents();

  // 新機能（レビュー・通知・メディア・ブロック・ページ権限）
  await seedSpaceReviews();
  await seedAdminNotifications();
  await seedMedia();
  await seedBlockTemplates();
  await seedUserPageAssignments();

  // 監査・バージョン履歴・規約同意・レートリミット・Instagram
  await seedPostVersions();
  await seedNewsVersions();
  await seedAuditLog();
  await seedLoginAttempts();
  await seedEditorComments();
  await seedInstagramPosts();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // prisma migrate reset / prisma db seed: 引数なしはデモデータのみ（管理者は別途 --admin）
    console.log("");
    console.log("🌱 prisma seed（引数なし）→ --demo 相当を実行します");
    console.log("");
    await seedDemo();
    console.log("");
    console.log("✨ Seed completed successfully!");
    return;
  }

  const mode = args[0];
  const arg1 = args[1];
  const arg2 = args[2];
  const arg3 = args[3];

  console.log("");
  console.log("🌱 Starting seed...");
  console.log("");

  if (mode === "--admin") {
    if (!arg1 || !arg2) {
      console.error("Error: --admin requires <email> and <password>");
      process.exit(1);
    }
    await seedAdmin(arg1, arg2, arg3 ?? "Administrator");
  } else if (mode === "--demo") {
    await seedDemo();
  } else if (mode === "--fresh") {
    if (!arg1 || !arg2) {
      console.error("Error: --fresh requires <email> and <password>");
      process.exit(1);
    }
    await clearAllData();
    await seedAll(arg1, arg2, arg3 ?? "Administrator");
  } else if (mode === "--all") {
    if (!arg1 || !arg2) {
      console.error("Error: --all requires <email> and <password>");
      process.exit(1);
    }
    await seedAll(arg1, arg2, arg3 ?? "Administrator");
  } else {
    // Legacy mode
    if (mode && arg1 && !mode.startsWith("--")) {
      await seedAdmin(mode, arg1, arg2 ?? "Administrator");
    } else {
      console.error("Unknown option:", mode);
      process.exit(1);
    }
  }

  console.log("");
  console.log("✨ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
