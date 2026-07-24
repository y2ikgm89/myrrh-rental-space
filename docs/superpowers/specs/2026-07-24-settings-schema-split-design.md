# Settings スキーマ分割設計（clean-break）

- 起票: 2026-07-24
- 方針: Prisma / 本リポジトリ推奨に沿い、concern ごとの独立 singleton テーブルへ分割する
- 破壊的変更: 許可済み（計画ダウンタイム付きデプロイを許容）
- 後方互換: なし（旧列 fallback / re-export / dual-read なし）

## 1. 背景

`Settings`（`@@map("settings")`, `id = "singleton"`）は約 160+ スカラーを持つ god-model。
一方でドメイン読み取りは既に `src/shared/domain/settings/queries/*`、admin UI は
`/admin/settings/{site,appearance,business,billing,...}`、キャッシュは concern 別
`CACHE_TAGS` に分割済みで、**DB 境界だけが遅れている**。

先例:

- コンテンツ: `AnnouncementBar` / `NavigationItem` / `SocialLink`（Settings 外）
- singleton: `ReceiptSequence`（`id = "singleton"`）
- 列 clean-break: `stripeEnabled` → `featureModules.payment` + DROP

Prisma 公式はドメインに沿ったモデル分割と relation の明示を推奨する。巨大フラット
モデルや「全部 JSON 1 列」は型安全・暗号化列・select 単位キャッシュと相性が悪い。

## 2. 目標 / 非目標

### 目標

1. concern ごとに独立した singleton テーブル（`id @default("singleton")`）
2. hub FK は置かない（更新単位 = admin 画面 / query モジュール）
3. 段階 PR。各 PR は **CREATE + COPY + コード切替 + DROP 旧列** の clean-break
4. 各 PR は計画ダウンタイム（breaking migration 自動モード）を前提にする
5. seed / domain / admin actions / 契約テストを同一 PR で整合

### 非目標

- expand/contract の二重 write / 旧列 fallback
- Settings 全列を 1 PR で一括移動（レビュー不能）
- JSON blob への寄せ集め
- リモート lock/unlock や SwitchBot 通知など別 topic の変更

## 3. アプローチ選定

| 案                    | 内容                                 | 判定                                 |
| --------------------- | ------------------------------------ | ------------------------------------ |
| **A. 独立 singleton** | concern ごと `id=singleton` テーブル | **採用**                             |
| B. hub + 1:1 衛星     | `settings` に FK                     | ensure は楽だが hub 残存。採用しない |
| C. グループ JSON      | 列削減のみ                           | 型・暗号・select が弱い。不採用      |

マイグレーション戦略: **段階 PR + 都度計画ダウンタイム**（公式の
「ダウンタイム許容なら big-bang DROP 可」を **フェーズ単位** で適用）。
無停止 expand/contract は後方互換期間が必要なため本方針と矛盾する。

## 4. テーブル地図（最終形）

命名: Prisma モデル `SettingsXxxx` / `@@map("settings_xxxx")`（複数形は既存
`receipt_sequences` に合わせ、単一 concern は意味が通る複数形 or 名詞句）。

| Phase | 新テーブル (`@@map`)                                                                                   | 移すフィールド群                                                                        |
| ----: | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
|     1 | `settings_announcement_carousels` / `settings_systems`                                                 | announcementBar* / maintenance* + cookieConsent*                                        |
|     2 | `settings_seos` / `settings_analytics` / `settings_layouts`（footer/header 含む）/ `settings_sidebars` | seo / analytics / layout+footer+header / sidebar                                        |
|     3 | `settings_commerces` / `settings_organizations` / `settings_notifications` / `settings_reservations`   | commerce / org+email / notifications / reservation defaults                             |
|     4 | integration 別                                                                                         | stripe / resend / turnstile / maps / customApiKeys / gcal / gbp / instagram / switchbot |
|     5 | `settings_features` / `settings_data_retentions`                                                       | featureModules / dataRetention。最後に空 `settings` DROP                                |

Phase 1 のフィールド（プレフィックス除去 = clean 名）:

### `SettingsAnnouncementCarousel` → `settings_announcement_carousels`

| 新列                | 旧 `settings` 列                   |
| ------------------- | ---------------------------------- |
| `animation`         | `announcementBarAnimation`         |
| `duration`          | `announcementBarDuration`          |
| `autoPlay`          | `announcementBarAutoPlay`          |
| `pauseOnHover`      | `announcementBarPauseOnHover`      |
| `showArrows`        | `announcementBarShowArrows`        |
| `showIndicator`     | `announcementBarShowIndicator`     |
| `designStyle`       | `announcementBarDesignStyle`       |
| `bgColor`           | `announcementBarBgColor`           |
| `textColor`         | `announcementBarTextColor`         |
| `stripeColor`       | `announcementBarStripeColor`       |
| `stripeAnimation`   | `announcementBarStripeAnimation`   |
| `gradientAnimation` | `announcementBarGradientAnimation` |
| `glassAnimation`    | `announcementBarGlassAnimation`    |
| `sticky`            | `announcementBarSticky`            |

### `SettingsSystem` → `settings_systems`

| 新列                      | 旧列 |
| ------------------------- | ---- |
| `maintenanceMode`         | 同名 |
| `maintenanceMessage`      | 同名 |
| `cookieConsentEnabled`    | 同名 |
| `cookieConsentMessage`    | 同名 |
| `cookieConsentAcceptText` | 同名 |
| `cookieConsentRejectText` | 同名 |
| `cookieConsentPolicyUrl`  | 同名 |

どちらも `id String @id @default("singleton")` + `createdAt` / `updatedAt`。

## 5. ドメイン / API 契約（Phase 1）

- `ensureSettingsAnnouncementCarousel()` / `ensureSettingsSystem()`:
  `upsert({ where: { id: "singleton" }, create: { id: "singleton" } })`
- `announcement-bar.ts` の carousel 設定 R/W は新モデルのみ
- `commands.ts` の maintenance / cookie 更新は `SettingsSystem` のみ
- `queries/site.ts` の cookie / maintenance 読みは `SettingsSystem`
- `admin-queries.ts` / `types.ts` の集約 DTO は **新モデルから assemble**
  （旧 `settings.announcementBar*` 参照ゼロ）
- public `maintenance-gate` / cookie / announcement wrapper は domain query 経由のまま
  （内部実装だけ切替）

## 6. Migration SQL 方針（Phase 1）

1. `CREATE TABLE` 新 2 テーブル（enum 型は既存 Postgres enum を再利用）
2. `INSERT ... SELECT` from `settings` where `id = 'singleton'`（列リネーム）
3. 行が無い場合に備え、空 DB では default 行を入れる（seed と二重でも idempotent）
4. `ALTER TABLE settings DROP COLUMN` 対象列（breaking → 計画ダウンタイム）
5. squawk: DROP は expected；必要なら ignore コメントをルールに従い付与

## 7. テスト / ゲート

- unit: announcement-bar / cookie / maintenance 関連
- architecture: `settings` への旧列名参照 0 件 grep（Phase 1 対象列）
- `bun run test:db:migrate` で空 DB 再生
- seed が新テーブルを埋める
- migration-reviewer 必達

## 8. デプロイ注意

- main merge = 本番デプロイ。Phase 1 migration は DROP を含むため
  **自動で計画ダウンタイムモード**になる想定
- PR 本文に breaking / downtime を明記
- Trivy SARIF の `continue-on-error` や terraform apply strict gate とは無関係

## 9. 承認 / 実装進捗

- アプローチ A + 段階ダウンタイム: 2026-07-24 ユーザー指示「公式推奨で作業を」で採用
- Phase 1〜5 実装済み。統合 PR: https://github.com/y2ikgm89/myrrh-rental-space/pull/1467
- Phase 5 完了時点で `Settings` / `settings` ハブは DROP 済み。
