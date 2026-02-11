# テストカバレッジギャップ解消計画

## 優先度 P0 テスト実装（フェーズ1：1-2週間）

### 1. `homepage-settings.ts` Integration Test

**ファイル**: `src/app/(admin)/admin/(dashboard)/_shared/actions/homepage-settings.ts`

**実装予定パス**: `__tests__/integration/actions/admin/homepage-settings.test.ts`

#### テスト対象機能

```typescript
// 以下の Server Actions をテスト
- updateHomePageSettings()     // セクション設定保存
- getHomePageSections()        // セクション一覧取得
- updateSectionOrder()         // セクション順序変更
- deleteSection()              // セクション削除
- publishSection()             // セクション公開切り替え
```

#### テストケース案

```typescript
describe('Homepage Settings Integration', () => {
  // ✅ 正常系
  test('セクション設定を保存できる')
  test('セクション順序を変更できる')
  test('セクションを削除できる')
  test('キャッシュが無効化される (updateTag)')
  
  // ⚠️ エラー系
  test('権限なしはエラー (VIEWER)')
  test('不正なセクションタイプはエラー')
  test('並び替え時のバリデーション')
  
  // 🔄 キャッシュ
  test('編集後に最新データが返される (read-your-own-writes)')
})
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
- getAuditLogs()            // ログ取得（フィルタ対応）
- getAuditLogStats()        // ログ統計
- clearAuditLogs()          // ログ削除（SUPER_ADMIN のみ）
```

#### テストケース案

```typescript
describe('Audit Log Integration', () => {
  // ✅ 取得・フィルタ
  test('ログ一覧を取得できる')
  test('ユーザーで絞り込める')
  test('アクション種別で絞り込める')
  test('日付範囲で絞り込める')
  test('ページネーションが動作する')
  
  // 🔐 権限検査
  test('SUPER_ADMIN は全ログを取得可')
  test('ADMIN は部分的に表示（除外フィールドあり？）')
  test('EDITOR 以下はエラー')
  
  // ⚙️ 統計
  test('ユーザー別アクション数を集計できる')
  test('アクション別件数を集計できる')
})
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
test.describe('ページ編集 - セクション管理', () => {
  test('ページ編集画面でセクションを追加できる', async ({ page }) => {
    // 1. ページ編集ページへ遷移
    // 2. セクション追加ボタンをクリック
    // 3. セクションタイプを選択
    // 4. セクション詳細を入力
    // 5. 保存ボタンをクリック
    // 6. 追加されたことを確認
  })

  test('セクションを削除できる')
  test('セクションを上下に移動できる')
  test('複数セクション編集後に保存できる')
  test('フォーム入力エラーが表示される')
  test('未保存の変更を警告する')
})
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
describe('Editor Comment Integration', () => {
  test('エディタ内にコメントを追加できる')
  test('コメントに返信できる')
  test('コメント削除権限をチェック')
  test('コメント数をカウント')
  test('未読コメント通知')
})
```

---

### 2. `email-service.ts` Unit Test

**テスト対象**: メール送信ロジック

#### テストケース

```typescript
describe('Email Service Unit', () => {
  // 成功系
  test('シンプルなメールを送信できる')
  test('HTMLテンプレートで送信できる')
  test('添付ファイル付きで送信できる')
  
  // エラー系
  test('無効なメールアドレスはエラー')
  test('Resend API エラーを握りつぶさない')
  test('リトライロジックが動作する')
})
```

---

### 3. E2E: メディア管理フロー

**テスト対象**: ファイルアップロード・削除・プレビュー

#### テストシナリオ

```typescript
test.describe('メディア管理', () => {
  test('画像をアップロードできる')
  test('複数ファイルをドラッグ&ドロップできる')
  test('アップロード進捗が表示される')
  test('ファイル削除時に確認ダイアログが出る')
  test('削除後にページが更新される')
})
```

---

### 4. `calendar-sync.ts` Unit Test

**テスト対象**: Google Calendar 同期ロジック

#### テストケース

```typescript
describe('Calendar Sync Utility', () => {
  test('イベント同期をスケジュールできる')
  test('重複イベントを検出できる')
  test('タイムゾーン変換が正しい')
  test('削除されたイベントを検出できる')
  test('エラー時にリトライする')
  test('レート制限に対応する')
})
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

- [ ] homepage-settings.test.ts 実装
  - [ ] スキーマ定義
  - [ ] 正常系テスト
  - [ ] エラー系テスト
  - [ ] キャッシュ検証

- [ ] audit-log.test.ts 実装
  - [ ] スキーマ定義
  - [ ] 権限検査
  - [ ] フィルタ検証
  - [ ] 統計機能

- [ ] page-edit.spec.ts 実装
  - [ ] セクション追加フロー
  - [ ] セクション削除フロー
  - [ ] セクション並び替え
  - [ ] バリデーション表示

### フェーズ 2

- [ ] editor-comment.test.ts
- [ ] email-service.test.ts
- [ ] media-upload.spec.ts
- [ ] calendar-sync.test.ts

### フェーズ 3

- [ ] post-comment.test.ts
- [ ] ical-tokens.test.ts
- [ ] settings E2E テスト群
- [ ] モック改善

---

## 🎯 品質メトリクス目標

| メトリクス | 現在 | 目標 | 達成時期 |
|-----------|------|------|---------|
| Integration テストカバレッジ | 75% | 90% | 2月末 |
| E2E テストカバレッジ | 65% | 85% | 3月末 |
| モック品質スコア | 3.0/5 | 4.5/5 | 3月末 |
| 全体テストスコア | 4.0/5 | 4.5/5 | 3月末 |

---

## 📚 参考資料

- `.claude/rules/test-quality.md` - テスト品質ルール
- `docs/quality/TEST_COVERAGE_ANALYSIS.md` - 詳細分析
- `__tests__/integration/actions/admin/page.test.ts` - テスト例（ページ管理）
- `__tests__/mocks/` - モック実装例

---

**作成日**: 2026年2月11日  
**アップデート**: 最後のテスト追加時に更新
