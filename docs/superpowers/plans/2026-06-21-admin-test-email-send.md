# Admin Test Email Send — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin がメール設定タブから「テスト送信」ボタンで任意宛先または Resend simulator 宛にテストメールを送信し、送信パイプライン全段（API key → sender → domain 検証 → tags/headers → idempotency → Resend `/emails` → messageId）を end-to-end で検証できる UI/Action を追加する。

**Architecture:** React Email JSX component を `payload.react` で Resend SDK に渡す既存パターンを踏襲。`executeAdminMutationResult` で auth/RBAC/audit を取り、`validateSenderDomain` を hard gate に再利用、Resend 公式の `tags`/`headers`/`Idempotency-Key`/simulator address を全採用。`sendEmail()` の返却型を `{success:bool}` から discriminated union (`{ok:true,messageId}|{ok:false,reason:"disabled"}|{ok:false,reason:"error",error}`) に refactor し、disabled silent-success footgun を根治する。

**Tech Stack:** Next.js 16 App Router / React 19 + React Compiler / TypeScript strict / Bun / Resend SDK ^6.12.4 / @react-email/components ^1.0.12 / conform + Zod 4 / shadcn (Radix) / sonner / lefthook + Conventional Commits

## Global Constraints

- パッケージ管理は **Bun のみ**（npm/yarn/pnpm 禁止）
- フルテストは `bun run test:unit` / `bun run test:integration`（`bun test <dir>` 禁止＝公式仕様で cross-file mock 漏洩）
- コミット前は `bun run validate && bun run build` を通す（pre-push が architecture-boundaries.test を走らす）
- Path は常にフォワードスラッシュ `/`。`()` を含むパスは Glob/Grep/Read tool 経由（Bash 不可）
- DB アクセスは `@/shared/db/prisma` gateway のみ（本機能は DB 書き込みなし）
- 管理画面 mutation は **必ず** `executeAdminMutationResult` 経由
- React Compiler 前提：`useMemo` / `useCallback` / `forwardRef` 禁止
- `cache` タグは `CACHE_TAGS` 経由（本機能は cache 無効化なし）
- ESLint: `(public)` から `@/shared/db*` 禁止／一般行で `prisma.$transaction([...])` 配列形式禁止
- Conventional Commits 必須（`--no-verify` 禁止）
- 設計仕様 SSoT: `docs/superpowers/specs/2026-06-21-admin-test-email-send-design.md`

## File Structure

### Files to create (5)

| Path                                                                                | Responsibility                                                                                              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/shared/emails/test-email.tsx`                                                  | React Email JSX。house pattern（`<Html lang="ja">/<Head/>/<Preview>/<Body>/<Container>`、`#0066cc` accent） |
| `src/shared/lib/email/test-email.ts`                                                | `sendTestEmail()` ラッパー。Resend tags/headers/idempotencyKey を組み立て `sendEmail()` を呼ぶ              |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/test-email.ts`          | Server Action `sendTestEmailAction(recipient)`。Zod validate → executeAdminMutationResult                   |
| `src/app/(admin)/admin/(dashboard)/settings/_components/sections/TestEmailCard.tsx` | Client component。recipient input + simulator dropdown + 送信ボタン + StatusBanner                          |
| `__tests__/integration/actions/admin/test-email.test.ts`                            | 9 ケース integration テスト（sendEmail mock）                                                               |

### Files to modify (5)

| Path                                                                               | Change                                                                                                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/shared/lib/email/types.ts`                                                    | `EmailResult` を新 discriminated union に置換                                                                     |
| `src/shared/lib/email/send.ts`                                                     | 戻り値を新 `EmailResult` に refactor、`resend.emails.send()` の `data.id` を `messageId` として返す               |
| `src/app/api/cron/reservation-reminder/route.ts`                                   | `result.success` → `result.ok`                                                                                    |
| `src/app/(admin)/admin/(dashboard)/settings/_components/sections/EmailSection.tsx` | `<TestEmailCard staffEmail={currentUserEmail} />` を CardContent 末尾に追加、props に `currentUserEmail` 受け取り |
| `src/app/(admin)/admin/(dashboard)/settings/notifications/page.tsx`                | `checkAdminAuth()` で current admin の email を取得し EmailSection に渡す                                         |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts`              | `sendTestEmailAction` を re-export                                                                                |

> 注: 既存 9 個の `*-emails.ts` は `Promise<EmailResult>` を pass-through するだけで `.success` を inspect しないため、型エイリアス置換で機械的に通る（コード変更なし、type-check で確認）。
>
> 既存 `EmailResult` の唯一の外部 inspector は `src/app/api/cron/reservation-reminder/route.ts:93` のみ。

---

## Task 1: `EmailResult` 型と `sendEmail()` の clean refactor

**Files:**

- Modify: `src/shared/lib/email/types.ts:99`
- Modify: `src/shared/lib/email/send.ts:64-132`
- Modify: `src/app/api/cron/reservation-reminder/route.ts:91-97`
- Test: `__tests__/unit/email/send-result.test.ts` (new)

**Interfaces:**

- Produces:

  ```ts
  export type EmailResult =
    | { ok: true; messageId: string }
    | { ok: false; reason: "disabled" }
    | { ok: false; reason: "error"; error: string };

  // sendEmail signature unchanged (params), return type narrowed to new union
  export async function sendEmail(
    params: SendEmailParams,
  ): Promise<EmailResult>;
  ```

- [ ] **Step 1: 失敗テストを書く**

`__tests__/unit/email/send-result.test.ts` を新規作成:

```ts
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockResendSend = mock<
  (
    payload: unknown,
    options?: { idempotencyKey?: string },
  ) => Promise<{
    data?: { id: string } | null;
    error?: { name: string; message: string } | null;
  }>
>(() => Promise.resolve({ data: { id: "re_default" }, error: null }));

mock.module("./client", () => ({
  isEmailEnabled: mock(() => Promise.resolve(true)),
  getResendClient: mock(() =>
    Promise.resolve({ emails: { send: mockResendSend } }),
  ),
  getFromAddress: mock(() => "Test <test@example.com>"),
}));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mock(() =>
    Promise.resolve({
      senderEmail: "from@x.com",
      senderName: "X",
      replyToEmail: null,
    }),
  ),
}));

const { sendEmail } = await import("@/shared/lib/email/send");

describe("sendEmail return shape (new EmailResult)", () => {
  beforeEach(() => mockResendSend.mockClear());

  test("happy path returns ok:true with messageId from Resend response", async () => {
    mockResendSend.mockResolvedValueOnce({
      data: { id: "re_abc123" },
      error: null,
    });
    const result = await sendEmail({
      payload: { to: "x@y.com", subject: "s", text: "t" },
      operation: "test",
    });
    expect(result).toEqual({ ok: true, messageId: "re_abc123" });
  });

  test("disabled state returns ok:false reason:disabled (no API key)", async () => {
    const { isEmailEnabled } = await import("./client" as never);
    (
      isEmailEnabled as { mockResolvedValueOnce: (v: boolean) => void }
    ).mockResolvedValueOnce(false);
    const result = await sendEmail({
      payload: { to: "x@y.com", subject: "s", text: "t" },
      operation: "test",
    });
    expect(result).toEqual({ ok: false, reason: "disabled" });
  });

  test("Resend API error after retries returns ok:false reason:error", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid recipient" },
    });
    const result = await sendEmail({
      payload: { to: "x@y.com", subject: "s", text: "t" },
      operation: "test",
      maxRetries: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("error");
      if (result.reason === "error") expect(result.error).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認**

```bash
bun run test:unit -- __tests__/unit/email/send-result.test.ts
```

期待: `Cannot find module "@/shared/lib/email/send"` or assertion mismatch — 新形 union が未実装。

- [ ] **Step 3: `EmailResult` を新形に置換**

`src/shared/lib/email/types.ts:99` の最終行を以下に差し替え:

```ts
/**
 * メール送信結果。
 *
 * - `{ ok: true; messageId }` — Resend が受理（API レベル成功、配信は別途 webhook で観測）
 * - `{ ok: false; reason: "disabled" }` — RESEND_API_KEY 未設定で no-op
 * - `{ ok: false; reason: "error"; error }` — Resend API エラー（retry 尽きた後）
 */
export type EmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "error"; error: string };
```

- [ ] **Step 4: `sendEmail()` の戻り値を新形に refactor**

`src/shared/lib/email/send.ts` を以下に置換:

```ts
// Line 64-65 を:
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  if (!(await isEmailEnabled())) return { ok: false, reason: "disabled" };

  const resend = await getResendClient();
  if (!resend) return { ok: false, reason: "disabled" };

  // Line 98-132 の for ループを:
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = idempotencyKey
        ? await resend.emails.send(fullPayload, { idempotencyKey })
        : await resend.emails.send(fullPayload);

      if (!error) {
        const messageId = data?.id ?? "";
        return { ok: true, messageId };
      }

      if (attempt < maxRetries && RETRYABLE_ERROR_NAMES.has(error.name)) {
        await sleep(backoffMs(attempt));
        continue;
      }

      logError(new Error(error.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          ...errorContext,
          errorName: error.name,
          attempt: attempt + 1,
        },
      });
      return { ok: false, reason: "error", error: "メール送信に失敗しました" };
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: errorContext,
      });
      return { ok: false, reason: "error", error: "メール送信に失敗しました" };
    }
  }

  return { ok: false, reason: "error", error: "メール送信に失敗しました" };
}
```

`/** @returns ... */` JSDoc も更新:

```ts
/**
 * メールを送信する。
 *
 * Resend API キーが env / 管理画面のいずれにも無い場合は `{ ok: false, reason: "disabled" }` を返す。
 * 既存テンプレ送信経路は `result.ok === false` を「失敗」として log するため動作不変。
 * テスト送信機能は `reason: "disabled"` を「警告」、`reason: "error"` を「エラー」として UI 上区別する。
 */
```

- [ ] **Step 5: cron reminder の唯一の外部 inspector を更新**

`src/app/api/cron/reservation-reminder/route.ts:91-97` を:

```ts
// sendEmail は送信失敗時に throw せず { ok: false, ... } を返す。
// 失敗・disabled どちらでも claim を解放して次回 cron で再送できるようにする。
if (!result.ok) {
  await releaseReservationReminderClaim(reservation.id);
  skipped++;
  continue;
}
```

- [ ] **Step 6: テスト緑確認＋型整合確認**

```bash
bun run test:unit -- __tests__/unit/email/send-result.test.ts
bun run type-check
```

期待: 全テスト PASS、型エラーなし（9 個の `*-emails.ts` は `Promise<EmailResult>` pass-through なので型エイリアス置換だけで通る）。

- [ ] **Step 7: 既存統合テスト全実行で regression なし確認**

```bash
bun run test:integration
```

期待: 既存メール関連テスト（reservation/event/etc）全 PASS。

- [ ] **Step 8: コミット**

```bash
git add src/shared/lib/email/types.ts src/shared/lib/email/send.ts src/app/api/cron/reservation-reminder/route.ts __tests__/unit/email/send-result.test.ts
git commit -m "$(cat <<'EOF'
refactor(email)!: EmailResult を discriminated union 化し messageId と disabled 状態を明示

sendEmail() の戻り値 { success: bool } → { ok: true; messageId } |
{ ok: false; reason: "disabled" } | { ok: false; reason: "error"; error }。

RESEND_API_KEY 未設定時の silent success（disabled を区別できず緑
バナー誤認を招く footgun）を根治。Resend response の id を messageId
として surface し、テスト送信機能で cross-reference 可能化。

BREAKING CHANGE: EmailResult shape を新形に置換。外部 consumer は
cron reservation-reminder の 1 箇所のみで .success → .ok に追随済。
他 9 個の *-emails.ts は pass-through で型エイリアス置換のみ。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `TestEmail` React Email component

**Files:**

- Create: `src/shared/emails/test-email.tsx`
- Test: `__tests__/unit/emails/test-email.test.tsx` (new)

**Interfaces:**

- Produces:

  ```ts
  type TestEmailProps = {
    recipientLabel: string; // 表示用宛先（"自分のメールボックス" / simulator ラベル等）
    siteName: string;
    timestamp: string; // 表示用 ISO/JST 文字列
    triggeredByName: string; // 送信操作者の表示名
    triggeredByEmail: string; // 送信操作者の email
  };
  export function TestEmail(props: TestEmailProps): ReactElement;
  export default TestEmail; // house pattern: named + default 両 export
  ```

- [ ] **Step 1: 失敗テストを書く**

`__tests__/unit/emails/test-email.test.tsx` 新規作成:

```tsx
import { describe, test, expect } from "bun:test";
import { TestEmail } from "@/shared/emails/test-email";
import type { ReactElement } from "react";

function getProps() {
  return {
    recipientLabel: "delivered@resend.dev",
    siteName: "Myrrh Rental Space",
    timestamp: "2026-06-21 12:00 JST",
    triggeredByName: "Admin User",
    triggeredByEmail: "admin@example.com",
  };
}

describe("TestEmail component", () => {
  test("returns a React element rooted in Html with lang=ja", () => {
    const el = TestEmail(getProps()) as ReactElement<{
      lang?: string;
      children: unknown;
    }>;
    expect(el).toBeTruthy();
    expect(el.props.lang).toBe("ja");
  });

  test("includes all props as renderable values in the tree", () => {
    const el = TestEmail(getProps());
    const json = JSON.stringify(el);
    expect(json).toContain("delivered@resend.dev");
    expect(json).toContain("Myrrh Rental Space");
    expect(json).toContain("2026-06-21 12:00 JST");
    expect(json).toContain("Admin User");
    expect(json).toContain("admin@example.com");
    expect(json).toContain("テスト送信");
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

```bash
bun run test:unit -- __tests__/unit/emails/test-email.test.tsx
```

期待: `Cannot find module`。

- [ ] **Step 3: `TestEmail` コンポーネント実装**

`src/shared/emails/test-email.tsx` 新規作成（house pattern完全準拠 — `reservation-confirmation.tsx` の構造を踏襲）:

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type Props = {
  recipientLabel: string;
  siteName: string;
  timestamp: string;
  triggeredByName: string;
  triggeredByEmail: string;
};

export function TestEmail({
  recipientLabel,
  siteName,
  timestamp,
  triggeredByName,
  triggeredByEmail,
}: Props) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>
        テスト送信 - {siteName}（{timestamp}）
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>テストメール</Heading>

          <Text style={text}>
            このメールは {siteName} のメール送信設定が正しく機能しているかを
            確認するためのテストメールです。実際の予約・通知・お知らせとは
            関係ありません。
          </Text>

          <Section style={detailsSection}>
            <Text style={detailsHeading}>送信情報</Text>
            <Hr style={hr} />
            <Text style={detailItem}>
              <strong>宛先:</strong> {recipientLabel}
            </Text>
            <Text style={detailItem}>
              <strong>送信日時:</strong> {timestamp}
            </Text>
            <Text style={detailItem}>
              <strong>送信操作者:</strong> {triggeredByName}（{triggeredByEmail}
              ）
            </Text>
          </Section>

          <Text style={text}>
            このメールが正しい宛先に届いていれば、送信元ドメイン・Reply-To・
            DNS（SPF / DKIM / DMARC）・Resend API の全段が正常に機能して
            います。届かない／迷惑メールフォルダに入る等の問題があれば、
            管理画面のメール設定および Resend ダッシュボードを確認してください。
          </Text>

          <Hr style={hr} />

          <Text style={footer}>{siteName}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default TestEmail;

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
};

const heading = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#1a1a1a",
  marginBottom: "24px",
};

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#484848",
};

const detailsSection = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsHeading = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#1a1a1a",
  marginBottom: "12px",
};

const detailItem = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#484848",
  margin: "8px 0",
};

const hr = {
  borderColor: "#e6e6e6",
  margin: "16px 0",
};

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};
```

- [ ] **Step 4: テスト緑確認**

```bash
bun run test:unit -- __tests__/unit/emails/test-email.test.tsx
```

期待: 全 PASS。

- [ ] **Step 5: コミット**

```bash
git add src/shared/emails/test-email.tsx __tests__/unit/emails/test-email.test.tsx
git commit -m "$(cat <<'EOF'
feat(emails): TestEmail React Email component を追加

管理画面のテスト送信機能用テンプレ。house pattern 完全準拠
（Html lang=ja / Head / Preview / Body / Container、system font、
#0066cc accent）。受信者・送信日時・送信操作者を表示し、
受信できれば送信元ドメイン・DNS・Resend 全段が機能している
ことを宛先で検証できる文面。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `sendTestEmail` lib wrapper

**Files:**

- Create: `src/shared/lib/email/test-email.ts`
- Test: `__tests__/unit/email/test-email-wrapper.test.ts` (new)

**Interfaces:**

- Consumes:
  - `sendEmail` from Task 1 — returns new `EmailResult`
  - `TestEmail` from Task 2 — React component
- Produces:

  ```ts
  export type SendTestEmailParams = {
    to: string;
    staffId: string;
    triggeredByEmail: string;
    triggeredByName: string;
    siteName: string;
    simulatorAddress: boolean;
  };
  export async function sendTestEmail(
    params: SendTestEmailParams,
  ): Promise<EmailResult>;
  ```

- [ ] **Step 1: 失敗テストを書く**

`__tests__/unit/email/test-email-wrapper.test.ts` 新規:

```ts
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSendEmail = mock<
  (params: {
    payload: {
      to: string;
      subject: string;
      react: unknown;
      tags?: { name: string; value: string }[];
      headers?: Record<string, string>;
    };
    idempotencyKey?: string;
    operation: string;
    context?: Record<string, unknown>;
  }) => Promise<
    | { ok: true; messageId: string }
    | { ok: false; reason: "disabled" }
    | { ok: false; reason: "error"; error: string }
  >
>(() => Promise.resolve({ ok: true, messageId: "re_test" }));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: mock((v: string) => v.slice(0, 16)),
}));

const { sendTestEmail } = await import("@/shared/lib/email/test-email");

describe("sendTestEmail", () => {
  beforeEach(() => mockSendEmail.mockClear());

  test("builds payload with to / subject / react / tags / headers", async () => {
    await sendTestEmail({
      to: "admin@example.com",
      staffId: "user-123",
      triggeredByEmail: "admin@example.com",
      triggeredByName: "Admin",
      siteName: "Myrrh",
      simulatorAddress: false,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.payload.to).toBe("admin@example.com");
    expect(call?.payload.subject).toContain("テスト送信");
    expect(call?.payload.react).toBeTruthy();
    expect(call?.payload.tags).toEqual([
      { name: "category", value: "test" },
      { name: "source", value: "admin_settings" },
    ]);
    expect(call?.payload.headers).toEqual({ "X-Test-Email": "true" });
  });

  test("idempotencyKey format: test-email/<staffId>/<ts>-<rnd6>", async () => {
    await sendTestEmail({
      to: "x@y.com",
      staffId: "user-abc",
      triggeredByEmail: "x@y.com",
      triggeredByName: "X",
      siteName: "Myrrh",
      simulatorAddress: true,
    });
    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.idempotencyKey).toMatch(
      /^test-email\/user-abc\/\d+-[a-f0-9]{6}$/,
    );
  });

  test("operation is settings.test_email_send and context carries simulatorAddress flag", async () => {
    await sendTestEmail({
      to: "bounced@resend.dev",
      staffId: "u",
      triggeredByEmail: "a@b.c",
      triggeredByName: "A",
      siteName: "S",
      simulatorAddress: true,
    });
    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.operation).toBe("settings.test_email_send");
    expect(call?.context).toEqual({
      recipient: "bounced@resend.dev",
      simulatorAddress: true,
    });
  });

  test("returns EmailResult from sendEmail untouched", async () => {
    mockSendEmail.mockResolvedValueOnce({ ok: false, reason: "disabled" });
    const r = await sendTestEmail({
      to: "x@y.com",
      staffId: "u",
      triggeredByEmail: "a@b.c",
      triggeredByName: "A",
      siteName: "S",
      simulatorAddress: false,
    });
    expect(r).toEqual({ ok: false, reason: "disabled" });
  });
});
```

- [ ] **Step 2: テスト失敗確認**

```bash
bun run test:unit -- __tests__/unit/email/test-email-wrapper.test.ts
```

期待: `Cannot find module`。

- [ ] **Step 3: `sendTestEmail` 実装**

`src/shared/lib/email/test-email.ts` 新規:

```ts
/**
 * テスト送信ラッパー（管理画面の「テスト送信」ボタンから呼ばれる）。
 *
 * Resend 公式推奨をフル適用:
 * - `react:` で React Email component を渡す（@react-email/render 不要）
 * - `tags` で本番トラフィックから分離（dashboard で category=test 抽出可）
 * - `headers["X-Test-Email"]` で受信側 grep 可
 * - per-click unique idempotencyKey で同一クリックの retry を吸収、連続クリックは別送信
 *
 * @module shared/lib/email/test-email
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { TestEmail } from "@/shared/emails/test-email";
import { sendEmail } from "./send";
import type { EmailResult } from "./types";

export type SendTestEmailParams = {
  to: string;
  staffId: string;
  triggeredByEmail: string;
  triggeredByName: string;
  siteName: string;
  simulatorAddress: boolean;
};

export async function sendTestEmail(
  params: SendTestEmailParams,
): Promise<EmailResult> {
  const {
    to,
    staffId,
    triggeredByEmail,
    triggeredByName,
    siteName,
    simulatorAddress,
  } = params;
  const now = new Date();
  const timestamp = formatJst(now);
  const ts = now.getTime();
  const rnd6 = randomUUID().replace(/-/g, "").slice(0, 6);

  return sendEmail({
    payload: {
      to,
      subject: `【${siteName}】テスト送信（${timestamp}）`,
      react: TestEmail({
        recipientLabel: to,
        siteName,
        timestamp,
        triggeredByName,
        triggeredByEmail,
      }),
      tags: [
        { name: "category", value: "test" },
        { name: "source", value: "admin_settings" },
      ],
      headers: { "X-Test-Email": "true" },
    },
    idempotencyKey: `test-email/${staffId}/${ts}-${rnd6}`,
    operation: "settings.test_email_send",
    context: { recipient: to, simulatorAddress },
  });
}

function formatJst(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
```

- [ ] **Step 4: テスト緑確認**

```bash
bun run test:unit -- __tests__/unit/email/test-email-wrapper.test.ts
```

期待: 全 PASS。

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/email/test-email.ts __tests__/unit/email/test-email-wrapper.test.ts
git commit -m "$(cat <<'EOF'
feat(email): sendTestEmail ラッパー追加（Resend 公式推奨フル適用）

react: で TestEmail component を渡し、tags（category=test /
source=admin_settings）・X-Test-Email ヘッダ・per-click unique
Idempotency-Key を組み立て sendEmail() を呼ぶ。

idempotencyKey 形式 test-email/<staffId>/<ms>-<rnd6> で同一クリックの
Server Action retry を吸収、連続クリックは別送信を保証。Resend
dashboard で test 送信を本番トラフィックから分離可能。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `sendTestEmailAction` Server Action + integration テスト

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/test-email.ts`
- Create: `__tests__/integration/actions/admin/test-email.test.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts`

**Interfaces:**

- Consumes:
  - `executeAdminMutationResult` from `@/admin/lib/admin-action`
  - `sendTestEmail` from Task 3
  - `validateSenderDomain` from `@/shared/lib/email/domain-verification`
  - `getEmailDeliverySettings` from `@/shared/domain/settings/queries/notification`
  - `authMutationRateLimiter` + `getClientIpFromHeaders` from `@/shared/lib/rate-limit`
- Produces:

  ```ts
  export async function sendTestEmailAction(
    recipient: string,
    options?: { simulatorAddress?: boolean },
  ): Promise<MutationResult<{ messageId: string }>>;
  ```

- [ ] **Step 1: integration テストを書く（失敗確認用）**

`__tests__/integration/actions/admin/test-email.test.ts` 新規。`coupon-bulk.test.ts` のパターンを踏襲:

```ts
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSendTestEmail = mock<
  (
    params: unknown,
  ) => Promise<
    | { ok: true; messageId: string }
    | { ok: false; reason: "disabled" }
    | { ok: false; reason: "error"; error: string }
  >
>(() => Promise.resolve({ ok: true, messageId: "re_default" }));

mock.module("@/shared/lib/email/test-email", () => ({
  sendTestEmail: mockSendTestEmail,
}));

const mockValidateSenderDomain = mock<
  (
    email: string,
  ) => Promise<{ ok: true } | { ok: false; verifiedDomains: string[] }>
>(() => Promise.resolve({ ok: true }));

mock.module("@/shared/lib/email/domain-verification", () => ({
  validateSenderDomain: mockValidateSenderDomain,
}));

const mockGetEmailDeliverySettings = mock(() =>
  Promise.resolve({
    senderEmail: "from@verified.com",
    senderName: "Site",
    replyToEmail: null,
  }),
);

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
}));

const mockGetBasicSettings = mock(() => Promise.resolve({ siteName: "Myrrh" }));

mock.module("@/shared/domain/settings/queries/basic", () => ({
  getBasicSettings: mockGetBasicSettings,
}));

const mockRateLimitCheck = mock<
  (ip: string) => Promise<{ allowed: boolean; remaining: number }>
>(() => Promise.resolve({ allowed: true, remaining: 19 }));

mock.module("@/shared/lib/rate-limit", () => ({
  authMutationRateLimiter: { check: mockRateLimitCheck },
  getClientIpFromHeaders: mock(() => Promise.resolve("1.2.3.4")),
}));

type ExecuteOpts<T> = {
  resource: string;
  action: string;
  execute: (user: {
    id: string;
    email: string;
    name: string;
    role: string;
  }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
};

const mockExecuteAdminMutationResult = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string; code?: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  try {
    const data = await opts.execute({
      id: "admin-user-id",
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN",
    });
    if (opts.afterSuccess) await opts.afterSuccess(data);
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return { error: msg };
  }
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecuteAdminMutationResult,
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock(() => {}),
}));

const { sendTestEmailAction } =
  await import("@/admin/actions/settings/test-email");
const { isMutationError } = await import("@/shared/lib/mutation-result");

describe("sendTestEmailAction", () => {
  beforeEach(() => {
    mockSendTestEmail.mockClear();
    mockValidateSenderDomain.mockClear();
    mockGetEmailDeliverySettings.mockClear();
    mockRateLimitCheck.mockClear();
    mockExecuteAdminMutationResult.mockClear();

    mockSendTestEmail.mockResolvedValue({ ok: true, messageId: "re_ok" });
    mockValidateSenderDomain.mockResolvedValue({ ok: true });
    mockRateLimitCheck.mockResolvedValue({ allowed: true, remaining: 19 });
  });

  test("invalid email → MutationError, sendTestEmail not called", async () => {
    const r = await sendTestEmailAction("not-an-email");
    expect(isMutationError(r)).toBe(true);
    expect(mockSendTestEmail).not.toHaveBeenCalled();
  });

  test("rate-limit exceeded → MutationError 'too many requests'", async () => {
    mockRateLimitCheck.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const r = await sendTestEmailAction("admin@example.com");
    expect(isMutationError(r)).toBe(true);
    expect(mockSendTestEmail).not.toHaveBeenCalled();
  });

  test("sender domain unverified → MutationError, sendTestEmail not called", async () => {
    mockValidateSenderDomain.mockResolvedValueOnce({
      ok: false,
      verifiedDomains: ["other.com"],
    });
    const r = await sendTestEmailAction("admin@example.com");
    expect(isMutationError(r)).toBe(true);
    if (isMutationError(r)) expect(r.error).toContain("検証");
    expect(mockSendTestEmail).not.toHaveBeenCalled();
  });

  test("happy path returns { messageId }", async () => {
    mockSendTestEmail.mockResolvedValueOnce({
      ok: true,
      messageId: "re_happy",
    });
    const r = await sendTestEmailAction("admin@example.com");
    expect(isMutationError(r)).toBe(false);
    if (!isMutationError(r)) expect(r.messageId).toBe("re_happy");
    expect(mockSendTestEmail).toHaveBeenCalledTimes(1);
  });

  test("simulator address passes simulatorAddress=true to wrapper", async () => {
    await sendTestEmailAction("delivered@resend.dev", {
      simulatorAddress: true,
    });
    const call = mockSendTestEmail.mock.calls[0]?.[0] as {
      simulatorAddress: boolean;
    };
    expect(call.simulatorAddress).toBe(true);
  });

  test("non-simulator address passes simulatorAddress=false", async () => {
    await sendTestEmailAction("admin@example.com");
    const call = mockSendTestEmail.mock.calls[0]?.[0] as {
      simulatorAddress: boolean;
    };
    expect(call.simulatorAddress).toBe(false);
  });

  test("Resend disabled → MutationError 'メール送信が無効'", async () => {
    mockSendTestEmail.mockResolvedValueOnce({ ok: false, reason: "disabled" });
    const r = await sendTestEmailAction("admin@example.com");
    expect(isMutationError(r)).toBe(true);
    if (isMutationError(r)) expect(r.error).toContain("無効");
  });

  test("Resend API error → MutationError carries error message", async () => {
    mockSendTestEmail.mockResolvedValueOnce({
      ok: false,
      reason: "error",
      error: "メール送信に失敗しました",
    });
    const r = await sendTestEmailAction("admin@example.com");
    expect(isMutationError(r)).toBe(true);
    if (isMutationError(r)) expect(r.error).toBe("メール送信に失敗しました");
  });

  test("RBAC resource/action set to settings/update", async () => {
    await sendTestEmailAction("admin@example.com");
    const opts = mockExecuteAdminMutationResult.mock.calls[0]?.[0];
    expect(opts?.resource).toBe("settings");
    expect(opts?.action).toBe("update");
  });
});
```

- [ ] **Step 2: テスト失敗確認**

```bash
bun run test:integration -- __tests__/integration/actions/admin/test-email.test.ts
```

期待: `Cannot find module "@/admin/actions/settings/test-email"`。

- [ ] **Step 3: Server Action 実装**

`src/app/(admin)/admin/(dashboard)/_shared/actions/settings/test-email.ts` 新規:

```ts
"use server";

/**
 * テスト送信 Server Action（メール設定の動作確認）
 *
 * Resend 公式推奨フル適用（React Email / tags / headers /
 * Idempotency-Key / simulator addresses）+ 既存 settings 保存と
 * 同じ domain gate で送信前検証する。
 *
 * @module admin/actions/settings/test-email
 */

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { DomainError } from "@/shared/domain/domain-error";
import {
  type MutationResult,
  createValidationMutationError,
} from "@/shared/lib/mutation-result";
import { validateSenderDomain } from "@/shared/lib/email/domain-verification";
import { sendTestEmail } from "@/shared/lib/email/test-email";
import { getEmailDeliverySettings } from "@/shared/domain/settings/queries/notification";
import { getBasicSettings } from "@/shared/domain/settings/queries/basic";
import {
  authMutationRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";

const SIMULATOR_DOMAINS: ReadonlySet<string> = new Set(["resend.dev"]);

const recipientSchema = z
  .email({ error: "有効なメールアドレスを入力してください" })
  .max(100, { error: "メールアドレスは 100 文字以内で入力してください" });

export async function sendTestEmailAction(
  recipient: string,
  options?: { simulatorAddress?: boolean },
): Promise<MutationResult<{ messageId: string }>> {
  const parsed = recipientSchema.safeParse(recipient);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }
  const to = parsed.data;
  const isSimulator =
    options?.simulatorAddress ??
    SIMULATOR_DOMAINS.has(to.split("@")[1]?.toLowerCase() ?? "");

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async (user) => {
      // 1. rate-limit（IP 単位、authMutationRateLimiter: 20/15min）
      const ip = await getClientIpFromHeaders();
      const limit = await authMutationRateLimiter.check(ip);
      if (!limit.allowed) {
        throw new DomainError(
          "リクエストが多すぎます。しばらくしてからお試しください",
          "VALIDATION",
        );
      }

      // 2. sender domain gate（settings 保存と同 SSoT）
      const delivery = await getEmailDeliverySettings();
      if (delivery.senderEmail) {
        const check = await validateSenderDomain(delivery.senderEmail);
        if (!check.ok) {
          const list =
            check.verifiedDomains.length > 0
              ? check.verifiedDomains.join(", ")
              : "（検証済みドメインがありません）";
          throw new DomainError(
            `送信元アドレスのドメインが Resend で検証されていません。検証済みドメイン: ${list}`,
            "VALIDATION",
          );
        }
      }

      // 3. siteName を解決して sendTestEmail を呼ぶ
      const basic = await getBasicSettings();
      const result = await sendTestEmail({
        to,
        staffId: user.id,
        triggeredByEmail: user.email,
        triggeredByName: user.name ?? user.email,
        siteName: basic?.siteName ?? "Myrrh Rental Space",
        simulatorAddress: isSimulator,
      });

      if (!result.ok) {
        if (result.reason === "disabled") {
          throw new DomainError(
            "メール送信が無効です（RESEND_API_KEY が設定されていません）",
            "VALIDATION",
          );
        }
        throw new DomainError(result.error, "EXTERNAL");
      }

      return { messageId: result.messageId };
    },
  });
}
```

- [ ] **Step 4: `index.ts` に export 追加**

`src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts` の Email Actions セクションに追記（既存 `updateEmailSettings` の export の隣に）:

```ts
// =============================================================================
// Email Test Action
// =============================================================================

export { sendTestEmailAction } from "./test-email";
```

> 注: 既存 `index.ts` の export 構造を破壊せず、末尾 or Email セクションに 1 行追加するだけ。

- [ ] **Step 5: テスト緑確認**

```bash
bun run test:integration -- __tests__/integration/actions/admin/test-email.test.ts
```

期待: 全 9 ケース PASS。

- [ ] **Step 6: 型 + lint 確認**

```bash
bun run validate
```

期待: 全 PASS。

- [ ] **Step 7: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/test-email.ts" "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts" __tests__/integration/actions/admin/test-email.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): sendTestEmailAction Server Action 追加

executeAdminMutationResult で auth/RBAC/audit を取り、rate-limit
(authMutationRateLimiter 20/15min)・validateSenderDomain hard gate・
DomainError 経由のエラー UI 統合まで実装。settings:update を再利用
し新規 RBAC entry なし。

simulator address 判定（@resend.dev）を入力ドメインから推定し、
audit metadata と sendTestEmail への context に伝播。

integration テスト 9 ケース（invalid email / rate-limit /
domain ungate / happy path / simulator / non-simulator / disabled /
Resend error / RBAC slot）全 PASS。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `TestEmailCard` UI コンポーネント

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/TestEmailCard.tsx`

**Interfaces:**

- Consumes:
  - `sendTestEmailAction` from Task 4
  - `StatusBanner` from `../shared/StatusBanner`
  - `isMutationError` from `@/shared/lib/mutation-result`
  - shadcn UI: `Card / CardHeader / CardTitle / CardDescription / CardContent / Input / Button / Label`
- Produces:

  ```tsx
  type TestEmailCardProps = { defaultRecipient: string };
  export function TestEmailCard(props: TestEmailCardProps): ReactElement;
  ```

- [ ] **Step 1: UI コンポーネント実装（ResendSection の useTransition + isMutationError パターンを踏襲）**

`src/app/(admin)/admin/(dashboard)/settings/_components/sections/TestEmailCard.tsx` 新規:

```tsx
"use client";

/**
 * テスト送信カード（メール設定の動作確認）
 *
 * useTransition + sendTestEmailAction を直接呼ぶ単発 button パターン。
 * conform form を介さない（ResendSection の接続テストと同型）。
 */

import { useState, useTransition, useId } from "react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { isMutationError } from "@/shared/lib/mutation-result";
import { sendTestEmailAction } from "@/admin/actions/settings";
import { StatusBanner } from "../shared/StatusBanner";

type SimulatorOption = {
  value: string;
  label: string;
};

const SIMULATOR_OPTIONS: readonly SimulatorOption[] = [
  { value: "delivered@resend.dev", label: "delivered@resend.dev — 配信成功" },
  { value: "bounced@resend.dev", label: "bounced@resend.dev — バウンス" },
  { value: "complained@resend.dev", label: "complained@resend.dev — 苦情" },
  { value: "suppressed@resend.dev", label: "suppressed@resend.dev — 配信抑制" },
] as const;

type TestEmailCardProps = {
  defaultRecipient: string;
};

export function TestEmailCard({ defaultRecipient }: TestEmailCardProps) {
  const recipientId = useId();
  const simulatorId = useId();
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [simulatorValue, setSimulatorValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { success: true; messageId: string }
    | { success: false; message: string }
    | null
  >(null);

  const isSimulator = simulatorValue !== "" && recipient === simulatorValue;

  const handleSimulatorChange = (value: string) => {
    setSimulatorValue(value);
    if (value !== "") {
      setRecipient(value);
      setResult(null);
    }
  };

  const handleRecipientChange = (value: string) => {
    setRecipient(value);
    if (value !== simulatorValue) setSimulatorValue("");
    setResult(null);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      setResult(null);
      const response = await sendTestEmailAction(recipient, {
        simulatorAddress: isSimulator,
      });
      if (isMutationError(response)) {
        setResult({ success: false, message: response.error });
        toast.error("テスト送信に失敗しました");
      } else {
        setResult({ success: true, messageId: response.messageId });
        toast.success("テスト送信しました");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>設定の動作確認（テスト送信）</CardTitle>
        <CardDescription>
          現在のメール設定でテストメールを送信し、送信元・Reply-To・Resend API
          連携が正しく機能しているかを確認します。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={recipientId}>宛先メールアドレス</Label>
          <Input
            id={recipientId}
            type="email"
            value={recipient}
            onChange={(e) => handleRecipientChange(e.target.value)}
            placeholder="admin@example.com"
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            自分のメールアドレスが初期値で入っています。受信箱で実際の到達を確認したい場合はそのまま、送信パイプラインだけ確認したい場合は下の
            simulator から選択してください。
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={simulatorId}>
            または Resend テスト用アドレスを使う
          </Label>
          <Select
            value={simulatorValue}
            onValueChange={handleSimulatorChange}
            disabled={pending}
          >
            <SelectTrigger id={simulatorId} className="w-full">
              <SelectValue placeholder="（選択なし）" />
            </SelectTrigger>
            <SelectContent>
              {SIMULATOR_OPTIONS.filter((opt) => opt.value !== "").map(
                (opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Resend 公式の simulator アドレス。実際の受信箱は使われず、Resend
            ダッシュボードでバウンス・苦情等の挙動を確認できます。
          </p>
        </div>

        {result && (
          <StatusBanner success={result.success}>
            {result.success ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-success">送信しました</p>
                <p className="text-xs text-muted-foreground">
                  送信 ID:{" "}
                  <code className="font-mono text-foreground">
                    {result.messageId || "(disabled mode)"}
                  </code>
                </p>
                <p className="text-xs text-muted-foreground">
                  受信箱を確認してください。simulator アドレスの場合は Resend
                  ダッシュボードで配信イベントを確認できます。
                </p>
              </div>
            ) : (
              <p className="text-sm text-destructive">{result.message}</p>
            )}
          </StatusBanner>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleSubmit}
            disabled={pending || recipient.length === 0}
          >
            {pending ? "送信中..." : "テスト送信"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: lint + type 確認**

```bash
bun run validate
```

期待: 全 PASS（React Compiler は useState ローカル state を許容）。

- [ ] **Step 3: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/settings/_components/sections/TestEmailCard.tsx"
git commit -m "$(cat <<'EOF'
feat(admin): TestEmailCard UI コンポーネント追加

メール設定タブに置く独立 Card。recipient input（admin email
prefill）+ Resend simulator dropdown + 送信ボタン + StatusBanner
で結果（messageId 表示 / エラー文言）を inline 表示。

ResendSection の接続テスト UI と同 pattern（useTransition +
isMutationError）。toast は成功・失敗どちらも併発し、
StatusBanner は inline 永続表示（messageId コピー用）。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: EmailSection と notifications/page.tsx で配線

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/EmailSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/notifications/page.tsx`

**Interfaces:**

- Consumes:
  - `TestEmailCard` from Task 5
  - `checkAdminAuth` from `@/admin/lib/action-auth`
- Produces:
  - `EmailSection` の props に `currentUserEmail: string` を追加

- [ ] **Step 1: EmailSection に prop 追加 + TestEmailCard 配置**

`src/app/(admin)/admin/(dashboard)/settings/_components/sections/EmailSection.tsx` の以下 2 箇所を編集:

(a) `EmailSectionProps` に `currentUserEmail` を追加（line 43-46）:

```ts
interface EmailSectionProps {
  settings: Serialized<SettingsData>;
  staff: StaffOption[];
  currentUserEmail: string;
}
```

(b) `EmailSection` 関数シグネチャを更新（line 76）:

```ts
export function EmailSection({
  settings,
  staff,
  currentUserEmail,
}: EmailSectionProps) {
```

(c) ファイル先頭の import 群に追加:

```ts
import { TestEmailCard } from "./TestEmailCard";
```

(d) `</form>` の **直後** に TestEmailCard を配置（既存の `</form>` は line 302 付近、その閉じタグの後に追加。新規外側ラッパー必要なら Fragment で囲む）:

return 文を以下に置換:

```tsx
return (
  <>
    <form {...getFormProps(form)} action={action}>
      {/* （既存の <Card>...</Card> 全文をそのまま中に保持） */}
    </form>
    <div className="mt-6">
      <TestEmailCard defaultRecipient={currentUserEmail} />
    </div>
  </>
);
```

> 注: 既存 `<Card>` ブロックは form 内のまま保持。TestEmailCard は form 外に独立配置（test 送信は form submit と独立した button action）。

- [ ] **Step 2: notifications/page.tsx で current admin email を取得して渡す**

`src/app/(admin)/admin/(dashboard)/settings/notifications/page.tsx` の `NotificationsSettingsContent()` を編集:

(a) import に追加:

```ts
import { checkAdminAuth } from "@/admin/lib/action-auth";
```

(b) 関数本体を以下に置換（auth 取得を Promise.all に統合）:

```ts
async function NotificationsSettingsContent(): Promise<ReactElement> {
  await connection();
  const [settings, staff, auth] = await Promise.all([
    getSettings(),
    getNotificationStaffCandidates(),
    checkAdminAuth(),
  ]);

  if (!settings || !auth.success) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        設定を読み込めませんでした
      </div>
    );
  }

  const tabs = [
    {
      value: "email",
      label: "メール",
      content: (
        <EmailSection
          settings={settings}
          staff={staff}
          currentUserEmail={auth.user.email}
        />
      ),
    },
    {
      value: "notification",
      label: "通知",
      content: <NotificationSection settings={settings} />,
    },
  ];

  return <SettingsTabs tabs={tabs} defaultTab="email" />;
}
```

- [ ] **Step 3: validate + build**

```bash
bun run validate && bun run build
```

期待: 型・lint・本番ビルド 全 PASS。

- [ ] **Step 4: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/settings/_components/sections/EmailSection.tsx" "src/app/(admin)/admin/(dashboard)/settings/notifications/page.tsx"
git commit -m "$(cat <<'EOF'
feat(admin): メール設定タブに TestEmailCard を配線

EmailSection の form 直後に TestEmailCard を配置（form 外の独立
Card、test 送信は form submit と独立した button action）。
notifications/page.tsx で checkAdminAuth() を Promise.all に
統合し、current admin の email を defaultRecipient として渡す。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 最終検証

**Files:**

- なし（実行のみ）

- [ ] **Step 1: 全テストスイート実行**

```bash
bun run test:unit
bun run test:integration
```

期待: 既存テスト + 新規 3 テストファイル（send-result / test-email / test-email-wrapper / test-email integration）全 PASS。

- [ ] **Step 2: type-check + lint + build**

```bash
bun run validate && bun run build
```

期待: 全 PASS。

- [ ] **Step 3: 手動 E2E チェックリスト（dev サーバ前提・spec §9.3 準拠）**

`bun run dev` で確認（dev サーバはユーザが手動管理）:

1. `/admin/settings/notifications` を開く → メール設定タブで Card 末尾に「設定の動作確認（テスト送信）」が表示される
2. recipient input が現在 admin の email で prefill されている
3. [テスト送信] クリック → 緑バナー + messageId 表示、自分の受信箱にテストメール到達
4. simulator dropdown から `bounced@resend.dev` 選択 → recipient 置換 → 送信 → 緑バナー、Resend dashboard で ~30s 以内に bounce event 観測
5. recipient を `not-an-email` に書き換えて送信 → 赤バナー（validation error）
6. 設定タブで送信元を未検証ドメインに変更し保存（availability-first で通る）→ テスト送信 → 赤バナー「検証済みドメイン: …」
7. [テスト送信] 25 回連続クリック → 21 回目以降赤バナー「リクエストが多すぎます」
8. ローカルで `RESEND_API_KEY` 未設定 → 赤バナー「メール送信が無効です」（false-green でない）
9. AuditLog 参照 → `resource=settings, action=UPDATE, userId=admin-user-id` 記録
10. [テスト送信] 連打 → 各クリックで異なる messageId（per-click idempotency）

- [ ] **Step 4: 完了報告**

PR description に以下を含める:

- 設計 spec へのリンク（`docs/superpowers/specs/2026-06-21-admin-test-email-send-design.md`）
- 実装 plan へのリンク（`docs/superpowers/plans/2026-06-21-admin-test-email-send.md`）
- BREAKING CHANGE 注記（`sendEmail()` 戻り値 refactor、9 caller 機械修正・1 cron site 追随）
- 「v2 候補」として `email.delivered` / `email.bounced` webhook 受信、本番テンプレ毎の preview 送信を flag
- Rate-limit が IP 単位（NAT 配下複数 admin で共有）の注意書き

---

## Self-Review チェック

**1. Spec coverage:**

- §4 Official Recommendations の 13 機能採否 → Task 3 (tags/headers/idempotency/react), Task 5 (simulator dropdown UI), Task 4 (validateSenderDomain gate / authMutationRateLimiter / audit) でカバー ✓
- §5 Architecture component diagram → Task 1-6 で完全実装 ✓
- §6 sendEmail refactor → Task 1 ✓
- §7 Files (5 add / 12 modify) → Task 1-6 で全網羅 ✓
- §8 UX (8 state) → Task 5 に全状態網羅 ✓
- §9 Test Plan (integration 9 / unit / E2E 10) → Task 4 integration / Task 1-3 unit / Task 7 E2E ✓
- §10 Risks → Task 1 で sendEmail refactor の安全弁、Task 3 で `randomUUID().slice(0,6)` 衝突低減実装、PR description に rate-limit 注意 ✓

**2. Placeholder scan:** "TBD" / "TODO" / "implement later" / 「適切なエラー処理」 → なし ✓

**3. Type consistency:**

- `EmailResult` shape: Task 1 で定義 → Task 3 (sendTestEmail return), Task 4 (sendTestEmailAction execute branch) で同形参照 ✓
- `SendTestEmailParams`: Task 3 で定義 → Task 4 で同形 call ✓
- `MutationResult<{ messageId: string }>`: Task 4 で定義 → Task 5 で `response.messageId` 参照 ✓
- `TestEmailCardProps.defaultRecipient`: Task 5 で定義 → Task 6 で同名渡し ✓
- `EmailSectionProps.currentUserEmail`: Task 6 で追加 → page.tsx から渡し ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-admin-test-email-send.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 私が fresh subagent を 1 task ずつ dispatch、各 task 間にレビュー、高速 iteration

**2. Inline Execution** - 本セッション内で executing-plans を使い batch 実行、チェックポイントごとにレビュー

**Which approach?**
