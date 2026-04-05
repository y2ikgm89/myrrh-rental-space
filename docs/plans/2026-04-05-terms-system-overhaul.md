# 利用規約システム全面見直し

> Status: **Design** | Date: 2026-04-05

## 背景

利用規約管理機能は DB モデル（Terms / TermsVersion / TermsAgreement）と管理画面 CRUD が実装済みだが、公開側との接続がほぼ欠落している。10件の重大なギャップが調査で判明した。リリース前のため後方互換性を考慮せずクリーンに再構築する。

## ゴール

1. **監査証跡の完全化**: 予約時に「誰が・いつ・どの規約のどのバージョンに同意したか」を TermsAgreement に記録
2. **設定駆動の同意フロー**: 管理者が Terms レコードで予約時必須を制御。Settings の規約関連フラグは廃止
3. **公開ページの導線確保**: フッターから個別規約ページへ直リンク。`/terms` はリダイレクト
4. **スペース別規約**: Space.termsId の RENTAL_TERMS がスペース詳細・予約フォームに表示される
5. **全テンプレート seed**: 6種のテンプレートを seed で生成

## 非ゴール

- 規約のバージョン差分表示（管理画面での比較 UI）
- 規約への電子署名
- Cookie 同意バナー連携

---

## 1. データモデル変更

### 1.1 TermsType enum に RENTAL_TERMS 追加

```prisma
enum TermsType {
  TERMS_OF_USE       // サイト利用規約
  PRIVACY_POLICY     // プライバシーポリシー
  CANCELLATION       // キャンセルポリシー
  PAYMENT            // 支払い規約
  RENTAL_TERMS       // 施設利用規約（スペース別）
  CUSTOM             // カスタム
}
```

**用途の明確化**:

| タイプ         | スコープ     | 表示箇所                                          |
| -------------- | ------------ | ------------------------------------------------- |
| TERMS_OF_USE   | サイト全体   | フッターリンク                                    |
| PRIVACY_POLICY | サイト全体   | フッターリンク + 予約/問い合わせフォーム          |
| CANCELLATION   | 予約サービス | 予約フォーム + マイページ                         |
| PAYMENT        | 決済         | 予約フォーム（Stripe 有効時）                     |
| RENTAL_TERMS   | スペース別   | スペース詳細 + 予約フォーム（Space.termsId 経由） |
| CUSTOM         | 自由         | 管理者が配置を決定                                |

### 1.2 Terms モデルに requiredAtReservation 追加

```prisma
model Terms {
  // ...existing fields...
  requiredAtReservation  Boolean @default(false)  // 予約フォームで同意必須
  showInFooter           Boolean @default(false)  // フッターにリンク表示
}
```

- `requiredAtReservation: true` の Terms は予約フォームに同意チェックとして自動表示される
- `showInFooter: true` の Terms はフッターにリンクが自動表示される
- RENTAL_TERMS は Space.termsId 経由で表示されるため `requiredAtReservation` とは独立

### 1.3 Settings から規約関連フィールドを削除

以下の5フィールドを削除:

```diff
- cancellationTermsId      String? @db.Uuid
- cancellationTerms        Terms?  @relation("CancellationPolicy", ...)
- termsAgreementEnabled    Boolean @default(true)
- termsAgreementText       String?
- requireTermsAgreement    Boolean @default(true)
- requirePrivacyAgreement  Boolean @default(true)
```

**移行先**: Terms テーブルの `requiredAtReservation` フラグに集約。同意文言は規約タイトルから自動生成（「{title}に同意します」）。

### 1.4 Space.termsId のフィルタ

管理画面のスペース編集でドロップダウンに表示する規約を `type: RENTAL_TERMS` のみにフィルタする。現状は全タイプが表示される。

---

## 2. 予約フォームの同意フロー

### 2.1 同意対象の決定ロジック

予約フォーム表示時に以下を取得:

```
1. Terms WHERE requiredAtReservation = true AND isActive = true
   → グローバル必須規約（プライバシーポリシー、キャンセルポリシー等）
2. Space.termsId → スペース別 RENTAL_TERMS
   → null の場合はスキップ
3. 上記をマージして重複排除（id ベース）
```

### 2.2 公開クエリ

`src/shared/domain/terms/public-queries.ts` に新規作成:

```typescript
type ReservationTermsSummary = {
  id: string;
  title: string;
  slug: string;
  type: string;
  currentVersionId: string; // 同意記録に必須
};

async function getReservationRequiredTerms(
  spaceId: string,
): Promise<Serialized<ReservationTermsSummary[]>>;
```

チェックボックス表示（title, slug）+ 同意記録（id, currentVersionId）に必要な最小情報のみ返す。

### 2.3 フォーム UI

`customer-step.tsx` を改修:

- ハードコードのチェック1個 → 動的に N 個のチェックボックスを生成
- 各チェックボックスのラベル: `{terms.title}に同意します`（タイトルは `/terms/{slug}` へのリンク）
- Zod スキーマ: `agreedTermsIds: z.array(z.string().uuid())` → 同意した Terms ID の配列
- バリデーション: サーバー側で「必須規約の ID が全て含まれているか」を検証。クライアント側では全チェック ON を必須化

### 2.4 TermsAgreement 保存

`createPublicReservationCommand` のトランザクション内で:

```typescript
// 予約作成と同時に TermsAgreement レコードを一括作成
await tx.termsAgreement.createMany({
  data: agreedTermsIds.map((termsId) => ({
    termsId,
    versionId: versionMap[termsId], // 同意時点の currentVersion
    reservationId: reservation.id,
    customerId: customer.id,
    userId: customer.userId ?? null,
    ipAddress: clientIp,
    userAgent: userAgent,
    agreedAt: new Date(),
  })),
});
```

---

## 3. 公開ページ変更

### 3.1 `/terms` ページ → リダイレクト

`/terms/page.tsx` を削除し、個別規約ページへリダイレクト:

- `TERMS_OF_USE` が存在する場合: `/terms/terms-of-use` へ 301 リダイレクト
- 存在しない場合: `/terms/[最初のアクティブ規約slug]` へリダイレクト
- アクティブ規約が0件: 404

`DEFAULT_PAGE_SECTIONS` から `terms` エントリも削除。

### 3.2 `/terms/[slug]` 改善

現状の実装はほぼ完成している。変更点:

- パンくずの「利用規約」リンクを削除（ハブページがなくなるため）→ `ホーム > {terms.title}` の2階層
- `SiteCTA` はそのまま維持

### 3.3 フッター

`site-footer.tsx` に規約リンクセクションを追加:

```typescript
// Terms WHERE showInFooter = true AND isActive = true を取得
const footerTerms = await getFooterTerms();
```

フッターの既存ナビゲーションリンクの下に:

```
利用規約 | プライバシーポリシー | キャンセルポリシー
```

### 3.4 スペース詳細ページ

`spaces/[slug]` に施設利用規約リンクを追加:

- Space に RENTAL_TERMS が紐づいている場合のみ表示
- スペース情報セクション内に「施設利用規約」リンク（`/terms/{slug}` へ）
- 予約ウィジェットにもキャンセルポリシーへのリンクを小さく表示

---

## 4. 管理画面変更

### 4.1 Terms 管理画面の拡張

`/admin/terms` 一覧テーブルに列を追加:

- `requiredAtReservation` — Badge 表示（「予約時必須」）
- `showInFooter` — Badge 表示（「フッター表示」）

`/admin/terms/[id]/edit` にフィールド追加:

- `requiredAtReservation` チェックボックス
- `showInFooter` チェックボックス

### 4.2 Terms 新規作成フロー

`/admin/terms/new` で TermsType 選択時:

- `RENTAL_TERMS` 選択時: 「このタイプの規約はスペース編集から紐づけてください」ヒント表示
- `CANCELLATION` / `PRIVACY_POLICY` 選択時: 「予約時必須」をデフォルト ON で提案

### 4.3 設定画面の簡素化

- `TermsAgreementSection` を削除
- `ReservationSection` から `cancellationTermsId` セレクトを削除
- 代わりに両セクションの CardDescription に `/admin/terms` へのリンクを追加:
  「規約の必須設定は [利用規約管理](/admin/terms) で行えます」

### 4.4 スペース編集フォーム

`details-tab-panel.tsx` の「適用する利用規約」ドロップダウン:

- `type: RENTAL_TERMS` のみにフィルタ（現状は全タイプ）
- ラベルを「施設利用規約」に変更

### 4.5 予約詳細ページ

`/admin/reservations/[id]` に同意記録セクションを追加:

- TermsAgreement レコードを表示
- 規約タイトル、バージョン番号、同意日時、IP アドレス

---

## 5. Seed 変更

### 5.1 全6テンプレートを生成

既存の `terms-templates.ts` に `RENTAL_TERMS` テンプレートを追加し、seed で全タイプを生成:

| タイプ         | slug                | requiredAtReservation | showInFooter |
| -------------- | ------------------- | --------------------- | ------------ |
| TERMS_OF_USE   | terms-of-use        | false                 | true         |
| PRIVACY_POLICY | privacy-policy      | true                  | true         |
| CANCELLATION   | cancellation-policy | true                  | false        |
| PAYMENT        | payment-terms       | false                 | false        |
| RENTAL_TERMS   | rental-terms        | false                 | false        |
| CUSTOM         | —                   | —                     | —            |

seed は各 Terms に version 1 (PUBLISHED, isCurrentVersion: true) も作成する。

### 5.2 既存 seed のクリーンアップ

- 旧 `cancellationTermsId` 参照を削除
- 旧 `termsAgreementEnabled` 等の設定値を削除
- Space レコードに `termsId` で RENTAL_TERMS を紐づけ

---

## 6. キャッシュ戦略

| クエリ                                 | cacheTag                                                 | cacheLife         |
| -------------------------------------- | -------------------------------------------------------- | ----------------- |
| `getReservationRequiredTerms(spaceId)` | `CACHE_TAGS.TERMS`, `getCacheTag.spaces.detail(spaceId)` | `DYNAMIC_DATA`    |
| `getFooterTerms()`                     | `CACHE_TAGS.TERMS`                                       | `STATIC_SETTINGS` |
| `getPublicTermsBySlug(slug)`           | 既存のまま                                               | 既存のまま        |

Terms の CRUD 操作時に `updateTag(CACHE_TAGS.TERMS)` は既存実装で対応済み。

---

## 7. 削除対象一覧

| ファイル/フィールド                                                         | 理由                               |
| --------------------------------------------------------------------------- | ---------------------------------- |
| `Settings.cancellationTermsId`                                              | Terms.requiredAtReservation に移行 |
| `Settings.cancellationTerms` リレーション                                   | 同上                               |
| `Settings.termsAgreementEnabled`                                            | Terms.requiredAtReservation に移行 |
| `Settings.termsAgreementText`                                               | 規約タイトルから自動生成           |
| `Settings.requireTermsAgreement`                                            | 同上                               |
| `Settings.requirePrivacyAgreement`                                          | 同上                               |
| `TermsAgreementSection.tsx`                                                 | 設定セクション丸ごと不要           |
| `ReservationSection` の cancellationTermsId 部分                            | 同上                               |
| `settings/schemas/form-schemas-booking-tax-terms.ts` の termsAgreement 部分 | 同上                               |
| `settings/other.ts` の `updateTermsAgreementSettings`                       | 同上                               |
| `DEFAULT_PAGE_SECTIONS["terms"]`                                            | `/terms` ページ廃止                |
| `/terms/page.tsx`（セクションベース版）                                     | リダイレクトに置換                 |

---

## 8. テスト計画

### 8.1 ユニットテスト

- `getReservationRequiredTerms`: グローバル必須 + スペース別のマージロジック
- TermsAgreement 作成: 正しいバージョン ID が記録されること
- `requiredAtReservation` フラグの変更が予約フォームに反映されること

### 8.2 統合テスト

- `submitReservation` で TermsAgreement レコードが正しく作成されること
- Terms CRUD の既存テストが `requiredAtReservation` / `showInFooter` を含むこと
- Settings から規約フィールドが削除されてもビルドが通ること

### 8.3 E2E テスト

- 予約フォームに動的チェックボックスが表示されること
- 全チェック未入力で送信するとバリデーションエラー
- フッターに規約リンクが表示されること

---

## 実装順序（依存関係）

1. **Prisma スキーマ変更 + マイグレーション** — 全ての基盤
2. **Settings フィールド削除 + 管理画面クリーンアップ** — 旧 UI を除去
3. **Terms 管理画面拡張** — requiredAtReservation / showInFooter の UI
4. **Seed 更新** — 全テンプレート + デフォルト設定
5. **公開クエリ追加** — `getReservationRequiredTerms`, `getFooterTerms`
6. **予約フォーム改修** — 動的チェックボックス + TermsAgreement 保存
7. **フッター改修** — 規約リンク表示
8. **`/terms` リダイレクト + パンくず修正**
9. **スペース詳細ページ** — RENTAL_TERMS リンク表示
10. **予約詳細（管理画面）** — 同意記録表示
11. **テスト追加**
12. **検証** — validate + build
