# Email Template Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面から 17 種のメールテンプレート（件名・挨拶・導入文・締め文）を編集可能にする。

**Architecture:** `EmailTemplate` Prisma モデル + Mustache 風変数差し込みエンジン + 型安全な変数レジストリ + 管理画面 CRUD。React Email 骨格はコード管理のまま、編集可能テキストのみ DB 管理する業界標準パターン（Shopify / WooCommerce 型）。

**Tech Stack:** Next.js 16 / React 19 + Compiler 1.0 / Prisma 7 / Zod 4 / React Email / Resend SDK v6 / TailwindCSS 4 / shadcn/ui / nuqs 2.8 / bun:test

**Spec:** `docs/superpowers/specs/2026-04-17-email-template-management.md`

---

## Phase 1: Schema + Seed + Domain Queries

### Task 1.1: Prisma Schema に EmailTemplate モデル追加

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: `prisma/schema.prisma` に Settings の直後に以下を追加**

```prisma
// ==============================================
// Email Template (メールテンプレート)
// ==============================================

model EmailTemplate {
  id        String   @id @default(uuid()) @db.Uuid
  type      String   @unique @db.VarChar(64) // EmailTemplateType の値
  subject   String   @db.VarChar(256)
  greeting  String   @db.VarChar(256)
  intro     String   @db.Text
  outro     String   @db.Text
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([type])
  @@map("email_templates")
}
```

- [ ] **Step 2: Settings モデルに 3 カラム追加**

`Settings` モデルの `// Email Settings` ブロック（`replyToEmail` の後）に以下を追加:

```prisma
  // Email Template Settings
  emailSubjectPrefix      String? @db.VarChar(32)
  emailFooterNote         String? @db.Text
  emailSupportContactText String? @db.Text
```

- [ ] **Step 3: migration 作成**

Run: `bunx --bun prisma migrate dev --name add_email_template --create-only`
Expected: `prisma/migrations/<timestamp>_add_email_template/migration.sql` が生成される

- [ ] **Step 4: migration.sql を目視レビュー**

Run: `cat prisma/migrations/*_add_email_template/migration.sql`
Expected:

- `CREATE TABLE "email_templates"` に `id`, `type`, `subject`, `greeting`, `intro`, `outro`, `enabled`, `createdAt`, `updatedAt` が含まれる
- `ALTER TABLE "Settings" ADD COLUMN "emailSubjectPrefix"`, `"emailFooterNote"`, `"emailSupportContactText"` が含まれる
- `CREATE UNIQUE INDEX "email_templates_type_key"` が含まれる

- [ ] **Step 5: migration 適用**

Run: `bunx --bun prisma migrate dev --name add_email_template`
Expected: `✔ Your database is now in sync with your schema.`

- [ ] **Step 6: Prisma Client 再生成**

Run: `bun run db:generate`
Expected: エラーなし。`generated/prisma/` 更新。

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add EmailTemplate model and Settings email columns"
```

---

### Task 1.2: EmailTemplateType enum 定数と型ガード

**Files:**

- Modify: `src/shared/lib/validations/enums/guards.ts`
- Modify: `src/shared/lib/validations/enums/helpers.ts`
- Test: `__tests__/unit/lib/validations/enums/email-template.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

Create `__tests__/unit/lib/validations/enums/email-template.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
  EMAIL_TEMPLATE_TYPE,
  EMAIL_TEMPLATE_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { isValidEmailTemplateType } from "@/shared/lib/validations/enums/guards";

describe("EMAIL_TEMPLATE_TYPE", () => {
  it("全 17 種の type が定義されている", () => {
    expect(Object.values(EMAIL_TEMPLATE_TYPE)).toHaveLength(17);
  });

  it("全 type に日本語ラベルが定義されている", () => {
    for (const type of Object.values(EMAIL_TEMPLATE_TYPE)) {
      expect(EMAIL_TEMPLATE_TYPE_LABELS[type]).toBeDefined();
      expect(EMAIL_TEMPLATE_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
  });
});

describe("isValidEmailTemplateType", () => {
  it("有効な type を true にする", () => {
    expect(isValidEmailTemplateType("reservation_confirmation")).toBe(true);
    expect(isValidEmailTemplateType("welcome")).toBe(true);
  });

  it("無効な値を false にする", () => {
    expect(isValidEmailTemplateType("invalid")).toBe(false);
    expect(isValidEmailTemplateType("")).toBe(false);
    expect(isValidEmailTemplateType(null)).toBe(false);
    expect(isValidEmailTemplateType(123)).toBe(false);
  });
});
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `bun test __tests__/unit/lib/validations/enums/email-template.test.ts`
Expected: FAIL（EMAIL_TEMPLATE_TYPE / isValidEmailTemplateType が未定義）

- [ ] **Step 3: `helpers.ts` に EMAIL_TEMPLATE_TYPE と LABELS を追加**

`src/shared/lib/validations/enums/helpers.ts` の末尾付近に以下を追加:

```typescript
export const EMAIL_TEMPLATE_TYPE = {
  RESERVATION_CONFIRMATION: "reservation_confirmation",
  RESERVATION_CANCELLED: "reservation_cancelled",
  RESERVATION_STATUS_CHANGED: "reservation_status_changed",
  RESERVATION_REMINDER: "reservation_reminder",
  RESERVATION_UPDATED: "reservation_updated",
  ADMIN_NOTIFICATION: "admin_notification",
  EVENT_REGISTRATION_CONFIRMATION: "event_registration_confirmation",
  EVENT_REGISTRATION_CANCELLED: "event_registration_cancelled",
  EVENT_ADMIN_NOTIFICATION: "event_admin_notification",
  EVENT_CANCELLED_NOTIFICATION: "event_cancelled_notification",
  EVENT_UPDATED_NOTIFICATION: "event_updated_notification",
  CONTACT_CONFIRMATION: "contact_confirmation",
  INQUIRY_REPLY: "inquiry_reply",
  REVIEW_REPLY: "review_reply",
  WELCOME: "welcome",
  PASSWORD_RESET: "password_reset",
  STAFF_INVITATION: "staff_invitation",
} as const;

export type EmailTemplateType =
  (typeof EMAIL_TEMPLATE_TYPE)[keyof typeof EMAIL_TEMPLATE_TYPE];

export const EMAIL_TEMPLATE_TYPE_LABELS: Record<EmailTemplateType, string> = {
  reservation_confirmation: "予約確認",
  reservation_cancelled: "予約キャンセル",
  reservation_status_changed: "予約ステータス変更",
  reservation_reminder: "予約リマインダー",
  reservation_updated: "予約内容変更",
  admin_notification: "管理者通知（予約）",
  event_registration_confirmation: "イベント申込確認",
  event_registration_cancelled: "イベント申込キャンセル",
  event_admin_notification: "管理者通知（イベント申込）",
  event_cancelled_notification: "イベント中止通知",
  event_updated_notification: "イベント変更通知",
  contact_confirmation: "お問い合わせ受付",
  inquiry_reply: "お問い合わせ返信",
  review_reply: "レビュー返信",
  welcome: "ウェルカム",
  password_reset: "パスワードリセット",
  staff_invitation: "スタッフ招待",
};
```

- [ ] **Step 4: `guards.ts` に isValidEmailTemplateType を追加**

`src/shared/lib/validations/enums/guards.ts` の末尾付近に以下を追加（既存の NOTIFICATION_TYPE パターンに倣う）:

```typescript
import { EMAIL_TEMPLATE_TYPE } from "./helpers";
import type { EmailTemplateType } from "./helpers";

const VALID_EMAIL_TEMPLATE_TYPES = new Set<string>(
  Object.values(EMAIL_TEMPLATE_TYPE),
);

export function isValidEmailTemplateType(
  value: unknown,
): value is EmailTemplateType {
  return typeof value === "string" && VALID_EMAIL_TEMPLATE_TYPES.has(value);
}
```

- [ ] **Step 5: テスト再実行**

Run: `bun test __tests__/unit/lib/validations/enums/email-template.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/validations/enums/ __tests__/unit/lib/validations/enums/
git commit -m "feat(enums): add EMAIL_TEMPLATE_TYPE constants, labels, and type guard"
```

---

### Task 1.3: CACHE_TAGS に EMAIL_TEMPLATES を追加

**Files:**

- Modify: `src/shared/lib/constants/cache.ts`

- [ ] **Step 1: `CACHE_TAGS` に追加**

`CACHE_TAGS` オブジェクトに以下を追加（既存のアルファベット順に挿入）:

```typescript
  EMAIL_TEMPLATES: "email-templates",
```

- [ ] **Step 2: `getCacheTag` に階層タグヘルパー追加**

```typescript
  emailTemplates: {
    detail: (type: string) => `email-templates-${type}`,
  },
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/constants/cache.ts
git commit -m "feat(cache): add EMAIL_TEMPLATES cache tag"
```

---

### Task 1.4: Domain Queries (getEmailTemplate)

**Files:**

- Create: `src/shared/domain/email-templates/types.ts`
- Create: `src/shared/domain/email-templates/queries.ts`

- [ ] **Step 1: 型定義作成**

Create `src/shared/domain/email-templates/types.ts`:

```typescript
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";

export type EmailTemplate = {
  id: string;
  type: EmailTemplateType;
  subject: string;
  greeting: string;
  intro: string;
  outro: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmailTemplateUpdate = {
  subject: string;
  greeting: string;
  intro: string;
  outro: string;
  enabled: boolean;
};
```

- [ ] **Step 2: queries.ts 作成**

Create `src/shared/domain/email-templates/queries.ts`:

```typescript
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainObject, toPlainArray } from "@/shared/lib/serialize";
import { isValidEmailTemplateType } from "@/shared/lib/validations/enums/guards";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";
import type { EmailTemplate } from "./types";

const EMAIL_TEMPLATE_SELECT = {
  id: true,
  type: true,
  subject: true,
  greeting: true,
  intro: true,
  outro: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toEmailTemplate(
  record: {
    id: string;
    type: string;
    subject: string;
    greeting: string;
    intro: string;
    outro: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null,
): EmailTemplate | null {
  if (!record) return null;
  if (!isValidEmailTemplateType(record.type)) return null;
  return toPlainObject({
    ...record,
    type: record.type,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export async function getEmailTemplate(
  type: EmailTemplateType,
): Promise<EmailTemplate | null> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.EMAIL_TEMPLATES, getCacheTag.emailTemplates.detail(type));

  const result = await safeFetch({
    fetch: () =>
      prisma.emailTemplate.findUnique({
        where: { type },
        select: EMAIL_TEMPLATE_SELECT,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    operationName: "getEmailTemplate",
  });

  return toEmailTemplate(result);
}

export async function getAllEmailTemplates(): Promise<EmailTemplate[]> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.EMAIL_TEMPLATES);

  const result = await safeFetch({
    fetch: () =>
      prisma.emailTemplate.findMany({
        select: EMAIL_TEMPLATE_SELECT,
        orderBy: { type: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    operationName: "getAllEmailTemplates",
  });

  return toPlainArray(
    result
      .map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }))
      .filter((r) => isValidEmailTemplateType(r.type)),
  ) as EmailTemplate[];
}
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/shared/domain/email-templates/
git commit -m "feat(domain): add email-templates queries with cache"
```

---

### Task 1.5: Domain Commands (updateEmailTemplate / toggleEnabled)

**Files:**

- Create: `src/shared/domain/email-templates/commands.ts`

- [ ] **Step 1: commands.ts 作成**

Create `src/shared/domain/email-templates/commands.ts`:

```typescript
import "server-only";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/lib/errors/domain-error";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";
import type { EmailTemplateUpdate } from "./types";

export async function updateEmailTemplateCommand(
  type: EmailTemplateType,
  input: EmailTemplateUpdate,
): Promise<{ id: string }> {
  const existing = await prisma.emailTemplate.findUnique({
    where: { type },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError(
      "NOT_FOUND",
      `メールテンプレートが見つかりません: ${type}`,
    );
  }

  await prisma.emailTemplate.update({
    where: { type },
    data: {
      subject: input.subject,
      greeting: input.greeting,
      intro: input.intro,
      outro: input.outro,
      enabled: input.enabled,
    },
  });

  return { id: existing.id };
}

export async function toggleEmailTemplateEnabledCommand(
  type: EmailTemplateType,
  enabled: boolean,
): Promise<{ id: string }> {
  const existing = await prisma.emailTemplate.findUnique({
    where: { type },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError(
      "NOT_FOUND",
      `メールテンプレートが見つかりません: ${type}`,
    );
  }

  await prisma.emailTemplate.update({
    where: { type },
    data: { enabled },
  });

  return { id: existing.id };
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/shared/domain/email-templates/
git commit -m "feat(domain): add email-templates commands (update, toggleEnabled)"
```

---

## Phase 2: Variables Engine + Template Registry

### Task 2.1: renderTemplate 変数差し込みエンジン

**Files:**

- Create: `src/shared/lib/email/variables.ts`
- Test: `__tests__/unit/lib/email/variables.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

Create `__tests__/unit/lib/email/variables.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { renderTemplate } from "@/shared/lib/email/variables";

describe("renderTemplate", () => {
  it("単純な変数を置換する", () => {
    expect(renderTemplate("Hello {{name}}", { name: "山田" })).toBe(
      "Hello 山田",
    );
  });

  it("複数の変数を置換する", () => {
    expect(renderTemplate("{{a}} and {{b}}", { a: "foo", b: "bar" })).toBe(
      "foo and bar",
    );
  });

  it("同じ変数を複数回置換する", () => {
    expect(renderTemplate("{{x}} {{x}} {{x}}", { x: "Hi" })).toBe("Hi Hi Hi");
  });

  it("未定義の変数は空文字に置換する", () => {
    expect(renderTemplate("Hello {{unknown}}", {})).toBe("Hello ");
  });

  it("変数なしの文字列はそのまま返す", () => {
    expect(renderTemplate("plain text", { x: "y" })).toBe("plain text");
  });

  it("空白を含む placeholder も認識する", () => {
    expect(renderTemplate("{{ name }}", { name: "山田" })).toBe("山田");
  });

  it("ネスト placeholder は literal 扱い", () => {
    expect(
      renderTemplate("{{a.b}}", { "a.b": "nested" } as Record<string, string>),
    ).toBe("nested");
    expect(renderTemplate("{{a.b}}", { a: "x" })).toBe("");
  });

  it("特殊文字を含む値も安全に置換する", () => {
    expect(renderTemplate("{{x}}", { x: "<script>" })).toBe("<script>");
  });

  it("空文字列値は空文字として置換する", () => {
    expect(renderTemplate("Hello {{x}}!", { x: "" })).toBe("Hello !");
  });
});
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `bun test __tests__/unit/lib/email/variables.test.ts`
Expected: FAIL（renderTemplate が未定義）

- [ ] **Step 3: variables.ts 作成**

Create `src/shared/lib/email/variables.ts`:

```typescript
/**
 * メールテンプレートの変数差し込みエンジン
 *
 * Mustache 風の {{placeholder}} 形式で変数を置換する。
 * HTML エスケープは行わない（呼び出し側の React Email / Resend が処理する）。
 */

const PLACEHOLDER_PATTERN = /\{\{\s*([^}\s]+)\s*\}\}/g;

export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
    const value = variables[key];
    return value ?? "";
  });
}

export function extractPlaceholders(template: string): string[] {
  const matches = Array.from(template.matchAll(PLACEHOLDER_PATTERN));
  return Array.from(new Set(matches.map((m) => m[1] ?? "")));
}
```

- [ ] **Step 4: テスト再実行**

Run: `bun test __tests__/unit/lib/email/variables.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/email/variables.ts __tests__/unit/lib/email/variables.test.ts
git commit -m "feat(email): add renderTemplate variable substitution engine"
```

---

### Task 2.2: Template Registry (型安全な変数マップ)

**Files:**

- Create: `src/shared/lib/email/template-registry.ts`
- Test: `__tests__/unit/lib/email/template-registry.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

Create `__tests__/unit/lib/email/template-registry.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
  EMAIL_TEMPLATE_VARIABLES,
  getTemplateVariables,
} from "@/shared/lib/email/template-registry";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";

describe("EMAIL_TEMPLATE_VARIABLES", () => {
  it("全 17 種の type に変数リストが定義されている", () => {
    for (const type of Object.values(EMAIL_TEMPLATE_TYPE)) {
      expect(EMAIL_TEMPLATE_VARIABLES[type]).toBeDefined();
      expect(Array.isArray(EMAIL_TEMPLATE_VARIABLES[type])).toBe(true);
      expect(EMAIL_TEMPLATE_VARIABLES[type].length).toBeGreaterThan(0);
    }
  });

  it("変数定義には name と description が含まれる", () => {
    const variables =
      EMAIL_TEMPLATE_VARIABLES[EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION];
    for (const v of variables) {
      expect(v.name).toBeDefined();
      expect(v.description).toBeDefined();
    }
  });
});

describe("getTemplateVariables", () => {
  it("指定 type の変数リストを返す", () => {
    const vars = getTemplateVariables(
      EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION,
    );
    const names = vars.map((v) => v.name);
    expect(names).toContain("customerName");
    expect(names).toContain("spaceName");
    expect(names).toContain("totalPrice");
  });
});
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `bun test __tests__/unit/lib/email/template-registry.test.ts`
Expected: FAIL

- [ ] **Step 3: template-registry.ts 作成**

Create `src/shared/lib/email/template-registry.ts`:

```typescript
/**
 * メールテンプレート変数レジストリ
 *
 * 各 EmailTemplateType で使える変数を型安全に定義。
 * 管理画面の「利用可能な変数」ヘルプ表示とランタイムバリデーションに使用。
 */

import {
  EMAIL_TEMPLATE_TYPE,
  type EmailTemplateType,
} from "@/shared/lib/validations/enums/helpers";

export type TemplateVariable = {
  name: string;
  description: string;
  example: string;
};

type VariableMap = Record<EmailTemplateType, readonly TemplateVariable[]>;

const COMMON_RESERVATION: readonly TemplateVariable[] = [
  { name: "customerName", description: "お客様名", example: "山田 太郎" },
  { name: "spaceName", description: "スペース名", example: "渋谷会議室A" },
  {
    name: "reservationDate",
    description: "予約日",
    example: "2026年4月17日 (金曜日)",
  },
  { name: "startTime", description: "開始時刻", example: "14:00" },
  { name: "endTime", description: "終了時刻", example: "16:00" },
  { name: "reservationId", description: "予約ID（短縮）", example: "A1B2C3D4" },
];

const COMMON_EVENT: readonly TemplateVariable[] = [
  { name: "customerName", description: "お客様名", example: "山田 太郎" },
  { name: "eventTitle", description: "イベント名", example: "春の交流会" },
  {
    name: "eventDate",
    description: "開催日",
    example: "2026年5月1日 (金曜日)",
  },
];

export const EMAIL_TEMPLATE_VARIABLES: VariableMap = {
  [EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION]: [
    ...COMMON_RESERVATION,
    { name: "totalPrice", description: "合計金額", example: "¥10,000" },
    { name: "notes", description: "備考", example: "配膳準備あり" },
  ],
  [EMAIL_TEMPLATE_TYPE.RESERVATION_CANCELLED]: COMMON_RESERVATION,
  [EMAIL_TEMPLATE_TYPE.RESERVATION_STATUS_CHANGED]: [
    ...COMMON_RESERVATION,
    { name: "previousStatus", description: "旧ステータス", example: "確認中" },
    { name: "newStatus", description: "新ステータス", example: "確定" },
    { name: "action", description: "アクション名", example: "確定しました" },
  ],
  [EMAIL_TEMPLATE_TYPE.RESERVATION_REMINDER]: COMMON_RESERVATION,
  [EMAIL_TEMPLATE_TYPE.RESERVATION_UPDATED]: COMMON_RESERVATION,
  [EMAIL_TEMPLATE_TYPE.ADMIN_NOTIFICATION]: [
    ...COMMON_RESERVATION,
    {
      name: "customerEmail",
      description: "お客様メール",
      example: "customer@example.com",
    },
    { name: "totalPrice", description: "合計金額", example: "¥10,000" },
    {
      name: "adminUrl",
      description: "管理画面URL",
      example: "https://example.com/admin/reservations/...",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.EVENT_REGISTRATION_CONFIRMATION]: [
    ...COMMON_EVENT,
    { name: "startTime", description: "開始時刻", example: "14:00" },
    { name: "endTime", description: "終了時刻", example: "16:00" },
    { name: "location", description: "開催場所", example: "渋谷会議室A" },
    { name: "registrationId", description: "申込ID", example: "E1F2G3H4" },
  ],
  [EMAIL_TEMPLATE_TYPE.EVENT_REGISTRATION_CANCELLED]: [
    ...COMMON_EVENT,
    { name: "registrationId", description: "申込ID", example: "E1F2G3H4" },
  ],
  [EMAIL_TEMPLATE_TYPE.EVENT_ADMIN_NOTIFICATION]: [
    ...COMMON_EVENT,
    {
      name: "customerEmail",
      description: "お客様メール",
      example: "customer@example.com",
    },
    { name: "registrationId", description: "申込ID", example: "E1F2G3H4" },
    {
      name: "adminUrl",
      description: "管理画面URL",
      example: "https://example.com/admin/events/...",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.EVENT_CANCELLED_NOTIFICATION]: [
    ...COMMON_EVENT,
    { name: "reason", description: "中止理由", example: "やむを得ない事情" },
  ],
  [EMAIL_TEMPLATE_TYPE.EVENT_UPDATED_NOTIFICATION]: [
    ...COMMON_EVENT,
    { name: "startTime", description: "開始時刻", example: "14:00" },
    { name: "endTime", description: "終了時刻", example: "16:00" },
    { name: "location", description: "開催場所", example: "渋谷会議室A" },
    {
      name: "changeSummary",
      description: "変更内容",
      example: "開催時刻が変更されました",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.CONTACT_CONFIRMATION]: [
    { name: "customerName", description: "お客様名", example: "山田 太郎" },
    {
      name: "inquirySubject",
      description: "お問い合わせ件名",
      example: "スペース利用について",
    },
    { name: "inquiryId", description: "お問い合わせID", example: "I1J2K3L4" },
  ],
  [EMAIL_TEMPLATE_TYPE.INQUIRY_REPLY]: [
    { name: "customerName", description: "お客様名", example: "山田 太郎" },
    {
      name: "inquirySubject",
      description: "お問い合わせ件名",
      example: "スペース利用について",
    },
    {
      name: "replyMessage",
      description: "返信本文",
      example: "ご質問ありがとうございます...",
    },
    { name: "inquiryId", description: "お問い合わせID", example: "I1J2K3L4" },
  ],
  [EMAIL_TEMPLATE_TYPE.REVIEW_REPLY]: [
    { name: "customerName", description: "お客様名", example: "山田 太郎" },
    { name: "spaceName", description: "スペース名", example: "渋谷会議室A" },
    { name: "reviewRating", description: "評価", example: "5" },
    {
      name: "reviewComment",
      description: "レビューコメント",
      example: "とても快適でした",
    },
    {
      name: "replyMessage",
      description: "返信本文",
      example: "嬉しいお言葉ありがとうございます",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.WELCOME]: [
    { name: "customerName", description: "お客様名", example: "山田 太郎" },
    {
      name: "loginUrl",
      description: "ログインURL",
      example: "https://example.com/login",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.PASSWORD_RESET]: [
    { name: "customerName", description: "お客様名", example: "山田 太郎" },
    {
      name: "resetUrl",
      description: "リセットURL",
      example: "https://example.com/reset?token=...",
    },
    {
      name: "expiresInHours",
      description: "有効時間（時間）",
      example: "24",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.STAFF_INVITATION]: [
    { name: "inviterName", description: "招待者名", example: "管理者" },
    { name: "role", description: "ロール", example: "編集者" },
    {
      name: "invitationUrl",
      description: "招待URL",
      example: "https://example.com/invite?token=...",
    },
    {
      name: "expiresAt",
      description: "有効期限",
      example: "2026年4月24日 23:59",
    },
  ],
};

export function getTemplateVariables(
  type: EmailTemplateType,
): readonly TemplateVariable[] {
  return EMAIL_TEMPLATE_VARIABLES[type];
}
```

- [ ] **Step 4: テスト再実行**

Run: `bun test __tests__/unit/lib/email/template-registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/email/template-registry.ts __tests__/unit/lib/email/template-registry.test.ts
git commit -m "feat(email): add template variable registry"
```

---

### Task 2.3: Zod スキーマ定義

**Files:**

- Create: `src/shared/lib/validations/email-template.ts`

- [ ] **Step 1: スキーマ作成**

Create `src/shared/lib/validations/email-template.ts`:

```typescript
import { z } from "zod";

export const emailTemplateFormSchema = z.object({
  subject: z
    .string()
    .min(1, { error: "件名は必須です" })
    .max(256, { error: "件名は 256 文字以内で入力してください" }),
  greeting: z
    .string()
    .min(1, { error: "挨拶文は必須です" })
    .max(256, { error: "挨拶文は 256 文字以内で入力してください" }),
  intro: z
    .string()
    .min(1, { error: "導入文は必須です" })
    .max(4000, { error: "導入文は 4000 文字以内で入力してください" }),
  outro: z
    .string()
    .min(1, { error: "締め文は必須です" })
    .max(4000, { error: "締め文は 4000 文字以内で入力してください" }),
  enabled: z.boolean(),
});

export type EmailTemplateFormInput = z.infer<typeof emailTemplateFormSchema>;

export const sendTestEmailSchema = z.object({
  type: z.string().min(1),
  subject: z.string().min(1).max(256),
  greeting: z.string().min(1).max(256),
  intro: z.string().min(1).max(4000),
  outro: z.string().min(1).max(4000),
});

export type SendTestEmailInput = z.infer<typeof sendTestEmailSchema>;
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/validations/email-template.ts
git commit -m "feat(validation): add email-template Zod schemas"
```

---

## Phase 3: Common Email Layout + Template Refactor (17 files)

### Task 3.1: 共通 EmailLayout コンポーネント

**Files:**

- Create: `src/shared/emails/_layout.tsx`

- [ ] **Step 1: EmailLayout 作成**

Create `src/shared/emails/_layout.tsx`:

```tsx
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export type EmailLayoutProps = {
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
  children: ReactNode;
};

export function EmailLayout({
  preview,
  companyName,
  footerNote,
  supportContactText,
  children,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {children}
          <Hr style={hr} />
          {supportContactText && <Text style={text}>{supportContactText}</Text>}
          {footerNote && (
            <Section style={footerSection}>
              <Text style={footerNoteStyle}>{footerNote}</Text>
            </Section>
          )}
          <Text style={footer}>{companyName}</Text>
        </Container>
      </Body>
    </Html>
  );
}

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

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#484848",
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

const footerSection = {
  marginTop: "16px",
};

const footerNoteStyle = {
  fontSize: "12px",
  color: "#8898aa",
  lineHeight: "20px",
};
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/shared/emails/_layout.tsx
git commit -m "feat(emails): add shared EmailLayout component"
```

---

### Task 3.2: reservation-confirmation.tsx リファクタ（パターン確立）

**Files:**

- Modify: `src/shared/emails/reservation-confirmation.tsx`

- [ ] **Step 1: reservation-confirmation.tsx を全置換**

Replace `src/shared/emails/reservation-confirmation.tsx` contents with:

```tsx
import { Heading, Hr, Link, Section, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type AddToCalendarLinks = {
  google: string;
  outlook: string;
  outlookWeb: string;
  apple: string;
};

type Props = {
  // 動的データ（テンプレート差し込みに使う基本値）
  spaceName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  totalPrice: string;
  reservationId: string;
  notes?: string;
  addToCalendarLinks?: AddToCalendarLinks;
  // DB テンプレート由来の編集可能テキスト
  greeting: string;
  intro: string;
  outro: string;
  // レイアウト由来
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
};

export function ReservationConfirmationEmail({
  spaceName,
  reservationDate,
  startTime,
  endTime,
  totalPrice,
  reservationId,
  notes,
  addToCalendarLinks,
  greeting,
  intro,
  outro,
  preview,
  companyName,
  footerNote,
  supportContactText,
}: Props) {
  return (
    <EmailLayout
      preview={preview}
      companyName={companyName}
      footerNote={footerNote}
      supportContactText={supportContactText}
    >
      <Heading style={heading}>ご予約確認</Heading>
      <Text style={text}>{greeting}</Text>
      <Text style={text}>{intro}</Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>予約詳細</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>予約番号:</strong> {reservationId}
        </Text>
        <Text style={detailItem}>
          <strong>スペース:</strong> {spaceName}
        </Text>
        <Text style={detailItem}>
          <strong>日付:</strong> {reservationDate}
        </Text>
        <Text style={detailItem}>
          <strong>時間:</strong> {startTime} - {endTime}
        </Text>
        <Text style={detailItem}>
          <strong>料金:</strong> {totalPrice}
        </Text>
        {notes && (
          <Text style={detailItem}>
            <strong>備考:</strong> {notes}
          </Text>
        )}
      </Section>

      {addToCalendarLinks && (
        <Section style={calendarSection}>
          <Text style={calendarHeading}>カレンダーに追加</Text>
          <Text style={calendarDescription}>
            この予約をカレンダーに追加できます:
          </Text>
          <Text style={calendarLinks}>
            <Link href={addToCalendarLinks.google} style={calendarLink}>
              Google Calendar
            </Link>
            {" | "}
            <Link href={addToCalendarLinks.outlookWeb} style={calendarLink}>
              Outlook
            </Link>
            {" | "}
            <Link href={addToCalendarLinks.apple} style={calendarLink}>
              Apple Calendar
            </Link>
          </Text>
        </Section>
      )}

      <Text style={text}>{outro}</Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "24px",
  fontWeight: "600" as const,
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
  fontWeight: "600" as const,
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

const calendarSection = {
  backgroundColor: "#e8f4fd",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "24px 0",
};

const calendarHeading = {
  fontSize: "16px",
  fontWeight: "600" as const,
  color: "#1a1a1a",
  marginBottom: "8px",
};

const calendarDescription = {
  fontSize: "14px",
  color: "#484848",
  marginBottom: "12px",
};

const calendarLinks = {
  fontSize: "14px",
  lineHeight: "24px",
};

const calendarLink = {
  color: "#0066cc",
  textDecoration: "underline",
};
```

- [ ] **Step 2: Type check（送信関数側の不整合確認）**

Run: `bun run type-check`
Expected: `reservation-emails.ts` に型エラーが出る（greeting/intro/outro 未渡し）。これは Phase 4 で解消するため、このタスクでは意図的に次のステップへ進む。

- [ ] **Step 3: Commit**

```bash
git add src/shared/emails/reservation-confirmation.tsx
git commit -m "feat(emails): refactor reservation-confirmation to use EmailLayout and props"
```

---

### Task 3.3: 残り 16 テンプレートを同パターンで一括リファクタ

**Files:**

- Modify: 以下の 16 ファイル:
  - `src/shared/emails/reservation-cancelled.tsx`
  - `src/shared/emails/reservation-status-changed.tsx`
  - `src/shared/emails/reservation-reminder.tsx`
  - `src/shared/emails/admin-notification.tsx`
  - `src/shared/emails/event-registration-confirmation.tsx`
  - `src/shared/emails/event-registration-cancelled.tsx`
  - `src/shared/emails/event-admin-notification.tsx`
  - `src/shared/emails/event-cancelled-notification.tsx`
  - `src/shared/emails/event-updated-notification.tsx`
  - `src/shared/emails/contact-confirmation.tsx`
  - `src/shared/emails/inquiry-reply.tsx`
  - `src/shared/emails/review-reply.tsx`
  - `src/shared/emails/welcome.tsx`
  - `src/shared/emails/password-reset.tsx`
  - `src/shared/emails/staff-invitation.tsx`

**適用パターン（全ファイル共通）:**

1. `Html`, `Head`, `Body`, `Container`, `Preview` の import を削除
2. `EmailLayout` を `./ _layout` から import
3. Props に以下を追加:
   - `greeting: string`
   - `intro: string`
   - `outro: string`
   - `preview: string`
   - `companyName: string`
   - `footerNote?: string`
   - `supportContactText?: string`
4. 既存のハードコード文字列を削除:
   - `{customerName} 様` → `{greeting}`
   - 「この度は…」「ご登録ありがとうございます…」等の冒頭挨拶 → `{intro}`
   - 「ご不明な点がございましたら…」等の締め文 → `{outro}`
   - `Myrrh Rental Space` 等のフッター → 削除（`EmailLayout` が処理）
   - `<Preview>...</Preview>` → 削除（`EmailLayout` が処理）
5. `<Html><Head /><Preview>...</Preview><Body><Container>...</Container></Body></Html>` ラッパーを `<EmailLayout ...>...</EmailLayout>` に置換
6. スタイル定数のうち `main`, `container`, `footer` は削除（`EmailLayout` 内に集約済み）

- [ ] **Step 1: reservation-cancelled.tsx リファクタ**

パターン適用。`customerName` prop は `greeting` に統合（props から削除してよい）。

- [ ] **Step 2: reservation-status-changed.tsx リファクタ**

パターン適用。

- [ ] **Step 3: reservation-reminder.tsx リファクタ**

パターン適用。

- [ ] **Step 4: admin-notification.tsx リファクタ**

パターン適用。`adminUrl` prop は残す。

- [ ] **Step 5: event-registration-confirmation.tsx リファクタ**

パターン適用。

- [ ] **Step 6: event-registration-cancelled.tsx リファクタ**

パターン適用。

- [ ] **Step 7: event-admin-notification.tsx リファクタ**

パターン適用。

- [ ] **Step 8: event-cancelled-notification.tsx リファクタ**

パターン適用。

- [ ] **Step 9: event-updated-notification.tsx リファクタ**

パターン適用。

- [ ] **Step 10: contact-confirmation.tsx リファクタ**

パターン適用。

- [ ] **Step 11: inquiry-reply.tsx リファクタ**

パターン適用。`replyMessage` prop は残す（動的コンテンツのため）。

- [ ] **Step 12: review-reply.tsx リファクタ**

パターン適用。

- [ ] **Step 13: welcome.tsx リファクタ**

パターン適用。

- [ ] **Step 14: password-reset.tsx リファクタ**

パターン適用。`resetUrl` prop は残す。

- [ ] **Step 15: staff-invitation.tsx リファクタ**

パターン適用。`invitationUrl` prop は残す。

- [ ] **Step 16: Phase 4 の送信関数改修まで型エラーは残る — 現時点では各テンプレートの単独コンパイル確認のみ**

Run: `bunx --bun tsc --noEmit src/shared/emails/reservation-cancelled.tsx`
Expected: テンプレート単独では型エラーなし（送信関数側の型エラーは Phase 4 で解消）

- [ ] **Step 17: Commit**

```bash
git add src/shared/emails/
git commit -m "feat(emails): refactor 16 templates to use EmailLayout and DB-driven props"
```

---

## Phase 4: Send Functions Refactor

### Task 4.1: テンプレート解決ヘルパー

**Files:**

- Create: `src/shared/lib/email/resolve-template.ts`

- [ ] **Step 1: resolve-template.ts 作成**

Create `src/shared/lib/email/resolve-template.ts`:

```typescript
import "server-only";
import { getEmailTemplate } from "@/shared/domain/email-templates/queries";
import { getEmailTemplateSettings } from "@/shared/domain/settings/queries/email-template";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";
import { renderTemplate } from "./variables";

export type ResolvedTemplate = {
  subject: string;
  greeting: string;
  intro: string;
  outro: string;
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
  enabled: boolean;
};

export async function resolveTemplate(
  type: EmailTemplateType,
  variables: Record<string, string>,
): Promise<ResolvedTemplate | null> {
  const [template, settings] = await Promise.all([
    getEmailTemplate(type),
    getEmailTemplateSettings(),
  ]);

  if (!template) return null;

  const subjectPrefix = settings.emailSubjectPrefix ?? "";
  const renderedSubject = renderTemplate(template.subject, variables);

  return {
    subject: subjectPrefix
      ? `${subjectPrefix}${renderedSubject}`
      : renderedSubject,
    greeting: renderTemplate(template.greeting, variables),
    intro: renderTemplate(template.intro, variables),
    outro: renderTemplate(template.outro, variables),
    preview: renderedSubject,
    companyName: settings.companyName,
    ...(settings.emailFooterNote
      ? { footerNote: settings.emailFooterNote }
      : {}),
    ...(settings.emailSupportContactText
      ? { supportContactText: settings.emailSupportContactText }
      : {}),
    enabled: template.enabled,
  };
}
```

- [ ] **Step 2: Settings query 追加**

Create `src/shared/domain/settings/queries/email-template.ts`:

```typescript
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";

export type EmailTemplateSettings = {
  companyName: string;
  emailSubjectPrefix: string | null;
  emailFooterNote: string | null;
  emailSupportContactText: string | null;
};

const DEFAULT: EmailTemplateSettings = {
  companyName: "Myrrh Rental Space",
  emailSubjectPrefix: null,
  emailFooterNote: null,
  emailSupportContactText: null,
};

export async function getEmailTemplateSettings(): Promise<EmailTemplateSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.EMAIL_TEMPLATES);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          businessName: true,
          emailSubjectPrefix: true,
          emailFooterNote: true,
          emailSupportContactText: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getEmailTemplateSettings",
  });

  if (!result) return DEFAULT;

  return toPlainObject({
    companyName: result.businessName ?? DEFAULT.companyName,
    emailSubjectPrefix: result.emailSubjectPrefix,
    emailFooterNote: result.emailFooterNote,
    emailSupportContactText: result.emailSupportContactText,
  });
}
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: エラーなし（送信関数側の型エラーは次タスクで解消）

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/email/resolve-template.ts src/shared/domain/settings/queries/email-template.ts
git commit -m "feat(email): add resolveTemplate helper and settings query"
```

---

### Task 4.2: reservation-emails.ts 改修（パターン確立）

**Files:**

- Modify: `src/shared/lib/email/reservation-emails.ts`

- [ ] **Step 1: `sendReservationConfirmationEmail` を全置換**

`sendReservationConfirmationEmail` 関数を以下に置換:

```typescript
export async function sendReservationConfirmationEmail(
  data: ReservationEmailData,
): Promise<EmailResult> {
  const reservationDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTime = format(data.startTime, "HH:mm", { locale: ja });
  const endTime = format(data.endTime, "HH:mm", { locale: ja });

  const variables = omitUndefined({
    customerName: data.customerName,
    spaceName: data.spaceName,
    reservationDate,
    startTime,
    endTime,
    totalPrice: formatPrice(data.totalPrice, "未設定"),
    reservationId: data.reservationId.slice(0, 8).toUpperCase(),
    notes: data.notes ?? "",
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  const calendarSettings = await getCalendarEmailSettings();
  const calendarEvent = createReservationEvent(
    omitUndefined({
      reservationId: data.reservationId,
      spaceName: data.spaceName,
      customerName: data.customerName,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      notes: data.notes,
    }),
  );

  const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
    ? generateAddToCalendarLinks(calendarEvent)
    : undefined;

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (calendarSettings.icalAttachmentEnabled) {
    try {
      attachments = [
        {
          filename: `reservation-${data.reservationId.slice(0, 8)}.ics`,
          content: Buffer.from(generateICalContent(calendarEvent), "utf-8"),
        },
      ];
    } catch (icalError) {
      logError(normalizeError(icalError), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "generateICalAttachment",
          reservationId: data.reservationId,
        },
      });
    }
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send(
        omitUndefined({
          from,
          to: data.customerEmail,
          subject: resolved.subject,
          react: ReservationConfirmationEmail(
            omitUndefined({
              spaceName: data.spaceName,
              reservationDate,
              startTime,
              endTime,
              totalPrice: formatPrice(data.totalPrice, "未設定"),
              reservationId: data.reservationId.slice(0, 8).toUpperCase(),
              notes: data.notes,
              addToCalendarLinks,
              greeting: resolved.greeting,
              intro: resolved.intro,
              outro: resolved.outro,
              preview: resolved.preview,
              companyName: resolved.companyName,
              footerNote: resolved.footerNote,
              supportContactText: resolved.supportContactText,
            }),
          ),
          attachments,
        }),
      ),
    {
      operation: "sendReservationConfirmationEmail",
      reservationId: data.reservationId,
      customerEmail: data.customerEmail,
    },
  );
}
```

- [ ] **Step 2: ファイル上部に import 追加**

```typescript
import { resolveTemplate } from "./resolve-template";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check 2>&1 | head -30`
Expected: `reservation-emails.ts` 内の他関数（sendReservationCancelled 等）で型エラー。これは残りパターン適用で解消。

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/email/reservation-emails.ts
git commit -m "feat(email): refactor sendReservationConfirmationEmail to use DB template"
```

---

### Task 4.3: 残り 8 送信関数ファイルをパターン適用で改修

**Files:**

- Modify:
  - `src/shared/lib/email/reservation-emails.ts`（残り 2 関数: cancelled, status-changed）
  - `src/shared/lib/email/reminder-emails.ts`
  - `src/shared/lib/email/event-emails.ts`
  - `src/shared/lib/email/contact-emails.ts`
  - `src/shared/lib/email/inquiry-emails.ts`
  - `src/shared/lib/email/review-emails.ts`
  - `src/shared/lib/email/welcome-emails.ts`
  - `src/shared/lib/email/password-reset-emails.ts`
  - `src/shared/lib/email/system-emails.ts`

**適用パターン（全関数共通）:**

1. `resolveTemplate(EMAIL_TEMPLATE_TYPE.XXX, variables)` で template + settings 取得
2. `!resolved || !resolved.enabled` なら `{ success: true }` スキップ
3. `resend.emails.send()` に `subject: resolved.subject` を渡す（ハードコード件名を全削除）
4. React コンポーネント呼び出しに以下 props を追加:
   - `greeting: resolved.greeting`
   - `intro: resolved.intro`
   - `outro: resolved.outro`
   - `preview: resolved.preview`
   - `companyName: resolved.companyName`
   - `footerNote: resolved.footerNote`
   - `supportContactText: resolved.supportContactText`
5. `customerName` prop は削除（`greeting` に統合済み）

- [ ] **Step 1: reservation-emails.ts の残り関数（cancelled, status-changed）改修**

パターン適用。

- [ ] **Step 2: reminder-emails.ts 改修**

パターン適用。使用 type: `RESERVATION_REMINDER`

- [ ] **Step 3: event-emails.ts 改修**

パターン適用。5 関数: `EVENT_REGISTRATION_CONFIRMATION`, `EVENT_REGISTRATION_CANCELLED`, `EVENT_ADMIN_NOTIFICATION`, `EVENT_CANCELLED_NOTIFICATION`, `EVENT_UPDATED_NOTIFICATION`

- [ ] **Step 4: contact-emails.ts 改修**

パターン適用。使用 type: `CONTACT_CONFIRMATION`

- [ ] **Step 5: inquiry-emails.ts 改修**

パターン適用。使用 type: `INQUIRY_REPLY`

- [ ] **Step 6: review-emails.ts 改修**

パターン適用。使用 type: `REVIEW_REPLY`

- [ ] **Step 7: welcome-emails.ts 改修**

パターン適用。使用 type: `WELCOME`

- [ ] **Step 8: password-reset-emails.ts 改修**

パターン適用。使用 type: `PASSWORD_RESET`

- [ ] **Step 9: system-emails.ts 改修（staff-invitation, admin-notification）**

パターン適用。使用 type: `STAFF_INVITATION`, `ADMIN_NOTIFICATION`

- [ ] **Step 10: 全体型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 11: Commit**

```bash
git add src/shared/lib/email/
git commit -m "feat(email): refactor all send functions to use DB templates"
```

---

## Phase 5: Admin UI

### Task 5.1: admin-resources に emailTemplate 追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-resources.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts`

- [ ] **Step 1: Resource 型に追加**

`admin-resources.ts` の `Resource` ユニオンに `"emailTemplate"` を追加:

```typescript
export type Resource =
  | "space"
  // ... 既存
  | "emailTemplate";
```

- [ ] **Step 2: RESOURCE_LABELS に追加**

```typescript
export const RESOURCE_LABELS: Record<Resource, string> = {
  // ... 既存
  emailTemplate: "メールテンプレート",
};
```

- [ ] **Step 3: permissions.ts の ROLE_PERMISSIONS 更新**

`SUPER_ADMIN`, `ADMIN` に `"emailTemplate:read"`, `"emailTemplate:update"` を追加。`EDITOR`, `VIEWER` には `"emailTemplate:read"` のみ付与。

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 5: Commit**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/lib/
git commit -m "feat(admin): add emailTemplate resource and permissions"
```

---

### Task 5.2: Server Actions

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/email-template.ts`

- [ ] **Step 1: actions ファイル作成**

Create `src/app/(admin)/admin/(dashboard)/_shared/actions/email-template.ts`:

```typescript
"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  updateEmailTemplateCommand,
  toggleEmailTemplateEnabledCommand,
} from "@/shared/domain/email-templates/commands";
import {
  emailTemplateFormSchema,
  sendTestEmailSchema,
  type EmailTemplateFormInput,
  type SendTestEmailInput,
} from "@/shared/lib/validations/email-template";
import { isValidEmailTemplateType } from "@/shared/lib/validations/enums/guards";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { sendTestEmailForType } from "./email-template-test";

export async function updateEmailTemplate(
  type: string,
  input: EmailTemplateFormInput,
): Promise<MutationResult<{ id: string }>> {
  if (!isValidEmailTemplateType(type)) {
    return { error: "無効なメールテンプレート種別です" };
  }
  const parsed = emailTemplateFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "emailTemplate",
    action: "update",
    resourceId: type,
    execute: async () => updateEmailTemplateCommand(type, parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.EMAIL_TEMPLATES);
      updateTag(getCacheTag.emailTemplates.detail(type));
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function toggleEmailTemplateEnabled(
  type: string,
  enabled: boolean,
): Promise<MutationResult<{ id: string }>> {
  if (!isValidEmailTemplateType(type)) {
    return { error: "無効なメールテンプレート種別です" };
  }

  return executeAdminMutationResult({
    resource: "emailTemplate",
    action: "update",
    resourceId: type,
    execute: async () => toggleEmailTemplateEnabledCommand(type, enabled),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.EMAIL_TEMPLATES);
      updateTag(getCacheTag.emailTemplates.detail(type));
    },
  });
}

export async function sendTestEmail(
  input: SendTestEmailInput,
): Promise<MutationResult<null>> {
  const parsed = sendTestEmailSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);
  if (!isValidEmailTemplateType(parsed.data.type)) {
    return { error: "無効なメールテンプレート種別です" };
  }

  return executeAdminMutationResult({
    resource: "emailTemplate",
    action: "update",
    execute: async (user) => {
      if (!user.email) {
        throw new Error("テスト送信にはメールアドレスが必要です");
      }
      await sendTestEmailForType({
        type: parsed.data.type,
        recipient: user.email,
        draft: {
          subject: parsed.data.subject,
          greeting: parsed.data.greeting,
          intro: parsed.data.intro,
          outro: parsed.data.outro,
        },
      });
      return null;
    },
  });
}
```

- [ ] **Step 2: テスト送信ヘルパー作成**

Create `src/app/(admin)/admin/(dashboard)/_shared/actions/email-template-test.ts`:

```typescript
import "server-only";
import { EmailLayout } from "@/shared/emails/_layout";
import { createElement } from "react";
import { getResendClient, getFromAddress } from "@/shared/lib/email/client";
import { renderTemplate } from "@/shared/lib/email/variables";
import { getTemplateVariables } from "@/shared/lib/email/template-registry";
import { getEmailTemplateSettings } from "@/shared/domain/settings/queries/email-template";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";

type SendTestEmailForTypeArgs = {
  type: EmailTemplateType;
  recipient: string;
  draft: {
    subject: string;
    greeting: string;
    intro: string;
    outro: string;
  };
};

export async function sendTestEmailForType({
  type,
  recipient,
  draft,
}: SendTestEmailForTypeArgs): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    throw new Error("Resend API キーが未設定です");
  }

  const settings = await getEmailTemplateSettings();

  // 変数のダミー値を構築（example から）
  const variables = Object.fromEntries(
    getTemplateVariables(type).map((v) => [v.name, v.example]),
  );

  const renderedSubject = renderTemplate(draft.subject, variables);
  const subject = settings.emailSubjectPrefix
    ? `${settings.emailSubjectPrefix}${renderedSubject}`
    : renderedSubject;

  const children = [
    createElement(
      "p",
      { key: "greeting" },
      renderTemplate(draft.greeting, variables),
    ),
    createElement(
      "p",
      { key: "intro" },
      renderTemplate(draft.intro, variables),
    ),
    createElement(
      "p",
      { key: "outro", style: { marginTop: "24px" } },
      renderTemplate(draft.outro, variables),
    ),
  ];

  const element = createElement(
    EmailLayout,
    {
      preview: `[TEST] ${renderedSubject}`,
      companyName: settings.companyName,
      ...(settings.emailFooterNote
        ? { footerNote: settings.emailFooterNote }
        : {}),
      ...(settings.emailSupportContactText
        ? { supportContactText: settings.emailSupportContactText }
        : {}),
    },
    children,
  );

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: recipient,
    subject: `[TEST] ${subject}`,
    react: element,
  });

  if (error) {
    throw new Error(`テスト送信に失敗しました: ${error.message}`);
  }
}
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/actions/email-template.ts src/app/(admin)/admin/(dashboard)/_shared/actions/email-template-test.ts
git commit -m "feat(actions): add email-template Server Actions with test send"
```

---

### Task 5.3: 一覧ページ

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/settings/email-templates/page.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/settings/email-templates/loading.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/settings/email-templates/_components/EmailTemplateTable.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/settings/email-templates/_components/EmailTemplateEnabledSwitch.tsx`

- [ ] **Step 1: page.tsx 作成**

```tsx
import { Suspense } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getAllEmailTemplates } from "@/shared/domain/email-templates/queries";
import { EmailTemplateTable } from "./_components/EmailTemplateTable";

export const metadata: Metadata = {
  title: "メールテンプレート",
};

async function EmailTemplatesList() {
  await connection();
  const templates = await getAllEmailTemplates();
  return <EmailTemplateTable templates={templates} />;
}

export default function EmailTemplatesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            メールテンプレート
          </h1>
          <p className="text-muted-foreground">
            送信されるメールの件名・挨拶文・導入文・締め文を編集できます
          </p>
        </div>
        <Link
          href="/admin/settings"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 設定に戻る
        </Link>
      </div>
      <Suspense fallback={<div>読み込み中...</div>}>
        <EmailTemplatesList />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: loading.tsx 作成**

```tsx
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-96 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
```

- [ ] **Step 3: EmailTemplateTable Client Component 作成**

```tsx
"use client";

import Link from "next/link";
import { IconPencil } from "@tabler/icons-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
} from "@/admin/components/ui";
import {
  EMAIL_TEMPLATE_TYPE_LABELS,
  type EmailTemplateType,
} from "@/shared/lib/validations/enums/helpers";
import type { EmailTemplate } from "@/shared/domain/email-templates/types";
import { EmailTemplateEnabledSwitch } from "./EmailTemplateEnabledSwitch";

type Props = { templates: EmailTemplate[] };

export function EmailTemplateTable({ templates }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>種別</TableHead>
              <TableHead className="hidden md:table-cell">件名</TableHead>
              <TableHead>有効</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">
                  {
                    EMAIL_TEMPLATE_TYPE_LABELS[
                      template.type as EmailTemplateType
                    ]
                  }
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {template.subject}
                </TableCell>
                <TableCell>
                  <EmailTemplateEnabledSwitch
                    type={template.type}
                    enabled={template.enabled}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/admin/settings/email-templates/${template.type}/edit`}
                    >
                      <IconPencil className="mr-2 h-4 w-4" />
                      編集
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Enabled Switch Client Component 作成**

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/admin/components/ui";
import { toggleEmailTemplateEnabled } from "@/admin/actions/email-template";
import { isMutationError } from "@/shared/lib/mutation-result";

type Props = { type: string; enabled: boolean };

export function EmailTemplateEnabledSwitch({ type, enabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      const result = await toggleEmailTemplateEnabled(type, checked);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(checked ? "有効化しました" : "無効化しました");
      router.refresh();
    });
  };

  return (
    <Switch
      checked={enabled}
      onCheckedChange={handleChange}
      disabled={pending}
      aria-label="メール送信の有効/無効"
    />
  );
}
```

- [ ] **Step 5: 動作確認**

Run: `bun run type-check && bun run lint`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/app/(admin)/admin/(dashboard)/settings/email-templates/
git commit -m "feat(admin): add email templates list page"
```

---

### Task 5.4: 編集ページ

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/settings/email-templates/[type]/edit/page.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/settings/email-templates/[type]/edit/_components/EmailTemplateForm.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/settings/email-templates/[type]/edit/_components/VariableHelpPanel.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/settings/email-templates/[type]/edit/_components/TemplatePreview.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/settings/email-templates/[type]/edit/_components/TestSendButton.tsx`

- [ ] **Step 1: page.tsx 作成（Server Component）**

```tsx
import { notFound } from "next/navigation";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { getEmailTemplate } from "@/shared/domain/email-templates/queries";
import {
  EMAIL_TEMPLATE_TYPE_LABELS,
  type EmailTemplateType,
} from "@/shared/lib/validations/enums/helpers";
import { isValidEmailTemplateType } from "@/shared/lib/validations/enums/guards";
import { getTemplateVariables } from "@/shared/lib/email/template-registry";
import { EmailTemplateForm } from "./_components/EmailTemplateForm";

type PageProps = { params: Promise<{ type: string }> };

export default async function EditEmailTemplatePage({ params }: PageProps) {
  const { type } = await params;
  if (!isValidEmailTemplateType(type)) notFound();

  const template = await getEmailTemplate(type);
  if (!template) notFound();

  const variables = getTemplateVariables(type);
  const typedType: EmailTemplateType = type;

  return (
    <AdminDetailLayout
      backHref="/admin/settings/email-templates"
      title={`${EMAIL_TEMPLATE_TYPE_LABELS[typedType]} - テンプレート編集`}
      subtitle="件名・挨拶文・導入文・締め文を編集できます"
    >
      <EmailTemplateForm
        type={typedType}
        template={template}
        variables={variables}
      />
    </AdminDetailLayout>
  );
}
```

- [ ] **Step 2: EmailTemplateForm 作成（Client Component）**

```tsx
"use client";

import { useWatch } from "react-hook-form";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateEmailTemplate } from "@/admin/actions/email-template";
import {
  emailTemplateFormSchema,
  type EmailTemplateFormInput,
} from "@/shared/lib/validations/email-template";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";
import type { EmailTemplate } from "@/shared/domain/email-templates/types";
import type { TemplateVariable } from "@/shared/lib/email/template-registry";
import { VariableHelpPanel } from "./VariableHelpPanel";
import { TemplatePreview } from "./TemplatePreview";
import { TestSendButton } from "./TestSendButton";

type Props = {
  type: EmailTemplateType;
  template: EmailTemplate;
  variables: readonly TemplateVariable[];
};

export function EmailTemplateForm({ type, template, variables }: Props) {
  const { form, isPending, onSubmit } = useFormAction<
    EmailTemplateFormInput,
    { id: string }
  >(emailTemplateFormSchema, (data) => updateEmailTemplate(type, data), {
    defaultValues: {
      subject: template.subject,
      greeting: template.greeting,
      intro: template.intro,
      outro: template.outro,
      enabled: template.enabled,
    },
    refresh: true,
    successMessage: "テンプレートを保存しました",
  });

  const watchedValues = useWatch({ control: form.control });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>テンプレート編集</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <FormLabel>送信を有効にする</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        無効にすると、このテンプレートによるメール送信がスキップされます
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>件名</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="greeting"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>挨拶文</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="intro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>導入文</FormLabel>
                    <FormControl>
                      <Textarea {...field} disabled={isPending} rows={4} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="outro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>締め文</FormLabel>
                    <FormControl>
                      <Textarea {...field} disabled={isPending} rows={4} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-wrap items-center justify-end gap-2">
                <TestSendButton
                  type={type}
                  getValues={() => form.getValues()}
                  disabled={isPending}
                />
                <SubmitButton
                  isPending={isPending}
                  label="保存"
                  disabled={!form.formState.isDirty}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <VariableHelpPanel variables={variables} />
          <TemplatePreview
            variables={variables}
            subject={watchedValues.subject ?? ""}
            greeting={watchedValues.greeting ?? ""}
            intro={watchedValues.intro ?? ""}
            outro={watchedValues.outro ?? ""}
          />
        </div>
      </form>
    </Form>
  );
}
```

- [ ] **Step 3: VariableHelpPanel 作成**

```tsx
"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import type { TemplateVariable } from "@/shared/lib/email/template-registry";

type Props = { variables: readonly TemplateVariable[] };

export function VariableHelpPanel({ variables }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">利用可能な変数</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          以下の変数を件名・本文に埋め込めます。`{"{{"}`と`{"}}"}
          `で囲んで使用してください。
        </p>
        <div className="space-y-2">
          {variables.map((v) => (
            <div key={v.name} className="rounded-md border p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {`{{${v.name}}}`}
                </code>
                <span className="text-xs text-muted-foreground">
                  例: {v.example}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{v.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: TemplatePreview 作成**

```tsx
"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import { renderTemplate } from "@/shared/lib/email/variables";
import type { TemplateVariable } from "@/shared/lib/email/template-registry";

type Props = {
  variables: readonly TemplateVariable[];
  subject: string;
  greeting: string;
  intro: string;
  outro: string;
};

export function TemplatePreview({
  variables,
  subject,
  greeting,
  intro,
  outro,
}: Props) {
  const values = Object.fromEntries(variables.map((v) => [v.name, v.example]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">プレビュー（変数差し込み後）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="text-xs font-medium text-muted-foreground">件名</div>
          <div className="rounded-md border bg-muted/30 p-2">
            {renderTemplate(subject, values) || (
              <span className="text-muted-foreground">（空）</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">挨拶</div>
          <div className="rounded-md border bg-muted/30 p-2">
            {renderTemplate(greeting, values) || (
              <span className="text-muted-foreground">（空）</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            導入文
          </div>
          <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-2">
            {renderTemplate(intro, values) || (
              <span className="text-muted-foreground">（空）</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            締め文
          </div>
          <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-2">
            {renderTemplate(outro, values) || (
              <span className="text-muted-foreground">（空）</span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          ※実際のメールでは装飾・レイアウトが適用されます
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: TestSendButton 作成**

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui";
import { sendTestEmail } from "@/admin/actions/email-template";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";
import type { EmailTemplateFormInput } from "@/shared/lib/validations/email-template";

type Props = {
  type: EmailTemplateType;
  getValues: () => EmailTemplateFormInput;
  disabled?: boolean;
};

export function TestSendButton({ type, getValues, disabled }: Props) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    const values = getValues();
    startTransition(async () => {
      const result = await sendTestEmail({
        type,
        subject: values.subject,
        greeting: values.greeting,
        intro: values.intro,
        outro: values.outro,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("テストメールを送信しました");
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={disabled || pending}
    >
      {pending ? "送信中..." : "テスト送信"}
    </Button>
  );
}
```

- [ ] **Step 6: 動作確認**

Run: `bun run type-check && bun run lint`
Expected: エラーなし

- [ ] **Step 7: Commit**

```bash
git add src/app/(admin)/admin/(dashboard)/settings/email-templates/[type]/
git commit -m "feat(admin): add email template edit page with preview and test send"
```

---

### Task 5.5: 設定メニューにリンク追加 + Settings 3 カラム管理 UI

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/page.tsx`（or 該当の設定ハブ）
- Modify: Settings セクションファイル（EmailSection 等）

- [ ] **Step 1: 設定ハブにメールテンプレート管理カードを追加**

`/admin/settings` ページに「メールテンプレート」カードを追加し `/admin/settings/email-templates` へリンク。

- [ ] **Step 2: EmailSection に emailSubjectPrefix / emailFooterNote / emailSupportContactText を追加**

既存の `EmailSection.tsx`（送信元メール設定等）に 3 フィールド追加。`updateBasicInfo` Server Action のスキーマも更新。

- [ ] **Step 3: 型チェック**

Run: `bun run type-check && bun run lint`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/admin/(dashboard)/settings/
git commit -m "feat(admin): add email template settings fields to EmailSection"
```

---

## Phase 6: Seed + Test + Cleanup

### Task 6.1: seed.ts に 17 種初期テンプレート登録

**Files:**

- Modify: `prisma/seed.ts`

- [ ] **Step 1: seed 関数追加**

`prisma/seed.ts` に以下のシード関数を追加し、メイン処理から呼び出す:

```typescript
async function seedEmailTemplates(prisma: AppPrismaClient) {
  await prisma.emailTemplate.deleteMany({});

  const defaults = [
    {
      type: "reservation_confirmation",
      subject: "【ご予約確認】{{spaceName}} - {{reservationDate}}",
      greeting: "{{customerName}} 様",
      intro:
        "この度はご予約いただき、誠にありがとうございます。以下の内容でご予約を承りました。",
      outro: "ご不明な点がございましたら、お気軽にお問い合わせください。",
    },
    {
      type: "reservation_cancelled",
      subject: "【予約キャンセル】{{spaceName}} - {{reservationDate}}",
      greeting: "{{customerName}} 様",
      intro: "下記のご予約がキャンセルされました。",
      outro: "またのご利用を心よりお待ちしております。",
    },
    {
      type: "reservation_status_changed",
      subject: "【予約{{action}}】{{spaceName}} - {{reservationDate}}",
      greeting: "{{customerName}} 様",
      intro:
        "ご予約のステータスが「{{previousStatus}}」から「{{newStatus}}」に変更されました。",
      outro: "ご確認のほど、よろしくお願いいたします。",
    },
    {
      type: "reservation_reminder",
      subject: "【予約リマインダー】明日のご予約 - {{spaceName}}",
      greeting: "{{customerName}} 様",
      intro: "明日、ご予約の日です。以下の内容でお待ちしております。",
      outro: "当日のご来場をお待ちしております。",
    },
    {
      type: "reservation_updated",
      subject: "【予約内容変更】{{spaceName}} - {{reservationDate}}",
      greeting: "{{customerName}} 様",
      intro: "ご予約の内容が変更されました。以下をご確認ください。",
      outro: "ご不明な点がございましたら、お気軽にお問い合わせください。",
    },
    {
      type: "admin_notification",
      subject: "【新規予約】{{spaceName}} - {{customerName}}",
      greeting: "管理者各位",
      intro:
        "新しい予約を受け付けました。以下のリンクから詳細をご確認ください。",
      outro: "対応をお願いいたします。",
    },
    {
      type: "event_registration_confirmation",
      subject: "【イベント申込完了】{{eventTitle}}",
      greeting: "{{customerName}} 様",
      intro:
        "この度はイベントにお申込みいただき、誠にありがとうございます。以下の内容で受け付けました。",
      outro: "当日のご来場をお待ちしております。",
    },
    {
      type: "event_registration_cancelled",
      subject: "【イベント申込キャンセル】{{eventTitle}}",
      greeting: "{{customerName}} 様",
      intro: "下記のイベントお申込みがキャンセルされました。",
      outro: "またのお申込みをお待ちしております。",
    },
    {
      type: "event_admin_notification",
      subject: "【新規イベント申込】{{eventTitle}} - {{customerName}}",
      greeting: "管理者各位",
      intro: "新しいイベント申込を受け付けました。",
      outro: "対応をお願いいたします。",
    },
    {
      type: "event_cancelled_notification",
      subject: "【イベント中止】{{eventTitle}}",
      greeting: "{{customerName}} 様",
      intro:
        "誠に申し訳ございませんが、下記のイベントは中止となりました。理由: {{reason}}",
      outro: "またの機会にぜひご参加ください。",
    },
    {
      type: "event_updated_notification",
      subject: "【イベント内容変更】{{eventTitle}}",
      greeting: "{{customerName}} 様",
      intro: "下記のイベント内容が変更されました。{{changeSummary}}",
      outro: "変更内容をご確認のうえ、引き続きご参加をお願いいたします。",
    },
    {
      type: "contact_confirmation",
      subject: "【お問い合わせ受付】{{inquirySubject}}",
      greeting: "{{customerName}} 様",
      intro:
        "この度はお問い合わせいただき、誠にありがとうございます。以下の内容で受け付けました。",
      outro: "担当者より順次ご返信いたしますので、今しばらくお待ちください。",
    },
    {
      type: "inquiry_reply",
      subject: "【お問い合わせへの返信】{{inquirySubject}}",
      greeting: "{{customerName}} 様",
      intro:
        "お問い合わせいただいた件につきまして、以下のとおりご返信申し上げます。\n\n{{replyMessage}}",
      outro: "引き続きよろしくお願いいたします。",
    },
    {
      type: "review_reply",
      subject: "【レビューへの返信】{{spaceName}}",
      greeting: "{{customerName}} 様",
      intro:
        "この度はレビューをお寄せいただき、誠にありがとうございます。\n\n{{replyMessage}}",
      outro: "またのご利用を心よりお待ちしております。",
    },
    {
      type: "welcome",
      subject: "ようこそ {{companyName}} へ",
      greeting: "{{customerName}} 様",
      intro:
        "ご登録いただき、誠にありがとうございます。下記のリンクからログインできます。\n\n{{loginUrl}}",
      outro: "ご不明な点がございましたら、お気軽にお問い合わせください。",
    },
    {
      type: "password_reset",
      subject: "【パスワードリセット】",
      greeting: "{{customerName}} 様",
      intro:
        "パスワードリセットのリクエストを受け付けました。以下のリンクから {{expiresInHours}} 時間以内にパスワードを再設定してください。\n\n{{resetUrl}}",
      outro: "心当たりがない場合は、このメールを破棄してください。",
    },
    {
      type: "staff_invitation",
      subject: "【スタッフ招待】管理画面へのアクセス",
      greeting: "{{inviterName}} 様より招待が届きました",
      intro:
        "ロール「{{role}}」でご招待いたします。有効期限: {{expiresAt}}\n\n以下のリンクから参加してください。\n{{invitationUrl}}",
      outro: "ご参加をお待ちしております。",
    },
  ];

  for (const template of defaults) {
    await prisma.emailTemplate.create({ data: template });
  }

  log.info(`Seeded ${defaults.length} email templates`);
}
```

- [ ] **Step 2: メイン seed 処理から呼び出す**

```typescript
await seedEmailTemplates(prisma);
```

- [ ] **Step 3: seed 実行**

Run: `bun prisma/seed.ts`
Expected: `Seeded 17 email templates` ログが出る。エラーなし。

- [ ] **Step 4: DB 確認**

Run: `bun -e "const { PrismaClient } = require('./generated/prisma/client'); const { PrismaPg } = require('@prisma/adapter-pg'); const pg = new PrismaPg({ connectionString: process.env.DATABASE_URL }); const p = new PrismaClient({ adapter: pg }); p.emailTemplate.count().then(c => { console.log('count:', c); p.\$disconnect(); })"`
Expected: `count: 17`

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): add 17 default email templates"
```

---

### Task 6.2: Integration テスト

**Files:**

- Create: `__tests__/integration/domain/email-templates/commands.test.ts`

- [ ] **Step 1: integration test 作成**

```typescript
import { beforeEach, describe, expect, it } from "bun:test";
import { prisma } from "@/shared/db/prisma";
import {
  updateEmailTemplateCommand,
  toggleEmailTemplateEnabledCommand,
} from "@/shared/domain/email-templates/commands";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";

describe("email-templates commands", () => {
  beforeEach(async () => {
    await prisma.emailTemplate.deleteMany({});
    await prisma.emailTemplate.create({
      data: {
        type: EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION,
        subject: "default",
        greeting: "default",
        intro: "default",
        outro: "default",
        enabled: true,
      },
    });
  });

  it("updateEmailTemplateCommand が既存テンプレートを更新できる", async () => {
    await updateEmailTemplateCommand(
      EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION,
      {
        subject: "new subject",
        greeting: "new greeting",
        intro: "new intro",
        outro: "new outro",
        enabled: true,
      },
    );
    const updated = await prisma.emailTemplate.findUnique({
      where: { type: EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION },
    });
    expect(updated?.subject).toBe("new subject");
    expect(updated?.greeting).toBe("new greeting");
  });

  it("toggleEmailTemplateEnabledCommand が enabled を切り替える", async () => {
    await toggleEmailTemplateEnabledCommand(
      EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION,
      false,
    );
    const toggled = await prisma.emailTemplate.findUnique({
      where: { type: EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION },
    });
    expect(toggled?.enabled).toBe(false);
  });

  it("存在しない type で DomainError NOT_FOUND を投げる", async () => {
    await expect(
      updateEmailTemplateCommand(EMAIL_TEMPLATE_TYPE.WELCOME, {
        subject: "x",
        greeting: "x",
        intro: "x",
        outro: "x",
        enabled: true,
      }),
    ).rejects.toThrow(/NOT_FOUND|見つかりません/);
  });
});
```

- [ ] **Step 2: `package.json` の test:integration に email-templates を追加**

既存の integration テストチェーンに `bun test __tests__/integration/domain/email-templates` を追加。

- [ ] **Step 3: テスト実行**

Run: `bun test __tests__/integration/domain/email-templates/commands.test.ts`
Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add __tests__/integration/domain/email-templates/ package.json
git commit -m "test(integration): add email-templates commands integration tests"
```

---

### Task 6.3: 全体検証とクリーンアップ

**Files:**

- なし（検証のみ）

- [ ] **Step 1: validate**

Run: `bun run validate`
Expected: type-check + lint PASS

- [ ] **Step 2: build**

Run: `bun run build`
Expected: build 成功

- [ ] **Step 3: 全 test 実行**

Run: `bun run test:unit && bun run test:integration`
Expected: 全 PASS

- [ ] **Step 4: dev サーバー起動 + 動作確認**

Run: `bun dev` (background)

手動確認:

1. `/admin/settings/email-templates` で 17 種リスト表示
2. 1 件編集 → 保存 → DB 反映確認
3. 有効/無効スイッチ動作
4. テスト送信実行 → ログイン管理者メールに着信確認（Resend API キー設定時のみ）

- [ ] **Step 5: 残存する古いハードコード文字列がないかを grep**

Run: `grep -rn "Myrrh Rental Space" src/shared/emails/` (`_layout.tsx` 以外にヒットがないことを確認)
Run: `grep -rn "ご不明な点がございましたら" src/shared/emails/` (ヒットゼロを確認)
Run: `grep -rn "この度はご予約いただき" src/shared/emails/` (ヒットゼロを確認)
Expected: `_layout.tsx` 以外にヒットなし

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: verify email template management implementation"
```

---

## Self-Review Checklist

**Spec coverage:**

- ✅ 17 種のメール種別すべて対応 (Phase 1.2, 3.3, 4.3, 6.1)
- ✅ 件名・挨拶・導入文・締め文の編集 (Phase 1.1, 5.4)
- ✅ 変数差し込みエンジン (Phase 2.1)
- ✅ 変数レジストリ (Phase 2.2)
- ✅ 管理画面 UI (Phase 5)
- ✅ プレビュー機能 (Phase 5.4)
- ✅ テスト送信 (Phase 5.2, 5.4)
- ✅ Settings 3 カラム追加 (Phase 1.1)
- ✅ キャッシュ戦略 (Phase 1.3, 1.4, 5.2)
- ✅ 権限リソース (Phase 5.1)
- ✅ seed (Phase 6.1)
- ✅ テスト (Phase 2.1, 2.2, 6.2)

**Placeholder scan:** No "TBD" / "implement later" / "similar to Task N" without full pattern spec.

**Type consistency:**

- `EmailTemplateType` — `helpers.ts` / `guards.ts` / `types.ts` / `queries.ts` / `commands.ts` で一貫
- `resolvedTemplate` shape — `resolve-template.ts` / 17 テンプレート / 9 送信関数で一貫
- `EmailTemplateFormInput` — Zod スキーマ / Form / Server Action で一貫

---

## 実行方針

Phase 3 と Phase 4 の「パターン適用」は密結合（すべて同時に型整合させる必要あり）のため、単一 implementer にバンドルすることを推奨。それ以外は Phase 単位で独立タスク化可能。
