# メールテンプレート管理機能 — 仕様書

**作成日:** 2026-04-17
**スコープ:** 管理画面からメール本文（件名・挨拶・導入文・締め文）を編集可能にする。破壊的変更許容、公式ベストプラクティス準拠、後方互換性なし。

---

## 1. 背景

現状、全 17 種のメールテンプレートは `src/shared/emails/*.tsx` にハードコードされており、本文変更にはコード編集とデプロイが必要。運用担当者が文言を調整したい業務要件に対し、業界標準（Shopify / WooCommerce 型）の「部分 DB 化」を実装する。

**非目標 (MVP スコープ外):**

- WYSIWYG（リッチテキスト）エディタ — プレーンテキスト + 変数プレースホルダーのみ
- メール種別ごとのレイアウト変更 — React Email 骨格はコード管理のまま
- 新規メール種別の追加機能 — 17 種固定、追加はコード改修が必要
- 多言語対応 — 日本語のみ
- A/B テスト・配信統計

---

## 2. ユーザーストーリー

**管理者として、私は:**

1. `/admin/settings/email-templates` で 17 種のテンプレート一覧を見られる
2. 各テンプレートの有効/無効を切り替えられる（無効時は送信スキップ）
3. `/admin/settings/email-templates/[type]/edit` で件名・挨拶・導入文・締め文を編集できる
4. 編集画面で使える変数一覧（`{{customerName}}` 等）をインライン表示できる
5. リアルタイムで差し込み済みプレビューを確認できる
6. 自分のメールアドレスへテスト送信できる
7. 保存後、次回送信から反映される（キャッシュ即時無効化）

---

## 3. 編集可能フィールド

各テンプレート 4 フィールド。全て Mustache 風プレースホルダー `{{variable}}` を含められる。

| フィールド | 型                        | 説明               | 例                                                                                   |
| ---------- | ------------------------- | ------------------ | ------------------------------------------------------------------------------------ |
| `subject`  | `String @db.VarChar(256)` | メール件名         | `【ご予約確認】{{spaceName}} - {{reservationDate}}`                                  |
| `greeting` | `String @db.VarChar(256)` | 冒頭挨拶           | `{{customerName}} 様`                                                                |
| `intro`    | `String @db.Text`         | 導入文（本文冒頭） | `この度はご予約いただき、誠にありがとうございます。以下の内容でご予約を承りました。` |
| `outro`    | `String @db.Text`         | 締め文（本文末尾） | `ご不明な点がございましたら、お気軽にお問い合わせください。`                         |

Settings シングルトンへの追加:

| カラム                    | 型                        | 用途                               |
| ------------------------- | ------------------------- | ---------------------------------- |
| `emailSubjectPrefix`      | `String? @db.VarChar(32)` | 全件名先頭に付与（例: `[Myrrh] `） |
| `emailFooterNote`         | `String? @db.Text`        | フッター追加案内（任意）           |
| `emailSupportContactText` | `String? @db.Text`        | サポート連絡先テキスト             |

---

## 4. 対象メール種別と変数

### 4.1 EmailTemplateType (17 種)

```typescript
// src/shared/lib/validations/enums/helpers.ts
export const EMAIL_TEMPLATE_TYPE = {
  RESERVATION_CONFIRMATION: "reservation_confirmation",
  RESERVATION_CANCELLED: "reservation_cancelled",
  RESERVATION_STATUS_CHANGED: "reservation_status_changed",
  RESERVATION_REMINDER: "reservation_reminder",
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
  RESERVATION_UPDATED: "reservation_updated",
} as const;
```

### 4.2 変数マップ (template-registry.ts)

各 type で利用可能な変数を型安全に定義。管理画面でヘルプ表示に使う。

| Type                              | 変数                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `reservation_confirmation`        | `customerName`, `spaceName`, `reservationDate`, `startTime`, `endTime`, `totalPrice`, `reservationId`, `notes`                     |
| `reservation_cancelled`           | `customerName`, `spaceName`, `reservationDate`, `startTime`, `endTime`, `reservationId`                                            |
| `reservation_status_changed`      | `customerName`, `spaceName`, `reservationDate`, `startTime`, `endTime`, `reservationId`, `previousStatus`, `newStatus`, `action`   |
| `reservation_reminder`            | `customerName`, `spaceName`, `reservationDate`, `startTime`, `endTime`, `reservationId`                                            |
| `reservation_updated`             | `customerName`, `spaceName`, `reservationDate`, `startTime`, `endTime`, `reservationId`                                            |
| `admin_notification`              | `customerName`, `customerEmail`, `spaceName`, `reservationDate`, `startTime`, `endTime`, `totalPrice`, `reservationId`, `adminUrl` |
| `event_registration_confirmation` | `customerName`, `eventTitle`, `eventDate`, `startTime`, `endTime`, `location`, `registrationId`                                    |
| `event_registration_cancelled`    | `customerName`, `eventTitle`, `eventDate`, `registrationId`                                                                        |
| `event_admin_notification`        | `customerName`, `customerEmail`, `eventTitle`, `eventDate`, `registrationId`, `adminUrl`                                           |
| `event_cancelled_notification`    | `customerName`, `eventTitle`, `eventDate`, `reason`                                                                                |
| `event_updated_notification`      | `customerName`, `eventTitle`, `eventDate`, `startTime`, `endTime`, `location`, `changeSummary`                                     |
| `contact_confirmation`            | `customerName`, `inquirySubject`, `inquiryId`                                                                                      |
| `inquiry_reply`                   | `customerName`, `inquirySubject`, `replyMessage`, `inquiryId`                                                                      |
| `review_reply`                    | `customerName`, `spaceName`, `reviewRating`, `reviewComment`, `replyMessage`                                                       |
| `welcome`                         | `customerName`, `loginUrl`                                                                                                         |
| `password_reset`                  | `customerName`, `resetUrl`, `expiresInHours`                                                                                       |
| `staff_invitation`                | `inviterName`, `role`, `invitationUrl`, `expiresAt`                                                                                |

---

## 5. 変数差し込みエンジン仕様

**`renderTemplate(template: string, variables: Record<string, string>): string`**

- `{{key}}` を `variables[key]` で置換
- `{{undefined_key}}` は `""` に置換（エラーにしない、ログ出力のみ）
- ネスト不可 (`{{a.b}}` は literal 扱い)
- HTML エスケープは行わない（Resend/React Email 側で処理される）
- 特殊文字 `{`, `}` そのものを含めたい場合は `{{{`, `}}}` で escape（cost 低い実装）

**`renderTemplateWithDefaults(type, template, data)`**:

- 変数マップに定義された未提供の変数を空文字で補完
- 型レベルで欠落変数を検出する discriminated union TypeScript 関数

---

## 6. 管理画面 UI

### 6.1 一覧ページ `/admin/settings/email-templates`

- 17 種の表形式: 種別名 / 件名プレビュー / ステータス (有効/無効スイッチ) / 操作 (編集ボタン)
- タイトル: 「メールテンプレート」
- サブタイトル: 「送信されるメール本文の編集ができます」
- `BaseFilters` による検索不要（17 種固定のため）
- 権限: `emailTemplate:read` (閲覧), `emailTemplate:update` (編集)

### 6.2 編集ページ `/admin/settings/email-templates/[type]/edit`

- AdminDetailLayout: 戻るリンク（`/admin/settings/email-templates`）
- 左カラム: フォーム（件名 / 挨拶 / 導入文 / 締め文 / 有効スイッチ）
- 右カラム: 「利用可能な変数」パネル + リアルタイムプレビュー
- 下部: 保存ボタン + テスト送信ボタン（別セクション）

### 6.3 プレビュー

- Client Component で `useWatch` により RHF 値を監視
- ダミー変数値（例: `customerName = "山田太郎"`）を注入して `renderTemplate` 実行
- 完全な React Email コンポーネントレンダリングではなく、4 フィールドのプレーンテキスト表示
- 「※実際のメールでは装飾・レイアウトが適用されます」の注意書き

### 6.4 テスト送信

- ログイン管理者のメールアドレスへ送信（SUPER_ADMIN/ADMIN のみ）
- 送信フロー: 管理画面フォームの unsaved 値 → `sendTestEmail(type, draftValues)` Server Action → 送信関数を呼び出し → ダミー変数値で実データ化
- 結果は toast 表示 (`sonner`)

---

## 7. 非破壊的性の破棄（破壊的変更一覧）

1. **`src/shared/emails/*.tsx` 17 ファイル** — ハードコード文字列を全て削除し、props で受け取る構造に変更
2. **`src/shared/lib/email/*.ts` 9 ファイル** — テンプレート取得層を追加し、ハードコード件名を削除
3. **Resend `subject` 引数** — DB 由来に変更（既存のハードコード式 `\`【ご予約確認】${data.spaceName}\`` は削除）
4. **新規 `Prisma EmailTemplate` モデル + migration**
5. **`Settings` モデル 3 カラム追加**
6. **権限 `emailTemplate` 新規追加** — `admin-resources.ts` / `ROLE_PERMISSIONS`（`permissions.ts`）に追加

---

## 8. キャッシュ戦略

- `CACHE_TAGS.EMAIL_TEMPLATES` 新設
- `getEmailTemplate(type)` に `'use cache'` + `cacheLife(CACHE_LIFE.STATIC_SETTINGS)` + `cacheTag(CACHE_TAGS.EMAIL_TEMPLATES, getCacheTag.emailTemplates.detail(type))`
- `updateEmailTemplate` / `toggleEmailTemplateEnabled` の `afterSuccess` で `updateTag(CACHE_TAGS.EMAIL_TEMPLATES)` + `updateTag(getCacheTag.emailTemplates.detail(type))`

---

## 9. テスト戦略

- **Unit**: `variables.ts` の `renderTemplate` (変数置換 / 未定義変数 / 特殊文字 / ネスト無視)
- **Integration**: EmailTemplate CRUD (create via seed, update via Server Action, get via cached query)
- **Mock**: `sendReservationConfirmationEmail` の呼び出しで DB から取得した template で件名組み立てが行われることを検証

---

## 10. デプロイ手順

1. migration 適用 (`prisma migrate dev --name add_email_template`)
2. seed 実行で 17 種デフォルト登録 (`bun prisma/seed.ts`)
3. 既存 DB のメール送信が新フローで動作することを validate（テスト送信で確認）
