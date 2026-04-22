# テストカバレッジギャップ解消計画

## 優先度 P0 テスト実装（フェーズ1：1-2週間）

### 1. `homepage-settings.ts` Integration Test

**ファイル**: `src/app/(admin)/admin/(dashboard)/_shared/actions/homepage-settings.ts`

**実装予定パス**: `__tests__/integration/actions/admin/homepage-settings.test.ts`

#### テスト対象機能

```typescript
// 以下の Server Actions をテスト
-updateHomePageSettings() - // セクション設定保存
  getHomePageSections() - // セクション一覧取得
  updateSectionOrder() - // セクション順序変更
  deleteSection() - // セクション削除
  publishSection(); // セクション公開切り替え
```

#### テストケース案

```typescript
describe("Homepage Settings Integration", () => {
  // ✅ 正常系
  test("セクション設定を保存できる");
  test("セクション順序を変更できる");
  test("セクションを削除できる");
  test("キャッシュが無効化される (updateTag)");

  // ⚠️ エラー系
  test("権限なしはエラー (VIEWER)");
  test("不正なセクションタイプはエラー");
  test("並び替え時のバリデーション");

  // 🔄 キャッシュ
  test("編集後に最新データが返される (read-your-own-writes)");
});
```

#### 実装メモ

- Better Auth モック：`setMockSession({ role: 'ADMIN' })`
- Prisma モック：`mockPageSection.create()`, `mockPageSection.update()`
- キャッシュ検証：`updateTag(CACHE_TAGS.HOMEPAGE_SECTIONS)`

---

### 2. `audit-log.ts` Integration Test

**ファイル**: `src/app/(admin)/admin/(dashboard)/_shared/actions/audit-log.ts`

**実装予定パス**: `__tests__/integration/actions/admin/audit-log.test.ts`

#### テスト対象機能

```typescript
// 以下の Server Actions をテスト
-getAuditLogs() - // ログ取得（フィルタ対応）
  getAuditLogStats() - // ログ統計
  clearAuditLogs(); // ログ削除（SUPER_ADMIN のみ）
```

#### テストケース案

```typescript
describe("Audit Log Integration", () => {
  // ✅ 取得・フィルタ
  test("ログ一覧を取得できる");
  test("ユーザーで絞り込める");
  test("アクション種別で絞り込める");
  test("日付範囲で絞り込める");
  test("ページネーションが動作する");

  // 🔐 権限検査
  test("SUPER_ADMIN は全ログを取得可");
  test("ADMIN は部分的に表示（除外フィールドあり？）");
  test("EDITOR 以下はエラー");

  // ⚙️ 統計
  test("ユーザー別アクション数を集計できる");
  test("アクション別件数を集計できる");
});
```

#### 実装メモ

- logAction() 呼び出しを検証
- 権限チェック：`checkPermission('audit_log', 'read')`
- モック Prisma：`mockAuditLog.findMany()` に filter 検証

---

### 3. E2E: ページ編集フロー

**ファイル**: 新規作成

**実装予定パス**: `e2e/admin/page-edit.spec.ts`

#### テストシナリオ

```typescript
test.describe("ページ編集 - セクション管理", () => {
  test("ページ編集画面でセクションを追加できる", async ({ page }) => {
    // 1. ページ編集ページへ遷移
    // 2. セクション追加ボタンをクリック
    // 3. セクションタイプを選択
    // 4. セクション詳細を入力
    // 5. 保存ボタンをクリック
    // 6. 追加されたことを確認
  });

  test("セクションを削除できる");
  test("セクションを上下に移動できる");
  test("複数セクション編集後に保存できる");
  test("フォーム入力エラーが表示される");
  test("未保存の変更を警告する");
});
```

#### テスト環境

- Lexical エディタが起動することを前提
- Playwright: `locator('data-testid=...')` で要素特定
- ページ遷移：`waitForURL` で確認

#### 実装上の注意

- エディタのレンダリング遅延に対応（`waitForLoadState('networkidle')`）
- キーボード操作（削除キー等）も検証
- 画像アップロードは別テストで対応

---

## 優先度 P1 テスト実装（フェーズ2：2-3週間）

### 1. `editor-comment.ts` Integration Test

**テスト対象**: Lexical エディタ内のコメント機能

#### テストケース

```typescript
describe("Editor Comment Integration", () => {
  test("エディタ内にコメントを追加できる");
  test("コメントに返信できる");
  test("コメント削除権限をチェック");
  test("コメント数をカウント");
  test("未読コメント通知");
});
```

---

### 2. `email-service.ts` Unit Test

**テスト対象**: メール送信ロジック

#### テストケース

```typescript
describe("Email Service Unit", () => {
  // 成功系
  test("シンプルなメールを送信できる");
  test("HTMLテンプレートで送信できる");
  test("添付ファイル付きで送信できる");

  // エラー系
  test("無効なメールアドレスはエラー");
  test("Resend API エラーを握りつぶさない");
  test("リトライロジックが動作する");
});
```

---

### 3. E2E: メディア管理フロー

**テスト対象**: ファイルアップロード・削除・プレビュー

#### テストシナリオ

```typescript
test.describe("メディア管理", () => {
  test("画像をアップロードできる");
  test("複数ファイルをドラッグ&ドロップできる");
  test("アップロード進捗が表示される");
  test("ファイル削除時に確認ダイアログが出る");
  test("削除後にページが更新される");
});
```

---

### 4. `calendar-sync.ts` Unit Test

**テスト対象**: Google Calendar 同期ロジック

#### テストケース

```typescript
describe("Calendar Sync Utility", () => {
  test("イベント同期をスケジュールできる");
  test("重複イベントを検出できる");
  test("タイムゾーン変換が正しい");
  test("削除されたイベントを検出できる");
  test("エラー時にリトライする");
  test("レート制限に対応する");
});
```

---

## 優先度 P2 テスト実装（フェーズ3：時間あれば）

### 1. `post-comment.ts` Integration Test

- ブログコメント機能（承認・拒否フロー）

### 2. `ical-tokens.ts` Integration Test

- iCal フィード用トークンの生成・無効化・更新

### 3. E2E: 設定ページ一式

- SEO設定
- ビジネス設定
- 支払い設定
- ソーシャルリンク設定

### 4. モック改善

- Google Calendar エラーケース（402, 429）
- Stripe Webhook ペイロード
- メール送信失敗シナリオ

---

## 📋 チェックリスト

### フェーズ 1

- [x] homepage-settings.test.ts 実装 — `__tests__/integration/actions/admin/homepage-settings.test.ts` に実装済み（2026-04-22 確認）。個別テストケースの網羅状況は当該ファイル参照
- [x] audit-log.test.ts 実装 — `__tests__/integration/actions/admin/audit-log.test.ts` に実装済み（2026-04-22 確認）

- [x] page-edit.spec.ts 実装 — `e2e/authenticated/admin/pages.spec.ts` の describe ブロック 8「ページ管理 - セクション管理」として実装済み（2026-04-22、+396 行）
  - [x] セクション追加フロー（Dialog 起動・type 選択・件数バッジ検証）
  - [x] セクション削除フロー（オプティミスティック削除 + Sonner「削除しました」トースト）
  - [ ] セクション並び替え — **除外**（dnd-kit `PointerSensor` 8px 閾値と Playwright `mouse.move` の相性で flaky。将来 Playwright native drag API 安定時に追加）
  - [x] バリデーション表示（管理用タイトル保存 + dirty 警告ダイアログ `useConfirm`）

### フェーズ 2

- [x] editor-comment.test.ts — `__tests__/integration/actions/admin/editor-comment.test.ts` に実装済み（2026-04-22 確認）
- [x] ~~email-service.test.ts~~ → **再スコープ実装完了**: `src/shared/lib/email-service.ts` は廃止済みで `src/shared/lib/email/` 11 モジュール分割（SSoT は `send.ts`）。`docs/plans/2026-04-22-email-ssot-tests.md` で再スコープし `__tests__/unit/shared/lib/email/send.test.ts` に 9 describe ブロック（sendEmail: no-op/正常系/retry/エラー・hashForKey: 決定論性/出力長/特殊入力）実装済み（2026-04-22）。副次: `package.json` の ADR 0014 drift（削除済み記録だが実態残存していた `test`/`test:watch`/`test:coverage`/`test:coverage:check`）をクリーンアップ
- [x] media-upload E2E — 既存 `e2e/authenticated/admin/media.spec.ts` に describe ブロック「メディア管理 - ファイルアップロード」（8 tests）追加（2026-04-22、+308 行）。Playwright `setInputFiles()` で in-memory PNG buffer 送信、MIME 拒否（text/plain）・10MB size 超過拒否・dialog state 遷移を検証。DnD / R2 実接続 / バッチ送信は除外（UI/インフラ制約）
- [x] calendar-sync.test.ts — `__tests__/integration/api/cron/calendar-sync.test.ts` + `calendar-event.test.ts` + `calendar-reservation.test.ts` の 3 ファイルで実装済み（2026-04-22 確認）

### フェーズ 3

- [x] post-comment.test.ts — `__tests__/integration/actions/admin/post-comment.test.ts` + `__tests__/unit/domain/post-comments/commands.test.ts`（2026-04-22 確認）
- [x] ical-tokens.test.ts — `__tests__/integration/actions/admin/ical-tokens.test.ts` + `__tests__/integration/api/ical.test.ts` + `__tests__/unit/lib/ical/ical.test.ts`（2026-04-22 確認）
- [x] settings E2E テスト群 — `e2e/authenticated/admin/settings.spec.ts`（2026-04-22 確認）
- [x] モック改善 — **既存テストで網羅済み（2026-04-22 検証）**: (1) GCal retry は `src/shared/lib/google-calendar/retry.ts` SSoT 化済み（429/500/403 reason 判定 + `__tests__/unit/lib/google-calendar/` でカバー）。(2) Resend retry は `src/shared/lib/email/send.ts` SSoT 化 + `__tests__/unit/shared/lib/email/send.test.ts` でカバー（2026-04-22 追加）。(3) Stripe Webhook は `__tests__/unit/api/stripe-webhook.test.ts` 19 tests で `checkout.session.completed` (paid/unpaid/べき等性) / `async_payment_succeeded` / `async_payment_failed` / `checkout.session.expired` (べき等性含む) / `charge.refunded` (べき等性 + edge cases) / 未対応イベント / 署名検証 / 503 設定不正を完全網羅。(4) メール送信失敗シナリオは send.test.ts の retry 動作 / エラーハンドリング describe で完備

---

## 🎯 品質メトリクス目標

| メトリクス                   | 現在  | 目標  | 達成時期 |
| ---------------------------- | ----- | ----- | -------- |
| Integration テストカバレッジ | 75%   | 90%   | 2月末    |
| E2E テストカバレッジ         | 65%   | 85%   | 3月末    |
| モック品質スコア             | 3.0/5 | 4.5/5 | 3月末    |
| 全体テストスコア             | 4.0/5 | 4.5/5 | 3月末    |

---

## 📚 参考資料

- `.claude/rules/test-quality.md` - テスト品質ルール
- `docs/quality/TEST_COVERAGE_ANALYSIS.md` - 詳細分析
- `__tests__/integration/actions/admin/page.test.ts` - テスト例（ページ管理）
- `__tests__/mocks/` - モック実装例

---

**作成日**: 2026年2月11日  
**アップデート**: 最後のテスト追加時に更新
