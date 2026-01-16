# 032: Prisma Enum型アサーション全削除 + 型ガード集約

**完了日**: 2026-01-16

## 概要

コードベース全体で使用されていた `as ReservationStatus` 等の型アサーションを排除し、中央集権的な型ガードモジュールを作成。

## 問題

- コードベース全体で `as ReservationStatus` 等の型アサーションが散在
- 実行時検証なしの危険な型変換
- Prisma 生成 enum 型と Zod 推論型の混在

## 解決策

- 中央集権型ガードモジュール（`src/lib/validations/enums.ts`）作成
- Prisma の enum 型を re-export、型ガード関数を提供
- URL パラメータ用フィルターパーサー追加
- CalendarView 型ガード追加
- Prisma の Json 型フィールドに実行時バリデーション追加

## 変更ファイル

- `src/lib/validations/enums.ts` - 新規: 中央集権型ガードモジュール
- `src/lib/calendar/calendar-types.ts` - isValidCalendarView, getValidCalendarView 追加
- `src/lib/validations/media.ts` - parseMediaTypeFilter, parseMediaUsageFilter 追加
- `src/actions/admin/customer.ts` - CustomerWithReservations 型修正
- `src/actions/admin/homepage-settings.ts` - parseSectionConfig 追加
- `src/components/site/sections/SectionRenderer.tsx` - getSafeConfig 使用
- 各種ページ・コンポーネント - 型ガード使用に移行

## マイグレーション

不要
