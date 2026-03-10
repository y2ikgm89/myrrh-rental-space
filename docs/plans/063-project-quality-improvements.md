# 063: プロジェクト品質改善

## 概要

プロジェクト精査で特定された改善点をクリーンに実装。後方互換性不要、リリース前のため根本対応を実施。

## ステータス

**完了** - 2026-01-22

## 実装内容

### 1. 環境変数の本番必須化

**ファイル**: `src/shared/lib/env/server.ts`

- `isProduction()` 関数を追加（プラットフォーム検出対応）
  - VERCEL_ENV / RAILWAY_ENVIRONMENT による本番検出
  - SKIP_ENV_VALIDATION によるビルド時スキップ
- `validateProductionEnv()` によるランタイム検証
  - ENCRYPTION_KEY: 本番必須
  - CRON_SECRET: 本番必須
  - ADMIN_LOGIN_TOKEN: 本番必須
- `build` スクリプトを `SKIP_ENV_VALIDATION=true next build` に変更

### 2. 依存関係修正（@/public → @/shared）

**問題**: `TimeSlotSelector` が `@/public/actions/reservation` をインポート

**解決**: 共有予約ロジックを `@/shared/lib/reservation/` に抽出

新規作成ファイル:

- `src/shared/lib/reservation/constants.ts` - 営業時間定数
- `src/shared/lib/reservation/types.ts` - 型定義（TimeSlot, CalendarDate等）
- `src/shared/lib/reservation/overlap-check.ts` - 予約重複チェック
- `src/shared/lib/reservation/time-slots.ts` - 時間枠生成ロジック
- `src/shared/lib/reservation/index.ts` - バレルエクスポート

更新ファイル:

- `src/app/(admin)/.../TimeSlotSelector.tsx` - インポート先変更
- `src/app/(admin)/.../actions/reservation.ts` - インポート先変更
- `src/app/(public)/.../actions/reservation.ts` - 共有ロジック使用
- `src/app/(public)/.../lib/validations/reservation.ts` - 型再エクスポート

### 3. モック基盤構築

**新規作成**:

- `__tests__/mocks/resend.ts` - メール送信モック
- `__tests__/mocks/google-calendar.ts` - Google Calendar APIモック
- `__tests__/mocks/stripe.ts` - Stripe APIモック

**更新**:

- `__tests__/mocks/index.ts` - バレルエクスポート追加

### 4. 品質レビュー対応

- `time-slots.ts`: 現在時刻判定を `<=` から `<` に修正
- `time-slots.ts`: 日付フォーマットをローカル時間ベースに修正
- `server.ts`: 未使用の `requireInProduction` 関数を削除

## 技術的決定

1. **本番環境検出**: NODE_ENVだけでなく、VERCEL_ENV/RAILWAY_ENVIRONMENTを併用
2. **ビルド時検証スキップ**: `next build`時はNODE_ENV=productionになるため、SKIP_ENV_VALIDATIONで制御
3. **共有ロジック配置**: `@/shared/lib/reservation/` に予約関連ロジックを集約
4. **モック設計**: Bunのmock関数を活用、データストレージ配列で状態管理

## 残課題（将来対応）

- N+1クエリ問題（`getAvailableDatesInMonth`）- 現時点では許容可能な性能
- 予約作成時のTOCTOU競合 - 高負荷時のみ発生
- タイムゾーン完全対応 - 現時点はサーバーローカル時間で運用

## 変更ファイル一覧

```
src/shared/lib/env/server.ts                           (modified)
src/shared/lib/reservation/constants.ts                (new)
src/shared/lib/reservation/types.ts                    (new)
src/shared/lib/reservation/overlap-check.ts            (new)
src/shared/lib/reservation/time-slots.ts               (new)
src/shared/lib/reservation/index.ts                    (new)
src/app/(admin)/.../TimeSlotSelector.tsx               (modified)
src/app/(admin)/.../actions/reservation.ts             (modified)
src/app/(public)/.../actions/reservation.ts            (modified)
src/app/(public)/.../lib/validations/reservation.ts    (modified)
src/app/(public)/.../lib/reservation-utils.ts          (deprecated)
__tests__/mocks/resend.ts                              (new)
__tests__/mocks/google-calendar.ts                     (new)
__tests__/mocks/stripe.ts                              (new)
__tests__/mocks/index.ts                               (modified)
package.json                                           (modified)
```
