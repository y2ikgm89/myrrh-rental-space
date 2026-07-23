# FAQ雛形（例文）選択機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FAQ管理画面の質問作成ダイアログに、事前定義された例文（雛形）を選ぶと質問・回答欄が自動入力されるUIを追加する。

**Architecture:** 静的な `as const` データ配列（DB/migration不要）+ グループ化 `Select` の提示専用コンポーネント + 既存 `FaqItemDialog.tsx` の作成モードへの薄い配線。3ファイルの新規/変更で完結する。

**Tech Stack:** Next.js 16 / React 19 / conform + Zod 4 / shadcn `Select`（Radix） / bun:test（testing-library不使用、`react-dom/client` の `createRoot` + `act` パターン）

## Global Constraints

- テストは必ず `bun scripts/run-tests.ts <path>` 経由で実行する（素の `bun test` 禁止）
- `any` / non-null assertion（`!`） / `@ts-ignore` は使用しない
- Prisma・`@generated/prisma` の直 import は行わない（本機能では発生しない）
- conform の Zod 統合は `@conform-to/zod/v4` サブパスを使う（既存 import を変更しない）
- UI文言は日本語
- 完了前に `bun run validate`（type-check + lint）を実行し exit 0 を確認する
- 参照する設計spec: [`docs/superpowers/specs/2026-07-23-faq-item-template-picker-design.md`](../specs/2026-07-23-faq-item-template-picker-design.md)

---

## Task 1: FAQ雛形データ (`faq-item-templates.ts`)

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/faq/_components/faq-item-templates.ts`
- Test: `__tests__/unit/components/admin/faq-item-templates.test.ts`

**Interfaces:**

- Consumes: なし（このタスクが起点）
- Produces:
  - `FAQ_ITEM_TEMPLATE_GROUPS: readonly ["予約・キャンセル", "支払い", "設備・利用", "アクセス・その他"]`
  - `type FaqItemTemplateGroup = (typeof FAQ_ITEM_TEMPLATE_GROUPS)[number]`
  - `FAQ_ITEM_TEMPLATES: readonly { id: string; group: FaqItemTemplateGroup; question: string; answer: string }[]`（14件）
  - `type FaqItemTemplate = (typeof FAQ_ITEM_TEMPLATES)[number]`
  - `resolveFaqItemTemplateById(id: string): FaqItemTemplate | undefined`

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/components/admin/faq-item-templates.test.ts` を新規作成:

```ts
import { describe, expect, test } from "bun:test";
import {
  FAQ_ITEM_TEMPLATE_GROUPS,
  FAQ_ITEM_TEMPLATES,
  resolveFaqItemTemplateById,
} from "@/app/(admin)/admin/(dashboard)/faq/_components/faq-item-templates";

describe("FAQ_ITEM_TEMPLATES", () => {
  test("id はすべて一意", () => {
    const ids = FAQ_ITEM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("group はすべて FAQ_ITEM_TEMPLATE_GROUPS のいずれかに属する", () => {
    for (const template of FAQ_ITEM_TEMPLATES) {
      expect(FAQ_ITEM_TEMPLATE_GROUPS).toContain(template.group);
    }
  });

  test("各グループに最低1件のテンプレートが存在する", () => {
    for (const group of FAQ_ITEM_TEMPLATE_GROUPS) {
      const count = FAQ_ITEM_TEMPLATES.filter((t) => t.group === group).length;
      expect(count).toBeGreaterThan(0);
    }
  });

  test("question は1〜500文字、answer は1〜5000文字に収まる (faqItemFormSchema の制限)", () => {
    for (const template of FAQ_ITEM_TEMPLATES) {
      expect(template.question.length).toBeGreaterThan(0);
      expect(template.question.length).toBeLessThanOrEqual(500);
      expect(template.answer.length).toBeGreaterThan(0);
      expect(template.answer.length).toBeLessThanOrEqual(5000);
    }
  });
});

describe("resolveFaqItemTemplateById", () => {
  test("既知の id を渡すと対応するテンプレートを返す", () => {
    const result = resolveFaqItemTemplateById("cancel-policy");
    expect(result?.question).toBe("予約はいつまでキャンセルできますか？");
  });

  test("未知の id を渡すと undefined を返す", () => {
    expect(resolveFaqItemTemplateById("does-not-exist")).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストを実行し失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/components/admin/faq-item-templates.test.ts`
Expected: FAIL（`faq-item-templates` モジュールが解決できないエラー、または import 対象が undefined）

- [ ] **Step 3: データファイルを実装する**

`src/app/(admin)/admin/(dashboard)/faq/_components/faq-item-templates.ts` を新規作成:

```ts
/**
 * FAQ質問追加ダイアログ用の雛形（例文）データ。
 * DBを持たない静的コンテンツ。選択後は管理者が内容を編集する前提のため、
 * 事業者固有の条件（金額・料率・具体的な手段名等）は「◯」で表現する。
 */

export const FAQ_ITEM_TEMPLATE_GROUPS = [
  "予約・キャンセル",
  "支払い",
  "設備・利用",
  "アクセス・その他",
] as const;

export type FaqItemTemplateGroup = (typeof FAQ_ITEM_TEMPLATE_GROUPS)[number];

export const FAQ_ITEM_TEMPLATES = [
  {
    id: "cancel-policy",
    group: "予約・キャンセル",
    question: "予約はいつまでキャンセルできますか？",
    answer:
      "利用日の◯日前までは無料でキャンセルいただけます。それ以降のキャンセルにはキャンセル料が発生します。詳細は予約確認メールをご確認ください。",
  },
  {
    id: "reservation-change",
    group: "予約・キャンセル",
    question: "予約内容を変更したいのですが可能ですか？",
    answer:
      "利用日の◯日前までであれば、マイページまたはお問い合わせフォームより変更を承ります。当日変更はお問い合わせください。",
  },
  {
    id: "reservation-confirm-timing",
    group: "予約・キャンセル",
    question: "予約はいつ確定しますか？",
    answer:
      "お申し込み後、内容確認のうえ確定次第、確認メールをお送りします。通常◯営業日以内にご連絡します。",
  },
  {
    id: "reservation-late-arrival",
    group: "予約・キャンセル",
    question: "予約時間に遅れそうな場合はどうすればいいですか？",
    answer:
      "事前にお電話またはお問い合わせフォームよりご連絡ください。連絡なく大幅に遅れた場合、利用時間は予約時間どおり終了となります。",
  },
  {
    id: "payment-methods",
    group: "支払い",
    question: "支払い方法を教えてください",
    answer:
      "クレジットカード決済に対応しています。詳細はご予約手続き画面でご確認ください。",
  },
  {
    id: "receipt-issue",
    group: "支払い",
    question: "領収書は発行してもらえますか？",
    answer:
      "マイページの予約詳細画面から領収書をダウンロードいただけます。宛名の指定が必要な場合はお問い合わせください。",
  },
  {
    id: "extension-fee",
    group: "支払い",
    question: "利用時間を延長した場合の追加料金はどうなりますか？",
    answer:
      "延長料金は1時間あたり◯円です。当日空きがある場合のみ延長を承ります。",
  },
  {
    id: "wifi-equipment",
    group: "設備・利用",
    question: "Wi-Fiや設備は利用できますか？",
    answer:
      "Wi-Fi・プロジェクター等の設備を無料でご利用いただけます。詳細はスペースごとの設備一覧をご確認ください。",
  },
  {
    id: "food-drink-policy",
    group: "設備・利用",
    question: "飲食は可能ですか？",
    answer:
      "飲食可能です。ゴミはお持ち帰りいただくか、備え付けのゴミ箱にお捨てください。",
  },
  {
    id: "capacity-over",
    group: "設備・利用",
    question: "予約人数より多い人数で利用できますか？",
    answer:
      "定員を超えるご利用はお断りしております。人数変更がある場合は事前にご連絡ください。",
  },
  {
    id: "damage-policy",
    group: "設備・利用",
    question: "設備を破損した場合はどうなりますか？",
    answer:
      "速やかにスタッフまでご連絡ください。故意・過失による破損の場合、修理費用をご請求する場合があります。",
  },
  {
    id: "parking-availability",
    group: "アクセス・その他",
    question: "駐車場はありますか？",
    answer:
      "敷地内に◯台分の駐車スペースがございます。満車の場合は近隣のコインパーキングをご利用ください。",
  },
  {
    id: "station-access",
    group: "アクセス・その他",
    question: "最寄り駅からのアクセスを教えてください",
    answer: "◯駅から徒歩◯分です。詳細な道順はアクセスページをご確認ください。",
  },
  {
    id: "entry-method",
    group: "アクセス・その他",
    question: "当日の入館方法を教えてください",
    answer:
      "予約確認メールに記載の入館コードをご利用ください。不明な場合はお問い合わせください。",
  },
] as const;

export type FaqItemTemplate = (typeof FAQ_ITEM_TEMPLATES)[number];

/** id から雛形を解決する。未知の id は undefined を返す。 */
export function resolveFaqItemTemplateById(
  id: string,
): FaqItemTemplate | undefined {
  return FAQ_ITEM_TEMPLATES.find((template) => template.id === id);
}
```

- [ ] **Step 4: テストを実行し成功を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/components/admin/faq-item-templates.test.ts`
Expected: PASS（全 6 テスト）

- [ ] **Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/faq/_components/faq-item-templates.ts __tests__/unit/components/admin/faq-item-templates.test.ts
git commit -m "feat(admin): add FAQ item template seed data"
```

---

## Task 2: 雛形選択UI (`FaqItemTemplateSelect`)

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemTemplateSelect.tsx`
- Test: `__tests__/unit/components/admin/faq-item-template-select.test.tsx`

**Interfaces:**

- Consumes: Task 1 の `FAQ_ITEM_TEMPLATE_GROUPS`, `FAQ_ITEM_TEMPLATES`, `resolveFaqItemTemplateById`, `type FaqItemTemplate`
- Produces: `FaqItemTemplateSelect(props: { onSelect: (template: FaqItemTemplate) => void; disabled?: boolean }): JSX.Element`

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/components/admin/faq-item-template-select.test.tsx` を新規作成:

```tsx
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

/**
 * Radix Select は jsdom でポインタ操作を再現できないため、この codebase の
 * 既存パターン（refund-dialog.test.tsx 等）に倣い、Select を「クリックで
 * onValueChange(固定id) を呼ぶボタン」に差し替えてテストする。
 */
mock.module("@/admin/components/ui", () => ({
  Label: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <label {...props}>{children}</label>,
  Select: ({
    children,
    onValueChange,
    disabled,
  }: {
    children?: ReactNode;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
  }) => (
    <div>
      <button
        type="button"
        data-testid="select-cancel-policy"
        disabled={disabled}
        onClick={() => onValueChange?.("cancel-policy")}
      >
        select-cancel-policy
      </button>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectGroup: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectLabel: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => <span />,
}));

const { FaqItemTemplateSelect } =
  await import("@/app/(admin)/admin/(dashboard)/faq/_components/FaqItemTemplateSelect");
const { FAQ_ITEM_TEMPLATE_GROUPS, FAQ_ITEM_TEMPLATES } =
  await import("@/app/(admin)/admin/(dashboard)/faq/_components/faq-item-templates");

describe("FaqItemTemplateSelect", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  test("グループ見出しが FAQ_ITEM_TEMPLATE_GROUPS の順で表示される", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(<FaqItemTemplateSelect onSelect={mock()} />);
    });

    const text = container?.textContent ?? "";
    const positions = FAQ_ITEM_TEMPLATE_GROUPS.map((group) =>
      text.indexOf(group),
    );
    for (const pos of positions) {
      expect(pos).toBeGreaterThanOrEqual(0);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("雛形を選択すると onSelect が対応する FaqItemTemplate で呼ばれる", async () => {
    const onSelect = mock();
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(<FaqItemTemplateSelect onSelect={onSelect} />);
    });

    const button = container?.querySelector(
      '[data-testid="select-cancel-policy"]',
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    const expected = FAQ_ITEM_TEMPLATES.find((t) => t.id === "cancel-policy");
    expect(onSelect).toHaveBeenCalledWith(expected);
  });

  test("disabled=true のとき Select が disabled になる", async () => {
    await act(async () => {
      if (!root) throw new Error("root missing");
      root.render(<FaqItemTemplateSelect onSelect={mock()} disabled />);
    });

    const button = container?.querySelector(
      '[data-testid="select-cancel-policy"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: テストを実行し失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/components/admin/faq-item-template-select.test.tsx`
Expected: FAIL（`FaqItemTemplateSelect` モジュールが解決できないエラー）

- [ ] **Step 3: コンポーネントを実装する**

`src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemTemplateSelect.tsx` を新規作成:

```tsx
"use client";

/**
 * FaqItemTemplateSelect
 *
 * FAQ質問追加ダイアログの雛形選択UI。EmailTemplatesSection と同じ
 * グループ化 Select パターン（SelectGroup/SelectLabel）。選択結果を
 * onSelect で親に渡すだけの提示専用コンポーネント（自身は状態を持たない）。
 */

import { useId } from "react";
import {
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import {
  FAQ_ITEM_TEMPLATE_GROUPS,
  FAQ_ITEM_TEMPLATES,
  resolveFaqItemTemplateById,
  type FaqItemTemplate,
} from "./faq-item-templates";

type FaqItemTemplateSelectProps = {
  readonly onSelect: (template: FaqItemTemplate) => void;
  readonly disabled?: boolean;
};

export function FaqItemTemplateSelect({
  onSelect,
  disabled,
}: FaqItemTemplateSelectProps) {
  const selectId = useId();

  const handleValueChange = (value: string) => {
    const template = resolveFaqItemTemplateById(value);
    if (template) {
      onSelect(template);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={selectId}>雛形から選ぶ（任意）</Label>
      <Select onValueChange={handleValueChange} disabled={disabled ?? false}>
        <SelectTrigger id={selectId} className="w-full">
          <SelectValue placeholder="雛形を選択..." />
        </SelectTrigger>
        <SelectContent>
          {FAQ_ITEM_TEMPLATE_GROUPS.map((group) => {
            const items = FAQ_ITEM_TEMPLATES.filter(
              (template) => template.group === group,
            );
            if (items.length === 0) return null;
            return (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {items.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.question}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        選択すると質問・回答欄の内容を上書きします。
      </p>
    </div>
  );
}
```

- [ ] **Step 4: テストを実行し成功を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/components/admin/faq-item-template-select.test.tsx`
Expected: PASS（全 3 テスト）

- [ ] **Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/faq/_components/FaqItemTemplateSelect.tsx __tests__/unit/components/admin/faq-item-template-select.test.tsx
git commit -m "feat(admin): add FaqItemTemplateSelect component"
```

---

## Task 3: `FaqItemDialog.tsx` に雛形選択を配線する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemDialog.tsx`

**Interfaces:**

- Consumes: Task 2 の `FaqItemTemplateSelect`、Task 1 の `type FaqItemTemplate`
- Produces: `FaqItemDialog` の公開シグネチャは無変更（既存呼び出し元に影響なし）

このタスクは新規ロジックを持たない薄い配線（コンポーネントの呼び出しと conform
`useInputControl` への切り替え）のため、自動テストは追加しない。正しさは
`bun run validate`（型チェックで conform の型不整合を検出）と、Step 5 の実ブラウザ
確認で担保する（`__tests__/unit/components/admin/*` に conform `useForm` を実際に
レンダリングするテストの前例がこの codebase に存在しないため、無理に新設せず design
spec 通り手動確認に留める）。

- [ ] **Step 1: import を更新する**

`src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemDialog.tsx` の import ブロックを変更する。

Before (1-53行目付近):

```tsx
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SubmissionResult } from "@conform-to/react";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { createFaqItem, updateFaqItem } from "@/admin/actions/faq";
import { faqItemFormSchema } from "@/admin/lib/validations/faq";
import type { FaqItemWithCategory } from "@/shared/domain/faq/types";
import { getPublishLabel } from "@/shared/lib/validations/enums/helpers";
```

After:

```tsx
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SubmissionResult } from "@conform-to/react";
import { getFormProps, useForm, useInputControl } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { createFaqItem, updateFaqItem } from "@/admin/actions/faq";
import { faqItemFormSchema } from "@/admin/lib/validations/faq";
import type { FaqItemWithCategory } from "@/shared/domain/faq/types";
import { getPublishLabel } from "@/shared/lib/validations/enums/helpers";
import { FaqItemTemplateSelect } from "./FaqItemTemplateSelect";
import type { FaqItemTemplate } from "./faq-item-templates";
```

（`getInputProps` / `getTextareaProps` は question/answer を制御コンポーネント化するため
不要になるので削除する。削除しないと ESLint の未使用 import エラーになる。）

- [ ] **Step 2: 呼び出し元に `mode` を渡す**

`FaqItemCreateDialog` 内の `<FaqItemFormBody>` 呼び出しを変更する。

Before:

```tsx
<FaqItemFormBody
  formId="faq-item-create-form"
  isPending={isPending}
  lastResult={lastResult}
  formAction={formAction}
  defaultValue={{
    categoryId,
    question: "",
    answer: "",
    isPublished: "on",
  }}
/>
```

After:

```tsx
<FaqItemFormBody
  mode="create"
  formId="faq-item-create-form"
  isPending={isPending}
  lastResult={lastResult}
  formAction={formAction}
  defaultValue={{
    categoryId,
    question: "",
    answer: "",
    isPublished: "on",
  }}
/>
```

`FaqItemEditDialog` 内の `<FaqItemFormBody>` 呼び出しを変更する。

Before:

```tsx
<FaqItemFormBody
  formId={`faq-item-edit-form-${item.id}`}
  isPending={isPending}
  lastResult={lastResult}
  formAction={formAction}
  defaultValue={{
    categoryId: item.categoryId,
    question: item.question,
    answer: item.answer,
    isPublished: item.isPublished ? "on" : "",
  }}
/>
```

After:

```tsx
<FaqItemFormBody
  mode="edit"
  formId={`faq-item-edit-form-${item.id}`}
  isPending={isPending}
  lastResult={lastResult}
  formAction={formAction}
  defaultValue={{
    categoryId: item.categoryId,
    question: item.question,
    answer: item.answer,
    isPublished: item.isPublished ? "on" : "",
  }}
/>
```

- [ ] **Step 3: `FormBodyProps` に `mode` を追加する**

Before:

```tsx
type FormBodyProps = {
  readonly formId: string;
  readonly isPending: boolean;
  readonly lastResult: SubmissionResult | undefined;
  readonly formAction: (formData: FormData) => void;
  readonly defaultValue: {
    categoryId: string;
    question: string;
    answer: string;
    isPublished: string;
  };
};
```

After:

```tsx
type FormBodyProps = {
  readonly mode: "create" | "edit";
  readonly formId: string;
  readonly isPending: boolean;
  readonly lastResult: SubmissionResult | undefined;
  readonly formAction: (formData: FormData) => void;
  readonly defaultValue: {
    categoryId: string;
    question: string;
    answer: string;
    isPublished: string;
  };
};
```

- [ ] **Step 4: `FaqItemFormBody` の本体を書き換える**

Before（関数シグネチャから質問・回答フィールド部分まで）:

```tsx
function FaqItemFormBody({
  formId,
  isPending,
  lastResult,
  formAction,
  defaultValue,
}: FormBodyProps) {
  const [form, fields] = useForm({
    id: formId,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: faqItemFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue,
  });

  const isPublishedControl = useInputControl(fields.isPublished);
  const isPublished = isPublishedControl.value === "on";

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={formAction} className="space-y-4">
      {/* categoryId は親から固定 */}
      <input
        type="hidden"
        name={fields.categoryId.name}
        value={defaultValue.categoryId}
      />
      <input
        type="hidden"
        name={fields.isPublished.name}
        value={isPublishedControl.value ?? ""}
      />

      <div className="space-y-2">
        <Label htmlFor={fields.question.id}>質問 *</Label>
        <Input
          {...getInputProps(fields.question, { type: "text" })}
          placeholder="例: 予約はいつまでキャンセルできますか？"
          disabled={isPending}
        />
        {fields.question.errors && (
          <p id={fields.question.errorId} className="text-xs text-destructive">
            {fields.question.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fields.answer.id}>回答 *</Label>
        <Textarea
          {...getTextareaProps(fields.answer)}
          placeholder="回答を入力してください。改行は公開ページでも保持されます。"
          rows={8}
          disabled={isPending}
        />
        {fields.answer.errors && (
          <p id={fields.answer.errorId} className="text-xs text-destructive">
            {fields.answer.errors.join(", ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          プレーンテキストのみ。改行は保持されます（5000 文字以内）。
        </p>
      </div>
```

After:

```tsx
function FaqItemFormBody({
  mode,
  formId,
  isPending,
  lastResult,
  formAction,
  defaultValue,
}: FormBodyProps) {
  const [form, fields] = useForm({
    id: formId,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: faqItemFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue,
  });

  const questionControl = useInputControl(fields.question);
  const answerControl = useInputControl(fields.answer);
  const isPublishedControl = useInputControl(fields.isPublished);
  const isPublished = isPublishedControl.value === "on";

  const handleTemplateSelect = (template: FaqItemTemplate) => {
    questionControl.change(template.question);
    answerControl.change(template.answer);
  };

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={formAction} className="space-y-4">
      {/* categoryId は親から固定 */}
      <input
        type="hidden"
        name={fields.categoryId.name}
        value={defaultValue.categoryId}
      />
      <input
        type="hidden"
        name={fields.isPublished.name}
        value={isPublishedControl.value ?? ""}
      />

      {mode === "create" && (
        <FaqItemTemplateSelect
          onSelect={handleTemplateSelect}
          disabled={isPending}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor={fields.question.id}>質問 *</Label>
        <Input
          id={fields.question.id}
          name={fields.question.name}
          type="text"
          value={questionControl.value ?? ""}
          onChange={(e) => questionControl.change(e.target.value)}
          onBlur={questionControl.blur}
          placeholder="例: 予約はいつまでキャンセルできますか？"
          disabled={isPending}
          aria-invalid={fields.question.errors ? true : undefined}
          aria-describedby={
            fields.question.errors ? fields.question.errorId : undefined
          }
        />
        {fields.question.errors && (
          <p id={fields.question.errorId} className="text-xs text-destructive">
            {fields.question.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fields.answer.id}>回答 *</Label>
        <Textarea
          id={fields.answer.id}
          name={fields.answer.name}
          value={answerControl.value ?? ""}
          onChange={(e) => answerControl.change(e.target.value)}
          onBlur={answerControl.blur}
          placeholder="回答を入力してください。改行は公開ページでも保持されます。"
          rows={8}
          disabled={isPending}
          aria-invalid={fields.answer.errors ? true : undefined}
          aria-describedby={
            fields.answer.errors ? fields.answer.errorId : undefined
          }
        />
        {fields.answer.errors && (
          <p id={fields.answer.errorId} className="text-xs text-destructive">
            {fields.answer.errors.join(", ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          プレーンテキストのみ。改行は保持されます（5000 文字以内）。
        </p>
      </div>
```

（このあとの `isPublished` Switch ブロック・エラー表示ブロック・`</form>` は無変更のため
そのまま残す。）

- [ ] **Step 5: `bun run validate` を実行する**

Run: `bun run validate`
Expected: exit 0（type-check + lint エラーなし）。エラーが出た場合は
Global Constraints・上記コード例と実ファイルの差分を確認して修正する。

- [ ] **Step 6: dev server で実ブラウザ確認する**

`bun run dev` は既に手動起動されている前提（Claude からは起動/終了しない）。
`/admin/faq/[categoryId]` を開き、以下を確認する:

1. 「質問を追加」→ ダイアログに「雛形から選ぶ（任意）」Select が表示される
2. グループ（予約・キャンセル / 支払い / 設備・利用 / アクセス・その他）が
   見出し付きで表示される
3. いずれかの雛形を選択 → 質問・回答欄に対応する文面が入力される
4. 文面を編集して保存 → 一覧に反映される（既存の `createFaqItem` フローが壊れていない）
5. 別の雛形を選び直す → 質問・回答欄が新しい雛形の内容で上書きされる
6. 既存項目の「編集」を開く → 雛形 Select が表示されないこと、既存の質問・回答が
   正しく表示・編集・保存できることを確認する（回帰確認）

- [ ] **Step 7: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemDialog.tsx"
git commit -m "feat(admin): wire FAQ item template picker into create dialog"
```

---

## Self-Review メモ

- **spec coverage**: データ(Task1)・UI(Task2)・配線(Task3) の3セクションを spec 通り実装。
  非スコープ（ユーザー保存テンプレート・カテゴリ絞り込み・編集ダイアログへの表示）は
  意図的に対象外のまま
- **placeholder scan**: 全コードブロックは実装可能な完全なコード（TBD・TODO なし）
- **type consistency**: `FaqItemTemplate` / `resolveFaqItemTemplateById` /
  `FaqItemTemplateSelect` の名称は Task 1〜3 で一貫
