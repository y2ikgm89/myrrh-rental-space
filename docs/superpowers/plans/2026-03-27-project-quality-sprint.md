# Project Quality Sprint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stripe 決済フロー実装、顧客通知メール追加、CSV エクスポート機能を段階的に実装し、レンタルスペース予約管理システムの運用品質を本番水準に引き上げる。

**Architecture:** Stripe Checkout Session ベースの決済フロー（Payment Intent ではなく Checkout で決済画面を Stripe 側に委譲）。PaymentStatus enum を Reservation モデルに追加し、Webhook で非同期に決済完了を処理する。顧客向けステータス変更通知メールと CSV エクスポートは既存パターンに沿って実装。

**Tech Stack:** Stripe SDK v21 (stripe@21), Next.js 16 Route Handlers, Prisma 7, React Email, Resend v6, bun:test

---

## Phase 1: Stripe 決済フロー（Tasks 1-8）

### Task 1: PaymentStatus enum + Reservation スキーマ拡張

**Files:**

- Modify: `prisma/schema.prisma`
- Create: migration via `bunx --bun prisma migrate dev`

- [ ] **Step 1: schema.prisma に PaymentStatus enum を追加**

```prisma
enum PaymentStatus {
  UNPAID       // 未払い（決済なし or 決済不要）
  PENDING      // 決済待ち（Checkout Session 作成済み）
  PAID         // 支払い済み
  REFUNDED     // 返金済み
  FAILED       // 決済失敗
}
```

Reservation モデルに以下を追加:

```prisma
// Payment
paymentStatus          PaymentStatus @default(UNPAID)
stripeCheckoutSessionId String?
stripePaymentIntentId   String?
paidAt                  DateTime?

@@index([paymentStatus])
@@index([stripePaymentIntentId])
```

- [ ] **Step 2: マイグレーション実行**

```bash
bunx --bun prisma migrate dev --name add_payment_status
```

- [ ] **Step 3: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(prisma): add PaymentStatus enum and payment fields to Reservation"
```

---

### Task 2: PaymentStatus enum ガード + CACHE_TAGS 拡張

**Files:**

- Modify: `src/shared/lib/validations/enums.ts`（`isValidPaymentStatus`, `getValidPaymentStatus` 追加）
- Modify: `src/shared/lib/validations/enums/helpers.ts`（PaymentStatus ラベル・Badge マッピング追加）
- Modify: `src/shared/lib/constants/cache.ts`（`PAYMENTS` タグ不要 — 既存 `RESERVATIONS` タグで十分）

- [ ] **Step 1: enums.ts に PaymentStatus 型ガード追加**

```typescript
import { PaymentStatus } from "@/shared/generated/prisma/client";

const VALID_PAYMENT_STATUSES = new Set<string>(Object.values(PaymentStatus));

export function isValidPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && VALID_PAYMENT_STATUSES.has(value);
}

export function getValidPaymentStatus(
  value: unknown,
  defaultValue: PaymentStatus = PaymentStatus.UNPAID,
): PaymentStatus {
  return isValidPaymentStatus(value) ? value : defaultValue;
}
```

- [ ] **Step 2: helpers.ts に PaymentStatus ラベル・Badge variant 追加**

```typescript
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.UNPAID]: "未払い",
  [PaymentStatus.PENDING]: "決済待ち",
  [PaymentStatus.PAID]: "支払い済み",
  [PaymentStatus.REFUNDED]: "返金済み",
  [PaymentStatus.FAILED]: "決済失敗",
};

export const PAYMENT_STATUS_BADGE_VARIANTS: Record<PaymentStatus, string> = {
  [PaymentStatus.UNPAID]: "secondary",
  [PaymentStatus.PENDING]: "warning",
  [PaymentStatus.PAID]: "success",
  [PaymentStatus.REFUNDED]: "outline",
  [PaymentStatus.FAILED]: "destructive",
};
```

- [ ] **Step 3: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add src/shared/lib/validations/enums.ts src/shared/lib/validations/enums/helpers.ts
git commit -m "feat(enums): add PaymentStatus type guards and labels"
```

---

### Task 3: Stripe 決済コマンド（ドメイン層）

**Files:**

- Create: `src/shared/domain/reservations/payment-commands.ts`
- Modify: `src/shared/lib/email/types.ts`（`ReservationEmailData` に `paymentStatus` 追加）

- [ ] **Step 1: payment-commands.ts を作成**

Checkout Session 作成・返金の2つのコマンドを実装:

```typescript
// src/shared/domain/reservations/payment-commands.ts
import "server-only";
import { prisma } from "@/shared/db/prisma";
import { PaymentStatus } from "@/shared/generated/prisma/client";
import { getStripeClient } from "@/admin/lib/stripe";
import { getStripeSettings } from "@/shared/domain/settings/queries/integration";
import { DomainError } from "@/shared/lib/errors";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { getAppUrl } from "@/shared/lib/constants";

const RESERVATION_SELECT = {
  id: true,
  totalPrice: true,
  basePrice: true,
  status: true,
  paymentStatus: true,
  stripeCheckoutSessionId: true,
  stripePaymentIntentId: true,
  space: { select: { name: true } },
  customer: { select: { email: true, lastName: true, firstName: true } },
} as const;

export async function createCheckoutSessionCommand(
  reservationId: string,
): Promise<{ checkoutUrl: string }> {
  const settings = await getStripeSettings();
  if (!settings.stripeEnabled)
    throw new DomainError("オンライン決済は無効です");

  const { client } = await getStripeClient(settings.stripeSecretKey);
  if (!client) throw new DomainError("Stripe の設定が不正です");

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: RESERVATION_SELECT,
  });
  if (!reservation) throw new DomainError("予約が見つかりません");
  if (reservation.paymentStatus === PaymentStatus.PAID) {
    throw new DomainError("この予約は既に支払い済みです");
  }

  const amount = reservation.totalPrice ?? reservation.basePrice ?? 0;
  if (amount <= 0) throw new DomainError("決済金額が不正です");

  const appUrl = getAppUrl();
  const session = await client.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: settings.stripeCurrency,
          product_data: {
            name: `${reservation.space.name} 予約`,
            description: `予約ID: ${reservationId.slice(0, 8).toUpperCase()}`,
          },
          unit_amount:
            settings.stripeCurrency === "jpy"
              ? Math.round(amount)
              : Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { reservationId },
    customer_email: reservation.customer.email,
    success_url: `${appUrl}/reservation/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/reservation/cancel?reservation_id=${reservationId}`,
  });

  await prisma.reservation.update({
    where: { id: reservationId },
    data: {
      paymentStatus: PaymentStatus.PENDING,
      stripeCheckoutSessionId: session.id,
    },
  });

  if (!session.url)
    throw new DomainError("Checkout Session の URL を取得できませんでした");
  return { checkoutUrl: session.url };
}

export async function refundReservationPaymentCommand(
  reservationId: string,
): Promise<void> {
  const settings = await getStripeSettings();
  const { client } = await getStripeClient(settings.stripeSecretKey);
  if (!client) throw new DomainError("Stripe の設定が不正です");

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: {
      id: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
    },
  });
  if (!reservation) throw new DomainError("予約が見つかりません");
  if (reservation.paymentStatus !== PaymentStatus.PAID) {
    throw new DomainError("支払い済みの予約のみ返金できます");
  }
  if (!reservation.stripePaymentIntentId) {
    throw new DomainError("決済情報が見つかりません");
  }

  await client.refunds.create({
    payment_intent: reservation.stripePaymentIntentId,
  });

  await prisma.reservation.update({
    where: { id: reservationId },
    data: { paymentStatus: PaymentStatus.REFUNDED },
  });
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/shared/domain/reservations/payment-commands.ts
git commit -m "feat(payment): add checkout session and refund commands"
```

---

### Task 4: Stripe Webhook ハンドラー

**Files:**

- Create: `src/app/api/webhooks/stripe/route.ts`
- Modify: `src/shared/lib/env/server.ts`（STRIPE_WEBHOOK_SECRET 環境変数は既に optional で定義されているか確認）

- [ ] **Step 1: Stripe Webhook Route Handler を作成**

```typescript
// src/app/api/webhooks/stripe/route.ts
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { PaymentStatus } from "@/shared/generated/prisma/client";
import { getStripeClient } from "@/admin/lib/stripe";
import { getStripeSettings } from "@/shared/domain/settings/queries/integration";
import { safeDecrypt } from "@/shared/lib/crypto";
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { sendReservationConfirmationEmail } from "@/shared/lib/email/reservation-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import type Stripe from "stripe";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 },
    );
  }

  const settings = await getStripeSettings();
  const { client } = await getStripeClient(settings.stripeSecretKey);
  if (!client) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 },
    );
  }

  const webhookSecret = settings.stripeWebhookSecret
    ? safeDecrypt(settings.stripeWebhookSecret)
    : null;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 },
    );
  }

  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "stripeWebhookVerify" },
    });
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const reservationId = session.metadata?.["reservationId"];
        if (!reservationId) break;

        await prisma.reservation.update({
          where: { id: reservationId },
          data: {
            paymentStatus: PaymentStatus.PAID,
            stripePaymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : (session.payment_intent?.id ?? null),
            paidAt: new Date(),
          },
        });

        // 予約確認メール送信
        const reservation = await prisma.reservation.findUnique({
          where: { id: reservationId },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            totalPrice: true,
            notes: true,
            space: { select: { name: true } },
            customer: {
              select: { email: true, lastName: true, firstName: true },
            },
          },
        });
        if (reservation) {
          fireAndForget(
            sendReservationConfirmationEmail({
              reservationId: reservation.id,
              customerEmail: reservation.customer.email,
              customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
              spaceName: reservation.space.name,
              startTime: reservation.startTime,
              endTime: reservation.endTime,
              totalPrice: reservation.totalPrice,
            }),
            { operation: "sendPaymentConfirmationEmail" },
          );
        }

        revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
        revalidateTag(
          getCacheTag.reservations.detail(reservationId),
          CACHE_LIFE.DYNAMIC_DATA,
        );
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const reservationId = session.metadata?.["reservationId"];
        if (!reservationId) break;

        await prisma.reservation.update({
          where: { id: reservationId },
          data: { paymentStatus: PaymentStatus.FAILED },
        });

        revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (!paymentIntentId) break;

        await prisma.reservation.updateMany({
          where: { stripePaymentIntentId: paymentIntentId },
          data: { paymentStatus: PaymentStatus.REFUNDED },
        });

        revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
        break;
      }
    }
  } catch (error) {
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "stripeWebhookProcess", eventType: event.type },
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat(payment): add Stripe webhook handler for checkout events"
```

---

### Task 5: 管理画面 — 決済アクション（Checkout Session 作成・返金）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/payment.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/index.ts`（barrel に追加）

- [ ] **Step 1: payment.ts Server Action を作成**

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/payment.ts
"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createCheckoutSessionCommand,
  refundReservationPaymentCommand,
} from "@/shared/domain/reservations/payment-commands";

export async function createCheckoutSession(
  reservationId: string,
): Promise<MutationResult<{ checkoutUrl: string }>> {
  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: reservationId,
    execute: async () => createCheckoutSessionCommand(reservationId),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(getCacheTag.reservations.detail(reservationId));
    },
  });
}

export async function refundReservationPayment(
  reservationId: string,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: reservationId,
    execute: async () => {
      await refundReservationPaymentCommand(reservationId);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(getCacheTag.reservations.detail(reservationId));
      updateTag(CACHE_TAGS.CUSTOMERS);
    },
  });
}
```

- [ ] **Step 2: index.ts barrel に追加**

```typescript
export { createCheckoutSession, refundReservationPayment } from "./payment";
```

- [ ] **Step 3: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/payment.ts' 'src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/index.ts'
git commit -m "feat(payment): add admin server actions for checkout and refund"
```

---

### Task 6: 管理画面 — 予約詳細に決済ステータス表示 + 操作ボタン

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx`（paymentStatus を select に追加）
- Modify: `src/shared/domain/reservations/admin-queries.ts`（select に paymentStatus, paidAt 追加）

- [ ] **Step 1: admin-queries.ts の予約 select に payment フィールド追加**

予約詳細クエリの `select` に以下を追加:

```typescript
paymentStatus: true,
stripePaymentIntentId: true,
paidAt: true,
```

- [ ] **Step 2: ReservationDetail.tsx に決済ステータスセクション追加**

DetailSection 内に Badge + 操作ボタン（Checkout URL 生成 / 返金）を追加。
`PAYMENT_STATUS_LABELS` と `PAYMENT_STATUS_BADGE_VARIANTS` を使用。

返金ボタンは `PaymentStatus.PAID` のときのみ表示。`DeleteConfirmDialog` パターンで確認ダイアログ。

- [ ] **Step 3: 型チェック + lint**

```bash
bun run validate
```

- [ ] **Step 4: コミット**

```bash
git add src/shared/domain/reservations/admin-queries.ts 'src/app/(admin)/admin/(dashboard)/reservations/'
git commit -m "feat(payment): show payment status and actions in reservation detail"
```

---

### Task 7: 予約一覧テーブルに決済ステータス列追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTable.tsx`
- Modify: `src/shared/domain/reservations/admin-queries.ts`（list クエリの select にも追加）

- [ ] **Step 1: list クエリの select に paymentStatus 追加**

- [ ] **Step 2: ReservationTable に Badge 列追加**

`hidden md:table-cell` で中画面以上で表示。`PAYMENT_STATUS_LABELS` + `PAYMENT_STATUS_BADGE_VARIANTS` 使用。

- [ ] **Step 3: 型チェック + lint**

```bash
bun run validate
```

- [ ] **Step 4: コミット**

```bash
git add src/shared/domain/reservations/admin-queries.ts 'src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTable.tsx'
git commit -m "feat(payment): add payment status column to reservation table"
```

---

### Task 8: Settings queries に getStripeSettings 追加（存在確認）

**Files:**

- Create or Modify: `src/shared/domain/settings/queries/integration.ts`

Stripe 設定の取得関数が既に存在するか確認し、なければ作成。`stripeEnabled`, `stripeSecretKey`, `stripeWebhookSecret`, `stripeCurrency` を select する `'use cache'` 関数。

- [ ] **Step 1: getStripeSettings 関数を確認/作成**

- [ ] **Step 2: 型チェック + ビルド**

```bash
bun run validate && bun run build
```

- [ ] **Step 3: コミット**

```bash
git commit -m "feat(payment): ensure getStripeSettings query exists"
```

---

## Phase 2: 顧客ステータス変更通知メール（Tasks 9-11）

### Task 9: 予約ステータス変更通知メールテンプレート

**Files:**

- Create: `src/shared/emails/reservation-status-changed.tsx`
- Modify: `src/shared/lib/email/types.ts`（`StatusChangeEmailData` 型追加）

- [ ] **Step 1: StatusChangeEmailData 型を types.ts に追加**

```typescript
export type StatusChangeEmailData = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  oldStatus: string;
  newStatus: string;
  location?: string;
};
```

- [ ] **Step 2: React Email テンプレート作成**

既存の `reservation-confirmation.tsx` のレイアウトを踏襲。ステータス変更を目立つ Badge で表示。「確認済み」は緑、「キャンセル」は赤、「完了」は青。

- [ ] **Step 3: コミット**

```bash
git add src/shared/emails/reservation-status-changed.tsx src/shared/lib/email/types.ts
git commit -m "feat(email): add reservation status change notification template"
```

---

### Task 10: ステータス変更メール送信関数

**Files:**

- Modify: `src/shared/lib/email/reservation-emails.ts`

- [ ] **Step 1: sendReservationStatusChangedEmail 関数追加**

```typescript
export async function sendReservationStatusChangedEmail(
  data: StatusChangeEmailData,
): Promise<EmailResult> {
  const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.startTime, "HH:mm", { locale: ja });
  const endTime = format(data.endTime, "HH:mm", { locale: ja });

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.customerEmail,
        subject: `【予約ステータス更新】${data.spaceName} - ${reservationDate}`,
        react: ReservationStatusChangedEmail({
          customerName: data.customerName,
          spaceName: data.spaceName,
          reservationDate,
          startTime,
          endTime,
          totalPrice: formatPrice(data.totalPrice),
          reservationId: data.reservationId.slice(0, 8).toUpperCase(),
          newStatus: data.newStatus,
        }),
      }),
    {
      operation: "sendReservationStatusChangedEmail",
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/shared/lib/email/reservation-emails.ts
git commit -m "feat(email): add status change email sending function"
```

---

### Task 11: 管理画面のステータス変更時にメール送信を組み込み

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`
- Modify: `src/shared/domain/reservations/commands.ts`（`updateReservationStatusCommand` の戻り値に通知データ追加）

- [ ] **Step 1: updateReservationStatus アクション内で fireAndForget メール送信追加**

ステータスが変更された場合（`oldStatus !== newStatus`）、`fireAndForget` で `sendReservationStatusChangedEmail` を呼ぶ。

対象ステータス: `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`

- [ ] **Step 2: 型チェック + lint**

```bash
bun run validate
```

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts' src/shared/domain/reservations/commands.ts
git commit -m "feat(email): send customer notification on reservation status change"
```

---

## Phase 3: CSV エクスポート（Tasks 12-14）

### Task 12: CSV 生成ユーティリティ

**Files:**

- Create: `src/shared/lib/csv.ts`

- [ ] **Step 1: 汎用 CSV 生成関数を作成**

```typescript
// src/shared/lib/csv.ts

type CsvColumn<T> = {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
};

export function generateCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const BOM = "\uFEFF"; // Excel UTF-8 BOM
  const header = columns.map((c) => escapeCsvField(c.header)).join(",");
  const body = rows.map((row) =>
    columns
      .map((col) => escapeCsvField(String(col.accessor(row) ?? "")))
      .join(","),
  );
  return BOM + [header, ...body].join("\r\n");
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```

- [ ] **Step 2: コミット**

```bash
git add src/shared/lib/csv.ts
git commit -m "feat(csv): add generic CSV generation utility"
```

---

### Task 13: 予約 CSV エクスポート API Route

**Files:**

- Create: `src/app/api/admin/export/reservations/route.ts`

- [ ] **Step 1: 予約エクスポート Route Handler 作成**

`checkPermission("reservation", "read")` で認証。全予約を取得して CSV レスポンスを返す。

```typescript
// src/app/api/admin/export/reservations/route.ts
import { NextResponse } from "next/server";
import { checkPermission } from "@/admin/lib/action-auth";
import { prisma } from "@/shared/db/prisma";
import { generateCsv } from "@/shared/lib/csv";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { RESERVATION_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { PAYMENT_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";

export async function GET(request: Request): Promise<Response> {
  const auth = await checkPermission("reservation", "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const reservations = await prisma.reservation.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      paymentStatus: true,
      totalPrice: true,
      basePrice: true,
      couponDiscountAmount: true,
      notes: true,
      createdAt: true,
      space: { select: { name: true } },
      customer: {
        select: {
          lastName: true,
          firstName: true,
          email: true,
          phoneNumber: true,
          companyName: true,
        },
      },
      coupon: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const csv = generateCsv(reservations, [
    { header: "予約ID", accessor: (r) => r.id.slice(0, 8).toUpperCase() },
    { header: "スペース", accessor: (r) => r.space.name },
    {
      header: "顧客名",
      accessor: (r) => `${r.customer.lastName} ${r.customer.firstName}`,
    },
    { header: "会社名", accessor: (r) => r.customer.companyName },
    { header: "メール", accessor: (r) => r.customer.email },
    { header: "電話番号", accessor: (r) => r.customer.phoneNumber },
    {
      header: "利用日",
      accessor: (r) => format(r.startTime, "yyyy/MM/dd", { locale: ja }),
    },
    { header: "開始", accessor: (r) => format(r.startTime, "HH:mm") },
    { header: "終了", accessor: (r) => format(r.endTime, "HH:mm") },
    { header: "基本料金", accessor: (r) => r.basePrice },
    { header: "割引額", accessor: (r) => r.couponDiscountAmount },
    { header: "合計", accessor: (r) => r.totalPrice },
    { header: "クーポン", accessor: (r) => r.coupon?.code },
    {
      header: "予約ステータス",
      accessor: (r) => RESERVATION_STATUS_LABELS[r.status] ?? r.status,
    },
    {
      header: "決済ステータス",
      accessor: (r) =>
        PAYMENT_STATUS_LABELS[r.paymentStatus] ?? r.paymentStatus,
    },
    { header: "備考", accessor: (r) => r.notes },
    {
      header: "作成日",
      accessor: (r) => format(r.createdAt, "yyyy/MM/dd HH:mm"),
    },
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reservations-${format(new Date(), "yyyyMMdd")}.csv"`,
    },
  });
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/app/api/admin/export/reservations/route.ts
git commit -m "feat(export): add reservation CSV export API route"
```

---

### Task 14: 顧客 CSV エクスポート API Route + UI ボタン

**Files:**

- Create: `src/app/api/admin/export/customers/route.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/page.tsx`（エクスポートボタン追加）
- Modify: `src/app/(admin)/admin/(dashboard)/customers/page.tsx`（エクスポートボタン追加）

- [ ] **Step 1: 顧客エクスポート Route Handler 作成**

予約エクスポートと同パターン。`checkPermission("customer", "read")` で認証。

- [ ] **Step 2: 予約一覧ページにエクスポートボタン追加**

ヘッダーアクション領域に:

```tsx
<Button variant="outline" size="sm" asChild>
  <a href="/api/admin/export/reservations" download>
    <Download className="mr-2 h-4 w-4" />
    CSV
  </a>
</Button>
```

- [ ] **Step 3: 顧客一覧ページにも同様のボタン追加**

- [ ] **Step 4: 型チェック + lint**

```bash
bun run validate
```

- [ ] **Step 5: コミット**

```bash
git add src/app/api/admin/export/ 'src/app/(admin)/admin/(dashboard)/reservations/page.tsx' 'src/app/(admin)/admin/(dashboard)/customers/page.tsx'
git commit -m "feat(export): add customer CSV export and UI buttons"
```

---

## Phase 4: 検証 + テスト（Tasks 15-17）

### Task 15: Unit テスト — CSV ユーティリティ

**Files:**

- Create: `__tests__/unit/shared/lib/csv.test.ts`

- [ ] **Step 1: CSV 生成のテスト**

```typescript
import { describe, expect, test } from "bun:test";
import { generateCsv } from "@/shared/lib/csv";

describe("generateCsv", () => {
  test("generates correct CSV with BOM", () => {
    const rows = [{ name: "テスト", value: 100 }];
    const columns = [
      { header: "名前", accessor: (r: (typeof rows)[0]) => r.name },
      { header: "値", accessor: (r: (typeof rows)[0]) => r.value },
    ];
    const csv = generateCsv(rows, columns);
    expect(csv).toStartWith("\uFEFF");
    expect(csv).toContain("名前,値");
    expect(csv).toContain("テスト,100");
  });

  test("escapes fields with commas", () => {
    const rows = [{ name: "A, B" }];
    const columns = [
      { header: "名前", accessor: (r: (typeof rows)[0]) => r.name },
    ];
    const csv = generateCsv(rows, columns);
    expect(csv).toContain('"A, B"');
  });

  test("escapes fields with quotes", () => {
    const rows = [{ name: 'He said "hello"' }];
    const columns = [
      { header: "名前", accessor: (r: (typeof rows)[0]) => r.name },
    ];
    const csv = generateCsv(rows, columns);
    expect(csv).toContain('"He said ""hello"""');
  });

  test("handles null and undefined values", () => {
    const rows = [{ name: null }];
    const columns = [
      { header: "名前", accessor: (r: (typeof rows)[0]) => r.name },
    ];
    const csv = generateCsv(rows, columns);
    expect(csv).toContain("名前\r\n");
  });
});
```

- [ ] **Step 2: テスト実行**

```bash
bun run test __tests__/unit/shared/lib/csv.test.ts
```

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/shared/lib/csv.test.ts
git commit -m "test(csv): add unit tests for CSV generation utility"
```

---

### Task 16: Unit テスト — PaymentStatus 型ガード

**Files:**

- Modify: `__tests__/unit/lib/validations/enums.test.ts`

- [ ] **Step 1: PaymentStatus テストケース追加**

```typescript
describe("PaymentStatus", () => {
  test("isValidPaymentStatus accepts valid values", () => {
    expect(isValidPaymentStatus("UNPAID")).toBe(true);
    expect(isValidPaymentStatus("PAID")).toBe(true);
    expect(isValidPaymentStatus("REFUNDED")).toBe(true);
  });

  test("isValidPaymentStatus rejects invalid values", () => {
    expect(isValidPaymentStatus("invalid")).toBe(false);
    expect(isValidPaymentStatus(null)).toBe(false);
    expect(isValidPaymentStatus(123)).toBe(false);
  });

  test("getValidPaymentStatus returns default for invalid", () => {
    expect(getValidPaymentStatus("invalid")).toBe(PaymentStatus.UNPAID);
  });
});
```

- [ ] **Step 2: テスト実行**

```bash
bun run test __tests__/unit/lib/validations/enums.test.ts
```

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/lib/validations/enums.test.ts
git commit -m "test(enums): add PaymentStatus type guard tests"
```

---

### Task 17: 全体検証 + ビルド

**Files:** None (validation only)

- [ ] **Step 1: validate + build**

```bash
bun run validate && bun run build
```

- [ ] **Step 2: 全テスト実行**

```bash
bun run test
```

- [ ] **Step 3: 問題があれば修正してコミット**

---

## 実装順序の依存関係

```
Task 1 (Schema) → Task 2 (Enums) → Task 3 (Commands) → Task 4 (Webhook)
                                   → Task 5 (Actions)  → Task 6 (Detail UI)
                                                        → Task 7 (Table UI)
Task 8 (Settings query) — Task 3, 4 が依存

Task 9 (Email template) → Task 10 (Send function) → Task 11 (Integration)

Task 12 (CSV util) → Task 13 (Reservation export) → Task 14 (Customer export + UI)

Task 15 (CSV test)     — Task 12 後いつでも
Task 16 (Enum test)    — Task 2 後いつでも
Task 17 (Full verify)  — 全タスク完了後
```

## 実装範囲外（次フェーズ）

- 公開予約フォームへの Stripe Checkout 組み込み（現在は管理画面からの Checkout Session 作成のみ）
- LINE Bot 通知
- OGP 画像自動生成
- お気に入りスペース機能
- E2E テスト追加
