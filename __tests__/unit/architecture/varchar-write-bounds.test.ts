/**
 * `@db.VarChar(n)` 列に、n を超える値が到達しないことの gate。
 *
 * ## 何が起きるか
 *
 * PostgreSQL の `varchar(n)` は溢れた値を黙って切らず `22001` を投げる。Prisma は
 * これを `DomainError` ではない生の例外にするので、`executeAdminMutationResult` の
 * 変換にも乗らず 500 になる。実際に 3 件見つかっている:
 *
 * - `Receipt.subject` VarChar(100) にイベント名（VarChar(200)）から生成した文字列を
 *   書いていた。94 文字以上のイベントに有料申込が入ると領収書発行が落ち、backstop の
 *   cron も同じ経路を叩くので**入金済みなのに領収書が永久に発行されない**
 * - `Receipt.recipientName` VarChar(100) に「姓(50) + 空白 + 名(50)」= 最大 101 文字
 * - `InquiryAttachment.filename` VarChar(255) に client 供給のファイル名を無検査で投入
 *
 * 前 2 者は列を `@db.Text` にして解消済み。3 件目はこの gate と同じ PR で塞いだ。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**:
 *   1. `@db.VarChar(n)` 列が 1 本残らず分類されている（新設列は分類するまで赤）
 *   2. `validated` と宣言した列は、名指しした Zod schema が実際に上限 +1 文字を拒否し、
 *      かつ上限ちょうどを受け入れる（= 拒否理由が長さであることまで確かめる）
 *   3. `enumerated` と宣言した列は、値リスト SSoT の最長要素が列に収まる
 *   4. FK 列は参照先の主キー列より狭くない（機械導出。宣言不要）
 *   5. ID 列は `@default(cuid()/cuid(2)/uuid()/uuid(7))` の既知長に収まる（機械導出）
 *   6. 上限を定数で持つ列は、その定数の実値が申告値と一致する
 *
 * **証明しない**: 「名指しした schema がその列の**唯一の**書込経路である」こと。
 * `generated` と宣言した列に至っては、申告した上限の根拠は散文の `why` だけで、
 * テストが確かめているのは「申告値 ≤ 列長」に過ぎない（`source` を書いた列だけは
 * 定数との一致まで見る）。
 *
 * 派生値（テンプレートリテラル連結）を VarChar 列へ書く形は
 * `derived-value-varchar-writes.test.ts` が見る。**長らくここには「別 gate で
 * 扱う」とだけ書いてあり、その gate は存在しなかった** — 散文で批判をかわして
 * 実装が無い状態で、その間に `events.title` / `events.slug` が実際に溢れていた。
 *
 * ## なぜ `getZodConstraint` を使わないか
 *
 * 最初はそれで書こうとしたが**不健全**だった。`spaceReviewSchema.title` は
 * `.max(100).optional().or(z.literal(""))` で確かに 100 文字を超えると拒否するのに、
 * union に包まれるため `getZodConstraint` は `maxLength` を返さない。同じ理由で
 * `customerFormSchema` の住所 5 欄も「上限なし」に見える（実際は全て `.max()` 済み）。
 * 制約の**申告**ではなく実際の**挙動**を見る必要がある。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import type { ZodType } from "zod";

// ---------------------------------------------------------------------------
// schema.prisma のパース
// ---------------------------------------------------------------------------

interface Field {
  readonly model: string;
  readonly name: string;
  readonly varChar: number | null;
  readonly defaultFn: string | null;
  /** `@relation(fields: [x], references: [y])` の (fields, references, target model) */
  readonly relation: {
    readonly fields: readonly string[];
    readonly references: readonly string[];
    readonly target: string;
  } | null;
  readonly isId: boolean;
}

function parseSchema(): Field[] {
  const src = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8",
  );
  const out: Field[] = [];
  let model: string | null = null;

  // CRLF で checkout されると `.` が `\r` を消費できず、行末に `\r` を持つ行が
  // まるごとパースから漏れる（= 列が黙って gate の対象外になる）。Windows 開発機で
  // 実際に踏んだので、行末は最初に正規化する。
  for (const raw of src.split(/\r?\n/u)) {
    const line = raw.replace(/\/\/.*$/u, "");
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
    if (open?.[1]) {
      model = open[1];
      continue;
    }
    if (/^\s*\}/u.test(line)) {
      model = null;
      continue;
    }
    if (!model) continue;

    const decl = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/u.exec(line);
    if (!decl?.[1] || !decl[2]) continue;
    const attrs = decl[5] ?? "";
    const type = decl[2];

    const vc = /@db\.VarChar\((\d+)\)/u.exec(attrs);
    const def = /@default\(([^)]*\)?)\)/u.exec(attrs);
    const rel =
      /@relation\([^)]*fields:\s*\[([^\]]*)\][^)]*references:\s*\[([^\]]*)\]/u.exec(
        attrs,
      );

    out.push({
      model,
      name: decl[1],
      varChar: vc?.[1] ? Number(vc[1]) : null,
      defaultFn: def?.[1] ?? null,
      relation: rel?.[1]
        ? {
            fields: rel[1].split(",").map((s) => s.trim()),
            references: (rel[2] ?? "").split(",").map((s) => s.trim()),
            target: type,
          }
        : null,
      isId: /@id\b/u.test(attrs),
    });
  }
  return out;
}

const ALL_FIELDS = parseSchema();
const VARCHAR_FIELDS = ALL_FIELDS.filter((f) => f.varChar !== null);

function key(model: string, field: string): string {
  return `${model}.${field}`;
}

const VARCHAR_LENGTH = new Map<string, number>(
  VARCHAR_FIELDS.map((f) => [key(f.model, f.name), f.varChar ?? 0]),
);

// ---------------------------------------------------------------------------
// 機械導出できる分類（宣言不要）
// ---------------------------------------------------------------------------

/**
 * `@default(...)` の生成子が作る値の長さ（上限）。
 *
 * cuid v1 = 25 / cuid2 は Prisma 既定 24 / UUID は v4・v7 とも 36（ハイフン込み）。
 */
const GENERATOR_LENGTH: ReadonlyMap<string, number> = new Map([
  ["cuid()", 25],
  ["cuid(2)", 24],
  ["uuid()", 36],
  ["uuid(7)", 36],
  ["uuid(4)", 36],
]);

/** `Model.field` → 参照先の `Model.field`（FK 列のみ）。 */
const FK_TARGET = new Map<string, string>();
for (const f of ALL_FIELDS) {
  if (!f.relation) continue;
  f.relation.fields.forEach((local, i) => {
    const remote = f.relation?.references[i];
    if (remote)
      FK_TARGET.set(key(f.model, local), key(f.relation.target, remote));
  });
}

// ---------------------------------------------------------------------------
// 手で分類する列
// ---------------------------------------------------------------------------

interface Probe {
  /** 動的 import するモジュール指定子 */
  readonly module: string;
  /** そのモジュールの export 名（`ZodType` であること） */
  readonly exportName: string;
  /** object schema 上の（トップレベル）フィールド名 */
  readonly field: string;
  /**
   * schema が実際に受け入れる最大長。既定は列長そのもの。
   *
   * 列より**狭い**上限を持つ欄で指定する（メールは RFC 5321 の 254 で列長と同値 /
   * カラーコードは `#rrggbb` の 7 文字）。ここに書いた値は
   * 「その長さは通り、+1 文字は通らない」ことまでテストが実測するので、
   * 申告しただけでは通らない。
   */
  readonly maxLength?: number;
  /**
   * 長さ `len` の**形式として妥当な**サンプル値。既定は `"a".repeat(len)`。
   * 形式検証（regex / email）がある欄では、これを与えないと「長さ以外の理由で
   * 落ちた」のを「上限あり」と誤読してしまう。
   */
  readonly sample?: (len: number) => string;
}

type Contract =
  | { readonly kind: "validated"; readonly probes: readonly Probe[] }
  /** 値の集合が有限（`z.enum` の元になる定数リスト）。最長の要素で判定する。 */
  | {
      readonly kind: "enumerated";
      readonly module: string;
      readonly exportName: string;
    }
  | {
      readonly kind: "generated";
      readonly maxLength: number;
      readonly why: string;
      /**
       * 上限を握っている定数の在処。書くと `maxLength` と実際の値の一致まで
       * テストが確かめるので、定数と列長が片方だけ動くと落ちる。
       */
      readonly source?: {
        readonly module: string;
        readonly exportName: string;
      };
    };

function validated(...probes: Probe[]): Contract {
  return { kind: "validated", probes };
}

function enumerated(module: string, exportName: string): Contract {
  return { kind: "enumerated", module, exportName };
}

function generated(
  maxLength: number,
  why: string,
  source?: { module: string; exportName: string },
): Contract {
  return source
    ? { kind: "generated", maxLength, why, source }
    : { kind: "generated", maxLength, why };
}

const SHARED = "@/shared/lib/validations";
const ADMIN = "@/admin/lib/validations";
const SETTINGS =
  "@/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas";

/** 数字のみ（郵便番号など）のサンプル。 */
const digits = (len: number): string => "1".repeat(len);

/** 形式として妥当な、長さ `len` のメールアドレス。 */
const emailOfLength = (len: number): string =>
  `${"a".repeat(Math.max(len - 12, 1))}@example.com`;

const CONTRACTS: Readonly<Record<string, Contract>> = {
  // --- Location ---------------------------------------------------------
  "Location.slug": validated({
    module: `${SHARED}/location`,
    exportName: "locationFormSchema",
    field: "slug",
  }),
  "Location.priceRange": validated({
    module: `${SHARED}/location`,
    exportName: "locationFormSchema",
    field: "priceRange",
  }),

  // --- SpaceRatePlan ----------------------------------------------------
  "SpaceRatePlan.name": validated({
    module: `${ADMIN}/space-rate-plan`,
    exportName: "spaceRatePlanFormSchema",
    field: "name",
  }),
  "SpaceRatePlan.startTime": validated({
    module: `${ADMIN}/space-rate-plan`,
    exportName: "spaceRatePlanFormSchema",
    field: "startTime",
    sample: (len) => "09:30".slice(0, len).padEnd(len, "0"),
  }),
  "SpaceRatePlan.endTime": validated({
    module: `${ADMIN}/space-rate-plan`,
    exportName: "spaceRatePlanFormSchema",
    field: "endTime",
    sample: (len) => "18:30".slice(0, len).padEnd(len, "0"),
  }),

  // --- BlockedDate ------------------------------------------------------
  "BlockedDate.reason": validated({
    module: `${SHARED}/blocked-date`,
    exportName: "blockedDateFormSchema",
    field: "reason",
  }),

  // --- Reservation / ReservationSeries ----------------------------------
  "ReservationSeries.rrule": generated(
    255,
    "RRULE は UI の選択肢から `buildRRule` が組み立てる。手入力経路が無い",
  ),
  "ReservationSeries.cancelledByType": generated(
    20,
    "`CancelledByType` の TS union（最長 CUSTOMER = 8 文字）からのみ書かれる",
  ),
  "ReservationSeries.googleCalendarMasterEventId": generated(
    1024,
    "Google Calendar API が返す eventId。RFC 上 1024 を超えない",
  ),
  "Reservation.cancelledByType": generated(
    20,
    "`CancelledByType` の TS union（最長 CUSTOMER = 8 文字）からのみ書かれる",
  ),

  // --- Customer ---------------------------------------------------------
  "Customer.postalCode": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "postalCode",
    // regex `^\d{3}-?\d{4}$`: 7 桁 or ハイフン込み 8 桁のみ通る。
    // 列は他の郵便番号列と揃えて 10 だが、この欄が受けるのは 8 まで。
    maxLength: 8,
    sample: (len) => (len === 8 ? "123-4567" : digits(len)),
  }),
  "Customer.prefecture": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "prefecture",
    // 列は locationFormSchema の 20 に揃えたが、この欄は 10 で止まる
    maxLength: 10,
  }),
  "Customer.city": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "city",
  }),
  "Customer.streetAddress": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "streetAddress",
  }),
  "Customer.building": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "building",
  }),
  "Customer.emailDeliveryReason": generated(
    255,
    "Resend の bounce/complaint webhook 由来の理由文字列を切り詰めて保存する",
  ),
  "Customer.anonymizedReason": generated(
    50,
    "匿名化コマンドが定数から選ぶ（利用者入力ではない）",
  ),
  "Customer.suppressedEmailHash": generated(64, "SHA-256 hex = 64 文字固定"),

  // --- Pending*（トークン系） -------------------------------------------
  // 唯一の書込経路はマイページの初回 email 登録
  // （`mypage/_shared/actions/profile.ts` → `requestCustomerEmailChangeCommand`）で、
  // 通るのは `emailFieldSchema` ではなく `customerProfileSchema.email`。
  // **この欄には `.max()` が無かった** ので「helper を通った値のみ」という
  // generated の申告は成立していなかった。実際に上限で止まることを probe で見る。
  "PendingCustomerEmailChange.newEmail": validated({
    module: `${SHARED}/customer-profile`,
    exportName: "customerProfileSchema",
    field: "email",
    maxLength: 254,
    sample: emailOfLength,
  }),
  "PendingCustomerEmailChange.newEmailCanonical": generated(
    254,
    "上の値を正規化（小文字化）したもの。長さは増えない",
  ),
  "PendingCustomerEmailChange.tokenHash": generated(
    64,
    "SHA-256 hex = 64 文字固定",
  ),
  "PendingCustomerMerge.guestEmail": generated(
    254,
    "`emailFieldSchema`（RFC 5321 の 254 上限）を通った値のみ",
  ),
  "PendingCustomerMerge.tokenHash": generated(64, "SHA-256 hex = 64 文字固定"),

  // --- Inquiry ----------------------------------------------------------
  "Inquiry.receiptNumber": generated(
    20,
    "`INQ-YYYYMMDD-XXXX` 形式でサーバーが採番する",
  ),
  "Inquiry.anonymizedReason": generated(
    50,
    "匿名化コマンドが定数から選ぶ（利用者入力ではない）",
  ),
  "InquiryStatusHistory.reason": generated(
    200,
    "管理画面のステータス変更理由。`inquiryStatusUpdateSchema` の .max(200) を通る",
  ),
  "InquiryAttachment.mimeType": generated(
    100,
    "magic-byte 判定の許可 MIME 定数からのみ書かれる（client の file.type は不使用）",
  ),
  "InquiryAttachment.filename": generated(
    255,
    "client 供給の値だが `truncateFilename` で列長に詰めてから保存する",
    {
      module: "@/shared/lib/r2/filename",
      exportName: "INQUIRY_ATTACHMENT_FILENAME_MAX_LENGTH",
    },
  ),
  "InquiryTag.name": validated({
    module: `${SHARED}/inquiry-tag`,
    exportName: "inquiryTagFormSchema",
    field: "name",
  }),
  "InquiryTag.color": validated({
    module: `${SHARED}/inquiry-tag`,
    exportName: "inquiryTagFormSchema",
    field: "color",
    // regex `^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$` — 最長は `#rrggbb` の 7 文字
    maxLength: 7,
    sample: (len) => `#${"a".repeat(Math.max(len - 1, 0))}`,
  }),

  // --- CMS --------------------------------------------------------------
  "Page.template": generated(
    64,
    "`PAGE_TEMPLATES` のキー（TS union）からのみ書かれる",
  ),
  "Section.type": generated(
    64,
    "`SECTION_REGISTRY` のキー（TS union）からのみ書かれる",
  ),

  // --- 監査・規約 --------------------------------------------------------
  "AuditLog.hashAlgorithm": generated(32, "定数 `sha256` のみ"),
  "AuditLog.hashKeyId": generated(32, "鍵ローテーション用の ID 定数のみ"),
  "TermsDocument.type": validated({
    module: `${SHARED}/terms`,
    exportName: "termsFormSchema",
    field: "type",
  }),
  "TermsDocument.slug": validated({
    module: `${SHARED}/terms`,
    exportName: "termsFormSchema",
    field: "slug",
  }),
  "TermsDocument.title": validated({
    module: `${SHARED}/terms`,
    exportName: "termsFormSchema",
    field: "title",
  }),
  "TermsAgreement.guestEmail": generated(
    254,
    "`emailFieldSchema`（RFC 5321 の 254 上限）を通った値のみ",
  ),
  "TermsAgreement.contentHash": generated(64, "SHA-256 hex = 64 文字固定"),
  "TermsAgreement.ipAddress": generated(
    45,
    "IPv6 の最大表記（45 文字）に合わせた列",
  ),

  // --- レビュー ----------------------------------------------------------
  "SpaceReview.title": validated({
    module: `${SHARED}/review`,
    exportName: "spaceReviewSchema",
    field: "title",
  }),
  "SpaceReview.comment": validated({
    module: `${SHARED}/review`,
    exportName: "spaceReviewSchema",
    field: "comment",
  }),
  "SpaceReview.replyBody": validated({
    module: `${SHARED}/review`,
    exportName: "reviewReplySchema",
    field: "replyBody",
  }),

  // --- イベント ----------------------------------------------------------
  "Event.title": generated(
    200,
    "`eventFormSchema` の .max() を通る。複製は appendWithinLimit で詰めてから連結する",
    {
      module: `${SHARED}/event-limits`,
      exportName: "EVENT_TITLE_MAX_LENGTH",
    },
  ),
  "Event.slug": generated(
    100,
    "`eventFormSchema` の .max() を通る。ensureUniqueSlug が連番ぶんを空けてから採番する",
    {
      module: `${SHARED}/event-limits`,
      exportName: "EVENT_SLUG_MAX_LENGTH",
    },
  ),
  "Event.addressDetail": generated(
    200,
    "`eventFormSchema` の .max(200) を通る",
  ),
  "Event.meetingUrl": generated(500, "`eventFormSchema` の .max(500) を通る"),
  "EventTicket.name": generated(
    100,
    "`eventFormSchema` のチケット名 .max(100)",
  ),
  "EventRegistration.name": validated({
    module: `${SHARED}/event-registration`,
    exportName: "publicEventRegistrationSchema",
    field: "name",
  }),
  // 4 つの入口がある。公開申込・受付の当日参加 / 代行登録・管理画面の編集。
  // 公開申込を除く 3 つが `.max(255)` で**列（254）より 1 文字広かった**。
  // 255 文字ちょうどのアドレスが Zod を通り、INSERT で 22001 → 500 になっていた。
  //
  // 編集の schema は `"use server"` ファイルの中にあり **export できない位置**
  // だったので、ここから probe できず 1 本だけ取り残された。probe に載せられない
  // 位置に検証を置かない、という制約でもある（`@/admin/lib/validations` へ移した）。
  "EventRegistration.email": validated(
    {
      module: `${SHARED}/event-registration`,
      exportName: "publicEventRegistrationSchema",
      field: "email",
      maxLength: 254,
      sample: emailOfLength,
    },
    {
      module: `${SHARED}/event-registration-onsite`,
      exportName: "walkInRegistrationSchema",
      field: "email",
      maxLength: 254,
      sample: emailOfLength,
    },
    {
      module: `${SHARED}/event-registration-onsite`,
      exportName: "adminProxyRegistrationSchema",
      field: "email",
      maxLength: 254,
      sample: emailOfLength,
    },
    {
      module: `${ADMIN}/event-registration-update`,
      exportName: "updateRegistrationSchema",
      field: "email",
      maxLength: 254,
      sample: emailOfLength,
    },
  ),
  "EventRegistration.phone": validated({
    module: `${SHARED}/event-registration`,
    exportName: "publicEventRegistrationSchema",
    field: "phone",
    // 列は locationFormSchema の 30 に揃えたが、この欄は 20 で止まる
    maxLength: 20,
    sample: digits,
  }),
  "EventRegistration.cancelledByType": generated(
    20,
    "`CancelledByType` の TS union（最長 CUSTOMER = 8 文字）からのみ書かれる",
  ),

  // --- 決済・会計 --------------------------------------------------------
  "Refund.status": generated(
    20,
    "Stripe の refund status 文字列（最長 requires_action = 16）",
  ),
  "Receipt.serialNo": generated(
    20,
    "`R-YYYYMMDD-NNNN` 形式でサーバーが採番する",
  ),
  "StripeEvent.id": generated(80, "Stripe の event id（`evt_` + 24〜）"),
  "StripeEvent.type": generated(80, "Stripe の event type 文字列"),

  // --- 管理通知 ----------------------------------------------------------
  "AdminNotification.type": generated(
    50,
    "`AdminNotificationType` の TS union",
  ),
  "AdminNotification.title": generated(
    200,
    "通知生成側の定型文（`buildAdminNotification`）のみ",
  ),
  "AdminNotification.message": generated(
    500,
    "通知生成側の定型文（`buildAdminNotification`）のみ",
  ),
  "AdminNotification.resourceType": generated(
    50,
    "`AdminResource` の TS union",
  ),
  "AdminNotification.resourceId": generated(
    36,
    "UUID(36)。多相参照だが ID 以外は入らない（統一前の行には cuid が残る）",
  ),

  // --- 振込先 ------------------------------------------------------------
  "TransferAccount.label": validated({
    module: `${SHARED}/transfer-account`,
    exportName: "transferAccountFormSchema",
    field: "label",
  }),
  "TransferAccount.bankName": validated({
    module: `${SHARED}/transfer-account`,
    exportName: "transferAccountFormSchema",
    field: "bankName",
  }),
  "TransferAccount.branchName": validated({
    module: `${SHARED}/transfer-account`,
    exportName: "transferAccountFormSchema",
    field: "branchName",
  }),
  "TransferAccount.accountNumber": validated({
    module: `${SHARED}/transfer-account`,
    exportName: "transferAccountFormSchema",
    field: "accountNumber",
    sample: digits,
  }),
  "TransferAccount.accountHolderName": validated({
    module: `${SHARED}/transfer-account`,
    exportName: "transferAccountFormSchema",
    field: "accountHolderName",
  }),
  "TransferAccount.note": validated({
    module: `${SHARED}/transfer-account`,
    exportName: "transferAccountFormSchema",
    field: "note",
  }),
  // --- 連絡先・住所（値域を 1 つに揃えた列） -----------------------------
  //
  // 列長はドメインごとに「アプリが受理する最長」で揃えてある。個々の欄がそれより
  // 狭い場合は maxLength で実測値を明示する（列に余白があること自体は問題ではない
  // — 危ないのは列の方が狭いとき）。
  "User.email": generated(
    254,
    "Better Auth / Google IAP が渡す。RFC 5321 の 254 を超えない",
  ),
  "Location.postalCode": validated({
    module: `${SHARED}/location`,
    exportName: "locationFormSchema",
    field: "postalCode",
    sample: digits,
  }),
  "Location.prefecture": validated({
    module: `${SHARED}/location`,
    exportName: "locationFormSchema",
    field: "prefecture",
  }),
  "Location.city": validated({
    module: `${SHARED}/location`,
    exportName: "locationFormSchema",
    field: "city",
  }),
  "Location.streetAddress": validated({
    module: `${SHARED}/location`,
    exportName: "locationFormSchema",
    field: "streetAddress",
  }),
  "Location.buildingName": validated({
    module: `${SHARED}/location`,
    exportName: "locationFormSchema",
    field: "buildingName",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 100,
  }),
  "Location.phoneNumber": validated({
    module: `${SHARED}/location`,
    exportName: "locationFormSchema",
    field: "phoneNumber",
    sample: digits,
  }),
  "Location.email": validated({
    module: `${SHARED}/location`,
    exportName: "locationFormSchema",
    field: "email",
    sample: emailOfLength,
  }),
  "Reservation.guestLastName": validated({
    module: `${SHARED}/public-reservation`,
    exportName: "publicReservationSchema",
    field: "lastName",
  }),
  "Reservation.guestFirstName": validated({
    module: `${SHARED}/public-reservation`,
    exportName: "publicReservationSchema",
    field: "firstName",
  }),
  "Reservation.guestEmail": validated({
    module: `${SHARED}/public-reservation`,
    exportName: "publicReservationSchema",
    field: "email",
    sample: emailOfLength,
  }),
  "Reservation.guestPhone": validated({
    module: `${SHARED}/public-reservation`,
    exportName: "publicReservationSchema",
    field: "phoneNumber",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 20,
    sample: digits,
  }),
  "Reservation.guestCompanyName": validated({
    module: `${SHARED}/public-reservation`,
    exportName: "publicReservationSchema",
    field: "companyName",
  }),
  "Customer.lastName": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "lastName",
  }),
  "Customer.firstName": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "firstName",
  }),
  "Customer.lastNameKana": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "lastNameKana",
  }),
  "Customer.firstNameKana": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "firstNameKana",
  }),
  "Customer.companyName": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "companyName",
  }),
  "Customer.email": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "email",
    sample: emailOfLength,
  }),
  "Customer.emailCanonical": generated(
    254,
    "Customer.email を正規化（小文字化）したもの。長さは増えない",
  ),
  "Customer.phoneNumber": validated({
    module: `${SHARED}/customer`,
    exportName: "customerFormSchema",
    field: "phoneNumber",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 20,
    sample: digits,
  }),
  "Inquiry.name": generated(
    101,
    "姓(50) + 半角空白 + 名(50)。空白ぶんを足さないと上限いっぱいの氏名で 22001 になる",
    {
      module: `${SHARED}/customer-shared-fields`,
      exportName: "FULL_NAME_MAX_LENGTH",
    },
  ),
  "Inquiry.companyName": validated({
    module: `${SHARED}/inquiry`,
    exportName: "publicInquirySchema",
    field: "companyName",
  }),
  "Inquiry.email": validated({
    module: `${SHARED}/inquiry`,
    exportName: "publicInquirySchema",
    field: "email",
    sample: emailOfLength,
  }),
  "Inquiry.phoneNumber": validated({
    module: `${SHARED}/inquiry`,
    exportName: "publicInquirySchema",
    field: "phoneNumber",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 20,
    sample: digits,
  }),
  "Inquiry.subject": validated({
    module: `${SHARED}/inquiry`,
    exportName: "publicInquirySchema",
    field: "subject",
  }),
  "SettingsOrganization.phoneNumber": validated({
    module: `${SETTINGS}/form-schemas-brand-contact`,
    exportName: "contactInfoFormSchema",
    field: "phoneNumber",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 20,
    sample: digits,
  }),
  "SettingsOrganization.faxNumber": validated({
    module: `${SETTINGS}/form-schemas-brand-contact`,
    exportName: "contactInfoFormSchema",
    field: "faxNumber",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 20,
    sample: digits,
  }),
  "SettingsOrganization.email": validated({
    module: `${SETTINGS}/form-schemas-brand-contact`,
    exportName: "contactInfoFormSchema",
    field: "email",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 100,
    sample: emailOfLength,
  }),
  "SettingsOrganization.postalCode": validated({
    module: `${SETTINGS}/form-schemas-brand-contact`,
    exportName: "contactInfoFormSchema",
    field: "postalCode",
    sample: digits,
  }),
  "SettingsOrganization.prefecture": validated({
    module: `${SETTINGS}/form-schemas-brand-contact`,
    exportName: "contactInfoFormSchema",
    field: "prefecture",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 10,
  }),
  "SettingsOrganization.city": validated({
    module: `${SETTINGS}/form-schemas-brand-contact`,
    exportName: "contactInfoFormSchema",
    field: "city",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 50,
  }),
  "SettingsOrganization.streetAddress": validated({
    module: `${SETTINGS}/form-schemas-brand-contact`,
    exportName: "contactInfoFormSchema",
    field: "streetAddress",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 100,
  }),
  "SettingsOrganization.buildingName": validated({
    module: `${SETTINGS}/form-schemas-brand-contact`,
    exportName: "contactInfoFormSchema",
    field: "buildingName",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 100,
  }),
  "SettingsOrganization.senderEmail": validated({
    module: `${SETTINGS}/form-schemas-email-notification`,
    exportName: "emailFormSchema",
    field: "senderEmail",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 100,
    sample: emailOfLength,
  }),
  "SettingsOrganization.replyToEmail": validated({
    module: `${SETTINGS}/form-schemas-email-notification`,
    exportName: "emailFormSchema",
    field: "replyToEmail",
    // 列はドメインで揃えた幅。この欄が実際に受けるのはここまで
    maxLength: 100,
    sample: emailOfLength,
  }),
};

// ---------------------------------------------------------------------------
// 判定ヘルパー
// ---------------------------------------------------------------------------

/** 主キー・FK・ID 既定値から機械的に説明できる列か。 */
function isMechanicallyDerived(f: Field): boolean {
  const k = key(f.model, f.name);
  if (FK_TARGET.has(k)) return true;
  if (f.isId && f.defaultFn && GENERATOR_LENGTH.has(f.defaultFn)) return true;
  return false;
}

/** `schema.safeParse({ field: value })` が `field` に issue を出すか。 */
function hasIssueAt(schema: ZodType, field: string, value: string): boolean {
  const result = schema.safeParse({ [field]: value });
  if (result.success) return false;
  return result.error.issues.some((issue) => issue.path[0] === field);
}

async function loadExport(
  module: string,
  exportName: string,
): Promise<unknown> {
  const mod: Record<string, unknown> = await import(module);
  const value = mod[exportName];
  if (value === undefined) {
    throw new Error(`${module} に ${exportName} が無い（改名された可能性）`);
  }
  return value;
}

async function loadSchema(probe: Probe): Promise<ZodType> {
  return (await loadExport(probe.module, probe.exportName)) as ZodType;
}

/** enum の SSoT（配列 or 値が文字列の object）から取りうる値を取り出す。 */
function enumValues(source: unknown): string[] {
  const raw = Array.isArray(source)
    ? source
    : typeof source === "object" && source !== null
      ? Object.values(source)
      : [];
  return raw.filter((v): v is string => typeof v === "string");
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("VarChar 列の書込上限", () => {
  test("gate が空振りしていない", () => {
    // schema のパースが壊れると全テストが「対象 0 件」で緑になる
    expect(VARCHAR_FIELDS.length).toBeGreaterThan(50);
    expect(FK_TARGET.size).toBeGreaterThan(20);
  });

  test("すべての VarChar 列が分類されている", () => {
    const unclassified = VARCHAR_FIELDS.filter(
      (f) =>
        !isMechanicallyDerived(f) &&
        CONTRACTS[key(f.model, f.name)] === undefined,
    ).map((f) => `${key(f.model, f.name)} VarChar(${f.varChar ?? 0})`);

    expect(unclassified).toEqual([]);
  });

  test("CONTRACTS に実在しない列が残っていない", () => {
    const stale = Object.keys(CONTRACTS).filter((k) => !VARCHAR_LENGTH.has(k));
    expect(stale).toEqual([]);
  });

  test("FK 列は参照先の主キーより狭くない", () => {
    const narrower: string[] = [];
    for (const [local, remote] of FK_TARGET) {
      const localLen = VARCHAR_LENGTH.get(local);
      const remoteLen = VARCHAR_LENGTH.get(remote);
      if (localLen === undefined || remoteLen === undefined) continue;
      if (localLen < remoteLen) {
        narrower.push(`${local}(${localLen}) < ${remote}(${remoteLen})`);
      }
    }
    expect(narrower).toEqual([]);
  });

  test("ID 列は既定値ジェネレータの生成長に収まる", () => {
    const tooNarrow: string[] = [];
    for (const f of VARCHAR_FIELDS) {
      if (!f.isId || !f.defaultFn) continue;
      const generatedLength = GENERATOR_LENGTH.get(f.defaultFn);
      if (generatedLength === undefined) continue;
      if ((f.varChar ?? 0) < generatedLength) {
        tooNarrow.push(
          `${key(f.model, f.name)} VarChar(${f.varChar ?? 0}) < ${f.defaultFn}=${generatedLength}`,
        );
      }
    }
    expect(tooNarrow).toEqual([]);
  });

  test("generated と宣言した列は申告値が列長に収まる", () => {
    const over: string[] = [];
    for (const [k, contract] of Object.entries(CONTRACTS)) {
      if (contract.kind !== "generated") continue;
      const columnLength = VARCHAR_LENGTH.get(k);
      if (columnLength === undefined) continue;
      if (contract.maxLength > columnLength) {
        over.push(`${k}: 申告 ${contract.maxLength} > 列 ${columnLength}`);
      }
    }
    expect(over).toEqual([]);
  });

  test("上限を定数で持つ列は、その定数と申告値が一致する", async () => {
    const mismatched: string[] = [];
    for (const [k, contract] of Object.entries(CONTRACTS)) {
      if (contract.kind !== "generated" || !contract.source) continue;
      const actual = await loadExport(
        contract.source.module,
        contract.source.exportName,
      );
      if (actual !== contract.maxLength) {
        mismatched.push(
          `${k}: ${contract.source.exportName}=${String(actual)} だが申告は ${contract.maxLength}`,
        );
      }
    }
    expect(mismatched).toEqual([]);
  });

  test("validated と宣言した列は schema が列長超えを拒否する", async () => {
    const failures: string[] = [];

    for (const [k, contract] of Object.entries(CONTRACTS)) {
      if (contract.kind !== "validated") continue;
      const n = VARCHAR_LENGTH.get(k);
      if (n === undefined) continue;

      for (const probe of contract.probes) {
        const schema = await loadSchema(probe);
        const sample = probe.sample ?? ((len: number) => "a".repeat(len));
        const bound = probe.maxLength ?? n;
        const where = `${probe.exportName}.${probe.field}`;

        // 0) 申告した上限が列に収まること
        if (bound > n) {
          failures.push(`${k}: 申告上限 ${bound} > 列 ${n}`);
          continue;
        }
        // 1) 上限ちょうどは通ること。ここが落ちるなら sample が形式として
        //    妥当でない = 2) の拒否が長さ由来だと言えない。
        if (hasIssueAt(schema, probe.field, sample(bound))) {
          failures.push(
            `${k}: ${where} が ${bound} 文字のサンプルを拒否した（sample か maxLength が不適切）`,
          );
          continue;
        }
        // 2) 1 文字超は拒否されること
        if (!hasIssueAt(schema, probe.field, sample(bound + 1))) {
          failures.push(
            `${k}: ${where} が ${bound + 1} 文字を通した（VarChar(${n}) を超えうる）`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("enumerated と宣言した列は最長の値が列に収まる", async () => {
    const failures: string[] = [];

    for (const [k, contract] of Object.entries(CONTRACTS)) {
      if (contract.kind !== "enumerated") continue;
      const n = VARCHAR_LENGTH.get(k);
      if (n === undefined) continue;

      const values = enumValues(
        await loadExport(contract.module, contract.exportName),
      );
      if (values.length === 0) {
        failures.push(`${k}: ${contract.exportName} から値を取り出せない`);
        continue;
      }
      for (const value of values) {
        if (value.length > n) {
          failures.push(`${k}: "${value}"(${value.length}) > VarChar(${n})`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
