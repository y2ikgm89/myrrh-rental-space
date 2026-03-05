# テストカバレッジ 10/10 改善設計

**作成日**: 2026-03-05
**目標**: テストスコア 8/10 → 10/10

---

## 背景

2026-03-05 時点のプロジェクト評価でテストスコアが 8/10 と判定された。
未テストの Server Action（10件）と E2E フロー（5領域）を補完することで 10/10 を達成する。

---

## 現状のギャップ

### Integration Tests（未追加: 10ファイル）

| Action ファイル                  | 主な未テスト要素                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `actions/audit-log.ts`           | `filtersSchema`、`parseAuditLogMetadata` ロジック、`AuditLogFilters`/`AuditLogResult`/`AuditLogStats` 型                              |
| `actions/homepage-settings.ts`   | `createSectionSchema`/`updateSectionSchema`/`updateSectionOrderSchema`、`parseSectionConfig` フォールバック、`HomepageSectionData` 型 |
| `actions/editor-comment.ts`      | `createThreadSchema`（2000字/5000字制約）、`addCommentSchema`、`CommentableContentType` 型ガード、`ThreadListItem`/`MarkInfo` 型      |
| `actions/ical-tokens.ts`         | `createTokenSchema`（name/spaceId/expiresInDays）、`ICalTokenWithRelations` 型                                                        |
| `actions/block-template.ts`      | `createBlockTemplateSchema`（name 100字/description 500字/nodeJson 型）、`BlockTemplateListItem` 型                                   |
| `actions/post-comment.ts`        | `CommentFilters` 型、`GetCommentsResult` ページネーション、`AdminCommentData` 型、`CommentStats` 型                                   |
| `actions/dashboard.ts`           | `calcChangePercent` 相当ロジック（前月0→100%、両方0→0%）、`DashboardStats`/`RecentReservation`/`ChartDataPoint` 型                    |
| `actions/preview.ts`             | `generatePreviewHtml` の入力パターン、`Resource` 型制約                                                                               |
| `actions/settings/email.ts`      | `emailSettingsSchema`（senderEmail/replyToEmail email制約）、`notificationSettingsSchema`                                             |
| `actions/settings/robots-txt.ts` | `robotsTxtSettingsSchema`（10000字制約）、`checkRobotsTxtWarnings` ロジック（全体 Disallow 検出、Sitemap 未指定警告）                 |

### E2E Tests（未追加: 5ファイル）

| スペック                     | 対象フロー                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `e2e/admin/pages.spec.ts`    | ページ一覧・新規作成・Lexical エディタ起動・テキスト入力・セクション追加・公開切り替え |
| `e2e/admin/media.spec.ts`    | メディア一覧・画像アップロード・削除確認ダイアログ・検索フィルタ                       |
| `e2e/admin/settings.spec.ts` | 設定ページナビゲーション・基本設定保存・営業時間フォーム・robots.txt 設定              |
| `e2e/admin/faq.spec.ts`      | FAQ カテゴリ作成・編集、FAQ アイテム作成、並び替え                                     |
| `e2e/admin/terms.spec.ts`    | 利用規約一覧・新バージョン作成・内容保存                                               |

---

## 設計方針

### Integration Tests

**既存パターンを踏襲**（`__tests__/integration/actions/admin/faq.test.ts` 等と同形式）:

1. **スキーマ再宣言**: `'use server'` バウンダリを超えないよう、Action ファイル内のローカルスキーマをテスト内で再宣言
2. **バリデーション正常系・異常系**: 境界値・必須フィールド・フォーマット制約を網羅
3. **ロジック検証**: 純粋関数（`parseAuditLogMetadata`, `calcChangePercent`, `checkRobotsTxtWarnings`）は直接実装して検証
4. **型構造テスト**: エクスポートされた型の構造を TypeScript 型システムで検証

**フレームワーク**: `bun:test` (`describe` / `test` / `expect`)
**インポート**: 型・enum のみ `@/shared/generated/prisma/enums` から import

### E2E Tests

**既存パターンを踏襲**（`e2e/admin/news.spec.ts` と同形式）:

1. **認証**: `loginAsAdmin(page)` ヘルパーで各テスト前に認証
2. **データ存在を前提としない**: `if (count === 0) test.skip(...)` で空状態をスキップ
3. **ネットワーク待機**: `waitForLoadState('networkidle')` を全ページ遷移後に実施
4. **URL 追加**: `e2e/fixtures/test-data.ts` の `urls` オブジェクトに不足 URL を追加

---

## 実装詳細

### Integration: audit-log.test.ts

```
describe('Audit Log Admin Action Integration')
  ├── filtersSchema バリデーション
  │   ├── 正常系（デフォルト値、全フィールド設定）
  │   ├── page: 正の整数のみ許可
  │   ├── perPage: 1〜100まで許可（101はエラー）
  │   ├── action: AuditAction enum または "ALL" のみ許可
  │   ├── userId: UUID 形式のみ許可
  │   └── dateFrom/dateTo: 任意文字列（変換は呼び出し側）
  ├── parseAuditLogMetadata ロジック
  │   ├── null/undefined → null を返す
  │   ├── 非オブジェクト → null を返す
  │   ├── ipAddress/userAgent フィールド抽出
  │   └── 追加フィールドのパススルー
  ├── AuditLogItem 型構造
  └── AuditLogStats 型構造
```

### Integration: robots-txt.test.ts（ロジックテストが重要）

```
describe('robots.txt Settings Action Integration')
  ├── robotsTxtSettingsSchema バリデーション
  │   ├── robotsTxtEnabled: boolean のみ
  │   └── robotsTxtCustom: 10000字制限
  └── checkRobotsTxtWarnings ロジック
      ├── User-agent: * + Disallow: / → 警告あり
      ├── Sitemap 未指定 → 警告あり
      ├── Sitemap 指定済み + 通常 Disallow → 警告なし
      └── 空文字 → 警告は Sitemap のみ
```

### Integration: dashboard.test.ts（calcChangePercent ロジック検証）

```
describe('Dashboard Admin Action Integration')
  ├── calcChangePercent 相当ロジック
  │   ├── 通常ケース: (100-80)/80 * 100 = 25
  │   ├── 前月0・今月あり: → 100%
  │   ├── 両方0: → 0%
  │   └── 前月あり・今月0: → -100%
  ├── DashboardStats 型構造
  ├── RecentReservation 型（customerName 結合ロジック）
  └── ChartDataPoint 型（date: MM-DD 形式）
```

### E2E: urls フィクスチャ追加分

```typescript
// e2e/fixtures/test-data.ts に追加
adminPages: '/admin/pages',
adminMedia: '/admin/media',
adminFaq: '/admin/faq',
adminTerms: '/admin/terms',
// settings は既存の adminSettings を使用
```

### E2E: pages.spec.ts（Lexical エディタテスト）

```
describe('ページ管理')
  ├── ページ一覧の表示
  ├── 新規ページ作成ページの表示
  ├── Lexical エディタの起動確認（contenteditable="true" 存在）
  ├── テキスト入力テスト（エディタにフォーカス→文字入力→確認）
  └── 公開切り替えの UI 確認

describe('ページ編集')
  ├── 編集ページへの遷移
  ├── エディタにコンテンツが読み込まれる
  └── 保存ボタンの動作
```

---

## ファイル一覧（新規追加）

```
__tests__/integration/actions/admin/
├── audit-log.test.ts        ← 新規
├── homepage-settings.test.ts ← 新規
├── editor-comment.test.ts   ← 新規
├── ical-tokens.test.ts      ← 新規
├── block-template.test.ts   ← 新規
├── post-comment.test.ts     ← 新規
└── dashboard.test.ts        ← 新規

__tests__/integration/actions/admin/settings/
├── settings-email.test.ts   ← 新規（settings-* パターンに準拠）
└── settings-robots-txt.test.ts ← 新規

__tests__/integration/actions/admin/preview.test.ts ← 新規（または admin/）

e2e/admin/
├── pages.spec.ts            ← 新規
├── media.spec.ts            ← 新規
├── settings.spec.ts         ← 新規
├── faq.spec.ts              ← 新規
└── terms.spec.ts            ← 新規

e2e/fixtures/test-data.ts    ← URL 定数追加のみ
```

---

## 実装順序

```
Step 1: e2e/fixtures/test-data.ts に URL 定数を追加（依存元）
Step 2: Integration Tests 10件 を並列サブエージェントで実装
Step 3: E2E Tests 5件 を並列サブエージェントで実装
Step 4: bun run validate && bun run test:all でパス確認
Step 5: 検証完了後にコミット
```

---

## 成功基準

- `bun run test:all` が全件 PASS
- `bun run validate` が 0 エラー・0 警告
- テストスコア: 8/10 → **10/10**
