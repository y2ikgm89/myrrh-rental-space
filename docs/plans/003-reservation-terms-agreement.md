# 003: 予約フォーム規約同意機能

## 概要

予約フォームに利用規約・プライバシーポリシーへの同意チェックボックスを追加し、同意日時をデータベースに記録する機能を実装。管理画面から詳細設定（オンオフ・文言・対象規約）が可能。

## 実装内容

### 機能

- 予約フォームに規約同意チェックボックスを追加
- 同意日時（`termsAgreedAt`）をDBに記録
- 管理画面から以下を設定可能:
  - 規約同意チェックの有効/無効
  - 同意文言のカスタマイズ
  - 利用規約への同意必須化
  - プライバシーポリシーへの同意必須化

### 変更ファイル

**新規作成:**
- `src/components/site/ui/Checkbox.tsx` - 公開サイト用チェックボックスコンポーネント
- `src/app/admin/settings/_components/sections/TermsAgreementSection.tsx` - 管理画面設定UI

**変更:**
- `prisma/schema.prisma` - Reservationに`termsAgreedAt`、Settingsに規約同意設定フィールド追加
- `src/components/site/ui/index.ts` - Checkboxエクスポート
- `src/app/admin/settings/_components/sections/index.ts` - TermsAgreementSectionエクスポート
- `src/app/admin/settings/_components/tabs/BookingTab.tsx` - 設定セクション追加
- `src/actions/admin/settings.ts` - 規約同意設定の取得・更新関数追加
- `src/lib/validations/reservation.ts` - 規約同意バリデーションスキーマ追加
- `src/actions/reservation.ts` - 規約同意対応
- `src/app/(public)/reservation/page.tsx` - termsSettings取得
- `src/app/(public)/reservation/_components/ReservationForm.tsx` - チェックボックスUI追加

## デプロイ時の注意

マイグレーションを実行する必要があります:

```bash
bunx prisma migrate dev --name add_terms_agreement
```

## 管理画面での設定

管理画面 > 設定 > 予約タブ > 規約同意設定

| 設定項目 | 説明 | デフォルト |
|---------|------|-----------|
| 予約時に規約同意を求める | チェックボックスの表示/非表示 | ON |
| 同意文言（カスタム） | 任意のテキスト（空欄でデフォルト） | - |
| 利用規約への同意を必須にする | 利用規約リンクを表示 | ON |
| プライバシーポリシーへの同意を必須にする | プライバシーポリシーリンクを表示 | ON |

## ステータス

- [x] 実装完了
- [ ] マイグレーション実行待ち
- [ ] 本番デプロイ
