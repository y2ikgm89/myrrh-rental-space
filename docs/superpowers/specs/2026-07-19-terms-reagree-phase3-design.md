# TermsAgreement 再同意フロー Phase 3 (差分 UI + admin 影響件数) 設計

- 日付: 2026-07-19
- ステータス: 実装着手前 (writing-plans 相当)
- 前提: [Phase 1 (#1230)](../specs/2026-07-18-terms-reagree-flow-design.md) merged、Phase 2 (#1238) CI 通過待ち
- 出典: Phase 1 設計 doc の Phase 分割節「Phase 3 (Optional: 将来)」

## 背景

Phase 1 で MypageAuthGate + `/mypage/terms/reagree` UI、Phase 2 で Server Action 側 curl-bypass gate まで到達済み。しかし現状:

1. **顧客の情報弱者性**: reagree page で表示されるのは「現行の全文」のみ。顧客は「どこが変わったか」を確認できず、実質的には「盲判」で同意することになる。改正民法 (定型約款変更) の観点で「顧客に不利益な変更か」を判断する材料が示されていない
2. **admin の盲目性**: TermsDocument 編集 UI が「保存すると N 名の customer が再同意対象になる」というインパクト情報を表示しない。誤字修正 1 文字でも全 hash が変わり N 万人の再同意を強制する可能性があるが、admin はそれに気づけない

## 調査で確定した事実 (前提)

- **`TermsAgreement.contentSnapshot`** は同意時 HTML 全文 (`prisma/schema.prisma:1770`)。前回同意した内容は必ず取得可能
- **`TermsAgreement.contentHash`** は sha256(contentSnapshot)。差分判定は既に Phase 1 で確立 (`getReagreeRequiredTermsForCustomer`)
- **`SanitizedHtml` component** は DOMPurify + heading anchor 対応の SSoT (`src/shared/components/SanitizedHtml.tsx`)。前回スナップショットも同 component で安全に描画できる
- **admin `TermsDocument` 編集画面**: `src/app/(admin)/admin/(dashboard)/terms/` 配下 (要確認)
- **customer 総数**: 数千〜数万規模を想定。全 count を毎回計算するのは `getReagreeRequiredTermsForCustomer` の per-customer loop では非現実的 → 集約 query が必要

## 外部検証

- **改正民法 第 548 条の 4 (定型約款変更判例)**: 「相手方に不利益な変更」の判定は変更内容の明示が前提。全文再表示だけでは判例が求める「合理性審査」の材料として不十分
- **GDPR Art. 22 の透明性原則** (電気通信事業法・特商法にも援用可能): データ主体が同意内容の変更を「情報に基づいて判断」できるべき
- **業界慣例** (Google / GitHub / Notion 等): 規約改定通知は「主要変更点の要約 + 全文」の 2 段構成。summary 表示は義務ではないが、diff / changelog の open 表示は法務リスクの低減材料
- **admin 側の類似 UI 事例** (Prismic / Contentful / Payload CMS): destructive migration の save button に「影響レコード数」を出す inline warning は標準実装

## ゴール

1. reagree page の各 term に **「以前同意した版」を折り畳みで併記表示**する。顧客が現行との比較を能動的に行えるようにする
2. TermsDocument admin 編集画面の save button 隣に **「保存すると N 名の顧客に再同意を求めます」の inline warning** を表示する。誤字修正 1 文字で全員再同意を強要するリスクを admin に可視化する
3. どちらも append-only 契約を破らない (read-only query の追加のみ)
4. Phase 1 / 2 の gate 動作を破らない

## 非ゴール (スコープ外)

- **視覚 diff (行別ハイライト / word-level diff)**: 差分ライブラリ (`diff` / `jsdiff` / `htmldiff-js`) を bundle に含めるコストと、そもそも HTML diff の semantic 判定困難 (tag 変更 vs 表示変更) の trade-off で MVP では非採用。前回スナップショット全文を折り畳みで併記する A1 案を採用 (下記アーキテクチャ節)
- **admin 編集フォームでの「保存前プレビュー影響件数」**: 「入力中の新 contentHtml」を hash 計算して影響件数を出す機能。form の onChange debounce + server round-trip が要る割に、admin 側の判断材料としては「現状 hash 未同意者数」で十分 (下記 B 案採用)
- **customer 別詳細の drilldown** (誰が未同意か): 個人情報の admin 側閲覧 SSoT は既存 customers 一覧に集約されており、reagree 目的で別画面を新設しない
- **「軽微変更」(誤字/表記統一) の再同意スキップ機構**: `TermsDocument.contentHash` 列を追加して stored generated column 化 + 「軽微更新モード」で hash 更新をスキップする案は Phase 4+ に先送り (schema 変更・migration 必須のため別 PR)

## アーキテクチャ設計

### 1. 差分 UI (reagree page) — 「前回スナップショット併記」方式

`getReagreeRequiredTermsForCustomer` の戻り値型を拡張する:

```ts
export interface RequiredTerm {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly contentHtml: string;
  // Phase 3: 直近 agreement の contentSnapshot (前回同意した版)。
  // 初回同意 pending (未同意) なら null。
  readonly previousSnapshot?: string | null;
}
```

query 側の変更 (`src/shared/domain/terms/queries.ts`):

- `latestAgreements` から取得する column に `contentSnapshot` を追加
- 戻り値に `previousSnapshot: agreedHashByTermsId.get(...) ? snapshotByTermsId.get(...) : null` を含める

reagree-form.tsx の変更:

- 現行 `contentHtml` は既存通り `<SanitizedHtml>` で表示
- `previousSnapshot` が非 null なら `<details>` (native disclosure) で「以前同意した内容を表示」を折り畳み展開できるようにする
- 折り畳みは default 閉、SSR-safe (script 不要)、a11y 標準

**採用理由 vs 代替案**:

| 案                                     | 概要                                        | Trade-off                                              | 判定    |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------ | ------- |
| **A1 (採用)** 前回スナップショット併記 | `<details>` で前回同意版を全文併記          | 実装最小、a11y OK、差分 lib 不要                       | ✅      |
| A2: 行単位 diff                        | `diff` library で行 diff, 追加/削除を色分け | +30KB gzip, HTML diff は semantic 誤判定を起こしやすい | ❌ 過剰 |
| A3: HTML DOM diff                      | `htmldiff-js` 等で DOM 単位 diff            | +100KB gzip, 保守困難、CSP style-src 対応必要          | ❌ 却下 |

**破壊的でないこと**: `previousSnapshot` は optional で null 許容。既存 test は「フィールド無しでも RequiredTerm 型に整合」する形で継続。

### 2. admin 影響件数 panel — 「現状 hash 未同意者数」方式

新規 query 追加 (`src/shared/domain/terms/admin-queries.ts` に追加):

```ts
/**
 * TermsDocument 編集の想定影響件数 (現状 hash 未同意者数)。
 *
 * 現状 contentHtml の sha256 hash に対して LOGIN_SIGNUP scope で
 * agreement を持たない active customer 数を返す。
 * 「保存すると N 名の顧客に再同意を求めます」の admin 警告用。
 */
export async function getReagreeAffectedCustomerCount(
  termsId: string,
): Promise<{ affected: number; totalActiveCustomers: number }> {
  // 実装:
  // 1. TermsDocument.contentHtml の hash 計算
  // 2. active customer 総数 count
  // 3. 「(customerId, scope=LOGIN_SIGNUP) で最新 hash 一致な agreement を持つ customer」の count
  // 4. affected = totalActive - agreedCount
}
```

admin form (`src/app/(admin)/admin/(dashboard)/terms/[id]/_components/*Form.tsx` 相当) に inline warning:

- 編集画面 SC で `getReagreeAffectedCustomerCount(termsId)` を呼び (server-side)
- form の save button 上に `<InlineWarning>` で「保存すると N 名の顧客に再同意を求めます (LOGIN_SIGNUP scope)」を表示
- LOGIN_SIGNUP scope が入っていない TermsDocument では表示しない (該当なし)

**採用理由 vs 代替案**:

| 案                                      | 概要                                                      | Trade-off                                         | 判定                                   |
| --------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| **B (採用)** 現状 hash 未同意者数を表示 | 保存前の入力は不問、現行 hash に対する未同意 count を表示 | 実装最小、正確な事後件数と一致                    | ✅                                     |
| B2: 入力値プレビュー影響件数            | onChange debounce → server 計算                           | UX ノイズ、admin 側で hash 変わったこと自体は自明 | ❌ 過剰                                |
| B3: 保存後 toast で件数通知             | admin 側完了 toast に「X 名再同意対象」表示               | 保存前判断材料にならない、警告として弱い          | ❌ 却下 (B と併用可能だが必須ではない) |

**Postgres 実装**: 単一 SQL で `LEFT JOIN LATERAL` で customer 別最新 agreement を JOIN → hash 一致 count を叩き出す。または `DISTINCT ON` 経由。ざっくり:

```sql
SELECT COUNT(*)
FROM customers c
WHERE c."isActive" = true
  AND NOT EXISTS (
    SELECT 1 FROM terms_agreements ta
    WHERE ta."customerId" = c.id
      AND ta."termsId" = $termsId
      AND ta.scope = 'LOGIN_SIGNUP'
      AND ta."contentHash" = $currentHash
  );
```

Prisma で表現するなら `count({ where: { isActive: true, NOT: { termsAgreements: { some: { ... } } } } })`。もしくは `$queryRaw` で raw SQL。既存 admin-queries の pattern を確認して合わせる。

### 3. 破壊的でないこと

- `RequiredTerm` に optional field 追加 → 既存 consumer は影響なし
- `getReagreeAffectedCustomerCount` は新規 export → 影響なし
- admin form に inline warning 追加 → 既存 form flow は無変更

## Phase 分割 (Phase 3 内)

Phase 3.A と 3.B は独立に PR 化可能:

- **Phase 3.A (PR1)**: reagree page 差分 UI (query 拡張 + reagree-form 更新 + unit test)
- **Phase 3.B (PR2)**: admin 影響件数 panel (query 追加 + admin form 更新 + unit test)

粒度 rule (1 PR = 1 logical change) に沿って、まず 3.A → 3.B の順で 2 PR で処理する。**本設計 doc は 3.A 実装の初手として扱う**。

## テスト方針

### Phase 3.A (reagree page 差分 UI)

Unit:

- `__tests__/unit/domain/terms/reagree-query.test.ts` に追加:
  - agreement 存在 → `previousSnapshot` に contentSnapshot が入る
  - agreement 無し (未同意) → `previousSnapshot: null`
  - `latestAgreements` で `contentSnapshot` を select する回帰テスト

手動:

- admin から regexp で contentHtml を更新 → 顧客で /mypage/terms/reagree 表示 → 「以前同意した内容」の details が展開できる

### Phase 3.B (admin 影響件数 panel)

Unit:

- `__tests__/unit/domain/terms/admin-queries.test.ts` (新規 or 既存):
  - agreement 無しの customer → affected に含まれる
  - hash 一致 agreement を持つ customer → affected から除外
  - hash 不一致 agreement を持つ customer → affected に含まれる (版違い)
  - deletedAt customer → 除外
  - isActive: false customer → 除外

## Migration

**不要**。schema は無変更。

- `RequiredTerm.previousSnapshot` は Prisma 由来の値をそのまま透過 (schema 列は既存)
- `getReagreeAffectedCustomerCount` は既存 3 テーブル (customers / terms_documents / terms_agreements) から集計するだけ

## 決定事項サマリ

- **差分 UI**: A1 「前回スナップショット併記」方式 (視覚 diff library は使わない)
- **admin 影響件数**: B 「現状 hash 未同意者数」方式 (保存前プレビューは非採用)
- **PR 分割**: 3.A (reagree page 拡張) → 3.B (admin panel) の 2 PR
- **migration**: 不要
- **契約整合**: append-only 維持、既存 API に破壊的変更なし
