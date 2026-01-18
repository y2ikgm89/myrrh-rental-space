# 042: 管理/公開 完全分離アーキテクチャ

## 概要

管理ページと公開ページのコンポーネント・ライブラリを完全に分離し、
顧客ごとのカスタマイズとAIによる変更影響把握を容易にする。

## 背景

- 顧客ごとに管理画面も公開ページもカスタマイズが異なる
- 共有コンポーネントがあると変更時の影響範囲が不明確
- AIが変更影響を理解しやすい構造が必要

## 目標アーキテクチャ

### Before（現状）

```
src/
├── components/
│   ├── admin/          # 管理専用 ✅
│   ├── site/           # 公開専用 ✅
│   ├── layouts/        # ⚠️ 共有（Header, Footer）
│   ├── a11y/           # ⚠️ 共有
│   ├── analytics/      # ⚠️ 共有
│   ├── seo/            # ⚠️ 共有
│   └── Turnstile.tsx   # ⚠️ 共有
├── lib/                # ⚠️ 完全共有
└── types/              # ⚠️ 完全共有
```

### After（目標）

```
src/
├── admin/                    # 管理画面すべて
│   ├── components/           # 管理専用コンポーネント
│   │   ├── ui/              # shadcn/ui ベース
│   │   ├── editor/
│   │   ├── media-picker/
│   │   └── ...
│   ├── lib/                  # 管理専用ライブラリ
│   │   ├── validations/
│   │   ├── permissions.ts
│   │   └── audit.ts
│   └── types/                # 管理専用型定義
│
├── public/                   # 公開ページすべて
│   ├── components/           # 公開専用コンポーネント
│   │   ├── ui/              # サイトUI
│   │   ├── layouts/         # Header, Footer
│   │   ├── sections/
│   │   ├── sidebar/
│   │   ├── a11y/
│   │   ├── analytics/
│   │   └── seo/
│   ├── lib/                  # 公開専用ライブラリ
│   │   ├── blog-queries.ts
│   │   └── page-metadata.ts
│   └── types/                # 公開専用型定義
│
├── shared/                   # 真に共有が必要なもののみ
│   ├── lib/
│   │   ├── prisma.ts        # DBクライアント
│   │   ├── auth.ts          # 認証
│   │   ├── utils.ts         # 汎用ユーティリティ
│   │   ├── email-service.ts # メール送信
│   │   └── crypto.ts        # 暗号化
│   └── types/
│       ├── prisma.ts        # Prisma生成型
│       └── common.ts        # 共通型（ID, Date等）
│
└── app/                      # ルート（変更なし）
    ├── (admin)/
    ├── (public)/
    └── api/
```

## 分離ルール

### 共有を許可するもの（shared/）

| カテゴリ | ファイル | 理由 |
|---------|---------|------|
| **DB** | prisma.ts, supabase.ts | 同一DB接続 |
| **認証** | auth.ts, auth-client.ts | 共通認証基盤 |
| **暗号化** | crypto.ts | セキュリティ共通 |
| **メール** | email-service.ts, email.ts | 送信基盤 |
| **ユーティリティ** | utils.ts | 汎用関数 |
| **型** | Prisma生成型, 共通ID型 | 型安全性 |

### 分離するもの

| カテゴリ | 移動先 | 理由 |
|---------|--------|------|
| **Header/Footer** | public/components/layouts/ | 公開ページ専用デザイン |
| **a11y** | public/components/a11y/ | 公開ページのa11y |
| **analytics** | public/components/analytics/ | 公開ページ分析 |
| **seo** | public/components/seo/ | 公開ページSEO |
| **Turnstile** | public/components/ | 公開フォーム専用 |
| **permissions** | admin/lib/ | 管理専用 |
| **audit** | admin/lib/ | 管理専用 |
| **utils (formatChange等)** | admin/lib/ | ダッシュボード・メディア管理専用 |
| **blog-queries** | public/lib/ | 公開専用 |

---

## 実装計画

### Phase 1: ディレクトリ構造作成 `cc:DONE`

新しいディレクトリ構造を作成し、パスエイリアスを設定。

- [x] `src/admin/`, `src/public/`, `src/shared/` ディレクトリ作成
- [x] tsconfig.json のパスエイリアス更新
  - `@/admin/*` → `src/admin/*`
  - `@/public/*` → `src/public/*`
  - `@/shared/*` → `src/shared/*`

### Phase 2: shared/ への移動 `cc:DONE`

真に共有が必要なファイルを shared/ に移動。

- [x] `src/lib/prisma.ts` → `src/shared/lib/prisma.ts`
- [x] `src/lib/auth.ts` → `src/shared/lib/auth.ts`
- [x] `src/lib/auth-client.ts` → `src/shared/lib/auth-client.ts`
- [x] `src/lib/crypto.ts` → `src/shared/lib/crypto.ts`
- [x] `src/lib/utils.ts` → `src/shared/lib/utils.ts`
- [x] `src/lib/email.ts` → `src/shared/lib/email.ts`
- [x] `src/lib/email-service.ts` → `src/shared/lib/email-service.ts`
- [x] `src/lib/supabase.ts` → `src/shared/lib/supabase.ts`
- [x] `src/lib/storage.ts` → `src/shared/lib/storage.ts`
- [x] `src/lib/turnstile.ts` → `src/shared/lib/turnstile.ts`
- [x] `src/lib/rate-limit.ts` → `src/shared/lib/rate-limit.ts`
- [x] `src/lib/action-helpers.ts` → `src/shared/lib/action-helpers.ts`
- [x] `src/lib/json-validators.ts` → `src/shared/lib/json-validators.ts`
- [x] `src/generated/prisma/` → `src/shared/generated/prisma/`
- [x] import パス更新（@/lib/ → @/shared/lib/）

### Phase 3: admin/ への移動 `cc:DONE`

管理画面専用ファイルを admin/ に移動。

- [x] `src/components/admin/` → `src/admin/components/`
- [x] `src/lib/permissions.ts` → `src/admin/lib/permissions.ts`
- [x] `src/lib/permissions-constants.ts` → `src/admin/lib/permissions-constants.ts`
- [x] `src/lib/audit.ts` → `src/admin/lib/audit.ts`
- [x] `src/lib/settings/` → `src/admin/lib/settings/`
- [x] `src/lib/api-keys/` → `src/admin/lib/api-keys/`
- [x] `src/lib/calendar/` → `src/admin/lib/calendar/`
- [x] `src/lib/google-calendar.ts` → `src/admin/lib/google-calendar.ts`
- [x] `src/lib/calendar-sync.ts` → `src/admin/lib/calendar-sync.ts`
- [x] `src/lib/ical.ts` → `src/admin/lib/ical.ts`
- [x] `src/lib/stripe.ts` → `src/admin/lib/stripe.ts`
- [x] `src/lib/validations/` → `src/admin/lib/validations/`
- [x] `src/lib/styles/` → `src/admin/lib/styles/`
- [x] `src/lib/errors/` → `src/admin/lib/errors/`
- [x] `src/actions/admin/` → `src/admin/actions/`
- [x] `src/hooks/` → `src/admin/hooks/`
- [x] `src/contexts/` → `src/admin/contexts/`
- [x] import パス更新

### Phase 4: public/ への移動 `cc:DONE`

公開ページ専用ファイルを public/ に移動。

- [x] `src/components/site/` → `src/public/components/`
- [x] `src/components/layouts/` → `src/public/components/layouts/`
- [x] `src/components/a11y/` → `src/public/components/a11y/`
- [x] `src/components/analytics/` → `src/public/components/analytics/`
- [x] `src/components/seo/` → `src/public/components/seo/`
- [x] `src/components/Turnstile.tsx` → `src/public/components/Turnstile.tsx`
- [x] `src/lib/blog-queries.ts` → `src/public/lib/blog-queries.ts`
- [x] `src/lib/page-metadata.ts` → `src/public/lib/page-metadata.ts`
- [x] `src/lib/layout-settings.ts` → `src/public/lib/layout-settings.ts`
- [x] `src/lib/announcement-bar-utils.ts` → `src/public/lib/announcement-bar-utils.ts`
- [x] `src/lib/reservation-utils.ts` → `src/public/lib/reservation-utils.ts`
- [x] `src/lib/seo/` → `src/public/lib/seo/`
- [x] `src/lib/a11y/` → `src/public/lib/a11y/`
- [x] `src/lib/nuqs/` → `src/public/lib/nuqs/`
- [x] `src/lib/analytics/` → `src/public/lib/analytics/`
- [x] `src/actions/public/` → `src/public/actions/`
- [x] `src/emails/` → `src/public/emails/`
- [x] import パス更新

### Phase 5: types/ 分離 `cc:DONE`

型定義を分離。

- [x] 共通型を `src/shared/types/` に移動（prisma.ts, better-auth.d.ts）
- [x] 管理専用型を `src/admin/types/` に作成（server-actions.ts, admin-layout.ts, api-keys.ts, editor-panel.ts, media-picker.ts）
- [x] import パス更新

### Phase 6: 旧ディレクトリ削除 `cc:DONE`

移動完了後、旧ディレクトリを削除。

- [x] `src/components/` 削除
- [x] `src/lib/` 削除
- [x] `src/types/` 削除
- [x] 最終検証（type-check/lint/build）- すべて成功

### Phase 7: ドキュメント更新 `cc:DONE`

- [x] 計画ファイル更新（本ファイル）
- [x] `docs/architecture/PROJECT_STRUCTURE.md` 更新
- [x] `docs/plans/README.md` 更新
- [x] `CLAUDE.md` 更新
- [x] `AGENTS.md` 更新

### Phase 8: admin/public 相互参照の完全解消 `cc:DONE`

admin → public、public → admin の参照を完全に解消し、共有コードはすべて shared/ 経由にする。

**shared/ への追加移動:**

- [x] `src/shared/types/server-actions.ts` 作成（ActionResult, ActionSuccess, ActionFailure）
- [x] `src/shared/types/layout.ts` 作成（LayoutConfig, LayoutWidth）
- [x] `src/shared/lib/calendar-sync.ts` 移動（カレンダー同期サービス）
- [x] `src/shared/lib/google-calendar.ts` 移動（Google Calendar API）
- [x] `src/shared/lib/nuqs/` 作成（URLパーサー）
- [x] `src/shared/lib/errors/` 移動（エラーハンドリング）
- [x] `src/shared/lib/styles/prose.ts` 移動（Prose CSS）
- [x] `src/shared/lib/styles/layout-mapper.ts` 移動（レイアウトマッパー）
- [x] `src/shared/lib/settings/` 移動（公開設定取得）
- [x] `src/shared/lib/validations/` 作成（共有バリデーション）
- [x] `src/shared/contexts/aria-live-context.tsx` 移動（ARIAコンテキスト）

**public/actions/ の作成:**

- [x] `src/public/actions/homepage.ts` 作成（ホームページセクション取得）
- [x] `src/public/actions/blog.ts` 作成（公開ブログ取得）
- [x] `src/public/actions/news.ts` 作成（公開ニュース取得）
- [x] `src/public/actions/settings.ts` 更新（公開設定取得）
- [x] `src/public/actions/reservation.ts` 更新（予約関連）

**import パス更新:**

- [x] public/components → `@/public/actions/*` 参照に変更
- [x] admin/components → `@/shared/*` 参照に変更（クロスリファレンス解消）
- [x] 旧ファイルは re-export で後方互換性維持

**検証:**

- [x] `grep 'from.*@/public/' src/admin/` → 0件
- [x] `grep 'from.*@/admin/' src/public/` → 0件
- [x] type-check 成功
- [x] lint 成功（0 errors, 0 warnings）
- [x] build 成功（84ページ生成）

### Phase 9: ユーティリティ関数分離 `cc:DONE`

admin専用関数とshared関数を適切に分離し、重複コードを統一。

**shared/lib/utils.ts に追加:**

- [x] `formatCurrency` - 通貨フォーマット（管理・公開両方で使用）
- [x] `formatPrice` - nullable対応の価格フォーマット（公開ページ用）
- [x] `formatDate` - 日付フォーマット（管理・公開両方で使用）

**admin/lib/utils.ts に分離:**

- [x] `formatChange` - 変化率フォーマット（ダッシュボード専用）
- [x] `getChangeColor` - 変化率の色クラス（ダッシュボード専用）
- [x] `formatBytes` - ファイルサイズフォーマット（メディア管理専用）

**重複コード削除:**

- [x] `src/app/(public)/spaces/page.tsx` のローカル `formatPrice` 関数削除
- [x] `src/app/(public)/spaces/[id]/_components/ReservationCTA.tsx` のローカル `formatPrice` 関数削除
- [x] `src/public/components/sections/SpaceListSection.tsx` のローカル `formatPrice` 関数削除

**クリーンアップ:**

- [x] `src/admin/lib/audit.ts` から "Note:" マイグレーションコメント削除

**検証:**

- [x] type-check 成功
- [x] lint 成功
- [x] build 成功

---

## 移行時の注意点

### 1. 段階的移行

一度に全ファイルを移動せず、Phase ごとに検証を行う。

### 2. import パス更新

各 Phase で移動したファイルの import を更新し、ビルドが通ることを確認。

### 3. 後方互換エイリアス

移行期間中は旧パス（`@/components/*`, `@/lib/*`）を残し、
完全移行後に削除。

---

## 完了条件

- [x] すべてのファイルが適切なディレクトリに配置されている
- [x] `@/admin/*`, `@/public/*`, `@/shared/*` が使用されている
- [x] type-check / lint / build がすべて成功
- [x] admin → public 参照が 0件
- [x] public → admin 参照が 0件
- [ ] 動作確認（管理画面、公開ページ両方）- 手動確認が必要
- [x] 計画ドキュメントが更新されている
- [x] `docs/architecture/PROJECT_STRUCTURE.md` 更新済み
- [x] `CLAUDE.md`, `AGENTS.md` 更新済み

---

## shared/ 最終構成

```
src/shared/
├── contexts/
│   ├── aria-live-context.tsx    # ARIAライブリージョン
│   └── index.ts
├── generated/prisma/            # Prisma自動生成
├── lib/
│   ├── errors/                  # エラーハンドリング
│   │   ├── index.ts
│   │   ├── logger.ts
│   │   ├── safe-fetch.ts
│   │   └── types.ts
│   ├── nuqs/                    # URLパーサー
│   │   ├── index.ts
│   │   └── parsers.ts
│   ├── settings/                # 公開設定
│   │   ├── index.ts
│   │   └── public.ts
│   ├── styles/                  # スタイル
│   │   ├── layout-mapper.ts
│   │   └── prose.ts
│   ├── validations/             # 共有バリデーション
│   │   ├── comment.ts
│   │   ├── enums.ts
│   │   ├── homepage-section.ts
│   │   ├── index.ts
│   │   ├── page.ts
│   │   ├── search-params.ts
│   │   ├── sidebar.ts
│   │   └── terms.ts
│   ├── action-helpers.ts
│   ├── auth-client.ts
│   ├── auth.ts
│   ├── calendar-sync.ts         # カレンダー同期
│   ├── crypto.ts
│   ├── email-service.ts
│   ├── email.ts
│   ├── google-calendar.ts       # Google Calendar API
│   ├── json-validators.ts
│   ├── prisma.ts
│   ├── rate-limit.ts
│   ├── storage.ts
│   ├── supabase.ts
│   ├── turnstile.ts
│   └── utils.ts                  # cn, formatCurrency, formatPrice, formatDate
└── types/
    ├── better-auth.d.ts
    ├── layout.ts                # レイアウト型
    ├── prisma.ts
    └── server-actions.ts        # ActionResult型
```

---

## 見積もり

| Phase | 工数（時間） | 備考 |
|-------|-------------|------|
| Phase 1 | 0.5 | ディレクトリ作成のみ |
| Phase 2 | 2 | 共有ファイル移動 |
| Phase 3 | 4 | 管理ファイル移動（最大） |
| Phase 4 | 3 | 公開ファイル移動 |
| Phase 5 | 1 | 型定義分離 |
| Phase 6 | 1 | クリーンアップ |
| Phase 7 | 1 | ドキュメント |
| **合計** | **12.5** | 約2日 |

---

## リスクと対策

| リスク | 対策 |
|--------|------|
| import パス漏れ | 各 Phase で type-check 実行 |
| 循環依存 | shared/ への依存のみ許可 |
| 動作不良 | Phase ごとに動作確認 |
