# Admin Settings Modernization

> 設定ページ29セクションを `useFormAction` + react-hook-form + Zod 4 パターンに統一

## Background

管理画面の CRUD フォーム（LocationForm, ReservationForm, CouponForm 等）は既に以下のモダンパターンを使用:

- `useFormAction` フック（react-hook-form + standardSchemaResolver + useTransition + toast）
- `Form` / `FormField` / `FormItem` / `FormLabel` / `FormControl` / `FormMessage` コンポーネント
- Zod 4 スキーマによるクライアント + サーバー両面バリデーション
- `formState.isDirty` による変更検知

しかし **設定ページ29セクション**は旧パターンのまま:

- `useState` + 手動 `onChange` ハンドラ（100+ 箇所の `setFormData({ ...formData, field: e.target.value })` 重複）
- クライアントバリデーションなし（エラーは toast のみ）
- フィールドレベルエラー表示なし
- dirty 追跡なし（常に保存ボタンが有効）
- `useRefreshOnSuccess` フック（`useFormAction` で代替可能）

## Design

### 1. 各設定セクションを `useFormAction` パターンに移行

**Before（旧パターン — BasicInfoSection）:**

```tsx
const { handleResult } = useRefreshOnSuccess();
const [isPending, startTransition] = useTransition();
const [formData, setFormData] = useState({
  siteName: settings.siteName || "",
  siteDescription: settings.siteDescription || "",
});

const handleSave = () => {
  startTransition(async () => {
    const result = await updateBasicInfo({
      siteName: formData.siteName || null,
    });
    handleResult(result, "基本情報を保存しました");
  });
};

<Input
  value={formData.siteName}
  onChange={(e) => setFormData({ ...formData, siteName: e.target.value })}
/>
<SubmitButton isPending={isPending} onClick={handleSave} label="保存" />
```

**After（新パターン）:**

```tsx
const { form, isPending, onSubmit } = useFormAction(
  basicInfoSchema,
  updateBasicInfo,
  { defaultValues: { siteName: settings.siteName ?? "", ... }, refresh: true, successMessage: "基本情報を保存しました" }
);

<Form {...form}>
  <form onSubmit={onSubmit}>
    <FormField control={form.control} name="siteName" render={({ field }) => (
      <FormItem>
        <FormLabel>サイト名</FormLabel>
        <FormControl><Input {...field} disabled={isPending} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
    <SubmitButton isPending={isPending} label="保存" disabled={!form.formState.isDirty} />
  </form>
</Form>
```

### 2. useFormAction の設定セクション向け拡張

現在の `useFormAction` は `<form onSubmit>` パターン前提だが、設定セクションは Card 内に保存ボタンがある（`<form>` タグはネスト問題を起こす可能性がある — 同一タブ内に複数セクションが並ぶため）。

**対応:** 設定セクションでは各 Card を `<form onSubmit>` でラップする。タブ内の複数 Card は独立した `<form>` なのでネスト問題なし（HTML 仕様で `<form>` のネストは禁止だが、兄弟としての並列は許可）。

### 3. Zod スキーマの配置

設定セクション用 Zod スキーマは既に `_shared/actions/settings/schemas/basic.ts` 等に存在。Server Action 側で使用済みだが、同じスキーマを `useFormAction` の `standardSchemaResolver` にも渡す（DRY — 1 スキーマで両面バリデーション）。

**課題:** 現在の Server Action スキーマは `null` を許容する形式（`z.string().nullable()`）だが、フォームでは空文字列で管理し送信時に `null` 変換する。

**対応:** フォーム用スキーマを新設。空文字列を受け付けてサーバー送信時に `null` へ変換する `transform` を使用:

```tsx
// 設定フォーム用のヘルパー
const optionalString = z.string().transform((v) => v.trim() || null);

const basicInfoFormSchema = z.object({
  siteName: optionalString,
  siteDescription: optionalString,
  // ...
});
```

### 4. SettingsTabs の修正

**Before:**

```tsx
const [activeTab, setActiveTab] = useQueryState(
  "tab",
  parseAsStringLiteral(tabValues).withDefault(firstTab),
);
```

**After:**

```tsx
const [activeTab, setActiveTab] = useQueryState(
  "tab",
  parseAsStringLiteral(tabValues)
    .withDefault(firstTab)
    .withOptions({ history: "push", shallow: true }),
);
```

さらに `forceMount` + `data-[state=inactive]:hidden` を追加してタブ切替時のフォーム状態を保持。

### 5. SubmitButton の isDirty 対応

`SubmitButton` コンポーネントに `disabled` prop を追加（`isPending` に加えて `isDirty` で制御）:

```tsx
<SubmitButton
  isPending={isPending}
  label="保存"
  disabled={!form.formState.isDirty}
/>
```

既存の `SubmitButton` は `onClick` 型（`type="button"`）と `type="submit"` の両方をサポートしているか確認が必要。設定セクションでは `<form onSubmit>` パターンに移行するため `type="submit"` を使用。

### 6. useRefreshOnSuccess の廃止

`useFormAction` の `refresh: true` オプションで代替。移行完了後に `useRefreshOnSuccess` フックを削除。

### 7. 対象セクション一覧（29セクション）

**標準フォームセクション（useState → useFormAction）:**

| #   | セクション            | 推定フィールド数 | 特記事項                                   |
| --- | --------------------- | ---------------- | ------------------------------------------ |
| 1   | BasicInfoSection      | 8                | Switch 2個含む                             |
| 2   | ContactInfoSection    | 9                |                                            |
| 3   | SeoSection            | 10               | 条件付き表示（analyticsType）、3 Card 構成 |
| 4   | LayoutSection         | ~5               | SelectionBox                               |
| 5   | HeaderSection         | ~4               |                                            |
| 6   | FooterSection         | ~6               |                                            |
| 7   | SidebarSection        | ~3               |                                            |
| 8   | PermalinkSection      | ~2               |                                            |
| 9   | BusinessInfoSection   | ~6               |                                            |
| 10  | BusinessHoursSection  | ~14              | 複雑な時間帯配列                           |
| 11  | ReservationSection    | ~8               |                                            |
| 12  | TermsAgreementSection | ~3               |                                            |
| 13  | MeoSection            | ~4               |                                            |
| 14  | DiscountSection       | ~動的            | useFieldArray 候補（ルール配列）           |
| 15  | TaxSection            | ~3               |                                            |
| 16  | EmailSection          | ~5               |                                            |
| 17  | NotificationSection   | ~4               |                                            |
| 18  | StripeSection         | ~3               | 接続テスト含む                             |
| 19  | MaintenanceSection    | ~3               |                                            |
| 20  | CookieConsentSection  | ~5               |                                            |
| 21  | PermissionsSection    | ~2               |                                            |
| 22  | ResendSection         | ~2               | 接続テスト含む                             |
| 23  | TurnstileSection      | ~2               |                                            |
| 24  | GoogleMapsSection     | ~1               |                                            |
| 25  | CloudflareSection     | ~6               | 接続テスト含む                             |
| 26  | GoogleCalendarSection | ~5               | OAuth + 接続テスト                         |
| 27  | TwoWaySyncSection     | ~3               |                                            |
| 28  | InstagramSection      | ~2               | OAuth 含む                                 |
| 29  | ICalFeedSection       | ~2               |                                            |

**特殊セクション（フォーム移行対象外 or 個別対応）:**

- `RobotsTxtSection` — Lexical エディタベース、フォームではない
- `CustomApiKeysSection` — CRUD テーブル（独自の追加/削除 UI）

### 8. SeoSection の構造変更

SeoSection は現在 1 セクション = 3 Card + 1 保存ボタン。新パターンでは **各 Card を独立したフォームにするか、1 フォームに統合するか** の選択がある。

**推奨: 1 フォーム + 3 Card 維持** — SeoSection は「メタ情報」「Analytics」「検索エンジン」が密結合（同一 Server Action で保存）。1 つの `<form>` で3 Card をラップし、保存ボタンはフォーム末尾に配置。

### 9. 外部接続テストボタンの扱い

Stripe、Resend、Cloudflare、Google Calendar セクションには「接続テスト」ボタンがある。これはフォーム送信とは別のアクションなので `<form>` 外に配置するか、`type="button"` で明示する。

## Out of Scope

- CRUD ページ（既に useFormAction パターン適用済み）
- ダッシュボードページ
- Navigation/AnnouncementBar（独自の CRUD UI）
- Lexical エディタ関連

## Migration Strategy

バッチ単位で移行。各バッチは独立して動作し、部分的な移行状態でもビルドが通る:

1. **Batch 0**: インフラ整備（SettingsTabs 修正、SubmitButton isDirty 対応、フォーム用スキーマヘルパー）
2. **Batch 1**: シンプルなセクション（2-5 フィールド、条件分岐なし）— 10セクション
3. **Batch 2**: 中規模セクション（5-10 フィールド、条件付き表示）— 10セクション
4. **Batch 3**: 複雑なセクション（配列操作、接続テスト、OAuth）— 9セクション
5. **Batch 4**: クリーンアップ（useRefreshOnSuccess 削除、未使用コード除去）
