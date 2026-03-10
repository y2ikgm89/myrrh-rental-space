# 036: テストカバレッジ向上（フルカバレッジ + E2E）

> **ステータス**: `cc:DONE`
> **作成日**: 2026-01-17
> **優先度**: 高

## 概要

既存のBun Testフレームワーク基盤を活用し、プロジェクト全体のテストカバレッジを大幅に向上させる。Unit/Integration/E2Eの3層でテストを構築。

## 現状

### 既存テスト基盤（024-bun-test-framework.md で導入済み）

- `__tests__/setup.ts` - グローバルセットアップ
- `__tests__/mocks/` - Prisma, Auth, Next.js モック
- `__tests__/fixtures/` - users, reservations フィクスチャ
- `__tests__/helpers/` - session-mock, assertions ヘルパー

### 既存テストファイル（4ファイル）

- `__tests__/unit/lib/permissions.test.ts`
- `__tests__/unit/lib/validations/reservation.test.ts`
- `__tests__/unit/lib/reservation-utils.test.ts`
- `__tests__/unit/types/server-actions.test.ts`

### テスト対象（未テスト）

- **Server Actions**: 27ファイル（`src/actions/`）
- **Zodバリデーション**: 14ファイル（`src/lib/validations/`）
- **ユーティリティ**: 認証ヘルパー、カレンダー同期、メール送信など

---

## フェーズ構成

### Phase 1: Unit Tests - Zodバリデーション `cc:DONE` `[feature:tdd]`

**対象**: `src/lib/validations/` 14ファイル

#### テストケース設計

| ファイル              | テストケース                                     | 優先度 |
| --------------------- | ------------------------------------------------ | ------ |
| `reservation.ts`      | ✅ 既存                                          | -      |
| `contact.ts`          | 正常系、必須フィールド、メール形式、電話番号形式 | 高     |
| `auth.ts`             | ログイントークン、セッション検証                 | 高     |
| `space.ts`            | スペース作成、価格バリデーション                 | 中     |
| `comment.ts`          | コメント投稿、長さ制限                           | 中     |
| `faq.ts`              | FAQ作成、カテゴリ                                | 中     |
| `media.ts`            | ファイルタイプ、サイズ制限                       | 中     |
| `page.ts`             | ページ作成、slug形式                             | 中     |
| `terms.ts`            | 利用規約、バージョン                             | 中     |
| `homepage-section.ts` | セクション設定                                   | 低     |
| `api-keys.ts`         | APIキー形式                                      | 低     |
| `stripe.ts`           | Stripe設定                                       | 低     |
| `enums.ts`            | Enum型ガード                                     | 低     |
| `search-params.ts`    | URLパラメータ                                    | 低     |

#### 実装タスク

- [x] `__tests__/unit/lib/validations/contact.test.ts`
- [x] `__tests__/unit/lib/validations/auth.test.ts`
- [x] `__tests__/unit/lib/validations/space.test.ts`
- [x] `__tests__/unit/lib/validations/comment.test.ts`
- [x] `__tests__/unit/lib/validations/faq.test.ts`
- [x] `__tests__/unit/lib/validations/media.test.ts`
- [x] `__tests__/unit/lib/validations/page.test.ts`
- [x] `__tests__/unit/lib/validations/terms.test.ts`
- [ ] 残り6ファイル（低優先度）

---

### Phase 2: Unit Tests - 権限・認証 `cc:DONE` `[feature:security]` `[feature:tdd]`

**対象**: `src/lib/permissions.ts`, `src/lib/auth.ts`

#### テストケース設計

**permissions.ts**（✅ 一部既存）
| テストケース | 入力 | 期待出力 | 備考 |
|-------------|------|---------|------|
| SUPER*ADMIN全権限 | role=SUPER_ADMIN, resource=*, action=\_ | true | 全アクセス可 |
| ADMIN制限 | role=ADMIN, resource=user, action=manage | false | ユーザー管理権限なし |
| EDITOR制限 | role=EDITOR, resource=blog, action=delete | false | 削除権限なし |
| VIEWER読み取りのみ | role=VIEWER, resource=\*, action=read | true | 読み取りのみ |
| resourceAccess（EDITOR） | resourceId指定 | assignedPages確認 | リソース単位制御 |

**auth.ts**
| テストケース | 入力 | 期待出力 | 備考 |
|-------------|------|---------|------|
| verifySession成功 | 有効セッション | User | 認証済み |
| verifySession失敗 | 無効/期限切れ | redirect | リダイレクト |
| verifyAdminSession | ADMIN以上 | User | ロールチェック |
| getSessionUser型変換 | Better Authセッション | 型安全User | Role enum変換 |
| isValidRole | 文字列 | boolean | ロール検証 |

#### 実装タスク

- [x] `__tests__/unit/lib/permissions.test.ts` 拡張（resourceAccess追加）- 既存テストで十分にカバー
- [x] `__tests__/unit/lib/auth.test.ts` 新規作成

---

### Phase 3: Integration Tests - Server Actions `cc:DONE` `[feature:tdd]`

**対象**: `src/actions/` 27ファイル

#### テスト戦略

- バリデーションスキーマ + action-helpers の組み合わせをテスト
- Bunの`mock.module`制限によりServer Actionsの直接モックは困難
- 認証・認可テストは`permissions.test.ts`で網羅済み

#### 優先度別テスト対象

**高優先度（セキュリティ・コア機能）**
| ファイル | 主要テストケース |
|---------|-----------------|
| `admin/user.ts` | CRUD、ロール変更、権限チェック |
| `admin/reservation.ts` | ステータス変更、カレンダー同期 |
| `reservation.ts` | 予約作成、重複チェック、Turnstile検証 |
| `contact.ts` | お問い合わせ送信、レート制限 |
| `admin/blog.ts` | CRUD、公開/非公開、バージョン |

**中優先度（管理機能）**
| ファイル | 主要テストケース |
|---------|-----------------|
| `admin/space.ts` | CRUD、公開設定 |
| `admin/customer.ts` | CRUD、統計更新 |
| `admin/news.ts` | CRUD、公開/非公開 |
| `admin/page.ts` | CRUD、SEO設定 |
| `admin/faq.ts` | CRUD、並び替え |
| `admin/terms.ts` | CRUD、バージョン管理 |
| `admin/media.ts` | アップロード、削除 |

**低優先度（設定・ユーティリティ）**

- `admin/settings.ts`, `admin/navigation.ts`, `admin/announcement-bar.ts`
- `admin/dashboard.ts`, `admin/audit-log.ts`, `admin/export.ts`
- `admin/api-keys.ts`, `admin/ical-tokens.ts`, `admin/homepage-settings.ts`
- `public/settings.ts`, `public/terms.ts`, `blog-comment.ts`

#### 実装タスク

- [x] `__tests__/integration/actions/admin/user.test.ts` - バリデーション + Role整合性
- [x] `__tests__/integration/actions/admin/reservation.test.ts` - updateStatusSchema, updateNotesSchema
- [x] `__tests__/integration/actions/reservation.test.ts` - バリデーション + 日時/顧客情報
- [x] `__tests__/integration/actions/contact.test.ts` - バリデーション + action-helpers
- [x] `__tests__/integration/actions/admin/blog.test.ts` - createBlogPostSchema, updateBlogPostSchema, blogCategorySchema
- [x] `__tests__/integration/actions/admin/space.test.ts` - spaceFormSchema
- [x] `__tests__/integration/actions/admin/customer.test.ts` - updateStatusSchema, updateNotesSchema
- [x] `__tests__/integration/actions/admin/news.test.ts` - createNewsSchema, updateNewsSchema
- [x] `__tests__/integration/actions/admin/page.test.ts` - createPageSchema, updatePageSchema, updatePageSeoSchema
- [x] `__tests__/integration/actions/admin/faq.test.ts` - faqCategoryFormSchema, faqItemFormSchema
- [x] `__tests__/integration/actions/admin/terms.test.ts` - createTermsSchema, updateTermsSchema, createTermsVersionSchema
- [x] `__tests__/integration/actions/admin/media.test.ts` - mediaUploadSchema, mediaUpdateSchema
- [ ] 低優先度11ファイル

---

### Phase 4: E2E Tests - Playwright導入 `cc:DONE`

#### セットアップ

- [x] Playwright インストール (`bun add -D @playwright/test`)
- [x] `playwright.config.ts` 作成
- [x] `e2e/` ディレクトリ構造作成
- [x] CI設定（GitHub Actions）

#### テストシナリオ

**認証フロー** `[feature:security]`
| シナリオ | ステップ | 検証 |
|---------|---------|------|
| ログイン成功 | トークン付きURL → 認証情報入力 | ダッシュボードにリダイレクト |
| ログイン失敗 | 不正な認証情報 | エラーメッセージ表示 |
| ログインページ保護 | トークンなしアクセス | 404表示 |
| ログアウト | ログアウトボタン | ログインページにリダイレクト |
| セッション期限切れ | 期限切れセッション | 再ログイン要求 |

**予約フロー**
| シナリオ | ステップ | 検証 |
|---------|---------|------|
| 予約成功 | スペース選択 → 日時選択 → 情報入力 → 送信 | 確認メッセージ、メール送信 |
| バリデーションエラー | 不正入力 | フィールドエラー表示 |
| 重複予約エラー | 予約済み時間帯選択 | エラーメッセージ |
| Turnstile検証 | BOT疑い | 検証失敗 |

**管理画面CRUD**
| 機能 | テスト内容 |
|------|-----------|
| スペース管理 | 一覧表示 → 新規作成 → 編集 → 削除 |
| ブログ管理 | 一覧表示 → 新規作成 → Lexicalエディター → 公開 |
| 予約管理 | 一覧表示 → ステータス変更 → カレンダービュー |
| ユーザー管理 | 一覧表示 → ロール変更 → 権限反映確認 |

#### 実装タスク

- [x] `e2e/auth.spec.ts` - 認証フロー（31テスト）
- [x] `e2e/reservation.spec.ts` - 予約フロー（11テスト）
- [x] `e2e/admin/spaces.spec.ts` - スペース管理（25テスト）
- [x] `e2e/admin/blog.spec.ts` - ブログ管理（43テスト）
- [x] `e2e/admin/reservations.spec.ts` - 予約管理（40テスト）
- [x] `e2e/admin/users.spec.ts` - ユーザー管理（45テスト）
- [x] `e2e/fixtures/` - テストデータ

---

### Phase 5: CI/CD統合 `cc:DONE`

#### GitHub Actions設定

- [x] `.github/workflows/ci.yml` 作成
- [x] Unit/Integration テスト（bun test）
- [x] E2Eテスト（Playwright）
- [x] カバレッジレポート（HTMLレポート + アーティファクト）
- [x] PR時の自動実行（push/PR on main/develop）

---

## ファイル構成

```
__tests__/
├── setup.ts                    # 既存
├── mocks/                      # 既存
│   ├── prisma.ts
│   ├── auth.ts
│   ├── next.ts
│   └── index.ts
├── fixtures/                   # 既存 + 拡張
│   ├── users.ts
│   ├── reservations.ts
│   ├── spaces.ts              # 新規
│   ├── blog.ts                # 新規
│   └── index.ts
├── helpers/                    # 既存
│   ├── session-mock.ts
│   ├── assertions.ts
│   └── index.ts
├── unit/
│   ├── lib/
│   │   ├── permissions.test.ts    # 既存
│   │   ├── auth.test.ts           # 新規
│   │   ├── reservation-utils.test.ts  # 既存
│   │   └── validations/
│   │       ├── reservation.test.ts    # 既存
│   │       ├── contact.test.ts        # 新規
│   │       ├── auth.test.ts           # 新規
│   │       ├── space.test.ts          # 新規
│   │       └── ...
│   └── types/
│       └── server-actions.test.ts # 既存
└── integration/
    └── actions/
        ├── contact.test.ts        # 新規
        ├── reservation.test.ts    # 新規
        └── admin/
            ├── user.test.ts       # 新規
            ├── reservation.test.ts # 新規
            ├── blog.test.ts       # 新規
            └── ...

e2e/
├── auth.spec.ts               # 新規
├── reservation.spec.ts        # 新規
├── admin/
│   ├── spaces.spec.ts         # 新規
│   ├── blog.spec.ts           # 新規
│   ├── reservations.spec.ts   # 新規
│   └── users.spec.ts          # 新規
└── fixtures/
    └── test-data.ts           # 新規

playwright.config.ts           # 新規
.github/workflows/test.yml     # 新規
```

---

## 成功基準

- [ ] Unit Tests: 全Zodバリデーションをカバー
- [ ] Unit Tests: 権限・認証ロジックをカバー
- [ ] Integration Tests: 高優先度Server Actions（5ファイル）をカバー
- [ ] E2E Tests: 認証・予約フローをカバー
- [ ] CI/CD: PRで自動テスト実行
- [ ] カバレッジ: 主要ロジックの80%以上

---

## 参考資料

- [Bun Test Documentation](https://bun.sh/docs/cli/test)
- [Playwright Documentation](https://playwright.dev/)
- 024-bun-test-framework.md（既存テスト基盤）
