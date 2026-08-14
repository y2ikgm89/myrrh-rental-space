/**
 * Prisma Seed Script
 *
 * 初期データを作成する（Prisma 7 ベストプラクティス準拠）
 *
 * 使用方法（dev / prod を明確に分離）:
 *   bun prisma/seed.ts                          # DEV（既定・冪等）: 完全な開発環境を構築
 *   bun prisma/seed.ts --dev                    #   ↑ の明示エイリアス
 *   bun prisma/seed.ts --production [email] [name]              # PROD: 本番テンプレート（デモ/テストなし）
 *
 * DEV（引数なし）が構築するもの:
 *   - IAP 用の固定スタッフ: admin@example.com（ADMIN）,
 *     superadmin@example.com（SUPER_ADMIN）, editor / viewer
 *   - 全デモデータ（スペース・予約・ブログ・イベント・FAQ 等）
 *   - 全 feature module を ON（管理画面の表示確認用）
 *   ※ `prisma db seed` の既定経路（prisma.config.ts: migrations.seed）。
 *      Prisma ORM v7 では migrate reset 時の自動 seed はないため、
 *      ローカル再構築は `bun run db:reset` が reset 後に明示 seed する。
 *
 * 例:
 *   bun prisma/seed.ts
 *   bun prisma/seed.ts --production owner@example.com "オーナー名"
 *
 * Safety:
 *   `--dev` fail closed against production-looking DATABASE_URL and
 *   deployed runtimes (NODE_ENV=production / APP_SURFACE). See `./seed-safety`.
 */

// Bun runtime が .env / .env.local を自動読み込みするため dotenv は不要。
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  Prisma,
  Role,
  CustomerType,
  DayOfWeek,
  EventScheduleMode,
  EventStatus,
  HolidayMode,
  RegistrationStatus,
  SmartLockDeviceType,
  TermsScope,
} from "../generated/prisma/client";
import {
  asPrismaInputJsonValue,
  parsePrismaInputJson,
} from "@/shared/db/prisma-input-json";
import { hashPassword } from "better-auth/crypto";
import {
  buildInitialFeatureModules,
  parseDisabledFeatureModulesEnv,
} from "../src/shared/lib/features/registry";
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "../src/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "../src/shared/lib/lexical/html-to-plain-text";
import { createSpan, createInlineIcon } from "../src/shared/lib/portable-text";
import {
  AUDIT_LOG_CHAIN_VERSION,
  AUDIT_LOG_GENESIS_HASH,
  AUDIT_LOG_HASH_ALGORITHM,
  computeAuditLogEntryHashWithKey,
  type AuditLogHashPayload,
} from "../src/shared/domain/audit-log/hash-chain-core";
import { evaluateSeedSafety } from "./seed-safety";

import { SEED_TERMS_DOCUMENTS } from "./seed-terms-documents";

/**
 * seed 用ヘルパー: プレーンテキストから 3 カラム同時生成（Lexical JSON / HTML / Plain）。
 * 改行は単一段落に折り畳む（seed 簡易版）。
 */
/**
 * dev seed の前提が崩れていることを、成功で終わらせずに知らせる。
 *
 * ここに来るのは「先に走る phase が作るはずのものが無い」ときだけ。黙って
 * `return` すると seed は最後まで走って `✨ Seed completed successfully!` を出し、
 * 中身が歯抜けの DB が残る。壊れたことに気付くのは E2E が**関係の無い場所**で
 * 落ちたときで、そこから原因に辿り着くのは高くつく。前提が崩れた地点で止める。
 *
 * 戻り型が `never` なので、呼び出した後の分岐で値が narrow される
 * （`if (!x) { seedPreconditionFailed(...) }` の後で `x` は非 null）。
 */
function seedPreconditionFailed(detail: string): never {
  throw new Error(`seed の前提が満たされていません: ${detail}`);
}

function buildSeedDescription(text: string) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const descriptionJsonString = buildParagraphEditorStateJson(collapsed);
  const descriptionHtml = buildParagraphHtml(collapsed);
  return {
    descriptionJson: parsePrismaInputJson(
      descriptionJsonString,
      "seed description JSON が不正です",
    ),
    descriptionHtml,
    descriptionPlainText: stripHtmlToText(descriptionHtml, 200),
  };
}

function buildSeedLexicalContent(plainText: string) {
  const contentJsonString = buildParagraphEditorStateJson(plainText);
  return {
    contentJson: parsePrismaInputJson(
      contentJsonString,
      "seed Lexical contentJson が不正です",
    ),
    // 単段落 seed は buildParagraphHtml（icon なし）。保存時は server derive が正本。
    contentHtml: buildParagraphHtml(plainText),
  };
}

function normalizeSeedEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Prisma アダプター（PrismaPg が Pool ライフサイクルを内部管理）
// Prisma 7 の pg Pool v7 デフォルト（connect 0s）は遅い接続で seed が失敗し得るため、
// アプリ本番（src/shared/db/prisma.ts）と同じ connectionTimeoutMillis を明示する。
const adapter = new PrismaPg({
  connectionString: process.env["DATABASE_URL"],
  connectionTimeoutMillis: 5_000,
});

// Prisma Client（アプリ本番と同じ adapter-pg 構成）
const prisma = new PrismaClient({
  adapter,
});

// =============================================================================
// Helper: Clear All Data (--fresh用)

// =============================================================================
// Helper: Create or Update Staff User (IAP only)
// =============================================================================

interface CreateStaffUserOptions {
  email: string;
  name: string;
  role: Role;
  pageIds?: string[];
}

async function createOrUpdateStaffUser(
  options: CreateStaffUserOptions,
): Promise<boolean> {
  const { email, name, role, pageIds = [] } = options;

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { email },
      data: {
        role,
        name,
        emailVerified: true,
        accounts: {
          deleteMany: {
            providerId: "credential",
          },
        },
        pageAssignments: {
          deleteMany: {},
          create: pageIds.map((pageId) => ({ pageId })),
        },
      },
    });
    return false;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      role,
      emailVerified: true,
      pageAssignments: {
        create: pageIds.map((pageId) => ({ pageId })),
      },
    },
  });

  return true;
}

// =============================================================================
// Helper: Create or Update Customer User with Credential
// =============================================================================

interface CreateCredentialUserOptions {
  email: string;
  password: string;
  name: string;
  role: Role;
  pageIds?: string[];
}

async function createOrUpdateUserWithCredential(
  options: CreateCredentialUserOptions,
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
// Admin User (IAP only)
// =============================================================================

async function seedAdmin(
  email: string,
  name: string = "Administrator",
  role: Role = Role.ADMIN,
) {
  const created = await createOrUpdateStaffUser({
    email,
    name,
    role,
  });

  if (created) {
    console.log(`✅ Created new admin user: ${email}`);
  } else {
    console.log(`✅ Updated existing admin user: ${email}`);
  }

  console.log("   Admin access is protected by Google Cloud IAP.");
}

// =============================================================================
// Staff Users (Demo: RBAC roles)
// =============================================================================

async function seedStaffUsers() {
  const staffUsers: Array<{
    email: string;
    name: string;
    role: Role;
  }> = [
    {
      email: "superadmin@example.com",
      name: "スーパー管理者",
      role: Role.SUPER_ADMIN,
    },
    {
      email: "editor@example.com",
      name: "田中編集者",
      role: Role.EDITOR,
    },
    {
      email: "viewer@example.com",
      name: "鈴木閲覧者",
      role: Role.VIEWER,
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

    await createOrUpdateStaffUser(staff);
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

async function seedSettings(
  options: {
    resetFeatureModules?: boolean;
    includeBusinessPlaceholders?: boolean;
  } = {},
) {
  // dev seed だけが SwitchBot 等の統合を有効化する（本番テンプレートは既定のまま）。
  // 判別子は `includeBusinessPlaceholders`: `seedProduction` だけが false を渡す。
  const enableDevOnlyIntegrations =
    options.includeBusinessPlaceholders !== false;

  // 特定商取引法表示等に関わる法人情報。DB は全列 nullable（NOT NULL 制約なし）で、
  // admin フォームも空欄保存を公式に許容する（個人事業主は法人番号を持たない等）。
  // 空欄なら getOrganizationJsonLdData 側が該当プロパティを丸ごと省略するため、
  // production seed では架空の法人番号・代表者名等を公開データとして投入しない
  // （includeBusinessPlaceholders:false）。dev のみサンプル値で埋める。
  const includeBusinessPlaceholders =
    options.includeBusinessPlaceholders ?? true;
  const businessPlaceholders = includeBusinessPlaceholders
    ? {
        businessName: "株式会社サンプル",
        businessNameKana: "カブシキガイシャサンプル",
        representativeName: "山田 太郎",
        registrationNumber: "1234567890123",
        // 適格請求書発行事業者登録番号 (T + 13桁)。receipt-full-wiring gap の
        // issueReceiptForReservation が issuerSnapshot に凍結し、PDF 領収書の
        // 「登録番号: T…」欄に出力される。dev 領収書発行の動作確認容易化のため
        // 明示値を入れる (production seed は includeBusinessPlaceholders=false で
        // この分岐に入らないため空欄のまま = admin が実登録番号を設定)。
        invoiceNumber: "T1234567890123",
        phoneNumber: "03-1234-5678",
        email: "info@example.com",
        postalCode: "150-0001",
        prefecture: "東京都",
        city: "渋谷区",
        streetAddress: "神宮前1-1-1",
        buildingName: "サンプルビル",
      }
    : {};

  // senderEmail/replyToEmail も同じ理由で架空値を本番に投入しない。特に replyToEmail は
  // env フォールバック層が無く（送信元 From と違い env EMAIL_FROM 相当が存在しない）、
  // DB 値がそのまま全送信メールの Reply-To ヘッダーになる。senderEmail は未設定なら
  // client.ts のハードコード既定値に落ちるだけなので実害はないが、対称性のため揃える。
  const emailPlaceholders = includeBusinessPlaceholders
    ? {
        senderEmail: "noreply@example.com",
        replyToEmail: "support@example.com",
      }
    : { senderEmail: null, replyToEmail: null };

  const organizationData = {
    ...businessPlaceholders,
    senderName: "Myrrh Rental Space",
    ...emailPlaceholders,
    ...(includeBusinessPlaceholders
      ? {
          transferGuidance:
            "ご入金確認後、予約確定のご連絡をいたします。お振込の際は予約番号をご記入ください。",
        }
      : {}),
  };

  const reservationData = {
    cancellationDeadlineHours: 24,
    modificationDeadlineHours: 24,
  };

  const seoData = {
    siteName: "Myrrh Rental Space",
    siteDescription:
      "ビジネスからプライベートまで、様々な用途に対応したレンタルスペース",
    footerCopyright: "© 2025 Myrrh Rental Space. All rights reserved.",
    // ファビコン・ロゴ・OGP（公開ページ表示用）
    // ファビコンは空文字で開始し、admin から R2 アップロードで設定。未設定（空文字）
    // 時は dynamic icon Route Handler (`src/app/icon/route.tsx`) が ImageResponse の
    // default fallback を返すため UX 上は常に何らかのアイコンが配信される。
    // 列は NOT NULL + DEFAULT '' で型強化済（null は許さない）。
    faviconUrl: "",
    defaultOgpImageUrl: "/images/seed/ogp-default.svg",
    headerLogoUrl: "/images/seed/logo-header.svg",
    footerLogoUrl: "/images/seed/logo-footer.svg",
  };

  const featureModules = resolveSeedFeatureModules();

  // featureModules は既定で「create only」（既存 install の管理画面トグル編集を保持）。
  // dev seed のみ resetFeatureModules:true で update 経路にも書き込み、全機能を ON に揃える。
  // SSoT: FEATURE_MODULES_LIST registry + SEED_FEATURE_MODULES_DISABLED env var。
  await prisma.settingsFeatures.upsert({
    where: { id: "singleton" },
    update: options.resetFeatureModules ? { featureModules } : {},
    create: {
      id: "singleton",
      featureModules,
    },
  });

  await Promise.all([
    prisma.settingsOrganization.upsert({
      where: { id: "singleton" },
      update: includeBusinessPlaceholders ? organizationData : {},
      create: { id: "singleton", ...organizationData },
    }),
    prisma.settingsReservation.upsert({
      where: { id: "singleton" },
      update: includeBusinessPlaceholders ? reservationData : {},
      create: { id: "singleton", ...reservationData },
    }),
    prisma.settingsAnnouncementCarousel.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsSystem.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsSeo.upsert({
      where: { id: "singleton" },
      update: includeBusinessPlaceholders ? seoData : {},
      create: { id: "singleton", ...seoData },
    }),
    prisma.settingsAnalytics.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsLayout.upsert({
      where: { id: "singleton" },
      update: {},
      create: {
        id: "singleton",
        footerNavigationLabel: "ナビゲーション",
        footerContactLabel: "お問い合わせ",
        footerHoursLabel: "営業時間",
      },
    }),
    prisma.settingsSidebar.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsCommerce.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsNotification.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsStripe.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsResend.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsTurnstile.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsGoogleMaps.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsGoogleCalendar.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsGoogleBusinessProfile.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsInstagram.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
    prisma.settingsSwitchbot.upsert({
      where: { id: "singleton" },
      // dev は SwitchBot を有効にしておく。以前は
      // `create-passcode-reveal-fixture` が実行時にこの singleton を true へ
      // 書き換えて**戻さなかった**ので、seed が作れる状態（schema 既定の false）と
      // 実際の DB が恒久的に食い違っていた。singleton の書き換えは fixture ではなく
      // seed の宣言に置くほうが観測しやすく、復元 hook も要らない。
      // 本番テンプレート（`seedSettings({ includeBusinessPlaceholders: false })`）
      // には効かせない。
      update: enableDevOnlyIntegrations ? { switchbotEnabled: true } : {},
      create: {
        id: "singleton",
        ...(enableDevOnlyIntegrations ? { switchbotEnabled: true } : {}),
      },
    }),
    prisma.settingsDataRetention.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    }),
  ]);

  console.log("✅ Settings configured");
}

async function seedTransferAccounts() {
  const existing = await prisma.transferAccount.count();
  if (existing > 0) {
    return;
  }

  await prisma.transferAccount.createMany({
    data: [
      {
        label: "三井住友 本店",
        bankName: "三井住友銀行",
        branchName: "渋谷支店",
        accountType: "ORDINARY",
        accountNumber: "1234567",
        accountHolderName: "カ）サンプル",
        note: "振込手数料はお客様負担でお願いします。",
        sortOrder: 0,
        isActive: true,
      },
      {
        label: "三菱UFJ 副口座",
        bankName: "三菱UFJ銀行",
        branchName: "新宿支店",
        accountType: "ORDINARY",
        accountNumber: "7654321",
        accountHolderName: "カ）サンプル",
        sortOrder: 1,
        isActive: true,
      },
    ],
  });
}

// =============================================================================
// Locations
// =============================================================================

async function seedLocations(overridePublished?: boolean) {
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
      isPublished: true,
      latitude: 35.6651,
      longitude: 139.7119,
      phoneNumber: "03-1234-5678",
      email: "honkan@example.com",
      googleBusinessPlaceId: null,
      googleReviewUrl: null,
      priceRange: "¥1,000〜¥5,000/時間",
      paymentAccepted: "現金, クレジットカード, 電子マネー",
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
      isPublished: true,
      latitude: 35.6653,
      longitude: 139.7121,
      phoneNumber: "03-1234-5679",
      email: "bekkan@example.com",
      googleBusinessPlaceId: null,
      googleReviewUrl: null,
      priceRange: "¥800〜¥3,000/時間",
      paymentAccepted: "現金, クレジットカード",
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
      isPublished: false,
      latitude: 35.6896,
      longitude: 139.6917,
      phoneNumber: "03-9876-5432",
      email: "shinjuku@example.com",
      googleBusinessPlaceId: null,
      googleReviewUrl: null,
      priceRange: "¥1,500〜¥8,000/時間",
      paymentAccepted: "現金, クレジットカード, 電子マネー, QRコード決済",
    },
  ];

  // name の一意性は isActive: true な行の間でのみ強制される partial unique
  // index のため、upsert({where:{name}}) は ON CONFLICT ("name") が対応する
  // index (WHERE "isActive" = true) を解決できずエラーになる。SpaceCategory
  // と同型の findFirst + create/update に置き換えて idempotent 化する。
  //
  // **`sortOrder` は fixture に書かず、update でも触らない。** `Location.sortOrder`
  // にも `isActive` 条件の partial unique index があり、管理画面の
  // `updateLocationOrder`（`locations/commands.ts`）が並び替えると値が入れ替わる。
  // 旧実装はリテラルの 0/1/2 を update の data ごと書き戻していたため、
  // 恒等でない並び替えが一度でも行われた DB では re-seed が P2002 で中断し、
  // `main().catch` の `process.exit(1)` で以降の phase が丸ごと走らなくなった。
  // create 時に max+1 で採番すれば宣言順がそのまま表示順になり、衝突しえない
  // （`seedSpaceCategories` と同じ形）。
  // **本番 seed（`seedLocations(false)`）は既存行に触らない。** dev だけが宣言へ
  // 収束させる。`seedSpaces` と同じ形。
  //
  // ここは以前、本番でも既存行を `update` していた。`overridePublished` が効くのは
  // `isPublished` だけなので、住所「東京都渋谷区神宮前1-1-1 サンプルビル」・電話
  // 「03-1234-5678」・座標・料金レンジといった**架空のテンプレート値が、管理画面で
  // 実在の拠点情報に直した行へ書き戻されていた**。しかも公開中の拠点が
  // `isPublished: false` で非公開に落ちる。`--production` の再実行は運用中に起こりうる
  // （初期スタッフ追加など）ので、これは実データの破壊になる。
  const reconcileDeclaredContent = overridePublished === undefined;

  for (const loc of locations) {
    const locationData =
      overridePublished !== undefined
        ? { ...loc, isPublished: overridePublished }
        : loc;
    const existing = await prisma.location.findFirst({
      where: { name: loc.name, isActive: true },
    });
    if (existing) {
      if (!reconcileDeclaredContent) {
        console.log(`⏭️ Skipped existing location: ${loc.name}`);
        continue;
      }
      await prisma.location.update({
        where: { id: existing.id },
        data: locationData,
      });
    } else {
      const maxOrder = await prisma.location.aggregate({
        where: { isActive: true },
        _max: { sortOrder: true },
      });
      await prisma.location.create({
        data: {
          ...locationData,
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        },
      });
    }
  }

  console.log("✅ Upserted locations");
}

// =============================================================================
// Space Categories
// =============================================================================

async function seedSpaceCategories(reconcile = true) {
  // sortOrder は fixture に書かない: create 時に max+1 を都度採番するため
  // 配列の宣言順がそのまま表示順になる（無条件 @unique 衝突を構造的に回避）。
  const categories = [
    {
      name: "会議室",
      description: "少人数から中規模のミーティングに最適",
      icon: "Users",
      color: "#3B82F6",
    },
    {
      name: "セミナールーム",
      description: "大人数の講義やワークショップ向け",
      icon: "Presentation",
      color: "#8B5CF6",
    },
    {
      name: "コワーキング",
      description: "自由席で気軽に作業できるスペース",
      icon: "Laptop",
      color: "#10B981",
    },
    {
      name: "イベントスペース",
      description: "パーティーや展示会などの特別なイベントに",
      icon: "PartyPopper",
      color: "#F59E0B",
    },
  ];

  // Round-5 audit Finding #18: name の一意性は isActive: true な行の間でのみ
  // 強制される partial unique index になったため、upsert({where:{name}}) は
  // (無効化済み行と衝突しうる場合に) 曖昧になる。isActive: true を明示した
  // findFirst + create/update に置き換えて idempotent 化する。
  //
  // sortOrder は (name とは異なり) 無条件 @unique のままのため、create 側で
  // categories 配列のハードコードされた sortOrder をそのまま使うと、同名の
  // 無効化済み行が既に別の sortOrder を占有している状況の re-seed で
  // P2002 衝突を起こしうる（`createSpaceCategory` ドメインコマンドと同様に
  // 都度 max+1 を計算して採番する）。
  //
  // **本番 seed（`seedSpaceCategories(false)`）は既存行に触らない。**
  // description / icon / color を宣言値へ戻さない。dev だけが収束させる。
  for (const cat of categories) {
    const existing = await prisma.spaceCategory.findFirst({
      where: { name: cat.name, isActive: true },
    });
    if (existing) {
      if (!reconcile) {
        console.log(`⏭️ Skipped existing space category: ${cat.name}`);
        continue;
      }
      // Re-seed 時は sortOrder を上書きしない（無条件 @unique 衝突回避）。
      await prisma.spaceCategory.update({
        where: { id: existing.id },
        data: {
          description: cat.description,
          icon: cat.icon,
          color: cat.color,
        },
      });
    } else {
      const maxOrder = await prisma.spaceCategory.aggregate({
        _max: { sortOrder: true },
      });
      await prisma.spaceCategory.create({
        data: { ...cat, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
      });
    }
  }

  console.log("✅ Upserted space categories");
}

/**
 * イベントカテゴリー。**「未分類」は本番でも必要**。
 *
 * `Event.categoryId` は必須（`onDelete: Restrict`）なので、カテゴリーが 1 件も
 * 無い DB では管理画面からイベントを作れない。以前は migration の `INSERT` が
 * 投入していたが、migration 履歴を畳むと消えるのでここへ移した。
 *
 * @param includeDemoCategories dev だけ true。本番は「未分類」のみ投入し、
 *   実際のカテゴリーは管理画面から作ってもらう（架空のカテゴリー名を本番に置かない）。
 */
async function seedEventCategories(includeDemoCategories = true) {
  // sortOrder は fixture に書かない: create 時に max+1 を都度採番する。
  // sortOrder は無条件 @unique なので、リテラルを書くと管理画面での並び替え・追加が
  // その値を占有した瞬間に re-seed が P2002 で落ちる。配列の宣言順が表示順になる。
  const categories = includeDemoCategories
    ? [
        { name: "未分類" },
        { name: "ワークショップ" },
        { name: "マルシェ・展示" },
        { name: "セミナー・交流会" },
        { name: "その他" },
      ]
    : [{ name: "未分類" }];

  // seedSpaceCategories と同型（Round-5 audit Finding #18 の教訓）: name は
  // isActive: true な行の間でのみ強制される partial unique index のため、
  // upsert({where:{name}}) は無効化済み行との衝突で曖昧になる。
  // isActive: true を明示した findFirst + create/update で idempotent 化する。
  for (const cat of categories) {
    const existing = await prisma.eventCategory.findFirst({
      where: { name: cat.name, isActive: true },
    });
    if (existing) {
      // Re-seed 時は sortOrder を上書きしない（「未分類」等との @unique 衝突回避）。
      continue;
    } else {
      const maxOrder = await prisma.eventCategory.aggregate({
        _max: { sortOrder: true },
      });
      await prisma.eventCategory.create({
        data: { ...cat, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
      });
    }
  }

  console.log("✅ Upserted event categories");
}

// =============================================================================
// Spaces (with Location/Category relations)
// =============================================================================

const REVIEW_E2E_SPACE_SLUG = "coworking-space";
const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";

/**
 * dev customer の**会員行**（`userId` を持つ方）を引く。
 *
 * `seedDevCustomerAndReservations` は同じ email で **2 行**作る:
 * 会員（`userId` あり、`Customer.userId` は @unique）と、merge fixture 用の
 * ゲスト（`userId: null`）。`emailCanonical` に unique は無い（`@@index` のみ）
 * ので、email だけで `findFirst` すると **どちらが返るか保証が無い**。
 *
 * これは実害のある曖昧さで、ゲスト行が返るとイベント申込がそちらに紐づく。
 * `/mypage/events` は `getCustomerByUserId(user.id)` で会員行を解決するため
 * （`userId` が @unique なので必ず会員行）、申込は**画面に出てこない**。
 * `calendar-download.spec.ts` はその申込を hard-assert している。
 *
 * fixture 側（`scripts/e2e/**`・`e2e/helpers/**`）は既に 6 箇所で
 * `userId: { not: null }` を付けており、seed だけが取り残されていた。
 * ゲスト行は自分自身の述語（`userId: null, anonymizedAt: null`）で引くので、
 * 互換用の shim は要らない。
 */
async function findDevMemberCustomer<T extends Record<string, boolean>>(
  select: T,
) {
  return prisma.customer.findFirst({
    where: {
      emailCanonical: normalizeSeedEmail(DEV_CUSTOMER_EMAIL),
      userId: { not: null },
    },
    select,
  });
}
const SEED_REVIEWABLE_SPACE_SLUGS = [
  "meeting-room-a",
  "seminar-room",
  REVIEW_E2E_SPACE_SLUG,
] as const;

/**
 * デモ予約を載せるスペース。**slug で明示し、順序を固定する。**
 *
 * 以前は `prisma.space.findMany({ where: { isActive: true } })` を `orderBy` 無しで
 * 引き、`spaceIndex % spaces.length` で割り当てていた。Postgres の返却順は保証が
 * 無いので「`spaceIndex: 0` がどのスペースか」が run ごとに変わり、E2E から見た
 * seed の意味が安定しなかった（#1793 と同じ欠陥）。
 *
 * この配列は `E2E_PASSCODE_FIXTURE_SPACE_SLUG` を**構造的に含まない**。それが
 * 「fixture 専用スペースにはデモ予約が載らない」保証の実体で、
 * `__tests__/unit/architecture/e2e-fixture-space-ownership.test.ts` が機械強制する。
 */
/**
 * デモ予約を割り当てる顧客。**seedCustomers の宣言順**で固定する。
 *
 * 旧実装は `customer.findMany({ where: { isActive: true } })` を `orderBy` 無しで
 * 引き、`customerIndex % customers.length` で割り当てていた。2 つの意味で不安定:
 *
 * - Postgres の返却順は保証が無い（`spaceIndex` と同じ欠陥）
 * - **集合そのものが動く**。`create-receipt-download-fixture` 等が実行のたびに
 *   有効な顧客を増やすので `customers.length` が変わり、剰余で全割り当てがずれる
 *
 * 宣言した email だけを対象にすれば、fixture が作った顧客は構造的に入らない。
 */
const DEMO_RESERVATION_CUSTOMER_EMAILS = [
  "watabe.ryo@example.com",
  "kondo.aya@example.com",
  "asano.shinichi@example.com",
  "tanaka.taro@example.com",
  "yamada.hanako@example.com",
  "sato.ichiro@example.com",
  "kimura.yuko@example.com",
  "hayashi.daisuke@example.com",
  "suzuki.misaki@example.com",
  "takahashi.kenta@example.com",
  "ito.sakura@example.com",
  "watanabe.daisuke@example.com",
  "kobayashi.mayu@example.com",
  "matsumoto.naoki@example.com",
  "inoue.mika@example.com",
  "saito.takuya@example.com",
  "shimizu.yumi@example.com",
  "yamaguchi.sho@example.com",
  "ishida.ai@example.com",
  "maeda.kenichi@example.com",
  "kato.makoto@example.com",
  "yoshida.miho@example.com",
  "yamamoto.shota@example.com",
  "nakajima.yuko@example.com",
  "ono.yudai@example.com",
  "fujita.megumi@example.com",
  "nakamura.keiko@example.com",
  "ogawa.yusuke@example.com",
  "okada.mari@example.com",
  "blacklist.user@example.com",
  "tamura@abc-corp.example.com",
  "morita@xyz-llc.example.com",
  "nishimura@sample.example.com",
  "murakami@npo.example.com",
] as const;

/** デモ予約の marker。冪等判定のキーで、実行日に依存しない。 */
const SEED_DEMO_RESERVATION_MARKER = "[SEED-DEMO]";

/**
 * Space スケジュール空間の advisory lock namespace。
 *
 * SSoT は `src/shared/domain/reservations/space-locks.ts`。seed からその module を import できない —
 * `import "server-only"` を持ち、バンドラーの外では必ず throw するため。
 * 値がずれると「ロックを取っているのに直列化されない」という最悪の壊れ方をするので、
 * `__tests__/unit/architecture/seed-reservation-rebuild-safety.test.ts` の
 * 「advisory lock の namespace が domain 側と一致する」が一致を強制する。
 */
const SEED_SPACE_LOCK_NAMESPACE = 728351;

/** `lockSpaceForTransaction` と同じ lock を seed から取得する。 */
async function lockSpaceForSeedTransaction(
  tx: Pick<PrismaClient, "$executeRaw">,
  spaceId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SEED_SPACE_LOCK_NAMESPACE}::int4, hashtext(${spaceId}))`;
}

const DEMO_RESERVATION_SPACE_SLUGS = [
  "meeting-room-a",
  "seminar-room",
  REVIEW_E2E_SPACE_SLUG,
] as const;

/**
 * dev customer の `[E2E]` 予約を載せるスペース。
 *
 * `stripe-payment.spec.ts` / `stripe-3ds-sca-challenge.spec.ts` は予約詳細の
 * 見出しで「ミーティングルーム A」を assert する。以前は `findFirst` の
 * 暗黙の順序に依存していたため、Postgres が別の行を先に返した瞬間に落ちる
 * 構造だった。slug で固定する。
 */
const DEV_CUSTOMER_RESERVATION_SPACE_SLUG = "meeting-room-a";

/**
 * 時刻依存 E2E fixture が**専有する**スペースの slug（dev seed 限定）。
 *
 * ## なぜ専用スペースが要るのか
 *
 * `scripts/e2e/create-passcode-reveal-fixture.ts` は「解錠番号が今まさに有効」な
 * 状態を作るため、実行時刻をまたぐ CONFIRMED 予約を必要とする。ところが予約は
 * DB の EXCLUDE 制約 `reservations_no_active_time_overlap_excl` で重複できず、
 * デモ予約が当日の時間帯を埋めているため、**実行時刻によっては全スペースが
 * 塞がって fixture 生成そのものが失敗**していた。
 *
 * 実測（CI run 30708064822、コンテナ TZ=UTC）: デモ当日予約は 09-11 / 15-17、
 * 10-13 / 17-19、14-18 を占める。fixture が要求する `[now-1h, now+1h]` は
 * **now が 16:00〜18:00 UTC のとき 3 スペースすべてと衝突**する。
 * 落ちた run の起動は 16:24 UTC。さらに nightly は `cron: "0 18 * * *"` で、
 * 15-17 の予約が終わる 17:00 と窓の開始が**同時刻**という 0 秒差で通っていた。
 *
 * ## なぜ「空きスペースを探す」ではなく専有なのか
 *
 * `e2e/fixtures/test-data.ts` の `spaceFixtures` は既に **spec ごとにスペースを
 * 所有分割**している（並列実行での相互破壊を防ぐため）。時刻依存 fixture にも
 * 同じ規約を適用するのが一貫していて、探索ロジックも失敗経路も不要になる。
 *
 * ## なぜ非公開・dev 限定なのか
 *
 * - `isPublished: false` — 公開一覧に出ないので `/spaces` の visual baseline
 *   （`e2e/visual/public-pages.spec.ts` の `spaces-list.png`）に影響しない
 * - `seedDev()` からのみ呼ぶ — `seedProduction()` は `seedSpaces(false)` しか
 *   呼ばないので、この行が本番に入ることはない（dev/prod 分離ポリシー）
 */
const E2E_PASSCODE_FIXTURE_SPACE_SLUG = "e2e-passcode-fixture";

/**
 * ゲスト予約系 fixture が専有するスペース。
 *
 * `create-claim-reservation-fixture` / `create-guest-status-fixture` /
 * `create-receipt-download-fixture` は固定または乱択の日時に予約を作る。共有の
 * `coworking-space` に作っていたため、同じ枠を要求する 2 回目の実行が EXCLUDE 制約
 * `reservations_no_active_time_overlap_excl` に弾かれていた。claim は spec 本体から
 * 呼ばれ CI は `retries: 2` なので、**1 度落ちると 3 attempt すべてが別の理由で
 * 落ち続ける**（fixture 生成エラーで、本来の失敗理由が見えなくなる）。
 *
 * 解錠番号 fixture とは別スペースにする。所有分割の要点は「1 fixture 1 スペース」で、
 * 相乗りさせると同じ衝突が別の組み合わせで復活する。
 */
const E2E_GUEST_RESERVATION_FIXTURE_SPACE_SLUG =
  "e2e-guest-reservation-fixture";

/**
 * 定期予約（`ReservationSeries`）の 3 択キャンセル spec が専有するスペース。
 *
 * この spec は series を**破壊的に消費する**ので、fixture は実行のたびに作り直す
 * 必要がある。以前は fixture script が Location / Space / Customer ごと新規作成
 * していたが、後始末が無いため行が際限なく溜まっていた（実測: ローカル test DB に
 * `e2e-recurring-space-*` が数百行）。専有スペースを 1 つ置き、その中身だけを
 * 毎回消して作り直す形にすると、行数が有界になり EXCLUDE 制約とも無縁になる。
 */
const E2E_RECURRING_SERIES_FIXTURE_SPACE_SLUG = "e2e-recurring-series-fixture";

/**
 * series bulk-cancel の返金ポリシー spec（E2E-01）が専有するスペース。
 *
 * 上と別スペースにする。両 spec は同じ `chromium-admin` project で**並走しうる**ので、
 * 相乗りさせると「自分の残骸を消す」purge が相手の fixture ごと消してしまう
 * （1 fixture 1 スペースの所有分割）。
 */
const E2E_SERIES_REFUND_FIXTURE_SPACE_SLUG = "e2e-series-refund-fixture";

/**
 * 繰返し予約**フォーム送信**の E2E が専有するスペース。
 *
 * 上の 2 つと分ける理由は同じ「1 fixture 1 スペース」。この spec はフォームから
 * series を作るので、実行のたびに予約行が増える。専有スペースにしておけば
 * 実行前 purge が他 spec の fixture を巻き込まず、EXCLUDE 制約
 * `reservations_no_active_time_overlap_excl` とも無縁になる
 * （`create-recurring-reservation.spec.ts` の 3 択キャンセル test と**並走する** —
 * `playwright.config.ts` は `fullyParallel: true` で、同一ファイル内の test も
 * worker をまたいで同時に走る）。
 *
 * 非公開のままで良い。管理画面の予約フォームは `isActive` だけで候補を出すので
 * （`getSpacesForReservationQuery`）、公開しなくても選択できる。
 */
const E2E_RECURRING_CREATE_FIXTURE_SPACE_SLUG = "e2e-recurring-create-fixture";

/** 上記スペースに紐づく Pad デバイスの SwitchBot 側 ID（`deviceId` は @unique）。 */
const E2E_PASSCODE_FIXTURE_DEVICE_ID = "e2e-passcode-fixture-keypad";

/**
 * dev seed が用意する fixture 専有スペースの宣言。
 *
 * いずれも **`isPublished: false`**（`/spaces` に出ないので
 * `e2e/visual/public-pages.spec.ts` の `spaces-list.png` に影響しない）かつ
 * **`seedDev()` からのみ**作る（`seedProduction()` は `seedSpaces(false)` しか
 * 呼ばないので本番には入らない）。
 *
 * どれも `DEMO_RESERVATION_SPACE_SLUGS` に含まれない。これが「fixture が要求する
 * 時間帯は必ず空いている」ことの実体で、
 * `__tests__/unit/architecture/e2e-fixture-space-ownership.test.ts` が機械強制する。
 */
const E2E_FIXTURE_SPACES = [
  {
    slug: E2E_PASSCODE_FIXTURE_SPACE_SLUG,
    name: "[E2E] 解錠番号検証用スペース",
    description:
      "時刻依存の E2E fixture が専有する非公開スペース。公開一覧には出ません。",
    keypadDeviceId: E2E_PASSCODE_FIXTURE_DEVICE_ID,
  },
  {
    slug: E2E_GUEST_RESERVATION_FIXTURE_SPACE_SLUG,
    name: "[E2E] ゲスト予約検証用スペース",
    description:
      "ゲスト予約系 E2E fixture が専有する非公開スペース。公開一覧には出ません。",
  },
  {
    slug: E2E_RECURRING_SERIES_FIXTURE_SPACE_SLUG,
    name: "[E2E] 定期予約検証用スペース",
    description:
      "定期予約の 3 択キャンセル E2E fixture が専有する非公開スペース。公開一覧には出ません。",
  },
  {
    slug: E2E_SERIES_REFUND_FIXTURE_SPACE_SLUG,
    name: "[E2E] 定期予約返金検証用スペース",
    description:
      "series bulk-cancel の返金ポリシー E2E fixture が専有する非公開スペース。公開一覧には出ません。",
  },
  {
    slug: E2E_RECURRING_CREATE_FIXTURE_SPACE_SLUG,
    name: "[E2E] 定期予約作成検証用スペース",
    description:
      "繰返し予約フォーム送信の E2E が専有する非公開スペース。公開一覧には出ません。",
  },
] as const satisfies readonly FixtureSpaceSpec[];

async function seedSpaces(overridePublished?: boolean) {
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
      area: 2550,
      hourlyPrice: 3000,
      mainImageUrl: "/images/seed/meeting-room.svg",
      gallery: [],
      facilities: [
        { name: "Wi-Fi", iconName: "IconWifi" },
        { name: "プロジェクター", iconName: "IconPresentation" },
        { name: "ホワイトボード", iconName: "IconBulb" },
        { name: "空調", iconName: "IconAirConditioning" },
        { name: "電源タップ", iconName: "IconChargingPile" },
      ],
      isPublished: overridePublished ?? true,
      isActive: true,
      reviewsEnabled: overridePublished !== false,
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
      area: 6000,
      hourlyPrice: 8000,
      mainImageUrl: "/images/seed/seminar-room.svg",
      gallery: [],
      facilities: [
        { name: "Wi-Fi", iconName: "IconWifi" },
        { name: "プロジェクター", iconName: "IconPresentation" },
        { name: "大型スクリーン", iconName: "IconPresentation" },
        { name: "マイク", iconName: "IconMicrophone" },
        { name: "空調", iconName: "IconAirConditioning" },
        { name: "可動式テーブル", iconName: "IconArmchair" },
      ],
      isPublished: overridePublished ?? true,
      isActive: true,
      reviewsEnabled: overridePublished !== false,
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
      area: 8000,
      hourlyPrice: 500,
      mainImageUrl: "/images/seed/coworking.svg",
      gallery: [],
      facilities: [
        { name: "Wi-Fi", iconName: "IconWifi" },
        { name: "電源", iconName: "IconChargingPile" },
        { name: "ロッカー", iconName: "IconKey" },
        { name: "ドリンクバー", iconName: "IconCoffee" },
        { name: "複合機", iconName: "IconCamera" },
        { name: "空調", iconName: "IconAirConditioning" },
      ],
      isPublished: overridePublished ?? true,
      isActive: true,
      reviewsEnabled: overridePublished !== false,
      ...(annex?.id != null ? { locationId: annex.id } : {}),
      ...(coworking?.id != null ? { categoryId: coworking.id } : {}),
    },
  ];

  // **本番 seed（`seedSpaces(false)`）は既存行に触らない。** dev だけが宣言へ
  // 収束させる。`--production` の再実行が管理画面の編集を踏み潰さないため。
  const reconcileDeclaredContent = overridePublished === undefined;

  for (const space of spaces) {
    // `slug` unique は isActive 条件の partial index。判定の母集合を制約に揃える
    // （soft-delete 済みの同 slug 行を「存在する」と数えると create をスキップし、
    // seedDevCustomerAndReservations が空振りして stripe 系 spec が落ちる）。
    const existing = await prisma.space.findFirst({
      where: { slug: space.slug, isActive: true },
    });
    if (!existing) {
      await prisma.space.create({ data: space });
      console.log(`✅ Created space: ${space.name}`);
      continue;
    }

    if (!reconcileDeclaredContent) {
      console.log(`⏭️ Skipped existing space: ${space.name}`);
      continue;
    }

    // 宣言済みの**内容**だけを揃え直す。`isPublished` / `isActive` /
    // `reviewsEnabled` / `locationId` / `categoryId` は書かない — 公開状態や
    // 配置は管理画面と他 spec（`axe-admin-feature-disabled` 等）の領分で、
    // seed が触ると相手を壊す。
    //
    // 収束させないと、宣言を変えても既存の dev / test DB に反映されない。
    // `scripts/migrate-test-db.ts` は `migrate deploy` しか流さないので、
    // ローカルだけ CI と静かに食い違う。実害: `rate-plan-preview.smoke.spec.ts`
    // がロックしている「¥1,430」は `hourlyPrice: 500` から導出されるので、
    // 古い価格が残った DB では価格アサーションが落ちる。
    const {
      slug: _slug,
      isPublished: _isPublished,
      isActive: _isActive,
      reviewsEnabled: _reviewsEnabled,
      locationId: _locationId,
      categoryId: _categoryId,
      ...declaredContent
    } = {
      locationId: undefined,
      categoryId: undefined,
      ...space,
    };

    await prisma.space.update({
      where: { id: existing.id },
      data: declaredContent,
    });
    console.log(`✅ Reconciled space: ${space.name}`);
  }

  if (overridePublished !== false) {
    const result = await prisma.space.updateMany({
      where: { slug: { in: [...SEED_REVIEWABLE_SPACE_SLUGS] } },
      data: { reviewsEnabled: true },
    });
    console.log(
      `✅ Enabled reviews for ${result.count.toString()} seed space(s)`,
    );
  }
}

/**
 * 時刻依存 E2E fixture 専用スペース（**dev seed 限定・非公開**）。
 *
 * 目的と設計判断は `E2E_PASSCODE_FIXTURE_SPACE_SLUG` のコメントを参照。
 * ここでは Pad デバイスまで用意して、fixture 側が「予約 + パスコード行を作る」
 * だけで済むようにする（fixture がデバイスを作り足す旧実装は、失敗時に
 * 中途半端な状態を残す経路があった）。
 *
 * `seedProduction()` からは呼ばない。
 */
interface FixtureSpaceSpec {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  /** SwitchBot の Pad デバイスを紐づけるか（解錠番号 fixture のみ必要）。 */
  readonly keypadDeviceId?: string;
}

/**
 * 時刻依存 E2E fixture が専有するスペースを 1 件用意する（**dev seed 限定・非公開**）。
 *
 * 目的と設計判断は `E2E_FIXTURE_SPACES` のコメントを参照。
 * `seedProduction()` からは呼ばない。
 */
async function ensureFixtureSpace(spec: FixtureSpaceSpec) {
  const location = await prisma.location.findFirst({
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (!location) {
    seedPreconditionFailed(
      `fixture space ${spec.slug} に割り当てる Location が無い（seedLocations が先に走る）`,
    );
  }

  // `Space.slug` は Prisma 上 unique ではない（soft-delete 済み行の値を永久に
  // 予約しないための partial unique index で、`isActive` 条件付き）。よって
  // `upsert({ where: { slug } })` は使えず、seedSpaces と同じ findFirst → create/update。
  const existing = await prisma.space.findFirst({
    where: { slug: spec.slug, isActive: true },
    select: { id: true, smartLockDeviceId: true, locationId: true },
  });

  const space = existing
    ? // 既存行は「非公開・有効」を毎回揃え直す（手動で公開されても戻す）。
      await prisma.space.update({
        where: { id: existing.id },
        data: { isPublished: false, isActive: true },
        select: { id: true, smartLockDeviceId: true, locationId: true },
      })
    : await prisma.space.create({
        data: {
          slug: spec.slug,
          name: spec.name,
          ...buildSeedDescription(spec.description),
          capacity: 1,
          hourlyPrice: 3000,
          // 公開されないので画像は既存 seed のプレースホルダを流用する。
          mainImageUrl: "/images/seed/meeting-room.svg",
          gallery: [],
          facilities: [],
          // 公開しない = /spaces に出ないので visual baseline に影響しない。
          isPublished: false,
          isActive: true,
          reviewsEnabled: false,
          locationId: location.id,
        },
        select: { id: true, smartLockDeviceId: true, locationId: true },
      });

  if (spec.keypadDeviceId === undefined) {
    console.log(`✅ Reconciled fixture space: ${spec.slug}`);
    return;
  }

  // デバイスは**毎回揃え直す**。「`smartLockDeviceId` が入っていれば抜ける」に
  // すると、手動で非活性化されたり deviceType を変えられたときに再実行で
  // 復旧できない。`getPasscodeRevealState` は `!device.isActive` と非 Pad 型を
  // 弾くので（`customer-passcode-queries.ts`）、その状態では「解錠番号を表示」
  // ボタンが出ず、spec は原因の分かりにくい形で落ちる。seed の冪等性は
  // 「再実行すれば必ず期待状態になる」ことを指す。
  const device = await prisma.smartLockDevice.upsert({
    where: { deviceId: spec.keypadDeviceId },
    create: {
      locationId: space.locationId ?? location.id,
      deviceId: spec.keypadDeviceId,
      deviceName: "[E2E] テストキーパッド",
      deviceType: SmartLockDeviceType.KEYPAD_TOUCH,
      isActive: true,
    },
    update: {
      isActive: true,
      deviceType: SmartLockDeviceType.KEYPAD_TOUCH,
    },
    select: { id: true },
  });

  if (space.smartLockDeviceId !== device.id) {
    await prisma.space.update({
      where: { id: space.id },
      data: { smartLockDeviceId: device.id },
    });
  }
  console.log(`✅ Reconciled fixture space with keypad: ${spec.slug}`);
}

/** 時刻依存 E2E fixture が専有するスペース群（dev seed 限定）。 */
async function seedE2EFixtureSpaces() {
  for (const spec of E2E_FIXTURE_SPACES) {
    await ensureFixtureSpace(spec);
  }
}

// =============================================================================
// Space Rate Plans（週末 / 祝日料金プランのデモ、dev seed のみ）
//
// 本番 seed（seedProduction）からは意図的に呼ばない
// （dev/prod 分離ポリシー、架空の rate plan 例を本番に投入しない）。
// Task 16 の rate-plan-preview E2E smoke spec は「金曜」枠のプレビューに
// 「週末料金」が反映されることを DOM 検証する前提（daysOfWeek に FRIDAY を含む）。
// プラン名は e2e/fixtures/test-data.ts の ratePlanFixtures と文字列レベルで
// 契約が取れている（import ではなく、他の seed fixture 定数と同じ運用）。
// =============================================================================

const SEED_WEEKEND_RATE_PLAN_NAME = "週末料金";
const SEED_HOLIDAY_RATE_PLAN_NAME = "祝日料金";

async function seedSpaceRatePlans() {
  const spaces = await prisma.space.findMany({
    select: { id: true, name: true, hourlyPrice: true },
  });

  for (const space of spaces) {
    // 料金は **`space.hourlyPrice` の関数**。既存行を skip すると、スペース側の
    // 基本料金を宣言値へ寄せ直しても（`seedSpaces` の reconcile）プランだけ
    // 古い基本料金から導いた値で取り残される。E2E は税込の実額を assert する
    // （`rate-plan-preview.smoke.spec.ts` の「¥1,430（税込）」= round(1,300 × 1.1)、
    // 1,300 = round(1,000 × 1.3)）ので、ここがずれると必須ゲートが落ちる。
    // 導出値である以上、毎回引き直すのが正しい。
    const declaredPlans = [
      {
        name: SEED_WEEKEND_RATE_PLAN_NAME,
        hourlyPrice: Math.round(space.hourlyPrice * 1.3),
        daysOfWeek: [DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY],
        holidayMode: HolidayMode.ANY,
      },
      {
        name: SEED_HOLIDAY_RATE_PLAN_NAME,
        hourlyPrice: Math.round(space.hourlyPrice * 1.5),
        daysOfWeek: [],
        holidayMode: HolidayMode.ONLY,
      },
    ];

    for (const plan of declaredPlans) {
      const declaredContent = {
        hourlyPrice: plan.hourlyPrice,
        daysOfWeek: plan.daysOfWeek,
        holidayMode: plan.holidayMode,
        startTime: null,
        endTime: null,
        effectiveFrom: null,
        effectiveTo: null,
      };

      // `SpaceRatePlan` に (spaceId, name) の unique は無いので upsert は使えない。
      // `findFirst` は `orderBy` 無しだと同名が複数あるとき掴む行が run ごとに変わる
      // ため、`updateMany` で**同名すべて**を宣言値へ寄せる。重複があっても収束し、
      // 「1 件も無い」を count で判定できるので存在確認も兼ねる。
      const { count } = await prisma.spaceRatePlan.updateMany({
        where: { spaceId: space.id, name: plan.name },
        data: declaredContent,
      });

      if (count === 0) {
        await prisma.spaceRatePlan.create({
          data: { spaceId: space.id, name: plan.name, ...declaredContent },
        });
        console.log(`✅ Created rate plan: ${space.name} - ${plan.name}`);
      } else {
        console.log(
          `♻️ Reconciled rate plan: ${space.name} - ${plan.name} (¥${String(plan.hourlyPrice)}/h)`,
        );
      }
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
      discountValue: 10,
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
      discountValue: 15,
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
      discountValue: 1000,
      minReservationAmount: 5000,
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
      discountValue: 20,
      minReservationAmount: 10000,
      maxDiscountAmount: 5000,
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
      discountValue: 30,
      maxDiscountAmount: 10000,
      validFrom: now,
      validUntil: oneMonthLater,
      usageLimit: 20,
      isActive: true,
      canCombineWithDurationDiscount: true,
    },
  ];

  for (const coupon of coupons) {
    // 有効期間は**作成時の時計**から計算されるので、skip すると古い DB では
    // 期限切れのまま永久に残る（`VIP30` は 1 ヶ月で失効し、以後どの再 seed でも
    // 蘇らない）。`code` は無条件 @unique なので upsert が使えて、
    // 期間だけ引き直せる。`usageCount` は本物のデモ履歴なので触らない。
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {
        validFrom: coupon.validFrom,
        // `exactOptionalPropertyTypes` のため undefined を明示代入しない。
        ...(coupon.validUntil !== undefined
          ? { validUntil: coupon.validUntil }
          : {}),
      },
      create: coupon,
    });
    console.log(`✅ Reconciled coupon window: ${coupon.code}`);
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
    // seedBlog の記事 tagNames が参照するタグ。全て SLUG_REGEX 準拠の ASCII slug。
    // ここに無い name を記事 tagNames で使うと seedBlog が throw する
    // （slug=name の日本語 slug が /tag/[slug] で 404 になる不具合の再発防止）。
    { name: "会場選び", slug: "venue-selection" },
    { name: "生産性", slug: "productivity" },
    { name: "研修", slug: "training" },
    { name: "IT企業", slug: "it-company" },
    { name: "トレンド", slug: "trend" },
    { name: "オフィス", slug: "office" },
    { name: "働き方改革", slug: "workstyle-reform" },
    { name: "アーカイブ", slug: "archive" },
    { name: "サービス変更", slug: "service-change" },
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
    const emailCanonical = normalizeSeedEmail(customer.email);
    const existing = await prisma.customer.findFirst({
      where: { emailCanonical, userId: null },
    });

    if (!existing) {
      await prisma.customer.create({
        data: {
          ...customer,
          emailCanonical,
          totalSpent: customer.totalSpent ?? null,
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

/** E2E / admin UI 用 inquiry enrichment（`e2e/fixtures/test-data.ts` と同期） */
const SEED_INQUIRY_TAG_NAMES = {
  inProgress: "対応中",
  highPriority: "優先度高",
} as const;

const SEED_INQUIRY_GENERAL_STAFF_REPLY_BODY =
  "予約変更の手続きについてご案内いたします。マイページの予約詳細から変更可能です。ご不明点があればお知らせください。";

const SEED_INQUIRY_DEV_CUSTOMER_STAFF_REPLY_BODY =
  "ご返信ありがとうございました。引き続きよろしくお願いします。";

const SEED_INQUIRY_DEV_CUSTOMER_CUSTOMER_REPLY_BODY =
  "追加で確認したい点があります。解決済みの件ですが、領収書の再発行は可能でしょうか？";

const SEED_INQUIRY_INTERNAL_NOTE_BODY =
  "月契約の割引可否を確認中。経理担当へ確認メール済み。";

async function ensureInquiryTag(
  name: string,
  color?: string,
): Promise<{ id: string }> {
  return prisma.inquiryTag.upsert({
    where: { name },
    update: color !== undefined ? { color } : {},
    create: { name, ...(color !== undefined ? { color } : {}) },
    select: { id: true },
  });
}

async function ensureInquiryHasTag(
  inquiryId: string,
  tagName: string,
  color?: string,
): Promise<void> {
  const tag = await ensureInquiryTag(tagName, color);
  await prisma.inquiryTagOnInquiry.upsert({
    where: {
      inquiryId_tagId: { inquiryId, tagId: tag.id },
    },
    update: {},
    create: { inquiryId, tagId: tag.id },
  });
}

async function ensureInquiryReply(input: {
  inquiryId: string;
  authorType: "STAFF" | "CUSTOMER";
  body: string;
  authorId?: string;
  authorCustomerId?: string;
}): Promise<void> {
  const existing = await prisma.inquiryReply.findFirst({
    where: { inquiryId: input.inquiryId, body: input.body },
    select: { id: true },
  });
  if (existing) return;

  await prisma.inquiryReply.create({
    data: {
      inquiryId: input.inquiryId,
      authorType: input.authorType,
      body: input.body,
      authorId: input.authorType === "STAFF" ? (input.authorId ?? null) : null,
      authorCustomerId:
        input.authorType === "CUSTOMER"
          ? (input.authorCustomerId ?? null)
          : null,
    },
  });
}

async function ensureInquiryInternalNote(input: {
  inquiryId: string;
  authorId: string;
  body: string;
}): Promise<void> {
  const existing = await prisma.inquiryInternalNote.findFirst({
    where: { inquiryId: input.inquiryId, body: input.body },
    select: { id: true },
  });
  if (existing) return;

  await prisma.inquiryInternalNote.create({
    data: {
      inquiryId: input.inquiryId,
      authorId: input.authorId,
      body: input.body,
    },
  });
}

async function findInquiryByEmailSubject(
  email: string,
  subject: string,
): Promise<{ id: string } | null> {
  return prisma.inquiry.findFirst({
    where: { email, subject },
    select: { id: true },
  });
}

async function seedInquiryOperationalFixtures(): Promise<void> {
  const staffAuthor = await prisma.user.findUnique({
    where: { email: "admin@example.com" },
    select: { id: true },
  });
  if (!staffAuthor) {
    seedPreconditionFailed(
      "admin@example.com が無い（seedAdmin が先に走る）— 問い合わせの運用 fixture を作れない",
    );
  }

  const resolvedInquiry = await findInquiryByEmailSubject(
    "nakajima.yuko@example.com",
    "予約変更",
  );
  if (resolvedInquiry) {
    await ensureInquiryReply({
      inquiryId: resolvedInquiry.id,
      authorType: "STAFF",
      body: SEED_INQUIRY_GENERAL_STAFF_REPLY_BODY,
      authorId: staffAuthor.id,
    });
  }

  const inProgressInquiry = await findInquiryByEmailSubject(
    "tanaka@example.com",
    "料金プラン",
  );
  if (inProgressInquiry) {
    const slaExpiresAt = new Date();
    slaExpiresAt.setDate(slaExpiresAt.getDate() + 2);

    await prisma.inquiry.update({
      where: { id: inProgressInquiry.id },
      data: {
        assigneeId: staffAuthor.id,
        slaExpiresAt,
      },
    });
    await ensureInquiryHasTag(
      inProgressInquiry.id,
      SEED_INQUIRY_TAG_NAMES.inProgress,
      "#3b82f6",
    );
    await ensureInquiryInternalNote({
      inquiryId: inProgressInquiry.id,
      authorId: staffAuthor.id,
      body: SEED_INQUIRY_INTERNAL_NOTE_BODY,
    });
  }

  console.log(
    "✅ Seeded inquiry operational fixtures (replies/tags/assignee/SLA/notes)",
  );
}

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

  for (const [i, inquiry] of inquiries.entries()) {
    const existing = await prisma.inquiry.findFirst({
      where: { email: inquiry.email, subject: inquiry.subject },
    });

    if (!existing) {
      await prisma.inquiry.create({
        data: {
          ...inquiry,
          receiptNumber: `INQ-SEED${String(i + 1).padStart(4, "0")}`,
        },
      });
      console.log(`✅ Created inquiry: ${inquiry.subject}`);
    } else {
      console.log(`⏭️ Skipped existing inquiry: ${inquiry.subject}`);
    }
  }

  await seedInquiryOperationalFixtures();
}

// =============================================================================
// Reservations (with Coupon relations)
// =============================================================================

// 予約は rate plan resolver を経由しない直接 insert のため、空 segments の
// rateBreakdownJson スナップショットで税・内訳を埋める。
const SEED_LEGACY_TAX_RATE = 10;
const SEED_EMPTY_RATE_BREAKDOWN = {
  schemaVersion: 1,
  segments: [],
  totalHours: 0,
  totalBasePrice: 0,
  holidayFlags: {},
} as const;

function buildSeedLegacyPricingSnapshot(totalPrice: number) {
  const taxAmount = Math.round((totalPrice * SEED_LEGACY_TAX_RATE) / 100);
  return {
    taxRateType: "STANDARD" as const,
    taxRate: SEED_LEGACY_TAX_RATE,
    taxAmount,
    totalPriceWithTax: totalPrice + taxAmount,
    rateBreakdownJson: asPrismaInputJsonValue(
      SEED_EMPTY_RATE_BREAKDOWN,
      "seed rateBreakdownJson が不正です",
    ),
  };
}

/** JST の時差。アプリの表示は JST 固定（`src/shared/lib/date-format.ts`）。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * **JST の暦日 + 時**から UTC の `Date` を作る。
 *
 * `date.setHours(9)` はコンテナのローカル時刻で解釈されるので、JST の開発機では
 * 9 時が 9 時でも UTC の CI runner では 9 時が JST 18 時になる。アプリは JST 固定の
 * formatter で表示するため、同じ seed が環境で違う意味になっていた。
 */
function jstDateTime(base: Date, daysOffset: number, hour: number): Date {
  const jst = new Date(base.getTime() + JST_OFFSET_MS);
  return new Date(
    Date.UTC(
      jst.getUTCFullYear(),
      jst.getUTCMonth(),
      jst.getUTCDate() + daysOffset,
      hour,
    ) - JST_OFFSET_MS,
  );
}

async function seedReservations() {
  // slug で明示し、`DEMO_RESERVATION_SPACE_SLUGS` の宣言順に並べ替える。
  // `findMany({ where: { isActive: true } })` を `orderBy` 無しで引くと Postgres の
  // 返却順に依存し、`spaceIndex` がどのスペースを指すか run ごとに変わる。
  // 併せて fixture 専用スペースを構造的に対象外にする。
  const found = await prisma.space.findMany({
    where: { slug: { in: [...DEMO_RESERVATION_SPACE_SLUGS] }, isActive: true },
  });
  const spaces = DEMO_RESERVATION_SPACE_SLUGS.map((slug) =>
    found.find((space) => space.slug === slug),
  ).filter((space) => space !== undefined);
  const foundCustomers = await prisma.customer.findMany({
    where: {
      email: { in: [...DEMO_RESERVATION_CUSTOMER_EMAILS] },
      isActive: true,
    },
  });
  const customers = DEMO_RESERVATION_CUSTOMER_EMAILS.map((email) =>
    foundCustomers.find((customer) => customer.email === email),
  ).filter((customer) => customer !== undefined);
  const coupons = await prisma.coupon.findMany({ where: { isActive: true } });

  if (spaces.length === 0 || customers.length === 0) {
    seedPreconditionFailed(
      `デモ予約の相手が無い（spaces=${String(spaces.length)} / customers=${String(customers.length)}）— seedSpaces と seedCustomers が先に走る`,
    );
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

  // 削除と再作成は **1 つの transaction 内で、対象スペースの advisory lock を
  // 取ってから**行う。この関数は空き枠を動かすので、「可用性に影響する全書込経路は
  // `lockSpaceForTransaction` を先取する」という絶対規約に該当する。
  //
  // tx の外で消すと、削除から再作成までの隙間で枠が空く。served な dev / staging に
  // 対して seed を回すと、その隙間に入った予約が EXCLUDE 制約
  // `reservations_no_active_time_overlap_excl` と衝突し、作り直しが途中で止まって
  // **半分だけ再構築された** DB が残る。
  await prisma.$transaction(
    async (tx) => {
      // deadlock 予防のため id 昇順（`lockSpacesForTransactionInOrder` と同じ規律）。
      for (const spaceId of [...spaces.map((space) => space.id)].sort()) {
        await lockSpaceForSeedTransaction(tx, spaceId);
      }

      // --- 既存のデモ予約は毎回まとめて作り直す ---------------------------
      //
      // marker（`SEED_DEMO_RESERVATION_MARKER`）は「同じエントリを二重に作らない」
      // ためのキーであって、**行を現在時刻へ追従させる**役には立たない。marker 行を
      // skip していると `daysOffset: 0` の「本日のご予約」が初回 seed の暦日に貼り付き、
      // 30 日も経てば**未来のデモ予約が 1 件も無い DB** になる（実測: 本日 2026-08-02 に
      // 対し marker 行は 2026-06-03〜07-30、`daysOffset: 0` の行が全部 2026-06-03）。
      //
      // さらに marker 導入**前**に作られた行は marker を持たないので、既存 DB では
      // 全エントリが「無い」と判定される。COMPLETED / CANCELLED は EXCLUDE 制約の
      // 対象外なので重複がそのまま増え、PENDING / CONFIRMED は旧行と重なって毎回
      // 「skip overlapping」になり永久に収束しない（実測: marker 行 20 件と marker 無しの
      // 旧デモ行が併存していた）。
      //
      // どちらも「消してから作る」ことで構造的に消える。EXCLUDE 制約
      // `reservations_no_active_time_overlap_excl` は DEFERRABLE ではないため、
      // 削除を先に済ませる順序であることが正しさの条件でもある。
      //
      // ただし **会計証跡を持つ行は消さない**（`seedEvents` と同じ判断）。Receipt /
      // Refund は `onDelete: Restrict` で、消せないだけでなく消してはいけない記録。
      // レビューは直後の `seedSpaceReviews()` が COMPLETED 予約へ貼り直すので対象外。
      //
      // `seedEvents` は「証跡付きだけ残す」が成立せず event 単位で作り直しを見送っている
      // が、予約には**その連鎖が無い**。残った予約が参照するのは Space / Customer
      // （`Cascade`）と Coupon / User / ReservationSeries（`SetNull`）だけで `Restrict` が
      // 1 本も無く、しかもこの関数はそれらを消さない。だから行単位で選り分けられる。
      //
      // **「デモ顧客 × デモスペース」で消してはいけない。** その直積には、開発者や
      // テスターが管理画面・公開フォームから作った普通の予約も入る。marker が無い
      // だけで消してしまうと、dev / staging の手動データが seed のたびに恒久的に
      // 消え、レビュー等の子レコードまで cascade する。
      //
      // 消してよいのは「seed が作ったと**証明できる**行」だけ:
      //   1. marker を持つ行（現行 seed 由来）
      //   2. marker 導入前の行 = デモ顧客 × デモスペース **かつ** notes が
      //      このテーブルで宣言している文字列と完全一致するもの
      // 2 は宣言そのものから導出するので、エントリを足し引きしても勝手に追随する。
      // notes を持たない旧行は区別できないので**残す**（重複は残るが、データを
      // 消すよりはるかにましで、実行のたびに増えることはもう無い）。
      const declaredDemoNotes = [
        ...new Set(
          reservations
            .map((entry) => entry.notes)
            .filter((note): note is string => note !== undefined),
        ),
      ];

      const existingDemoReservations = await tx.reservation.findMany({
        where: {
          OR: [
            { notes: { startsWith: SEED_DEMO_RESERVATION_MARKER } },
            {
              spaceId: { in: spaces.map((space) => space.id) },
              customerId: { in: customers.map((customer) => customer.id) },
              notes: { in: declaredDemoNotes },
            },
          ],
        },
        select: {
          id: true,
          receipt: { select: { id: true } },
          refunds: { select: { id: true }, take: 1 },
          // 生きている解錠番号を持つ行は消さない（下記）。
          smartLockPasscodes: {
            select: { id: true },
            where: { status: { in: ["PENDING", "CONFIRMED"] } },
            take: 1,
          },
        },
      });

      const accountedDemoReservations = existingDemoReservations.filter(
        (reservation) =>
          reservation.receipt !== null || reservation.refunds.length > 0,
      );

      // 解錠番号が PENDING / CONFIRMED の予約も消さない。`SmartLockPasscode` は
      // `onDelete: Cascade` なので、予約を消すと**追跡レコードだけが消えて
      // 物理キーパッドの暗証番号は生きたまま残る**。取り消しは SwitchBot API を
      // 叩く必要があり（`revokeSmartLockPasscodesForReservation`）、seed から
      // 外部 API を副作用として呼ぶのは筋が悪い。作り直しを見送って名指しで報告し、
      // 取り消しは通常の運用経路に任せる。
      const liveKeypadReservations = existingDemoReservations.filter(
        (reservation) =>
          !accountedDemoReservations.includes(reservation) &&
          reservation.smartLockPasscodes.length > 0,
      );

      const retained = new Set(
        [...accountedDemoReservations, ...liveKeypadReservations].map(
          (reservation) => reservation.id,
        ),
      );
      const disposableDemoReservationIds = existingDemoReservations
        .filter((reservation) => !retained.has(reservation.id))
        .map((reservation) => reservation.id);

      if (disposableDemoReservationIds.length > 0) {
        await tx.reservation.deleteMany({
          where: { id: { in: disposableDemoReservationIds } },
        });
        console.log(
          `🧹 Rebuilt demo reservations: removed ${String(disposableDemoReservationIds.length)}`,
        );
      }
      if (accountedDemoReservations.length > 0) {
        console.log(
          `ℹ️ Kept ${String(accountedDemoReservations.length)} demo reservations that carry an accounting trail`,
        );
      }
      if (liveKeypadReservations.length > 0) {
        console.log(
          `ℹ️ Kept ${String(liveKeypadReservations.length)} demo reservations with a live keypad passcode (revoke via the app before re-seeding if you need them rebuilt)`,
        );
      }

      for (const res of reservations) {
        const space = spaces[res.spaceIndex % spaces.length];
        const customer = customers[res.customerIndex % customers.length];
        if (!space || !customer) continue;

        // 時刻は **JST の暦日 + 時** で組む。`setHours` はコンテナのローカル時刻なので、
        // JST の開発機では 9 時が 9 時でも、UTC の CI runner では 9 時が JST 18 時を
        // 指す。アプリは JST 固定の formatter で表示する（絶対規約）ため、同じ seed が
        // 環境で違う意味になっていた。
        const date = jstDateTime(now, res.daysOffset, res.startHour);
        const endDate = jstDateTime(
          now,
          res.daysOffset,
          res.startHour + res.duration,
        );

        // marker はエントリ自身の内容から導出する（実行日に依存しない）。上の一括削除で
        // 自分の行はもう残っていないので、ここでの存在確認は要らない。marker が残る理由は
        // ①次回 run で「seed が作った行」を過不足なく特定できること
        // ②管理画面でデモ行だと一目で分かること の 2 つ。
        const marker = `${SEED_DEMO_RESERVATION_MARKER} ${String(res.spaceIndex)}-${String(res.customerIndex)}-${String(res.daysOffset)}-${String(res.startHour)}`;

        // 残るのは会計証跡付きのデモ行と、デモ scope 外の行（dev customer の `[E2E]` 予約等）。
        // それらと重なる枠は EXCLUDE 制約に弾かれるので、作る前に譲る。
        const overlappingActiveReservation = await tx.reservation.findFirst({
          where: {
            spaceId: space.id,
            deletedAt: null,
            status: { in: ["PENDING", "CONFIRMED"] },
            AND: [{ startTime: { lt: endDate } }, { endTime: { gt: date } }],
          },
          select: { id: true },
        });

        if (overlappingActiveReservation) {
          console.log(`⏭️ Skipped overlapping reservation`);
          continue;
        }

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

        await tx.reservation.create({
          data: {
            spaceId: space.id,
            customerId: customer.id,
            startTime: date,
            endTime: endDate,
            status: res.status,
            basePrice,
            totalPrice,
            couponId,
            couponDiscountAmount: couponDiscountAmount
              ? couponDiscountAmount
              : null,
            ...buildSeedLegacyPricingSnapshot(totalPrice),
            // marker を先頭に置く。次回 run の削除対象を特定するキー。
            notes: res.notes != null ? `${marker} ${res.notes}` : marker,
            ...(res.paymentStatus !== undefined
              ? { paymentStatus: res.paymentStatus }
              : {}),
          },
        });
        console.log(
          `✅ Created reservation: ${space.name} - ${customer.lastName} (${res.status})`,
        );
      }
    },
    // 50 行前後を 1 tx で作り直す。既定の 5 秒では足りない。
    { timeout: 120_000, maxWait: 30_000 },
  );
}

// =============================================================================
// Dev Customer + Reservations（E2E critical path 用、authenticated customer 系 spec の
// stripe-payment / reservation-flow / reservation-cancel-flow が defensive skip せず
// 実際の予約データに対して assertion できるようにする）
// =============================================================================

async function seedDevCustomerAndReservations() {
  const DEV_PASSWORD = "dev-password-12345";
  const DEV_NAME = "開発テスト";

  // 1) User + credential account（Better Auth 互換）
  await createOrUpdateUserWithCredential({
    email: DEV_CUSTOMER_EMAIL,
    password: DEV_PASSWORD,
    name: DEV_NAME,
    role: Role.CUSTOMER,
  });
  const user = await prisma.user.findUnique({
    where: { email: DEV_CUSTOMER_EMAIL },
    select: { id: true },
  });
  if (!user) {
    seedPreconditionFailed(
      `${DEV_CUSTOMER_EMAIL} の User が upsert 直後に見つからない`,
    );
  }

  // 2) Customer を upsert（mypage layout の `ensureCustomerLinked` と互換）
  const customer = await prisma.customer.upsert({
    where: { userId: user.id },
    update: {
      email: DEV_CUSTOMER_EMAIL,
      emailCanonical: normalizeSeedEmail(DEV_CUSTOMER_EMAIL),
    },
    create: {
      userId: user.id,
      email: DEV_CUSTOMER_EMAIL,
      emailCanonical: normalizeSeedEmail(DEV_CUSTOMER_EMAIL),
      lastName: "開発",
      firstName: "テスト",
      phoneNumber: "090-0000-0000",
      customerType: CustomerType.PERSONAL,
      status: "REGULAR",
    },
  });

  // 規約同意は **`seedTermsDocuments()` の後**に別関数で行う（下記
  // `seedDevCustomerTermsAgreements`）。ここで records を作ろうとすると、
  // 新品の DB では TermsDocument がまだ 1 件も無いので**黙って 0 件**になる。

  // 3) 予約 4 件（status × paymentStatus の主要カバレッジ）
  //
  // slug で固定する。`findFirst({ isActive, isPublished })` は Postgres の返却順に
  // 依存しており、`stripe-payment.spec.ts` / `stripe-3ds-sca-challenge.spec.ts` が
  // 予約詳細の見出しで assert する「ミーティングルーム A」が別スペースに
  // すり替わりうる構造だった（#1793 と同じ欠陥）。
  const space = await prisma.space.findFirst({
    where: {
      slug: DEV_CUSTOMER_RESERVATION_SPACE_SLUG,
      isActive: true,
      isPublished: true,
    },
    select: { id: true, hourlyPrice: true, name: true },
  });
  if (!space) {
    seedPreconditionFailed(
      "dev customer のデモ予約に使える公開スペースが無い（seedSpaces が先に走る）",
    );
  }

  const now = new Date();
  const reservations = [
    {
      daysOffset: -30,
      status: "COMPLETED" as const,
      paymentStatus: "PAID" as const,
      notes: "[E2E] 過去・決済済み予約（stripe-payment 「決済済み」 UI）",
    },
    {
      daysOffset: 7,
      status: "CONFIRMED" as const,
      paymentStatus: "UNPAID" as const,
      notes: "[E2E] 未来・未決済予約（stripe-payment 「決済する」 UI）",
    },
    {
      // 通常seedの同一スペース day+14 10:00-12:00 予約と衝突しない固定日。
      daysOffset: 16,
      status: "PENDING" as const,
      paymentStatus: "UNPAID" as const,
      notes: "[E2E] 承認待ち予約（reservation-cancel-flow 起点）",
    },
    {
      daysOffset: -60,
      status: "CANCELLED" as const,
      paymentStatus: "REFUNDED" as const,
      notes: "[E2E] 過去・キャンセル予約（refund 表示）",
    },
  ];

  let created = 0;
  for (const r of reservations) {
    const start = new Date(now);
    start.setDate(start.getDate() + r.daysOffset);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(12, 0, 0, 0);

    // idempotent: same-marker reservation がいれば skip
    const existing = await prisma.reservation.findFirst({
      where: { customerId: customer.id, notes: r.notes },
      select: { id: true },
    });
    if (existing) continue;

    const basePrice = Number(space.hourlyPrice) * 2;
    await prisma.reservation.create({
      data: {
        spaceId: space.id,
        customerId: customer.id,
        startTime: start,
        endTime: end,
        status: r.status,
        paymentStatus: r.paymentStatus,
        basePrice,
        totalPrice: basePrice,
        notes: r.notes,
        ...buildSeedLegacyPricingSnapshot(basePrice),
      },
    });
    created++;
  }

  // 4) Review を COMPLETED+PAID 予約に upsert（reservationId @unique を起点に idempotent）
  const completedReservation = await prisma.reservation.findFirst({
    where: {
      customerId: customer.id,
      status: "COMPLETED",
      notes: { contains: "[E2E] 過去・決済済み" },
    },
    select: { id: true, spaceId: true },
  });
  if (completedReservation) {
    await prisma.spaceReview.upsert({
      where: { reservationId: completedReservation.id },
      update: {},
      create: {
        reservationId: completedReservation.id,
        spaceId: completedReservation.spaceId,
        customerId: customer.id,
        rating: 5,
        title: "[E2E] レビュー検証用",
        comment:
          "E2E spec の seed-driven review assertion 用の dev customer review。",
        isPublished: true,
      },
    });
  }

  // 5) ReservationSeries 本体は seed しない。
  //    series を消費する spec（3 択キャンセル / bulk-cancel 返金）は fixture を
  //    **破壊的に消費する**ので、共有 seed 行では retry・再実行ができない
  //    （初回失敗が永続失敗に化ける）。seed が用意するのは専有スペースだけで
  //    （`E2E_FIXTURE_SPACES`）、その中身は `e2e/helpers/reservation-series-fixture.ts`
  //    が実行のたびに purge → 再作成する。

  // 6) Inquiry を 2 件 seed（NEW + RESOLVED、customerId 紐付け）
  const inquiryFixtures: Array<{
    subject: string;
    message: string;
    status: "NEW" | "RESOLVED";
  }> = [
    {
      subject: "[E2E] dev customer の新規お問い合わせ",
      message: "E2E spec で /mypage/inquiries の一覧表示を検証する用 fixture。",
      status: "NEW" as const,
    },
    {
      subject: "[E2E] dev customer の解決済お問い合わせ",
      message:
        "E2E spec で RESOLVED 表示と STAFF/CUSTOMER 返信スレッドを検証する用 fixture。",
      status: "RESOLVED" as const,
    },
  ];
  const staffAuthor = await prisma.user.findUnique({
    where: { email: "admin@example.com" },
    select: { id: true },
  });
  if (!staffAuthor) {
    seedPreconditionFailed(
      "admin@example.com が無い（seedAdmin が先に走る）— dev customer の返信スレッド fixture を作れない",
    );
  }
  let inquiryCreated = 0;
  for (const [i, fixture] of inquiryFixtures.entries()) {
    let inquiry = await prisma.inquiry.findFirst({
      where: { customerId: customer.id, subject: fixture.subject },
      select: { id: true },
    });

    if (!inquiry) {
      inquiry = await prisma.inquiry.create({
        data: {
          receiptNumber: `INQ-E2E${String(i + 1).padStart(5, "0")}`,
          customerId: customer.id,
          name: `${customer.lastName} ${customer.firstName}`,
          email: customer.email,
          customerType: CustomerType.PERSONAL,
          subject: fixture.subject,
          message: fixture.message,
          status: fixture.status,
        },
        select: { id: true },
      });
      inquiryCreated++;
    }

    if (fixture.status === "NEW") {
      await ensureInquiryHasTag(
        inquiry.id,
        SEED_INQUIRY_TAG_NAMES.highPriority,
        "#ef4444",
      );
    }

    if (fixture.status === "RESOLVED") {
      await ensureInquiryReply({
        inquiryId: inquiry.id,
        authorType: "STAFF",
        body: SEED_INQUIRY_DEV_CUSTOMER_STAFF_REPLY_BODY,
        authorId: staffAuthor.id,
      });
      await ensureInquiryReply({
        inquiryId: inquiry.id,
        authorType: "CUSTOMER",
        body: SEED_INQUIRY_DEV_CUSTOMER_CUSTOMER_REPLY_BODY,
        authorCustomerId: customer.id,
      });
    }
  }

  // Self-serve merge E2E: 同 email の unlinked guest Customer + Google account
  const GUEST_MERGE_MARKER = "[E2E] guest history for customer merge";
  let guestCustomer = await prisma.customer.findFirst({
    where: {
      emailCanonical: normalizeSeedEmail(DEV_CUSTOMER_EMAIL),
      userId: null,
      anonymizedAt: null,
    },
    select: { id: true },
  });
  if (!guestCustomer) {
    guestCustomer = await prisma.customer.create({
      data: {
        email: DEV_CUSTOMER_EMAIL,
        emailCanonical: normalizeSeedEmail(DEV_CUSTOMER_EMAIL),
        lastName: "ゲスト",
        firstName: "履歴",
        phoneNumber: "090-0000-0001",
        customerType: CustomerType.PERSONAL,
        status: "REGULAR",
      },
      select: { id: true },
    });
  }

  const existingGuestReservation = await prisma.reservation.findFirst({
    where: { customerId: guestCustomer.id, notes: GUEST_MERGE_MARKER },
    select: { id: true },
  });
  if (!existingGuestReservation) {
    const guestStart = new Date(now);
    guestStart.setUTCDate(guestStart.getUTCDate() + 21);
    guestStart.setUTCHours(3, 0, 0, 0);
    const guestEnd = new Date(guestStart);
    guestEnd.setUTCMinutes(guestEnd.getUTCMinutes() + 120);
    const basePrice = Number(space.hourlyPrice) * 2;
    await prisma.reservation.create({
      data: {
        spaceId: space.id,
        customerId: guestCustomer.id,
        startTime: guestStart,
        endTime: guestEnd,
        status: "CONFIRMED",
        paymentStatus: "UNPAID",
        basePrice,
        totalPrice: basePrice,
        notes: GUEST_MERGE_MARKER,
        ...buildSeedLegacyPricingSnapshot(basePrice),
      },
    });
  }

  const googleAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "google" },
    select: { id: true },
  });
  if (!googleAccount) {
    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "google",
        accountId: `e2e-google-${user.id}`,
      },
    });
  }

  console.log(
    `✅ Seeded dev customer (${DEV_CUSTOMER_EMAIL}) + ${created.toString()} reservation(s) + review/inquiry (${inquiryCreated.toString()})`,
  );
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
      // contentJson 正本 → server 派生 HTML（保存パイプラインと同一）
      const plainText = stripHtmlToText(news.contentHtml, 4000);
      const { contentJson, contentHtml } = buildSeedLexicalContent(plainText);
      await prisma.news.create({
        data: {
          ...news,
          contentHtml,
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
  const { SYSTEM_PAGES } = await import("@/shared/lib/validations/page");
  const { DEFAULT_PAGE_SECTIONS } =
    await import("@/shared/lib/constants/default-page-sections");

  await bootstrapSystemPagesCommand(prisma);

  // `bootstrapSystemPagesCommand` は per-page の失敗を握って続行する。起動時の
  // instrumentation（`src/instrumentation.ts`）から呼ばれる関数で、DB が一時的に
  // 落ちていてもアプリの起動までは止めない、という可用性の判断が入っている
  // （その契約は `system-pages-commands.test.ts` が固定している）。
  //
  // だが seed から呼ぶと、同じ握りが「歯抜けの DB を成功として残す」に化ける。
  // 本番切替は seed を 1 回流すだけなので、セクションが 1 つも無い公開ページが
  // そのまま世に出る。握りを剥がす代わりに、**作られた結果をここで確かめる**。
  const slugs = SYSTEM_PAGES.map((page) => page.slug);
  const pages = await prisma.page.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, sections: { select: { id: true }, take: 1 } },
  });
  const sectionCountBySlug = new Map(
    pages.map((page) => [page.slug, page.sections.length]),
  );

  const missingPages = slugs.filter((slug) => !sectionCountBySlug.has(slug));
  if (missingPages.length > 0) {
    seedPreconditionFailed(
      `システムページが作られていない: ${missingPages.join(", ")}`,
    );
  }

  // 既定セクションを持たない slug は「0 件が正しい」ので対象外にする。
  const emptyPages = slugs.filter(
    (slug) =>
      (DEFAULT_PAGE_SECTIONS[slug]?.length ?? 0) > 0 &&
      sectionCountBySlug.get(slug) === 0,
  );
  if (emptyPages.length > 0) {
    seedPreconditionFailed(
      `システムページにセクションが 1 つも無い: ${emptyPages.join(", ")}`,
    );
  }

  console.log(`✅ System pages ensured (${String(slugs.length)} pages)`);
}

// =============================================================================
// Terms — 規約マスターの初期投入
//
// かつては `prisma/migrations/00000000000000_init/migration.sql` の `INSERT` が
// SSoT で、seed.ts は規約に一切触らない設計だった。だが migration 履歴を 1 本の
// baseline へ畳むとその `INSERT` ごと消え、**同意ゲートの必須規約が空集合になる**。
// DDL は完全なので適用も起動も成功し、誰かが気付くまで分からない壊れ方をする。
// cutover はどのみち本番 seed を 1 回流すので、こちらへ移した。
// =============================================================================

/**
 * 規約マスター 8 件を投入する。**既にある規約は一切触らない。**
 *
 * 文面は管理画面から改訂されうるので、re-seed で上書きすると編集を踏み潰す。
 * 「あれば skip」が正しく働く行でもある — 内容が自分の宣言だけで決まり、
 * `now` からの相対でも他の行からの導出でもないため（seed 規約の判定条件）。
 *
 * 存在判定は `terms_documents_slug_active_key`（`deletedAt IS NULL` の partial
 * unique）に合わせて **slug + deletedAt: null** で行う。述語を落とすと、
 * ソフトデリート済みの規約を「存在する」と数えて投入をスキップしてしまう。
 *
 * `displayOrder` は同じく partial unique に参加するのでリテラルを書かず、
 * create のたびに `max + 1` で採番する（`seedSpaceCategories` と同型）。
 * その結果 `SEED_TERMS_DOCUMENTS` の宣言順がそのまま表示順になる。
 */
async function seedTermsDocuments() {
  let created = 0;

  for (const doc of SEED_TERMS_DOCUMENTS) {
    const existing = await prisma.termsDocument.findFirst({
      where: { slug: doc.slug, deletedAt: null },
      select: { id: true },
    });
    if (existing) continue;

    const maxOrder = await prisma.termsDocument.aggregate({
      where: { deletedAt: null },
      _max: { displayOrder: true },
    });

    await prisma.termsDocument.create({
      data: {
        slug: doc.slug,
        type: doc.type,
        title: doc.title,
        scopes: [...doc.scopes],
        contentJson: parsePrismaInputJson(
          doc.contentJson,
          `seed 規約 (${doc.slug}) の contentJson が不正です`,
        ),
        contentHtml: doc.contentHtml,
        // 同意ゲートは公開済みの規約しか見ないので、公開状態で投入する。
        isPublished: true,
        publishedAt: new Date(),
        showInFooter: true,
        displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
      },
    });
    created += 1;
  }

  console.log(
    `✅ Seeded terms documents (${created} created, ${SEED_TERMS_DOCUMENTS.length - created} already present)`,
  );
}

/**
 * dev customer の LOGIN_SIGNUP scope 再同意を済ませる（**dev seed 限定**）。
 *
 * reagree gate（`assertLoginSignupReagreed`）は contentHash の一致を要求するので、
 * 現行 `TermsDocument` の `sha256(contentHtml)` で同意レコードを作る。これが無いと
 * マイページは中身の代わりに「利用規約の再同意」画面を出し、認証済み customer 系の
 * spec が軒並み落ちる。
 *
 * **`seedTermsDocuments()` の直後に呼ぶこと。** 元はこの処理が
 * `seedDevCustomerAndReservations()`（Phase 5）の中にあり、`seedTermsDocuments()`
 * は Phase 6 だった。つまり新品の DB では規約が 1 件も無い状態で `findMany` して
 * **黙って 0 件**になり、同意レコードが作られない。CI はたまたま seed を 2 回
 * 流していた（job step と Playwright の webServer chain）ため、2 周目に規約が
 * 存在して埋まり、この穴が 1 度も表面化していなかった。実測: 重複を外した途端に
 * 認証済み customer の 23 spec が再同意画面で落ちた（run 31283788048）。
 * 同じ理由で、**まっさらな環境に `bun run setup` した開発者**もこの壁を踏む。
 */
async function seedDevCustomerTermsAgreements() {
  const { createHash } = await import("node:crypto");

  const customer = await prisma.customer.findFirst({
    where: { email: DEV_CUSTOMER_EMAIL, userId: { not: null } },
    select: { id: true },
  });
  if (!customer) {
    seedPreconditionFailed(
      `${DEV_CUSTOMER_EMAIL} の Customer が無い（seedDevCustomerAndReservations が先に走る）`,
    );
  }

  const loginSignupDocs = await prisma.termsDocument.findMany({
    where: {
      deletedAt: null,
      isPublished: true,
      scopes: { has: TermsScope.LOGIN_SIGNUP },
    },
    select: { id: true, contentHtml: true },
  });
  if (loginSignupDocs.length === 0) {
    // 0 件で素通りすると「同意済みのつもりで壁に当たる」状態を静かに作る。
    seedPreconditionFailed(
      "LOGIN_SIGNUP scope の TermsDocument が 1 件も無い（seedTermsDocuments が先に走る）",
    );
  }

  let created = 0;
  for (const doc of loginSignupDocs) {
    const contentHash = createHash("sha256")
      .update(doc.contentHtml)
      .digest("hex");
    const existing = await prisma.termsAgreement.findFirst({
      where: {
        customerId: customer.id,
        termsId: doc.id,
        scope: TermsScope.LOGIN_SIGNUP,
        contentHash,
      },
    });
    if (existing) continue;
    await prisma.termsAgreement.create({
      data: {
        termsId: doc.id,
        customerId: customer.id,
        scope: TermsScope.LOGIN_SIGNUP,
        contentSnapshot: doc.contentHtml,
        contentHash,
      },
    });
    created += 1;
  }

  console.log(
    `✅ Seeded dev customer terms agreements (${created} created, ${loginSignupDocs.length - created} already present)`,
  );
}

// =============================================================================
// FAQ
// =============================================================================

async function seedFaq(overridePublished?: boolean) {
  const faqData = [
    {
      category: {
        name: "ご予約について",
        slug: "reservation",
        description: "予約に関するよくあるご質問",
        icon: "IconCalendarEvent",
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
        icon: "IconBuildingStore",
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
        icon: "IconSettings",
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
    // Round-5 audit Finding #18: slug の一意性は deletedAt: null な行の間でのみ
    // 強制される partial unique index になったため、findUnique({where:{slug}})
    // は (ソフトデリート済み行と衝突しうる場合に) 曖昧になる。deletedAt: null を
    // 明示した findFirst に置き換える。
    let faqCategory = await prisma.faqCategory.findFirst({
      where: { slug: category.slug, deletedAt: null },
    });

    if (!faqCategory) {
      const maxOrder = await prisma.faqCategory.aggregate({
        where: { deletedAt: null },
        _max: { order: true },
      });
      faqCategory = await prisma.faqCategory.create({
        data: {
          ...category,
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
      console.log(`✅ Created FAQ category: ${category.name}`);
    }

    for (const item of items) {
      // `deletedAt: null` を必ず入れる。`FaqItem` の `(categoryId, order)` unique は
      // 未削除行だけを対象にした partial index なので、削除済み行を「存在する」と
      // 判定すると create をスキップして表示が欠け、逆に削除済み行の order を
      // 空き扱いすると衝突する。判定の母集合を制約の述語に合わせる。
      const existing = await prisma.faqItem.findFirst({
        where: {
          categoryId: faqCategory.id,
          question: item.question,
          deletedAt: null,
        },
      });

      if (!existing) {
        // `order` は配列 index を書かない。管理画面の並び替え / 追加
        // （`faq/item-commands.ts`）で既存行が別の order を占有していると
        // P2002 で seed が中断する。未削除行の max+1 で採番すれば、
        // 宣言順がそのまま表示順になり衝突しえない。
        const maxOrder = await prisma.faqItem.aggregate({
          where: { categoryId: faqCategory.id, deletedAt: null },
          _max: { order: true },
        });
        await prisma.faqItem.create({
          data: {
            categoryId: faqCategory.id,
            question: item.question,
            answer: item.answer,
            order: (maxOrder._max.order ?? -1) + 1,
            isPublished: overridePublished ?? true,
            ...(overridePublished === false
              ? { publishedAt: null }
              : { publishedAt: new Date() }),
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
    seedPreconditionFailed(
      "role=ADMIN の User が無い（seedAdmin が先に走る）— ブログ記事の著者を決められない",
    );
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

  let nextCategoryOrder =
    (
      await prisma.postCategory.aggregate({
        _max: { order: true },
      })
    )._max.order ?? -1;

  for (const category of categories) {
    const existing = await prisma.postCategory.findUnique({
      where: { slug: category.slug },
    });
    if (!existing) {
      nextCategoryOrder += 1;
      await prisma.postCategory.create({
        data: { ...category, order: nextCategoryOrder },
      });
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
    seedPreconditionFailed(
      "ブログカテゴリ（case-study / tips）が無い — 直前の createMany が作るはずのもの",
    );
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
    const existing = await prisma.post.findFirst({
      where: { slug: postData.slug, deletedAt: null },
    });
    if (!existing) {
      // タグを先にfindOrCreate
      const tagIds = await Promise.all(
        tagNames.map(async (name: string) => {
          const tag = await prisma.postTag.findFirst({ where: { name } });
          if (!tag) {
            // 不正 slug（slug=name の日本語）の暗黙生成を禁止する。記事 tagNames は
            // 必ず seedBlogTags に有効な ASCII slug（SLUG_REGEX 準拠）付きで定義する。
            throw new Error(
              `seedBlog: タグ "${name}" が seedBlogTags に未定義です。` +
                "有効な slug 付きで seedBlogTags に追加してください。",
            );
          }
          return tag.id;
        }),
      );

      // contentJson 正本 → server 派生 HTML（保存パイプラインと同一）
      const rawContent =
        typeof postData.contentHtml === "string" ? postData.contentHtml : "";
      const plainText = stripHtmlToText(rawContent, 4000);
      const { contentJson, contentHtml } = buildSeedLexicalContent(plainText);

      await prisma.post.create({
        data: {
          ...postData,
          contentHtml,
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
// Navigation
// =============================================================================

/**
 * ナビゲーション項目の宣言。**`(type, order)` が一意キー**
 * （`navigation_items_type_order_key`、`prisma/schema.prisma`）。
 *
 * 旧実装は `(type, url)` で存在判定して `order` をリテラルで create していた。
 * 判定キーと制約キーが違うため、url だけがずれた行が既にあると
 * 「見つからない → 同じ order で create → P2002」で seed が中断し、
 * `main().catch` の `process.exit(1)` で以降の phase が丸ごと走らなくなる。
 * url がずれるのは実際に起きる: 管理画面の `updateNavigationItem` は
 * `url` を書き換えるが `order` は据え置く（`navigation/commands.ts`）。
 * 過去のコミットで url を変えた seed（`/posts` → `/blog` 等）を当てた DB も同じ。
 *
 * `_key` は決定的にする。`crypto.randomUUID()` だと reconcile のたびに JSON が
 * 変わり、毎回無意味な更新が走る。Portable Text の `_key` は
 * `z.string().min(1)`（`portable-text/schema.ts`）で形式自由なので、
 * `${type}-${order}` で一意かつ安定に作れる。
 */
const SEED_NAVIGATION_GROUPS = [
  {
    type: "HEADER_DESKTOP",
    items: [
      { text: "ホーム", url: "/", order: 0 },
      { text: "スペース", url: "/spaces", order: 1 },
      { text: "イベント", url: "/events", order: 2 },
      { text: "ブログ", url: "/blog", order: 3 },
      { text: "お知らせ", url: "/news", order: 4 },
      { text: "よくある質問", url: "/faq", order: 5 },
      { text: "アクセス", url: "/access", order: 6 },
      { text: "お問い合わせ", url: "/contact", order: 7 },
    ],
  },
  {
    type: "HEADER_MOBILE",
    items: [
      { text: "ホーム", url: "/", order: 0 },
      { text: "スペース", url: "/spaces", order: 1 },
      { text: "イベント", url: "/events", order: 2 },
      { text: "ブログ", url: "/blog", order: 3 },
      { text: "お知らせ", url: "/news", order: 4 },
      { text: "よくある質問", url: "/faq", order: 5 },
      { text: "アクセス", url: "/access", order: 6 },
      { text: "お問い合わせ", url: "/contact", order: 7 },
    ],
  },
  {
    type: "FOOTER",
    items: [
      { text: "規約一覧", url: "/terms", order: 0 },
      { text: "会社概要", url: "/about", order: 1 },
      { text: "お問い合わせ", url: "/contact", order: 2 },
    ],
  },
] as const;

/**
 * @param reconcile 既存行を宣言どおりに戻すか。dev は true（デモデータを宣言に
 *   収束させる）、**本番は false**（管理画面での編集を seed が踏み潰さない）。
 *   `seedLocations(false)` / `seedFaq(false)` と同じ dev/prod 分離の形。
 */
async function seedNavigation(reconcile = true) {
  // 本番（reconcile=false）は空テーブルの初回投入だけ create する。
  // 欠けた (type, order) を埋め直すと、管理画面の削除+並び替え後に
  // 宣言配列の末尾項目が重複する。
  if (!reconcile) {
    const existingCount = await prisma.navigationItem.count();
    if (existingCount !== 0) {
      console.log(
        `⏭️ Skipped existing navigation items (${existingCount.toString()} already exist)`,
      );
      return;
    }
  }

  for (const group of SEED_NAVIGATION_GROUPS) {
    for (const item of group.items) {
      // label は PortableTextSpan[]（テキスト + アイコン混在の token 配列）。
      const label = [
        {
          _key: `${group.type}-${String(item.order)}`,
          _type: "span" as const,
          text: item.text,
        },
      ];

      // 宣言している内容の全体。`create` と `update` で同じものを使う。
      //
      // 以前 `update` は `label` と `url` だけを戻していた。`isExternal` /
      // `isActive` / `parentId` は schema の default に任せて create でしか
      // 効かないので、管理画面でそれらを変えた行は **url だけが宣言値に戻り、
      // 他は変えられたまま**になる。`isExternal: true` のまま `url: "/"` に
      // されて内部リンクが外部リンク扱いになったり、既定の項目が非表示のまま
      // 残ったり、別項目の下にぶら下がったままになる。dev の収束を謳う以上、
      // 宣言している列は全部戻す。
      //
      // seed が置くのは全て内部パス（`/spaces` 等）なので `isExternal: false`、
      // トップレベル項目なので `parentId: null` が宣言値。
      const declaredContent = {
        label: label,
        url: item.url,
        isExternal: false,
        isActive: true,
        parentId: null,
      };

      await prisma.navigationItem.upsert({
        // 制約と同じキーで引く。これが P2002 を構造的に不可能にする。
        where: { type_order: { type: group.type, order: item.order } },
        // 本番（`reconcile: false`）は空のまま。管理画面の編集を踏み潰さない。
        update: reconcile ? declaredContent : {},
        create: {
          type: group.type,
          order: item.order,
          ...declaredContent,
        },
      });
    }
  }

  console.log(
    reconcile
      ? "✅ Reconciled navigation items"
      : "✅ Created missing navigation items",
  );
}

// =============================================================================
// Announcement Bar
// =============================================================================

async function seedAnnouncementBar() {
  const createSeedAnnouncement = ({
    icon,
    text,
    ...data
  }: {
    icon: string;
    text: string;
    linkUrl?: string;
    linkText?: string;
    isActive?: boolean;
  }) => ({
    probe: text,
    message: [createInlineIcon(icon), createSpan(text)],
    ...data,
  });

  const announcements = [
    createSeedAnnouncement({
      icon: "IconInfoCircle",
      text: "年末年始の営業日程を掲載しました",
      linkUrl: "/news",
      linkText: "詳細を見る",
    }),
    createSeedAnnouncement({
      icon: "IconSparkles",
      text: "オープン記念!今月末まで全スペース20%OFF",
      linkUrl: "/spaces",
      linkText: "スペースを見る",
    }),
    createSeedAnnouncement({
      icon: "IconAlertTriangle",
      text: "1月15日(水)は設備点検のため休館いたします",
      isActive: false,
    }),
  ];

  for (const announcement of announcements) {
    // idempotency: 同 probe 文字列を含む span 配列があるか JSONB path で判定
    const existing = await prisma.announcementBar.findFirst({
      where: {
        message: {
          path: ["1", "text"],
          string_contains: announcement.probe.slice(0, 12),
        },
      },
    });

    if (!existing) {
      // `displayOrder` は無条件 @unique。宣言リテラルのまま create すると、
      // 管理画面で並び替えた DB の re-seed が P2002 で中断する。max+1 で採番する。
      const { probe: _probe, ...data } = announcement;
      const maxOrder = await prisma.announcementBar.aggregate({
        _max: { displayOrder: true },
      });
      await prisma.announcementBar.create({
        data: { ...data, displayOrder: (maxOrder._max.displayOrder ?? -1) + 1 },
      });
      console.log(
        `✅ Created announcement: ${announcement.probe.slice(0, 30)}...`,
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
    },
    {
      platform: "INSTAGRAM" as const,
      url: "https://instagram.com/myrrh_rental",
    },
    {
      platform: "FACEBOOK" as const,
      url: "https://facebook.com/myrrh.rental",
    },
    {
      platform: "LINE" as const,
      url: "https://line.me/R/ti/p/@myrrh-rental",
    },
    {
      platform: "YOUTUBE" as const,
      url: "https://youtube.com/@myrrh-rental",
      showOnMobile: false,
    },
  ];

  for (const link of socialLinks) {
    const existing = await prisma.socialLink.findFirst({
      where: { platform: link.platform },
    });

    if (!existing) {
      // `order` は無条件 @unique。宣言リテラルのまま create すると、管理画面で
      // 並び替えた DB の re-seed が P2002 で中断する。max+1 で採番する。
      const data = link;
      const maxOrder = await prisma.socialLink.aggregate({
        _max: { order: true },
      });
      await prisma.socialLink.create({
        data: { ...data, order: (maxOrder._max.order ?? -1) + 1 },
      });
      console.log(`✅ Created social link: ${link.platform}`);
    }
  }
}

// =============================================================================
// Seed: Events
// =============================================================================

async function seedEvents() {
  // Location は seedLocations で先に作られている前提（seedDev で呼び出し順保証）
  const locationsByName = new Map(
    (await prisma.location.findMany({ select: { id: true, name: true } })).map(
      (l) => [l.name, l.id],
    ),
  );
  const honkanId = locationsByName.get("本館") ?? null;
  const bekkanId = locationsByName.get("別館") ?? null;

  // seedEventCategories() is guaranteed to run first in the same seed
  // invocation (see the `await seedEventCategories();` call immediately
  // before `await seedEvents();` in seedDev()) and creates exactly these
  // four names. ESLint's no-non-null-assertion rule applies repo-wide
  // (not just `src/`), so a throwing lookup is used instead of `!`.
  const eventCategories = await prisma.eventCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const findEventCategoryId = (name: string): string => {
    const category = eventCategories.find((c) => c.name === name);
    if (!category) {
      throw new Error(
        `Seed invariant violated: EventCategory "${name}" not found. seedEventCategories() must run before seedEvents().`,
      );
    }
    return category.id;
  };
  // Only the categories actually referenced by eventSeedSource below are
  // looked up here. マルシェ・展示 / その他 are still created by
  // seedEventCategories() for admin-UI variety even though no current
  // fixture event uses them yet.
  const workshopCategoryId = findEventCategoryId("ワークショップ");
  const seminarCategoryId = findEventCategoryId("セミナー・交流会");

  const futureJstDate = (daysFromNow: number, hour: number, minute = 0) => {
    const now = new Date();
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysFromNow,
        hour - 9,
        minute,
        0,
        0,
      ),
    );
  };

  const eventSeedSource: Array<{
    title: string;
    slug: string;
    description: string;
    scheduleMode: EventScheduleMode;
    slots: Array<{ startAt: Date; endAt: Date; capacity: number }>;
    price: number;
    addressDetail?: string;
    locationId?: string | null;
    categoryId: string;
    status: EventStatus;
    registrationOpen: boolean;
    publishedAt?: Date;
  }> = [
    {
      title: "ヨガ＆マインドフルネス体験会",
      slug: "yoga-mindfulness-workshop",
      description:
        "初心者歓迎のヨガ体験会です。心身のリラクゼーションを体験しましょう。",
      scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
      slots: [
        {
          startAt: futureJstDate(21, 10),
          endAt: futureJstDate(21, 12),
          capacity: 15,
        },
      ],
      price: 2000,
      locationId: honkanId,
      categoryId: workshopCategoryId,
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
      scheduleMode: EventScheduleMode.TIMED_ENTRY,
      slots: [
        {
          startAt: futureJstDate(28, 10),
          endAt: futureJstDate(28, 12),
          capacity: 8,
        },
        {
          startAt: futureJstDate(28, 14),
          endAt: futureJstDate(28, 16),
          capacity: 8,
        },
      ],
      price: 5000,
      locationId: bekkanId,
      categoryId: workshopCategoryId,
      addressDetail: "ギャラリールーム",
      status: EventStatus.PUBLISHED,
      registrationOpen: true,
      publishedAt: new Date(),
    },
    {
      title: "ビジネスネットワーキングイベント",
      slug: "business-networking",
      description: "地域のビジネスオーナーが集まる交流会。軽食付き。",
      scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
      slots: [
        {
          startAt: futureJstDate(35, 18),
          endAt: futureJstDate(35, 20),
          capacity: 30,
        },
      ],
      price: 0,
      locationId: honkanId,
      categoryId: seminarCategoryId,
      addressDetail: "1F メインホール",
      status: EventStatus.DRAFT,
      registrationOpen: false,
    },
    {
      title: "キッズアートスクール",
      slug: "kids-art-school",
      description: "お子様向けのアート教室。絵の具や材料は全てご用意します。",
      scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
      slots: [
        {
          startAt: futureJstDate(42, 10),
          endAt: futureJstDate(42, 12),
          capacity: 8,
        },
      ],
      price: 1500,
      // 外部会場（location なし、addressDetail も空）の例
      categoryId: workshopCategoryId,
      status: EventStatus.CANCELLED,
      registrationOpen: false,
    },
    {
      title: "【開催終了】春の書道教室",
      slug: "spring-calligraphy-archived",
      description:
        "過去に開催した書道教室のアーカイブです。次回開催をお待ちください。",
      scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
      slots: [
        {
          startAt: new Date("2026-03-05T10:00:00+09:00"),
          endAt: new Date("2026-03-05T12:00:00+09:00"),
          capacity: 10,
        },
      ],
      price: 3000,
      addressDetail: "渋谷区文化総合センター大和田 和室",
      categoryId: workshopCategoryId,
      status: EventStatus.ARCHIVED,
      registrationOpen: false,
      publishedAt: new Date("2026-02-15T09:00:00+09:00"),
    },
    {
      title: "陶芸体験ワークショップ",
      slug: "waitlist-test",
      description:
        "少人数制の陶芸体験。定員1名の人気講座で、満席時はキャンセル待ちにご登録いただけます。",
      scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
      slots: [
        {
          startAt: futureJstDate(60, 15),
          endAt: futureJstDate(60, 17),
          capacity: 1,
        },
      ],
      price: 0,
      locationId: honkanId,
      categoryId: workshopCategoryId,
      addressDetail: "2F 陶芸スタジオ",
      status: EventStatus.PUBLISHED,
      registrationOpen: true,
      publishedAt: new Date(),
    },
  ];

  let createdCount = 0;
  /**
   * 会計証跡があって作り直しを見送った event の id。
   *
   * 後段の申込 fixture（generic sample 3 件 + yoga の dev customer 1 件）は
   * 「作り直し時に delete が先に走る」ことを前提に冪等になっている。見送った
   * event はその delete を通らないので、除外しないと**再実行のたびに積み増す**。
   * 申込が増えれば CONFIRMED の占有数も増え、定員・待機列の E2E 契約が崩れる。
   */
  const skippedEventIds = new Set<string>();
  for (const {
    description,
    price,
    slots,
    publishedAt,
    ...eventRest
  } of eventSeedSource) {
    const sortedSlots = [...slots].sort(
      (a, b) => a.startAt.getTime() - b.startAt.getTime(),
    );
    const firstSlot = sortedSlots[0];
    const lastSlot = sortedSlots[sortedSlots.length - 1];
    if (!firstSlot || !lastSlot) continue;

    await prisma.$transaction(async (tx) => {
      // Event.slug は deletedAt IS NULL の partial unique。Prisma upsert(where:{slug})
      // はフル unique を要求するため ON CONFLICT が失敗する → findFirst + update/create。
      const existingEvent = await tx.event.findFirst({
        where: { slug: eventRest.slug, deletedAt: null },
        select: { id: true },
      });

      // Dev/test seed contract: seeded events are rebuilt so E2E data never drifts.
      //
      // ただし**会計証跡が付いた申込がある event は丸ごと作り直さない**。
      // `Receipt.eventRegistration` / `Refund.eventRegistration` は
      // `onDelete: Restrict`（「領収書がある申込は物理削除不可」= 会計証跡保護）
      // なので、削除しようとすると P2003 で seed が中断し、`main().catch` の
      // `process.exit(1)` で以降の phase が丸ごと走らなくなる。
      // dev / staging で Stripe のテスト決済を 1 度通すだけでこの状態になる
      // （`events/payment-commands.ts` と
      // `stripe-webhook/fulfill-event-registration-payment.ts` が領収書を発行する）。
      //
      // 「証跡付きだけ残して他を消す」では解けない。`slotId` / `ticketId` の FK も
      // `RESTRICT` なので、残した申込が参照する slot / ticket の削除で今度はそちらが
      // 落ちる。event 単位で作り直しを見送り、理由を名指しで出すのが正しい形。
      // **判定は event を書き換える前に行う。** `firstSlotStartAt` /
      // `lastSlotEndAt` は slot から導出した非正規化列で、`eventData` には実行時刻
      // 基準の新しい値が入っている。先に update してしまうと、作り直しを見送って
      // 古い slot を残したのに順序・表示用の列だけ新しい日付になり、
      // 「Skipped rebuilding」と言いながら中身が食い違う状態を作る。
      const accountedRegistrations = existingEvent
        ? await tx.eventRegistration.count({
            where: {
              eventId: existingEvent.id,
              // `receipt` は to-one（`Receipt.eventRegistrationId` が @unique）、
              // `refunds` は to-many。カーディナリティが違うので述語も変える。
              OR: [{ receipt: { isNot: null } }, { refunds: { some: {} } }],
            },
          })
        : 0;
      if (existingEvent && accountedRegistrations > 0) {
        console.log(
          `⏭️ Skipped rebuilding event ${eventRest.slug}: ${String(accountedRegistrations)} registration(s) carry a receipt/refund (accounting trail is protected by ON DELETE RESTRICT)`,
        );
        // 後段の申込 fixture からも外す。`EventRegistration` にはこれらの fixture を
        // 一意にする制約が無いので、外さないと**再実行のたびに 3 件ずつ積み増す**
        // （作り直した event では delete が先に走るので冪等になっている）。
        skippedEventIds.add(existingEvent.id);
        // `$transaction` の callback 内なので `continue` は使えない（この event の
        // 作り直しだけを見送る）。
        return;
      }

      const eventData = {
        ...eventRest,
        ...buildSeedDescription(description),
        publishedAt: publishedAt ?? null,
        firstSlotStartAt: firstSlot.startAt,
        lastSlotEndAt: lastSlot.endAt,
      };
      const event = existingEvent
        ? await tx.event.update({
            where: { id: existingEvent.id },
            data: eventData,
            select: { id: true },
          })
        : await tx.event.create({
            data: eventData,
            select: { id: true },
          });

      await tx.eventRegistration.deleteMany({ where: { eventId: event.id } });
      await tx.eventTimeSlot.deleteMany({ where: { eventId: event.id } });
      await tx.eventTicket.deleteMany({ where: { eventId: event.id } });

      await tx.eventTimeSlot.createMany({
        data: sortedSlots.map((slot) => ({
          eventId: event.id,
          startAt: slot.startAt,
          endAt: slot.endAt,
          capacity: slot.capacity,
        })),
      });

      await tx.eventTicket.create({
        data: {
          eventId: event.id,
          name: "一般",
          price,
          unitSize: 1,
          sortOrder: 0,
          isAvailable: true,
        },
      });
    });
    createdCount++;
  }

  // PUBLISHED イベントにサンプル申込を追加
  // waitlist-test は専用の待機列 fixture（このあと個別に登録）を使うため除外する。
  // capacity=1 にこの generic sample (CONFIRMED×2 + CANCELLED×1) を足すと
  // 「1 CONFIRMED + 2 WAITLISTED + 1 WAITLISTED_OFFERED」の固定契約が崩れる。
  const seedEventSlugs = eventSeedSource
    .map((event) => event.slug)
    .filter((slug) => slug !== "waitlist-test");
  const publishedEvents = await prisma.event.findMany({
    where: {
      status: EventStatus.PUBLISHED,
      slug: { in: seedEventSlugs },
      // `events_slug_active_key` は `where deletedAt IS NULL` の partial unique。
      // 述語を揃えないと、ソフトデリート済みの同 slug 行を「在る」と数えてしまう。
      deletedAt: null,
    },
    select: {
      id: true,
      slug: true,
      tickets: {
        select: { id: true },
        orderBy: { sortOrder: "asc" as const },
        take: 1,
      },
      slots: {
        select: { id: true },
        orderBy: { startAt: "asc" as const },
        take: 1,
      },
    },
  });

  const sampleRegistrations = [
    {
      name: "田中太郎",
      email: "tanaka@example.com",
      phone: null,
      quantity: 2,
      status: RegistrationStatus.CONFIRMED,
    },
    {
      name: "佐藤花子",
      email: "sato@example.com",
      phone: "090-1234-5678",
      quantity: 1,
      status: RegistrationStatus.CONFIRMED,
    },
    {
      name: "鈴木一郎",
      email: "suzuki@example.com",
      phone: "080-9876-5432",
      quantity: 3,
      status: RegistrationStatus.CANCELLED,
    },
  ];

  let registrationCount = 0;
  for (const event of publishedEvents) {
    // 作り直しを見送った event は delete を通っていないので、ここで足すと重複する。
    if (skippedEventIds.has(event.id)) continue;

    const firstTicket = event.tickets[0];
    if (!firstTicket) continue;

    const firstSlotId = event.slots[0]?.id;
    if (!firstSlotId) continue;
    for (const reg of sampleRegistrations) {
      await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          ticketId: firstTicket.id,
          slotId: firstSlotId,
          name: reg.name,
          email: reg.email,
          phone: reg.phone,
          quantity: reg.quantity,
          status: reg.status,
        },
      });
      registrationCount++;
    }
  }

  const devCustomer = await findDevMemberCustomer({
    id: true,
    email: true,
    lastName: true,
    firstName: true,
  });
  // partial unique（`where deletedAt IS NULL`）なので `findFirst` + 述語で引く。
  // `findUnique({ where: { slug } })` は生成 client が受け付けてしまうが、
  // 母集合が制約とずれる（監査 F-17）。
  const singleEvent = await prisma.event.findFirst({
    where: { slug: "yoga-mindfulness-workshop", deletedAt: null },
    select: {
      id: true,
      tickets: {
        select: { id: true },
        orderBy: { sortOrder: "asc" as const },
        take: 1,
      },
      slots: {
        select: { id: true },
        orderBy: { startAt: "asc" as const },
        take: 1,
      },
    },
  });
  const devTicketId = singleEvent?.tickets[0]?.id;
  const devSlotId = singleEvent?.slots[0]?.id;
  if (
    devCustomer &&
    singleEvent &&
    // 上と同じ理由。見送った event へ足すと再実行のたびに増える。
    !skippedEventIds.has(singleEvent.id) &&
    devTicketId &&
    devSlotId
  ) {
    await prisma.eventRegistration.create({
      data: {
        eventId: singleEvent.id,
        ticketId: devTicketId,
        slotId: devSlotId,
        customerId: devCustomer.id,
        name: `${devCustomer.lastName} ${devCustomer.firstName}`,
        email: devCustomer.email,
        phone: "090-0000-0000",
        note: "[E2E] dev customer event registration",
        quantity: 1,
        status: RegistrationStatus.CONFIRMED,
      },
    });
    registrationCount++;
  }

  // waitlist-test: capacity=1 を「1 CONFIRMED (満席) + 2 WAITLISTED (FIFO 順) +
  // 1 WAITLISTED_OFFERED (24h TTL 内)」で固定する専用 fixture。
  // `eventFixtures.waitlistTestSlug`（E2E）と管理画面キャンセル待ちキューの両方から参照する。
  const waitlistTestEvent = await prisma.event.findFirst({
    where: { slug: "waitlist-test", deletedAt: null },
    select: {
      id: true,
      tickets: {
        select: { id: true },
        orderBy: { sortOrder: "asc" as const },
        take: 1,
      },
      slots: {
        select: { id: true },
        orderBy: { startAt: "asc" as const },
        take: 1,
      },
    },
  });
  const waitlistTicketId = waitlistTestEvent?.tickets[0]?.id;
  const waitlistSlotId = waitlistTestEvent?.slots[0]?.id;
  if (
    waitlistTestEvent &&
    // 上 2 つと同じ理由。ここは「1 CONFIRMED + 2 WAITLISTED + 1 OFFERED」の固定契約なので、
    // 積み増すと待機列 E2E が最初に壊れる。
    !skippedEventIds.has(waitlistTestEvent.id) &&
    waitlistTicketId &&
    waitlistSlotId
  ) {
    const now = new Date();
    const waitlistSeedData: Array<{
      name: string;
      email: string;
      note: string;
      quantity: number;
      status: RegistrationStatus;
      waitlistedAt: Date | null;
      offeredAt: Date | null;
      expiresAt: Date | null;
    }> = [
      {
        name: "確定 花子",
        email: "waitlist-confirmed@example.com",
        note: "[E2E] waitlist-test: capacity を満たす CONFIRMED",
        quantity: 1,
        status: RegistrationStatus.CONFIRMED,
        waitlistedAt: null,
        offeredAt: null,
        expiresAt: null,
      },
      {
        name: "待機 一郎",
        email: "waitlist-first@example.com",
        note: "[E2E] waitlist-test: WAITLISTED (FIFO 1番目、繰り上げ待ち)",
        quantity: 1,
        status: RegistrationStatus.WAITLISTED,
        waitlistedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        offeredAt: null,
        expiresAt: null,
      },
      {
        name: "待機 二郎",
        email: "waitlist-second@example.com",
        note: "[E2E] waitlist-test: WAITLISTED (FIFO 2番目)",
        quantity: 1,
        status: RegistrationStatus.WAITLISTED,
        waitlistedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        offeredAt: null,
        expiresAt: null,
      },
      {
        name: "繰上 三郎",
        email: "waitlist-offered@example.com",
        note: "[E2E] waitlist-test: WAITLISTED_OFFERED (24h TTL の残り23h)",
        quantity: 1,
        status: RegistrationStatus.WAITLISTED_OFFERED,
        // 待機列内で最も古い waitlistedAt (= FIFO 最先着) が繰り上げ当選した想定。
        waitlistedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
        offeredAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() + 23 * 60 * 60 * 1000),
      },
    ];

    for (const reg of waitlistSeedData) {
      await prisma.eventRegistration.create({
        data: {
          eventId: waitlistTestEvent.id,
          ticketId: waitlistTicketId,
          slotId: waitlistSlotId,
          name: reg.name,
          email: reg.email,
          note: reg.note,
          quantity: reg.quantity,
          status: reg.status,
          waitlistedAt: reg.waitlistedAt,
          offeredAt: reg.offeredAt,
          expiresAt: reg.expiresAt,
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
    seedPreconditionFailed(
      "COMPLETED の予約が 1 件も無い（seedReservations が先に走る）— レビューを紐付けられない",
    );
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

async function seedPublicReviewE2EFixture() {
  const [space, customer] = await Promise.all([
    // `spaces_slug_active_key` は `where isActive = true` の partial unique。
    prisma.space.findFirst({
      where: { slug: REVIEW_E2E_SPACE_SLUG, isActive: true },
      select: { id: true, hourlyPrice: true },
    }),
    findDevMemberCustomer({ id: true }),
  ]);

  if (!space || !customer) {
    seedPreconditionFailed(
      `${REVIEW_E2E_SPACE_SLUG} または dev customer が無い — 公開レビューの E2E fixture を作れない`,
    );
  }

  const notes = "[E2E] public review fixture";
  const start = new Date();
  start.setDate(start.getDate() - 75);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(11, 0, 0, 0);
  const basePrice = Number(space.hourlyPrice) * 2;

  const existingReservation = await prisma.reservation.findFirst({
    where: { notes },
    select: { id: true },
  });

  const reservation = existingReservation
    ? await prisma.reservation.update({
        where: { id: existingReservation.id },
        data: {
          spaceId: space.id,
          customerId: customer.id,
          startTime: start,
          endTime: end,
          status: "COMPLETED",
          paymentStatus: "PAID",
          basePrice,
          totalPrice: basePrice,
          notes,
        },
        select: { id: true },
      })
    : await prisma.reservation.create({
        data: {
          spaceId: space.id,
          customerId: customer.id,
          startTime: start,
          endTime: end,
          status: "COMPLETED",
          paymentStatus: "PAID",
          basePrice,
          totalPrice: basePrice,
          notes,
          ...buildSeedLegacyPricingSnapshot(basePrice),
        },
        select: { id: true },
      });

  await prisma.spaceReview.upsert({
    where: { reservationId: reservation.id },
    update: {
      spaceId: space.id,
      customerId: customer.id,
      rating: 5,
      title: "[E2E] 公開レビュー検証用",
      comment: "公開スペース詳細のレビュー表示を検証する固定 fixture。",
      isPublished: true,
    },
    create: {
      reservationId: reservation.id,
      spaceId: space.id,
      customerId: customer.id,
      rating: 5,
      title: "[E2E] 公開レビュー検証用",
      comment: "公開スペース詳細のレビュー表示を検証する固定 fixture。",
      isPublished: true,
    },
  });

  console.log("✅ Upserted public review E2E fixture");
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
    // 申込単体の管理画面ルートは無いので、リンク先はイベントになる（eventId を使う）
    select: { name: true, eventId: true },
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
      type: "inquiry_new",
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
    notifications.push({
      type: "EVENT_REGISTERED",
      title: "イベント申込",
      message: `${latestRegistration.name}様からイベント申込が入りました`,
      // `getNotificationResourceHref` のルート表は event / reservation / inquiry /
      // review / customer しか持たない。"event-registration" を入れてもリンクは
      // 出ないので、開催イベントの編集画面へ飛ばす。
      resourceType: "event",
      resourceId: latestRegistration.eventId,
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
    seedPreconditionFailed(
      "管理者通知が指す先（予約・問い合わせ・レビュー等）が 1 件も無い",
    );
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
        tags: asPrismaInputJsonValue(entry.tags, "seed media tags が不正です"),
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
        nodeJson: parsePrismaInputJson(
          buildParagraphEditorStateJson(template.content),
          "seed block template nodeJson が不正です",
        ),
        ...(creator ? { createdBy: creator.id } : {}),
      },
    });
  }

  console.log(`✅ Created ${templates.length.toString()} block templates`);
}

// =============================================================================
// Audit Logs（監査ログ・全 AuditAction カバレッジ）
// =============================================================================

const SEED_AUDIT_LOG_HASH_KEY_ID_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/u;
const LOCAL_DEV_AUDIT_LOG_HMAC_KEY = "f".repeat(64);

function getSeedAuditLogHmacKeyHex(): string {
  const configuredKey = process.env["AUDIT_LOG_HMAC_KEY"];
  if (configuredKey) return configuredKey;

  return LOCAL_DEV_AUDIT_LOG_HMAC_KEY;
}

function getSeedAuditLogHashKeyId(): string {
  const keyId = process.env["AUDIT_LOG_HMAC_KEY_ID"] ?? "v1";
  if (!SEED_AUDIT_LOG_HASH_KEY_ID_PATTERN.test(keyId)) {
    throw new Error(
      "AUDIT_LOG_HMAC_KEY_ID must be 1-32 chars of [a-zA-Z0-9_-]",
    );
  }
  return keyId;
}

async function createSeedAuditLogRecord(input: {
  action: AuditLogHashPayload["action"];
  resource: string;
  userId?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
  createdAt: Date;
}) {
  const previous = await prisma.auditLog.findFirst({
    select: { sequence: true, entryHash: true },
    orderBy: { sequence: "desc" },
  });

  const id = randomUUID();
  const sequence = previous ? previous.sequence + 1n : 1n;
  const previousHash = previous?.entryHash ?? AUDIT_LOG_GENESIS_HASH;
  const hashKeyId = getSeedAuditLogHashKeyId();
  const metadata = input.metadata ?? null;
  const hashPayload: AuditLogHashPayload = {
    version: AUDIT_LOG_CHAIN_VERSION,
    id,
    sequence: sequence.toString(),
    previousHash,
    hashAlgorithm: AUDIT_LOG_HASH_ALGORITHM,
    hashKeyId,
    userId: input.userId ?? null,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    oldValue: null,
    newValue: null,
    metadata,
    createdAt: input.createdAt.toISOString(),
  };
  const entryHash = computeAuditLogEntryHashWithKey(
    hashPayload,
    getSeedAuditLogHmacKeyHex(),
  );

  await prisma.auditLog.create({
    data: {
      id,
      sequence,
      previousHash,
      entryHash,
      hashAlgorithm: AUDIT_LOG_HASH_ALGORITHM,
      hashKeyId,
      chainVersion: AUDIT_LOG_CHAIN_VERSION,
      action: input.action,
      resource: input.resource,
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.resourceId !== undefined
        ? { resourceId: input.resourceId }
        : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      createdAt: input.createdAt,
    },
  });
}

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
    seedPreconditionFailed(
      "ADMIN / SUPER_ADMIN の User が無い（seedAdmin が先に走る）— 監査ログの actor を決められない",
    );
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

  // AuditAction 全 16 値（schema.prisma の AuditAction enum と一致）:
  // CREATE / UPDATE / DELETE / READ / MANAGE / PUBLISH / EXPORT / LOGIN_SUCCESS /
  // LOGIN_FAILED / LOGOUT / PERMISSION_DENIED / PASSWORD_CHANGE /
  // PASSWORD_RESET_REQUEST / PASSWORD_RESET_FAILED / ROLE_CHANGE / INTEGRITY_CHECK
  const entries: Array<{
    action:
      | "CREATE"
      | "UPDATE"
      | "DELETE"
      | "READ"
      | "MANAGE"
      | "PUBLISH"
      | "EXPORT"
      | "LOGIN_SUCCESS"
      | "LOGIN_FAILED"
      | "LOGOUT"
      | "PERMISSION_DENIED"
      | "PASSWORD_CHANGE"
      | "PASSWORD_RESET_REQUEST"
      | "PASSWORD_RESET_FAILED"
      | "ROLE_CHANGE"
      | "INTEGRITY_CHECK";
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
      action: "READ",
      resource: "receipt",
      userId: admin.id,
      metadata: { format: "pdf", source: "seed" },
      createdAt: hoursAgo(44),
    },
    {
      action: "MANAGE",
      resource: "auditLog",
      userId: admin.id,
      metadata: { operation: "verifyAuditLogIntegrity" },
      createdAt: hoursAgo(42),
    },
    {
      action: "PUBLISH",
      resource: "post",
      ...(firstPost?.id ? { resourceId: firstPost.id } : {}),
      userId: admin.id,
      createdAt: hoursAgo(40),
    },
    {
      action: "LOGIN_SUCCESS",
      resource: "adminAuth",
      userId: admin.id,
      metadata: { ipAddress: "203.0.113.10", userAgent: "Mozilla/5.0" },
      createdAt: hoursAgo(24),
    },
    {
      action: "LOGIN_FAILED",
      resource: "adminAuth",
      userId: null,
      metadata: { ipAddress: "203.0.113.99", reason: "user_not_authorized" },
      createdAt: hoursAgo(18),
    },
    {
      action: "LOGOUT",
      resource: "adminAuth",
      userId: admin.id,
      createdAt: hoursAgo(12),
    },
    {
      action: "EXPORT",
      resource: "auditLog",
      userId: admin.id,
      metadata: { format: "csv", exportedCount: 25 },
      createdAt: hoursAgo(10),
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
      action: "PASSWORD_RESET_FAILED",
      resource: "auth",
      userId: null,
      metadata: { email: "forgot@example.com", reason: "token_expired" },
      createdAt: hoursAgo(3),
    },
    {
      action: "ROLE_CHANGE",
      resource: "user",
      userId: admin.id,
      metadata: { target: "editor@example.com", from: "VIEWER", to: "EDITOR" },
      createdAt: hoursAgo(2),
    },
    {
      action: "INTEGRITY_CHECK",
      resource: "auditLog",
      userId: admin.id,
      metadata: { operation: "verifyAuditLogIntegrity", ok: true },
      createdAt: hoursAgo(1.5),
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
    await createSeedAuditLogRecord({
      action: entry.action,
      resource: entry.resource,
      ...(entry.userId !== null ? { userId: entry.userId } : {}),
      ...(entry.resourceId !== undefined
        ? { resourceId: entry.resourceId }
        : {}),
      ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
      createdAt: entry.createdAt,
    });
  }

  console.log(
    `✅ Created ${entries.length.toString()} audit log entries (all 16 AuditAction values)`,
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
    seedPreconditionFailed(
      "ADMIN / SUPER_ADMIN の User が無い（seedAdmin が先に走る）— エディターコメントの作成者を決められない",
    );
  }

  const posts = await prisma.post.findMany({
    take: 3,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  // noUncheckedIndexedAccess 下で posts[0..2] を narrow するため分割代入ガードで取り出す
  const [post0, post1, post2] = posts;
  if (!post0 || !post1 || !post2) {
    seedPreconditionFailed(
      "ブログ記事が 3 件未満（seedBlog が 6 件作る）— エディターコメントの対象を決められない",
    );
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
      contentId: post0.id,
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
      contentId: post1.id,
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
      contentId: post2.id,
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
  }> = [
    {
      postId: "seed-ig-001",
      postUrl: "https://www.instagram.com/p/seed-ig-001/",
      mediaUrl: "/images/seed/space-meeting-a.svg",
      thumbnailUrl: null,
      caption: "本日の会議室A。午後のご予約受付中です。#レンタルスペース",
      mediaType: "IMAGE",
      permalink: "https://www.instagram.com/p/seed-ig-001/",
    },
    {
      postId: "seed-ig-002",
      postUrl: "https://www.instagram.com/p/seed-ig-002/",
      mediaUrl: "/images/seed/space-tour-intro.mp4",
      thumbnailUrl: "/images/seed/space-meeting-a.svg",
      caption: "スペース紹介ツアー動画を公開しました。",
      mediaType: "VIDEO",
      permalink: "https://www.instagram.com/p/seed-ig-002/",
    },
    {
      postId: "seed-ig-003",
      postUrl: "https://www.instagram.com/p/seed-ig-003/",
      mediaUrl: "/images/seed/space-seminar.svg",
      thumbnailUrl: null,
      caption: "セミナールーム 新レイアウト公開。",
      mediaType: "CAROUSEL_ALBUM",
      permalink: "https://www.instagram.com/p/seed-ig-003/",
    },
    {
      postId: "seed-ig-004",
      postUrl: "https://www.instagram.com/p/seed-ig-004/",
      mediaUrl: "/images/seed/space-coworking.svg",
      thumbnailUrl: null,
      caption: "コワーキングスペース、Wi-Fi 増強完了。",
      mediaType: "IMAGE",
      permalink: "https://www.instagram.com/p/seed-ig-004/",
    },
    {
      postId: "seed-ig-005",
      postUrl: "https://www.instagram.com/p/seed-ig-005/",
      mediaUrl: "/images/seed/event-workshop-hero.svg",
      thumbnailUrl: null,
      caption: "イベント告知：ヨガ＆マインドフルネス体験会",
      mediaType: "IMAGE",
      permalink: "https://www.instagram.com/p/seed-ig-005/",
    },
    {
      postId: "seed-ig-006",
      postUrl: "https://www.instagram.com/p/seed-ig-006/",
      mediaUrl: "/images/seed/blog-thumbnail-1.svg",
      thumbnailUrl: null,
      caption: "ブログ更新：レンタルスペースを活用したセミナー開催のコツ",
      mediaType: "IMAGE",
      permalink: "https://www.instagram.com/p/seed-ig-006/",
    },
  ];

  for (const p of posts) {
    // `sortOrder` は @@unique。宣言リテラルを書くと、管理画面で並び替えた DB の
    // re-seed が P2002 で中断する。宣言順のまま max+1 で採番する。
    const maxOrder = await prisma.instagramPost.aggregate({
      _max: { sortOrder: true },
    });
    await prisma.instagramPost.upsert({
      where: { postId: p.postId },
      update: {},
      create: { ...p, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    });
  }

  console.log(`✅ Upserted ${posts.length.toString()} instagram posts`);
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
    seedPreconditionFailed(
      "EDITOR ロールの User が無い（seedStaffUsers が先に走る）— ページ権限を割り当てられない",
    );
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

/**
 * DEV（既定）: 完全な開発環境を冪等に構築する。
 *
 * 固定 dev アカウント（admin@example.com=ADMIN / superadmin@example.com=SUPER_ADMIN
 * ほか editor・viewer）を最初に作成するため、admin 不在による blog/staff の skip
 * （chicken-and-egg）が起きない。各 seedX は upsert / skipDuplicates で冪等のため
 * 再実行しても安全。feature module は dev では全 ON に強制する
 * （seedSettings の resetFeatureModules）。
 *
 * `prisma db seed`（引数なし）の既定経路。
 * Prisma ORM v7 では `migrate reset` が seed を自動実行しないため、
 * `bun run db:reset` 側で reset 後に `prisma db seed` を明示実行する。
 */
async function seedDev() {
  // 固定 dev スタッフ（IAP ローカルテスト用）。createOrUpdate で冪等。
  // ADMIN ロールは seedBlog 等の author lookup（role:"ADMIN"）の前提でもある。
  await seedAdmin("admin@example.com", "管理者");
  await seedStaffUsers();

  console.log("");
  console.log("📦 Creating demo data...");
  console.log("");

  // Phase 1: 基本設定（dev は feature module を全 ON に強制）
  await seedSettings({ resetFeatureModules: true });
  await seedTransferAccounts();

  // Phase 2: マスターデータ
  await seedLocations();
  await seedSpaceCategories();

  // Phase 3: スペース（リレーション設定）
  await seedSpaces();
  // 時刻依存 E2E fixture が専有する非公開スペース（dev のみ）。
  // デモ予約より先に作るが、`DEMO_RESERVATION_SPACE_SLUGS` に含まれないので
  // デモ予約は載らない。
  await seedE2EFixtureSpaces();
  await seedSpaceRatePlans();

  // Phase 4: 顧客・問い合わせ・クーポン
  await seedCustomers();
  await seedInquiries();
  await seedCoupons();

  // Phase 5: 予約（クーポン適用例含む）
  await seedReservations();
  await seedDevCustomerAndReservations();

  // Phase 6: コンテンツ
  await seedNews();
  await seedPages();
  await seedFaq();
  await seedTermsDocuments();
  // **必ず seedTermsDocuments() の後**。規約が 1 件も無い状態で同意を作ろうとすると
  // 黙って 0 件になり、マイページが「利用規約の再同意」画面に固定される。
  await seedDevCustomerTermsAgreements();
  await seedBlogTags();
  await seedBlog();

  // Phase 7: サイト設定
  await seedNavigation();
  await seedAnnouncementBar();
  await seedSocialLinks();

  // Phase 8: イベント
  await seedEventCategories();
  await seedEvents();

  // Phase 9: 新機能（レビュー・通知・メディア・ブロック・ページ権限）
  await seedSpaceReviews();
  await seedPublicReviewE2EFixture();
  await seedAdminNotifications();
  await seedMedia();
  await seedBlockTemplates();
  await seedUserPageAssignments();

  // Phase 10: 監査ログ・エディタコメント・Instagram
  // （規約同意は Phase 6 の `seedTermsDocuments()` 直後。レートリミットは seed しない）
  await seedAuditLog();
  await seedEditorComments();
  await seedInstagramPosts();
}

// =============================================================================
// Production Seed（本番用テンプレート）
// デモ・テスト用の運用データ（顧客・予約・問い合わせ等）を含まない。
// 管理画面から本番データに上書きすることを前提としたテンプレート構成。
// =============================================================================

async function seedProduction(email: string | undefined, name: string) {
  if (email) {
    await seedAdmin(email, name, Role.SUPER_ADMIN);
  } else {
    console.log(
      "⏭️ Skipped production admin seed. Pass `--production <email> <name>` when an initial staff account is required.",
    );
  }

  console.log("");
  console.log("📦 Creating production template data...");
  console.log("");

  // Phase 1: 基本設定（法人情報は架空データを公開しないため空欄のまま）
  await seedSettings({ includeBusinessPlaceholders: false });

  // Phase 2: マスターデータ（下書きとして作成 — 管理画面で実際の情報に更新後に公開する）
  await seedLocations(false);
  await seedSpaceCategories(false);

  // Phase 3: スペース（下書きとして作成 — 管理画面で内容更新後に公開する）
  await seedSpaces(false);

  // Phase 4: コンテンツ（下書きとして作成 — 管理画面で内容更新後に公開する）
  // News は「〇〇新聞に紹介されました」「利用者数1000名突破」等、捏造した具体的
  // 事実を含むため投入しない（下記 Phase 5 の理由と同様）。
  await seedPages();
  await seedFaq(false);
  // 規約は同意ゲートが公開済みのものしか見ないため、公開状態で投入する。
  // 文面の改訂は管理画面から行う（re-seed は既存を触らない）。
  await seedTermsDocuments();
  // 「未分類」だけ。`Event.categoryId` は必須なので、1 件も無いとイベントを作れない。
  await seedEventCategories(false);

  // Phase 5: サイト設定
  await seedNavigation(false); // 本番: 既存の編集を踏み潰さない
  // お知らせ帯・SNSリンクは実在の URL・公開時点の運用告知が前提のデータのため、
  // 架空データを本番に投入しない（管理画面 /admin/settings/appearance から
  // 実際の値で作成する）。
  await seedBlockTemplates();

  console.log("");
  console.log(
    "📝 テンプレートデータが作成されました。管理画面で本番データに更新してください:",
  );
  console.log(
    "   /admin/settings  — 会社名・住所・連絡先・メール設定（未設定です。必ず入力してください）",
  );
  console.log("   /admin/locations — 実際の拠点情報");
  console.log("   /admin/spaces    — 実際のスペース・料金");
  console.log("   /admin/pages     — 公開ページのコンテンツ");
  console.log("   /admin/faq       — FAQコンテンツ");
  console.log("");
  console.log(
    "📌 以下は初期データを投入していません。必要な場合のみ管理画面から作成してください:",
  );
  console.log("   /admin/news                — お知らせ");
  console.log("   /admin/settings/appearance — SNSリンク・お知らせ帯");
}

async function main() {
  const args = process.argv.slice(2);
  const safety = evaluateSeedSafety({
    argv: args,
    env: {
      databaseUrl: process.env["DATABASE_URL"],
      nodeEnv: process.env["NODE_ENV"],
      appSurface: process.env["APP_SURFACE"],
      e2eRuntime: process.env["E2E_RUNTIME"],
      ci: process.env["CI"],
    },
  });
  if (!safety.ok) {
    console.error(`❌ ${safety.error}`);
    process.exit(1);
  }

  console.log("");
  console.log("🌱 Starting seed...");
  console.log("");

  switch (safety.mode) {
    case "dev":
      // DEV（既定）: prisma db seed / bun run db:reset の seed 経路。
      await seedDev();
      break;
    // DEV: 全削除してから再構築（破壊的・開発専用）。
    case "production": {
      const email = args[1];
      const name = args[2];
      await seedProduction(email, name ?? "Administrator");
      break;
    }
    default: {
      const _exhaustive: never = safety.mode;
      throw new Error(`Unhandled seed mode: ${String(_exhaustive)}`);
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
