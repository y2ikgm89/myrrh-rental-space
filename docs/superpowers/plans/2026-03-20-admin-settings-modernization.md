# Admin Settings Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設定ページ29セクションを `useFormAction` + react-hook-form + Zod 4 パターンに統一し、フィールドレベルバリデーション・dirty 追跡・フォーム状態保持を実現する。

**Architecture:** 既存の `useFormAction` フック + `Form` コンポーネント群を活用。Server Action スキーマ（`nullable()`）とは別にフォーム用スキーマ（空文字列 → null 変換）を新設。SettingsTabs に `shallow: true` + `forceMount` を追加してタブ切替時のフォーム状態を保持。

**Tech Stack:** React Hook Form 7.x, Zod 4, standardSchemaResolver, nuqs 2.8.8, Next.js 16

**Spec:** `docs/superpowers/specs/2026-03-20-admin-settings-modernization.md`

---

## Task 0: インフラ整備

### Task 0-1: SubmitButton に disabled prop を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/SubmitButton.tsx`

- [ ] **Step 1: SubmitButton の disabled prop を追加**

現在 `disabled` は `Omit<ButtonProps, "type" | "disabled">` で除外されている。`disabled` prop を追加し、`isPending || disabled` で制御する:

```tsx
interface SubmitButtonProps extends Omit<ButtonProps, "type" | "disabled"> {
  isPending: boolean;
  label: string;
  pendingLabel?: string;
  onClick?: () => void;
  /** 追加の無効化条件（isDirty 等） */
  disabled?: boolean;
}

function SubmitButton({
  isPending,
  label,
  pendingLabel,
  onClick,
  disabled,
  children,
  ...props
}: SubmitButtonProps) {
  const pending = pendingLabel ?? `${label.replace(/^(.+)$/, "$1")}中...`;

  return (
    <Button
      type={onClick ? "button" : "submit"}
      disabled={isPending || disabled}
      onClick={onClick}
      {...props}
    >
      {isPending ? (
        <>
          <Loader2 className="animate-spin" />
          {pending}
        </>
      ) : (
        (children ?? label)
      )}
    </Button>
  );
}
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`

- [ ] **Step 3: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/ui/SubmitButton.tsx
git commit -m "feat(submit-button): add disabled prop for isDirty support"
```

### Task 0-2: SettingsTabs に shallow: true + forceMount 追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/SettingsTabs.tsx`

- [ ] **Step 1: shallow: true と forceMount を追加**

```tsx
// nuqs でURLパラメータと同期（shallow: true でRSC再レンダリング防止）
const [activeTab, setActiveTab] = useQueryState(
  "tab",
  parseAsStringLiteral(tabValues)
    .withDefault(firstTab)
    .withOptions({ history: "push", shallow: true }),
);

return (
  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
    <TabsList className="mb-2">
      {tabs.map((tab) => (
        <TabsTrigger key={tab.value} value={tab.value}>
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
    {tabs.map((tab) => (
      <TabsContent
        key={tab.value}
        value={tab.value}
        forceMount
        className="data-[state=inactive]:hidden"
      >
        {tab.content}
      </TabsContent>
    ))}
  </Tabs>
);
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`

- [ ] **Step 3: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/settings/_components/SettingsTabs.tsx
git commit -m "fix(settings-tabs): add shallow:true + forceMount for form state preservation"
```

### Task 0-3: 設定フォーム用 Zod スキーマヘルパーとフォーム用スキーマを作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas.ts`

**設計意図:** Server Action スキーマ（`z.string().nullable()`）はサーバーバリデーション用。フォーム用スキーマは空文字列を受け付けて `nullable()` なしで定義する。`useFormAction` は `standardSchemaResolver` 経由でフォーム用スキーマを使い、Server Action は既存スキーマを使い続ける（DRY ではなく責務分離）。

フォーム用スキーマのフィールドは **空文字列をデフォルト値として受け付ける**（`z.string().default("")`）。送信時にフォームデータを Server Action に渡す際、空文字列 → `null` 変換は `useFormAction` の `action` コールバック内で行う。

- [ ] **Step 1: form-schemas.ts を作成**

各セクションのフォーム用スキーマを定義。最初は Batch 1 対象の簡単なセクション分のみ:

```tsx
/**
 * 設定セクション用フォームスキーマ
 *
 * Server Action スキーマ（nullable）とは別に、フォーム入力用スキーマを定義。
 * フォームでは空文字列を許容し、送信時に null に変換する。
 */
import { z } from "zod";

// =============================================================================
// ヘルパー: 空文字列を null に変換するトランスフォーム
// =============================================================================

/** 空文字列 → null 変換用トランスフォーム（Server Action 送信前に適用） */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// =============================================================================
// Site > General
// =============================================================================

export const basicInfoFormSchema = z.object({
  siteName: z.string().max(100, { error: "100文字以内で入力してください" }),
  siteDescription: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  faviconUrl: z.string().max(500, { error: "500文字以内で入力してください" }),
  defaultOgpImageUrl: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  headerLogoUrl: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  footerLogoUrl: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  footerCopyright: z
    .string()
    .max(200, { error: "200文字以内で入力してください" }),
  useHeaderLogo: z.boolean(),
  useFooterLogo: z.boolean(),
});

export type BasicInfoFormInput = z.infer<typeof basicInfoFormSchema>;

export const contactInfoFormSchema = z.object({
  phoneNumber: z.string().max(20, { error: "20文字以内で入力してください" }),
  faxNumber: z.string().max(20, { error: "20文字以内で入力してください" }),
  email: z.union([
    z
      .string()
      .email({ error: "有効なメールアドレスを入力してください" })
      .max(100),
    z.literal(""),
  ]),
  address: z.string().max(500, { error: "500文字以内で入力してください" }),
  postalCode: z.string().max(10, { error: "10文字以内で入力してください" }),
  prefecture: z.string().max(10, { error: "10文字以内で入力してください" }),
  city: z.string().max(50, { error: "50文字以内で入力してください" }),
  streetAddress: z
    .string()
    .max(100, { error: "100文字以内で入力してください" }),
  buildingName: z.string().max(100, { error: "100文字以内で入力してください" }),
});

export type ContactInfoFormInput = z.infer<typeof contactInfoFormSchema>;
```

**注意:** 以降のバッチで残りのスキーマを追加していく。各バッチで必要なスキーマをこのファイルに追記する。

- [ ] **Step 2: schemas/index.ts barrel に追加**

```tsx
export * from "./form-schemas";
```

- [ ] **Step 3: 型チェック確認**

Run: `bun run type-check`

- [ ] **Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/settings/schemas/form-schemas.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/settings/schemas/index.ts
git commit -m "feat(settings): add form-specific Zod schemas for client validation"
```

---

## Task 1: Batch 1 — シンプルなセクション移行（2-5フィールド、条件分岐なし）

各セクションの移行パターンは同一。代表として BasicInfoSection を詳細に記載し、残りは同パターンで実施。

### Task 1-1: BasicInfoSection を useFormAction パターンに移行

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/BasicInfoSection.tsx`

- [ ] **Step 1: 全面書き換え**

旧: `useState` + `useTransition` + `useRefreshOnSuccess` + 手動 `onChange`
新: `useFormAction` + `Form` / `FormField` / `FormMessage` + `isDirty` 追跡

```tsx
"use client";

/**
 * 基本情報セクション
 *
 * サイト名、ロゴ、ファビコン、OGP画像などの基本設定
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Switch,
  Textarea,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  SubmitButton,
} from "@/admin/components/ui";
import { updateBasicInfo } from "@/admin/actions/settings";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import {
  basicInfoFormSchema,
  emptyToNull,
  type BasicInfoFormInput,
} from "@/admin/actions/settings/schemas";
import { useFormAction } from "@/admin/hooks/useFormAction";

interface BasicInfoSectionProps {
  settings: Serialized<SettingsData>;
}

export function BasicInfoSection({ settings }: BasicInfoSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    basicInfoFormSchema,
    (data: BasicInfoFormInput) =>
      updateBasicInfo({
        siteName: emptyToNull(data.siteName),
        siteDescription: emptyToNull(data.siteDescription),
        faviconUrl: emptyToNull(data.faviconUrl),
        defaultOgpImageUrl: emptyToNull(data.defaultOgpImageUrl),
        headerLogoUrl: emptyToNull(data.headerLogoUrl),
        footerLogoUrl: emptyToNull(data.footerLogoUrl),
        footerCopyright: emptyToNull(data.footerCopyright),
        useHeaderLogo: data.useHeaderLogo,
        useFooterLogo: data.useFooterLogo,
      }),
    {
      defaultValues: {
        siteName: settings.siteName ?? "",
        siteDescription: settings.siteDescription ?? "",
        faviconUrl: settings.faviconUrl ?? "",
        defaultOgpImageUrl: settings.defaultOgpImageUrl ?? "",
        headerLogoUrl: settings.headerLogoUrl ?? "",
        footerLogoUrl: settings.footerLogoUrl ?? "",
        footerCopyright: settings.footerCopyright ?? "",
        useHeaderLogo: settings.useHeaderLogo,
        useFooterLogo: settings.useFooterLogo,
      },
      refresh: true,
      successMessage: "基本情報を保存しました",
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
            <CardDescription>サイトの基本的な情報を設定します</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* サイト名 + フッターコピーライト */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="siteName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>サイト名</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Myrrh Rental Space"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="footerCopyright"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>フッターコピーライト</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="2024 Myrrh Rental Space"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* サイト説明 */}
            <FormField
              control={form.control}
              name="siteDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>サイト説明</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="サイトの説明文"
                      rows={2}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ロゴ設定 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="headerLogoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ヘッダーロゴURL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="/images/logo.svg"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormField
                      control={form.control}
                      name="useHeaderLogo"
                      render={({ field: switchField }) => (
                        <div className="flex items-center justify-between pt-1">
                          <FormLabel className="text-sm text-muted-foreground">
                            ヘッダーでロゴを使用
                          </FormLabel>
                          <Switch
                            checked={switchField.value}
                            onCheckedChange={switchField.onChange}
                            disabled={isPending}
                          />
                        </div>
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      OFF時またはロゴ未設定時はサイト名をテキスト表示
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="footerLogoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>フッターロゴURL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="/images/logo-footer.svg"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormField
                      control={form.control}
                      name="useFooterLogo"
                      render={({ field: switchField }) => (
                        <div className="flex items-center justify-between pt-1">
                          <FormLabel className="text-sm text-muted-foreground">
                            フッターでロゴを使用
                          </FormLabel>
                          <Switch
                            checked={switchField.value}
                            onCheckedChange={switchField.onChange}
                            disabled={isPending}
                          />
                        </div>
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      OFF時またはロゴ未設定時はサイト名をテキスト表示
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ファビコン + OGP画像 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="faviconUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ファビコンURL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="/favicon.ico"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultOgpImageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OGP画像URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="/images/ogp.jpg"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <SubmitButton
              isPending={isPending}
              label="基本情報を保存"
              pendingLabel="保存中..."
              disabled={!form.formState.isDirty}
            />
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`

- [ ] **Step 3: ブラウザで動作確認**

`/admin/settings/site` にアクセスし:

- 初期状態で保存ボタンが無効（グレー）であること
- フィールドを変更すると保存ボタンが有効になること
- バリデーションエラー（100文字超等）がフィールド下に表示されること
- 保存成功時にトーストが表示されること

- [ ] **Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/settings/_components/sections/BasicInfoSection.tsx
git commit -m "refactor(basic-info): migrate to useFormAction + react-hook-form"
```

### Task 1-2: ContactInfoSection を移行

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/ContactInfoSection.tsx`

同一パターンで移行。`contactInfoFormSchema` + `useFormAction` + `emptyToNull` 変換。

- [ ] **Step 1: 全面書き換え** — BasicInfoSection と同パターン。`Form` + `FormField` + `FormMessage` で全9フィールドをラップ。email フィールドは `type="email"` を維持。
- [ ] **Step 2: 型チェック** — `bun run type-check`
- [ ] **Step 3: コミット**

### Task 1-3〜1-10: 残りのシンプルなセクションを同パターンで移行

各セクションで:

1. `form-schemas.ts` にフォーム用スキーマを追加
2. セクションコンポーネントを `useFormAction` パターンに全面書き換え
3. 型チェック確認
4. コミット

**対象（フィールド数が少なく条件分岐なし）:**

| Task | セクション            | スキーマ名                 |
| ---- | --------------------- | -------------------------- |
| 1-3  | PermalinkSection      | `permalinkFormSchema`      |
| 1-4  | TurnstileSection      | `turnstileFormSchema`      |
| 1-5  | GoogleMapsSection     | `googleMapsFormSchema`     |
| 1-6  | ICalFeedSection       | `icalFeedFormSchema`       |
| 1-7  | MaintenanceSection    | `maintenanceFormSchema`    |
| 1-8  | PermissionsSection    | `permissionsFormSchema`    |
| 1-9  | TaxSection            | `taxFormSchema`            |
| 1-10 | TermsAgreementSection | `termsAgreementFormSchema` |

- [ ] **Step: 各セクションを移行（上記パターン）**
- [ ] **Step: バッチ全体で型チェック** — `bun run type-check`
- [ ] **Step: バッチコミット**

```bash
git commit -m "refactor(settings): migrate batch 1 simple sections to useFormAction"
```

---

## Task 2: Batch 2 — 中規模セクション移行（5-10フィールド、条件付き表示含む）

### Task 2-1〜2-10: 中規模セクションを移行

各セクションで同パターン。フォーム用スキーマ追加 → コンポーネント書き換え → 型チェック → コミット。

**条件付き表示のポイント:** `useWatch` で監視フィールドの値を取得し、条件分岐で表示制御する:

```tsx
// SeoSection の analyticsType による条件表示
const analyticsType = useWatch({ control: form.control, name: "analyticsType" });

{analyticsType === "ga4" && (
  <FormField control={form.control} name="googleAnalyticsId" render={...} />
)}
```

**対象:**

| Task | セクション           | 特記事項                                              |
| ---- | -------------------- | ----------------------------------------------------- |
| 2-1  | SeoSection           | 3 Card 構成、`analyticsType` 条件表示、1 form で統合  |
| 2-2  | EmailSection         |                                                       |
| 2-3  | NotificationSection  |                                                       |
| 2-4  | MeoSection           |                                                       |
| 2-5  | CookieConsentSection |                                                       |
| 2-6  | HeaderSection        |                                                       |
| 2-7  | FooterSection        |                                                       |
| 2-8  | SidebarSection       |                                                       |
| 2-9  | LayoutSection        | SelectionBox 含む                                     |
| 2-10 | BusinessInfoSection  | `_components/BusinessInfoSection.tsx`（sections/ 外） |

- [ ] **Step: form-schemas.ts にスキーマ追加（10セクション分）**
- [ ] **Step: 各セクションを移行**
- [ ] **Step: バッチ全体で型チェック** — `bun run type-check`
- [ ] **Step: コミット**

```bash
git commit -m "refactor(settings): migrate batch 2 medium sections to useFormAction"
```

---

## Task 3: Batch 3 — 複雑なセクション移行（配列操作、接続テスト、OAuth）

### Task 3-1: ReservationSection

- [ ] 通常の `useFormAction` パターンで移行

### Task 3-2: BusinessHoursSection

複雑な時間帯配列。`useFieldArray` で時間帯を管理:

- [ ] フォーム用スキーマに `businessHoursFormSchema` を追加
- [ ] `useFieldArray` で各曜日の timeSlots を管理
- [ ] 移行 + 型チェック + コミット

### Task 3-3: DiscountSection

割引ルール配列。`useFieldArray` 候補:

- [ ] `discountFormSchema` を追加
- [ ] ルール配列を `useFieldArray` で管理
- [ ] 移行 + 型チェック + コミット

### Task 3-4〜3-9: 接続テスト・OAuth 含むセクション

接続テスト・OAuth ボタンはフォーム送信とは独立。`type="button"` で `<form>` 内に配置:

| Task | セクション            | 特記事項                                      |
| ---- | --------------------- | --------------------------------------------- |
| 3-4  | StripeSection         | 接続テストボタンはフォーム外 or type="button" |
| 3-5  | ResendSection         | 同上                                          |
| 3-6  | CloudflareSection     | 接続テスト + DNS 設定                         |
| 3-7  | GoogleCalendarSection | OAuth + 接続テスト                            |
| 3-8  | TwoWaySyncSection     |                                               |
| 3-9  | InstagramSection      | OAuth 含む                                    |

各セクションのパターン:

- フォーム部分: `useFormAction` で管理
- 接続テストボタン: 既存の `startTransition` + 個別 Server Action を維持（`type="button"` で `<form>` 内に配置）
- OAuth ボタン: リンクとして維持

- [ ] **Step: form-schemas.ts にスキーマ追加**
- [ ] **Step: 各セクションを移行**
- [ ] **Step: バッチ全体で型チェック** — `bun run type-check`
- [ ] **Step: コミット**

```bash
git commit -m "refactor(settings): migrate batch 3 complex sections to useFormAction"
```

---

## Task 4: クリーンアップ

### Task 4-1: useRefreshOnSuccess フックの削除

**Files:**

- Delete: `src/app/(admin)/admin/(dashboard)/settings/_components/hooks/use-refresh-on-success.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/hooks/index.ts`（barrel から削除）

- [ ] **Step 1: 全セクションから `useRefreshOnSuccess` の import が消えていることを確認**

Run: `grep -r "useRefreshOnSuccess" src/app/'(admin)'/admin/'(dashboard)'/settings/`
Expected: 0 件（hooks ファイル自体を除く）

- [ ] **Step 2: hooks ファイルを削除/更新**
- [ ] **Step 3: 型チェック + lint** — `bun run validate`
- [ ] **Step 4: コミット**

```bash
git commit -m "refactor(settings): remove deprecated useRefreshOnSuccess hook"
```

### Task 4-2: 最終検証

- [ ] **Step 1: 全体ビルド確認**

Run: `bun run validate && bun run build`

- [ ] **Step 2: 全設定ページの動作確認チェックリスト**

各設定ページで:

- [ ] 初期表示が正しいこと
- [ ] 未変更時に保存ボタンが無効であること
- [ ] フィールド変更後に保存ボタンが有効になること
- [ ] バリデーションエラーがフィールド下に表示されること
- [ ] 保存成功時にトーストが表示されること
- [ ] タブ切替後もフォーム状態が保持されること（forceMount）

- [ ] **Step 3: 最終コミット**

```bash
git commit -m "refactor(settings): complete modernization to useFormAction pattern"
```
