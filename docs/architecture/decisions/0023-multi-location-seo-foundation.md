# 0023. Multi-location LocalBusiness JSON-LD を per-location 出力に移行

- Status: Accepted
- Date: 2026-04-27

## Context

旧来の実装では、`(public)/layout.tsx` の `@graph` パターン内に単一の `LocalBusiness` エントリを
Settings テーブル（サイト全体の代表情報）から構築していた。
これは拠点が 1 件という前提に立脚しており、複数の物理拠点（Location モデル）を持つ
multi-location 事業者に対応できなかった。

Google Search Central の [Local Business structured data ガイド](https://developers.google.com/search/docs/appearance/structured-data/local-business)
は「物理的に異なる住所を持つ拠点はそれぞれ独立した LocalBusiness エントリを持つこと」を推奨しており、
`branchOf` で親組織を参照するパターンを提示している。

また Settings テーブルへの MEO フィールド集約は「拠点を増やすと全拠点が同じ住所/電話を共有する」という
データ整合性バグを内包していた（CLAUDE.md §multi-tenant 判断基準: 「拠点ごとに違いうる属性は Location に」）。

## Decision

以下の 7 項目を決定する。

1. **MEO フィールドは Location モデルに移管する**
   `latitude` / `longitude` / `googleBusinessPlaceId` / `googleReviewUrl` /
   `priceRange` / `paymentAccepted` / `phoneNumber` / `email` /
   `postalCode` / `prefecture` / `city` / `streetAddress` / `buildingName` /
   `slug` を Location に追加し、Settings から削除する。

2. **per-location LocalBusiness JSON-LD ビルダーを新設する**
   `@/public/lib/seo/location-json-ld.ts` に pure function `buildLocationLocalBusinessJsonLdData()` を配置。
   `getAllPublishedLocationsJsonLdData()` / `getLocationJsonLdDataBySlug()` でキャッシュ境界を担保する。

3. **`(public)/layout.tsx` の `@graph` は `Organization + WebSite` に変更する**
   サイト全体の代表情報は Organization 型で出力し、LocalBusiness は per-location ページに委譲する。
   これにより layout.tsx の `@graph` パターンは `LocalBusiness` を含まなくなる。

4. **`/access` 一覧ページは複数拠点の LocalBusiness を配列出力する**
   `getAllPublishedLocationsJsonLdData()` の結果を `@graph` に連結して出力する。

5. **`/access/[locationSlug]` 拠点詳細ページは単一の LocalBusiness を出力する**
   `getLocationJsonLdDataBySlug(slug)` を呼び、`includeBranchOf` フラグで
   複数拠点時のみ `branchOf` 参照を付与する。

6. **単一拠点モードでは Settings フォールバックを維持する（旧互換）**
   `Location` テーブルが 0 件の場合は Settings を合成 Location として
   `buildFallbackLocation()` を呼び旧来の表示を継続する。

7. **管理画面 Location 編集フォームに MEO タブを追加する**
   座標 / Google Business Place ID / priceRange 等を入力できる UI と
   MEO スコア表示（入力補完率 / 推定リーチ影響度）を追加する。

## Consequences

### 利点

- 複数拠点を持つ事業者が各拠点の住所・電話・座標・営業時間を個別管理できる
- Google の per-location LocalBusiness 推奨パターンに準拠し、ローカル検索での rich result 取得率向上が期待できる
- Settings テーブルの肥大化が抑制され、拠点ごとのデータ整合性が保証される
- `buildLocationLocalBusinessJsonLdData()` は pure function のため単体テストが容易

### 欠点

- Settings テーブルの MEO フィールドからの移行マイグレーションが必要（本 ADR 実装時に実施済み）
- 既存の `getLocalBusinessJsonLdData()` 呼び出し箇所はすべて置き換えが必要

## Alternatives Considered

### A. Settings テーブルに複数拠点の JSON 配列を追加する

`Settings.locations: Json` に拠点情報を JSON 配列として持つ案。
Settings は singleton であり、Location モデルが既に存在するため重複定義になる。
Prisma レベルの制約（FK / unique / index）が効かずデータ整合性が弱い。**却下**。

### B. location.json-ld.ts を `'use server'` で export する

Reader 関数を Server Action として公開する案。
プロジェクトルールで「読み取り関数は Route Handler が canonical（ADR 0019 + export-contract.md）」
と定義されており、server-only + 'use cache' で実装する方が適切。**却下**。

### C. layout.tsx の `@graph` に LocalBusiness を残しつつ per-location も出力する

同一ページに LocalBusiness が 2 重出力されると Google が混乱する可能性がある。
Google Search Central は「同一 URL には 1 つの LocalBusiness」を推奨。**却下**。

## Operational Notes

### Production Migration

1. **Phase 1 (本 ADR)**: Location モデルに MEO フィールドを追加（migration 済み）。
2. **Phase 2**: 既存データ移行（`Settings.latitude` → 代表 Location レコードへ手動 or スクリプト転記）。
3. **Phase 3**: Settings の旧 MEO フィールドを廃止（次メジャー migration で DROP COLUMN）。

単一拠点モードでは `buildFallbackLocation()` が Settings をフォールバックとして使用するため、
Phase 3 完了前でも公開ページは正常動作する。

## References

- [Google Search Central — Local Business structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [schema.org — LocalBusiness](https://schema.org/LocalBusiness)
- [schema.org — branchOf](https://schema.org/branchOf)
- Spec: `docs/superpowers/specs/` (MEO multi-location foundation)
- Plan: `docs/superpowers/plans/2026-04-27-multi-location-seo-foundation.md`
